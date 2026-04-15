/**
 * Self-Improvement Engine
 * Automatically improves prediction models based on research findings
 * 
 * Improvement Methods:
 * 1. Weight Adjustment - Adjust model weights based on accuracy
 * 2. Threshold Refinement - Refine prediction thresholds
 * 3. Algorithm Update - Update algorithm parameters
 * 4. Pattern Integration - Integrate discovered patterns
 */

import { logger } from '../utils/logger.js';
import type { LearningMemory } from '../memory/memory-manager.js'; export type { LearningMemory };
import type { ResearchResult, CorrelationResult } from '../research/pattern-researcher.js';

export interface ModelWeights {
  trend: number;
  momentum: number;
  pattern: number;
  sentiment: number;
}

export interface PredictionThresholds {
  bullishThreshold: number; // Score > this = bullish
  bearishThreshold: number; // Score < this = bearish
  confidenceThreshold: number; // Min confidence to make prediction
}

export interface ImprovementResult {
  type: 'weight' | 'threshold' | 'algorithm' | 'pattern';
  description: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  expectedImprovement: number;
}

export class SelfImprovementEngine {
  private weights: ModelWeights;
  private thresholds: PredictionThresholds;
  
  constructor(
    weights: ModelWeights = { trend: 0.35, momentum: 0.25, pattern: 0.20, sentiment: 0.20 },
    thresholds: PredictionThresholds = { bullishThreshold: 0.3, bearishThreshold: -0.3, confidenceThreshold: 0.5 }
  ) {
    this.weights = weights;
    this.thresholds = thresholds;
  }
  
  /**
   * Improve models based on research results
   */
  async improve(researchResults: ResearchResult[]): Promise<LearningMemory[]> {
    logger.info(`Processing ${researchResults.length} research results for improvement`);
    
    const learnings: LearningMemory[] = [];
    
    for (const result of researchResults) {
      switch (result.type) {
        case 'correlation':
          const correlationLearning = this.processCorrelation(result);
          if (correlationLearning) learnings.push(correlationLearning);
          break;
          
        case 'pattern':
          const patternLearning = this.processPattern(result);
          if (patternLearning) learnings.push(patternLearning);
          break;
          
        case 'condition':
          const conditionLearning = this.processCondition(result);
          if (conditionLearning) learnings.push(conditionLearning);
          break;
          
        default:
          logger.debug(`Skipping unknown research type: ${result.type}`);
      }
    }
    
    logger.info(`Generated ${learnings.length} learnings`);
    return learnings;
  }
  
  /**
   * Process correlation findings and adjust weights
   */
  private processCorrelation(result: ResearchResult): LearningMemory | null {
    const correlation = result.data as unknown as CorrelationResult;
    
    if (correlation.significance !== 'high') {
      return null as LearningMemory | null; // Only process high-significance correlations
    }
    
    // Determine which weight to adjust
    const indicatorToModel: Record<string, keyof ModelWeights> = {
      'rsi': 'momentum',
      'macd': 'momentum',
      'sma': 'trend',
      'ema': 'trend',
      'bb': 'pattern',
      'volume': 'sentiment',
      'trend': 'trend'
    };
    
    const model1 = indicatorToModel[correlation.indicator1];
    const model2 = indicatorToModel[correlation.indicator2];
    
    if (!model1 || !model2) return null as LearningMemory | null;
    
    const beforeWeights = { ...this.weights };
    
    // Adjust weights based on correlation
    if (correlation.correlation > 0.6 && correlation.whenCorrect > 0.7) {
      // Increase weight for correlated indicators
      this.weights[model1] = Math.min(0.5, this.weights[model1] + 0.05);
      this.weights[model2] = Math.min(0.5, this.weights[model2] + 0.05);
      
      // Normalize weights to sum to 1
      this.normalizeWeights();
      
      return {
        id: `corr_${Date.now()}`,
        category: 'weight_adjustment',
        description: `Increased weight for correlated indicators: ${model1} and ${model2}`,
        beforeState: beforeWeights,
        afterState: { ...this.weights },
        improvementPercent: Math.abs(this.weights[model1] - beforeWeights[model1]) * 100,
        verifiedAt: new Date().toISOString()
      };
    }
    
    if (correlation.correlation < -0.3) {
      // Reduce weight when indicators contradict
      this.weights[model1] = Math.max(0.1, this.weights[model1] - 0.02);
      this.weights[model2] = Math.max(0.1, this.weights[model2] - 0.02);
      
      this.normalizeWeights();
      
      return {
        id: `corr_${Date.now()}`,
        category: 'weight_adjustment',
        description: `Reduced weight for contradicting indicators: ${model1} and ${model2}`,
        beforeState: beforeWeights,
        afterState: { ...this.weights },
        improvementPercent: Math.abs(this.weights[model1] - beforeWeights[model1]) * 100,
        verifiedAt: new Date().toISOString()
      };
    }
    
    return null as LearningMemory | null;
  }
  
