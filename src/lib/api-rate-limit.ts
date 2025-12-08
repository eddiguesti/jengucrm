/**
 * API Rate Limiting Helper
 * Provides per-route rate limiting with configurable limits
 *
 * Usage in API routes:
 *   import { withRateLimit, RATE_LIMIT_CONFIGS } from '@/lib/api-rate-limit';
 *
 *   export async function POST(request: NextRequest) {
 *     const rateLimitResult = await withRateLimit(request, 'prospects');
 *     if (rateLimitResult) return rateLimitResult; // Returns 429 if rate limited
 *     // ... rest of handler
 *   }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from './supabase';
import { logger } from './logger';
import { flags } from './feature-flags';

// ============================================
// TYPES
// ============================================

interface RateLimitConfig {
  /** Requests allowed per window */
  limit: number;
  /** Window size in seconds */
  windowSeconds: number;
  /** Use IP-based limiting (vs global) */
  perIp?: boolean;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: Date;
}

// ============================================
// RATE LIMIT CONFIGURATIONS
// ============================================

export const RATE_LIMIT_CONFIGS: Record<string, RateLimitConfig> = {
  // Data modification endpoints (stricter)
  prospects_create: { limit: 50, windowSeconds: 3600, perIp: true },  // 50/hour per IP
  prospects_update: { limit: 100, windowSeconds: 3600, perIp: true }, // 100/hour per IP
  emails_send: { limit: 30, windowSeconds: 3600, perIp: true },       // 30/hour per IP

  // Read endpoints (more lenient)
  prospects_read: { limit: 300, windowSeconds: 3600, perIp: true },   // 300/hour per IP
  emails_read: { limit: 300, windowSeconds: 3600, perIp: true },      // 300/hour per IP

  // AI endpoints (expensive - stricter)
  ai_generate: { limit: 100, windowSeconds: 3600, perIp: true },      // 100/hour per IP
  ai_analyze: { limit: 200, windowSeconds: 3600, perIp: true },       // 200/hour per IP

  // Admin endpoints (very strict)
  admin: { limit: 20, windowSeconds: 3600, perIp: true },             // 20/hour per IP

  // Global rate limit (per-IP fallback)
  global: { limit: 500, windowSeconds: 3600, perIp: true },           // 500/hour per IP
};

// ============================================
// IP EXTRACTION (Security-hardened)
// ============================================

/**
 * Get client IP from trusted headers only
 * Priority: CF-Connecting-IP > X-Real-IP > X-Forwarded-For
 */
export function getClientIp(request: NextRequest): string {
  // Cloudflare - most trusted
  const cfIp = request.headers.get('cf-connecting-ip');
  if (cfIp) return cfIp.trim();

  // Vercel X-Real-IP - trusted
  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp.trim();

  // X-Forwarded-For - first entry (set by Vercel)
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const ips = forwarded.split(',').map(ip => ip.trim());
    if (ips.length > 0 && ips[0]) return ips[0];
  }

  return 'unknown';
}

// ============================================
// IN-MEMORY RATE LIMITING (Fast, single-instance)
// ============================================

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const memoryStore = new Map<string, RateLimitEntry>();

function cleanupMemoryStore(): void {
  const now = Date.now();
  for (const [key, entry] of memoryStore.entries()) {
    // Remove entries older than 2 hours
    if (now - entry.windowStart > 2 * 60 * 60 * 1000) {
      memoryStore.delete(key);
    }
  }
}

// Cleanup every 10 minutes
setInterval(cleanupMemoryStore, 10 * 60 * 1000);

