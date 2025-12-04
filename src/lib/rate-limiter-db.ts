import { createServerClient } from './supabase';
import { logger } from './logger';
import { RATE_LIMITS } from './constants';

/**
 * Database-backed rate limiting
 * Persists across server restarts and deployments
 * Shared across all serverless instances
 */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: Date;
}

type RateLimitService = 'google_places' | 'xai_emails' | 'scrape_runs' | 'login' | 'email_inbox';

const SERVICE_LIMITS: Record<RateLimitService, number> = {
  google_places: RATE_LIMITS.GOOGLE_PLACES_DAILY,
  xai_emails: RATE_LIMITS.AI_EMAILS_DAILY,
  scrape_runs: RATE_LIMITS.SCRAPE_RUNS_DAILY,
  login: RATE_LIMITS.LOGIN_ATTEMPTS_HOURLY,
  email_inbox: 20, // 20 emails per inbox per day
};

/**
 * Get today's date key (YYYY-MM-DD) for daily limits
 */
function getDailyKey(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Get current hour key (YYYY-MM-DD-HH) for hourly limits
 */
function getHourlyKey(): string {
  const now = new Date();
  return `${now.toISOString().split('T')[0]}-${now.getUTCHours().toString().padStart(2, '0')}`;
}

/**
 * Check if an operation is allowed and increment counter if so
 * Uses upsert with conflict handling for atomicity
 */
export async function checkAndIncrement(
  service: RateLimitService,
  identifier = 'global'
): Promise<RateLimitResult> {
  const supabase = createServerClient();
  const limit = SERVICE_LIMITS[service];
  const isHourly = service === 'login';
  const periodKey = isHourly ? getHourlyKey() : getDailyKey();
  const key = `${service}:${identifier}:${periodKey}`;

  try {
    // Try to increment the counter atomically using upsert
    const { data, error } = await supabase
      .from('rate_limits')
      .upsert(
        {
          key,
          service,
          identifier,
          period: periodKey,
          count: 1,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'key',
          ignoreDuplicates: false,
        }
      )
      .select('count')
      .single();

    if (error) {
      // If upsert failed, try to get current count and increment
      const { data: existing } = await supabase
        .from('rate_limits')
        .select('count')
        .eq('key', key)
        .single();

      if (existing) {
        const currentCount = existing.count;

        if (currentCount >= limit) {
          return {
            allowed: false,
            remaining: 0,
            limit,
            resetAt: getResetTime(isHourly),
          };
        }

        // Increment existing
        await supabase
          .from('rate_limits')
          .update({
            count: currentCount + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('key', key);

        return {
          allowed: true,
          remaining: Math.max(0, limit - currentCount - 1),
          limit,
          resetAt: getResetTime(isHourly),
        };
      }

      // First request - insert new record
      await supabase.from('rate_limits').insert({
        key,
        service,
        identifier,
        period: periodKey,
        count: 1,
      });

      return {
        allowed: true,
        remaining: limit - 1,
        limit,
        resetAt: getResetTime(isHourly),
      };
    }

    const count = data?.count || 1;
    const allowed = count <= limit;

    if (!allowed) {
      // Decrement since we incremented but shouldn't have
      await supabase
        .from('rate_limits')
        .update({ count: count - 1 })
        .eq('key', key);
    }

    return {
      allowed,
      remaining: Math.max(0, limit - count),
      limit,
      resetAt: getResetTime(isHourly),
    };
  } catch (err) {
    logger.error({ service, identifier, error: err }, 'Rate limit check failed');
    // Fail open to not block operations if rate limiting fails
    return {
      allowed: true,
      remaining: limit,
      limit,
      resetAt: getResetTime(isHourly),
    };
  }
}

/**
 * Check current usage without incrementing
 */
export async function getCurrentUsage(
  service: RateLimitService,
  identifier = 'global'
): Promise<RateLimitResult> {
  const supabase = createServerClient();
  const limit = SERVICE_LIMITS[service];
  const isHourly = service === 'login';
  const periodKey = isHourly ? getHourlyKey() : getDailyKey();
  const key = `${service}:${identifier}:${periodKey}`;

  try {
    const { data } = await supabase
      .from('rate_limits')
      .select('count')
      .eq('key', key)
      .single();

    const count = data?.count || 0;

    return {
      allowed: count < limit,
      remaining: Math.max(0, limit - count),
      limit,
      resetAt: getResetTime(isHourly),
    };
  } catch {
    return {
      allowed: true,
      remaining: limit,
      limit,
      resetAt: getResetTime(isHourly),
    };
  }
}

/**
 * Get all usage stats
 */
export async function getAllUsageStats(): Promise<Record<RateLimitService, RateLimitResult>> {
  const services: RateLimitService[] = ['google_places', 'xai_emails', 'scrape_runs'];
  const results: Record<string, RateLimitResult> = {};

  for (const service of services) {
    results[service] = await getCurrentUsage(service);
  }

  return results as Record<RateLimitService, RateLimitResult>;
}

/**
 * Calculate reset time
 */
function getResetTime(isHourly: boolean): Date {
  const now = new Date();
  if (isHourly) {
    // Next hour
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1);
  }
  // Next day (midnight UTC)
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
}

/**
 * Rate limit middleware for login attempts
 * Tracks by IP address
 */
export async function checkLoginRateLimit(ip: string): Promise<RateLimitResult> {
  return checkAndIncrement('login', ip);
}

/**
 * Check and increment email inbox rate limit
 * Tracks by inbox email address
 */
export async function checkInboxRateLimit(inboxEmail: string): Promise<RateLimitResult> {
  return checkAndIncrement('email_inbox', inboxEmail);
}

/**
 * Get remaining capacity for an inbox
 */
export async function getInboxCapacity(inboxEmail: string): Promise<RateLimitResult> {
  return getCurrentUsage('email_inbox', inboxEmail);
}

/**
 * Get capacity for all inboxes (batched query)
 */
export async function getAllInboxCapacity(inboxEmails: string[]): Promise<Record<string, RateLimitResult>> {
  if (inboxEmails.length === 0) return {};

  const supabase = createServerClient();
  const limit = SERVICE_LIMITS.email_inbox;
  const periodKey = getDailyKey();
  const resetAt = getResetTime(false);

  // Batch query for all inboxes at once
  const keys = inboxEmails.map(email => `email_inbox:${email}:${periodKey}`);

  try {
    const { data } = await supabase
      .from('rate_limits')
      .select('key, count')
      .in('key', keys);

    const countMap = new Map<string, number>();
    for (const row of data || []) {
      // Extract email from key: "email_inbox:{email}:{date}"
      const parts = row.key.split(':');
      if (parts.length >= 2) {
        countMap.set(parts[1], row.count);
      }
    }

    const results: Record<string, RateLimitResult> = {};
    for (const email of inboxEmails) {
      const count = countMap.get(email) || 0;
      results[email] = {
        allowed: count < limit,
        remaining: Math.max(0, limit - count),
        limit,
        resetAt,
      };
    }

    return results;
  } catch (err) {
    logger.warn({ error: err }, 'Batch inbox capacity check failed, falling back');
    // Fallback to individual queries on error
    const results: Record<string, RateLimitResult> = {};
    for (const email of inboxEmails) {
      results[email] = await getInboxCapacity(email);
    }
    return results;
  }
}

/**
 * Find inbox with most remaining capacity
 */
export async function findBestInbox(
  inboxEmails: string[]
): Promise<{ email: string; remaining: number } | null> {
  const capacities = await getAllInboxCapacity(inboxEmails);

  let best: { email: string; remaining: number } | null = null;

  for (const [email, result] of Object.entries(capacities)) {
    if (result.allowed && (!best || result.remaining > best.remaining)) {
      best = { email, remaining: result.remaining };
    }
  }

  return best;
}

const rateLimiterDb = {
  checkAndIncrement,
  getCurrentUsage,
  getAllUsageStats,
  checkLoginRateLimit,
  checkInboxRateLimit,
  getInboxCapacity,
  getAllInboxCapacity,
  findBestInbox,
};
export default rateLimiterDb;
