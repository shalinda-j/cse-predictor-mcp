#!/usr/bin/env node
/**
 * Live verification script.
 *
 * Hits the real Colombo Stock Exchange API and checks that every endpoint the
 * server depends on is reachable AND parses into usable values. Prints a
 * PASS/FAIL report and exits non-zero if any critical check fails.
 *
 * Run it from a machine/network that can reach https://www.cse.lk :
 *
 *     npm run verify
 *
 * This is the definitive "does it actually work on real data?" check.
 */

import { config } from './utils/config.js';
import { CSEApiClient } from './tools/cse-api.js';
import { CSEDataFetcher } from './tools/data-fetcher.js';

const api = new CSEApiClient({ baseUrl: config.cseApiUrl, timeoutMs: config.requestTimeoutMs });

let passed = 0;
let failed = 0;
const failures: string[] = [];

async function check(name: string, fn: () => Promise<string>, critical = true): Promise<void> {
  try {
    const detail = await fn();
    passed++;
    console.log(`  ✓ ${name} — ${detail}`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (critical) {
      failed++;
      failures.push(`${name}: ${msg}`);
      console.log(`  ✗ ${name} — ${msg}`);
    } else {
      console.log(`  ⚠ ${name} (non-critical) — ${msg}`);
    }
  }
}

function need(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

async function main(): Promise<void> {
  console.log(`\nVerifying live CSE data via ${config.cseApiUrl}\n`);

  await check('marketStatus', async () => {
    const s = await api.getMarketStatus();
    return `status="${s.status}"`;
  }, false);

  await check('aspiData (ASPI index)', async () => {
    const a = await api.getAspi();
    need(a.value > 0, 'ASPI value was 0 / unparsed');
    return `value=${a.value} change=${a.change} (${a.changePercent.toFixed(2)}%)`;
  });

  await check('snpData (S&P SL20 index)', async () => {
    const s = await api.getSnpSl20();
    need(s.value > 0, 'S&P SL20 value was 0 / unparsed');
    return `value=${s.value} change=${s.change}`;
  });

  // Trade summary drives screening + symbol resolution.
  let sampleFullSymbol = '';
  await check('tradeSummary (all securities)', async () => {
    const rows = await api.getTradeSummary();
    need(rows.length > 0, 'trade summary returned 0 securities (market may be closed)');
    const withSymbol = rows.find((r) => r.symbol);
    need(!!withSymbol, 'no securities had a parseable symbol field');
    sampleFullSymbol = withSymbol!.symbol;
    return `${rows.length} securities, e.g. ${sampleFullSymbol} @ ${withSymbol!.price}`;
  });

  // Symbol resolution (ticker -> full symbol).
  await check('resolveSymbol', async () => {
    const base = (sampleFullSymbol.split('.')[0] || 'JKH');
    const full = await api.resolveSymbol(base);
    need(full.includes('.'), `resolved "${base}" to "${full}" which is not a full symbol`);
    return `${base} -> ${full}`;
  });

  // Company info (price, market cap, sector).
  await check('companyInfoSummery', async () => {
    const sym = sampleFullSymbol || (await api.resolveSymbol('JKH'));
    const info = await api.getCompanyInfo(sym);
    need(info.price > 0, `no price for ${sym} (market may be closed)`);
    return `${info.symbol} price=${info.price} id=${info.id} marketCap=${info.marketCap}`;
  });

  // Historical OHLC (drives all technical analysis).
  await check('companyChartDataByStock (history)', async () => {
    const sym = sampleFullSymbol || (await api.resolveSymbol('JKH'));
    const stockId = await api.getStockId(sym);
    need(stockId > 0, `no stock id resolved for ${sym}`);
    const points = await api.getChartData(stockId);
    need(
      points.length >= CSEDataFetcher.MIN_HISTORY_POINTS,
      `only ${points.length} history points (need >= ${CSEDataFetcher.MIN_HISTORY_POINTS})`
    );
    const last = points[points.length - 1]!;
    return `${points.length} OHLC points, latest ${last.date} close=${last.close}`;
  });

  console.log(`\nResult: ${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    console.log('\nFAILED — the server cannot fully work on real data right now:');
    for (const f of failures) console.log(`  - ${f}`);
    console.log('\nIf endpoints are reachable but values are 0/empty, the CSE market may be');
    console.log('closed, or a field name changed (see src/tools/cse-api.ts).');
    process.exit(1);
  }
  console.log('\nPASS — the server is serving REAL CSE data end to end. ✅');
  process.exit(0);
}

main().catch((error) => {
  console.error('Verification crashed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
