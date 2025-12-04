/**
 * Error Tracking Module
 * Provides centralized error tracking and reporting
 *
 * Currently uses console logging, can be upgraded to Sentry:
 * npm install @sentry/nextjs
 */

import { logger } from './logger';

interface ErrorContext {
  userId?: string;
  action?: string;
  component?: string;
  extra?: Record<string, unknown>;
}

/**
 * Capture and report an error
 */
export function captureError(error: Error, context?: ErrorContext): void {
  const errorId = crypto.randomUUID().slice(0, 8);

  logger.error({
    errorId,
    error: error.message,
    stack: error.stack,
    ...context,
  }, `Error captured: ${error.message}`);

  // TODO: Add Sentry integration when ready
  // if (process.env.SENTRY_DSN) {
  //   Sentry.captureException(error, { extra: context });
  // }
}

/**
 * Capture a message/warning
 */
export function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info', context?: ErrorContext): void {
  const logFn = level === 'error' ? logger.error : level === 'warning' ? logger.warn : logger.info;

  logFn({
    ...context,
  }, message);

  // TODO: Add Sentry integration when ready
  // if (process.env.SENTRY_DSN) {
  //   Sentry.captureMessage(message, level);
  // }
}

/**
 * Set user context for error tracking
 */
export function setUser(userId: string | null): void {
  if (userId) {
    logger.info({ userId }, 'User context set');
  }

  // TODO: Add Sentry integration when ready
  // Sentry.setUser(userId ? { id: userId } : null);
}

/**
 * Add breadcrumb for debugging
 */
export function addBreadcrumb(message: string, category: string, data?: Record<string, unknown>): void {
  logger.debug({ category, data }, `Breadcrumb: ${message}`);

  // TODO: Add Sentry integration when ready
  // Sentry.addBreadcrumb({ message, category, data });
}

/**
 * Wrap an async function with error tracking
 */
export function withErrorTracking<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  context?: ErrorContext
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args);
    } catch (error) {
      captureError(error instanceof Error ? error : new Error(String(error)), context);
      throw error;
    }
  }) as T;
}

const errorTracking = {
  captureError,
  captureMessage,
  setUser,
  addBreadcrumb,
  withErrorTracking,
};
export default errorTracking;
