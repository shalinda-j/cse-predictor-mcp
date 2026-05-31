# CSE Predictor MCP Server — Data & Accuracy Notice

## Data sources

Every data point served by this project is fetched **live** from the Colombo Stock
Exchange public JSON API (`https://www.cse.lk/api`). **There is no simulated, fake,
or fallback data.** If the exchange cannot be reached, tools return an honest error.

| Data type | Source | How it's obtained |
|-----------|--------|-------------------|
| Indices (ASPI, S&P SL20) | `cse.lk/api/aspiData`, `snpData` | Live |
| Market status & turnover | `cse.lk/api/marketStatus`, `tradeSummary` | Live |
| Company quote | `cse.lk/api/companyInfoSummery` | Live |
| All traded securities | `cse.lk/api/tradeSummary` | Live |
| Historical OHLC | `cse.lk/api/companyChartDataByStock` | Live |
| Index history | Daily snapshots recorded by the server | Real, accumulated over time |

## Accuracy

There are **no fabricated accuracy numbers** in this project. Accuracy is measured
empirically:

1. Every `predict_stock` call is stored in a local SQLite database with a timestamp.
2. After the prediction's timeframe elapses, run `resolve_predictions` to compare it
   against the actual market price.
3. `get_accuracy_report` then reports the realized hit-rate (correct / resolved),
   broken down by timeframe and signal.

Until you have resolved predictions, the accuracy report honestly states that no
measured accuracy is available yet.

The `confidence` value on a prediction is **not** an accuracy claim — it reflects how
strongly the underlying technical models agree.

## Disclaimers

- This is a **technical-analysis tool, not financial advice**.
- Stock-market predictions are inherently uncertain; past results do not guarantee
  future outcomes.
- Always verify with official CSE sources and consult a licensed advisor before trading.

## Official sources

- CSE website: https://www.cse.lk
- The `cse.lk/api` endpoints are public but **not officially documented**, so field
  names may change without notice. Parsing lives in `src/tools/cse-api.ts`.
