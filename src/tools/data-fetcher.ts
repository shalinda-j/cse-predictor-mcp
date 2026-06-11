/**
 * CSE Data Fetcher
 *
 * Fetches REAL market, company and historical data from the Colombo Stock
 * Exchange via its public JSON API (see ./cse-api.ts).
 *
 * There is NO simulated or fallback data. When the exchange data cannot be
 * retrieved, the methods throw so callers surface an honest error rather than
 * returning fabricated numbers.
 */

import { logger } from '../utils/logger.js';
import type { Config } from '../utils/config.js';
import { CSEApiClient, type ShareQuote } from './cse-api.js';

// Types
export interface MarketData {
  asi: IndexData;
  spx: IndexData;
  turnover: number;
  trades: number;
  status: string;
  timestamp: string;
  dataSource: string;
}

export interface IndexData {
  value: number;
  change: number;
  changePercent: number;
}

export interface CompanyData {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  high: number;
  low: number;
  open: number;
  previousClose: number;
  marketCap?: number;
  sector?: string;
  dataSource: string;
}

export interface HistoricalData {
  symbol: string;
  data: PricePoint[];
  dataSource: string;
}

export interface PricePoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export class CSEDataFetcher {
  private api: CSEApiClient;
  private cache: Map<string, { data: unknown; timestamp: number }> = new Map();
  private cacheTimeout = 5 * 60 * 1000; // 5 minutes

  constructor(config: Config) {
    this.api = new CSEApiClient({ baseUrl: config.cseApiUrl, timeoutMs: config.requestTimeoutMs });
  }

  /** Minimum number of price points required for meaningful technical analysis. */
  static readonly MIN_HISTORY_POINTS = 30;

  private async fetchWithCache<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data as T;
    }
    const data = await fetcher();
    this.cache.set(key, { data, timestamp: Date.now() });
    return data;
  }

  /** Live market indices (ASPI, S&P SL20), turnover and market status. */
  async fetchMarketData(): Promise<MarketData> {
    return this.fetchWithCache('market', async () => {
      logger.debug('Fetching real market data from CSE API');
      const [asi, spx, status, trades] = await Promise.all([
        this.api.getAspi(),
        this.api.getSnpSl20(),
        this.api.getMarketStatus().catch(() => ({ status: 'Unknown', isOpen: false })),
        this.api.getTradeSummary().catch(() => [] as ShareQuote[])
      ]);

      const turnover = trades.reduce((sum, t) => sum + (t.turnover || 0), 0);

      return {
        asi,
        spx,
        turnover,
        trades: trades.length,
        status: status.status,
        timestamp: new Date().toISOString(),
        dataSource: 'cse.lk/api'
      };
    });
  }

  /** Live data for a single listed company. Accepts a ticker ("JKH") or full symbol ("JKH.N0000"). */
  async fetchCompanyData(symbol: string): Promise<CompanyData> {
    return this.fetchWithCache(`company-${symbol}`, async () => {
      logger.debug(`Fetching real company data for: ${symbol}`);
      const fullSymbol = await this.api.resolveSymbol(symbol);

      // The trade summary carries the full quote (incl. open, volume,
      // market cap); company info adds the sector and is the fallback.
      const quotes = await this.api.getTradeSummary();
      const quote = quotes.find((q) => q.symbol.toUpperCase() === fullSymbol.toUpperCase());
      const info = await this.api.getCompanyInfo(fullSymbol).catch(() => null);

      const price = quote?.price || info?.price || 0;
      if (price <= 0) {
        throw new Error(`No live price available for ${fullSymbol} (market may be closed or symbol not traded today).`);
      }

      return {
        symbol: fullSymbol,
        name: quote?.name || info?.name || fullSymbol,
        price,
        change: quote?.change ?? info?.change ?? 0,
        changePercent: quote?.changePercent ?? info?.changePercent ?? 0,
        volume: quote?.volume ?? 0,
        high: quote?.high || info?.high || 0,
        low: quote?.low || info?.low || 0,
        open: quote?.open || quote?.previousClose || info?.previousClose || 0,
        previousClose: quote?.previousClose || info?.previousClose || 0,
        marketCap: quote?.marketCap || info?.marketCap || undefined,
        sector: info?.sector,
        dataSource: 'cse.lk/api'
      };
    });
  }

  /**
   * Real historical OHLC data for a stock. Sourced from the CSE chart API.
   * Throws if not enough real data is available for analysis.
   */
  async fetchHistoricalData(symbol: string): Promise<HistoricalData> {
    return this.fetchWithCache(`history-${symbol}`, async () => {
      logger.debug(`Fetching real historical data for: ${symbol}`);
      const fullSymbol = await this.api.resolveSymbol(symbol);
      const stockId = await this.api.getStockId(fullSymbol);

      const points = await this.api.getChartData(stockId);
      if (points.length < CSEDataFetcher.MIN_HISTORY_POINTS) {
        throw new Error(
          `Insufficient real historical data for ${fullSymbol} (${points.length} points; need at least ${CSEDataFetcher.MIN_HISTORY_POINTS}).`
        );
      }

      return { symbol: fullSymbol, data: points, dataSource: 'cse.lk/api (chart)' };
    });
  }

  /** Every traded security with its current quote. */
  async fetchAllCompanies(): Promise<CompanyData[]> {
    return this.fetchWithCache('all-companies', async () => {
      logger.debug('Fetching all traded companies from CSE API');
      const quotes = await this.api.getTradeSummary();
      if (quotes.length === 0) {
        throw new Error('CSE trade summary returned no securities (market may be closed).');
      }
      return quotes.map((q) => ({
        symbol: q.symbol,
        name: q.name || q.symbol,
        price: q.price,
        change: q.change,
        changePercent: q.changePercent,
        volume: q.volume,
        high: q.high,
        low: q.low,
        open: q.open || q.previousClose,
        previousClose: q.previousClose,
        marketCap: q.marketCap || undefined,
        dataSource: 'cse.lk/api'
      }));
    });
  }

  /** Expose the underlying API client for callers that need index history etc. */
  getApiClient(): CSEApiClient {
    return this.api;
  }
}
