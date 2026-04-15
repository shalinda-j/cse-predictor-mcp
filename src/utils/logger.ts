/**
 * Logger module for CSE Predictor MCP Server
 */

import { config } from './config.js';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  timestamp: string;
  message: string;
  data?: unknown;
}

class Logger {
  private verbose: boolean;
  
  constructor(verbose: boolean = false) {
    this.verbose = verbose;
  }
  
  private formatTimestamp(): string {
    return new Date().toISOString();
  }
  
  private log(level: LogLevel, message: string, data?: unknown): void {
    const entry: LogEntry = {
      level,
      timestamp: this.formatTimestamp(),
      message,
      data
    };
    
    // Only log debug messages if verbose mode is enabled
    if (level === 'debug' && !this.verbose) {
      return;
    }
    
    const output = JSON.stringify(entry);
    
    switch (level) {
      case 'error':
        console.error(output);
        break;
      case 'warn':
        console.warn(output);
        break;
      default:
        console.log(output);
    }
  }
  
  debug(message: string, data?: unknown): void {
    this.log('debug', message, data);
  }
  
  info(message: string, data?: unknown): void {
    this.log('info', message, data);
  }
  
  warn(message: string, data?: unknown): void {
    this.log('warn', message, data);
  }
  
  error(message: string, data?: unknown): void {
    this.log('error', message, data);
  }
}

export const logger = new Logger(config.verboseLogging);
