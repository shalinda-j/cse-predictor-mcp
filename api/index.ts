// Vercel Serverless API - MCP-over-HTTP endpoint serving REAL CSE data.
// No simulated data. Prediction tracking (SQLite) is only available on the
// stdio / long-running HTTP server, not on this stateless serverless function.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { config } from '../src/utils/config.js';
import { CSEDataFetcher } from '../src/tools/data-fetcher.js';
import { TechnicalAnalyzer } from '../src/tools/analysis.js';
import { StockPredictor } from '../src/tools/predictor.js';

const dataFetcher = new CSEDataFetcher(config);
const analyzer = new TechnicalAnalyzer();
const predictor = new StockPredictor();

const TOOLS = [
  { name: 'fetch_market_data', description: 'Live CSE market data (ASPI, S&P SL20, turnover, status)', inputSchema: { type: 'object', properties: {} } },
  { name: 'get_company_data', description: 'Live data for a CSE company', inputSchema: { type: 'object', properties: { symbol: { type: 'string' } }, required: ['symbol'] } },
  { name: 'analyze_stock', description: 'Technical analysis on real price history', inputSchema: { type: 'object', properties: { symbol: { type: 'string' } }, required: ['symbol'] } },
  { name: 'predict_stock', description: 'Technical-analysis outlook (not financial advice)', inputSchema: { type: 'object', properties: { symbol: { type: 'string' }, timeframe: { type: 'string', enum: ['short', 'medium', 'long'] } }, required: ['symbol'] } },
  { name: 'screen_stocks', description: 'Screen traded securities by live quote criteria', inputSchema: { type: 'object', properties: { criteria: { type: 'string', enum: ['bullish', 'bearish', 'oversold', 'overbought', 'high_volume', 'breakout', 'all'] }, limit: { type: 'number' } } } }
];

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'fetch_market_data':
      return dataFetcher.fetchMarketData();
    case 'get_company_data':
      return dataFetcher.fetchCompanyData(String(args.symbol));
    case 'analyze_stock': {
      const history = await dataFetcher.fetchHistoricalData(String(args.symbol));
      return analyzer.analyze(history, ['all']);
    }
    case 'predict_stock': {
      const history = await dataFetcher.fetchHistoricalData(String(args.symbol));
      const analysis = await analyzer.analyze(history, ['all']);
      return predictor.predict(history.symbol, history, analysis, (args.timeframe as 'short' | 'medium' | 'long') ?? 'medium');
    }
    case 'screen_stocks': {
      const companies = await dataFetcher.fetchAllCompanies();
      const quotes = companies.map((c) => ({
        symbol: c.symbol, name: c.name, price: c.price,
        changePercent: c.changePercent, volume: c.volume, high: c.high, low: c.low
      }));
      return predictor.screenStocks(quotes, (args.criteria as string) ?? 'all', Number(args.limit) || 10);
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method === 'GET') {
    res.status(200).json({
      name: 'CSE Predictor MCP Server',
      version: '2.0.0',
      dataSource: 'cse.lk/api (live, no simulated data)',
      endpoints: { mcp: '/api (POST)', health: '/api/health' },
      tools: TOOLS.map((t) => t.name),
      repository: 'https://github.com/shalinda-j/cse-predictor-mcp'
    });
    return;
  }

  if (req.method === 'POST') {
    const body = req.body ?? {};

    if (body.method === 'tools/list') {
      res.status(200).json({ jsonrpc: '2.0', id: body.id, result: { tools: TOOLS } });
      return;
    }

    if (body.method === 'tools/call') {
      try {
        const result = await callTool(body.params?.name, body.params?.arguments || {});
        res.status(200).json({
          jsonrpc: '2.0',
          id: body.id,
          result: { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
        });
      } catch (error) {
        res.status(200).json({
          jsonrpc: '2.0',
          id: body.id,
          result: {
            content: [{ type: 'text', text: 'Error: ' + (error instanceof Error ? error.message : String(error)) }],
            isError: true
          }
        });
      }
      return;
    }

    res.status(400).json({ jsonrpc: '2.0', id: body.id, error: { code: -32601, message: 'Method not found' } });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
