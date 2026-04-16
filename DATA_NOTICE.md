# CSE Predictor MCP Server - Data & Accuracy Notice

## Data Sources

| Data Type | Source | Status |
|-----------|--------|--------|
| **Market Data** | cse.lk | Attempts real fetch, falls back to simulation |
| **Company Data** | cse.lk | Attempts real fetch, falls back to simulation |
| **Historical Data** | None | **ALWAYS SIMULATED** - no free API available |
| **All Companies List** | Hardcoded | 15 common symbols (COMB, JKH, NDB, etc.) |

## Accuracy Claims

**The 80%+ accuracy is a TARGET, not an achieved metric.**

| Metric | Status |
|--------|--------|
| Target Accuracy | 80%+ |
| Achieved Accuracy | **Not tracked** |
| Prediction Tracking | **Not implemented** |
| Historical Validation | **Not available** |

## How to Achieve Real Accuracy

1. Store predictions in a database with timestamps
2. Track actual stock price movements
3. Compare predictions vs outcomes after timeframe elapses
4. Calculate realized accuracy: correct predictions / total predictions

## Disclaimers

- **Predictions are for demonstration only**
- **Historical data is simulated** - no real market history
- **Not suitable for real trading decisions**
- **Verify all data with official CSE sources before use**

## Official Data Sources

- **CSE Website**: https://www.cse.lk
- **CSE Market Data**: https://www.cse.lk/market
- **CSE Listed Companies**: https://www.cse.lk/listed-companies

---

*This project is a demonstration MCP server. For real trading, use verified data sources.*
