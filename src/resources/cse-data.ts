/**
 * CSE Data Resource Manager
 *
 * Provides MCP resources for CSE market data. All values come from the live
 * CSE API via the shared data fetcher — there is no simulated data.
 */

import { logger } from '../utils/logger.js';
import type { CSEDataFetcher } from '../tools/data-fetcher.js';

export interface MarketOverview {
  status: string;
  asi: { value: number; change: number; changePercent: number };
  spx: { value: number; change: number; changePercent: number };
  turnover: number;
  tradedSecurities: number;
  lastUpdate: string;
  dataSource: string;
}

export interface ListedCompany {
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
}

export class CSEDataManager {
  private fetcher: CSEDataFetcher;

  constructor(fetcher: CSEDataFetcher) {
    this.fetcher = fetcher;
  }

  async getMarketOverview(): Promise<MarketOverview> {
    logger.debug('Getting market overview resource (live)');
    const data = await this.fetcher.fetchMarketData();
    return {
      status: data.status,
      asi: { value: data.asi.value, change: data.asi.change, changePercent: data.asi.changePercent },
      spx: { value: data.spx.value, change: data.spx.change, changePercent: data.spx.changePercent },
      turnover: data.turnover,
      tradedSecurities: data.trades,
      lastUpdate: data.timestamp,
      dataSource: data.dataSource
    };
  }

  async getListedCompanies(): Promise<ListedCompany[]> {
    logger.debug('Getting listed companies resource (live)');
    const companies = await this.fetcher.fetchAllCompanies();
    return companies.map((c) => ({
      symbol: c.symbol,
      name: c.name,
      price: c.price,
      changePercent: c.changePercent
    }));
  }
}
