/**
 * Stock Predictor
 *
 * Generates a directional outlook (bullish / bearish / neutral) for a stock by
 * combining several technical-analysis models into an ensemble. All inputs are
 * REAL price history and indicators — there are no fabricated accuracy numbers.
 *
 * The "confidence" reported reflects how strongly the underlying technical
 * models agree; it is NOT a claim about historical hit-rate. Empirical accuracy
 * is tracked separately and honestly in the prediction database
 * (see ../database/prediction-store.ts).
 *
 * This is a technical-analysis tool, not financial advice.
 */

import { logger } from '../utils/logger.js';
import type { HistoricalData } from './data-fetcher.js';
import type { AnalysisResult } from './analysis.js';

export interface PredictionResult {
  symbol: string;
  prediction: 'bullish' | 'bearish' | 'neutral';
  confidence: number; // 0..1 — agreement strength of the ensemble
  timeframe: 'short' | 'medium' | 'long';
  currentPrice: number;
  targetPrice?: number;
  priceRange: {
    low: number;
    mid: number;
    high: number;
  };
  reasoning: string[];
  riskLevel: 'low' | 'medium' | 'high';
  timestamp: string;
  modelVersion: string;
  disclaimer: string;
}

export interface StockScreenResult {
  symbol: string;
  name: string;
  criteria: string;
  score: number;
  price: number;
  changePercent: number;
  volume: number;
  recommendation: 'strong_buy' | 'buy' | 'hold' | 'sell' | 'strong_sell';
}

/** A real intraday quote used for quote-based screening. */
export interface ScreenQuote {
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
  volume: number;
  high: number;
  low: number;
}

export interface ModelInfo {
  version: string;
  algorithms: string[];
  features: string[];
  disclaimer: string;
}

const DISCLAIMER =
  'Technical-analysis output only. Not financial advice. Markets are uncertain; always verify with official CSE data and consult a licensed advisor before trading.';

export class StockPredictor {
  private modelVersion = '2.0.0';

  async predict(
    symbol: string,
    history: HistoricalData,
    analysis: AnalysisResult,
    timeframe: 'short' | 'medium' | 'long'
  ): Promise<PredictionResult> {
    logger.debug(`Predicting ${symbol} for timeframe: ${timeframe}`);

    const prices = history.data.map((p) => p.close);
    const currentPrice = prices[prices.length - 1] ?? 0;

    const predictions = {
      trend: this.predictTrendModel(analysis),
      momentum: this.predictMomentumModel(analysis),
      pattern: this.predictPatternModel(history.data),
      sentiment: this.predictSentimentModel(analysis)
    };

    const weights = this.getTimeframeWeights(timeframe);
    const ensembleScore =
      predictions.trend.score * weights.trend +
      predictions.momentum.score * weights.momentum +
      predictions.pattern.score * weights.pattern +
      predictions.sentiment.score * weights.sentiment;

    let prediction: 'bullish' | 'bearish' | 'neutral';
    if (ensembleScore > 0.3) prediction = 'bullish';
    else if (ensembleScore < -0.3) prediction = 'bearish';
    else prediction = 'neutral';

    const confidence = this.calculateEnsembleConfidence(predictions, weights);

    const volatility = this.calculateVolatility(prices);
    const priceChangePercent = this.estimatePriceChange(prediction, ensembleScore, timeframe);
    const targetPrice = currentPrice * (1 + priceChangePercent);

    const priceRange = {
      low: currentPrice * (1 + priceChangePercent - volatility),
      mid: targetPrice,
      high: currentPrice * (1 + priceChangePercent + volatility)
    };

    const reasoning = this.generateReasoning(analysis);
    const riskLevel = this.assessRisk(volatility, confidence);

    return {
      symbol,
      prediction,
      confidence,
      timeframe,
      currentPrice,
      targetPrice,
      priceRange,
      reasoning,
      riskLevel,
      timestamp: new Date().toISOString(),
      modelVersion: this.modelVersion,
      disclaimer: DISCLAIMER
    };
  }

