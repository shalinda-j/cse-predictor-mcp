#!/usr/bin/env node
/**
 * CSE Predictor MCP Server - HTTP Transport
 * For remote hosting (Docker, AWS, etc.). Serves the same live, real data as
 * the stdio server in ./index.ts. No simulated data.
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
import { PredictionStore } from './database/prediction-store.js';

const dataFetcher = new CSEDataFetcher(config);
const analyzer = new TechnicalAnalyzer();
const predictor = new StockPredictor();
const dataManager = new CSEDataManager(dataFetcher);
const predictionStore = new PredictionStore(config.dataPath);

const text = (data: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] });

const mcpServer = new McpServer(
  { name: 'cse-predictor', version: '2.0.0' },
  { capabilities: { tools: {}, resources: {} } }
);

mcpServer.tool('fetch_market_data', 'Fetch live CSE market data (ASPI, S&P SL20, turnover, status)', {}, async () => {
  return text(await dataFetcher.fetchMarketData());
});

mcpServer.tool('get_company_data', 'Get live data for a CSE company', {
  symbol: z.string().min(1)
}, async ({ symbol }) => {
  return text(await dataFetcher.fetchCompanyData(symbol));
});

mcpServer.tool('analyze_stock', 'Technical analysis on real price history', {
  symbol: z.string().min(1),
  indicators: z.array(z.enum(['rsi', 'macd', 'sma', 'ema', 'bb', 'volume', 'trend', 'all'])).optional().default(['all'])
}, async ({ symbol, indicators }) => {
  const history = await dataFetcher.fetchHistoricalData(symbol);
  return text(await analyzer.analyze(history, indicators ?? ['all']));
});

mcpServer.tool('predict_stock', 'Technical-analysis outlook for a stock (tracked). Not financial advice.', {
  symbol: z.string().min(1),
  timeframe: z.enum(['short', 'medium', 'long']).optional().default('medium')
}, async ({ symbol, timeframe }) => {
  const history = await dataFetcher.fetchHistoricalData(symbol);
  const analysis = await analyzer.analyze(history, ['all']);
  const prediction = await predictor.predict(history.symbol, history, analysis, timeframe ?? 'medium');
  const predictionId = predictionStore.storePrediction(prediction);
  return text({ ...prediction, predictionId, tracked: true });
});

mcpServer.tool('screen_stocks', 'Screen all traded securities by live quote criteria', {
  criteria: z.enum(['bullish', 'bearish', 'oversold', 'overbought', 'high_volume', 'breakout', 'all']).optional().default('all'),
  limit: z.number().min(1).max(50).optional().default(10)
}, async ({ criteria, limit }) => {
  const companies = await dataFetcher.fetchAllCompanies();
  const quotes = companies.map((c) => ({
    symbol: c.symbol, name: c.name, price: c.price,
    changePercent: c.changePercent, volume: c.volume, high: c.high, low: c.low
  }));
  return text(predictor.screenStocks(quotes, criteria ?? 'all', limit ?? 10));
});

mcpServer.tool('get_accuracy_report', 'Real measured accuracy from tracked predictions', {
  period: z.enum(['week', 'month', 'quarter', 'year', 'all']).optional().default('all')
}, async ({ period }) => {
  return text({ period, ...predictionStore.getAccuracyStats() });
});

// Resources
mcpServer.resource('market-overview', 'cse://market/overview', { description: 'Live market overview' }, async () => {
  return { contents: [{ uri: 'cse://market/overview', text: JSON.stringify(await dataManager.getMarketOverview(), null, 2) }] };
});

mcpServer.resource('listed-companies', 'cse://companies/list', { description: 'Live listed companies' }, async () => {
  return { contents: [{ uri: 'cse://companies/list', text: JSON.stringify(await dataManager.getListedCompanies(), null, 2) }] };
});

mcpServer.resource('prediction-models', 'cse://models/info', { description: 'Model info' }, async () => {
  return { contents: [{ uri: 'cse://models/info', text: JSON.stringify(predictor.getModelInfo(), null, 2) }] };
});

// HTTP Server
const app = express();
const PORT = process.env.PORT ?? 3000;

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'healthy', name: 'cse-predictor', version: '2.0.0', timestamp: new Date().toISOString() });
});

app.get('/', (_req, res) => {
  res.json({
    name: 'CSE Predictor MCP Server',
    version: '2.0.0',
    endpoints: { mcp: '/mcp', health: '/health' },
    tools: ['fetch_market_data', 'get_company_data', 'analyze_stock', 'predict_stock', 'screen_stocks', 'get_accuracy_report'],
    repository: 'https://github.com/shalinda-j/cse-predictor-mcp'
  });
});

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
  logger.info(`HTTP server started on port ${PORT}`);
  logger.info(`MCP endpoint: http://localhost:${PORT}/mcp`);
});

export { app };
