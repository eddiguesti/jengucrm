import { logger } from './logger';

/**
 * Request timeout utilities
 * Prevents hung requests from exhausting resources
 */

export class TimeoutError extends Error {
  constructor(message: string, public readonly timeoutMs: number) {
    super(message);
    this.name = 'TimeoutError';
  }
}

/**
 * Create an AbortSignal that times out after specified milliseconds
 */
export function createTimeoutSignal(timeoutMs: number): AbortSignal {
  return AbortSignal.timeout(timeoutMs);
}

/**
 * Wrap a promise with a timeout
 *
 * @example
 * const result = await withTimeout(
 *   fetch('https://slow-api.com'),
 *   5000,
 *   'API request timed out'
 * );
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message = 'Operation timed out'
): Promise<T> {
  let timeoutId: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      logger.warn({ timeoutMs }, message);
      reject(new TimeoutError(message, timeoutMs));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId!);
  }
}

/**
 * Fetch with timeout support
 *
 * @example
 * const response = await fetchWithTimeout('https://api.example.com', {
 *   method: 'GET',
 *   timeout: 5000,
 * });
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeout?: number } = {}
): Promise<Response> {
  const { timeout = 30000, ...fetchOptions } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });
    return response;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      logger.warn({ url, timeout }, 'Fetch request timed out');
      throw new TimeoutError(`Fetch to ${url} timed out after ${timeout}ms`, timeout);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Common timeout values (in milliseconds)
 */
export const TIMEOUTS = {
  /** Quick API calls (2 seconds) */
  FAST: 2000,
  /** Standard API calls (10 seconds) */
  STANDARD: 10000,
  /** Slow operations like scraping (30 seconds) */
  SLOW: 30000,
  /** Very slow operations (60 seconds) */
  VERY_SLOW: 60000,
  /** IMAP connection timeout (10 seconds) */
  IMAP_CONNECTION: 10000,
  /** IMAP auth timeout (5 seconds) */
  IMAP_AUTH: 5000,
  /** IMAP overall operation (30 seconds) */
  IMAP_OPERATION: 30000,
  /** Email sending (15 seconds) */
  EMAIL_SEND: 15000,
  /** AI generation (30 seconds) */
  AI_GENERATION: 30000,
  /** External API calls (15 seconds) */
  EXTERNAL_API: 15000,
} as const;

const timeoutUtils = { withTimeout, fetchWithTimeout, createTimeoutSignal, TIMEOUTS, TimeoutError };
export default timeoutUtils;
