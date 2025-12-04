/**
 * Circuit Breaker Pattern for Scrapers
 *
 * Prevents overwhelming failed services with:
 * - Failure tracking per domain/service
 * - Automatic circuit opening after threshold
 * - Gradual recovery with half-open state
 * - Adaptive backoff for rate limiting
 */

import { logger } from '../logger';

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitStats {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailure: Date | null;
  lastSuccess: Date | null;
  openedAt: Date | null;
  consecutiveSuccesses: number;
  totalRequests: number;
}

interface CircuitConfig {
  failureThreshold: number;      // Failures before opening circuit
  successThreshold: number;      // Successes in half-open before closing
  openDuration: number;          // How long circuit stays open (ms)
  halfOpenMaxRequests: number;   // Max requests allowed in half-open
}

const DEFAULT_CONFIG: CircuitConfig = {
  failureThreshold: 5,
  successThreshold: 3,
  openDuration: 60000, // 1 minute
  halfOpenMaxRequests: 3,
};

// Circuit state per service/domain
const circuits = new Map<string, CircuitStats>();
const configs = new Map<string, CircuitConfig>();

// Rate limit tracking
const rateLimitBackoff = new Map<string, { until: Date; multiplier: number }>();

/**
 * Get or create circuit stats for a service
 */
function getCircuit(service: string): CircuitStats {
  if (!circuits.has(service)) {
    circuits.set(service, {
      state: 'closed',
      failures: 0,
      successes: 0,
      lastFailure: null,
      lastSuccess: null,
      openedAt: null,
      consecutiveSuccesses: 0,
      totalRequests: 0,
    });
  }
  return circuits.get(service)!;
}

/**
 * Get config for a service
 */
function getConfig(service: string): CircuitConfig {
  return configs.get(service) || DEFAULT_CONFIG;
}

/**
 * Configure circuit breaker for a service
 */
export function configureCircuit(service: string, config: Partial<CircuitConfig>): void {
  configs.set(service, { ...DEFAULT_CONFIG, ...config });
}

/**
 * Check if circuit allows request
 */
export function canMakeRequest(service: string): boolean {
  const circuit = getCircuit(service);
  const config = getConfig(service);

  // Check rate limit backoff first
  const backoff = rateLimitBackoff.get(service);
  if (backoff && backoff.until > new Date()) {
    logger.debug({ service, until: backoff.until }, 'Request blocked by rate limit backoff');
    return false;
  }

  switch (circuit.state) {
    case 'closed':
      return true;

    case 'open':
      // Check if enough time has passed to try half-open
      if (circuit.openedAt && Date.now() - circuit.openedAt.getTime() >= config.openDuration) {
        circuit.state = 'half-open';
        circuit.consecutiveSuccesses = 0;
        logger.info({ service }, 'Circuit transitioning to half-open');
        return true;
      }
      return false;

    case 'half-open':
      // Allow limited requests in half-open
      return circuit.consecutiveSuccesses < config.halfOpenMaxRequests;
  }
}

/**
 * Record a successful request
 */
export function recordSuccess(service: string): void {
  const circuit = getCircuit(service);
  const config = getConfig(service);

  circuit.successes++;
  circuit.totalRequests++;
  circuit.lastSuccess = new Date();
  circuit.consecutiveSuccesses++;

  // Clear rate limit backoff on success
  rateLimitBackoff.delete(service);

  if (circuit.state === 'half-open') {
    if (circuit.consecutiveSuccesses >= config.successThreshold) {
      // Close the circuit - service is healthy again
      circuit.state = 'closed';
      circuit.failures = 0;
      circuit.openedAt = null;
      logger.info({ service, successes: circuit.consecutiveSuccesses }, 'Circuit closed - service recovered');
    }
  } else if (circuit.state === 'closed') {
    // Reset failure count on success
    circuit.failures = Math.max(0, circuit.failures - 1);
  }
}

/**
 * Record a failed request
 */
export function recordFailure(
  service: string,
  error: Error | string,
  options: { isRateLimit?: boolean; isBlocked?: boolean } = {}
): void {
  const circuit = getCircuit(service);
  const config = getConfig(service);
  const errorStr = String(error);

  circuit.failures++;
  circuit.totalRequests++;
  circuit.lastFailure = new Date();
  circuit.consecutiveSuccesses = 0;

  // Handle rate limiting specially
  if (options.isRateLimit || isRateLimitError(errorStr)) {
    handleRateLimit(service, errorStr);
  }

  // Handle blocking (captcha, bot detection)
  if (options.isBlocked || isBlockedError(errorStr)) {
    // Immediate circuit open for blocking
    circuit.state = 'open';
    circuit.openedAt = new Date();
    logger.warn({ service, error: errorStr }, 'Circuit opened - service blocking detected');
    return;
  }

  if (circuit.state === 'half-open') {
    // Failure in half-open = back to open
    circuit.state = 'open';
    circuit.openedAt = new Date();
    logger.warn({ service }, 'Circuit re-opened - failure in half-open state');
  } else if (circuit.state === 'closed' && circuit.failures >= config.failureThreshold) {
    // Too many failures = open circuit
    circuit.state = 'open';
    circuit.openedAt = new Date();
    logger.warn({ service, failures: circuit.failures }, 'Circuit opened - failure threshold reached');
  }
}

