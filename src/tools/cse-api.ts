/**
 * CSE API Client
 *
 * Typed client for the Colombo Stock Exchange public JSON API
 * (https://www.cse.lk/api/). These are the same endpoints the official
 * cse.lk website uses for its live data widgets. They are not officially
 * documented, so field names are parsed defensively and may need to be
 * adjusted if the CSE changes its API.
 *
 * All endpoints are POST requests with `application/x-www-form-urlencoded`
 * bodies. No authentication is required.
 *
 * NOTE: This client fetches REAL market data. There is no simulated /
 * fallback data anywhere in this project. If the CSE API is unreachable
 * (network blocked, market data unavailable) the methods throw so callers
 * can surface an honest error instead of fabricating numbers.
 */

import { logger } from '../utils/logger.js';

// ---------------------------------------------------------------------------
// Public response shapes (normalised — independent of raw CSE field names)
// ---------------------------------------------------------------------------

export interface IndexQuote {
  value: number;
  change: number;
  changePercent: number;
}

export interface MarketStatus {
  status: string; // e.g. "Open", "Closed", "Pre-Open"
  isOpen: boolean;
}

export interface ShareQuote {
  symbol: string; // full CSE symbol, e.g. "JKH.N0000"
  name: string;
  price: number; // last traded price
  change: number;
  changePercent: number;
  volume: number; // share volume
  high: number;
  low: number;
  previousClose: number;
  turnover: number;
}

export interface CompanyInfo {
  id: number; // CSE internal stock id (needed for chart data)
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  previousClose: number;
  marketCap: number;
  beta: number;
  sector?: string;
}

