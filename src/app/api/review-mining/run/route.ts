import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  runReviewMining,
  saveReviewMiningResults,
  logScrapeRun,
} from '@/lib/scrapers/review-mining';
import { ReviewPlatform } from '@/types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { platform, locations } = body as {
      platform: ReviewPlatform;
      locations: string[];
    };

    if (!platform || !locations || locations.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Platform and locations are required' },
        { status: 400 }
      );
    }

    let totalPropertiesScanned = 0;
    let totalReviewsScanned = 0;
    let totalPainSignals = 0;
    let totalNewLeads = 0;
    let totalErrors = 0;

    // Run mining for each location
    for (const location of locations) {
      try {
        // Run the scraper
        const results = await runReviewMining(platform, location);

        totalPropertiesScanned += results.properties_scanned;
        totalReviewsScanned += results.reviews_scanned;
        totalPainSignals += results.properties.reduce((sum, p) => sum + p.pain_signals.length, 0);
        totalErrors += results.errors.length;

        // Save results to database
        const { newLeads, errors } = await saveReviewMiningResults(
          results,
          supabaseUrl,
          supabaseKey
        );
        totalNewLeads += newLeads;
        totalErrors += errors.length;

        // Log the scrape run
        await logScrapeRun(platform, location, results, newLeads, supabaseUrl, supabaseKey);
      } catch (err) {
        console.error(`Error mining ${location}:`, err);
        totalErrors++;

        // Log failed run
        const supabase = createClient(supabaseUrl, supabaseKey);
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
      properties_scanned: totalPropertiesScanned,
      reviews_scanned: totalReviewsScanned,
      pain_signals_found: totalPainSignals,
      new_leads: totalNewLeads,
      errors: totalErrors,
    });
  } catch (error) {
    console.error('Review mining failed:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