function checkMemoryRateLimit(
  key: string,
  config: RateLimitConfig
): RateLimitResult {
  const now = Date.now();
  const windowMs = config.windowSeconds * 1000;
  const entry = memoryStore.get(key);

  if (!entry || now - entry.windowStart >= windowMs) {
    // New window
    memoryStore.set(key, { count: 1, windowStart: now });
    return {
      allowed: true,
      remaining: config.limit - 1,
      limit: config.limit,
      resetAt: new Date(now + windowMs),
    };
  }

  // Existing window
  if (entry.count >= config.limit) {
    return {
      allowed: false,
      remaining: 0,
      limit: config.limit,
      resetAt: new Date(entry.windowStart + windowMs),
    };
  }

  entry.count++;
  return {
    allowed: true,
    remaining: config.limit - entry.count,
    limit: config.limit,
    resetAt: new Date(entry.windowStart + windowMs),
  };
}

// ============================================
// DATABASE RATE LIMITING (Distributed, persistent)
// ============================================

async function checkDbRateLimit(
  key: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const supabase = createServerClient();
  const windowMs = config.windowSeconds * 1000;
  const now = Date.now();
  const windowStart = new Date(now - windowMs);

  try {
    // Count requests in current window
    const { count, error } = await supabase
      .from('rate_limits')
      .select('*', { count: 'exact', head: true })
      .eq('key', key)
      .gte('created_at', windowStart.toISOString());

    if (error) {
      logger.warn({ error, key }, 'Rate limit DB query failed, using memory');
      return checkMemoryRateLimit(key, config);
    }

    const currentCount = count || 0;

    if (currentCount >= config.limit) {
      return {
        allowed: false,
        remaining: 0,
        limit: config.limit,
        resetAt: new Date(now + windowMs),
      };
    }

    // Record this request (ignore errors - may hit unique constraint)
    await supabase.from('rate_limits').insert({
      key,
      service: 'api',
      identifier: key,
      period: new Date().toISOString().split('T')[0],
      count: 1,
    });

    return {
      allowed: true,
      remaining: config.limit - currentCount - 1,
      limit: config.limit,
      resetAt: new Date(now + windowMs),
    };
  } catch (err) {
    logger.warn({ error: err, key }, 'Rate limit check failed, using memory');
    return checkMemoryRateLimit(key, config);
  }
}

// ============================================
// MAIN RATE LIMIT FUNCTION
// ============================================

/**
 * Check rate limit for an API request
 * Returns NextResponse if rate limited, null if allowed
 */
export async function withRateLimit(
  request: NextRequest,
  configKey: keyof typeof RATE_LIMIT_CONFIGS = 'global'
): Promise<NextResponse | null> {
  // Skip if rate limiting disabled
  if (!flags.API_RATE_LIMITING) {
    return null;
  }

  const config = RATE_LIMIT_CONFIGS[configKey] || RATE_LIMIT_CONFIGS.global;
  const ip = config.perIp ? getClientIp(request) : 'global';
  const key = `api:${configKey}:${ip}`;

  // Use memory rate limiting for speed (DB is fallback for distributed systems)
  const result = checkMemoryRateLimit(key, config);

  if (!result.allowed) {
    logger.warn({
      ip,
      configKey,
      limit: result.limit,
      resetAt: result.resetAt,
    }, 'API rate limit exceeded');

    return NextResponse.json(
      {
        error: 'Too many requests',
        message: `Rate limit exceeded. Try again after ${result.resetAt.toISOString()}`,
        retryAfter: Math.ceil((result.resetAt.getTime() - Date.now()) / 1000),
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil((result.resetAt.getTime() - Date.now()) / 1000)),
          'X-RateLimit-Limit': String(result.limit),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': result.resetAt.toISOString(),
        },
      }
    );
  }

  return null;
}

/**
 * Add rate limit headers to a response
 */
export function addRateLimitHeaders(
  response: NextResponse,
  result: RateLimitResult
): NextResponse {
  response.headers.set('X-RateLimit-Limit', String(result.limit));
  response.headers.set('X-RateLimit-Remaining', String(result.remaining));
  response.headers.set('X-RateLimit-Reset', result.resetAt.toISOString());
  return response;
}

export default {
  withRateLimit,
  getClientIp,
  addRateLimitHeaders,
  RATE_LIMIT_CONFIGS,
};