export interface ChartPoint {
  date: string; // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Coerce any of several possible field names into a finite number. */
function num(...values: unknown[]): number {
  for (const v of values) {
    if (v === null || v === undefined) continue;
    const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''));
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

/** Pick the first defined string from candidates. */
function str(...values: unknown[]): string {
  for (const v of values) {
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return '';
}

export interface CSEApiOptions {
  baseUrl?: string;
  timeoutMs?: number;
}

export class CSEApiClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  /** symbol (base, e.g. "JKH") -> full CSE symbol (e.g. "JKH.N0000") */
  private symbolMap: Map<string, string> | null = null;

  constructor(options: CSEApiOptions = {}) {
    this.baseUrl = (options.baseUrl ?? 'https://www.cse.lk/api').replace(/\/$/, '');
    this.timeoutMs = options.timeoutMs ?? 20000;
  }

  /** Low-level POST helper. Throws on network error or non-2xx response. */
  private async post<T = unknown>(endpoint: string, params: Record<string, string | number> = {}): Promise<T> {
    const url = `${this.baseUrl}/${endpoint}`;
    const body = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) body.append(k, String(v));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
          // The CSE API rejects requests without a browser-like UA.
          'User-Agent':
            'Mozilla/5.0 (compatible; cse-predictor-mcp/2.0; +https://github.com/shalinda-j/cse-predictor-mcp)'
        },
        body: body.toString(),
        signal: controller.signal
      });

      if (!res.ok) {
        throw new Error(`CSE API ${endpoint} returned HTTP ${res.status} ${res.statusText}`);
      }
      return (await res.json()) as T;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`CSE API request failed (${endpoint}): ${message}`);
      throw new Error(`Failed to reach CSE API endpoint "${endpoint}": ${message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  // -------------------------------------------------------------------------
  // Indices
  // -------------------------------------------------------------------------

  async getAspi(): Promise<IndexQuote> {
    const raw = await this.post<Record<string, unknown>>('aspiData');
    return this.normaliseIndex(raw);
  }

  async getSnpSl20(): Promise<IndexQuote> {
    const raw = await this.post<Record<string, unknown>>('snpData');
    return this.normaliseIndex(raw);
  }

  private normaliseIndex(raw: Record<string, unknown>): IndexQuote {
    const value = num(raw.value, raw.indexValue, raw.lastValue, raw.price);
    const change = num(raw.change, raw.changeValue);
    let changePercent = num(raw.changePercentage, raw.percentageChange, raw.changePercent);
    if (changePercent === 0 && value !== 0 && change !== 0) {
      changePercent = (change / (value - change)) * 100;
    }
    return { value, change, changePercent };
  }

  // -------------------------------------------------------------------------
  // Market status / summary
  // -------------------------------------------------------------------------

  async getMarketStatus(): Promise<MarketStatus> {
    const raw = await this.post<Record<string, unknown>>('marketStatus');
    const status = str(raw.status, raw.marketStatus, raw.message) || 'Unknown';
    return { status, isOpen: /open/i.test(status) && !/pre/i.test(status) };
  }

  // -------------------------------------------------------------------------
  // Trade summary (all securities) — basis for share prices & screening
  // -------------------------------------------------------------------------

  /** Returns a quote for every traded security on the exchange. */
  async getTradeSummary(): Promise<ShareQuote[]> {
    const raw = await this.post<Record<string, unknown>>('tradeSummary');
    const rows = this.extractArray(raw, ['reqTradeSummery', 'reqTradeSummary', 'tradeSummary']);
    return rows.map((r) => this.normaliseShare(r));
  }

  async getTodaySharePrices(): Promise<ShareQuote[]> {
    const raw = await this.post<unknown>('todaySharePrice');
    const rows = Array.isArray(raw)
      ? (raw as Record<string, unknown>[])
      : this.extractArray(raw as Record<string, unknown>, ['reqTodaySharePrice', 'todaySharePrice']);
    return rows.map((r) => this.normaliseShare(r));
  }

  private normaliseShare(r: Record<string, unknown>): ShareQuote {
    const price = num(r.price, r.lastTradedPrice, r.lastTrade, r.closingPrice);
    const change = num(r.change, r.priceChange);
    let changePercent = num(r.changePercentage, r.percentageChange, r.changePercent);
    const prevClose = num(r.previousClose, r.closingPrice, price - change);
    if (changePercent === 0 && prevClose !== 0 && change !== 0) {
      changePercent = (change / prevClose) * 100;
    }
    return {
      symbol: str(r.symbol, r.code),
      name: str(r.name, r.companyName),
      price,
      change,
      changePercent,
      volume: num(r.sharevolume, r.shareVolume, r.tradevolume, r.quantity, r.volume),
      high: num(r.high, r.hiTrade, r.highTrade),
      low: num(r.low, r.lowTrade),
      previousClose: prevClose,
      turnover: num(r.turnover, r.tradeValue)
    };
  }

  // -------------------------------------------------------------------------
  // Company info
  // -------------------------------------------------------------------------

  /** @param symbol full CSE symbol, e.g. "JKH.N0000" */
  async getCompanyInfo(symbol: string): Promise<CompanyInfo> {
    const raw = await this.post<Record<string, unknown>>('companyInfoSummery', { symbol });
    const info = (raw.reqSymbolInfo ?? raw.symbolInfo ?? raw) as Record<string, unknown>;
    const logo = (raw.reqLogo ?? {}) as Record<string, unknown>;
    const price = num(info.lastTradedPrice, info.price, info.lastTrade);
    const change = num(info.change, info.changeValue);
    const prevClose = num(info.previousClose, info.closingPrice, price - change);
    let changePercent = num(info.changePercentage, info.percentageChange);
    if (changePercent === 0 && prevClose !== 0 && change !== 0) {
      changePercent = (change / prevClose) * 100;
    }
    return {
      id: num(info.id, info.stockId, logo.id),
      symbol: str(info.symbol, symbol),
      name: str(info.name, logo.name, info.companyName),
      price,
      change,
      changePercent,
      high: num(info.hiTrade, info.high, info.hi),
      low: num(info.lowTrade, info.low),
      previousClose: prevClose,
      marketCap: num(info.marketCap, info.marketCapitalization),
      beta: num(info.betaValue, info.beta),
      sector: str(info.sectorName, info.sector) || undefined
    };
  }

  // -------------------------------------------------------------------------
  // Historical / chart data
  // -------------------------------------------------------------------------

  /**
   * Fetch historical OHLC data for a stock by its CSE internal id.
   * @param stockId numeric CSE stock id (from getCompanyInfo().id)
   */
  async getChartData(stockId: number): Promise<ChartPoint[]> {
    const raw = await this.post<Record<string, unknown>>('companyChartDataByStock', {
      stockId,
      period: 1
    });
    const rows = this.extractArray(raw, ['chartData', 'reqChartData', 'data']);
    const points: ChartPoint[] = rows
      .map((p) => {
        const t = num(p.t, p.time, p.timestamp, p.date);
        // Timestamps may be seconds or milliseconds.
        const ms = t > 1e12 ? t : t * 1000;
        const close = num(p.c, p.close, p.price, p.p);
        return {
          date: new Date(ms).toISOString().split('T')[0] ?? '',
          open: num(p.o, p.open, close),
          high: num(p.h, p.high, close),
          low: num(p.l, p.low, close),
          close,
          volume: num(p.q, p.volume, p.quantity, p.v)
        };
      })
      .filter((p) => p.date && p.close > 0)
      .sort((a, b) => a.date.localeCompare(b.date));
    return points;
  }

  // -------------------------------------------------------------------------
  // Symbol resolution
  // -------------------------------------------------------------------------

  /**
   * Resolve a user-supplied ticker (e.g. "JKH") to a full CSE symbol
   * (e.g. "JKH.N0000"). If the input is already a full symbol it is returned
   * as-is. Throws if the symbol cannot be found on the exchange.
   */
  async resolveSymbol(input: string): Promise<string> {
    const candidate = input.trim().toUpperCase();
    if (candidate.includes('.')) return candidate;

    if (!this.symbolMap) await this.buildSymbolMap();
    const resolved = this.symbolMap?.get(candidate);
    if (!resolved) {
      throw new Error(
        `Symbol "${input}" not found on the CSE. Use the full symbol (e.g. "${candidate}.N0000") or check the ticker.`
      );
    }
    return resolved;
  }

  private async buildSymbolMap(): Promise<void> {
    const quotes = await this.getTradeSummary();
    const map = new Map<string, string>();
    for (const q of quotes) {
      if (!q.symbol) continue;
      const base = q.symbol.split('.')[0]?.toUpperCase();
      // Prefer the ".N0000" (voting/ordinary) class when multiple exist.
      if (base && (!map.has(base) || q.symbol.includes('.N0000'))) {
        map.set(base, q.symbol);
      }
    }
    this.symbolMap = map;
    logger.info(`Built CSE symbol map with ${map.size} tickers`);
  }

  // -------------------------------------------------------------------------

  private extractArray(raw: Record<string, unknown>, keys: string[]): Record<string, unknown>[] {
    for (const key of keys) {
      const v = raw[key];
      if (Array.isArray(v)) return v as Record<string, unknown>[];
    }
    // Some endpoints return the array directly.
    if (Array.isArray(raw)) return raw as unknown as Record<string, unknown>[];
    return [];
  }
}
