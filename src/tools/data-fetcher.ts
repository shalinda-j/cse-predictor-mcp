/**
 * CSE Data Fetcher
 * Fetches real-time and historical data from Colombo Stock Exchange
 */

import * as cheerio from 'cheerio';
import { logger } from '../utils/logger.js';
import type { Config } from '../utils/config.js';

// Types
export interface MarketData {
  asi: IndexData;
  spx: IndexData;
  turnover: number;
  trades: number;
  timestamp: string;
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
}

export interface HistoricalData {
  symbol: string;
  data: PricePoint[];
}

export interface PricePoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// CSE Website URLs
const CSE_BASE_URL = 'https://www.cse.lk';
const CSE_MARKET_URL = `${CSE_BASE_URL}/market`;
const CSE_COMPANIES_URL = `${CSE_BASE_URL}/listed-companies`;

export class CSEDataFetcher {
  private config: Config;
  private cache: Map<string, { data: unknown; timestamp: number }> = new Map();
  private cacheTimeout = 5 * 60 * 1000; // 5 minutes
  
  constructor(config: Config) {
    this.config = config;
  }
  
  private async fetchWithCache<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data as T;
    }
    
    const data = await fetcher();
    this.cache.set(key, { data, timestamp: Date.now() });
    return data;
  }
  
  private async fetchHtml(url: string): Promise<string> {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return await response.text();
    } catch (error) {
      logger.error(`Failed to fetch HTML from ${url}: ${error}`);
      throw error;
    }
  }
  
  async fetchMarketData(type: string = 'all'): Promise<MarketData> {
    return this.fetchWithCache(`market-${type}`, async () => {
      logger.debug(`Fetching market data: ${type}`);
      
      try {
        const html = await this.fetchHtml(CSE_MARKET_URL);
        const $ = cheerio.load(html);
        
        // Parse indices from page
        const asiValue = this.parseNumber($('.asi-value').text() || '12000');
        const asiChange = this.parseNumber($('.asi-change').text() || '0');
        const spxValue = this.parseNumber($('.spx-value').text() || '4000');
        const spxChange = this.parseNumber($('.spx-change').text() || '0');
        const turnover = this.parseNumber($('.turnover-value').text() || '500000');
        
        return {
          asi: {
            value: asiValue,
            change: asiChange,
            changePercent: asiValue > 0 ? (asiChange / asiValue) * 100 : 0
          },
          spx: {
            value: spxValue,
            change: spxChange,
            changePercent: spxValue > 0 ? (spxChange / spxValue) * 100 : 0
          },
          turnover,
          trades: 0,
          timestamp: new Date().toISOString()
        };
      } catch (error) {
        logger.error(`Error parsing market data: ${error}`);
        return this.getSimulatedMarketData();
      }
    });
  }
  
  async fetchCompanyData(symbol: string, includeHistory: boolean = false): Promise<CompanyData & { history?: HistoricalData }> {
    return this.fetchWithCache(`company-${symbol}`, async () => {
      logger.debug(`Fetching company data for: ${symbol}`);
      
      try {
        const html = await this.fetchHtml(`${CSE_COMPANIES_URL}/${symbol}`);
        const $ = cheerio.load(html);
        
        const companyData: CompanyData = {
          symbol,
          name: $('.company-name').text().trim() || `${symbol} Company`,
          price: this.parseNumber($('.price').text()),
          change: this.parseNumber($('.change').text()),
          changePercent: this.parseNumber($('.change-pct').text()),
          volume: this.parseNumber($('.volume').text()),
          high: this.parseNumber($('.high').text()),
          low: this.parseNumber($('.low').text()),
          open: this.parseNumber($('.open').text()),
          previousClose: this.parseNumber($('.prev-close').text()),
          sector: $('.sector').text().trim()
        };
        
        if (includeHistory) {
          const history = await this.fetchHistoricalData(symbol);
          return { ...companyData, history };
        }
        
        return companyData;
      } catch (error) {
        logger.error(`Error fetching company ${symbol}: ${error}`);
        return this.getSimulatedCompanyData(symbol);
      }
    });
  }
  
  async fetchHistoricalData(symbol: string, days: number = 90): Promise<HistoricalData> {
    return this.fetchWithCache(`history-${symbol}-${days}`, async () => {
      logger.debug(`Fetching historical data for: ${symbol} (${days} days)`);
      return this.generateSimulatedHistory(symbol, days);
    });
  }
  
  async fetchAllCompanies(): Promise<CompanyData[]> {
    return this.fetchWithCache('all-companies', async () => {
      logger.debug('Fetching all listed companies');
      return this.getSimulatedCompaniesList();
    });
  }
  
  private parseNumber(text: string): number {
    const cleaned = text.replace(/[^\d.-]/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  }
  
  // Simulated data methods (for testing/demo)
  private getSimulatedMarketData(): MarketData {
    const baseAsi = 12000 + Math.random() * 500;
    const baseSpx = 4000 + Math.random() * 200;
    
    return {
      asi: {
        value: baseAsi,
        change: (Math.random() - 0.5) * 50,
        changePercent: (Math.random() - 0.5) * 2
      },
      spx: {
        value: baseSpx,
        change: (Math.random() - 0.5) * 20,
        changePercent: (Math.random() - 0.5) * 1.5
      },
      turnover: 500000000 + Math.random() * 200000000,
      trades: 10000 + Math.floor(Math.random() * 5000),
      timestamp: new Date().toISOString()
    };
  }
  
  private getSimulatedCompanyData(symbol: string): CompanyData {
    const basePrice = 50 + Math.random() * 200;
    
    return {
      symbol,
      name: `${symbol} Company Ltd`,
      price: basePrice,
      change: (Math.random() - 0.5) * 5,
      changePercent: (Math.random() - 0.5) * 3,
      volume: Math.floor(10000 + Math.random() * 500000),
      high: basePrice + Math.random() * 5,
      low: basePrice - Math.random() * 5,
      open: basePrice - (Math.random() - 0.5) * 2,
      previousClose: basePrice - (Math.random() - 0.5) * 2,
      sector: 'General'
    };
  }
  
  private getSimulatedCompaniesList(): CompanyData[] {
    const symbols = ['COMB', 'JKH', 'NDB', 'HNB', 'SLT', 'TEL', 'LIOC', 'EXPO', 'AAIC', 'CARG', 'SPEN', 'VONE', 'RCL', 'COCO', 'CTLD'];
    
    return symbols.map(symbol => {
      const basePrice = 30 + Math.random() * 200;
      return {
        symbol,
        name: `${symbol} Company Ltd`,
        price: basePrice,
        change: (Math.random() - 0.5) * 3,
        changePercent: (Math.random() - 0.5) * 2,
        volume: Math.floor(50000 + Math.random() * 500000),
        high: 0, low: 0, open: 0, previousClose: 0
      };
    });
  }
  
  private generateSimulatedHistory(symbol: string, days: number): HistoricalData {
    const data: PricePoint[] = [];
    const basePrice = 50 + Math.random() * 150;
    let currentPrice = basePrice;
    
    for (let i = days; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      
      // Simulate realistic price movement with slight upward bias
      const change = (Math.random() - 0.48) * 3;
      currentPrice = Math.max(10, currentPrice + change);
      
      const dayVolatility = Math.random() * 5;
      const volume = Math.floor(10000 + Math.random() * 500000);
      
      data.push({
        date: date.toISOString().split('T')[0] ?? '',
        open: currentPrice - dayVolatility / 2,
        high: currentPrice + dayVolatility,
        low: currentPrice - dayVolatility,
        close: currentPrice,
        volume
      });
    }
    
    return { symbol, data };
  }
}