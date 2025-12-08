/**
 * API Usage Tracker
 * Tracks usage of external APIs to stay within free tier limits
 * Warns when approaching limits, blocks when exceeded
 */

import { createClient } from '@supabase/supabase-js';
import { logger } from './logger';

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://bxcwlwglvcqujrdudxkw.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || ''
);

/**
 * Free tier limits for external APIs
 */
export const API_LIMITS = {
  // Google Places API - Essentials tier
  GOOGLE_PLACES: {
    monthlyLimit: 10000,  // 10k free/month
    warningThreshold: 8000,  // Warn at 80%
    enabled: true,
  },
  // Anthropic Claude - NO free tier, but we track for cost awareness
  ANTHROPIC: {
    dailyLimit: 500,  // Self-imposed limit for cost control
    warningThreshold: 400,
    enabled: true,
    costPerRequest: 0.01,  // Approximate average cost
  },
  // X.AI Grok - NO free tier, track for cost awareness
  XAI_GROK: {
    dailyLimit: 200,  // Self-imposed limit
    warningThreshold: 150,
    enabled: true,
    costPerRequest: 0.005,  // Approximate
  },
} as const;

type ApiService = keyof typeof API_LIMITS;

interface UsageRecord {
  service: string;
  count: number;
  period: string;  // YYYY-MM for monthly, YYYY-MM-DD for daily
}

/**
 * Get current usage for a service
 */
async function getUsage(service: ApiService, period: 'daily' | 'monthly'): Promise<number> {
  const now = new Date();
  const periodKey = period === 'monthly'
    ? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    : now.toISOString().split('T')[0];

  const { data } = await supabase
    .from('api_usage')
    .select('count')
    .eq('service', service)
    .eq('period', periodKey)
    .single();

  return data?.count || 0;
}

/**
 * Increment usage counter for a service
 */
async function incrementUsage(service: ApiService, period: 'daily' | 'monthly', amount: number = 1): Promise<void> {
  const now = new Date();
  const periodKey = period === 'monthly'
    ? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    : now.toISOString().split('T')[0];

  // Upsert: insert or update
  const { error } = await supabase.rpc('increment_api_usage', {
    p_service: service,
    p_period: periodKey,
    p_amount: amount,
  });

  // Fallback if RPC doesn't exist
  if (error?.code === '42883') {
    // Function doesn't exist, use manual upsert
    const { data: existing } = await supabase
      .from('api_usage')
      .select('count')
      .eq('service', service)
      .eq('period', periodKey)
      .single();

    if (existing) {
      await supabase
        .from('api_usage')
        .update({ count: existing.count + amount })
        .eq('service', service)
        .eq('period', periodKey);
    } else {
      await supabase
        .from('api_usage')
        .insert({ service, period: periodKey, count: amount });
    }
  }
}

/**
 * Check if we can make an API call (within limits)
 * Returns { allowed: boolean, warning?: string, currentUsage: number, limit: number }
 */
export async function checkApiLimit(service: ApiService): Promise<{
  allowed: boolean;
  warning?: string;
  currentUsage: number;
  limit: number;
  remaining: number;
}> {
  const config = API_LIMITS[service];

  if (!config.enabled) {
    return { allowed: false, warning: `${service} is disabled`, currentUsage: 0, limit: 0, remaining: 0 };
  }

  const period = 'monthlyLimit' in config ? 'monthly' : 'daily';
  const limit = 'monthlyLimit' in config ? config.monthlyLimit : config.dailyLimit;
  const warningThreshold = config.warningThreshold;

  const currentUsage = await getUsage(service, period);
  const remaining = Math.max(0, limit - currentUsage);

  // Check if exceeded
  if (currentUsage >= limit) {
    const periodName = period === 'monthly' ? 'this month' : 'today';
    return {
      allowed: false,
      warning: `⚠️ ${service} limit EXCEEDED (${currentUsage}/${limit} ${periodName}). Blocking to stay in free tier.`,
      currentUsage,
      limit,
      remaining: 0,
    };
  }

  // Check if approaching limit
  if (currentUsage >= warningThreshold) {
    const periodName = period === 'monthly' ? 'this month' : 'today';
    return {
      allowed: true,
      warning: `⚠️ ${service} approaching limit (${currentUsage}/${limit} ${periodName}). ${remaining} remaining.`,
      currentUsage,
      limit,
      remaining,
    };
  }

  return { allowed: true, currentUsage, limit, remaining };
}

/**
 * Track an API call (call this after making the API request)
 */
export async function trackApiCall(service: ApiService, count: number = 1): Promise<void> {
  const config = API_LIMITS[service];
  const period = 'monthlyLimit' in config ? 'monthly' : 'daily';

  await incrementUsage(service, period, count);

  // Log for monitoring
  const usage = await getUsage(service, period);
  const limit = 'monthlyLimit' in config ? config.monthlyLimit : config.dailyLimit;

  if (usage >= config.warningThreshold) {
    logger.warn({ service, usage, limit }, `API usage warning: ${service} at ${Math.round(usage/limit*100)}%`);
  }
}

/**
 * Wrapper to safely make an API call with limit checking
 */
export async function withApiLimit<T>(
  service: ApiService,
  apiCall: () => Promise<T>,
  options: { skipIfLimited?: boolean } = {}
): Promise<{ result?: T; blocked: boolean; warning?: string }> {
  const check = await checkApiLimit(service);

  if (!check.allowed) {
    logger.warn({ service, ...check }, 'API call blocked due to limit');
    if (options.skipIfLimited) {
      return { blocked: true, warning: check.warning };
    }
    throw new Error(check.warning);
  }

  if (check.warning) {
    logger.warn({ service }, check.warning);
  }

  try {
    const result = await apiCall();
    await trackApiCall(service);
    return { result, blocked: false, warning: check.warning };
  } catch (error) {
    throw error;
  }
}

/**
 * Get usage summary for all services
 */
export async function getUsageSummary(): Promise<Record<string, {
  usage: number;
  limit: number;
  remaining: number;
  percentUsed: number;
  status: 'ok' | 'warning' | 'exceeded';
}>> {
  const summary: Record<string, { usage: number; limit: number; remaining: number; percentUsed: number; status: 'ok' | 'warning' | 'exceeded' }> = {};

  for (const [service, config] of Object.entries(API_LIMITS)) {
    const period = 'monthlyLimit' in config ? 'monthly' : 'daily';
    const limit = 'monthlyLimit' in config ? config.monthlyLimit : config.dailyLimit;
    const usage = await getUsage(service as ApiService, period);
    const remaining = Math.max(0, limit - usage);
    const percentUsed = Math.round((usage / limit) * 100);

    let status: 'ok' | 'warning' | 'exceeded' = 'ok';
    if (usage >= limit) status = 'exceeded';
    else if (usage >= config.warningThreshold) status = 'warning';

    summary[service] = { usage, limit, remaining, percentUsed, status };
  }

  return summary;
}

export default {
  API_LIMITS,
  checkApiLimit,
  trackApiCall,
  withApiLimit,
  getUsageSummary,
};
