import { logger } from './logger';

/**
 * Retry utility with exponential backoff
 * Handles transient failures for external API calls
 */

export interface RetryOptions {
  /** Maximum number of attempts (default: 3) */
  attempts?: number;
  /** Initial delay in ms (default: 1000) */
  delay?: number;
  /** Backoff multiplier (default: 2) */
  backoff?: number;
  /** Maximum delay in ms (default: 30000) */
  maxDelay?: number;
  /** Function to determine if error is retryable (default: always retry) */
  isRetryable?: (error: unknown) => boolean;
  /** Called on each retry attempt */
  onRetry?: (error: unknown, attempt: number, delay: number) => void;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  attempts: 3,
  delay: 1000,
  backoff: 2,
  maxDelay: 30000,
  isRetryable: () => true,
  onRetry: () => {},
};

/**
 * Common retryable error checkers
 */
export const retryable = {
  /** Retry on network errors and 5xx responses */
  networkErrors: (error: unknown): boolean => {
    if (error instanceof Error) {
      // Network errors
      if (error.message.includes('fetch failed') ||
          error.message.includes('ECONNRESET') ||
          error.message.includes('ETIMEDOUT') ||
          error.message.includes('ENOTFOUND')) {
        return true;
      }
    }
    return false;
  },

  /** Retry on HTTP status codes */
  httpStatus: (status: number): boolean => {
    // Retry on rate limit (429) and server errors (5xx)
    return status === 429 || (status >= 500 && status < 600);
  },

  /** Check if fetch response should be retried */
  fetchResponse: (response: Response): boolean => {
    return retryable.httpStatus(response.status);
  },
};

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateDelay(attempt: number, options: Required<RetryOptions>): number {
  const exponentialDelay = options.delay * Math.pow(options.backoff, attempt - 1);
  const jitter = Math.random() * 0.1 * exponentialDelay; // Add 0-10% jitter
  return Math.min(exponentialDelay + jitter, options.maxDelay);
}

/**
 * Retry an async operation with exponential backoff
 *
 * @example
 * const result = await retry(
 *   () => fetch('https://api.example.com/data'),
 *   { attempts: 3, delay: 1000 }
 * );
 */
export async function retry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts: Required<RetryOptions> = { ...DEFAULT_OPTIONS, ...options };
  let lastError: unknown;

  for (let attempt = 1; attempt <= opts.attempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      // Check if we should retry
      if (attempt === opts.attempts || !opts.isRetryable(error)) {
        throw error;
      }

      // Calculate delay
      const delay = calculateDelay(attempt, opts);

      // Log retry attempt
      logger.warn({
        attempt,
        maxAttempts: opts.attempts,
        delay,
        error: error instanceof Error ? error.message : String(error),
      }, 'Retrying operation');

      // Call onRetry callback
      opts.onRetry(error, attempt, delay);

      // Wait before retry
      await sleep(delay);
    }
  }

  // Should never reach here, but TypeScript needs this
  throw lastError;
}

/**
 * Retry a fetch request with automatic retry on transient failures
 *
 * @example
 * const response = await retryFetch('https://api.example.com/data', {
 *   method: 'POST',
 *   body: JSON.stringify({ data: 'test' }),
 * });
 */
export async function retryFetch(
  url: string,
  init?: RequestInit,
  retryOptions: RetryOptions = {}
): Promise<Response> {
  return retry(
    async () => {
      const response = await fetch(url, init);

      // Throw on retryable status codes so retry() handles them
      if (retryable.fetchResponse(response)) {
        const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
        (error as Error & { response: Response }).response = response;
        throw error;
      }

      return response;
    },
    {
      isRetryable: (error) => {
        // Check network errors
        if (retryable.networkErrors(error)) return true;

        // Check HTTP status errors
        const response = (error as Error & { response?: Response }).response;
        if (response && retryable.fetchResponse(response)) return true;

        return false;
      },
      ...retryOptions,
    }
  );
}

export default retry;
