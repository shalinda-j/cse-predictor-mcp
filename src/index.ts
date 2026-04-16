#!/usr/bin/env node
/**
 * CSE Predictor MCP Server - PRODUCTION V2
 * Colombo Stock Exchange Prediction with REAL data and tracking
 * 
 * @version 2.0.0
 * @author Work360
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { config } from './utils/config.js';
import { logger } from './utils/logger.js';
import { CSEDataFetcher } from './tools/data-fetcher.js';
import { LiveDataFetcher } from './tools/live-fetcher.js';
import { TechnicalAnalyzer } from './tools/analysis.js';
import { StockPredictor } from './tools/predictor.js';
import { CSEDataManager } from './resources/cse-data.js';
import { PredictionStore } from './database/prediction-store.js';

// Initialize components
const dataFetcher = new CSEDataFetcher(config);
const liveFetcher = new LiveDataFetcher();
const analyzer = new TechnicalAnalyzer();
const predictor = new StockPredictor(config.predictionThreshold);
const dataManager = new CSEDataManager(config.dataPath);
const predictionStore = new PredictionStore();

// Create MCP Server
const server = new McpServer(
  {
    name: 'cse-predictor-v2',
    version: '2.0.0'
  },
  {
    capabilities: {
      tools: {},
      resources: {},
      logging: {}
    }
  }
);

// =====================
// TOOLS REGISTRATION
// =====================

server.tool(
  'fetch_market_data',
  'Fetch REAL current market data from CSE (ASPI, S&P SL20) - uses browser automation for live data',
  {
    type: z.enum(['all', 'asi', 'spx', 'turnover']).optional().default('all')
      .describe('Type of market data to fetch'),
    useLive: z.boolean().optional().default(true)
      .describe('Use live browser fetch (true) or cached data (false)')
  },
  async ({ type, useLive }) => {
    try {
      logger.info('Fetching market data: ' + type + ' (live=' + useLive + ')');
      
      if (useLive) {
        const liveData = await liveFetcher.fetchMarketData();
        if (liveData) {
          return { content: [{ type: 'text', text: JSON.stringify(liveData, null, 2) }] };
        }
        logger.warn('Live fetch failed, falling back');
      }
      
      const data = await dataFetcher.fetchMarketData(type ?? 'all');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed: ' + message);
      return { content: [{ type: 'text', text: 'Error: ' + message }], isError: true };
    }
  }
);

server.tool(
  'get_company_data',
  'Get REAL detailed data for a CSE listed company - live browser fetch',
  {
    symbol: z.string().min(1).describe('Stock symbol (e.g., COMB, JKH, NDB)'),
    useLive: z.boolean().optional().default(true)
  },
  async ({ symbol, useLive }) => {
    try {
      logger.info('Fetching company: ' + symbol);
      
      if (useLive) {
        const liveData = await liveFetcher.fetchCompanyData(symbol.toUpperCase());
        if (liveData) {
          return { content: [{ type: 'text', text: JSON.stringify(liveData, null, 2) }] };
        }
      }
      
      const data = await dataFetcher.fetchCompanyData(symbol.toUpperCase(), false);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { content: [{ type: 'text', text: 'Error: ' + message }], isError: true };
    }
  }
);

server.tool(
  'predict_stock',
  'Predict stock trend - TRACKED for real accuracy calculation',
  {
    symbol: z.string().min(1).describe('Stock symbol'),
    timeframe: z.enum(['short', 'medium', 'long']).optional().default('medium')
  },
  async ({ symbol, timeframe }) => {
    try {
      logger.info('Predicting: ' + symbol + ' for ' + timeframe);
      
      const liveData = await liveFetcher.fetchCompanyData(symbol.toUpperCase());
      const history = await dataFetcher.fetchHistoricalData(symbol.toUpperCase());
      const analysis = await analyzer.analyze(history, ['all']);
      const prediction = await predictor.predict(symbol.toUpperCase(), history, analysis, timeframe ?? 'medium');
      
      // STORE for tracking
      const predictionId = predictionStore.storePrediction(prediction);
      
      const response = {
        ...prediction,
        predictionId,
        currentPrice: liveData?.price ?? 'N/A',
        tracked: true,
        note: 'Prediction stored. Validate after timeframe elapses.'
      };
      
      return { content: [{ type: 'text', text: JSON.stringify(response, null, 2) }] };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { content: [{ type: 'text', text: 'Error: ' + message }], isError: true };
    }
  }
);

server.tool(
  'get_accuracy_report',
  'Get REAL accuracy from tracked predictions database',
  {
    period: z.enum(['week', 'month', 'quarter', 'year', 'all']).optional().default('all')
  },
  async ({ period }) => {
    try {
      logger.info('Fetching REAL accuracy report');
      const stats = predictionStore.getAccuracyStats();
      
      const response = {
        period,
        dataSource: 'sqlite_database',
        hasRealTracking: stats.resolvedPredictions > 0,
        totalPredictions: stats.totalPredictions,
        resolvedPredictions: stats.resolvedPredictions,
        correctPredictions: stats.correctPredictions,
        accuracy: stats.accuracy,
        note: stats.resolvedPredictions === 0 
          ? 'No resolved predictions yet. Make predictions and wait for timeframe.'
          : 'Real accuracy from ' + stats.resolvedPredictions + ' resolved predictions.'
      };
      
      return { content: [{ type: 'text', text: JSON.stringify(response, null, 2) }] };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { content: [{ type: 'text', text: 'Error: ' + message }], isError: true };
    }
  }
);

server.tool(
  'resolve_predictions',
  'Resolve pending predictions with live price data',
  {
    symbol: z.string().optional().describe('Specific symbol (optional)')
  },
  async ({ symbol }) => {
    try {
      logger.info('Resolving predictions for: ' + (symbol ?? 'all'));
      
      const pending = symbol 
        ? predictionStore.getPredictionsBySymbol(symbol.toUpperCase())
        : predictionStore.getPendingPredictions();
      
      const results = [];
      for (const pred of pending.filter(p => p.status === 'pending')) {
        const liveData = await liveFetcher.fetchCompanyData(pred.symbol);
        if (liveData) {
          const correct = predictionStore.resolvePrediction(pred.id, liveData.price);
          results.push({ id: pred.id, symbol: pred.symbol, resolved: true, correct });
          await new Promise(r => setTimeout(r, 1000));
        }
      }
      
      return { content: [{ type: 'text', text: JSON.stringify({ resolved: results.length, results }, null, 2) }] };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { content: [{ type: 'text', text: 'Error: ' + message }], isError: true };
    }
  }
);

server.tool(
  'analyze_stock',
  'Perform technical analysis on a stock',
  {
    symbol: z.string().min(1).describe('Stock symbol'),
    indicators: z.array(z.enum(['rsi', 'macd', 'sma', 'ema', 'bb', 'volume', 'trend', 'all'])).optional().default(['all'])
  },
  async ({ symbol, indicators }) => {
    try {
      const history = await dataFetcher.fetchHistoricalData(symbol.toUpperCase());
      const analysis = await analyzer.analyze(history, indicators ?? ['all']);
      return { content: [{ type: 'text', text: JSON.stringify(analysis, null, 2) }] };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { content: [{ type: 'text', text: 'Error: ' + message }], isError: true };
    }
  }
);

server.tool(
  'screen_stocks',
  'Screen stocks using REAL live data',
  {
    criteria: z.enum(['bullish', 'bearish', 'oversold', 'overbought', 'high_volume', 'breakout', 'all']).optional().default('all'),
    limit: z.number().min(1).max(50).optional().default(10)
  },
  async ({ criteria, limit }) => {
    try {
      logger.info('Screening stocks: ' + criteria);
      
      const liveCompanies = await liveFetcher.fetchAllCompanies();
      
      if (liveCompanies.length > 0) {
        const screened = await predictor.screenStocks(
          liveCompanies.map(c => ({ symbol: c.symbol, price: c.price, isSimulated: false })),
          criteria ?? 'all', limit ?? 10
        );
        return { content: [{ type: 'text', text: JSON.stringify({ ...screened, dataSource: 'cse.lk_live' }, null, 2) }] };
      }
      
      const allCompanies = await dataFetcher.fetchAllCompanies();
      const screened = await predictor.screenStocks(allCompanies, criteria ?? 'all', limit ?? 10);
      return { content: [{ type: 'text', text: JSON.stringify(screened, null, 2) }] };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { content: [{ type: 'text', text: 'Error: ' + message }], isError: true };
    }
  }
);

server.tool(
  'predict_market',
  'Get market prediction for ASPI and S&P SL20',
  {
    timeframe: z.enum(['short', 'medium', 'long']).optional().default('medium')
  },
  async ({ timeframe }) => {
    try {
      const asiHistory = await dataFetcher.fetchHistoricalData('ASPI');
      const spxHistory = await dataFetcher.fetchHistoricalData('SPX');
      const asiAnalysis = await analyzer.analyze(asiHistory, ['all']);
      const spxAnalysis = await analyzer.analyze(spxHistory, ['all']);
      const asiPrediction = await predictor.predict('ASPI', asiHistory, asiAnalysis, timeframe ?? 'medium');
      const spxPrediction = await predictor.predict('SPX', spxHistory, spxAnalysis, timeframe ?? 'medium');
      
      return { content: [{ type: 'text', text: JSON.stringify({ asi: asiPrediction, spx: spxPrediction }, null, 2) }] };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { content: [{ type: 'text', text: 'Error: ' + message }], isError: true };
    }
  }
);

// =====================
// RESOURCES
// =====================

server.resource('market-overview', 'cse://market/overview',
  { description: 'Current CSE market overview' },
  async () => {
    const data = await dataManager.getMarketOverview();
    return { contents: [{ uri: 'cse://market/overview', text: JSON.stringify(data, null, 2) }] };
  }
);

server.resource('prediction-stats', 'cse://predictions/stats',
  { description: 'Real prediction statistics from database' },
  async () => {
    const stats = predictionStore.getAccuracyStats();
    return { contents: [{ uri: 'cse://predictions/stats', text: JSON.stringify(stats, null, 2) }] };
  }
);

server.resource('prediction-models', 'cse://models/info',
  { description: 'Model info with REAL accuracy' },
  async () => {
    const modelInfo = predictor.getModelInfo();
    const stats = predictionStore.getAccuracyStats();
    return { contents: [{ uri: 'cse://models/info', text: JSON.stringify({
      ...modelInfo,
      realAccuracy: stats.resolvedPredictions > 0 ? stats.accuracy : null,
      trackedPredictions: stats.totalPredictions
    }, null, 2) }] };
  }
);

// =====================
// STARTUP
// =====================

async function main() {
  logger.info('Starting CSE Predictor V2 (Production)...');
  logger.info('Database: ./data/predictions.db');
  logger.info('Live data: Browser automation enabled');
  
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  logger.info('CSE Predictor V2 started - PRODUCTION MODE');
}

main().catch((error) => {
  logger.error('Server failed: ' + error);
  process.exit(1);
});