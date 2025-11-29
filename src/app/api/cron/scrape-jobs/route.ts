import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { runScrapers, recommendedScrapers, filterNewProperties, normalizePropertyName, normalizeCity, filterRelevantProperties } from '@/lib/scrapers';

// Default locations and job titles for automated scraping
const DEFAULT_LOCATIONS = [
  'London, UK',
  'Paris, France',
  'Dubai, UAE',
  'New York, USA',
  'Miami, USA',
  'Barcelona, Spain',
  'Rome, Italy',
  'Singapore',
  'Maldives',
  'Monaco',
];

const DEFAULT_JOB_TITLES = [
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
  // Technology & Innovation
  'IT Manager',
  'IT Director',
  'Digital Manager',
  'Technology Director',
  // Marketing
  'Marketing Director',
  'Marketing Manager',
  'Digital Marketing Manager',
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

  const supabase = createServerClient();

  try {
    // Log the start of this cron run
    const { data: runLog } = await supabase
      .from('scrape_runs')
      .insert({
        source: 'cron_daily',
        locations: DEFAULT_LOCATIONS,
        job_titles: DEFAULT_JOB_TITLES,
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

    // Run the recommended scrapers
    const { uniqueProperties, totalErrors } = await runScrapers(
      recommendedScrapers,
      DEFAULT_LOCATIONS,
      DEFAULT_JOB_TITLES
    );

    // Filter out irrelevant roles (kitchen staff, housekeeping, etc.)
    const { relevant: relevantProperties, filtered: irrelevantCount, filteredRoles } = filterRelevantProperties(uniqueProperties);

    // Filter to only new properties
    const { new: newProperties, duplicates } = await filterNewProperties(
      relevantProperties,
      existingNames
    );

    // Insert new prospects
    let inserted = 0;
    for (const property of newProperties) {
      const { error } = await supabase.from('prospects').insert({
        name: property.name,
        city: property.city,
        country: property.country,
        website: property.website,
        source: property.source,
        source_url: property.source_url,
        source_job_title: property.job_title,
        property_type: property.property_type || 'hotel',
        tier: 'cold',
        stage: 'new',
        lead_source: 'job_posting',
      });

      if (!error) {
        inserted++;
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
        error_log: [...totalErrors, `Filtered ${irrelevantCount} irrelevant roles: ${filteredRoles.slice(0, 10).join(', ')}`],
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', runLog?.id);

    return NextResponse.json({
      success: true,
      message: 'Daily job scrape completed',
      stats: {
        total_found: uniqueProperties.length,
        relevant_roles: relevantProperties.length,
        irrelevant_filtered: irrelevantCount,
        new_prospects: inserted,
        duplicates_skipped: duplicates,
        errors: totalErrors.length,
        sample_filtered_roles: filteredRoles.slice(0, 5),
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
