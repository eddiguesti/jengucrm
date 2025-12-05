import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { success, errors } from '@/lib/api-response';
import { logger } from '@/lib/logger';
import { getDomainPattern, applyPattern } from '@/lib/email/finder/domain-analyzer';
import { validateEmail } from '@/lib/email/verification';
import { researchHotel } from '@/lib/hotel-research';
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

        // Try to find email using domain patterns
        let email: string | null = null;

        if (prospect.website) {
          try {
            const url = new URL(prospect.website.startsWith('http') ? prospect.website : `https://${prospect.website}`);
            const domain = url.hostname.replace('www.', '');

            // Get domain pattern
            const pattern = await getDomainPattern(domain);

            if (pattern && pattern.pattern && job.firstname && job.lastname) {
              const candidateEmail = applyPattern(pattern.pattern, job.firstname, job.lastname, domain);

              if (candidateEmail) {
                // Verify the email
                const validation = await validateEmail(candidateEmail);
                if (validation.isValid) {
                  email = candidateEmail;
                }
              }
            }
          } catch (e) {
            // Domain pattern failed, continue
          }
        }

        // Research hotel for additional context (if not already done)
        if (!job.research_done && prospect.website) {
          try {
            const research = await researchHotel(prospect.website, prospect.name);
            if (research) {
              await supabase
                .from('prospects')
                .update({
                  notes: (prospect.notes || '') + '\n\n' + research.researchSummary,
                  star_rating: research.starRating || prospect.star_rating,
                  room_count: research.roomCount || prospect.room_count,
                })
                .eq('id', prospect.id);
            }
          } catch (e) {
            // Research failed, continue
          }
        }

        // Update prospect with email if found
        if (email) {
          await supabase
            .from('prospects')
            .update({
              email,
              stage: 'researching', // Ready for email outreach
              score: Math.min((prospect.score || 10) + 20, 100),
            })
            .eq('id', prospect.id);

          await supabase
            .from('sales_nav_enrichment_queue')
            .update({
              status: 'completed',
              email_found: email,
              email_verified: true,
              research_done: true,
            })
            .eq('id', job.id);

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

          await supabase
            .from('sales_nav_enrichment_queue')
            .update({
              status: 'completed',
              email_found: null,
              email_verified: false,
              research_done: true,
              error: 'No valid email pattern found',
            })
            .eq('id', job.id);

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
