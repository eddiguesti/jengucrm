/**
 * Simple In-Memory Cache with TTL
 *
 * For Vercel Edge/Serverless:
 * - Works within single invocation
 * - For persistent caching, upgrade to Vercel KV or use unstable_cache
 *
 * Usage:
 *   const stats = await cache.getOrSet('dashboard-stats', () => fetchStats(), 60);
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class Cache {
  private store: Map<string, CacheEntry<unknown>> = new Map();
  private readonly defaultTTL: number;

  constructor(defaultTTLSeconds = 60) {
    this.defaultTTL = defaultTTLSeconds * 1000;
  }

  /**
   * Get a value from cache
   */
  get<T>(key: string): T | null {
    const entry = this.store.get(key);

    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }

    return entry.value as T;
  }

  /**
   * Set a value in cache
   */
  set<T>(key: string, value: T, ttlSeconds?: number): void {
    const ttl = (ttlSeconds ?? this.defaultTTL / 1000) * 1000;
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttl,
    });
  }

  /**
   * Get or set pattern - fetch from cache or compute and cache
   */
  async getOrSet<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttlSeconds?: number
  ): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const value = await fetcher();
    this.set(key, value, ttlSeconds);
    return value;
  }

  /**
   * Invalidate a specific key
   */
  invalidate(key: string): boolean {
    return this.store.delete(key);
  }

  /**
   * Invalidate keys matching a pattern
   */
  invalidatePattern(pattern: string): number {
    const regex = new RegExp(pattern.replace('*', '.*'));
    let count = 0;

    for (const key of this.store.keys()) {
      if (regex.test(key)) {
        this.store.delete(key);
        count++;
      }
    }

    return count;
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * Get cache stats
   */
  stats(): { size: number; keys: string[] } {
    // Clean up expired entries first
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
      }
    }

    return {
      size: this.store.size,
      keys: Array.from(this.store.keys()),
    };
  }
}

// Singleton instance with 60 second default TTL
export const cache = new Cache(60);

/**
 * Cache keys for common queries
 */
export const CACHE_KEYS = {
  DASHBOARD_STATS: 'dashboard:stats',
  CAMPAIGN_LIST: 'campaigns:list',
  CAMPAIGN_STATS: (id: string) => `campaign:${id}:stats`,
  PROSPECT_COUNT: 'prospects:count',
  EMAIL_STATS_TODAY: 'emails:stats:today',
  INBOX_STATUS: 'inbox:status',
} as const;

/**
 * Cache TTLs in seconds
 */
export const CACHE_TTL = {
  SHORT: 30, // 30 seconds - for rapidly changing data
  MEDIUM: 60, // 1 minute - default
  LONG: 300, // 5 minutes - for slowly changing data
  VERY_LONG: 600, // 10 minutes - for static data
} as const;

/**
 * Helper to create cache key with namespace
 */
export function cacheKey(namespace: string, ...parts: (string | number)[]): string {
  return [namespace, ...parts].join(':');
}
