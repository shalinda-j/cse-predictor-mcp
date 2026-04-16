# CSE Predictor MCP Server - Production Trading Tool Roadmap

## Current State
- ? Simulated historical data
- ? Falls back to fake data on fetch failure
- ? No prediction tracking
- ? No real accuracy validation
- ? 80% accuracy is aspirational, not proven

## Required Changes for Production

### Phase 1: Real Data Sources (Priority: CRITICAL)

#### Option A: Yahoo Finance API (Recommended - Free)
`	ypescript
// Yahoo Finance supports CSE stocks with .CSE suffix
// Example: COMB.CSE, JKH.CSE, NDB.CSE
const YAHOO_FINANCE_API = 'https://query1.finance.yahoo.com/v8/finance/chart/{symbol}.CSE';
`

**Pros**: Free, historical data available, reliable
**Cons**: Rate limits, requires correct symbol mapping

#### Option B: Direct CSE Scraping
`	ypescript
// Scrape cse.lk for live prices
// Store daily to build historical database
const CSE_MARKET_URL = 'https://www.cse.lk/market';
const CSE_COMPANY_URL = 'https://www.cse.lk/listed-companies/{symbol}';
`

**Pros**: Official source, live data
**Cons**: No historical API, must build own database

#### Option C: Paid Data Provider (Premium)
- Bloomberg Terminal (expensive)
- Reuters Eikon (expensive)
- Local Sri Lanka brokers with API access

**Pros**: Complete data, reliable
**Cons**: Cost +/month

### Phase 2: Database for Tracking (Priority: HIGH)

#### SQLite Schema
`sql
-- Store predictions
CREATE TABLE predictions (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  prediction TEXT NOT NULL,  -- bullish/bearish/neutral
  confidence REAL,
  timeframe TEXT,  -- short/medium/long
  target_price REAL,
  made_at DATETIME,
  status TEXT DEFAULT 'pending'  -- pending/resolved
);

-- Store outcomes
CREATE TABLE outcomes (
  prediction_id TEXT,
  resolved_at DATETIME,
  actual_price REAL,
  correct BOOLEAN,
  accuracy_contribution REAL
);

-- Store historical prices (for backtesting)
CREATE TABLE price_history (
  symbol TEXT,
  date DATE,
  open REAL,
  high REAL,
  low REAL,
  close REAL,
  volume INTEGER
);
`

### Phase 3: Real Accuracy Calculation (Priority: HIGH)

`	ypescript
// Calculate REAL accuracy
async function calculateRealAccuracy(): Promise<number> {
  const resolved = await db.query(
    'SELECT COUNT(*) as total, SUM(correct) as correct FROM outcomes'
  );
  return resolved.correct / resolved.total;
}

// Track outcome after timeframe
async function resolvePrediction(predictionId: string): Promise<void> {
  const prediction = await getPrediction(predictionId);
  const currentPrice = await fetchCurrentPrice(prediction.symbol);
  const daysElapsed = getDaysElapsed(prediction.made_at, prediction.timeframe);
  
  if (daysElapsed >= getRequiredDays(prediction.timeframe)) {
    const correct = checkOutcome(prediction, currentPrice);
    await storeOutcome(predictionId, currentPrice, correct);
  }
}
`

### Phase 4: Backtesting System (Priority: MEDIUM)

`	ypescript
// Test model against historical data
async function backtest(symbol: string, startDate: Date): Promise<BacktestResult> {
  const history = await fetchHistoricalPrices(symbol, startDate);
  
  for (let i = 0; i < history.length - 30; i++) {
    const window = history.slice(0, i + 30);
    const prediction = await predict(symbol, window);
    const actualOutcome = history[i + 30 + timeframeDays];
    
    trackBacktestResult(prediction, actualOutcome);
  }
  
  return calculateBacktestAccuracy();
}
`

### Phase 5: Real-time Monitoring (Priority: MEDIUM)

- Schedule daily price fetching
- Automatic prediction outcome resolution
- Accuracy dashboard
- Alert system for prediction failures

## Implementation Order

| Phase | Task | Time | Priority |
|-------|------|------|----------|
| 1 | Connect Yahoo Finance API | 2-3 hours | CRITICAL |
| 1 | Fix symbol mapping (CSE format) | 1 hour | CRITICAL |
| 2 | Add SQLite database | 2 hours | HIGH |
| 2 | Implement prediction storage | 1 hour | HIGH |
| 3 | Add outcome tracking | 2 hours | HIGH |
| 3 | Calculate real accuracy | 1 hour | HIGH |
| 4 | Build backtesting system | 3-4 hours | MEDIUM |
| 5 | Add monitoring/scheduling | 2 hours | MEDIUM |

**Total Estimate**: 12-15 hours

## Symbol Mapping (CSE to Yahoo Finance)

| CSE Symbol | Yahoo Finance Symbol |
|------------|---------------------|
| COMB | COMB.CSE or COMB.N0000.CSE |
| JKH | JKH.CSE |
| NDB | NDB.CSE |
| HNB | HNB.CSE |
| SLT | SLT.CSE |

**Need to verify exact Yahoo format**

---

*Ready to implement? Confirm to proceed.*
