import { tripadvisorScraper } from './tripadvisor';
import { googleReviewScraper } from './google';
import { ReviewMiningResult, ReviewMinedProperty } from './types';
import { ReviewPlatform, REVIEW_MINING_LOCATIONS } from '@/types';
import { createClient } from '@supabase/supabase-js';

export { tripadvisorScraper } from './tripadvisor';
export { googleReviewScraper } from './google';
export * from './types';

// Get all target locations as a flat array
export function getAllMiningLocations(): string[] {
  const locations: string[] = [];
  for (const region of Object.values(REVIEW_MINING_LOCATIONS)) {
    locations.push(...region);
  }
  return locations;
}

// Get locations by region
export function getLocationsByRegion(): Record<string, readonly string[]> {
  return REVIEW_MINING_LOCATIONS;
}

// Run review mining for a specific platform and location
export async function runReviewMining(
  platform: ReviewPlatform,
  location: string
): Promise<ReviewMiningResult> {
  switch (platform) {
    case 'tripadvisor':
      return tripadvisorScraper.scrape(location);
    case 'google':
      return googleReviewScraper.scrape(location);
    case 'booking':
      // Booking.com scraper not implemented yet
      return {
        platform: 'booking',
        location,
        properties_scanned: 0,
        reviews_scanned: 0,
        properties: [],
        errors: ['Booking.com scraper not yet implemented'],
        duration: 0,
      };
  }
}

// Save review mining results to database
export async function saveReviewMiningResults(
  results: ReviewMiningResult,
  supabaseUrl: string,
  supabaseKey: string
): Promise<{ newLeads: number; newSignals: number; errors: string[] }> {
  const supabase = createClient(supabaseUrl, supabaseKey);
  const errors: string[] = [];
  let newLeads = 0;
  let newSignals = 0;

  for (const property of results.properties) {
    try {
      // Check if prospect already exists (by name and city)
      const { data: existing } = await supabase
        .from('prospects')
        .select('id')
        .eq('name', property.name)
        .eq('city', property.city)
        .single();

      let prospectId: string;

      if (existing) {
        prospectId = existing.id;
      } else {
        // Create new prospect
        const { data: newProspect, error: insertError } = await supabase
          .from('prospects')
          .insert({
            name: property.name,
            city: property.city,
            country: property.country,
            region: property.region,
            property_type: property.property_type,
            website: property.website,
            google_place_id: property.google_place_id,
            google_rating: property.google_rating,
            google_review_count: property.google_review_count,
            lead_source: 'review_mining',
            source: results.platform,
            source_url: property.tripadvisor_url || null,
            tier: 'warm', // Pain signal leads start as warm
            stage: 'new',
            score: calculatePainScore(property),
          })
          .select('id')
          .single();

        if (insertError) {
          errors.push(`Failed to create prospect ${property.name}: ${insertError.message}`);
          continue;
        }

        prospectId = newProspect!.id;
        newLeads++;
      }

      // Insert pain signals
      for (const signal of property.pain_signals) {
        const { error: signalError } = await supabase.from('pain_signals').insert({
          prospect_id: prospectId,
          source_platform: results.platform,
          keyword_matched: signal.keyword_matched,
          review_snippet: signal.review_snippet,
          review_rating: signal.review_rating,
          review_date: signal.review_date,
          reviewer_name: signal.reviewer_name,
          review_url: signal.review_url,
        });

        if (signalError) {
          errors.push(`Failed to save pain signal for ${property.name}: ${signalError.message}`);
        } else {
          newSignals++;
        }
      }
    } catch (err) {
      errors.push(`Error processing ${property.name}: ${err}`);
    }
  }

  return { newLeads, newSignals, errors };
}

// Calculate lead score based on pain signals
function calculatePainScore(property: ReviewMinedProperty): number {
  let score = 0;

  // Base score for having pain signals
  score += 30;

  // More pain signals = higher score (up to 30 points)
  score += Math.min(property.pain_signals.length * 10, 30);

  // Lower average review rating = higher pain urgency (up to 20 points)
  const avgRating =
    property.pain_signals.reduce((sum, s) => sum + (s.review_rating || 3), 0) /
    property.pain_signals.length;
  if (avgRating <= 1.5) score += 20;
  else if (avgRating <= 2) score += 15;
  else if (avgRating <= 2.5) score += 10;
  else if (avgRating <= 3) score += 5;

  // High overall rating but poor communication = good target (10 points)
  if ((property.google_rating || 0) >= 4.0) {
    score += 10;
  }

  // Many reviews = established property (10 points)
  if ((property.google_review_count || 0) >= 500) {
    score += 10;
  }

  return Math.min(score, 100);
}

// Log a scrape run to the database
export async function logScrapeRun(
  platform: ReviewPlatform,
  location: string,
  results: ReviewMiningResult,
  newLeads: number,
  supabaseUrl: string,
  supabaseKey: string
): Promise<void> {
  const supabase = createClient(supabaseUrl, supabaseKey);

  await supabase.from('review_scrape_logs').insert({
    platform,
    location,
    properties_scanned: results.properties_scanned,
    reviews_scanned: results.reviews_scanned,
    pain_signals_found: results.properties.reduce((sum, p) => sum + p.pain_signals.length, 0),
    new_leads_created: newLeads,
    errors: results.errors.length,
    error_log: results.errors.length > 0 ? results.errors : null,
    status: results.errors.length > 0 && results.properties.length === 0 ? 'failed' : 'completed',
    completed_at: new Date().toISOString(),
  });
}
