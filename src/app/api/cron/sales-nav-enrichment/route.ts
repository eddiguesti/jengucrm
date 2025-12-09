import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { success, errors } from '@/lib/api-response';
import { logger } from '@/lib/logger';
import { findHotelEmails } from '@/lib/hotel-research';
import { millionVerifierVerify } from '@/lib/email/finder/services';
import { config } from '@/lib/config';

/**
 * Sales Navigator Enrichment Cron
 *
 * Simple flow:
 * 1. Get pending job from queue
 * 2. Use Grok to search for contact emails
 * 3. Verify best email with MillionVerifier
 * 4. Update prospect
 *
 * Runs every 5 minutes via cron-job.org
 */
export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${config.security.cronSecret}`) {
    return errors.unauthorized('Invalid cron secret');
  }

  const supabase = createServerClient();

  try {
    // Reset any stuck jobs (processing > 10 min)
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    await supabase
      .from('sales_nav_enrichment_queue')
      .update({ status: 'pending', error: 'Reset: timeout' })
      .eq('status', 'processing')
      .lt('updated_at', tenMinAgo);

    // Get 1 pending job
    const { data: jobs } = await supabase
      .from('sales_nav_enrichment_queue')
      .select('*, prospects!inner(id, name, website, city, country)')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1);

    if (!jobs || jobs.length === 0) {
      return success({ message: 'No pending jobs', processed: 0 });
    }

    const job = jobs[0];
    const prospect = job.prospects;

    // Mark as processing
    await supabase
      .from('sales_nav_enrichment_queue')
      .update({ status: 'processing' })
      .eq('id', job.id);

    logger.info({ company: job.company, prospectId: prospect.id }, 'Processing enrichment job');

    // Step 1: Use Grok to find emails (with web search)
    const emailResult = await findHotelEmails(
      job.company || prospect.name,
      prospect.website || undefined,
      prospect.city || prospect.country || undefined
    );

    // Find best email to use
    let bestEmail: string | null = null;
    let contactName: string | null = null;
    let contactTitle: string | null = null;

    // Priority: Personal contact > General email > Reservations
    if (emailResult.contactEmails?.length > 0) {
      const contact = emailResult.contactEmails[0];
      bestEmail = contact.email;
      contactName = contact.name || null;
      contactTitle = contact.title || null;
    } else if (emailResult.generalEmail) {
      bestEmail = emailResult.generalEmail;
    } else if (emailResult.reservationsEmail) {
      bestEmail = emailResult.reservationsEmail;
    }

    // Step 2: Verify with MillionVerifier if we found an email
    let verified = false;
    if (bestEmail) {
      try {
        const mvResult = await millionVerifierVerify(bestEmail);
        if (mvResult?.result === 'ok') {
          verified = true;
          logger.info({ email: bestEmail }, 'Email verified by MillionVerifier');
        } else if (mvResult?.result === 'catch_all') {
          // Accept catch-all for now (common for hotels)
          verified = true;
          logger.info({ email: bestEmail }, 'Catch-all email accepted');
        } else {
          logger.warn({ email: bestEmail, result: mvResult?.result }, 'Email failed verification');
          bestEmail = null; // Don't use unverified email
        }
      } catch (e) {
        // If MillionVerifier fails, still use the email (Grok found it)
        verified = false;
        logger.warn({ error: e }, 'MillionVerifier check failed, using email anyway');
      }
    }

    // Step 3: Update prospect and queue
    if (bestEmail) {
      await supabase
        .from('prospects')
        .update({
          email: bestEmail,
          contact_name: contactName,
          contact_title: contactTitle,
          stage: 'researching',
        })
        .eq('id', prospect.id);

      await supabase
        .from('sales_nav_enrichment_queue')
        .update({
          status: 'completed',
          email_found: bestEmail,
          email_verified: verified,
          research_done: true,
        })
        .eq('id', job.id);

      logger.info({ company: job.company, email: bestEmail }, 'Enrichment completed');

      return success({
        message: 'Enrichment complete',
        processed: 1,
        succeeded: 1,
        failed: 0,
        result: { company: job.company, email: bestEmail, verified },
      });
    } else {
      // No email found
      await supabase
        .from('sales_nav_enrichment_queue')
        .update({
          status: 'completed',
          email_found: null,
          research_done: true,
          error: 'No email found',
        })
        .eq('id', job.id);

      return success({
        message: 'No email found',
        processed: 1,
        succeeded: 0,
        failed: 1,
        result: { company: job.company, email: null },
      });
    }
  } catch (error) {
    logger.error({ error }, 'Sales Nav enrichment cron failed');
    return errors.internal('Enrichment failed', error);
  }
}
