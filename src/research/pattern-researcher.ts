/**
 * Pattern Researcher
 * Automatically discovers patterns from prediction outcomes
 * 
 * Research Methods:
 * 1. Correlation Analysis - Find indicator correlations with outcomes
 * 2. Pattern Discovery - Find winning/losing patterns
 * 3. Condition Analysis - Find optimal market conditions
 * 4. Trend Analysis - Find trend-based patterns
 */

import { logger } from '../utils/logger.js';
import type { PredictionMemory, PatternMemory } from '../memory/memory-manager.js';

export interface ResearchResult {
  type: 'correlation' | 'pattern' | 'condition' | 'trend';
  name: string;
  description: string;
  data: Record<string, unknown>;
  confidence: number;
  recommendation: string;
}

export interface CorrelationResult {
  indicator1: string;
  indicator2: string;
  correlation: number; // -1 to 1
  whenCorrect: number;
  significance: 'high' | 'medium' | 'low';
}

export class PatternResearcher {
  
  /**
   * Research patterns from prediction history
   */
  async researchPatterns(predictions: PredictionMemory[]): Promise<ResearchResult[]> {
    logger.info(`Researching patterns from ${predictions.length} predictions`);
    
    const results: ResearchResult[] = [];
    
    // 1. Correlation Analysis
    const correlations = this.findCorrelations(predictions);
    for (const corr of correlations) {
      results.push({
        type: 'correlation',
        name: `${corr.indicator1}_${corr.indicator2}`,
        description: `Correlation between ${corr.indicator1} and ${corr.indicator2}: ${corr.correlation.toFixed(2)}`,
        data: corr as unknown as Record<string, unknown>,
        confidence: Math.abs(corr.correlation),
        recommendation: corr.correlation > 0.5 
          ? `Consider increasing weight for ${corr.indicator1} when ${corr.indicator2} confirms`
          : `Consider separating ${corr.indicator1} and ${corr.indicator2} signals`
      });
    }
    
    // 2. Winning Patterns
    const winningPatterns = this.findWinningPatterns(predictions);
    for (const pattern of winningPatterns) {
      results.push({
        type: 'pattern',
        name: pattern.name,
        description: pattern.description,
        data: pattern as unknown as Record<string, unknown>,
        confidence: pattern.successRate,
        recommendation: `High confidence pattern: prioritize in predictions`
      });
    }
    
    // 3. Losing Patterns (to avoid)
    const losingPatterns = this.findLosingPatterns(predictions);
    for (const pattern of losingPatterns) {
      results.push({
        type: 'pattern',
        name: `avoid_${pattern.name}`,
        description: `Pattern to avoid: ${pattern.description}`,
        data: pattern as unknown as Record<string, unknown>,
        confidence: 1 - pattern.successRate,
        recommendation: `Reduce confidence when this pattern appears`
      });
    }
    
    // 4. Condition Analysis
    const conditions = this.analyzeConditions(predictions);
    for (const condition of conditions) {
      results.push({
        type: 'condition',
        name: condition.name,
        description: condition.description,
        data: condition,
        confidence: condition.accuracy,
        recommendation: condition.accuracy > 0.7
          ? `Optimal condition: ${condition.name}`
          : `Avoid condition: ${condition.name}`
      });
    }
    
    logger.info(`Found ${results.length} research results`);
    return results;
  }
  
  /**
   * Find correlations between indicators and outcomes
   */
  private findCorrelations(predictions: PredictionMemory[]): CorrelationResult[] {
    const verifiedPredictions = predictions.filter(p => p.outcome);
    
    if (verifiedPredictions.length < 10) {
      logger.warn('Not enough verified predictions for correlation analysis');
      return [];
    }
    
    const correlations: CorrelationResult[] = [];
    const indicators = Object.keys(verifiedPredictions[0]?.indicators ?? {});
    
    // Compare pairs of indicators
    for (let i = 0; i < indicators.length; i++) {
      for (let j = i + 1; j < indicators.length; j++) {
        const ind1 = indicators[i];
        const ind2 = indicators[j];
        
        const correlation = this.calculateCorrelation(
          verifiedPredictions.map(p => this.extractIndicatorValue(p.indicators, ind1)),
          verifiedPredictions.map(p => p.outcome?.wasCorrect ? 1 : 0)
        );
        
        const whenCorrect = this.calculateCorrelationWhenCorrect(
          verifiedPredictions,
          ind1,
          ind2
        );
        
        if (Math.abs(correlation) > 0.3) {
          correlations.push({
            indicator1: ind1,
            indicator2: ind2,
            correlation,
            whenCorrect,
            significance: Math.abs(correlation) > 0.6 ? 'high' : 
                          Math.abs(correlation) > 0.4 ? 'medium' : 'low'
          });
        }
      }
    }
    
    return correlations.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
  }
  