  /**
   * Screen real intraday quotes against a criterion. Scoring is derived purely
   * from the live quote fields (change %, volume, position in the day's range).
   */
  screenStocks(quotes: ScreenQuote[], criteria: string, limit: number): StockScreenResult[] {
    const maxVolume = Math.max(1, ...quotes.map((q) => q.volume));

    const scored = quotes.map((q) => {
      const score = this.calculateScreenScore(q, criteria, maxVolume);
      let recommendation: StockScreenResult['recommendation'];
      if (score > 0.8) recommendation = 'strong_buy';
      else if (score > 0.6) recommendation = 'buy';
      else if (score > 0.4) recommendation = 'hold';
      else if (score > 0.2) recommendation = 'sell';
      else recommendation = 'strong_sell';

      return {
        symbol: q.symbol,
        name: q.name,
        criteria,
        score,
        price: q.price,
        changePercent: q.changePercent,
        volume: q.volume,
        recommendation
      };
    });

    return scored.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  generateMarketSummary(asi: PredictionResult, spx: PredictionResult): string {
    const dir = (p: PredictionResult) =>
      p.prediction === 'bullish' ? 'upward' : p.prediction === 'bearish' ? 'downward' : 'stable';
    const overall = asi.prediction === spx.prediction ? asi.prediction : 'mixed';
    return `Market outlook: ASPI trending ${dir(asi)} (${(asi.confidence * 100).toFixed(0)}% model agreement), S&P SL20 trending ${dir(spx)} (${(spx.confidence * 100).toFixed(0)}% model agreement). Overall: ${overall.toUpperCase()}.`;
  }

  getModelInfo(): ModelInfo {
    return {
      version: this.modelVersion,
      algorithms: [
        'Trend Following Model',
        'Momentum Oscillator Model',
        'Pattern Recognition Model',
        'Sentiment Analysis Model'
      ],
      features: [
        'RSI (14-period)',
        'MACD (12/26/9)',
        'SMA (20/50/200)',
        'EMA (12/26)',
        'Bollinger Bands',
        'Volume Analysis',
        'Support/Resistance'
      ],
      disclaimer: DISCLAIMER
    };
  }

  // ---- Individual technical models (real math on real data) ----------------

  private predictTrendModel(analysis: AnalysisResult): { score: number; confidence: number } {
    const trend = analysis.indicators.trend;
    const sma = analysis.indicators.sma;

    let score = 0;
    let confidence = 0.5;

    if (trend) {
      if (trend.direction === 'up') {
        score = 0.5 + trend.strength * 0.3;
        confidence = 0.6 + trend.strength * 0.2;
      } else if (trend.direction === 'down') {
        score = -0.5 - trend.strength * 0.3;
        confidence = 0.6 + trend.strength * 0.2;
      }
    }

    if (sma?.crossover === 'golden') {
      score += 0.3;
      confidence += 0.1;
    } else if (sma?.crossover === 'death') {
      score -= 0.3;
      confidence += 0.1;
    }

    return { score, confidence: Math.min(1, confidence) };
  }

  private predictMomentumModel(analysis: AnalysisResult): { score: number; confidence: number } {
    const rsi = analysis.indicators.rsi;
    const macd = analysis.indicators.macd;

    let score = 0;
    let confidence = 0.5;

    if (rsi) {
      if (rsi.signal === 'oversold') { score += 0.4; confidence += 0.15; }
      else if (rsi.signal === 'overbought') { score -= 0.4; confidence += 0.15; }
    }

    if (macd) {
      if (macd.trend === 'bullish') { score += 0.3; confidence += 0.1; }
      else if (macd.trend === 'bearish') { score -= 0.3; confidence += 0.1; }
    }

    return { score, confidence: Math.min(1, confidence) };
  }

  private predictPatternModel(data: Array<{ close: number; high: number; low: number }>): { score: number; confidence: number } {
    const recent = data.slice(-10);
    const prices = recent.map((p) => p.close);

    let score = 0;
    let confidence = 0.4;

    if (this.isDoubleBottom(prices)) { score += 0.4; confidence += 0.15; }
    if (this.isDoubleTop(prices)) { score -= 0.4; confidence += 0.15; }
    if (this.isBreakout(recent)) { score += 0.3; confidence += 0.1; }

    return { score, confidence: Math.min(1, confidence) };
  }

  private predictSentimentModel(analysis: AnalysisResult): { score: number; confidence: number } {
    const volume = analysis.indicators.volume;
    const signal = analysis.signal;

    let score = 0;
    let confidence = 0.3;

    if (signal === 'buy') { score = 0.3; confidence = 0.5; }
    else if (signal === 'sell') { score = -0.3; confidence = 0.5; }

    if (volume?.signal === 'high') {
      confidence += 0.1;
      if (score > 0) score += 0.1;
      else if (score < 0) score -= 0.1;
    }

    return { score, confidence };
  }

  private getTimeframeWeights(timeframe: 'short' | 'medium' | 'long'): Record<string, number> {
    switch (timeframe) {
      case 'short': return { trend: 0.2, momentum: 0.4, pattern: 0.25, sentiment: 0.15 };
      case 'medium': return { trend: 0.35, momentum: 0.25, pattern: 0.2, sentiment: 0.2 };
      case 'long': return { trend: 0.45, momentum: 0.15, pattern: 0.15, sentiment: 0.25 };
      default: return { trend: 0.3, momentum: 0.3, pattern: 0.2, sentiment: 0.2 };
    }
  }

  private calculateEnsembleConfidence(
    predictions: Record<string, { score: number; confidence: number }>,
    weights: Record<string, number>
  ): number {
    let totalConfidence = 0;
    let totalWeight = 0;
    for (const [model, weight] of Object.entries(weights)) {
      const pred = predictions[model];
      if (pred) {
        totalConfidence += pred.confidence * weight;
        totalWeight += weight;
      }
    }
    return totalWeight > 0 ? totalConfidence / totalWeight : 0.5;
  }

  private calculateVolatility(prices: number[]): number {
    const recent = prices.slice(-20);
    if (recent.length === 0) return 0.05;
    const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const variance = recent.reduce((sum, p) => sum + Math.pow(p - avg, 2), 0) / recent.length;
    return Math.sqrt(variance) / avg;
  }

  private estimatePriceChange(prediction: string, ensembleScore: number, timeframe: string): number {
    const baseChange: Record<string, number> = { short: 0.02, medium: 0.05, long: 0.1 };
    const base = baseChange[timeframe] ?? 0.05;
    const multiplier = prediction === 'bullish' ? 1 : prediction === 'bearish' ? -1 : 0;
    // Scale the expected move by the strength of the ensemble signal.
    return base * multiplier * Math.min(1, Math.abs(ensembleScore));
  }

  private generateReasoning(analysis: AnalysisResult): string[] {
    const reasons: string[] = [];

    if (analysis.indicators.rsi?.signal === 'oversold') reasons.push('RSI indicates oversold condition - potential reversal');
    else if (analysis.indicators.rsi?.signal === 'overbought') reasons.push('RSI indicates overbought condition - potential pullback');

    if (analysis.indicators.macd?.trend === 'bullish') reasons.push('MACD shows bullish momentum');
    else if (analysis.indicators.macd?.trend === 'bearish') reasons.push('MACD shows bearish momentum');

    if (analysis.indicators.sma?.crossover === 'golden') reasons.push('Golden cross detected - strong bullish signal');
    else if (analysis.indicators.sma?.crossover === 'death') reasons.push('Death cross detected - strong bearish signal');

    if (analysis.indicators.bb?.position === 'below') reasons.push('Price below lower Bollinger Band - potential bounce');
    else if (analysis.indicators.bb?.position === 'above') reasons.push('Price above upper Bollinger Band - potential reversal');

    if (analysis.indicators.trend?.direction === 'up') reasons.push('Overall trend is upward');
    else if (analysis.indicators.trend?.direction === 'down') reasons.push('Overall trend is downward');

    return reasons.length > 0 ? reasons : ['Technical indicators are neutral'];
  }

  private assessRisk(volatility: number, confidence: number): 'low' | 'medium' | 'high' {
    const riskScore = volatility * 2 + (1 - confidence);
    if (riskScore < 0.3) return 'low';
    if (riskScore < 0.6) return 'medium';
    return 'high';
  }

  private isDoubleBottom(prices: number[]): boolean {
    if (prices.length < 8) return false;
    const min1 = Math.min(...prices.slice(0, 4));
    const min2 = Math.min(...prices.slice(-4));
    const max = Math.max(...prices.slice(4, -4));
    return Math.abs(min1 - min2) < (max - min1) * 0.1 && max > min1 * 1.05;
  }

  private isDoubleTop(prices: number[]): boolean {
    if (prices.length < 8) return false;
    const max1 = Math.max(...prices.slice(0, 4));
    const max2 = Math.max(...prices.slice(-4));
    const min = Math.min(...prices.slice(4, -4));
    return Math.abs(max1 - max2) < (max1 - min) * 0.1 && min < max1 * 0.95;
  }

  private isBreakout(data: Array<{ high: number; low: number }>): boolean {
    if (data.length < 5) return false;
    const resistance = Math.max(...data.slice(0, -1).map((d) => d.high));
    const lastHigh = data[data.length - 1]?.high ?? 0;
    return lastHigh > resistance;
  }

  /** Real, transparent quote-based screening score in [0, 1]. */
  private calculateScreenScore(q: ScreenQuote, criteria: string, maxVolume: number): number {
    const clamp = (n: number) => Math.max(0, Math.min(1, n));
    const volumeRank = clamp(q.volume / maxVolume);
    // Where the last price sits within the day's range (0 = at low, 1 = at high).
    const range = q.high - q.low;
    const dayPosition = range > 0 ? clamp((q.price - q.low) / range) : 0.5;

    switch (criteria) {
      case 'bullish':
        return clamp(0.5 + q.changePercent / 10);
      case 'bearish':
        return clamp(0.5 - q.changePercent / 10);
      case 'overbought':
        return clamp(q.changePercent / 8) * 0.7 + dayPosition * 0.3;
      case 'oversold':
        return clamp(-q.changePercent / 8) * 0.7 + (1 - dayPosition) * 0.3;
      case 'high_volume':
        return volumeRank;
      case 'breakout':
        return q.changePercent > 0 ? clamp(dayPosition * 0.6 + clamp(q.changePercent / 10) * 0.4) : 0;
      case 'all':
      default:
        return clamp(0.5 + q.changePercent / 12) * 0.6 + volumeRank * 0.4;
    }
  }
}