  /**
   * Process pattern findings and integrate into models
   */
  private processPattern(result: ResearchResult): LearningMemory | null {
    const patternName = result.name;
    const successRate = result.confidence;
    
    if (successRate > 0.8) {
      // Winning pattern - increase pattern model weight
      const beforeWeights = { ...this.weights };
      
      this.weights.pattern = Math.min(0.4, this.weights.pattern + 0.03);
      this.normalizeWeights();
      
      return {
        id: `pattern_${Date.now()}`,
        category: 'algorithm_update',
        description: `Integrated winning pattern: ${patternName} (${successRate.toFixed(2)}% success)`,
        beforeState: beforeWeights,
        afterState: { ...this.weights, newPattern: patternName },
        improvementPercent: 3,
        verifiedAt: new Date().toISOString()
      };
    }
    
    if (patternName.startsWith('avoid_')) {
      // Losing pattern - add to avoid list
      return {
        id: `pattern_${Date.now()}`,
        category: 'algorithm_update',
        description: `Added pattern to avoid list: ${patternName}`,
        beforeState: { avoidPatterns: [] },
        afterState: { avoidPatterns: [patternName] },
        improvementPercent: 2,
        verifiedAt: new Date().toISOString()
      };
    }
    
    return null as LearningMemory | null;
  }
  
  /**
   * Process condition findings and refine thresholds
   */
  private processCondition(result: ResearchResult): LearningMemory | null {
    const conditionName = result.name;
    const accuracy = result.confidence;
    
    if (conditionName.includes('high_confidence') && accuracy > 0.8) {
      // High confidence predictions are accurate - increase threshold
      const beforeThresholds = { ...this.thresholds };
      
      this.thresholds.confidenceThreshold = Math.min(0.7, this.thresholds.confidenceThreshold + 0.05);
      
      return {
        id: `threshold_${Date.now()}`,
        category: 'threshold_refinement',
        description: `Raised confidence threshold due to high-accuracy condition`,
        beforeState: beforeThresholds,
        afterState: { ...this.thresholds },
        improvementPercent: Math.abs(this.thresholds.confidenceThreshold - beforeThresholds.confidenceThreshold) * 100,
        verifiedAt: new Date().toISOString()
      };
    }
    
    if (conditionName.includes('low_confidence') && accuracy < 0.5) {
      // Low confidence predictions are inaccurate - increase threshold
      const beforeThresholds = { ...this.thresholds };
      
      this.thresholds.confidenceThreshold = Math.max(0.6, this.thresholds.confidenceThreshold + 0.1);
      
      return {
        id: `threshold_${Date.now()}`,
        category: 'threshold_refinement',
        description: `Raised confidence threshold to filter low-accuracy predictions`,
        beforeState: beforeThresholds,
        afterState: { ...this.thresholds },
        improvementPercent: Math.abs(this.thresholds.confidenceThreshold - beforeThresholds.confidenceThreshold) * 100,
        verifiedAt: new Date().toISOString()
      };
    }
    
    // Timeframe accuracy adjustments
    if (conditionName.includes('short_term') && accuracy > 0.85) {
      // Short-term predictions are accurate - can reduce caution
      const beforeThresholds = { ...this.thresholds };
      
      this.thresholds.bullishThreshold = Math.max(0.25, this.thresholds.bullishThreshold - 0.02);
      this.thresholds.bearishThreshold = Math.min(-0.25, this.thresholds.bearishThreshold + 0.02);
      
      return {
        id: `threshold_${Date.now()}`,
        category: 'threshold_refinement',
        description: `Adjusted thresholds based on short-term accuracy`,
        beforeState: beforeThresholds,
        afterState: { ...this.thresholds },
        improvementPercent: 2,
        verifiedAt: new Date().toISOString()
      };
    }
    
    return null as LearningMemory | null;
  }
  
  /**
   * Get current weights (for predictor to use)
   */
  getWeights(): ModelWeights {
    return { ...this.weights };
  }
  
  /**
   * Get current thresholds (for predictor to use)
   */
  getThresholds(): PredictionThresholds {
    return { ...this.thresholds };
  }
  
  /**
   * Normalize weights to sum to 1.0
   */
  private normalizeWeights(): void {
    const total = Object.values(this.weights).reduce((a, b) => a + b, 0);
    
    if (total === 0) return;
    
    for (const key of Object.keys(this.weights)) {
      this.weights[key as keyof ModelWeights] /= total;
    }
  }
  
  /**
   * Get improvement summary
   */
  getImprovementSummary(): string {
    return `
Current Model Weights:
  Trend:      ${(this.weights.trend * 100).toFixed(1)}%
  Momentum:   ${(this.weights.momentum * 100).toFixed(1)}%
  Pattern:    ${(this.weights.pattern * 100).toFixed(1)}%
  Sentiment:  ${(this.weights.sentiment * 100).toFixed(1)}%

Current Thresholds:
  Bullish:    ${(this.thresholds.bullishThreshold * 100).toFixed(1)}%
  Bearish:    ${(this.thresholds.bearishThreshold * 100).toFixed(1)}%
  Confidence: ${(this.thresholds.confidenceThreshold * 100).toFixed(1)}%
`;
  }
}