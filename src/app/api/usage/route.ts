import { NextResponse } from 'next/server';
import { getUsageStats, FREE_TIER_LIMITS } from '@/lib/rate-limiter';

export async function GET() {
  const stats = getUsageStats();

  return NextResponse.json({
    stats,
    limits: FREE_TIER_LIMITS,
    message: 'Daily usage resets at midnight.',
  });
}
