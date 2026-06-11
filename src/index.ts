#!/usr/bin/env node
/**
 * CSE Predictor MCP Server
 *
 * A Model Context Protocol server for the Colombo Stock Exchange.
 * Serves REAL market data, company quotes, technical analysis and a
 * technical-analysis-based directional outlook, with honest empirical
 * accuracy tracking.
 *
 * This is a technical-analysis tool, not financial advice. There is no
 * simulated data anywhere in this project.
 *
 * @version 2.0.0
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { config } from './utils/config.js';
import { logger } from './utils/logger.js';
import { CSEDataFetcher } from './tools/data-fetcher.js';
import { TechnicalAnalyzer } from './tools/analysis.js';
import { StockPredictor } from './tools/predictor.js';
import { CSEDataManager } from './resources/cse-data.js';
import { PredictionStore } from './database/prediction-store.js';

// Initialize components
const dataFetcher = new CSEDataFetcher(config);
const analyzer = new TechnicalAnalyzer();
const predictor = new StockPredictor();
const dataManager = new CSEDataManager(dataFetcher);
const predictionStore = new PredictionStore(config.dataPath);

// Symbols used to persist daily index snapshots for index trend analysis.
const ASPI_KEY = 'ASPI';
const SNP_KEY = 'SNPSL20';

const ok = (data: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] });
const fail = (error: unknown) => ({
  content: [{ type: 'text' as const, text: 'Error: ' + (error instanceof Error ? error.message : String(error)) }],
  isError: true
});

/** Record today's index closes so we can build a real index history over time. */
function recordIndexSnapshot(asi: number, spx: number): void {
  const date = new Date().toISOString().split('T')[0] ?? '';
  if (asi > 0) predictionStore.storePriceHistory(ASPI_KEY, [{ date, open: asi, high: asi, low: asi, close: asi, volume: 0 }]);
  if (spx > 0) predictionStore.storePriceHistory(SNP_KEY, [{ date, open: spx, high: spx, low: spx, close: spx, volume: 0 }]);
}

// Create MCP Server
const server = new McpServer(
  { name: 'cse-predictor', version: '2.0.0' },
  { capabilities: { tools: {}, resources: {}, logging: {} } }
);

// =====================
// TOOLS
// =====================

server.tool(
  'fetch_market_data',
  'Fetch live CSE market data (ASPI, S&P SL20 indices, turnover, market status) from the official CSE API.',
  {},
  async () => {
    try {
      logger.info('Fetching market data');
      const data = await dataFetcher.fetchMarketData();
      recordIndexSnapshot(data.asi.value, data.spx.value);
      return ok(data);
    } catch (error) {
      return fail(error);
    }
  }
);

server.tool(
  'get_company_data',
  'Get live data for a CSE-listed company. Accepts a ticker (e.g. "JKH") or a full CSE symbol (e.g. "JKH.N0000").',
  { symbol: z.string().min(1).describe('Stock ticker or full CSE symbol') },
  async ({ symbol }) => {
    try {
      logger.info('Fetching company: ' + symbol);
      const data = await dataFetcher.fetchCompanyData(symbol);
      return ok(data);
    } catch (error) {
      return fail(error);
    }
  }
);

server.tool(
  'analyze_stock',
  'Run technical analysis (RSI, MACD, SMA, EMA, Bollinger Bands, volume, trend) on a stock using its real price history.',
  {
    symbol: z.string().min(1).describe('Stock ticker or full CSE symbol'),
    indicators: z
      .array(z.enum(['rsi', 'macd', 'sma', 'ema', 'bb', 'volume', 'trend', 'all']))
      .optional()
      .default(['all'])
  },
  async ({ symbol, indicators }) => {
    try {
      const history = await dataFetcher.fetchHistoricalData(symbol);
      const analysis = await analyzer.analyze(history, indicators ?? ['all']);
      return ok({ ...analysis, dataSource: history.dataSource });
    } catch (error) {
      return fail(error);
    }
  }
);

server.tool(
  'predict_stock',
  'Generate a technical-analysis-based directional outlook for a stock. The prediction is tracked in the database so real accuracy can be measured later. Not financial advice.',
  {
    symbol: z.string().min(1).describe('Stock ticker or full CSE symbol'),
    timeframe: z.enum(['short', 'medium', 'long']).optional().default('medium')
  },
  async ({ symbol, timeframe }) => {
    try {
      logger.info('Predicting: ' + symbol + ' for ' + timeframe);
      const history = await dataFetcher.fetchHistoricalData(symbol);
      const analysis = await analyzer.analyze(history, ['all']);
      const prediction = await predictor.predict(history.symbol, history, analysis, timeframe ?? 'medium');

      // Use the live quote for the current price when available.
      let currentPrice = prediction.currentPrice;
      try {
        const live = await dataFetcher.fetchCompanyData(history.symbol);
        if (live.price > 0) currentPrice = live.price;
      } catch {
        /* fall back to last historical close */
      }

      const predictionId = predictionStore.storePrediction({ ...prediction, currentPrice });
      return ok({
        ...prediction,
        currentPrice,
        predictionId,
        tracked: true,
        note: 'Prediction stored. Run resolve_predictions after the timeframe elapses to measure real accuracy.'
      });
    } catch (error) {
      return fail(error);
    }
  }
);

