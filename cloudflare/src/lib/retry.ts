/**
 * Retry Logic with Exponential Backoff
 *
 * Provides configurable retry strategies for different workflows:
 * - Website Finding: 5 retries, exponential (1min → 32min)
 * - Email Finding: 5 retries, exponential (1min → 32min)
 * - Email Composition: 3 retries, exponential (1min → 4min)
 * - Email Sending: 2 retries, linear (5min → 10min)
 * - Reply Processing: 1 retry, none
 */

import { isRetryableError } from './errors';
import { loggers } from './logger';

const logger = loggers.api;

// ==================
// TYPES
// ==================

export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxAttempts: number;
  /** Initial delay in milliseconds */
  initialDelayMs: number;
  /** Maximum delay in milliseconds */
  maxDelayMs: number;
  /** Multiplier for exponential backoff (1 = linear) */
  backoffMultiplier: number;
  /** Add random jitter to prevent thundering herd */
  jitter: boolean;
  /** Optional timeout per attempt in milliseconds */
  timeoutMs?: number;
  /** Custom function to determine if error is retryable */
  isRetryable?: (error: unknown) => boolean;
}

export interface RetryResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  attempts: number;
  totalTimeMs: number;
}

// ==================
// PRESET CONFIGURATIONS
// ==================

export const RetryStrategies: Record<string, RetryConfig> = {
  /**
   * Website Finding: High tolerance for failures, long backoff
   * Used for DDG search + Grok AI to find hotel websites
   */
  websiteFinding: {
    maxAttempts: 5,
    initialDelayMs: 60_000, // 1 minute
    maxDelayMs: 1_920_000, // 32 minutes
    backoffMultiplier: 2,
    jitter: true,
    timeoutMs: 30_000,
  },

  /**
   * Email Finding: Similar to website, external API dependent
   * Used for MillionVerifier email pattern testing
   */
  emailFinding: {
    maxAttempts: 5,
    initialDelayMs: 60_000,
    maxDelayMs: 1_920_000,
    backoffMultiplier: 2,
    jitter: true,
    timeoutMs: 15_000,
  },

  /**
   * Email Composition: AI generation with Grok
   * Faster retry since we need the email soon
   */
  emailComposition: {
    maxAttempts: 3,
    initialDelayMs: 60_000, // 1 minute
    maxDelayMs: 240_000, // 4 minutes
    backoffMultiplier: 2,
    jitter: true,
    timeoutMs: 15_000,
  },

  /**
   * Email Sending: SMTP operations
   * Linear backoff, limited retries to avoid spam
   */
  emailSending: {
    maxAttempts: 2,
    initialDelayMs: 300_000, // 5 minutes
    maxDelayMs: 600_000, // 10 minutes
    backoffMultiplier: 1, // Linear
    jitter: false,
    timeoutMs: 30_000,
  },

  /**
   * Reply Processing: IMAP operations
   * Single retry, fast failure
   */
  replyProcessing: {
    maxAttempts: 1,
    initialDelayMs: 0,
    maxDelayMs: 0,
    backoffMultiplier: 1,
    jitter: false,
    timeoutMs: 10_000,
  },

  /**
   * Database Operations: D1/Supabase
   * Quick retries for transient failures
   */
  database: {
    maxAttempts: 3,
    initialDelayMs: 1_000, // 1 second
    maxDelayMs: 10_000, // 10 seconds
    backoffMultiplier: 2,
    jitter: true,
    timeoutMs: 5_000,
  },

  /**
   * External API: Generic external API calls
   */
  externalApi: {
    maxAttempts: 3,
    initialDelayMs: 5_000, // 5 seconds
    maxDelayMs: 60_000, // 1 minute
    backoffMultiplier: 2,
    jitter: true,
    timeoutMs: 30_000,
  },
};

// ==================
// CORE RETRY FUNCTION
// ==================

