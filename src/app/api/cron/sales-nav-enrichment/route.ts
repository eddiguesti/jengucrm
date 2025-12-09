import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { success, errors } from '@/lib/api-response';
import { logger } from '@/lib/logger';
import { findEmail, type EmailFinderResult } from '@/lib/email/finder/engine';
import { scrapeWebsite, extractDomain } from '@/lib/enrichment/website-scraper';
import { config } from '@/lib/config';

interface EnrichmentJob {
  id: string;
  prospect_id: string;
  prospect_name: string;
  company: string;
  firstname: string;
  lastname: string;
  linkedin_url: string | null;
  status: string;
  email_found: string | null;
  email_verified: boolean;
  research_done: boolean;
  error: string | null;
  created_at: string;
}

/**
 * Search DuckDuckGo for hotel website
 */
async function searchForWebsite(hotelName: string, country: string): Promise<string | null> {
  try {
    const query = `${hotelName} hotel ${country} official website`;
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    });

    if (!response.ok) return null;

    const html = await response.text();

    // Extract URLs from search results
    const urlMatches = html.match(/href="(https?:\/\/[^"]+)"/gi) || [];

    // Filter for likely hotel websites (exclude booking sites, social media, etc.)
    const excludePatterns = /booking\.com|expedia|tripadvisor|hotels\.com|agoda|trivago|kayak|facebook|twitter|instagram|linkedin|youtube|wikipedia|yelp/i;

    for (const match of urlMatches) {
      const url = match.replace(/href="|"/g, '');
      if (!excludePatterns.test(url) && !url.includes('duckduckgo')) {
        // Validate it looks like a hotel website
        if (url.includes('hotel') || url.includes('resort') || url.includes('inn')) {
          return url;
        }
      }
    }

    // Return first non-excluded result
    for (const match of urlMatches.slice(0, 10)) {
      const url = match.replace(/href="|"/g, '');
      if (!excludePatterns.test(url) && !url.includes('duckduckgo') && url.startsWith('http')) {
        return url;
      }
    }

    return null;
  } catch (error) {
    logger.debug({ error }, 'DuckDuckGo search failed');
    return null;
  }
}

/**
 * Priority titles for decision makers
 */
const PRIORITY_TITLES = [
  'general manager', 'gm', 'owner', 'managing director',
  'hotel manager', 'director', 'operations manager',
  'sales director', 'marketing director',
];

/**
 * Process a single enrichment job
 * Returns the email result and method used
 */
