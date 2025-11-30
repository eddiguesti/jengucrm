import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { runScrapers, recommendedScrapers, filterNewProperties, normalizePropertyName, normalizeCity, filterRelevantProperties, getJobPriorityScore, getTierFromScore } from '@/lib/scrapers';
import { extractJobPainPoints } from '@/lib/extract-job-pain-points';
import { cleanupProspects } from '@/lib/enrichment/ai-cleanup';

// All locations to scrape - rotated daily to spread the load
const ALL_LOCATIONS = [
  // Europe - Luxury
  'London, UK',
  'Paris, France',
  'Monaco',
  'Barcelona, Spain',
  'Rome, Italy',
  'Milan, Italy',
  'Geneva, Switzerland',
  'Zurich, Switzerland',
  'Amsterdam, Netherlands',
  'Vienna, Austria',
  // Middle East
  'Dubai, UAE',
  'Abu Dhabi, UAE',
  'Doha, Qatar',
  // Asia Pacific
  'Singapore',
  'Hong Kong',
  'Tokyo, Japan',
  'Bangkok, Thailand',
  'Bali, Indonesia',
  // Americas
  'New York, USA',
  'Miami, USA',
  'Los Angeles, USA',
  'Las Vegas, USA',
  // Islands & Resorts
  'Maldives',
  'Mauritius',
  'Seychelles',
];

// Job titles - now includes IT/AI/Automation roles
const ALL_JOB_TITLES = [
  // Leadership & Operations
  'General Manager',
  'Hotel Manager',
  'Director of Operations',
  'Managing Director',
  // Revenue & Commercial
  'Revenue Manager',
  'Commercial Director',
  'Sales Director',
  // F&B Leadership
  'F&B Manager',
  'F&B Director',
  // Front of House
  'Front Office Manager',
  'Rooms Division Manager',
  // Technology & Innovation (KEY TARGETS!)
  'IT Manager',
  'IT Director',
  'Technology Director',
  'Digital Director',
  'Digital Manager',
  'Innovation Manager',
  'AI Manager',
  'Automation Manager',
  'Systems Manager',
  'CTO',
  'Chief Technology Officer',
  // Marketing
  'Marketing Director',
  'Marketing Manager',
  'Digital Marketing Manager',
];

// Get today's batch of locations (rotate through 5-6 per day)
function getTodaysLocations(): string[] {
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  const batchSize = 5;
  const startIndex = (dayOfYear * batchSize) % ALL_LOCATIONS.length;

  const locations: string[] = [];
  for (let i = 0; i < batchSize; i++) {
    locations.push(ALL_LOCATIONS[(startIndex + i) % ALL_LOCATIONS.length]);
  }
  return locations;
}

// Get today's batch of job titles (rotate through 8-10 per day)
function getTodaysJobTitles(): string[] {
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  const batchSize = 8;
  const startIndex = (dayOfYear * 3) % ALL_JOB_TITLES.length; // Different rotation pattern

  const titles: string[] = [];
  for (let i = 0; i < batchSize; i++) {
    titles.push(ALL_JOB_TITLES[(startIndex + i) % ALL_JOB_TITLES.length]);
  }
  return titles;
}

