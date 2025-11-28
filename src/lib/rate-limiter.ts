// Rate limiting and free tier management
// Google Places API (New) free tier: $200/month credit (~around 5,000 Text Search requests)
// Anthropic: Pay as you go, but we'll add daily limits

interface UsageRecord {
  count: number;
  resetAt: number;
}

const usage: Record<string, UsageRecord> = {};

// Free tier limits - using Google Essentials tier (10k free/month)
// Set to 0 to disable a service entirely
export const FREE_TIER_LIMITS = {
  google_places: 300, // ~300/day = ~9000/month (under 10k free limit)
  anthropic_emails: 50, // ~50 emails per day (~$0.10/day with Sonnet)
  scrape_runs: 10, // Max 10 scrape runs per day (free - just web scraping)
};

function getKey(service: string): string {
  const today = new Date().toISOString().split('T')[0];
  return `${service}:${today}`;
}

export function checkRateLimit(service: keyof typeof FREE_TIER_LIMITS): {
  allowed: boolean;
  remaining: number;
  limit: number;
} {
  const key = getKey(service);
  const limit = FREE_TIER_LIMITS[service];
  const now = Date.now();
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  if (!usage[key] || usage[key].resetAt < now) {
    usage[key] = { count: 0, resetAt: endOfDay.getTime() };
  }

  const remaining = Math.max(0, limit - usage[key].count);
  return {
    allowed: usage[key].count < limit,
    remaining,
    limit,
  };
}

export function incrementUsage(service: keyof typeof FREE_TIER_LIMITS, amount = 1): void {
  const key = getKey(service);
  const now = Date.now();
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  if (!usage[key] || usage[key].resetAt < now) {
    usage[key] = { count: 0, resetAt: endOfDay.getTime() };
  }

  usage[key].count += amount;
}

export function getUsageStats(): Record<string, { used: number; limit: number; remaining: number }> {
  const stats: Record<string, { used: number; limit: number; remaining: number }> = {};

  for (const service of Object.keys(FREE_TIER_LIMITS) as Array<keyof typeof FREE_TIER_LIMITS>) {
    const { remaining, limit } = checkRateLimit(service);
    const used = limit - remaining;
    stats[service] = { used, limit, remaining };
  }

  return stats;
}