async function processEnrichmentJob(
  job: EnrichmentJob,
  prospect: {
    id: string;
    name: string;
    website: string | null;
    city: string | null;
    country: string | null;
    tags: string[] | null;
    score: number | null;
    full_address: string | null;
  },
  supabase: ReturnType<typeof createServerClient>
): Promise<{
  email: string | null;
  confidence: number;
  confidenceLevel: string;
  method: string;
  website: string | null;
}> {
  let websiteFound = prospect.website;
  let domain: string | null = null;

  // ============================================
  // STEP 1: Find or discover the hotel website
  // ============================================

  // Strategy 1A: Use existing website
  if (websiteFound) {
    domain = extractDomain(websiteFound);
    logger.debug({ hotel: job.company, website: websiteFound, domain }, 'Using existing website');
  }

  // Strategy 1B: DuckDuckGo search to find website
  if (!websiteFound && prospect.country) {
    websiteFound = await searchForWebsite(job.company || prospect.name, prospect.country);
    if (websiteFound) {
      domain = extractDomain(websiteFound);
      logger.info({ hotel: job.company, website: websiteFound }, 'Found website via DuckDuckGo search');

      await supabase
        .from('prospects')
        .update({ website: websiteFound })
        .eq('id', prospect.id);
    }
  }

  // ============================================
  // STEP 2: Scrape website for emails & contacts
  // ============================================

  let scrapedEmails: string[] = [];
  let scrapedTeamMembers: Array<{ name: string; title: string; email?: string }> = [];

  if (websiteFound) {
    try {
      const scrapeResult = await scrapeWebsite(websiteFound);
      scrapedEmails = scrapeResult.emails || [];
      scrapedTeamMembers = scrapeResult.teamMembers || [];

      logger.debug({
        hotel: job.company,
        emailsFound: scrapedEmails.length,
        teamMembersFound: scrapedTeamMembers.length,
      }, 'Website scrape complete');

      // Check if we found a decision maker with their email
      for (const member of scrapedTeamMembers) {
        const isDecisionMaker = PRIORITY_TITLES.some(t =>
          member.title.toLowerCase().includes(t)
        );

        if (isDecisionMaker && member.email) {
          logger.info({
            hotel: job.company,
            name: member.name,
            title: member.title,
            email: member.email
          }, 'Found decision maker email on website!');

          return {
            email: member.email,
            confidence: 90,
            confidenceLevel: 'high',
            method: 'website_scrape_dm',
            website: websiteFound,
          };
        }
      }

      // Check if any scraped email matches the contact's name
      if (scrapedEmails.length > 0 && job.lastname) {
        const lastNameLower = job.lastname.toLowerCase();
        const matchingEmail = scrapedEmails.find(e =>
          e.toLowerCase().includes(lastNameLower)
        );

        if (matchingEmail) {
          logger.info({ hotel: job.company, email: matchingEmail }, 'Found matching email on website');
          return {
            email: matchingEmail,
            confidence: 85,
            confidenceLevel: 'high',
            method: 'website_scrape_name_match',
            website: websiteFound,
          };
        }
      }
    } catch (e) {
      logger.debug({ error: e }, 'Website scrape failed');
    }
  }

  // ============================================
  // STEP 3: Use the Email Finder Engine
  // ============================================

  if (domain && job.firstname && job.lastname) {
    try {
      const finderResult: EmailFinderResult = await findEmail({
        firstName: job.firstname,
        lastName: job.lastname,
        domain,
        website: websiteFound || undefined,
        companyName: job.company,
        verifySmtp: true,
        useHunter: true,
        maxCandidates: 5,
        timeout: 15000,
      });

      if (finderResult.email && finderResult.confidence >= 40) {
        logger.info({
          hotel: job.company,
          email: finderResult.email,
          confidence: finderResult.confidence,
          method: finderResult.verificationMethod,
        }, 'Email finder engine found email');

        return {
          email: finderResult.email,
          confidence: finderResult.confidence,
          confidenceLevel: finderResult.confidenceLevel,
          method: `finder_${finderResult.verificationMethod}`,
          website: websiteFound,
        };
      }
    } catch (e) {
      logger.debug({ error: e }, 'Email finder engine failed');
    }
  }

  // ============================================
  // STEP 4: NO GENERIC FALLBACK
  // We want ONLY personal emails for Sales Nav contacts
  // Generic emails like info@, contact@ are useless for cold outreach
  // ============================================

  // Log if we found generic emails but are not using them
  if (scrapedEmails.length > 0) {
    const genericEmails = scrapedEmails.filter(e =>
      /^(info|contact|hello|enquiries|reservations|reception|booking|sales|mail|admin|office)@/i.test(e)
    );
    if (genericEmails.length > 0) {
      logger.debug({ hotel: job.company, genericEmails }, 'Found generic emails but NOT using them (need personal email)');
    }
  }

  // No personal email found
  return {
    email: null,
    confidence: 0,
    confidenceLevel: 'very_low',
    method: 'none',
    website: websiteFound,
  };
}

/**
 * GET /api/cron/sales-nav-enrichment
 * Cron job to process Sales Navigator enrichment queue
 * Runs every 15 minutes to find emails for imported prospects
 */
