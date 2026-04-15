/**
 * Memory Manager
 * Handles all memory storage, retrieval, and organization
 * 
 * Memory Layers:
 * - Short-term: Recent predictions (last 7 days)
 * - Medium-term: Pattern discoveries (last 30 days)
 * - Long-term: Curated learnings (MEMORY.md)
 */

import fs from 'fs/promises';
import path from 'path';
import { logger } from '../utils/logger.js';

// Types
export interface PredictionMemory {
  id: string;
  symbol: string;
  prediction: 'bullish' | 'bearish' | 'neutral';
  confidence: number;
  timeframe: 'short' | 'medium' | 'long';
  timestamp: string;
  outcome?: {
    actualDirection: 'bullish' | 'bearish' | 'neutral';
    actualPriceChange: number;
    wasCorrect: boolean;
    verifiedAt: string;
  };
  indicators: Record<string, unknown>;
}

export interface PatternMemory {
  id: string;
  name: string;
  description: string;
  indicators: string[];
  conditions: Record<string, unknown>;
  successRate: number;
  totalOccurrences: number;
  lastUpdated: string;
  examples: Array<{ symbol: string; timestamp: string; outcome: boolean }>;
}

export interface LearningMemory {
  id: string;
  category: 'weight_adjustment' | 'threshold_refinement' | 'algorithm_update' | 'correlation_discovery';
  description: string;
  beforeState: Record<string, unknown>;
  afterState: Record<string, unknown>;
  improvementPercent: number;
  verifiedAt: string;
}

export interface AccuracyMemory {
  date: string;
  totalPredictions: number;
  correctPredictions: number;
  accuracy: number;
  byTimeframe: Record<string, { total: number; correct: number; accuracy: number }>;
  bySignal: Record<string, { total: number; correct: number; accuracy: number }>;
  bestPatterns: string[];
  worstPatterns: string[];
}

export class MemoryManager {
  private basePath: string;
  
  constructor(basePath: string = './memory') {
    this.basePath = basePath;
    this.initializeDirectories();
  }
  
  private async initializeDirectories(): Promise<void> {
    const dirs = ['daily', 'patterns', 'learnings', 'training', 'predictions', 'outcomes'];
    
    for (const dir of dirs) {
      const fullPath = path.join(this.basePath, dir);
      try {
        await fs.mkdir(fullPath, { recursive: true });
      } catch {
        // Directory exists
      }
    }
    
    logger.info('Memory directories initialized');
  }
  
  // =====================
  // PREDICTION MEMORY
  // =====================
  
  async storePrediction(prediction: PredictionMemory): Promise<string> {
    const filename = `${prediction.symbol}_${prediction.timestamp.split('T')[0]}_${prediction.id}.json`;
    const filepath = path.join(this.basePath, 'predictions', filename);
    
    await fs.writeFile(filepath, JSON.stringify(prediction, null, 2));
    
    logger.debug(`Stored prediction: ${filename}`);
    return filename;
  }
  
  async getPrediction(id: string): Promise<PredictionMemory | null> {
    const files = await fs.readdir(path.join(this.basePath, 'predictions'));
    const matchingFile = files.find(f => f.includes(id));
    
    if (!matchingFile) return null;
    
    const content = await fs.readFile(path.join(this.basePath, 'predictions', matchingFile), 'utf-8');
    return JSON.parse(content) as PredictionMemory;
  }
  
  async getRecentPredictions(days: number = 7): Promise<PredictionMemory[]> {
    const files = await fs.readdir(path.join(this.basePath, 'predictions'));
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    const predictions: PredictionMemory[] = [];
    
    for (const file of files) {
      const content = await fs.readFile(path.join(this.basePath, 'predictions', file), 'utf-8');
      const prediction = JSON.parse(content) as PredictionMemory;
      
      if (new Date(prediction.timestamp) >= cutoffDate) {
        predictions.push(prediction);
      }
    }
    
    return predictions.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }
  
  async updatePredictionOutcome(id: string, outcome: PredictionMemory['outcome']): Promise<void> {
    const prediction = await this.getPrediction(id);
    
    if (!prediction) {
      logger.error(`Prediction not found: ${id}`);
      return;
    }
    
    prediction.outcome = outcome;
    
    // Re-store with outcome
    const filename = `${prediction.symbol}_${prediction.timestamp.split('T')[0]}_${prediction.id}.json`;
    const filepath = path.join(this.basePath, 'predictions', filename);
    await fs.writeFile(filepath, JSON.stringify(prediction, null, 2));
    
    // Also store in outcomes directory
    const outcomeFilename = `${outcome?.verifiedAt.split('T')[0]}_${id}.json`;
    await fs.writeFile(
      path.join(this.basePath, 'outcomes', outcomeFilename),
      JSON.stringify({ predictionId: id, outcome }, null, 2)
    );
    
    logger.info(`Updated outcome for prediction ${id}: ${outcome?.wasCorrect ? 'CORRECT' : 'INCORRECT'}`);
  }
  
  // =====================
  // PATTERN MEMORY
  // =====================
  
  async storePattern(pattern: PatternMemory): Promise<string> {
    const filename = `pattern_${pattern.id}.json`;
    const filepath = path.join(this.basePath, 'patterns', filename);
    
    await fs.writeFile(filepath, JSON.stringify(pattern, null, 2));
    
    logger.info(`Stored pattern: ${pattern.name} (${pattern.successRate.toFixed(2)}% success)`);
    return filename;
  }
  