server.tool(
  'predict_market',
  'Generate a directional outlook for the ASPI and S&P SL20 indices using recorded daily index history. Requires the server to have collected enough daily snapshots.',
  { timeframe: z.enum(['short', 'medium', 'long']).optional().default('medium') },
  async ({ timeframe }) => {
    try {
      // Record today's snapshot first so history keeps growing.
      const market = await dataFetcher.fetchMarketData();
      recordIndexSnapshot(market.asi.value, market.spx.value);

      const buildOutlook = async (key: string, label: string) => {
        const points = predictionStore.getPriceHistory(key, config.historyDays);
        if (points.length < CSEDataFetcher.MIN_HISTORY_POINTS) {
          return {
            index: label,
            available: false,
            recordedDays: points.length,
            requiredDays: CSEDataFetcher.MIN_HISTORY_POINTS,
            note:
              'Index history is being collected from daily snapshots. Outlook becomes available once enough trading days are recorded.'
          };
        }
        const history = { symbol: key, data: points, dataSource: 'recorded daily snapshots' };
        const analysis = await analyzer.analyze(history, ['all']);
        const prediction = await predictor.predict(label, history, analysis, timeframe ?? 'medium');
        return { index: label, available: true, ...prediction };
      };

      const [asi, spx] = await Promise.all([buildOutlook(ASPI_KEY, 'ASPI'), buildOutlook(SNP_KEY, 'S&P SL20')]);
      return ok({ asi, spx, currentMarket: market });
    } catch (error) {
      return fail(error);
    }
  }
);

server.tool(
  'screen_stocks',
  'Screen all traded CSE securities by a criterion using live quote data (change %, volume, intraday range).',
  {
    criteria: z
      .enum(['bullish', 'bearish', 'oversold', 'overbought', 'high_volume', 'breakout', 'all'])
      .optional()
      .default('all'),
    limit: z.number().min(1).max(50).optional().default(10)
  },
  async ({ criteria, limit }) => {
    try {
      logger.info('Screening stocks: ' + criteria);
      const companies = await dataFetcher.fetchAllCompanies();
      const quotes = companies.map((c) => ({
        symbol: c.symbol,
        name: c.name,
        price: c.price,
        changePercent: c.changePercent,
        volume: c.volume,
        high: c.high,
        low: c.low
      }));
      const screened = predictor.screenStocks(quotes, criteria ?? 'all', limit ?? 10);
      return ok({ criteria, count: screened.length, results: screened, dataSource: 'cse.lk/api' });
    } catch (error) {
      return fail(error);
    }
  }
);

server.tool(
  'get_accuracy_report',
  'Get the real, empirically measured accuracy of past predictions from the tracking database.',
  { period: z.enum(['week', 'month', 'quarter', 'year', 'all']).optional().default('all') },
  async ({ period }) => {
    try {
      const stats = predictionStore.getAccuracyStats();
      return ok({
        period,
        dataSource: 'prediction tracking database',
        hasRealTracking: stats.resolvedPredictions > 0,
        ...stats,
        note:
          stats.resolvedPredictions === 0
            ? 'No resolved predictions yet. Make predictions, wait for the timeframe, then run resolve_predictions.'
            : 'Accuracy measured from ' + stats.resolvedPredictions + ' resolved predictions.'
      });
    } catch (error) {
      return fail(error);
    }
  }
);

server.tool(
  'resolve_predictions',
  'Resolve pending predictions against the current live price so real accuracy can be computed.',
  { symbol: z.string().optional().describe('Specific ticker/symbol (optional; resolves all pending if omitted)') },
  async ({ symbol }) => {
    try {
      logger.info('Resolving predictions for: ' + (symbol ?? 'all'));
      const pending = (symbol ? predictionStore.getPredictionsBySymbol(symbol) : predictionStore.getPendingPredictions())
        .filter((p) => p.status === 'pending');

      const results: Array<{ id: string; symbol: string; resolved: boolean; correct?: boolean; error?: string }> = [];
      for (const pred of pending) {
        try {
          const live = await dataFetcher.fetchCompanyData(pred.symbol);
          const correct = predictionStore.resolvePrediction(pred.id, live.price);
          results.push({ id: pred.id, symbol: pred.symbol, resolved: true, correct });
        } catch (e) {
          results.push({ id: pred.id, symbol: pred.symbol, resolved: false, error: (e as Error).message });
        }
      }
      return ok({ resolved: results.filter((r) => r.resolved).length, total: pending.length, results });
    } catch (error) {
      return fail(error);
    }
  }
);

// =====================
// RESOURCES
// =====================

server.resource('market-overview', 'cse://market/overview', { description: 'Live CSE market overview' }, async () => {
  const data = await dataManager.getMarketOverview();
  return { contents: [{ uri: 'cse://market/overview', text: JSON.stringify(data, null, 2) }] };
});

server.resource('prediction-stats', 'cse://predictions/stats', { description: 'Real prediction accuracy statistics' }, async () => {
  const stats = predictionStore.getAccuracyStats();
  return { contents: [{ uri: 'cse://predictions/stats', text: JSON.stringify(stats, null, 2) }] };
});

server.resource('prediction-models', 'cse://models/info', { description: 'Prediction model info and measured accuracy' }, async () => {
  const modelInfo = predictor.getModelInfo();
  const stats = predictionStore.getAccuracyStats();
  return {
    contents: [
      {
        uri: 'cse://models/info',
        text: JSON.stringify(
          {
            ...modelInfo,
            measuredAccuracy: stats.resolvedPredictions > 0 ? stats.accuracy : null,
            resolvedPredictions: stats.resolvedPredictions,
            trackedPredictions: stats.totalPredictions
          },
          null,
          2
        )
      }
    ]
  };
});

// =====================
// STARTUP
// =====================

async function main() {
  logger.info('Starting CSE Predictor MCP Server v2.0.0');
  logger.info('Data source: ' + config.cseApiUrl + ' (live, no simulated data)');
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info('CSE Predictor ready');
}

main().catch((error) => {
  logger.error('Server failed: ' + error);
  process.exit(1);
});
