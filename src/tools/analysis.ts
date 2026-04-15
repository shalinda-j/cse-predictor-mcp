/**
 * Technical Analysis Tool
 * Implements multiple technical indicators for stock analysis
 */

import { logger } from '../utils/logger.js';
import type { HistoricalData, PricePoint } from './data-fetcher.js';

// Technical indicator calculations (simplified implementations)
export interface AnalysisResult {
  symbol: string;
  timestamp: string;
  indicators: {
    rsi?: RSIResult;
    macd?: MACDResult;
    sma?: SMAResult;
    ema?: EMAResult;
    bb?: BollingerResult;
    volume?: VolumeResult;
    trend?: TrendResult;
  };
  signal: 'buy' | 'sell' | 'hold';
  confidence: number;
}

export interface RSIResult {
  value: number;
  signal: 'oversold' | 'neutral' | 'overbought';
}

export interface MACDResult {
  macd: number;
  signal: number;
  histogram: number;
  trend: 'bullish' | 'bearish' | 'neutral';
}

export interface SMAResult {
  sma20: number;
  sma50: number;
  sma200?: number;
  crossover?: 'golden' | 'death' | 'none';
}

export interface EMAResult {
  ema12: number;
  ema26: number;
  trend: 'up' | 'down' | 'flat';
}

export interface BollingerResult {
  upper: number;
  middle: number;
  lower: number;
  position: 'above' | 'within' | 'below';
}

export interface VolumeResult {
  average: number;
  current: number;
  ratio: number;
  signal: 'high' | 'normal' | 'low';
}

export interface TrendResult {
  direction: 'up' | 'down' | 'sideways';
  strength: number;
  support: number;
  resistance: number;
}

export class TechnicalAnalyzer {
  
  async analyze(history: HistoricalData, indicators: string[] = ['all']): Promise<AnalysisResult> {
    logger.debug(`Analyzing ${history.symbol} with indicators: ${indicators.join(', ')}`);
    
    const prices = history.data.map(p => p.close);
    const volumes = history.data.map(p => p.volume);
    const result: AnalysisResult = {
      symbol: history.symbol,
      timestamp: new Date().toISOString(),
      indicators: {},
      signal: 'hold',
      confidence: 0.5
    };
    
    // Calculate requested indicators
    if (indicators.includes('all') || indicators.includes('rsi')) {
      result.indicators.rsi = this.calculateRSI(prices);
    }
    
    if (indicators.includes('all') || indicators.includes('macd')) {
      result.indicators.macd = this.calculateMACD(prices);
    }
    
    if (indicators.includes('all') || indicators.includes('sma')) {
      result.indicators.sma = this.calculateSMA(prices);
    }
    
    if (indicators.includes('all') || indicators.includes('ema')) {
      result.indicators.ema = this.calculateEMA(prices);
    }
    
    if (indicators.includes('all') || indicators.includes('bb')) {
      result.indicators.bb = this.calculateBollinger(prices);
    }
    
    if (indicators.includes('all') || indicators.includes('volume')) {
      result.indicators.volume = this.analyzeVolume(volumes);
    }
    
    if (indicators.includes('all') || indicators.includes('trend')) {
      result.indicators.trend = this.analyzeTrend(history.data);
    }
    
    // Generate overall signal
    result.signal = this.generateSignal(result.indicators);
    result.confidence = this.calculateConfidence(result.indicators);
    
    return result;
  }
  
