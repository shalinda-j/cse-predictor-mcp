/**
 * Dual Feedback Loop
 * Connects Self-Research ↔ Self-Improvement ↔ Memory ↔ MCP Server
 * 
 * This creates a continuous learning cycle:
 * 
 *   Research → discovers patterns → feeds to Improvement
 *   Improvement → learns from patterns → updates Memory
 *   Memory → stores learnings → trains Predictor
 *   Predictor → makes predictions → outcomes tracked
 *   Outcomes → feed back to Research
 * 
 * The loop runs continuously, improving accuracy over time.
 */

import { logger } from '../utils/logger.js';
import { MemoryManager, PredictionMemory, type AccuracyMemory } from '../memory/memory-manager.js';
import { PatternResearcher, type ResearchResult } from '../research/pattern-researcher.js';
import { SelfImprovementEngine, type LearningMemory } from '../improvement/self-improvement.js';

export interface FeedbackLoopState {
  lastResearchTime: string;
  lastImprovementTime: string;
  totalResearchCycles: number;
  totalImprovementCycles: number;
  patternsDiscovered: number;
  learningsApplied: number;
  currentAccuracy: number;
  accuracyTrend: 'improving' | 'stable' | 'declining';
}

export class DualFeedbackLoop {
  private memory: MemoryManager;
  private researcher: PatternResearcher;
  private improver: SelfImprovementEngine;
  
  private state: FeedbackLoopState;
  private isRunning: boolean = false;
  private intervalMs: number = 3600000; // 1 hour default
  
  constructor(
    memoryPath: string = './memory',
    intervalMinutes: number = 60
  ) {
    this.memory = new MemoryManager(memoryPath);
    this.researcher = new PatternResearcher();
    this.improver = new SelfImprovementEngine();
    
    this.intervalMs = intervalMinutes * 60 * 1000;
    
    this.state = {
      lastResearchTime: '',
      lastImprovementTime: '',
      totalResearchCycles: 0,
      totalImprovementCycles: 0,
      patternsDiscovered: 0,
      learningsApplied: 0,
      currentAccuracy: 0,
      accuracyTrend: 'stable'
    };
  }
  
  /**
   * Start the continuous feedback loop
   */
  async start(): Promise<void> {
    logger.info('Starting Dual Feedback Loop');
    
    this.isRunning = true;
    
    // Run initial cycle
    await this.runCycle();
    
    // Schedule periodic cycles
    this.scheduleNextCycle();
  }
  
  /**
   * Stop the feedback loop
   */
  stop(): void {
    logger.info('Stopping Dual Feedback Loop');
    this.isRunning = false;
  }
  
  /**
   * Run one complete feedback cycle
   */
  async runCycle(): Promise<void> {
    if (!this.isRunning) return;
    
    logger.info('Running Dual Feedback Loop cycle');
    
    try {
      // Step 1: Get predictions with outcomes
      const predictions = await this.memory.getRecentPredictions(30);
      const verifiedPredictions = predictions.filter(p => p.outcome);
      
      if (verifiedPredictions.length < 5) {
        logger.warn('Not enough verified predictions for research (need at least 5)');
        return;
      }
      
      // Step 2: Research patterns from outcomes
      logger.info('Phase 1: Researching patterns');
      const researchResults = await this.researcher.researchPatterns(verifiedPredictions);
      this.state.lastResearchTime = new Date().toISOString();
      this.state.totalResearchCycles++;
      this.state.patternsDiscovered += researchResults.length;
      
      // Step 3: Store discovered patterns
      logger.info('Phase 2: Storing discovered patterns');
      for (const result of researchResults) {
        if (result.type === 'pattern' && result.confidence > 0.7) {
          await this.memory.storePattern({
            id: `pattern_${Date.now()}_${result.name}`,
            name: result.name,
            description: result.description,
            indicators: [],
            conditions: result.data as Record<string, unknown>,
            successRate: result.confidence,
            totalOccurrences: 1,
            lastUpdated: new Date().toISOString(),
            examples: []
          });
        }
      }
      
      // Step 4: Process improvements
      logger.info('Phase 3: Processing improvements');
      const learnings = await this.improver.improve(researchResults);
      this.state.lastImprovementTime = new Date().toISOString();
      this.state.totalImprovementCycles++;
      this.state.learningsApplied += learnings.length;
      
      // Step 5: Store learnings in memory
      logger.info('Phase 4: Storing learnings');
      for (const learning of learnings) {
        await this.memory.storeLearning(learning);
      }
      
      // Step 6: Calculate and store accuracy
      logger.info('Phase 5: Calculating accuracy');
      const accuracy = await this.calculateAccuracy(verifiedPredictions);
      this.state.currentAccuracy = accuracy.overall;
      
      await this.memory.storeDailyAccuracy({
        date: new Date().toISOString().split('T')[0] ?? '',
        totalPredictions: accuracy.total,
        correctPredictions: accuracy.correct,
        accuracy: accuracy.overall,
        byTimeframe: accuracy.byTimeframe,
        bySignal: accuracy.bySignal,
        bestPatterns: researchResults.filter(r => r.confidence > 0.7).map(r => r.name),
        worstPatterns: researchResults.filter(r => r.confidence < 0.4).map(r => r.name)
      });
      
      // Step 7: Determine accuracy trend
      this.updateAccuracyTrend();
      
      // Step 8: Generate summary
      logger.info('Dual Feedback Loop cycle complete');
      logger.info(this.getSummary());
      
    } catch (error) {
      logger.error(`Dual Feedback Loop error: ${error}`);
    }
  }
  
