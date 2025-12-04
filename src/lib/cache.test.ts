import { describe, it, expect, beforeEach, vi } from 'vitest';
import { cache, CACHE_KEYS, cacheKey } from './cache';

describe('Cache', () => {
  beforeEach(() => {
    cache.clear();
  });

  describe('get/set', () => {
    it('should store and retrieve values', () => {
      cache.set('test-key', { foo: 'bar' });
      expect(cache.get('test-key')).toEqual({ foo: 'bar' });
    });

    it('should return null for missing keys', () => {
      expect(cache.get('nonexistent')).toBeNull();
    });

    it('should expire entries after TTL', () => {
      vi.useFakeTimers();

      cache.set('expire-test', 'value', 1); // 1 second TTL
      expect(cache.get('expire-test')).toBe('value');

      vi.advanceTimersByTime(1500); // Advance 1.5 seconds
      expect(cache.get('expire-test')).toBeNull();

      vi.useRealTimers();
    });
  });

  describe('getOrSet', () => {
    it('should return cached value without calling fetcher', async () => {
      cache.set('cached', 'existing-value');
      const fetcher = vi.fn().mockResolvedValue('new-value');

      const result = await cache.getOrSet('cached', fetcher);

      expect(result).toBe('existing-value');
      expect(fetcher).not.toHaveBeenCalled();
    });

    it('should call fetcher and cache result when not cached', async () => {
      const fetcher = vi.fn().mockResolvedValue('fetched-value');

      const result = await cache.getOrSet('new-key', fetcher);

      expect(result).toBe('fetched-value');
      expect(fetcher).toHaveBeenCalledOnce();
      expect(cache.get('new-key')).toBe('fetched-value');
    });
  });

  describe('invalidate', () => {
    it('should remove specific key', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      cache.invalidate('key1');

      expect(cache.get('key1')).toBeNull();
      expect(cache.get('key2')).toBe('value2');
    });

    it('should invalidate by pattern', () => {
      cache.set('user:1:profile', 'data1');
      cache.set('user:2:profile', 'data2');
      cache.set('campaign:1', 'data3');

      const count = cache.invalidatePattern('user:*');

      expect(count).toBe(2);
      expect(cache.get('user:1:profile')).toBeNull();
      expect(cache.get('user:2:profile')).toBeNull();
      expect(cache.get('campaign:1')).toBe('data3');
    });
  });

  describe('stats', () => {
    it('should return cache statistics', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      const stats = cache.stats();

      expect(stats.size).toBe(2);
      expect(stats.keys).toContain('key1');
      expect(stats.keys).toContain('key2');
    });
  });
});

describe('cacheKey', () => {
  it('should create namespaced keys', () => {
    expect(cacheKey('user', 123, 'profile')).toBe('user:123:profile');
    expect(cacheKey('dashboard', 'stats')).toBe('dashboard:stats');
  });
});

describe('CACHE_KEYS', () => {
  it('should generate campaign stats key', () => {
    expect(CACHE_KEYS.CAMPAIGN_STATS('abc123')).toBe('campaign:abc123:stats');
  });
});
