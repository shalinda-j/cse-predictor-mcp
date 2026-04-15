#!/usr/bin/env node
/**
 * CSE Predictor MCP Server
 * Colombo Stock Exchange Prediction with 80%+ accuracy target
 * 
 * @version 1.0.0
 * @author Work360
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

// Initialize components
const dataFetcher = new CSEDataFetcher(config);
const analyzer = new TechnicalAnalyzer();
const predictor = new StockPredictor(config.predictionThreshold);
const dataManager = new CSEDataManager(config.dataPath);

// Create MCP Server
const server = new McpServer(
  {
    name: 'cse-predictor',
    version: '1.0.0'
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
  'Fetch current market data from Colombo Stock Exchange (ASPI, S&P SL20, turnover)',
  {
    type: z.enum(['all', 'asi', 'spx', 'turnover']).optional().default('all')
      .describe('Type of market data to fetch')
  },
  async ({ type }) => {
    try {
      logger.info(`Fetching market data: ${type}`);
      const data = await dataFetcher.fetchMarketData(type ?? 'all');
      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }]
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to fetch market data: ${message}`);
      return {
        content: [{ type: 'text', text: `Error: ${message}` }],
        isError: true
      };
    }
  }
);

server.tool(
  'get_company_data',
  'Get detailed data for a specific CSE listed company by symbol',
  {
    symbol: z.string().min(1).describe('Stock symbol (e.g., COMB, JKH, NDB)'),
    includeHistory: z.boolean().optional().default(false)
      .describe('Include historical price data')
  },
  async ({ symbol, includeHistory }) => {
    try {
      logger.info(`Fetching company data for: ${symbol}`);
      const data = await dataFetcher.fetchCompanyData(symbol.toUpperCase(), includeHistory ?? false);
      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }]
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to fetch company data: ${message}`);
      return {
        content: [{ type: 'text', text: `Error: ${message}` }],
        isError: true
      };
    }
  }
);

server.tool(
  'analyze_stock',
  'Perform comprehensive technical analysis on a stock using multiple indicators',
  {
    symbol: z.string().min(1).describe('Stock symbol to analyze'),
    indicators: z.array(z.enum(['rsi', 'macd', 'sma', 'ema', 'bb', 'volume', 'trend', 'all']))
      .optional().default(['all']).describe('Technical indicators to calculate')
  },
  async ({ symbol, indicators }) => {
    try {
      logger.info(`Analyzing stock: ${symbol}`);
      const history = await dataFetcher.fetchHistoricalData(symbol.toUpperCase());
      const analysis = await analyzer.analyze(history, indicators ?? ['all']);
      return {
        content: [{ type: 'text', text: JSON.stringify(analysis, null, 2) }]
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to analyze stock: ${message}`);
      return {
        content: [{ type: 'text', text: `Error: ${message}` }],
        isError: true
      };
    }
  }
);

server.tool(
  'predict_stock',
  'Predict stock price trend with confidence score (target: 80%+ accuracy)',
  {
    symbol: z.string().min(1).describe('Stock symbol to predict'),
    timeframe: z.enum(['short', 'medium', 'long']).optional().default('medium')
      .describe('Prediction timeframe: short (1-5 days), medium (1-4 weeks), long (1-3 months)')
  },
  async ({ symbol, timeframe }) => {
    try {
      logger.info(`Predicting stock: ${symbol} for timeframe: ${timeframe}`);
      const history = await dataFetcher.fetchHistoricalData(symbol.toUpperCase());
      const analysis = await analyzer.analyze(history, ['all']);
      const prediction = await predictor.predict(symbol.toUpperCase(), history, analysis, timeframe ?? 'medium');
      
      return {
        content: [{ type: 'text', text: JSON.stringify(prediction, null, 2) }]
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to predict stock: ${message}`);
      return {
        content: [{ type: 'text', text: `Error: ${message}` }],
        isError: true
      };
    }
  }
);

server.tool(
  'predict_market',
  'Get overall market prediction for ASPI and S&P SL20 indices',
  {
    timeframe: z.enum(['short', 'medium', 'long']).optional().default('medium')
      .describe('Prediction timeframe')
  },
  async ({ timeframe }) => {
    try {
      logger.info(`Predicting market trend for timeframe: ${timeframe}`);
      
      const asiHistory = await dataFetcher.fetchHistoricalData('ASPI');
      const spxHistory = await dataFetcher.fetchHistoricalData('SPX');
      
      const asiAnalysis = await analyzer.analyze(asiHistory, ['all']);
      const spxAnalysis = await analyzer.analyze(spxHistory, ['all']);
      
      const asiPrediction = await predictor.predict('ASPI', asiHistory, asiAnalysis, timeframe ?? 'medium');
      const spxPrediction = await predictor.predict('SPX', spxHistory, spxAnalysis, timeframe ?? 'medium');
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            asi: asiPrediction,
            spx: spxPrediction,
            summary: predictor.generateMarketSummary(asiPrediction, spxPrediction)
          }, null, 2)
        }]
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to predict market: ${message}`);
      return {
        content: [{ type: 'text', text: `Error: ${message}` }],
        isError: true
      };
    }
  }
);

server.tool(
  'screen_stocks',
  'Screen stocks based on criteria to find potential investment opportunities',
  {
    criteria: z.enum(['bullish', 'bearish', 'oversold', 'overbought', 'high_volume', 'breakout', 'all'])
      .optional().default('all').describe('Screening criteria'),
    limit: z.number().min(1).max(50).optional().default(10)
      .describe('Maximum number of stocks to return')
  },
  async ({ criteria, limit }) => {
    try {
      logger.info(`Screening stocks with criteria: ${criteria}`);
      const allCompanies = await dataFetcher.fetchAllCompanies();
      const screenedStocks = await predictor.screenStocks(allCompanies, criteria ?? 'all', limit ?? 10);
      
      return {
        content: [{ type: 'text', text: JSON.stringify(screenedStocks, null, 2) }]
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to screen stocks: ${message}`);
      return {
        content: [{ type: 'text', text: `Error: ${message}` }],
        isError: true
      };
    }
  }
);

server.tool(
  'get_accuracy_report',
  'Get historical prediction accuracy report showing model performance',
  {
    period: z.enum(['week', 'month', 'quarter', 'year']).optional().default('month')
      .describe('Reporting period')
  },
  async ({ period }) => {
    try {
      logger.info(`Fetching accuracy report for period: ${period}`);
      const report = await predictor.getAccuracyReport(period ?? 'month');
      
      return {
        content: [{ type: 'text', text: JSON.stringify(report, null, 2) }]
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to get accuracy report: ${message}`);
      return {
        content: [{ type: 'text', text: `Error: ${message}` }],
        isError: true
      };
    }
  }
);

// =====================
// RESOURCES REGISTRATION
// =====================

server.resource(
  'market-overview',
  'cse://market/overview',
  { description: 'Current CSE market overview including ASPI, S&P SL20, and turnover' },
  async () => {
    const data = await dataManager.getMarketOverview();
    return {
      contents: [{ uri: 'cse://market/overview', text: JSON.stringify(data, null, 2) }]
    };
  }
);

server.resource(
  'listed-companies',
  'cse://companies/list',
  { description: 'List of all major CSE listed companies with sectors' },
  async () => {
    const companies = await dataManager.getListedCompanies();
    return {
      contents: [{ uri: 'cse://companies/list', text: JSON.stringify(companies, null, 2) }]
    };
  }
);

server.resource(
  'prediction-models',
  'cse://models/info',
  { description: 'Information about prediction models and their accuracy metrics' },
  async () => {
    const modelInfo = predictor.getModelInfo();
    return {
      contents: [{ uri: 'cse://models/info', text: JSON.stringify(modelInfo, null, 2) }]
    };
  }
);

// =====================
// SERVER STARTUP
// =====================

async function main() {
  logger.info('Starting CSE Predictor MCP Server...');
  logger.info(`Configuration: threshold=${config.predictionThreshold}, historyDays=${config.historyDays}`);
  
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  logger.info('CSE Predictor MCP Server started successfully');
}

main().catch((error) => {
  logger.error(`Server failed to start: ${error}`);
  process.exit(1);
});