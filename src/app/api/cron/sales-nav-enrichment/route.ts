import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { success, errors } from '@/lib/api-response';
import { logger } from '@/lib/logger';
import { getDomainPattern, applyPattern } from '@/lib/email/finder/domain-analyzer';
import { validateEmail } from '@/lib/email/verification';
import { enrichWithGooglePlaces } from '@/lib/enrichment/google-places';
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

// Known hotel chain domains - these have predictable email patterns
const CHAIN_DOMAINS: Record<string, { domain: string; pattern: string }> = {
  'hilton': { domain: 'hilton.com', pattern: '{first}.{last}' },
  'marriott': { domain: 'marriott.com', pattern: '{first}.{last}' },
  'hyatt': { domain: 'hyatt.com', pattern: '{first}.{last}' },
  'ihg': { domain: 'ihg.com', pattern: '{first}.{last}' },
  'accor': { domain: 'accor.com', pattern: '{first}.{last}' },
  'novotel': { domain: 'accor.com', pattern: '{first}.{last}' },
  'sofitel': { domain: 'accor.com', pattern: '{first}.{last}' },
  'ibis': { domain: 'accor.com', pattern: '{first}.{last}' },
  'mercure': { domain: 'accor.com', pattern: '{first}.{last}' },
  'radisson': { domain: 'radissonhotels.com', pattern: '{first}.{last}' },
  'wyndham': { domain: 'wyndham.com', pattern: '{first}.{last}' },
  'best western': { domain: 'bestwestern.com', pattern: '{first}.{last}' },
  'choice hotels': { domain: 'choicehotels.com', pattern: '{first}.{last}' },
  'four seasons': { domain: 'fourseasons.com', pattern: '{first}.{last}' },
  'ritz carlton': { domain: 'ritzcarlton.com', pattern: '{first}.{last}' },
  'intercontinental': { domain: 'ihg.com', pattern: '{first}.{last}' },
  'crowne plaza': { domain: 'ihg.com', pattern: '{first}.{last}' },
  'holiday inn': { domain: 'ihg.com', pattern: '{first}.{last}' },
  'sheraton': { domain: 'marriott.com', pattern: '{first}.{last}' },
  'westin': { domain: 'marriott.com', pattern: '{first}.{last}' },
  'w hotels': { domain: 'marriott.com', pattern: '{first}.{last}' },
  'doubletree': { domain: 'hilton.com', pattern: '{first}.{last}' },
  'hampton': { domain: 'hilton.com', pattern: '{first}.{last}' },
  'embassy suites': { domain: 'hilton.com', pattern: '{first}.{last}' },
};

/**
 * Try to find hotel chain from company name
 */
function findChainDomain(companyName: string): { domain: string; pattern: string } | null {
  const lowerName = companyName.toLowerCase();
  for (const [chain, info] of Object.entries(CHAIN_DOMAINS)) {
    if (lowerName.includes(chain)) {
      return info;
    }
  }
  return null;
}

/**
 * Generate email from pattern
 */
function generateEmailFromPattern(pattern: string, firstname: string, lastname: string, domain: string): string {
  // Clean names - remove special chars, lowercase
  const first = firstname.toLowerCase().replace(/[^a-z]/g, '');
  const last = lastname.toLowerCase().replace(/[^a-z]/g, '');

  return pattern
    .replace('{first}', first)
    .replace('{last}', last)
    .replace('{f}', first[0] || '')
    .replace('{l}', last[0] || '')
    + '@' + domain;
}

/**
 * Generate common email permutations
 */
