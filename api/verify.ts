// Live verification endpoint (GET).
//
// Runs the same end-to-end checks as `npm run verify`, but server-side —
// useful because the deployed function has direct internet access to cse.lk.
// Returns a JSON PASS/FAIL report with real sample values.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { config } from '../src/utils/config.js';
import { CSEApiClient } from '../src/tools/cse-api.js';
import { CSEDataFetcher } from '../src/tools/data-fetcher.js';

interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const api = new CSEApiClient({ baseUrl: config.cseApiUrl, timeoutMs: 15000 });
  const checks: CheckResult[] = [];

  const run = async (name: string, fn: () => Promise<string>) => {
    try {
      checks.push({ name, ok: true, detail: await fn() });
    } catch (e) {
      checks.push({ name, ok: false, detail: e instanceof Error ? e.message : String(e) });
    }
  };

  await run('marketStatus', async () => {
    const s = await api.getMarketStatus();
    return `status="${s.status}"`;
  });

  await run('aspiData', async () => {
    const a = await api.getAspi();
    if (a.value <= 0) throw new Error('ASPI value was 0 / unparsed');
    return `value=${a.value} change=${a.change} (${a.changePercent.toFixed(2)}%)`;
  });

  await run('snpData', async () => {
    const s = await api.getSnpSl20();
    if (s.value <= 0) throw new Error('S&P SL20 value was 0 / unparsed');
    return `value=${s.value} change=${s.change}`;
  });

  let sampleSymbol = '';
  await run('tradeSummary', async () => {
    const rows = await api.getTradeSummary();
    if (rows.length === 0) throw new Error('0 securities returned');
    const withSymbol = rows.find((r) => r.symbol && r.price > 0) ?? rows.find((r) => r.symbol);
    if (!withSymbol) throw new Error('no parseable symbols');
    sampleSymbol = withSymbol.symbol;
    return `${rows.length} securities, e.g. ${sampleSymbol} price=${withSymbol.price} vol=${withSymbol.volume}`;
  });

  await run('resolveSymbol', async () => {
    const base = sampleSymbol.split('.')[0] || 'JKH';
    const full = await api.resolveSymbol(base);
    return `${base} -> ${full}`;
  });

  await run('companyInfoSummery', async () => {
    const sym = sampleSymbol || (await api.resolveSymbol('JKH'));
    const info = await api.getCompanyInfo(sym);
    return `${info.symbol} price=${info.price} id=${info.id} marketCap=${info.marketCap}`;
  });

  await run('companyChartDataByStock', async () => {
    const sym = sampleSymbol || (await api.resolveSymbol('JKH'));
    const stockId = await api.getStockId(sym);
    const points = await api.getChartData(stockId);
    if (points.length < CSEDataFetcher.MIN_HISTORY_POINTS) {
      throw new Error(`only ${points.length} history points (need >= ${CSEDataFetcher.MIN_HISTORY_POINTS})`);
    }
    const last = points[points.length - 1]!;
    return `${points.length} OHLC points, latest ${last.date} close=${last.close}`;
  });

  const pass = checks.every((c) => c.ok);
  res.status(200).json({
    pass,
    verdict: pass
      ? 'PASS — the server is serving REAL CSE data end to end.'
      : 'FAIL — one or more live CSE checks failed (see checks).',
    timestamp: new Date().toISOString(),
    dataSource: config.cseApiUrl,
    checks
  });
}
