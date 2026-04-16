import Database from 'better-sqlite3';
import { logger } from '../utils/logger.js';
import type { PredictionResult } from '../tools/predictor.js';

export interface StoredPrediction {
  id: string;
  symbol: string;
  prediction: string;
  confidence: number;
  timeframe: string;
  targetPrice: number;
  madeAt: string;
  status: string;
  resolvedAt?: string;
  actualPrice?: number;
  correct?: boolean;
}

export interface AccuracyStats {
  totalPredictions: number;
  resolvedPredictions: number;
  correctPredictions: number;
  accuracy: number;
  byTimeframe: Record<string, { total: number; correct: number; accuracy: number }>;
  bySignal: Record<string, { total: number; correct: number; accuracy: number }>;
}

const DB_PATH = './data/predictions.db';

export class PredictionStore {
  private db: Database.Database;

  constructor() {
    this.db = new Database(DB_PATH);
    this.initTables();
  }

  private initTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS predictions (
        id TEXT PRIMARY KEY,
        symbol TEXT NOT NULL,
        prediction TEXT NOT NULL,
        confidence REAL,
        timeframe TEXT,
        target_price REAL,
        made_at DATETIME,
        status TEXT DEFAULT 'pending',
        resolved_at DATETIME,
        actual_price REAL,
        correct BOOLEAN
      );
      CREATE INDEX IF NOT EXISTS idx_symbol ON predictions(symbol);
      CREATE INDEX IF NOT EXISTS idx_status ON predictions(status);
      CREATE TABLE IF NOT EXISTS price_history (
        symbol TEXT NOT NULL,
        date DATE NOT NULL,
        open REAL,
        high REAL,
        low REAL,
        close REAL,
        volume INTEGER,
        PRIMARY KEY (symbol, date)
      );
    `);
    logger.info('Database initialized at ' + DB_PATH);
  }

  storePrediction(result: PredictionResult): string {
    const id = 'pred_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
    const stmt = this.db.prepare(`
      INSERT INTO predictions (id, symbol, prediction, confidence, timeframe, target_price, made_at, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
    `);
    stmt.run(
      id,
      result.symbol,
      result.prediction,
      result.confidence,
      result.timeframe,
      result.targetPrice ?? null,
      result.timestamp
    );
    logger.info('Stored prediction ' + id + ' for ' + result.symbol);
    return id;
  }

  resolvePrediction(id: string, actualPrice: number): boolean {
    const pred = this.getPrediction(id);
    if (!pred || pred.status === 'resolved') {
      return false;
    }

    // Check if prediction was correct
    let correct = false;
    if (pred.prediction === 'bullish') {
      correct = actualPrice >= (pred.targetPrice ?? 0) * 0.95;
    } else if (pred.prediction === 'bearish') {
      correct = actualPrice <= (pred.targetPrice ?? 0) * 1.05;
    } else {
      correct = true; // neutral is always within range
    }

    const stmt = this.db.prepare(`
      UPDATE predictions 
      SET status = 'resolved', resolved_at = ?, actual_price = ?, correct = ?
      WHERE id = ?
    `);
    stmt.run(new Date().toISOString(), actualPrice, correct, id);
    logger.info('Resolved prediction ' + id + ': ' + (correct ? 'CORRECT' : 'INCORRECT'));
    return correct;
  }

  getPrediction(id: string): StoredPrediction | null {
    const stmt = this.db.prepare('SELECT * FROM predictions WHERE id = ?');
    return stmt.get(id) as StoredPrediction | null;
  }

  getPendingPredictions(): StoredPrediction[] {
    const stmt = this.db.prepare('SELECT * FROM predictions WHERE status = ?');
    return stmt.all('pending') as StoredPrediction[];
  }

  getPredictionsBySymbol(symbol: string): StoredPrediction[] {
    const stmt = this.db.prepare('SELECT * FROM predictions WHERE symbol = ? ORDER BY made_at DESC');
    return stmt.all(symbol.toUpperCase()) as StoredPrediction[];
  }

  getAccuracyStats(): AccuracyStats {
    const statsStmt = this.db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) as resolved,
        SUM(CASE WHEN correct = 1 THEN 1 ELSE 0 END) as correct
      FROM predictions
    `);
    const stats = statsStmt.get() as { total: number; resolved: number; correct: number };

    // By timeframe
    const byTimeframe: Record<string, { total: number; correct: number; accuracy: number }> = {};
    const tfStmt = this.db.prepare(`
      SELECT timeframe, COUNT(*) as total, SUM(CASE WHEN correct = 1 THEN 1 ELSE 0 END) as correct
      FROM predictions WHERE status = 'resolved' GROUP BY timeframe
    `);
    const tfRows = tfStmt.all() as Array<{ timeframe: string; total: number; correct: number }>;
    for (const row of tfRows) {
      byTimeframe[row.timeframe] = {
        total: row.total,
        correct: row.correct,
        accuracy: row.total > 0 ? row.correct / row.total : 0
      };
    }

    // By signal (bullish/bearish/neutral)
    const bySignal: Record<string, { total: number; correct: number; accuracy: number }> = {};
    const sigStmt = this.db.prepare(`
      SELECT prediction, COUNT(*) as total, SUM(CASE WHEN correct = 1 THEN 1 ELSE 0 END) as correct
      FROM predictions WHERE status = 'resolved' GROUP BY prediction
    `);
    const sigRows = sigStmt.all() as Array<{ prediction: string; total: number; correct: number }>;
    for (const row of sigRows) {
      bySignal[row.prediction] = {
        total: row.total,
        correct: row.correct,
        accuracy: row.total > 0 ? row.correct / row.total : 0
      };
    }

    return {
      totalPredictions: stats.total,
      resolvedPredictions: stats.resolved,
      correctPredictions: stats.correct,
      accuracy: stats.resolved > 0 ? stats.correct / stats.resolved : 0,
      byTimeframe,
      bySignal
    };
  }

  storePriceHistory(symbol: string, data: Array<{
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO price_history (symbol, date, open, high, low, close, volume)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = this.db.transaction((entries: Array<[string, string, number, number, number, number, number]>) => {
      for (const entry of entries) stmt.run(entry);
    });

    const entries = data.map(d => [symbol, d.date, d.open, d.high, d.low, d.close, d.volume]);
    insertMany(entries);
    logger.info('Stored ' + data.length + ' price points for ' + symbol);
  }

  getPriceHistory(symbol: string, days: number): Array<{
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }> {
    const stmt = this.db.prepare(`
      SELECT * FROM price_history 
      WHERE symbol = ? AND date >= date('now', '-' || ? || ' days')
      ORDER BY date ASC
    `);
    return stmt.all(symbol.toUpperCase(), days) as Array<{
      date: string;
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
    }>;
  }

  close(): void {
    this.db.close();
  }
}