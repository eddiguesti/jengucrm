import pino from 'pino';

/**
 * Structured logging with Pino
 * - JSON output (parsed by Vercel logs)
 * - No transports (Edge runtime compatible)
 * - Request ID support for tracing
 */

const isDev = process.env.NODE_ENV === 'development';

export const logger = pino({
  level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
  formatters: {
    level: (label) => ({ level: label }),
  },
  base: {
    service: 'marketing-agent',
  },
});

/**
 * Create a child logger with request context
 */
export function createRequestLogger(requestId: string, endpoint?: string) {
  return logger.child({ requestId, endpoint });
}

/**
 * Log levels:
 * - trace: Very detailed debugging
 * - debug: Development debugging info
 * - info: Normal operational messages
 * - warn: Something unexpected but not critical
 * - error: Something failed
 * - fatal: Application cannot continue
 */

export const log = {
  api: (endpoint: string, data: Record<string, unknown>) =>
    logger.info({ endpoint, ...data }, `API: ${endpoint}`),

  email: (action: string, data: Record<string, unknown>) =>
    logger.info({ action, ...data }, `Email: ${action}`),

  scrape: (source: string, data: Record<string, unknown>) =>
    logger.info({ source, ...data }, `Scrape: ${source}`),

  cron: (job: string, data: Record<string, unknown>) =>
    logger.info({ job, ...data }, `Cron: ${job}`),

  db: (operation: string, data: Record<string, unknown>) =>
    logger.debug({ operation, ...data }, `DB: ${operation}`),

  external: (service: string, data: Record<string, unknown>) =>
    logger.info({ service, ...data }, `External: ${service}`),
};

export default logger;