/**
 * Check if error indicates rate limiting
 */
function isRateLimitError(error: string): boolean {
  const rateLimitPatterns = [
    /429/i,
    /too many requests/i,
    /rate limit/i,
    /quota exceeded/i,
    /throttl/i,
    /slow down/i,
  ];
  return rateLimitPatterns.some(p => p.test(error));
}

/**
 * Check if error indicates blocking
 */
function isBlockedError(error: string): boolean {
  const blockPatterns = [
    /captcha/i,
    /blocked/i,
    /forbidden/i,
    /access denied/i,
    /unusual traffic/i,
    /bot detection/i,
    /cloudflare/i,
    /403/,
  ];
  return blockPatterns.some(p => p.test(error));
}

/**
 * Handle rate limiting with exponential backoff
 */
function handleRateLimit(service: string, _error: string): void {
  const current = rateLimitBackoff.get(service);
  const multiplier = current ? Math.min(current.multiplier * 2, 32) : 1;
  const baseDelay = 30000; // 30 seconds base

  const backoffMs = baseDelay * multiplier;
  const until = new Date(Date.now() + backoffMs);

  rateLimitBackoff.set(service, { until, multiplier });
  logger.warn({ service, backoffMs, until }, 'Rate limit backoff applied');
}

/**
 * Get current circuit state for a service
 */
export function getCircuitState(service: string): CircuitStats {
  return { ...getCircuit(service) };
}

/**
 * Get all circuit states
 */
export function getAllCircuitStates(): Record<string, CircuitStats> {
  const result: Record<string, CircuitStats> = {};
  for (const [service, stats] of circuits) {
    result[service] = { ...stats };
  }
  return result;
}

/**
 * Reset circuit for a service
 */
export function resetCircuit(service: string): void {
  circuits.delete(service);
  rateLimitBackoff.delete(service);
  logger.info({ service }, 'Circuit reset');
}

/**
 * Reset all circuits
 */
export function resetAllCircuits(): void {
  circuits.clear();
  rateLimitBackoff.clear();
  logger.info('All circuits reset');
}

/**
 * Wrapper function to execute with circuit breaker
 */
export async function executeWithCircuit<T>(
  service: string,
  operation: () => Promise<T>,
  options: { fallback?: T; throwOnOpen?: boolean } = {}
): Promise<T> {
  if (!canMakeRequest(service)) {
    if (options.throwOnOpen) {
      throw new Error(`Circuit open for ${service}`);
    }
    if (options.fallback !== undefined) {
      return options.fallback;
    }
    throw new Error(`Circuit open for ${service} and no fallback provided`);
  }

  try {
    const result = await operation();
    recordSuccess(service);
    return result;
  } catch (error) {
    recordFailure(service, error as Error);
    throw error;
  }
}

/**
 * Get recommended delay before next request
 */
export function getRecommendedDelay(service: string): number {
  const backoff = rateLimitBackoff.get(service);
  if (backoff && backoff.until > new Date()) {
    return backoff.until.getTime() - Date.now();
  }

  const circuit = getCircuit(service);
  if (circuit.state === 'open') {
    const config = getConfig(service);
    const elapsed = circuit.openedAt ? Date.now() - circuit.openedAt.getTime() : 0;
    return Math.max(0, config.openDuration - elapsed);
  }

  if (circuit.state === 'half-open') {
    return 5000; // 5 second delay between half-open requests
  }

  // Base delay for closed circuit (be nice to services)
  return 1000;
}

/**
 * Health check for all services
 */
export function getHealthStatus(): {
  healthy: string[];
  degraded: string[];
  unhealthy: string[];
} {
  const healthy: string[] = [];
  const degraded: string[] = [];
  const unhealthy: string[] = [];

  for (const [service, stats] of circuits) {
    switch (stats.state) {
      case 'closed':
        if (stats.failures === 0) {
          healthy.push(service);
        } else {
          degraded.push(service);
        }
        break;
      case 'half-open':
        degraded.push(service);
        break;
      case 'open':
        unhealthy.push(service);
        break;
    }
  }

  return { healthy, degraded, unhealthy };
}
