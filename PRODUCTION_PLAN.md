# Production Roadmap & Status

## Status

| Area | State |
|------|-------|
| Live market data (indices, turnover, status) | ✅ Done — `cse.lk/api` |
| Live company quotes | ✅ Done — `companyInfoSummery` / `tradeSummary` |
| Real historical OHLC | ✅ Done — `companyChartDataByStock` |
| Symbol resolution (`JKH` → `JKH.N0000`) | ✅ Done |
| Simulated / fallback data | ✅ Removed entirely |
| Prediction tracking (SQLite) | ✅ Done |
| Real, measured accuracy | ✅ Done — store → resolve → report |
| Honest accuracy reporting (no fabricated %) | ✅ Done |
| Offline tests (mocked API) | ✅ Done |
| Backtesting against historical data | ⬜ Future work |
| Scheduled auto-resolution of predictions | ⬜ Future work |
| Self-improvement modules wired in | ⬜ Experimental (not connected) |

## Data source

The Colombo Stock Exchange exposes a public (undocumented) JSON API at
`https://www.cse.lk/api`. It provides indices, market status, full trade summaries,
per-company info and historical chart data — everything needed without a paid
provider. Because it is undocumented, response field names are parsed defensively in
`src/tools/cse-api.ts` and may need adjustment if the CSE changes its API.

## How accuracy is measured

1. `predict_stock` stores each prediction (symbol, direction, timeframe, target, time).
2. After the timeframe elapses, `resolve_predictions` fetches the current price and
   marks each prediction correct/incorrect.
3. `get_accuracy_report` reports the realized hit-rate, by timeframe and signal.

## Future work

### Backtesting
Replay historical OHLC through the predictor to estimate model quality before live
tracking accumulates. Sketch:

```ts
async function backtest(symbol: string, horizon: number) {
  const history = (await dataFetcher.fetchHistoricalData(symbol)).data;
  for (let i = 30; i < history.length - horizon; i++) {
    const window = { symbol, data: history.slice(0, i), dataSource: 'backtest' };
    const analysis = await analyzer.analyze(window, ['all']);
    const prediction = await predictor.predict(symbol, window, analysis, 'medium');
    // compare against history[i + horizon]
  }
}
```

### Scheduling
A cron/heartbeat that periodically records index snapshots and resolves due
predictions, so accuracy accumulates without manual calls.
