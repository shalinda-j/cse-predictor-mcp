import puppeteer from 'puppeteer';
import { logger } from '../utils/logger.js';

export interface LiveMarketData {
  asi: { value: number; change: number; changePercent: number };
  spx: { value: number; change: number; changePercent: number };
  turnover: number;
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
  high: number;
  low: number;
  open: number;
  previousClose: number;
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
      logger.debug('Navigating to CSE market page');
      await page.goto(CSE_URL, { waitUntil: 'networkidle0', timeout: 30000 });
      await page.waitForSelector('body', { timeout: 10000 });

      // Extract market data from page
      const data = await page.evaluate(() => {
        const allText = document.body.innerText;
        
        // Parse ASPI value
        const asiMatch = allText.match(/ASPI[^0-9]*([0-9,]+\.?[0-9]*)/);
        const asiChangeMatch = allText.match(/ASPI[^0-9]*[0-9,]+\.?[0-9]*[^0-9+-]*([+-]?[0-9,]+\.?[0-9]*)/);
        
        // Parse S&P SL20 value
        const spxMatch = allText.match(/S&P SL20[^0-9]*([0-9,]+\.?[0-9]*)/);
        const spxChangeMatch = allText.match(/S&P SL20[^0-9]*[0-9,]+\.?[0-9]*[^0-9+-]*([+-]?[0-9,]+\.?[0-9]*)/);
        
        // Parse Turnover
        const turnoverMatch = allText.match(/Turnover[^0-9]*([0-9,]+\.?[0-9]*)/);

        const parseNum = (s: string | undefined): number => {
          if (!s) return 0;
          const cleaned = s.replace(/,/g, '').replace(/\+/g, '');
          return parseFloat(cleaned) || 0;
        };

        return {
          asi: parseNum(asiMatch?.[1]),
          asiChange: parseNum(asiChangeMatch?.[1]),
          spx: parseNum(spxMatch?.[1]),
          spxChange: parseNum(spxChangeMatch?.[1]),
          turnover: parseNum(turnoverMatch?.[1])
        };
      });

      await page.close();
      logger.info('Fetched live market data: ASPI=' + data.asi + ', S&P SL20=' + data.spx);

      return {
        asi: {
          value: data.asi,
          change: data.asiChange,
          changePercent: data.asi > 0 ? (data.asiChange / data.asi) * 100 : 0
        },
        spx: {
          value: data.spx,
          change: data.spxChange,
          changePercent: data.spx > 0 ? (data.spxChange / data.spx) * 100 : 0
        },
        turnover: data.turnover,
        timestamp: new Date().toISOString(),
        dataSource: 'cse.lk_live'
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
      const url = CSE_URL + '/listed-companies/' + symbol.toUpperCase();
      logger.debug('Navigating to: ' + url);
      
      await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
      await page.waitForSelector('body', { timeout: 10000 });

      const data = await page.evaluate(() => {
        const allText = document.body.innerText;
        
        // Try to find price data
        const priceMatch = allText.match(/Last Traded Price[^0-9]*([0-9,]+\.?[0-9]*)/);
        const changeMatch = allText.match(/Change[^0-9]*([+-]?[0-9,]+\.?[0-9]*)/);
        const volumeMatch = allText.match(/Volume[^0-9]*([0-9,]+)/);
        
        // Find company name
        const nameEl = document.querySelector('h1') || document.querySelector('.company-name');
        const name = nameEl?.textContent?.trim() || '';

        const parseNum = (s: string | undefined): number => {
          if (!s) return 0;
          return parseFloat(s.replace(/,/g, '').replace(/\+/g, '')) || 0;
        };

        return {
          name,
          price: parseNum(priceMatch?.[1]),
          change: parseNum(changeMatch?.[1]),
          volume: parseNum(volumeMatch?.[1])
        };
      });

      await page.close();

      if (data.price === 0) {
        logger.warn('No price found for ' + symbol);
        return null;
      }

      logger.info('Fetched live data for ' + symbol + ': Rs. ' + data.price);

      return {
        symbol: symbol.toUpperCase(),
        name: data.name || symbol + ' Ltd',
        price: data.price,
        change: data.change,
        changePercent: data.price > 0 ? (data.change / data.price) * 100 : 0,
        volume: data.volume,
        high: 0,
        low: 0,
        open: 0,
        previousClose: data.price - data.change,
        timestamp: new Date().toISOString(),
        dataSource: 'cse.lk_live'
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
      logger.debug('Fetching company list from CSE');
      await page.goto(CSE_URL + '/listed-companies', { waitUntil: 'networkidle0', timeout: 30000 });
      await page.waitForSelector('body', { timeout: 10000 });

      // Extract company symbols from the list
      const symbols = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a[href*="/listed-companies/"]'));
        return links
          .map(a => {
            const href = a.getAttribute('href') || '';
            const match = href.match(/listed-companies\/([A-Z0-9]+)/);
            return match?.[1] || '';
          })
          .filter(s => s.length > 0 && s.length <= 5);
      });

      await page.close();
      logger.info('Found ' + symbols.length + ' company symbols');

      // Fetch each company's data (with rate limiting)
      const results: LiveCompanyData[] = [];
      for (const symbol of symbols.slice(0, 15)) { // Limit to 15 for performance
        const data = await this.fetchCompanyData(symbol);
        if (data) {
          results.push(data);
        }
        await new Promise(r => setTimeout(r, 1000)); // Rate limit 1s
      }

      return results;
    } catch (error) {
      logger.error('Failed to fetch company list: ' + (error as Error).message);
      await page.close();
      return [];
    }
  }

  getSupportedSymbols(): string[] {
    return ['COMB', 'JKH', 'NDB', 'HNB', 'SLT', 'TEL', 'LIOC', 'EXPO', 'AAIC', 'CARG', 'SPEN', 'VONE', 'RCL', 'COCO', 'CTLD'];
  }
}