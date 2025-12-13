/**
 * Circuit Breaker - Protect against cascading failures from external services
 *
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Failing, all requests immediately rejected
 * - HALF_OPEN: Testing if service recovered, limited requests allowed
 */

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerConfig {
  /** Number of failures before opening the circuit */
  failureThreshold: number;
  /** Time in ms to wait before attempting recovery */
  resetTimeout: number;
  /** Number of successful requests needed to close circuit from half-open */
  successThreshold: number;
  /** Optional name for logging */
  name?: string;
}

export interface CircuitBreakerStatus {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailure: number | null;
  lastSuccess: number | null;
  lastError: string | null;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeout: 30000, // 30 seconds
  successThreshold: 2,
};

/**
 * In-memory circuit breaker for Cloudflare Workers
 * Note: State is per-isolate, not globally shared
 */
export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failures = 0;
  private successes = 0;
  private lastFailure: number | null = null;
  private lastSuccess: number | null = null;
  private lastError: string | null = null;
  private config: CircuitBreakerConfig;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async call<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      // Check if we should try half-open
      if (this.lastFailure && Date.now() - this.lastFailure > this.config.resetTimeout) {
        this.state = 'half-open';
        this.successes = 0;
        console.log(`[CircuitBreaker:${this.config.name || 'default'}] Transitioning to half-open`);
      } else {
        throw new CircuitBreakerError(
          `Circuit breaker is open for ${this.config.name || 'service'}`,
          this.getStatus()
        );
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  /**
   * Record a successful call
   */
  private onSuccess(): void {
    this.lastSuccess = Date.now();
    this.lastError = null;

    if (this.state === 'half-open') {
      this.successes++;
      if (this.successes >= this.config.successThreshold) {
        this.state = 'closed';
        this.failures = 0;
        console.log(`[CircuitBreaker:${this.config.name || 'default'}] Circuit closed (recovered)`);
      }
    } else {
      // In closed state, reset failures on success
      this.failures = 0;
    }
  }

  /**
   * Record a failed call
   */
  private onFailure(error: unknown): void {
    this.failures++;
    this.lastFailure = Date.now();
    this.lastError = error instanceof Error ? error.message : String(error);

    if (this.state === 'half-open') {
      // Any failure in half-open goes back to open
      this.state = 'open';
      console.log(`[CircuitBreaker:${this.config.name || 'default'}] Circuit reopened (failed in half-open)`);
    } else if (this.failures >= this.config.failureThreshold) {
      this.state = 'open';
      console.log(`[CircuitBreaker:${this.config.name || 'default'}] Circuit opened (threshold reached: ${this.failures})`);
    }
  }

  /**
   * Get current circuit breaker status
   */
  getStatus(): CircuitBreakerStatus {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailure: this.lastFailure,
      lastSuccess: this.lastSuccess,
      lastError: this.lastError,
    };
  }

  /**
   * Check if the circuit is allowing requests
   */
  isAllowed(): boolean {
    if (this.state === 'closed') return true;
    if (this.state === 'half-open') return true;

    // Check if we should transition to half-open
    if (this.lastFailure && Date.now() - this.lastFailure > this.config.resetTimeout) {
      return true;
    }

    return false;
  }

  /**
   * Force reset the circuit breaker
   */
  reset(): void {
    this.state = 'closed';
    this.failures = 0;
    this.successes = 0;
    this.lastError = null;
    console.log(`[CircuitBreaker:${this.config.name || 'default'}] Circuit manually reset`);
  }
}

/**
 * Custom error for circuit breaker rejections
 */
export class CircuitBreakerError extends Error {
  public readonly status: CircuitBreakerStatus;

  constructor(message: string, status: CircuitBreakerStatus) {
    super(message);
    this.name = 'CircuitBreakerError';
    this.status = status;
  }
}

// ==================
// GLOBAL CIRCUIT BREAKERS
// ==================

// One circuit breaker per external service
const circuitBreakers = new Map<string, CircuitBreaker>();

/**
 * Get or create a circuit breaker for a service
 */
export function getCircuitBreaker(
  serviceName: string,
  config?: Partial<CircuitBreakerConfig>
): CircuitBreaker {
  if (!circuitBreakers.has(serviceName)) {
    circuitBreakers.set(
      serviceName,
      new CircuitBreaker({ ...config, name: serviceName })
    );
  }
  return circuitBreakers.get(serviceName)!;
}

/**
 * Get status of all circuit breakers
 */
export function getAllCircuitBreakerStatus(): Record<string, CircuitBreakerStatus> {
  const status: Record<string, CircuitBreakerStatus> = {};
  for (const [name, breaker] of circuitBreakers) {
    status[name] = breaker.getStatus();
  }
  return status;
}

/**
 * Pre-configured circuit breakers for known services
 */
export const CircuitBreakers = {
  grok: () => getCircuitBreaker('grok', { failureThreshold: 3, resetTimeout: 60000 }),
  supabase: () => getCircuitBreaker('supabase', { failureThreshold: 5, resetTimeout: 30000 }),
  millionverifier: () => getCircuitBreaker('millionverifier', { failureThreshold: 3, resetTimeout: 60000 }),
  smtp: () => getCircuitBreaker('smtp', { failureThreshold: 3, resetTimeout: 60000 }),
  braveSearch: () => getCircuitBreaker('brave-search', { failureThreshold: 5, resetTimeout: 60000 }),
};

/**
 * Wrap a fetch call with circuit breaker protection
 */
export async function fetchWithCircuitBreaker(
  serviceName: string,
  url: string,
  options?: RequestInit
): Promise<Response> {
  const breaker = getCircuitBreaker(serviceName);

  return breaker.call(async () => {
    const response = await fetch(url, options);

    // Treat 5xx errors as failures
    if (response.status >= 500) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response;
  });
}