  /**
   * Find patterns that lead to correct predictions
   */
  private findWinningPatterns(predictions: PredictionMemory[]): PatternMemory[] {
    const correctPredictions = predictions.filter(p => p.outcome?.wasCorrect);
    
    const patterns: Map<string, PatternMemory> = new Map();
    
    // Group by similar indicator combinations
    for (const pred of correctPredictions) {
      const patternKey = this.generatePatternKey(pred.indicators);
      
      if (!patterns.has(patternKey)) {
        patterns.set(patternKey, {
          id: `win_${patternKey}`,
          name: `Winning Pattern: ${patternKey}`,
          description: `Combination of indicators that leads to correct predictions`,
          indicators: Object.keys(pred.indicators),
          conditions: pred.indicators,
          successRate: 1,
          totalOccurrences: 1,
          lastUpdated: new Date().toISOString(),
          examples: []
        });
      } else {
        const pattern = patterns.get(patternKey)!;
        pattern.totalOccurrences++;
        pattern.examples.push({
          symbol: pred.symbol,
          timestamp: pred.timestamp,
          outcome: true
        });
      }
    }
    
    // Also check incorrect predictions to calculate actual success rate
    for (const pred of predictions.filter(p => p.outcome && !p.outcome.wasCorrect)) {
      const patternKey = this.generatePatternKey(pred.indicators);
      
      if (patterns.has(patternKey)) {
        const pattern = patterns.get(patternKey)!;
        pattern.totalOccurrences++;
        const correctCount = pattern.examples.length;
        pattern.successRate = correctCount / pattern.totalOccurrences;
      }
    }
    
    return Array.from(patterns.values())
      .filter(p => p.successRate >= 0.7 && p.totalOccurrences >= 3)
      .sort((a, b) => b.successRate - a.successRate);
  }
  
  /**
   * Find patterns that lead to incorrect predictions
   */
  private findLosingPatterns(predictions: PredictionMemory[]): PatternMemory[] {
    const incorrectPredictions = predictions.filter(p => p.outcome && !p.outcome.wasCorrect);
    
    const patterns: Map<string, PatternMemory> = new Map();
    
    for (const pred of incorrectPredictions) {
      const patternKey = this.generatePatternKey(pred.indicators);
      
      if (!patterns.has(patternKey)) {
        patterns.set(patternKey, {
          id: `lose_${patternKey}`,
          name: `Losing Pattern: ${patternKey}`,
          description: `Combination of indicators that leads to incorrect predictions`,
          indicators: Object.keys(pred.indicators),
          conditions: pred.indicators,
          successRate: 0,
          totalOccurrences: 1,
          lastUpdated: new Date().toISOString(),
          examples: []
        });
      } else {
        const pattern = patterns.get(patternKey)!;
        pattern.totalOccurrences++;
      }
    }
    
    // Check correct predictions for success rate
    for (const pred of predictions.filter(p => p.outcome?.wasCorrect)) {
      const patternKey = this.generatePatternKey(pred.indicators);
      
      if (patterns.has(patternKey)) {
        const pattern = patterns.get(patternKey)!;
        pattern.totalOccurrences++;
        const incorrectCount = pattern.examples.length;
        pattern.successRate = 1 - (incorrectCount / pattern.totalOccurrences);
      }
    }
    
    return Array.from(patterns.values())
      .filter(p => p.successRate < 0.4 && p.totalOccurrences >= 3)
      .sort((a, b) => a.successRate - b.successRate);
  }
  