/**
 * Execute a function with retry logic
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {},
  context?: { operation?: string; entityId?: string }
): Promise<RetryResult<T>> {
  const opts: RetryConfig = {
    maxAttempts: config.maxAttempts ?? 3,
    initialDelayMs: config.initialDelayMs ?? 1000,
    maxDelayMs: config.maxDelayMs ?? 60000,
    backoffMultiplier: config.backoffMultiplier ?? 2,
    jitter: config.jitter ?? true,
    timeoutMs: config.timeoutMs,
    isRetryable: config.isRetryable ?? isRetryableError,
  };

  const startTime = Date.now();
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      // Execute with optional timeout
      const result = opts.timeoutMs
        ? await withTimeout(fn(), opts.timeoutMs)
        : await fn();

      // Success
      logger.debug('Operation succeeded', {
        operation: context?.operation,
        entityId: context?.entityId,
        attempt,
        totalTimeMs: Date.now() - startTime,
      });

      return {
        success: true,
        data: result,
        attempts: attempt,
        totalTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if we should retry
      const retryCheck = opts.isRetryable ?? isRetryableError;
      const shouldRetry = attempt < opts.maxAttempts && retryCheck(error);

      logger.warn('Operation failed', {
        operation: context?.operation,
        entityId: context?.entityId,
        attempt,
        maxAttempts: opts.maxAttempts,
        willRetry: shouldRetry,
        error: lastError.message,
      });

      if (!shouldRetry) {
        break;
      }

      // Calculate delay
      const delay = calculateDelay(attempt, opts);

      logger.debug('Waiting before retry', {
        operation: context?.operation,
        delayMs: delay,
        nextAttempt: attempt + 1,
      });

      await sleep(delay);
    }
  }

  // All retries exhausted
  return {
    success: false,
    error: lastError,
    attempts: opts.maxAttempts,
    totalTimeMs: Date.now() - startTime,
  };
}

/**
 * Calculate delay for a given attempt
 */
function calculateDelay(attempt: number, config: RetryConfig): number {
  // Exponential backoff: initialDelay * multiplier^(attempt-1)
  const exponentialDelay =
    config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt - 1);

  // Cap at max delay
  const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs);

  // Add jitter (0-25% of delay)
  if (config.jitter) {
    const jitterAmount = cappedDelay * 0.25 * Math.random();
    return Math.floor(cappedDelay + jitterAmount);
  }

  return cappedDelay;
}

/**
 * Sleep for a given duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wrap a promise with a timeout
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

// ==================
// CONVENIENCE FUNCTIONS
// ==================

/**
 * Retry with website finding strategy
 */
export function retryWebsiteFinding<T>(
  fn: () => Promise<T>,
  context?: { operation?: string; entityId?: string }
): Promise<RetryResult<T>> {
  return withRetry(fn, RetryStrategies.websiteFinding, context);
}

/**
 * Retry with email finding strategy
 */
export function retryEmailFinding<T>(
  fn: () => Promise<T>,
  context?: { operation?: string; entityId?: string }
): Promise<RetryResult<T>> {
  return withRetry(fn, RetryStrategies.emailFinding, context);
}

/**
 * Retry with email composition strategy
 */
export function retryEmailComposition<T>(
  fn: () => Promise<T>,
  context?: { operation?: string; entityId?: string }
): Promise<RetryResult<T>> {
  return withRetry(fn, RetryStrategies.emailComposition, context);
}

/**
 * Retry with email sending strategy
 */
export function retryEmailSending<T>(
  fn: () => Promise<T>,
  context?: { operation?: string; entityId?: string }
): Promise<RetryResult<T>> {
  return withRetry(fn, RetryStrategies.emailSending, context);
}

/**
 * Retry with database strategy
 */
export function retryDatabase<T>(
  fn: () => Promise<T>,
  context?: { operation?: string; entityId?: string }
): Promise<RetryResult<T>> {
  return withRetry(fn, RetryStrategies.database, context);
}

/**
 * Retry with external API strategy
 */
export function retryExternalApi<T>(
  fn: () => Promise<T>,
  context?: { operation?: string; entityId?: string }
): Promise<RetryResult<T>> {
  return withRetry(fn, RetryStrategies.externalApi, context);
}

// ==================
// RETRY QUEUE INTEGRATION
// ==================

/**
 * Check if a failed task should be retried based on attempts
 */
export function shouldRetryTask(
  attempts: number,
  strategy: keyof typeof RetryStrategies
): boolean {
  const config = RetryStrategies[strategy];
  return attempts < config.maxAttempts;
}

/**
 * Calculate next retry time for a failed task
 */
export function getNextRetryTime(
  attempts: number,
  strategy: keyof typeof RetryStrategies
): Date {
  const config = RetryStrategies[strategy];
  const delay = calculateDelay(attempts, config);
  return new Date(Date.now() + delay);
}
