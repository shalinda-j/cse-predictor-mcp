# CSE Predictor MCP Server

**A Model Context Protocol (MCP) server for the Colombo Stock Exchange (CSE), powered by real, live market data.**

![MCP](https://img.shields.io/badge/MCP-Model%20Context%20Protocol-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)
![Node.js](https://img.shields.io/badge/Node.js-18+-green)
![License](https://img.shields.io/badge/License-MIT-yellow)

This server connects AI assistants (Claude Desktop, Cursor, or any MCP client) to
**live Colombo Stock Exchange data** and a set of transparent technical-analysis
tools. It can be self-hosted by anyone.

- 🔄 **Live market data** — ASPI & S&P SL20 indices, turnover, market status
- 🏢 **Live company quotes** — last price, change, day high/low for any listed stock
- 📊 **Technical analysis** — RSI, MACD, SMA, EMA, Bollinger Bands, volume, trend
- 🧭 **Directional outlook** — a 4-model technical ensemble (bullish/bearish/neutral)
- 🔍 **Stock screening** — rank all traded securities by live quote criteria
- 📈 **Honest accuracy tracking** — predictions are stored and scored against real outcomes

> **Where the data comes from:** all data is fetched live from the Colombo Stock
> Exchange's public JSON API (`https://www.cse.lk/api`) — the same endpoints the
> official cse.lk website uses. **There is no simulated, fake, or fallback data
> anywhere in this project.** If the exchange is unreachable, tools return an
> honest error instead of made-up numbers.

> ⚠️ **Not financial advice.** This is a technical-analysis tool. Markets are
> uncertain. Always verify with official CSE sources and consult a licensed
> advisor before trading.

---

## How it works

```
MCP client (Claude / Cursor)
        │  tool call
        ▼
  CSE Predictor MCP Server
        │
        ├── CSEApiClient  ──►  https://www.cse.lk/api  (live JSON)
        │      aspiData · snpData · tradeSummary · companyInfoSummery ·
        │      companyChartDataByStock · marketStatus
        │
        ├── TechnicalAnalyzer  ──►  RSI / MACD / SMA / EMA / Bollinger / trend
        ├── StockPredictor     ──►  weighted technical ensemble
        └── PredictionStore (SQLite)  ──►  tracks predictions & real accuracy
```

A prediction is **not** a claim of accuracy. The reported `confidence` reflects how
strongly the underlying technical models agree. Real, empirical accuracy is measured
separately: every prediction is stored, and once its timeframe elapses you call
`resolve_predictions` to score it against the actual market price.

---

## Prediction models

The directional outlook is a weighted ensemble of four technical models, all
computed from **real historical OHLC data**:

1. **Trend Following** — SMA/EMA direction and golden/death crossovers
2. **Momentum Oscillator** — RSI and MACD signals
3. **Pattern Recognition** — double bottom/top and breakout detection
4. **Sentiment** — volume confirmation of the overall signal

Weights are tuned per timeframe (`short` / `medium` / `long`).

---

## Quick start

### Prerequisites
- Node.js 18+
- A network that can reach `https://www.cse.lk` (the CSE site is reachable from Sri Lanka and most regions; some networks/regions may block it)

```bash
git clone https://github.com/shalinda-j/cse-predictor-mcp.git
cd cse-predictor-mcp
npm install
npm run build
npm start            # stdio MCP server
```

Try it with the MCP Inspector:

```bash
npm run inspect
```

Run the tests (offline — they mock the CSE API):

```bash
npm test
```

### Verify it works on real data ✅

The definitive "does it actually work on live CSE data?" check. Run it from a
machine/network that can reach `https://www.cse.lk`:

```bash
npm run verify
```

It POSTs to every endpoint the server depends on (indices, trade summary, symbol
resolution, company info, historical chart data), parses the responses and prints
a PASS/FAIL report with sample values, exiting non-zero on any failure:

```
Verifying live CSE data via https://www.cse.lk/api

  ✓ aspiData (ASPI index) — value=12345.67 change=21.77 (0.18%)
  ✓ tradeSummary (all securities) — 290 securities, e.g. JKH.N0000 @ 201.5
  ✓ companyInfoSummery — JKH.N0000 price=201.5 id=234 marketCap=...
  ✓ companyChartDataByStock (history) — 248 OHLC points, latest 2026-05-30 close=201.5

PASS — the server is serving REAL CSE data end to end. ✅
```

> If the CSE market is closed, intraday values can be 0 and some checks may warn —
> re-run during market hours (weekdays, ~09:30–14:30 Sri Lanka time) for a full pass.

---

## Configuration

All configuration is optional and set via environment variables (see `.env.example`):

| Variable | Default | Description |
|----------|---------|-------------|
| `CSE_API_URL` | `https://www.cse.lk/api` | CSE API base URL (override only if the CSE changes hosts) |
| `CSE_REQUEST_TIMEOUT_MS` | `20000` | HTTP timeout for CSE API calls |
| `CSE_HISTORY_DAYS` | `365` | Trading days of history to use for analysis |
| `CSE_DATA_PATH` | `./data` | Where the SQLite tracking database is stored |
| `CSE_VERBOSE_LOGGING` | `false` | Enable debug logging |

---

## MCP tools

| Tool | Description |
|------|-------------|
| `fetch_market_data` | Live ASPI, S&P SL20, turnover and market status |
| `get_company_data` | Live quote for a company (ticker or full symbol) |
| `analyze_stock` | Technical indicators on real price history |
| `predict_stock` | Directional outlook (tracked for accuracy) |
| `predict_market` | Outlook for ASPI / S&P SL20 from recorded daily index history |
| `screen_stocks` | Rank all traded securities by a live-quote criterion |
| `get_accuracy_report` | Real measured accuracy of past predictions |
| `resolve_predictions` | Score pending predictions against current prices |

### Symbols

You can use a short ticker (`JKH`, `COMB`) or a full CSE symbol (`JKH.N0000`).
Short tickers are resolved against the live security list; when multiple share
classes exist the voting/ordinary class (`.N0000`) is preferred.

### Example: `predict_stock`

Request:
```json
{ "symbol": "JKH", "timeframe": "medium" }
```

Response (shape):
```json
{
  "symbol": "JKH.N0000",
  "prediction": "bullish",
  "confidence": 0.72,
  "timeframe": "medium",
  "currentPrice": 201.5,
  "targetPrice": 209.6,
  "priceRange": { "low": 198.1, "mid": 209.6, "high": 221.0 },
  "reasoning": ["MACD shows bullish momentum", "Overall trend is upward"],
  "riskLevel": "medium",
  "predictionId": "pred_...",
  "tracked": true,
  "disclaimer": "Technical-analysis output only. Not financial advice. ..."
}
```

> `predict_market` builds its index history from daily snapshots the server records
> each time market data is fetched, so its outlook becomes available only after enough
> trading days have been collected.

---

## MCP resources

- `cse://market/overview` — live market overview
- `cse://companies/list` — live list of traded companies
- `cse://models/info` — model info + measured accuracy from the tracking DB

---

## Integration

### Claude Desktop / Cursor

Add to your MCP config (`claude_desktop_config.json` or Cursor MCP settings):

```json
{
  "mcpServers": {
    "cse-predictor": {
      "command": "node",
      "args": ["/absolute/path/to/cse-predictor-mcp/dist/index.js"]
    }
  }
}
```

### HTTP / remote hosting

```bash
node dist/server-http.js     # exposes POST /mcp and GET /health
```

A stateless serverless variant for Vercel lives in `api/` (no SQLite tracking there).

---

## Project structure

```
cse-predictor-mcp/
├── src/
│   ├── index.ts              # stdio MCP server entry
│   ├── server-http.ts        # HTTP MCP server (Express)
│   ├── tools/
│   │   ├── cse-api.ts         # live CSE JSON API client
│   │   ├── data-fetcher.ts    # market/company/history data (real, cached)
│   │   ├── analysis.ts        # technical indicators
│   │   └── predictor.ts       # technical ensemble + screening
│   ├── resources/cse-data.ts  # MCP resources
│   ├── database/prediction-store.ts  # SQLite prediction tracking
│   └── utils/                 # config, logging
├── api/                       # Vercel serverless endpoint
├── tests/                     # offline tests (mocked CSE API)
└── README.md
```

---

## A note on the CSE API

The endpoints under `https://www.cse.lk/api` are public but **not officially
documented**, so field names are parsed defensively and may change without notice.
If a tool stops returning data, the parsing in `src/tools/cse-api.ts` is the place
to adjust. Community references:
[GH0STH4CKER/Colombo-Stock-Exchange-CSE-API-Documentation](https://github.com/GH0STH4CKER/Colombo-Stock-Exchange-CSE-API-Documentation).

Please use the API responsibly (this client caches results and identifies itself
via User-Agent).

---

## Contributing

Issues and pull requests are welcome. This is open source under the MIT License.

## License

MIT — see [LICENSE](LICENSE).

## Disclaimer

For research and educational use. Stock-market predictions are inherently uncertain;
past results do not guarantee future outcomes. Nothing here is financial advice.
Always do your own research.
