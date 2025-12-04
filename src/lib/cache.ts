import { createServerClient } from './supabase';
import { logger } from './logger';

/**
 * Hybrid Cache with In-Memory + Database Persistence
 *
 * - In-memory cache for hot data within same invocation
 * - Database cache for persistence across deployments
 * - Automatic fallback and sync between layers
 *
 * Usage:
 *   const stats = await cache.getOrSet('dashboard-stats', () => fetchStats(), 60);
 *   const persisted = await dbCache.getOrSet('enrichment:domain.com', () => enrichDomain(), 86400);
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

/**
 * Database-backed cache for persistence across deployments
 * Use this for expensive operations like website enrichment
 */
class DatabaseCache {
  /**
   * Get value from database cache
   */
  async get<T>(key: string): Promise<T | null> {
    const supabase = createServerClient();

    try {
      const { data } = await supabase
        .from('cache')
        .select('value, expires_at')
        .eq('key', key)
        .single();

      if (!data) return null;

      // Check expiration
      if (new Date(data.expires_at) < new Date()) {
        // Async cleanup
        supabase.from('cache').delete().eq('key', key).then(() => {});
        return null;
      }

      return data.value as T;
    } catch {
      return null;
    }
  }

  /**
   * Set value in database cache
   */
  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    const supabase = createServerClient();

    try {
      const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

      await supabase.from('cache').upsert({
        key,
        value,
        expires_at: expiresAt,
        created_at: new Date().toISOString(),
      });
    } catch (err) {
      logger.warn({ key, error: err }, 'Failed to set database cache');
    }
  }

  /**
   * Get or set pattern with database persistence
   */
  async getOrSet<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttlSeconds: number
  ): Promise<T> {
    // Try memory cache first
    const memCached = cache.get<T>(key);
    if (memCached !== null) {
      return memCached;
    }

    // Try database cache
    const dbCached = await this.get<T>(key);
    if (dbCached !== null) {
      // Populate memory cache
      cache.set(key, dbCached, Math.min(ttlSeconds, CACHE_TTL.MEDIUM));
      return dbCached;
    }

    // Fetch and cache in both layers
    const value = await fetcher();
    cache.set(key, value, Math.min(ttlSeconds, CACHE_TTL.MEDIUM));
    await this.set(key, value, ttlSeconds);
    return value;
  }

  /**
   * Delete from database cache
   */
  async delete(key: string): Promise<void> {
    const supabase = createServerClient();
    cache.invalidate(key);
    await supabase.from('cache').delete().eq('key', key);
  }

  /**
   * Clean expired entries (call from cron)
   */
  async cleanExpired(): Promise<number> {
    const supabase = createServerClient();

    try {
      const { data } = await supabase
        .from('cache')
        .delete()
        .lt('expires_at', new Date().toISOString())
        .select('key');

      return data?.length || 0;
    } catch (err) {
      logger.error({ error: err }, 'Failed to clean expired cache');
      return 0;
    }
  }
}

// Database cache singleton
export const dbCache = new DatabaseCache();

// Extended cache keys
export const DB_CACHE_KEYS = {
  WEBSITE_ENRICHMENT: (domain: string) => `enrichment:website:${domain}`,
  PROSPECT_SCORE: (id: string) => `prospect:score:${id}`,
  HOTEL_RESEARCH: (name: string) => `research:hotel:${name.toLowerCase().replace(/\s+/g, '-')}`,
  GM_LOOKUP: (domain: string) => `gm:${domain}`,
} as const;

// Extended TTLs for database cache
export const DB_CACHE_TTL = {
  ENRICHMENT: 24 * 60 * 60, // 24 hours
  RESEARCH: 7 * 24 * 60 * 60, // 7 days
  GM_LOOKUP: 30 * 24 * 60 * 60, // 30 days
} as const;