  /**
   * Calculate accuracy metrics
   */
  private async calculateAccuracy(predictions: PredictionMemory[]): Promise<{
    overall: number;
    total: number;
    correct: number;
    byTimeframe: Record<string, { total: number; correct: number; accuracy: number }>;
    bySignal: Record<string, { total: number; correct: number; accuracy: number }>;
  }> {
    const total = predictions.length;
    const correct = predictions.filter(p => p.outcome?.wasCorrect).length;
    const overall = total > 0 ? correct / total : 0;
    
    // By timeframe
    const byTimeframe: Record<string, { total: number; correct: number; accuracy: number }> = {
      short: { total: 0, correct: 0, accuracy: 0 },
      medium: { total: 0, correct: 0, accuracy: 0 },
      long: { total: 0, correct: 0, accuracy: 0 }
    };
    
    for (const pred of predictions) {
      byTimeframe[pred.timeframe].total++;
      if (pred.outcome?.wasCorrect) {
        byTimeframe[pred.timeframe].correct++;
      }
    }
    
    for (const timeframe of Object.keys(byTimeframe)) {
      const stats = byTimeframe[timeframe];
      stats.accuracy = stats.total > 0 ? stats.correct / stats.total : 0;
    }
    
    // By signal
    const bySignal: Record<string, { total: number; correct: number; accuracy: number }> = {
      bullish: { total: 0, correct: 0, accuracy: 0 },
      bearish: { total: 0, correct: 0, accuracy: 0 },
      neutral: { total: 0, correct: 0, accuracy: 0 }
    };
    
    for (const pred of predictions) {
      bySignal[pred.prediction].total++;
      if (pred.outcome?.wasCorrect) {
        bySignal[pred.prediction].correct++;
      }
    }
    
    for (const signal of Object.keys(bySignal)) {
      const stats = bySignal[signal];
      stats.accuracy = stats.total > 0 ? stats.correct / stats.total : 0;
    }
    
    return { overall, total, correct, byTimeframe, bySignal };
  }
  
  /**
   * Update accuracy trend based on history
   */
  private async updateAccuracyTrend(): Promise<void> {
    const history = await this.memory.getAccuracyHistory(7);
    
    if (history.length < 3) {
      this.state.accuracyTrend = 'stable';
      return;
    }
    
    const recent = history.slice(0, 3);
    const older = history.slice(3, 7);
    
    const recentAvg = recent.reduce((sum, a) => sum + a.accuracy, 0) / recent.length;
    const olderAvg = older.length > 0 ? older.reduce((sum, a) => sum + a.accuracy, 0) / older.length : recentAvg;
    
    if (recentAvg > olderAvg + 0.05) {
      this.state.accuracyTrend = 'improving';
    } else if (recentAvg < olderAvg - 0.05) {
      this.state.accuracyTrend = 'declining';
    } else {
      this.state.accuracyTrend = 'stable';
    }
  }
  
  /**
   * Schedule next cycle
   */
  private scheduleNextCycle(): void {
    if (!this.isRunning) return;
    
    setTimeout(() => {
      this.runCycle().then(() => {
        this.scheduleNextCycle();
      });
    }, this.intervalMs);
    
    logger.debug(`Next cycle scheduled in ${this.intervalMs / 60000} minutes`);
  }
  
  /**
   * Get current state
   */
  getState(): FeedbackLoopState {
    return { ...this.state };
  }
  
  /**
   * Get current weights and thresholds (for predictor)
   */
  getModelConfiguration(): {
    weights: ReturnType<SelfImprovementEngine['getWeights']>;
    thresholds: ReturnType<SelfImprovementEngine['getThresholds']>;
  } {
    return {
      weights: this.improver.getWeights(),
      thresholds: this.improver.getThresholds()
    };
  }
  
  /**
   * Get summary report
   */
  getSummary(): string {
    return `
╔════════════════════════════════════════════════════════════╗
║           DUAL FEEDBACK LOOP - STATUS REPORT                ║
╠════════════════════════════════════════════════════════════╣
║                                                             ║
║  Last Research:      ${this.state.lastResearchTime || 'Never'}              ║
║  Last Improvement:   ${this.state.lastImprovementTime || 'Never'}              ║
║                                                             ║
║  Research Cycles:    ${this.state.totalResearchCycles}                              ║
║  Improvement Cycles: ${this.state.totalImprovementCycles}                              ║
║  Patterns Found:     ${this.state.patternsDiscovered}                              ║
║  Learnings Applied:  ${this.state.learningsApplied}                              ║
║                                                             ║
║  Current Accuracy:   ${(this.state.currentAccuracy * 100).toFixed(1)}%                           ║
║  Accuracy Trend:     ${this.state.accuracyTrend}                          ║
║                                                             ║
╚════════════════════════════════════════════════════════════╝

${this.improver.getImprovementSummary()}
`;
  }
}