  async getPatterns(): Promise<PatternMemory[]> {
    const files = await fs.readdir(path.join(this.basePath, 'patterns'));
    const patterns: PatternMemory[] = [];
    
    for (const file of files) {
      const content = await fs.readFile(path.join(this.basePath, 'patterns', file), 'utf-8');
      patterns.push(JSON.parse(content) as PatternMemory);
    }
    
    return patterns.sort((a, b) => b.successRate - a.successRate);
  }
  
  async getBestPatterns(limit: number = 5): Promise<PatternMemory[]> {
    const patterns = await this.getPatterns();
    return patterns
      .filter(p => p.totalOccurrences >= 5) // Minimum occurrences
      .slice(0, limit);
  }
  
  async updatePatternStats(patternId: string, outcome: boolean): Promise<void> {
    const patterns = await this.getPatterns();
    const pattern = patterns.find(p => p.id === patternId);
    
    if (!pattern) return;
    
    pattern.totalOccurrences++;
    if (outcome) {
      const correctCount = Math.floor(pattern.successRate * (pattern.totalOccurrences - 1));
      pattern.successRate = (correctCount + 1) / pattern.totalOccurrences;
    } else {
      const correctCount = Math.floor(pattern.successRate * (pattern.totalOccurrences - 1));
      pattern.successRate = correctCount / pattern.totalOccurrences;
    }
    
    pattern.lastUpdated = new Date().toISOString();
    
    await this.storePattern(pattern);
  }
  
  // =====================
  // LEARNING MEMORY
  // =====================
  
  async storeLearning(learning: LearningMemory): Promise<string> {
    const filename = `learning_${learning.category}_${learning.id}.json`;
    const filepath = path.join(this.basePath, 'learnings', filename);
    
    await fs.writeFile(filepath, JSON.stringify(learning, null, 2));
    
    logger.info(`Stored learning: ${learning.category} (${learning.improvementPercent.toFixed(2)}% improvement)`);
    return filename;
  }
  
  async getLearnings(category?: string): Promise<LearningMemory[]> {
    const files = await fs.readdir(path.join(this.basePath, 'learnings'));
    const learnings: LearningMemory[] = [];
    
    for (const file of files) {
      const content = await fs.readFile(path.join(this.basePath, 'learnings', file), 'utf-8');
      const learning = JSON.parse(content) as LearningMemory;
      
      if (!category || learning.category === category) {
        learnings.push(learning);
      }
    }
    
    return learnings.sort((a, b) => b.improvementPercent - a.improvementPercent);
  }
  
  // =====================
  // ACCURACY MEMORY
  // =====================
  
  async storeDailyAccuracy(accuracy: AccuracyMemory): Promise<void> {
    const filename = `accuracy_${accuracy.date}.json`;
    const filepath = path.join(this.basePath, 'daily', filename);
    
    await fs.writeFile(filepath, JSON.stringify(accuracy, null, 2));
    
    logger.info(`Stored daily accuracy for ${accuracy.date}: ${accuracy.accuracy.toFixed(2)}%`);
  }
  
  async getAccuracyHistory(days: number = 30): Promise<AccuracyMemory[]> {
    const files = await fs.readdir(path.join(this.basePath, 'daily'));
    const accuracies: AccuracyMemory[] = [];
    
    for (const file of files) {
      const content = await fs.readFile(path.join(this.basePath, 'daily', file), 'utf-8');
      accuracies.push(JSON.parse(content) as AccuracyMemory);
    }
    
    return accuracies
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, days);
  }
  
  // =====================
  // LONG-TERM MEMORY (MEMORY.md)
  // =====================
  
  async updateLongTermMemory(key: string, value: string): Promise<void> {
    // This would update MEMORY.md in the workspace
    // For now, store as a learning
    const learning: LearningMemory = {
      id: `ltm_${Date.now()}`,
      category: 'algorithm_update',
      description: `Long-term memory update: ${key}`,
      beforeState: {},
      afterState: { [key]: value },
      improvementPercent: 0,
      verifiedAt: new Date().toISOString()
    };
    
    await this.storeLearning(learning);
  }
  
  // =====================
  // SUMMARY & REPORTS
  // =====================
  
  async generateMemorySummary(): Promise<{
    totalPredictions: number;
    pendingOutcomes: number;
    verifiedOutcomes: number;
    patternsCount: number;
    learningsCount: number;
    currentAccuracy: number;
  }> {
    const predictions = await this.getRecentPredictions(365);
    const patterns = await this.getPatterns();
    const learnings = await this.getLearnings();
    const accuracyHistory = await this.getAccuracyHistory(1);
    
    const pendingOutcomes = predictions.filter(p => !p.outcome).length;
    const verifiedOutcomes = predictions.filter(p => p.outcome).length;
    const correctOutcomes = predictions.filter(p => p.outcome?.wasCorrect).length;
    
    return {
      totalPredictions: predictions.length,
      pendingOutcomes,
      verifiedOutcomes,
      patternsCount: patterns.length,
      learningsCount: learnings.length,
      currentAccuracy: verifiedOutcomes > 0 ? correctOutcomes / verifiedOutcomes : 0
    };
  }
}