export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${config.security.cronSecret}`) {
    return errors.unauthorized('Invalid cron secret');
  }

  const supabase = createServerClient();

  try {
    // ============================================
    // AUTO-REQUEUE: Retry failed jobs after 24 hours
    // ============================================
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: failedJobs } = await supabase
      .from('sales_nav_enrichment_queue')
      .select('id, prospect_id, attempts')
      .eq('status', 'failed')
      .lt('updated_at', oneDayAgo)
      .limit(20);

    if (failedJobs && failedJobs.length > 0) {
      // Only requeue jobs with < 3 attempts
      const toRequeue = failedJobs.filter(j => (j.attempts || 1) < 3);
      if (toRequeue.length > 0) {
        // Reset status to pending and increment attempts
        for (const job of toRequeue) {
          await supabase
            .from('sales_nav_enrichment_queue')
            .update({
              status: 'pending',
              error: null,
              attempts: (job.attempts || 1) + 1,
            })
            .eq('id', job.id);
        }

        logger.info({ count: toRequeue.length }, 'Auto-requeued failed enrichment jobs');
      }
    }

    // ============================================
    // AUTO-REQUEUE: Stuck "processing" jobs (> 30 min)
    // ============================================
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: stuckJobs } = await supabase
      .from('sales_nav_enrichment_queue')
      .select('id')
      .eq('status', 'processing')
      .lt('updated_at', thirtyMinAgo)
      .limit(20);

    if (stuckJobs && stuckJobs.length > 0) {
      await supabase
        .from('sales_nav_enrichment_queue')
        .update({ status: 'pending', error: 'Requeued: was stuck in processing' })
        .in('id', stuckJobs.map(j => j.id));

      logger.info({ count: stuckJobs.length }, 'Requeued stuck processing jobs');
    }

    // Get pending jobs (process 1 at a time - each job can take 20-30s)
    const { data: pendingJobs } = await supabase
      .from('sales_nav_enrichment_queue')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1);

    if (!pendingJobs || pendingJobs.length === 0) {
      return success({ message: 'No pending jobs', processed: 0 });
    }

    logger.info({ count: pendingJobs.length }, 'Cron: Starting Sales Navigator enrichment');

    // Mark all as processing upfront
    const jobIds = pendingJobs.map(j => j.id);
    await supabase
      .from('sales_nav_enrichment_queue')
      .update({ status: 'processing' })
      .in('id', jobIds);

    // Process jobs sequentially (1 at a time to avoid timeout)
    const CONCURRENCY = 1;
    const results: Array<{ company: string; email: string | null; method: string; confidence: number }> = [];
    let succeeded = 0;
    let failed = 0;

    // Process in chunks of CONCURRENCY
    for (let i = 0; i < pendingJobs.length; i += CONCURRENCY) {
      const chunk = pendingJobs.slice(i, i + CONCURRENCY) as EnrichmentJob[];

      const chunkResults = await Promise.all(
        chunk.map(async (job) => {
          try {
            // Get the prospect
            const { data: prospect } = await supabase
              .from('prospects')
              .select('*')
              .eq('id', job.prospect_id)
              .single();

            if (!prospect) {
              await supabase
                .from('sales_nav_enrichment_queue')
                .update({ status: 'failed', error: 'Prospect not found' })
                .eq('id', job.id);
              return { job, success: false };
            }

            // Process enrichment
            const result = await processEnrichmentJob(job, prospect, supabase);

            if (result.email && result.confidence >= 40) {
              // Found a valid email with decent confidence
              const currentTags = prospect.tags || [];
              const newTags = currentTags.filter((t: string) => t !== 'needs-email');
              if (!newTags.includes('email-found')) {
                newTags.push('email-found');
              }
              newTags.push(`email-${result.confidenceLevel}`);

              const scoreBoost = Math.floor(result.confidence / 5);

              await supabase
                .from('prospects')
                .update({
                  email: result.email,
                  website: result.website || prospect.website,
                  stage: 'researching',
                  score: Math.min((prospect.score || 10) + scoreBoost, 100),
                  tags: [...new Set(newTags)],
                })
                .eq('id', prospect.id);

              await supabase
                .from('sales_nav_enrichment_queue')
                .update({
                  status: 'completed',
                  email_found: result.email,
                  email_verified: result.confidence >= 60,
                  research_done: true,
                  error: null,
                })
                .eq('id', job.id);

              return { job, success: true, result };
            } else {
              // No email found or low confidence
              const currentTags = prospect.tags || [];
              if (!currentTags.includes('needs-email')) {
                await supabase
                  .from('prospects')
                  .update({
                    tags: [...currentTags, 'needs-email'],
                    website: result.website || prospect.website,
                  })
                  .eq('id', prospect.id);
              }

              let errorReason = 'No valid email found';
              if (!job.firstname || !job.lastname) {
                errorReason = 'Missing name data';
              } else if (!result.website) {
                errorReason = 'Could not find hotel website';
              }

              await supabase
                .from('sales_nav_enrichment_queue')
                .update({
                  status: 'completed',
                  email_found: null,
                  email_verified: false,
                  research_done: true,
                  error: errorReason,
                })
                .eq('id', job.id);

              return { job, success: false, result };
            }
          } catch (error) {
            logger.error({ error, jobId: job.id }, 'Enrichment job failed');
            await supabase
              .from('sales_nav_enrichment_queue')
              .update({ status: 'failed', error: String(error) })
              .eq('id', job.id);
            return { job, success: false };
          }
        })
      );

      // Aggregate results
      for (const r of chunkResults) {
        if (r.success) {
          succeeded++;
          if (r.result) {
            results.push({
              company: r.job.company,
              email: r.result.email,
              method: r.result.method,
              confidence: r.result.confidence,
            });
          }
        } else {
          failed++;
        }
      }
    }

    const processed = pendingJobs.length;

    // Log activity
    await supabase.from('activity_log').insert({
      activity_type: 'sales_nav_enrichment',
      details: { processed, succeeded, failed, results: results.slice(0, 10) },
    });

    logger.info({ processed, succeeded, failed }, 'Cron: Sales Navigator enrichment complete');

    return success({
      message: 'Enrichment processing complete',
      processed,
      succeeded,
      failed,
      results: results.slice(0, 10),
    });
  } catch (error) {
    logger.error({ error }, 'Sales Nav enrichment cron failed');
    return errors.internal('Enrichment failed', error);
  }
}
