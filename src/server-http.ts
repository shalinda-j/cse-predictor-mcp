#!/usr/bin/env node
/**
 * CSE Predictor MCP Server - HTTP Transport
 * For remote hosting (Vercel, AWS, Docker, etc.)
 */

import express from 'express';
import cors from 'cors';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { config } from './utils/config.js';
import { logger } from './utils/logger.js';
import { CSEDataFetcher } from './tools/data-fetcher.js';
import { TechnicalAnalyzer } from './tools/analysis.js';
import { StockPredictor } from './tools/predictor.js';
import { CSEDataManager } from './resources/cse-data.js';

const dataFetcher = new CSEDataFetcher(config);
const analyzer = new TechnicalAnalyzer();
const predictor = new StockPredictor(config.predictionThreshold);
const dataManager = new CSEDataManager(config.dataPath);

const mcpServer = new McpServer(
  { name: 'cse-predictor', version: '1.0.0' },
  { capabilities: { tools: {}, resources: {} } }
);

// Register all tools
mcpServer.tool('fetch_market_data', 'Fetch current market data', {
  type: z.enum(['all', 'asi', 'spx', 'turnover']).optional().default('all')
}, async ({ type }) => {
  const data = await dataFetcher.fetchMarketData(type ?? 'all');
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

mcpServer.tool('get_company_data', 'Get company data', {
  symbol: z.string().min(1),
  includeHistory: z.boolean().optional().default(false)
}, async ({ symbol, includeHistory }) => {
  const data = await dataFetcher.fetchCompanyData(symbol.toUpperCase(), includeHistory ?? false);
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
});

mcpServer.tool('analyze_stock', 'Analyze stock', {
  symbol: z.string().min(1),
  indicators: z.array(z.enum(['rsi', 'macd', 'sma', 'ema', 'bb', 'volume', 'trend', 'all'])).optional().default(['all'])
}, async ({ symbol, indicators }) => {
  const history = await dataFetcher.fetchHistoricalData(symbol.toUpperCase());
  const analysis = await analyzer.analyze(history, indicators ?? ['all']);
  return { content: [{ type: 'text', text: JSON.stringify(analysis, null, 2) }] };
});

mcpServer.tool('predict_stock', 'Predict stock', {
  symbol: z.string().min(1),
  timeframe: z.enum(['short', 'medium', 'long']).optional().default('medium')
}, async ({ symbol, timeframe }) => {
  const history = await dataFetcher.fetchHistoricalData(symbol.toUpperCase());
  const analysis = await analyzer.analyze(history, ['all']);
  const prediction = await predictor.predict(symbol.toUpperCase(), history, analysis, timeframe ?? 'medium');
  return { content: [{ type: 'text', text: JSON.stringify(prediction, null, 2) }] };
});

mcpServer.tool('predict_market', 'Predict market', {
  timeframe: z.enum(['short', 'medium', 'long']).optional().default('medium')
}, async ({ timeframe }) => {
  const asiHistory = await dataFetcher.fetchHistoricalData('ASPI');
  const spxHistory = await dataFetcher.fetchHistoricalData('SPX');
  const asiAnalysis = await analyzer.analyze(asiHistory, ['all']);
  const spxAnalysis = await analyzer.analyze(spxHistory, ['all']);
  const asiPrediction = await predictor.predict('ASPI', asiHistory, asiAnalysis, timeframe ?? 'medium');
  const spxPrediction = await predictor.predict('SPX', spxHistory, spxAnalysis, timeframe ?? 'medium');
  return { content: [{ type: 'text', text: JSON.stringify({
    asi: asiPrediction, spx: spxPrediction,
    summary: predictor.generateMarketSummary(asiPrediction, spxPrediction)
  }, null, 2) }] };
});

mcpServer.tool('screen_stocks', 'Screen stocks', {
  criteria: z.enum(['bullish', 'bearish', 'oversold', 'overbought', 'high_volume', 'breakout', 'all']).optional().default('all'),
  limit: z.number().min(1).max(50).optional().default(10)
}, async ({ criteria, limit }) => {
  const companies = await dataFetcher.fetchAllCompanies();
  const screened = await predictor.screenStocks(companies, criteria ?? 'all', limit ?? 10);
  return { content: [{ type: 'text', text: JSON.stringify(screened, null, 2) }] };
});

mcpServer.tool('get_accuracy_report', 'Get accuracy', {
  period: z.enum(['week', 'month', 'quarter', 'year']).optional().default('month')
}, async ({ period }) => {
  const report = await predictor.getAccuracyReport(period ?? 'month');
  return { content: [{ type: 'text', text: JSON.stringify(report, null, 2) }] };
});

// Resources
mcpServer.resource('market-overview', 'cse://market/overview', { description: 'Market overview' }, async () => {
  const data = await dataManager.getMarketOverview();
  return { contents: [{ uri: 'cse://market/overview', text: JSON.stringify(data, null, 2) }] };
});

mcpServer.resource('listed-companies', 'cse://companies/list', { description: 'Companies list' }, async () => {
  const companies = await dataManager.getListedCompanies();
  return { contents: [{ uri: 'cse://companies/list', text: JSON.stringify(companies, null, 2) }] };
});

mcpServer.resource('prediction-models', 'cse://models/info', { description: 'Model info' }, async () => {
  const info = predictor.getModelInfo();
  return { contents: [{ uri: 'cse://models/info', text: JSON.stringify(info, null, 2) }] };
});

// HTTP Server
const app = express();
const PORT = process.env.PORT ?? 3000;

app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'healthy', name: 'cse-predictor', version: '1.0.0', timestamp: new Date().toISOString() });
});

// API info
app.get('/', (_req, res) => {
  res.json({
    name: 'CSE Predictor MCP Server',
    version: '1.0.0',
    endpoints: { mcp: '/mcp', health: '/health' },
    tools: ['fetch_market_data', 'get_company_data', 'analyze_stock', 'predict_stock', 'predict_market', 'screen_stocks', 'get_accuracy_report'],
    repository: 'https://github.com/shalinda-j/cse-predictor-mcp'
  });
});

// MCP endpoint
app.post('/mcp', async (req, res) => {
  try {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

app.listen(PORT, () => {
  logger.info(`HTTP Server started on port ${PORT}`);
  logger.info(`MCP endpoint: http://localhost:${PORT}/mcp`);
});

export { app };