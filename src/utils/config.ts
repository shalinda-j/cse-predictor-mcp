/**
 * Configuration module for CSE Predictor MCP Server
 */

import { z } from 'zod';

const configSchema = z.object({
  refreshInterval: z.number().default(30),
  historyDays: z.number().default(365),
  predictionThreshold: z.number().default(0.8),
  verboseLogging: z.boolean().default(false),
  dataPath: z.string().default('./data'),
  dataSourceUrl: z.string().optional(),
  alphaVantageApiKey: z.string().optional(),
  newsApiKey: z.string().optional()
});

function loadConfig() {
  const env = process.env;
  
  return configSchema.parse({
    refreshInterval: parseInt(env.CSE_REFRESH_INTERVAL || '30'),
    historyDays: parseInt(env.CSE_HISTORY_DAYS || '365'),
    predictionThreshold: parseFloat(env.CSE_PREDICTION_THRESHOLD || '0.8'),
    verboseLogging: env.CSE_VERBOSE_LOGGING === 'true',
    dataPath: env.CSE_DATA_PATH || './data',
    dataSourceUrl: env.CSE_DATA_SOURCE_URL,
    alphaVantageApiKey: env.ALPHA_VANTAGE_API_KEY,
    newsApiKey: env.NEWS_API_KEY
  });
}

export const config = loadConfig();

export type Config = z.infer<typeof configSchema>;
