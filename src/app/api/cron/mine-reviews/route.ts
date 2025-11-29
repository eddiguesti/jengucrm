import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import {
  runReviewMining,
  saveReviewMiningResults,
  logScrapeRun,
} from '@/lib/scrapers/review-mining';
import { ReviewPlatform } from '@/types';

// Rotate through locations each day to avoid rate limits
const MINING_LOCATIONS = [
  'London',
  'Paris',
  'Dubai',
  'New York',
  'Miami',
  'Barcelona',
  'Rome',
  'Singapore',
  'Maldives',
  'Monaco',
  'Milan',
  'Los Angeles',
  'Hong Kong',
  'Tokyo',
];

export async function GET(request: NextRequest) {
  // Verify this is a legitimate cron request from Vercel
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    // In development, allow without auth
    if (process.env.NODE_ENV === 'production' && process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    // Pick 2-3 locations to mine today (rotate based on day of year)
    const dayOfYear = Math.floor(
      (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
    );
    const startIndex = (dayOfYear * 2) % MINING_LOCATIONS.length;
    const todaysLocations = [
      MINING_LOCATIONS[startIndex],
      MINING_LOCATIONS[(startIndex + 1) % MINING_LOCATIONS.length],
    ];

    // Alternate between TripAdvisor and Google
    const platform: ReviewPlatform = dayOfYear % 2 === 0 ? 'tripadvisor' : 'google';

    let totalPropertiesScanned = 0;
    let totalReviewsScanned = 0;
    let totalPainSignals = 0;
    let totalNewLeads = 0;
    let totalErrors = 0;

    // Run mining for each location
    for (const location of todaysLocations) {
      try {
        // Run the scraper
        const results = await runReviewMining(platform, location);

        totalPropertiesScanned += results.properties_scanned;
        totalReviewsScanned += results.reviews_scanned;
        totalPainSignals += results.properties.reduce(
          (sum, p) => sum + p.pain_signals.length,
          0
        );
        totalErrors += results.errors.length;

        // Save results to database
        const { newLeads, errors } = await saveReviewMiningResults(results);
        totalNewLeads += newLeads;
        totalErrors += errors.length;

        // Log the scrape run
        await logScrapeRun(platform, location, results, newLeads);
      } catch (err) {
        console.error(`Error mining ${location}:`, err);
        totalErrors++;

        // Log failed run
        const supabase = createServerClient();
        await supabase.from('review_scrape_logs').insert({
          platform,
          location,
          properties_scanned: 0,
          reviews_scanned: 0,
          pain_signals_found: 0,
          new_leads_created: 0,
          errors: 1,
          error_log: [String(err)],
          status: 'failed',
          completed_at: new Date().toISOString(),
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Daily review mining completed',
      stats: {
        platform,
        locations: todaysLocations,
        properties_scanned: totalPropertiesScanned,
        reviews_scanned: totalReviewsScanned,
        pain_signals_found: totalPainSignals,
        new_leads: totalNewLeads,
        errors: totalErrors,
      },
    });
  } catch (error) {
    console.error('Cron review mining failed:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