export async function GET(request: NextRequest) {
  // Verify this is a legitimate cron request from Vercel
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    // In development, allow without auth
    if (process.env.NODE_ENV === 'production' && process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const supabase = createServerClient();

  // Get today's rotation of locations and job titles
  const todaysLocations = getTodaysLocations();
  const todaysJobTitles = getTodaysJobTitles();

  try {
    // Log the start of this cron run
    const { data: runLog } = await supabase
      .from('scrape_runs')
      .insert({
        source: 'cron_daily',
        locations: todaysLocations,
        job_titles: todaysJobTitles,
        status: 'running',
      })
      .select()
      .single();

    // Get existing prospect names for deduplication
    const { data: existingProspects } = await supabase
      .from('prospects')
      .select('name, city');

    const existingNames = new Set(
      (existingProspects || []).map((p) => `${normalizePropertyName(p.name)}|${normalizeCity(p.city || '')}`)
    );

    // Build scraper list - base 8 + optional ones if API keys are configured
    const scrapersToRun = [...recommendedScrapers];

    // Add Indeed if SCRAPERAPI_KEY is configured
    if (process.env.SCRAPERAPI_KEY) {
      scrapersToRun.push('indeed');
    }

    // Add Adzuna if both API keys are configured
    if (process.env.ADZUNA_APP_ID && process.env.ADZUNA_API_KEY) {
      scrapersToRun.push('adzuna');
    }

    // Run all scrapers in parallel
    const { uniqueProperties, totalErrors } = await runScrapers(
      scrapersToRun,
      todaysLocations,
      todaysJobTitles
    );

    // Filter out irrelevant roles (kitchen staff, housekeeping, etc.) AND large chains
    const { relevant: relevantProperties, filtered: irrelevantCount, filteredRoles, filteredChains } = filterRelevantProperties(uniqueProperties);

    // Filter to only new properties
    const { new: newProperties, duplicates } = await filterNewProperties(
      relevantProperties,
      existingNames
    );

    // Insert new prospects with smart tier based on job role
    let inserted = 0;
    let painPointsExtracted = 0;
    let tierCounts = { hot: 0, warm: 0, cold: 0 };
    for (const property of newProperties) {
      // Calculate tier based on job title priority
      const priorityScore = getJobPriorityScore(property.job_title);
      const tier = getTierFromScore(priorityScore);
      tierCounts[tier]++;

      // Extract pain points from job description using Grok
      let jobPainPoints = null;
      if (property.job_description && process.env.XAI_API_KEY) {
        try {
          jobPainPoints = await extractJobPainPoints(
            property.job_title,
            property.job_description
          );
          if (jobPainPoints) painPointsExtracted++;
        } catch (err) {
          console.error('Pain point extraction failed:', err);
        }
      }

      const { error } = await supabase.from('prospects').insert({
        name: property.name,
        city: property.city,
        country: property.country,
        website: property.website,
        source: property.source,
        source_url: property.source_url,
        source_job_title: property.job_title,
        source_job_description: property.job_description?.slice(0, 5000), // Limit size
        job_pain_points: jobPainPoints,
        property_type: property.property_type || 'hotel',
        tier: tier,
        stage: 'new',
        lead_source: 'job_posting',
      });

      if (!error) {
        inserted++;
      }
    }

    // Run AI cleanup on all new prospects to catch anything the rule-based filter missed
    let aiCleanupResult = { analyzed: 0, archived: 0, kept: 0 };
    if (process.env.XAI_API_KEY && inserted > 0) {
      try {
        aiCleanupResult = await cleanupProspects({
          dryRun: false,
          limit: inserted + 20, // Process all newly inserted + some buffer
          stage: 'new',
        });
      } catch (cleanupError) {
        console.error('AI cleanup failed:', cleanupError);
        totalErrors.push(`AI cleanup error: ${String(cleanupError)}`);
      }
    }

    // Update the run log
    await supabase
      .from('scrape_runs')
      .update({
        total_found: uniqueProperties.length,
        new_prospects: inserted,
        duplicates_skipped: duplicates,
        errors: totalErrors.length,
        error_log: [
          ...totalErrors,
          `Filtered ${irrelevantCount} irrelevant roles: ${filteredRoles.slice(0, 10).join(', ')}`,
          `Filtered ${filteredChains.length} large chains: ${filteredChains.slice(0, 10).join(', ')}`,
          `AI cleanup: analyzed ${aiCleanupResult.analyzed}, archived ${aiCleanupResult.archived}, kept ${aiCleanupResult.kept}`,
        ],
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', runLog?.id);

    return NextResponse.json({
      success: true,
      message: 'Daily job scrape completed',
      stats: {
        scrapers_used: scrapersToRun,
        scrapers_count: scrapersToRun.length,
        locations_today: todaysLocations,
        job_titles_today: todaysJobTitles,
        total_found: uniqueProperties.length,
        relevant_roles: relevantProperties.length,
        irrelevant_filtered: irrelevantCount,
        new_prospects: inserted,
        pain_points_extracted: painPointsExtracted,
        duplicates_skipped: duplicates,
        errors: totalErrors.length,
        sample_filtered_roles: filteredRoles.slice(0, 5),
        chains_filtered: filteredChains.length,
        sample_filtered_chains: filteredChains.slice(0, 5),
        tier_breakdown: tierCounts,
        ai_cleanup: {
          analyzed: aiCleanupResult.analyzed,
          archived: aiCleanupResult.archived,
          kept: aiCleanupResult.kept,
        },
        api_keys_configured: {
          scraperapi: !!process.env.SCRAPERAPI_KEY,
          adzuna: !!(process.env.ADZUNA_APP_ID && process.env.ADZUNA_API_KEY),
          xai: !!process.env.XAI_API_KEY,
        },
      },
    });
  } catch (error) {
    console.error('Cron job scrape failed:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