function generateEmailPermutations(firstname: string, lastname: string, domain: string): string[] {
  const first = firstname.toLowerCase().replace(/[^a-z]/g, '');
  const last = lastname.toLowerCase().replace(/[^a-z]/g, '');
  const f = first[0] || '';

  if (!first || !last) return [];

  return [
    `${first}.${last}@${domain}`,      // john.smith@
    `${first}${last}@${domain}`,       // johnsmith@
    `${f}${last}@${domain}`,           // jsmith@
    `${first}@${domain}`,              // john@
    `${last}.${first}@${domain}`,      // smith.john@
    `${f}.${last}@${domain}`,          // j.smith@
  ];
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
    // Get pending jobs (process 50 at a time for faster throughput)
    const { data: pendingJobs } = await supabase
      .from('sales_nav_enrichment_queue')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(50);

    if (!pendingJobs || pendingJobs.length === 0) {
      return success({ message: 'No pending jobs', processed: 0 });
    }

    logger.info({ count: pendingJobs.length }, 'Cron: Starting Sales Navigator enrichment');

    let processed = 0;
    let succeeded = 0;
    let failed = 0;

    for (const job of pendingJobs as EnrichmentJob[]) {
      try {
        processed++;

        // Mark as processing
        await supabase
          .from('sales_nav_enrichment_queue')
          .update({ status: 'processing' })
          .eq('id', job.id);

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
          failed++;
          continue;
        }

        // Try to find email using multiple strategies
        let email: string | null = null;
        let domain: string | null = null;
        let websiteFound: string | null = prospect.website;
        let enrichmentMethod = '';

        // Strategy 1: Check if it's a known hotel chain
        const chainInfo = findChainDomain(job.company || prospect.name);
        if (chainInfo && job.firstname && job.lastname) {
          domain = chainInfo.domain;
          const candidateEmail = generateEmailFromPattern(chainInfo.pattern, job.firstname, job.lastname, domain);

          logger.info({ company: job.company, chain: domain, email: candidateEmail }, 'Trying chain email');

          const validation = await validateEmail(candidateEmail);
          if (validation.isValid) {
            email = candidateEmail;
            enrichmentMethod = 'chain_pattern';
          }
        }

        // Strategy 2: If no website, try Google Places to find one
        if (!email && !websiteFound && prospect.country) {
          try {
            const placesData = await enrichWithGooglePlaces(
              job.company || prospect.name,
              prospect.city || '',
              prospect.country
            );

            if (placesData.website) {
              websiteFound = placesData.website;
              logger.info({ company: job.company, website: websiteFound }, 'Found website via Google Places');

              // Update prospect with found website
              await supabase
                .from('prospects')
                .update({
                  website: websiteFound,
                  google_place_id: placesData.google_place_id,
                  full_address: placesData.full_address || prospect.full_address,
                })
                .eq('id', prospect.id);
            }
          } catch (e) {
            logger.debug({ error: e }, 'Google Places lookup failed');
          }
        }

        // Strategy 3: Use website domain for email patterns
        if (!email && websiteFound && job.firstname && job.lastname) {
          try {
            const url = new URL(websiteFound.startsWith('http') ? websiteFound : `https://${websiteFound}`);
            domain = url.hostname.replace('www.', '');

            // Try known domain pattern first
            const pattern = await getDomainPattern(domain);

            if (pattern && pattern.pattern) {
              const candidateEmail = applyPattern(pattern.pattern, job.firstname, job.lastname, domain);
              if (candidateEmail) {
                const validation = await validateEmail(candidateEmail);
                if (validation.isValid) {
                  email = candidateEmail;
                  enrichmentMethod = 'domain_pattern';
                }
              }
            }

            // If no pattern, try common permutations
            if (!email) {
              const permutations = generateEmailPermutations(job.firstname, job.lastname, domain);

              for (const candidateEmail of permutations) {
                const validation = await validateEmail(candidateEmail);
                if (validation.isValid) {
                  email = candidateEmail;
                  enrichmentMethod = 'email_permutation';
                  break;
                }
              }
            }
          } catch (e) {
            logger.debug({ error: e }, 'Email pattern generation failed');
          }
        }

        // Update prospect with email if found
        if (email) {
          const currentTags = prospect.tags || [];
          const newTags = currentTags.filter((t: string) => t !== 'needs-email');
          if (!newTags.includes('email-found')) {
            newTags.push('email-found');
          }

          await supabase
            .from('prospects')
            .update({
              email,
              stage: 'researching', // Ready for email outreach
              score: Math.min((prospect.score || 10) + 20, 100),
              tags: newTags,
            })
            .eq('id', prospect.id);

          await supabase
            .from('sales_nav_enrichment_queue')
            .update({
              status: 'completed',
              email_found: email,
              email_verified: true,
              research_done: true,
              error: null, // Clear any previous error
            })
            .eq('id', job.id);

          logger.info({ company: job.company, email, method: enrichmentMethod }, 'Email found');
          succeeded++;
        } else {
          // No email found - tag for manual review
          const currentTags = prospect.tags || [];
          if (!currentTags.includes('needs-email')) {
            await supabase
              .from('prospects')
              .update({ tags: [...currentTags, 'needs-email'] })
              .eq('id', prospect.id);
          }

          // Determine why it failed
          let errorReason = 'No valid email found';
          if (!job.firstname || !job.lastname) {
            errorReason = 'Missing name data';
          } else if (!websiteFound && !chainInfo) {
            errorReason = 'No website found and not a known chain';
          } else if (!domain) {
            errorReason = 'Could not extract domain';
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

          logger.debug({ company: job.company, reason: errorReason }, 'Email not found');
          failed++;
        }
      } catch (error) {
        logger.error({ error, jobId: job.id }, 'Enrichment job failed');
        await supabase
          .from('sales_nav_enrichment_queue')
          .update({ status: 'failed', error: String(error) })
          .eq('id', job.id);
        failed++;
      }
    }

    // Log activity
    await supabase.from('activity_log').insert({
      activity_type: 'sales_nav_enrichment',
      details: { processed, succeeded, failed },
    });

    logger.info({ processed, succeeded, failed }, 'Cron: Sales Navigator enrichment complete');

    return success({
      message: 'Enrichment processing complete',
      processed,
      succeeded,
      failed,
    });
  } catch (error) {
    logger.error({ error }, 'Sales Nav enrichment cron failed');
    return errors.internal('Enrichment failed', error);
  }
}
