import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import {
  scrapeGoogleMaps,
  scrapeMultipleLocations,
  getUKCities,
  getEuropeanCities,
} from '@/lib/scrapers';

/**
 * Scrape cold leads from Google Maps
 * These are Tier 2 leads - bulk volume, lower conversion
 * Used when hot leads run low
 */
export async function POST(request: NextRequest) {
  const supabase = createServerClient();

  try {
    const body = await request.json();
    const {
      locations,          // Custom locations to scrape
      region,             // 'uk', 'europe', 'both'
      maxPerLocation = 30, // Limit per city
      minRating = 3.5,    // Minimum Google rating
    } = body;

    // Determine which locations to scrape
    let targetLocations: string[] = [];

    if (locations && locations.length > 0) {
      targetLocations = locations;
    } else if (region === 'uk') {
      targetLocations = getUKCities();
    } else if (region === 'europe') {
      targetLocations = getEuropeanCities();
    } else if (region === 'both') {
      targetLocations = [...getUKCities(), ...getEuropeanCities()];
    } else {
      // Default: top 5 UK cities
      targetLocations = getUKCities().slice(0, 5);
    }

    // Get existing prospect names to avoid duplicates
    const { data: existingProspects } = await supabase
      .from('prospects')
      .select('name, city');

    const existingKeys = new Set(
      (existingProspects || []).map(p =>
        `${p.name?.toLowerCase().trim()}|${p.city?.toLowerCase().trim()}`
      )
    );

    // Scrape Google Maps
    const results = await scrapeMultipleLocations(targetLocations, maxPerLocation);

    // Filter out existing prospects and prepare for insert
    const newProspects: Array<Record<string, unknown>> = [];
    let duplicates = 0;

    for (const listing of results.listings) {
      const metadata = listing.metadata || {};
      const name = listing.company;
      const city = metadata.city || '';

      // Check for duplicates
      const key = `${name.toLowerCase().trim()}|${city.toLowerCase().trim()}`;
      if (existingKeys.has(key)) {
        duplicates++;
        continue;
      }
      existingKeys.add(key);

      // Prepare prospect record
      newProspects.push({
        name,
        city,
        country: metadata.country || '',
        full_address: listing.location,
        website: metadata.website,
        phone: metadata.phone,
        google_place_id: metadata.google_place_id,
        google_rating: metadata.rating,
        google_review_count: metadata.review_count,
        source: 'google_maps',
        source_url: listing.sourceUrl,
        lead_quality: 'cold', // Mark as cold lead
        stage: 'new',
        property_type: 'hotel',
        notes: `Bulk scraped from Google Maps. Rating: ${metadata.rating || 'N/A'}★ (${metadata.review_count || 0} reviews)`,
        tags: ['cold-lead', 'google-maps'],
      });
    }

    // Insert new prospects in batches
    let inserted = 0;
    const batchSize = 50;

    for (let i = 0; i < newProspects.length; i += batchSize) {
      const batch = newProspects.slice(i, i + batchSize);
      const { error } = await supabase.from('prospects').insert(batch);

      if (error) {
        console.error('Insert error:', error);
      } else {
        inserted += batch.length;
      }
    }

    // Log the scrape run
    await supabase.from('scrape_runs').insert({
      source: 'google_maps',
      locations: targetLocations,
      job_titles: ['bulk_cold_leads'],
      total_found: results.totalFound,
      new_prospects: inserted,
      duplicates_skipped: duplicates,
      errors: results.errors?.length || 0,
      error_log: results.errors || [],
      status: 'completed',
      completed_at: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      locations_scraped: targetLocations.length,
      total_found: results.totalFound,
      new_prospects: inserted,
      duplicates_skipped: duplicates,
      errors: results.errors,
    });
  } catch (error) {
    console.error('Cold lead scraping error:', error);
    return NextResponse.json(
      { error: 'Failed to scrape cold leads', details: String(error) },
      { status: 500 }
    );
  }
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
        ? 'Hot leads running low - consider scraping cold leads from Google Maps'
        : 'Hot lead pool healthy',
      available_regions: {
        uk: getUKCities().length + ' cities',
        europe: getEuropeanCities().length + ' cities',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to get stats', details: String(error) },
      { status: 500 }
    );
  }
}
