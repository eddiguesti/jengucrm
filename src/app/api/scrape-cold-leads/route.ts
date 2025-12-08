import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import {
  getUKCities,
  getEuropeanCities,
} from '@/lib/scrapers';

/**
 * Scrape cold leads from Google Maps
 * DISABLED - Uses paid Google Places API (PRO tier = $0.004/request)
 * Re-enable when needed, but be aware of costs
 */
export async function POST() {
  // DISABLED: Google Maps scraper uses PRO tier fields (phone, rating)
  // which cost $0.004 per request. Disabled to prevent unexpected charges.
  return NextResponse.json(
    {
      error: 'Google Maps scraper is disabled',
      reason: 'Uses paid Google Places API (PRO tier = $0.004/request)',
      alternative: 'Use Sales Navigator imports instead (free)',
    },
    { status: 403 }
  );
}

/**
 * GET: Check cold lead stats
 */
export async function GET() {
  const supabase = createServerClient();

  try {
    // Count prospects by lead quality
    const { count: hotCount } = await supabase
      .from('prospects')
      .select('*', { count: 'exact', head: true })
      .eq('lead_quality', 'hot')
      .eq('archived', false);

    const { count: warmCount } = await supabase
      .from('prospects')
      .select('*', { count: 'exact', head: true })
      .eq('lead_quality', 'warm')
      .eq('archived', false);

    const { count: coldCount } = await supabase
      .from('prospects')
      .select('*', { count: 'exact', head: true })
      .eq('lead_quality', 'cold')
      .eq('archived', false);

    // Count by stage (ready to email)
    const { count: readyToEmail } = await supabase
      .from('prospects')
      .select('*', { count: 'exact', head: true })
      .in('stage', ['new', 'researching'])
      .eq('archived', false)
      .not('email', 'is', null);

    return NextResponse.json({
      lead_counts: {
        hot: hotCount || 0,
        warm: warmCount || 0,
        cold: coldCount || 0,
        total: (hotCount || 0) + (warmCount || 0) + (coldCount || 0),
      },
      ready_to_email: readyToEmail || 0,
      recommendation: (hotCount || 0) < 50
        ? 'Hot leads running low - Google Maps scraper is disabled (paid API)'
        : 'Hot lead pool healthy',
      available_regions: {
        uk: getUKCities().length + ' cities',
        europe: getEuropeanCities().length + ' cities',
      },
      scraper_status: 'DISABLED - uses paid Google Places API',
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to get stats', details: String(error) },
      { status: 500 }
    );
  }
}
