import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import {
  scraperList,
  runScrapers,
  generateDedupeKey,
  ScrapedProperty,
} from '@/lib/scrapers';
import { checkRateLimit, incrementUsage } from '@/lib/rate-limiter';
import { autoEnrichBatch } from '@/lib/enrichment';

const DEFAULT_LOCATIONS = [
  'London, UK',
  'Paris, France',
  'Dubai, UAE',
  'New York, USA',
  'Miami, USA',
  'Barcelona, Spain',
  'Rome, Italy',
  'Singapore',
  'Hong Kong',
  'Maldives',
];

const DEFAULT_JOB_TITLES = [
  'General Manager',
  'Hotel Manager',
  'Director of Operations',
  'F&B Manager',
  'Revenue Manager',
  'Marketing Director',
  'Sales Director',
];

// All available scrapers by default
const DEFAULT_SCRAPERS = ['hosco', 'caterer', 'hcareers', 'hotelcareer', 'indeed'];

export async function POST(request: NextRequest) {
  const supabase = createServerClient();

  // Check rate limit for scrape runs
  const rateLimit = checkRateLimit('scrape_runs');
  if (!rateLimit.allowed) {
    return NextResponse.json({
      error: 'Daily scrape limit reached',
      remaining: rateLimit.remaining,
      limit: rateLimit.limit,
      message: 'Max 5 scrape runs per day to manage resources. Try again tomorrow.',
    }, { status: 429 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const locations = body.locations || DEFAULT_LOCATIONS;
    const jobTitles = body.job_titles || DEFAULT_JOB_TITLES;
    const scraperIds = body.scrapers || DEFAULT_SCRAPERS;

    // Increment scrape usage
    incrementUsage('scrape_runs');

    // Log scrape run start
    const { data: run } = await supabase
      .from('scrape_runs')
      .insert({
        source: scraperIds.join(','),
        locations,
        job_titles: jobTitles,
        status: 'running',
      })
      .select()
      .single();

    const runId = run?.id;

    // Get existing properties for deduplication
    const { data: existingProspects } = await supabase
      .from('prospects')
      .select('name, city');

    const existingKeys = new Set<string>();
    if (existingProspects) {
      for (const p of existingProspects) {
        const key = generateDedupeKey({
          name: p.name,
          city: p.city || '',
          country: '',
          job_title: '',
          source: '',
          source_url: '',
        });
        existingKeys.add(key);
      }
    }

    // Run all scrapers
    const { allProperties, uniqueProperties, totalErrors } = await runScrapers(
      scraperIds,
      locations,
      jobTitles
    );

    // Filter out existing properties
    const newProperties: ScrapedProperty[] = [];
    let duplicatesSkipped = 0;

    for (const prop of uniqueProperties) {
      const key = generateDedupeKey(prop);
      if (!existingKeys.has(key)) {
        newProperties.push(prop);
        existingKeys.add(key); // Prevent duplicates within batch
      } else {
        duplicatesSkipped++;
      }
    }

    // Save new properties and collect IDs for auto-enrichment
    let savedCount = 0;
    const savedIds: string[] = [];
    const batchSize = 50;

    for (let i = 0; i < newProperties.length; i += batchSize) {
      const batch = newProperties.slice(i, i + batchSize);
      const insertData = batch.map(prop => ({
        name: prop.name,
        city: prop.city,
        country: prop.country,
        property_type: prop.property_type || null,
        source: prop.source,
        source_url: prop.source_url,
        source_job_title: prop.job_title,
        website: prop.website || null,
        stage: 'new',
        tier: 'cold',
        score: 0,
      }));

      const { data, error } = await supabase
        .from('prospects')
        .insert(insertData)
        .select('id');

      if (!error && data) {
        savedCount += data.length;
        savedIds.push(...data.map(d => d.id));
      }
    }

    // Update scrape run status to enriching
    if (runId) {
      await supabase
        .from('scrape_runs')
        .update({
          total_found: allProperties.length,
          new_prospects: savedCount,
          duplicates_skipped: duplicatesSkipped + (uniqueProperties.length - allProperties.length),
          errors: totalErrors.length,
          error_log: totalErrors.length > 0 ? totalErrors : null,
          status: 'enriching',
        })
        .eq('id', runId);
    }

    // Auto-enrich all new prospects (scrape websites, find emails, contacts, generate notes)
    let enrichedCount = 0;
    let enrichFailedCount = 0;

    if (savedIds.length > 0) {
      const enrichResult = await autoEnrichBatch(savedIds, 3);
      enrichedCount = enrichResult.enriched;
      enrichFailedCount = enrichResult.failed;
    }

    // Update scrape run as completed
    if (runId) {
      await supabase
        .from('scrape_runs')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          error_log: [
            ...(totalErrors.length > 0 ? totalErrors : []),
            `Auto-enriched ${enrichedCount} prospects, ${enrichFailedCount} failed`,
          ],
        })
        .eq('id', runId);
    }

    return NextResponse.json({
      success: true,
      scrapers_used: scraperIds,
      total_found: allProperties.length,
      after_dedup: uniqueProperties.length,
      new_saved: savedCount,
      auto_enriched: enrichedCount,
      enrich_failed: enrichFailedCount,
      duplicates_skipped: duplicatesSkipped,
      errors: totalErrors.length,
      run_id: runId,
    });
  } catch (error) {
    console.error('Scrape error:', error);
    return NextResponse.json(
      { error: 'Scrape failed', details: String(error) },
      { status: 500 }
    );
  }
}

// Get scrape history and available scrapers
export async function GET(request: NextRequest) {
  const supabase = createServerClient();
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  if (action === 'scrapers') {
    return NextResponse.json({
      scrapers: scraperList,
      default_locations: DEFAULT_LOCATIONS,
      default_job_titles: DEFAULT_JOB_TITLES,
    });
  }

  const { data: runs, error } = await supabase
    .from('scrape_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    runs,
    scrapers: scraperList,
  });
}
