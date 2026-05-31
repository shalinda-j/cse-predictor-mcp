# Architecture

The CSE Predictor MCP Server exposes live Colombo Stock Exchange data and
technical-analysis tools over the Model Context Protocol. All data is real and
fetched live; there is no simulated data.

## Data flow

```
┌──────────────────────────────────────────────────────────────────┐
│  MCP client  (Claude Desktop · Cursor · any MCP client)            │
└───────────────────────────────┬────────────────────────────────────┘
                                 │ JSON-RPC (stdio or HTTP)
                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│                     CSE Predictor MCP Server                       │
│                                                                    │
│  Tools:     fetch_market_data · get_company_data · analyze_stock   │
│             predict_stock · predict_market · screen_stocks         │
│             get_accuracy_report · resolve_predictions              │
│  Resources: market/overview · companies/list · models/info         │
│                                                                    │
│   ┌──────────────┐   ┌────────────────┐   ┌──────────────────┐    │
│   │ CSEDataFetcher│──►│ TechnicalAnalyzer│─►│ StockPredictor   │    │
│   │  (+ 5m cache) │   │ RSI/MACD/SMA/... │  │ ensemble + screen │    │
│   └──────┬───────┘   └────────────────┘   └──────────────────┘    │
│          │                                          │              │
│          │                                          ▼              │
│          │                              ┌──────────────────────┐   │
│          │                              │ PredictionStore       │   │
│          │                              │ (SQLite tracking)     │   │
│          │                              └──────────────────────┘   │
└──────────┼─────────────────────────────────────────────────────────┘
           │ HTTPS (form-encoded POST)
           ▼
   https://www.cse.lk/api
   aspiData · snpData · marketStatus · tradeSummary ·
   companyInfoSummery · companyChartDataByStock
```

## Components

### `src/tools/cse-api.ts` — CSEApiClient
A typed client for the CSE public JSON API. Handles requests (form-encoded POST,
browser-like User-Agent, timeout), defensive response normalisation (field names
are not officially documented), and ticker → full-symbol resolution
(`JKH` → `JKH.N0000`).

### `src/tools/data-fetcher.ts` — CSEDataFetcher
The data layer. Provides market data, company quotes, all-securities lists and
historical OHLC, with a 5-minute in-memory cache. Throws on failure — never
returns fabricated data. Enforces a minimum history length for analysis.

### `src/tools/analysis.ts` — TechnicalAnalyzer
Computes RSI, MACD, SMA, EMA, Bollinger Bands, volume and trend indicators from
real price history and produces a buy/sell/hold signal.

### `src/tools/predictor.ts` — StockPredictor
Combines four technical models (trend, momentum, pattern, sentiment) into a
weighted ensemble to produce a bullish/bearish/neutral outlook. `confidence`
measures model agreement, not historical accuracy. Also performs transparent,
quote-based stock screening.

### `src/database/prediction-store.ts` — PredictionStore
SQLite store that records every prediction and (via `resolve_predictions`) scores
it against the real later price, yielding honest, measured accuracy. Also stores
daily index snapshots so `predict_market` can build a real index history over time.

## Entry points

- `src/index.ts` — stdio MCP server (default; for Claude Desktop / Cursor)
- `src/server-http.ts` — Express-based HTTP MCP server for remote hosting
- `api/index.ts` — stateless Vercel serverless endpoint (no SQLite tracking)

## Accuracy model

Predictions are stored when made and resolved later against actual prices. Accuracy
is therefore *measured*, not asserted. Until predictions are resolved, the accuracy
report says so honestly.

## Experimental modules (not wired in)

`src/memory/`, `src/research/`, `src/improvement/` and `src/dual/` contain an
early, self-contained sketch of a self-improving/auto-tuning subsystem. It is **not
connected to the running server** and does not affect any tool output. It is kept
as a starting point for future work and may be completed or removed later.

## Possible future work

- Backtesting against historical OHLC
- Scheduled automatic resolution of pending predictions
- Wiring (or removing) the experimental self-improvement modules
