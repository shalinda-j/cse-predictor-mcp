/**
 * Logger module for CSE Predictor MCP Server
 * All logs go to stderr to avoid interfering with MCP JSON-RPC on stdout
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
    
    // ALL logs go to stderr (stdout is reserved for MCP JSON-RPC)
    const output = JSON.stringify(entry);
    process.stderr.write(output + '\n');
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