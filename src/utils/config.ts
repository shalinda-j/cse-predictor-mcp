/**
 * Configuration module for CSE Predictor MCP Server
 */

import { z } from 'zod';

const configSchema = z.object({
  // CSE public API base URL (override only if the CSE changes its API host).
  cseApiUrl: z.string().default('https://www.cse.lk/api'),
  // HTTP request timeout for CSE API calls, in milliseconds.
  requestTimeoutMs: z.number().default(20000),
  // How many trading days of history to use for analysis.
  historyDays: z.number().default(365),
  verboseLogging: z.boolean().default(false),
  // Path to the SQLite database used for prediction tracking.
  dataPath: z.string().default('./data')
});

function loadConfig() {
  const env = process.env;

  return configSchema.parse({
    cseApiUrl: env.CSE_API_URL || 'https://www.cse.lk/api',
    requestTimeoutMs: parseInt(env.CSE_REQUEST_TIMEOUT_MS || '20000'),
    historyDays: parseInt(env.CSE_HISTORY_DAYS || '365'),
    verboseLogging: env.CSE_VERBOSE_LOGGING === 'true',
    dataPath: env.CSE_DATA_PATH || './data'
  });
}

export const config = loadConfig();

export type Config = z.infer<typeof configSchema>;
