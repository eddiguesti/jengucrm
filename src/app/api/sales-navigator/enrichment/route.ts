import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { success, errors } from '@/lib/api-response';
import { logger } from '@/lib/logger';
import { getDomainPattern, applyPattern } from '@/lib/email/finder/domain-analyzer';
import { validateEmail } from '@/lib/email/verification';
import { researchHotel } from '@/lib/hotel-research';

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
 * GET /api/sales-navigator/enrichment
 * Get enrichment queue
 */
export async function GET() {
  const supabase = createServerClient();

  try {
    const { data: jobs } = await supabase
      .from('sales_nav_enrichment_queue')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    return success({ jobs: jobs || [] });
  } catch (error) {
    logger.error({ error }, 'Failed to get enrichment queue');
    return errors.internal('Failed to get queue', error);
  }
}

/**
 * POST /api/sales-navigator/enrichment
 * Process enrichment queue
 */
export async function POST(request: NextRequest) {
  const supabase = createServerClient();

  try {
    const { action, limit = 5 } = await request.json();

    if (action !== 'start') {
      return errors.badRequest('Invalid action');
    }

    // Get pending jobs
    const { data: pendingJobs } = await supabase
      .from('sales_nav_enrichment_queue')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(limit);

    if (!pendingJobs || pendingJobs.length === 0) {
      return success({ message: 'No pending jobs', processed: 0 });
    }

    logger.info({ count: pendingJobs.length }, 'Starting enrichment processing');

    let processed = 0;
    let succeeded = 0;
    let failed = 0;

    for (const job of pendingJobs as EnrichmentJob[]) {
      try {
        processed++;

        // Step 1: Find email
        await supabase
          .from('sales_nav_enrichment_queue')
          .update({ status: 'finding_email' })
          .eq('id', job.id);

        const email = await findEmailForContact(
          job.firstname,
          job.lastname,
          job.company
        );

        if (email) {
          // Step 2: Verify email
          await supabase
            .from('sales_nav_enrichment_queue')
            .update({ status: 'verifying', email_found: email })
            .eq('id', job.id);

          const validation = await validateEmail(email);
          const verified = validation.isValid;

          await supabase
            .from('sales_nav_enrichment_queue')
            .update({ email_verified: verified })
            .eq('id', job.id);

          // Update prospect with email
          if (verified) {
            await supabase
              .from('prospects')
              .update({
                email: email,
                score: 50, // Boost score with verified email
              })
              .eq('id', job.prospect_id);
          }
        }

        // Step 3: Research
        await supabase
          .from('sales_nav_enrichment_queue')
          .update({ status: 'researching' })
          .eq('id', job.id);

        try {
          const research = await researchHotel(job.company);

          if (research && research.confidence > 0.3) {
            // Update prospect with research
            await supabase
              .from('prospects')
              .update({
                property_type: research.propertyType || 'hotel',
                notes: `${research.researchSummary}\n\nRecommended angle: ${research.recommendedAngle}`,
                score: (email ? 60 : 30) + Math.round(research.confidence * 20),
              })
              .eq('id', job.prospect_id);

            await supabase
              .from('sales_nav_enrichment_queue')
              .update({ research_done: true })
              .eq('id', job.id);
          }
        } catch (researchError) {
          logger.warn({ error: researchError, company: job.company }, 'Research failed');
        }

        // Mark as ready
        await supabase
          .from('sales_nav_enrichment_queue')
          .update({
            status: 'ready',
            email_found: email || null,
          })
          .eq('id', job.id);

        succeeded++;

        // If no personal email found, tag for manual review
        // Sales Navigator prospects should receive proper Jengu sales emails, not mystery shopper
        if (!email) {
          // Get current tags
          const { data: prospect } = await supabase
            .from('prospects')
            .select('tags, contact_name')
            .eq('id', job.prospect_id)
            .single();

          const currentTags = prospect?.tags || [];
          const newTags = currentTags.includes('needs-email')
            ? currentTags
            : [...currentTags, 'needs-email'];

          // Update tags to mark as needing email
          const updateData: Record<string, unknown> = {
            tags: newTags,
          };

          // If we have the contact name from the enrichment job, ensure it's saved
          if (job.prospect_name && !prospect?.contact_name) {
            updateData.contact_name = job.prospect_name;
          }

          await supabase
            .from('prospects')
            .update(updateData)
            .eq('id', job.prospect_id);

          logger.info({ prospectId: job.prospect_id, contactName: job.prospect_name }, 'Email not found - tagged for manual review');
        }

        // Log activity
        await supabase.from('activities').insert({
          prospect_id: job.prospect_id,
          type: 'note',
          title: 'Enrichment completed',
          description: email
            ? `Found email: ${email} - ready for Jengu outreach`
            : 'Personal email not found - needs manual email discovery',
        });

      } catch (err) {
        logger.error({ error: err, jobId: job.id }, 'Enrichment job failed');
        failed++;

        await supabase
          .from('sales_nav_enrichment_queue')
          .update({
            status: 'failed',
            error: String(err),
          })
          .eq('id', job.id);
      }
    }

    logger.info({ processed, succeeded, failed }, 'Enrichment batch completed');

    return success({
      success: true,
      processed,
      succeeded,
      failed,
    });
  } catch (error) {
    logger.error({ error }, 'Enrichment processing failed');
    return errors.internal('Enrichment failed', error);
  }
}

