import puppeteer from 'puppeteer';
import { logger } from '../utils/logger.js';

export interface LiveMarketData {
  asi: { value: number; change: number; changePercent: number };
  spx: { value: number; change: number; changePercent: number };
  turnover: number;
  volume: number;
  trades: number;
  timestamp: string;
  dataSource: string;
}

export interface LiveCompanyData {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  timestamp: string;
  dataSource: string;
}

const CSE_URL = 'https://www.cse.lk';

export class LiveDataFetcher {
  private browser: puppeteer.Browser | null = null;

  async init(): Promise<void> {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
      });
      logger.info('Browser launched for live data fetching');
    }
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      logger.info('Browser closed');
    }
  }

  async fetchMarketData(): Promise<LiveMarketData | null> {
    await this.init();
    if (!this.browser) return null;

    const page = await this.browser.newPage();
    try {
      logger.info('Fetching REAL market data from cse.lk');
      await page.goto(CSE_URL, { waitUntil: 'networkidle0', timeout: 30000 });
      await page.waitForSelector('body', { timeout: 10000 });

      // Parse lines to extract real data
      const data = await page.evaluate(() => {
        const lines = document.body.innerText.split('\n');
        const cleanLines = lines.map(l => l.trim()).filter(l => l.length > 0);
        
        // Find ASPI line and next 3 lines (value, change, percent)
        const asiIdx = cleanLines.findIndex(l => l === 'ASPI');
        const spxIdx = cleanLines.findIndex(l => l === 'S&P SL20');
        const volumeIdx = cleanLines.findIndex(l => l === 'Share Volume');
        const tradesIdx = cleanLines.findIndex(l => l === 'Number of Trades');
        const turnoverIdx = cleanLines.findIndex(l => l === 'Turnover');
        
        const parse = (s: string): number => {
          if (!s) return 0;
          const cleaned = s.replace(/,/g, '').replace(/%/g, '').replace(/\+/g, '');
          return parseFloat(cleaned) || 0;
        };
        
        return {
          asi: asiIdx >= 0 ? parse(cleanLines[asiIdx + 1] || '0') : 0,
          asiChange: asiIdx >= 0 ? parse(cleanLines[asiIdx + 2] || '0') : 0,
          asiPct: asiIdx >= 0 ? parse(cleanLines[asiIdx + 3] || '0') : 0,
          spx: spxIdx >= 0 ? parse(cleanLines[spxIdx + 1] || '0') : 0,
          spxChange: spxIdx >= 0 ? parse(cleanLines[spxIdx + 2] || '0') : 0,
          spxPct: spxIdx >= 0 ? parse(cleanLines[spxIdx + 3] || '0') : 0,
          volume: volumeIdx >= 0 ? parse(cleanLines[volumeIdx + 1] || '0') : 0,
          trades: tradesIdx >= 0 ? parse(cleanLines[tradesIdx + 1] || '0') : 0,
          turnover: turnoverIdx >= 0 ? parse(cleanLines[turnoverIdx + 1] || '0') : 0
        };
      });

      await page.close();
      
      logger.info('REAL DATA FETCHED: ASPI=' + data.asi + ', S&P SL20=' + data.spx + ', Turnover=' + data.turnover);

      return {
        asi: {
          value: data.asi,
          change: data.asiChange,
          changePercent: data.asiPct
        },
        spx: {
          value: data.spx,
          change: data.spxChange,
          changePercent: data.spxPct
        },
        turnover: data.turnover,
        volume: data.volume,
        trades: data.trades,
        timestamp: new Date().toISOString(),
        dataSource: 'cse.lk (REAL)'
      };
    } catch (error) {
      logger.error('Failed to fetch market data: ' + (error as Error).message);
      await page.close();
      return null;
    }
  }

  async fetchCompanyData(symbol: string): Promise<LiveCompanyData | null> {
    await this.init();
    if (!this.browser) return null;

    const page = await this.browser.newPage();
    try {
      logger.info('Attempting to fetch company data for: ' + symbol);
      
      // CSE doesn't have individual company pages, try to find in announcements
      await page.goto(CSE_URL, { waitUntil: 'networkidle0', timeout: 30000 });
      
      const data = await page.evaluate((sym: string) => {
        const text = document.body.innerText;
        // Look for company in Corporate Disclosures section
        const lines = text.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line.includes(sym.toUpperCase()) || line.includes(sym.toUpperCase() + ' PLC')) {
            // Found company name, return it
            return {
              found: true,
              name: line.trim(),
              context: lines.slice(i, i + 5).join(' | ')
            };
          }
        }
        return { found: false, name: sym, context: '' };
      }, symbol);
      
      await page.close();

      // Note: CSE website doesn't provide live individual stock prices
      // Only index data (ASPI, S&P SL20) is available on the home page
      logger.warn('CSE website does not provide individual stock prices. Only indices available.');
      
      // Return with indication that individual prices not available
      return {
        symbol: symbol.toUpperCase(),
        name: data.found ? data.name : symbol.toUpperCase() + ' PLC',
        price: 0, // Not available on CSE website
        change: 0,
        changePercent: 0,
        volume: 0,
        timestamp: new Date().toISOString(),
        dataSource: 'cse.lk (company pages not available - use simulated or external API)'
      };
    } catch (error) {
      logger.error('Failed to fetch company ' + symbol + ': ' + (error as Error).message);
      await page.close();
      return null;
    }
  }

  async fetchAllCompanies(): Promise<LiveCompanyData[]> {
    await this.init();
    if (!this.browser) return [];

    const page = await this.browser.newPage();
    try {
      logger.info('Fetching company list from Corporate Disclosures');
      await page.goto(CSE_URL, { waitUntil: 'networkidle0', timeout: 30000 });
      
      // Extract company names from Corporate Disclosures section
      const companies = await page.evaluate(() => {
        const text = document.body.innerText;
        const lines = text.split('\n');
        const companyNames: string[] = [];
        
        // Look for PLC company names
        for (const line of lines) {
          const match = line.match(/([A-Z][A-Z ]+) PLC/);
          if (match) {
            companyNames.push(match[1].trim());
          }
        }
        return companyNames.slice(0, 20);
      });
      
      await page.close();
      
      logger.info('Found ' + companies.length + ' company names in disclosures');
      
      // Return company names with note that prices not available
      return companies.map(name => ({
        symbol: name.split(' ')[0] || name,
        name: name + ' PLC',
        price: 0,
        change: 0,
        changePercent: 0,
        volume: 0,
        timestamp: new Date().toISOString(),
        dataSource: 'cse.lk (names only - no prices)'
      }));
    } catch (error) {
      logger.error('Failed to fetch company list: ' + (error as Error).message);
      await page.close();
      return [];
    }
  }
}