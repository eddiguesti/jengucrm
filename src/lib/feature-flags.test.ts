/**
 * Feature Flags Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Feature Flags', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('LEGACY_AUTH_ENABLED', () => {
    it('should be false by default', async () => {
      delete process.env.LEGACY_AUTH_ENABLED;
      const { flags } = await import('./feature-flags');
      expect(flags.LEGACY_AUTH_ENABLED).toBe(false);
    });

    it('should be true when set to "true"', async () => {
      process.env.LEGACY_AUTH_ENABLED = 'true';
      const { flags } = await import('./feature-flags');
      expect(flags.LEGACY_AUTH_ENABLED).toBe(true);
    });

    it('should be false for any other value', async () => {
      process.env.LEGACY_AUTH_ENABLED = 'yes';
      const { flags } = await import('./feature-flags');
      expect(flags.LEGACY_AUTH_ENABLED).toBe(false);
    });
  });

  describe('AI_CACHING_ENABLED', () => {
    it('should be true by default (enabled unless explicitly disabled)', async () => {
      delete process.env.AI_CACHING_ENABLED;
      const { flags } = await import('./feature-flags');
      expect(flags.AI_CACHING_ENABLED).toBe(true);
    });

    it('should be false when set to "false"', async () => {
      process.env.AI_CACHING_ENABLED = 'false';
      const { flags } = await import('./feature-flags');
      expect(flags.AI_CACHING_ENABLED).toBe(false);
    });

    it('should be true for any other value', async () => {
      process.env.AI_CACHING_ENABLED = 'true';
      const { flags } = await import('./feature-flags');
      expect(flags.AI_CACHING_ENABLED).toBe(true);
    });
  });

  describe('API_RATE_LIMITING', () => {
    it('should be true by default', async () => {
      delete process.env.API_RATE_LIMITING;
      const { flags } = await import('./feature-flags');
      expect(flags.API_RATE_LIMITING).toBe(true);
    });

    it('should be false when set to "false"', async () => {
      process.env.API_RATE_LIMITING = 'false';
      const { flags } = await import('./feature-flags');
      expect(flags.API_RATE_LIMITING).toBe(false);
    });
  });

  describe('SECURE_RATE_LIMITER', () => {
    it('should be true by default', async () => {
      delete process.env.SECURE_RATE_LIMITER;
      const { flags } = await import('./feature-flags');
      expect(flags.SECURE_RATE_LIMITER).toBe(true);
    });

    it('should be false when explicitly disabled', async () => {
      process.env.SECURE_RATE_LIMITER = 'false';
      const { flags } = await import('./feature-flags');
      expect(flags.SECURE_RATE_LIMITER).toBe(false);
    });
  });

  describe('isEnabled helper', () => {
    it('should return flag value', async () => {
      process.env.AI_CACHING_ENABLED = 'false';
      const { isEnabled } = await import('./feature-flags');
      expect(isEnabled('AI_CACHING_ENABLED')).toBe(false);
    });
  });

  describe('getAllFlags helper', () => {
    it('should return all flags as object', async () => {
      const { getAllFlags } = await import('./feature-flags');
      const allFlags = getAllFlags();

      expect(allFlags).toHaveProperty('LEGACY_AUTH_ENABLED');
      expect(allFlags).toHaveProperty('AI_CACHING_ENABLED');
      expect(allFlags).toHaveProperty('API_RATE_LIMITING');
      expect(allFlags).toHaveProperty('SECURE_RATE_LIMITER');
      expect(allFlags).toHaveProperty('USE_AI_GATEWAY');
    });
  });
});