/**
 * Find email for a contact
 */
async function findEmailForContact(
  firstname: string,
  lastname: string,
  company: string
): Promise<string | null> {
  try {
    // Try to extract domain from company name
    const possibleDomains = guessDomainsFromCompany(company);

    for (const domain of possibleDomains) {
      // Get domain pattern
      const pattern = await getDomainPattern(domain);

      if (pattern && pattern.pattern !== 'unknown') {
        // Apply pattern to generate email
        const email = applyPattern(
          pattern.pattern,
          firstname,
          lastname,
          domain
        );

        // Quick validation
        const validation = await validateEmail(email);
        if (validation.checks.hasMxRecord) {
          return email;
        }
      }
    }

    // Try common patterns on guessed domains
    const commonPatterns = [
      '{first}.{last}',
      '{f}{last}',
      '{first}{last}',
      '{first}',
    ];

    for (const domain of possibleDomains) {
      for (const pattern of commonPatterns) {
        const email = applyPattern(pattern, firstname, lastname, domain);
        const validation = await validateEmail(email);

        if (validation.checks.hasMxRecord) {
          return email;
        }
      }
    }

    return null;
  } catch (error) {
    logger.error({ error, firstname, lastname, company }, 'Email finding failed');
    return null;
  }
}

/**
 * Guess possible domains from company name
 */
function guessDomainsFromCompany(company: string): string[] {
  const domains: string[] = [];

  // Clean company name
  const cleaned = company
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9\s]/g, '')
    .trim();

  // Remove common suffixes
  const withoutSuffix = cleaned
    .replace(/\s+(hotel|hotels|resort|resorts|spa|restaurant|group|collection|hospitality|properties|ltd|inc|llc|gmbh|sarl|sas)$/i, '')
    .trim();

  // Generate domain variations
  const words = withoutSuffix.split(/\s+/);

  // Full name with no spaces
  if (words.length > 0) {
    domains.push(`${words.join('')}.com`);
  }

  // Full name with hyphens
  if (words.length > 1) {
    domains.push(`${words.join('-')}.com`);
  }

  // Just first word
  if (words.length > 0 && words[0].length > 3) {
    domains.push(`${words[0]}.com`);
  }

  // Hotel-specific variations
  if (!cleaned.includes('hotel')) {
    domains.push(`${words.join('')}hotel.com`);
  }

  // French domains
  domains.push(`${words.join('')}.fr`);
  domains.push(`${words.join('-')}.fr`);

  // UK domains
  domains.push(`${words.join('')}.co.uk`);

  return domains;
}
