import { describe, it, expect, vi, afterEach } from 'vitest';
import { CSEApiClient } from '../src/tools/cse-api.js';

/**
 * These tests mock the HTTP layer with payloads shaped like the real CSE API
 * responses, verifying that the client normalises them correctly. They run
 * offline (no network access required).
 */

function mockFetch(routes: Record<string, unknown>) {
  return vi.fn(async (url: string) => {
    const endpoint = url.split('/').pop() as string;
    const data = routes[endpoint];
    if (data === undefined) {
      return { ok: false, status: 404, statusText: 'Not Found', json: async () => ({}) } as Response;
    }
    return { ok: true, status: 200, statusText: 'OK', json: async () => data } as Response;
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CSEApiClient', () => {
  it('normalises index data', async () => {
    vi.stubGlobal('fetch', mockFetch({ aspiData: { value: 19826.57, change: 21.77, changePercentage: 0.11 } }));
    const client = new CSEApiClient();
    const aspi = await client.getAspi();
    expect(aspi.value).toBeCloseTo(19826.57);
    expect(aspi.change).toBeCloseTo(21.77);
    expect(aspi.changePercent).toBeCloseTo(0.11);
  });

  it('derives change percent when not provided', async () => {
    vi.stubGlobal('fetch', mockFetch({ snpData: { value: 102, change: 2 } }));
    const client = new CSEApiClient();
    const snp = await client.getSnpSl20();
    expect(snp.changePercent).toBeCloseTo(2); // 2 / (102 - 2) * 100
  });

  it('parses the trade summary into share quotes', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({
        tradeSummary: {
          reqTradeSummery: [
            { symbol: 'JKH.N0000', name: 'JOHN KEELLS HOLDINGS PLC', price: 200, change: 4, percentageChange: 2, sharevolume: 1000, high: 205, low: 198, turnover: 200000 }
          ]
        }
      })
    );
    const client = new CSEApiClient();
    const quotes = await client.getTradeSummary();
    expect(quotes).toHaveLength(1);
    expect(quotes[0]).toMatchObject({ symbol: 'JKH.N0000', price: 200, volume: 1000, high: 205, turnover: 200000 });
  });

  it('resolves a base ticker to a full CSE symbol', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({
        tradeSummary: {
          reqTradeSummery: [
            { symbol: 'JKH.N0000', name: 'JOHN KEELLS', price: 200 },
            { symbol: 'COMB.N0000', name: 'COMMERCIAL BANK', price: 100 },
            { symbol: 'COMB.X0000', name: 'COMMERCIAL BANK (NV)', price: 90 }
          ]
        }
      })
    );
    const client = new CSEApiClient();
    expect(await client.resolveSymbol('jkh')).toBe('JKH.N0000');
    expect(await client.resolveSymbol('COMB')).toBe('COMB.N0000'); // prefers .N0000 class
    expect(await client.resolveSymbol('ALREADY.N0000')).toBe('ALREADY.N0000');
  });

  it('throws for an unknown ticker', async () => {
    vi.stubGlobal('fetch', mockFetch({ tradeSummary: { reqTradeSummery: [{ symbol: 'JKH.N0000', price: 1 }] } }));
    const client = new CSEApiClient();
    await expect(client.resolveSymbol('NOPE')).rejects.toThrow(/not found/i);
  });

  it('normalises company info including the stock id', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({
        companyInfoSummery: {
          reqSymbolInfo: { id: 123, symbol: 'JKH.N0000', name: 'JOHN KEELLS HOLDINGS PLC', lastTradedPrice: 200, change: 4, changePercentage: 2, hiTrade: 205, lowTrade: 198, previousClose: 196, marketCap: 1000000, betaValue: 1.1 },
          reqLogo: { id: 123, path: 'x.png' }
        }
      })
    );
    const client = new CSEApiClient();
    const info = await client.getCompanyInfo('JKH.N0000');
    expect(info).toMatchObject({ id: 123, symbol: 'JKH.N0000', price: 200, previousClose: 196, marketCap: 1000000 });
  });

  it('parses chart data into sorted OHLC points', async () => {
    const day = 86400;
    const t0 = 1_700_000_000;
    vi.stubGlobal(
      'fetch',
      mockFetch({
        companyChartDataByStock: {
          chartData: [
            { t: t0 + day, o: 11, h: 12, l: 10, c: 11.5, q: 500 },
            { t: t0, o: 10, h: 11, l: 9, c: 10.5, q: 400 }
          ]
        }
      })
    );
    const client = new CSEApiClient();
    const points = await client.getChartData(123);
    expect(points).toHaveLength(2);
    expect(points[0].close).toBe(10.5); // sorted ascending by date
    expect(points[1].close).toBe(11.5);
    expect(points[0].date < points[1].date).toBe(true);
  });

  it('throws a clear error on HTTP failure', async () => {
    vi.stubGlobal('fetch', mockFetch({})); // every endpoint 404s
    const client = new CSEApiClient();
    await expect(client.getAspi()).rejects.toThrow(/CSE API/i);
  });
});