  /**
   * Analyze market conditions for predictions
   */
  private analyzeConditions(predictions: PredictionMemory[]): Array<{
    name: string;
    description: string;
    accuracy: number;
    conditions: Record<string, unknown>;
  }> {
    const verifiedPredictions = predictions.filter(p => p.outcome);
    
    // Analyze by timeframe
    const byTimeframe: Record<string, { total: number; correct: number }> = {
      short: { total: 0, correct: 0 },
      medium: { total: 0, correct: 0 },
      long: { total: 0, correct: 0 }
    };
    
    for (const pred of verifiedPredictions) {
      byTimeframe[pred.timeframe].total++;
      if (pred.outcome?.wasCorrect) {
        byTimeframe[pred.timeframe].correct++;
      }
    }
    
    const conditions: Array<{
      name: string;
      description: string;
      accuracy: number;
      conditions: Record<string, unknown>;
    }> = [];
    
    for (const [timeframe, stats] of Object.entries(byTimeframe)) {
      if (stats.total > 0) {
        conditions.push({
          name: `${timeframe}_term_predictions`,
          description: `Accuracy for ${timeframe}-term predictions`,
          accuracy: stats.correct / stats.total,
          conditions: { timeframe }
        });
      }
    }
    
    // Analyze by confidence level
    const highConfidence = verifiedPredictions.filter(p => p.confidence >= 0.7);
    const lowConfidence = verifiedPredictions.filter(p => p.confidence < 0.5);
    
    if (highConfidence.length > 0) {
      const correctHigh = highConfidence.filter(p => p.outcome?.wasCorrect).length;
      conditions.push({
        name: 'high_confidence_predictions',
        description: 'Predictions with confidence >= 70%',
        accuracy: correctHigh / highConfidence.length,
        conditions: { minConfidence: 0.7 }
      });
    }
    
    if (lowConfidence.length > 0) {
      const correctLow = lowConfidence.filter(p => p.outcome?.wasCorrect).length;
      conditions.push({
        name: 'low_confidence_predictions',
        description: 'Predictions with confidence < 50%',
        accuracy: correctLow / lowConfidence.length,
        conditions: { maxConfidence: 0.5 }
      });
    }
    
    return conditions.sort((a, b) => b.accuracy - a.accuracy);
  }
  
  // =====================
  // HELPER METHODS
  // =====================
  
  private calculateCorrelation(x: number[], y: number[]): number {
    const n = x.length;
    if (n === 0) return 0;
    
    const meanX = x.reduce((a, b) => a + b, 0) / n;
    const meanY = y.reduce((a, b) => a + b, 0) / n;
    
    let sumXY = 0;
    let sumX2 = 0;
    let sumY2 = 0;
    
    for (let i = 0; i < n; i++) {
      sumXY += (x[i] - meanX) * (y[i] - meanY);
      sumX2 += Math.pow(x[i] - meanX, 2);
      sumY2 += Math.pow(y[i] - meanY, 2);
    }
    
    if (sumX2 === 0 || sumY2 === 0) return 0;
    
    return sumXY / Math.sqrt(sumX2 * sumY2);
  }
  
  private calculateCorrelationWhenCorrect(
    predictions: PredictionMemory[],
    ind1: string,
    ind2: string
  ): number {
    const correct = predictions.filter(p => p.outcome?.wasCorrect);
    
    const values1 = correct.map(p => this.extractIndicatorValue(p.indicators, ind1));
    const values2 = correct.map(p => this.extractIndicatorValue(p.indicators, ind2));
    
    return this.calculateCorrelation(values1, values2);
  }
  
  private extractIndicatorValue(indicators: Record<string, unknown>, name: string): number {
    const value = indicators[name];
    
    if (typeof value === 'number') return value;
    if (typeof value === 'object' && value !== null) {
      const obj = value as Record<string, unknown>;
      if ('value' in obj && typeof obj.value === 'number') return obj.value;
      if ('score' in obj && typeof obj.score === 'number') return obj.score;
    }
    
    return 0;
  }
  
  private generatePatternKey(indicators: Record<string, unknown>): string {
    const keys = Object.keys(indicators).sort();
    const values = keys.map(k => {
      const v = indicators[k];
      if (typeof v === 'object' && v !== null) {
        const obj = v as Record<string, unknown>;
        if ('signal' in obj) return obj.signal;
        if ('trend' in obj) return obj.trend;
      }
      if (typeof v === 'number') {
        if (v > 0.3) return 'positive';
        if (v < -0.3) return 'negative';
        return 'neutral';
      }
      return 'unknown';
    });
    
    return keys.map((k, i) => `${k}:${values[i]}`).join('_');
  }
}