  // RSI (Relative Strength Index) - 14 period
  private calculateRSI(prices: number[]): RSIResult {
    if (prices.length < 15) {
      return { value: 50, signal: 'neutral' };
    }
    
    const period = 14;
    let gains = 0;
    let losses = 0;
    
    for (let i = 1; i <= period; i++) {
      const change = prices[prices.length - i] - prices[prices.length - i - 1];
      if (change > 0) gains += change;
      else losses += Math.abs(change);
    }
    
    const avgGain = gains / period;
    const avgLoss = losses / period;
    
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));
    
    let signal: 'oversold' | 'neutral' | 'overbought';
    if (rsi < 30) signal = 'oversold';
    else if (rsi > 70) signal = 'overbought';
    else signal = 'neutral';
    
    return { value: rsi, signal };
  }
  
  // MACD (Moving Average Convergence Divergence)
  private calculateMACD(prices: number[]): MACDResult {
    if (prices.length < 26) {
      return { macd: 0, signal: 0, histogram: 0, trend: 'neutral' };
    }
    
    const ema12 = this.calculateEMAValue(prices, 12);
    const ema26 = this.calculateEMAValue(prices, 26);
    const macd = ema12 - ema26;
    
    // Signal line (9-period EMA of MACD)
    const macdHistory: number[] = [];
    for (let i = 26; i < prices.length; i++) {
      const slice = prices.slice(0, i + 1);
      const e12 = this.calculateEMAValue(slice, 12);
      const e26 = this.calculateEMAValue(slice, 26);
      macdHistory.push(e12 - e26);
    }
    const signalLine = macdHistory.length >= 9 
      ? this.calculateEMAValue(macdHistory, 9) 
      : macd;
    
    const histogram = macd - signalLine;
    
    let trend: 'bullish' | 'bearish' | 'neutral';
    if (histogram > 0 && macd > signalLine) trend = 'bullish';
    else if (histogram < 0 && macd < signalLine) trend = 'bearish';
    else trend = 'neutral';
    
    return { macd, signal: signalLine, histogram, trend };
  }
  
  // SMA (Simple Moving Average)
  private calculateSMA(prices: number[]): SMAResult {
    const sma20 = prices.length >= 20 ? this.calculateSMAValue(prices, 20) : prices[prices.length - 1];
    const sma50 = prices.length >= 50 ? this.calculateSMAValue(prices, 50) : sma20;
    const sma200 = prices.length >= 200 ? this.calculateSMAValue(prices, 200) : undefined;
    
    // Check for golden/death cross
    let crossover: 'golden' | 'death' | 'none' = 'none';
    if (prices.length >= 50) {
      const prevSma20 = this.calculateSMAValue(prices.slice(0, -1), 20);
      const prevSma50 = this.calculateSMAValue(prices.slice(0, -1), 50);
      
      if (prevSma20 < prevSma50 && sma20 > sma50) crossover = 'golden';
      else if (prevSma20 > prevSma50 && sma20 < sma50) crossover = 'death';
    }
    
    return { sma20, sma50, sma200, crossover };
  }
  
  // EMA (Exponential Moving Average)
  private calculateEMA(prices: number[]): EMAResult {
    const ema12 = this.calculateEMAValue(prices, 12);
    const ema26 = this.calculateEMAValue(prices, 26);
    
    let trend: 'up' | 'down' | 'flat';
    const currentPrice = prices[prices.length - 1];
    if (currentPrice > ema12 && ema12 > ema26) trend = 'up';
    else if (currentPrice < ema12 && ema12 < ema26) trend = 'down';
    else trend = 'flat';
    
    return { ema12, ema26, trend };
  }
  
  // Bollinger Bands
  private calculateBollinger(prices: number[]): BollingerResult {
    const period = 20;
    const stdDevMult = 2;
    
    const recentPrices = prices.slice(-period);
    const middle = recentPrices.reduce((a, b) => a + b, 0) / period;
    
    const variance = recentPrices.reduce((sum, p) => sum + Math.pow(p - middle, 2), 0) / period;
    const stdDev = Math.sqrt(variance);
    
    const upper = middle + stdDevMult * stdDev;
    const lower = middle - stdDevMult * stdDev;
    
    const currentPrice = prices[prices.length - 1];
    let position: 'above' | 'within' | 'below';
    if (currentPrice > upper) position = 'above';
    else if (currentPrice < lower) position = 'below';
    else position = 'within';
    
    return { upper, middle, lower, position };
  }
  
  // Volume Analysis
  private analyzeVolume(volumes: number[]): VolumeResult {
    const period = 20;
    const recentVolumes = volumes.slice(-period);
    const average = recentVolumes.reduce((a, b) => a + b, 0) / period;
    const current = volumes[volumes.length - 1];
    const ratio = current / average;
    
    let signal: 'high' | 'normal' | 'low';
    if (ratio > 1.5) signal = 'high';
    else if (ratio < 0.5) signal = 'low';
    else signal = 'normal';
    
    return { average, current, ratio, signal };
  }
  
  // Trend Analysis
  private analyzeTrend(data: PricePoint[]): TrendResult {
    const recent = data.slice(-20);
    const prices = recent.map(p => p.close);
    
    // Linear regression slope for trend direction
    const n = prices.length;
    const sumX = (n * (n - 1)) / 2;
    const sumY = prices.reduce((a, b) => a + b, 0);
    const sumXY = prices.reduce((sum, y, x) => sum + x * y, 0);
    const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6;
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    
    let direction: 'up' | 'down' | 'sideways';
    if (slope > 0.5) direction = 'up';
    else if (slope < -0.5) direction = 'down';
    else direction = 'sideways';
    
    // Support and Resistance
    const highs = recent.map(p => p.high);
    const lows = recent.map(p => p.low);
    const resistance = Math.max(...highs);
    const support = Math.min(...lows);
    
    // Strength based on consistency
    const strength = Math.min(1, Math.abs(slope) / 2);
    
    return { direction, strength, support, resistance };
  }
  
  // Helper: SMA Value
  private calculateSMAValue(prices: number[], period: number): number {
    const slice = prices.slice(-period);
    return slice.reduce((a, b) => a + b, 0) / period;
  }
  
  // Helper: EMA Value
  private calculateEMAValue(prices: number[], period: number): number {
    const multiplier = 2 / (period + 1);
    let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
    
    for (let i = period; i < prices.length; i++) {
      ema = (prices[i] - ema) * multiplier + ema;
    }
    
    return ema;
  }
  
  // Generate overall signal
  private generateSignal(indicators: AnalysisResult['indicators']): 'buy' | 'sell' | 'hold' {
    let buySignals = 0;
    let sellSignals = 0;
    
    // RSI signals
    if (indicators.rsi?.signal === 'oversold') buySignals += 2;
    if (indicators.rsi?.signal === 'overbought') sellSignals += 2;
    
    // MACD signals
    if (indicators.macd?.trend === 'bullish') buySignals += 1;
    if (indicators.macd?.trend === 'bearish') sellSignals += 1;
    
    // SMA crossover
    if (indicators.sma?.crossover === 'golden') buySignals += 2;
    if (indicators.sma?.crossover === 'death') sellSignals += 2;
    
    // EMA trend
    if (indicators.ema?.trend === 'up') buySignals += 1;
    if (indicators.ema?.trend === 'down') sellSignals += 1;
    
    // Bollinger position
    if (indicators.bb?.position === 'below') buySignals += 1;
    if (indicators.bb?.position === 'above') sellSignals += 1;
    
    // Volume confirmation
    if (indicators.volume?.signal === 'high') {
      // High volume confirms the signal
      if (buySignals > sellSignals) buySignals += 1;
      else if (sellSignals > buySignals) sellSignals += 1;
    }
    
    // Overall trend
    if (indicators.trend?.direction === 'up') buySignals += 1;
    if (indicators.trend?.direction === 'down') sellSignals += 1;
    
    if (buySignals > sellSignals + 2) return 'buy';
    if (sellSignals > buySignals + 2) return 'sell';
    return 'hold';
  }
  
  // Calculate confidence based on signal alignment
  private calculateConfidence(indicators: AnalysisResult['indicators']): number {
    const totalIndicators = Object.keys(indicators).length;
    if (totalIndicators === 0) return 0.5;
    
    let alignedSignals = 0;
    const signal = this.generateSignal(indicators);
    
    if (signal === 'buy') {
      if (indicators.rsi?.signal === 'oversold') alignedSignals++;
      if (indicators.macd?.trend === 'bullish') alignedSignals++;
      if (indicators.sma?.crossover === 'golden') alignedSignals++;
      if (indicators.ema?.trend === 'up') alignedSignals++;
      if (indicators.trend?.direction === 'up') alignedSignals++;
    } else if (signal === 'sell') {
      if (indicators.rsi?.signal === 'overbought') alignedSignals++;
      if (indicators.macd?.trend === 'bearish') alignedSignals++;
      if (indicators.sma?.crossover === 'death') alignedSignals++;
      if (indicators.ema?.trend === 'down') alignedSignals++;
      if (indicators.trend?.direction === 'down') alignedSignals++;
    } else {
      // Hold signal - moderate confidence
      return 0.6;
    }
    
    return Math.min(0.95, 0.5 + (alignedSignals / totalIndicators) * 0.45);
  }
}