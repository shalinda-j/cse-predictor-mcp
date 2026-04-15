/**
 * CSE Data Resource Manager
 * Provides MCP resources for CSE market data
 */

import type { Config } from '../utils/config.js';
import { logger } from '../utils/logger.js';

export interface MarketOverview {
  status: 'open' | 'closed' | 'pre-market' | 'post-market';
  asi: { value: number; change: number };
  spx: { value: number; change: number };
  turnover: number;
  lastUpdate: string;
}

export interface ListedCompany {
  symbol: string;
  name: string;
  sector: string;
  marketCap?: number;
}

export class CSEDataManager {
  private dataPath: string;
  
  constructor(dataPath: string) {
    this.dataPath = dataPath;
  }
  
  async getMarketOverview(): Promise<MarketOverview> {
    logger.debug('Getting market overview resource');
    
    // Determine market status based on current time (Sri Lanka time)
    const now = new Date();
    const hours = now.getHours();
    const status: 'open' | 'closed' | 'pre-market' | 'post-market' = 
      hours >= 9 && hours < 15 ? 'open' :
      hours >= 8 && hours < 9 ? 'pre-market' :
      hours >= 15 && hours < 16 ? 'post-market' : 'closed';
    
    // Simulated market data
    const asiValue = 12000 + Math.random() * 500;
    const spxValue = 4000 + Math.random() * 200;
    
    return {
      status,
      asi: {
        value: asiValue,
        change: (Math.random() - 0.5) * 50
      },
      spx: {
        value: spxValue,
        change: (Math.random() - 0.5) * 20
      },
      turnover: 500000000 + Math.random() * 200000000,
      lastUpdate: now.toISOString()
    };
  }
  
  async getListedCompanies(): Promise<ListedCompany[]> {
    logger.debug('Getting listed companies resource');
    
    // Major CSE listed companies
    return [
      { symbol: 'COMB', name: 'Commercial Bank of Ceylon PLC', sector: 'Banking' },
      { symbol: 'JKH', name: 'John Keells Holdings PLC', sector: 'Diversified' },
      { symbol: 'NDB', name: 'NDB Bank PLC', sector: 'Banking' },
      { symbol: 'HNB', name: 'Hatton National Bank PLC', sector: 'Banking' },
      { symbol: 'SLT', name: 'Sri Lanka Telecom PLC', sector: 'Telecommunication' },
      { symbol: 'TEL', name: 'Telecom Lanka Ltd', sector: 'Telecommunication' },
      { symbol: 'LIOC', name: 'Lanka IOC PLC', sector: 'Energy' },
      { symbol: 'EXPO', name: 'Expolanka Holdings PLC', sector: 'Diversified' },
      { symbol: 'AAIC', name: 'Asian Alliance Insurance PLC', sector: 'Insurance' },
      { symbol: 'CARG', name: 'Cargills (Ceylon) PLC', sector: 'Food & Beverage' },
      { symbol: 'SPEN', name: 'Softlogic Holdings PLC', sector: 'Diversified' },
      { symbol: 'VONE', name: 'Vallibel One PLC', sector: 'Diversified' },
      { symbol: 'RCL', name: 'Royal Ceramics Lanka PLC', sector: 'Manufacturing' },
      { symbol: 'COCO', name: 'Coco Lanka PLC', sector: 'Manufacturing' },
      { symbol: 'CTLD', name: 'Citilink Cargo Ltd', sector: 'Logistics' }
    ];
  }
}