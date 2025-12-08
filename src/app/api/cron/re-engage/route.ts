import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { success, errors } from '@/lib/api-response';
import { logger } from '@/lib/logger';
import { config } from '@/lib/config';

/**
 * RE-ENGAGEMENT CRON
 *
 * Handles stale prospects that haven't had activity in 30+ days:
 * 1. Prospects with no response after multiple emails → Archive
 * 2. Prospects with generic emails → Queue for mystery shopper
 * 3. Prospects stuck in early stages → Re-score and potentially re-queue
 *
 * Schedule: Run weekly (Sundays) or daily for cleanup
 */
export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${config.security.cronSecret}`) {
    return errors.unauthorized('Invalid cron secret');
  }

  const supabase = createServerClient();

  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const results = {
      archived_unresponsive: 0,
      archived_stale: 0,
      requeued_for_enrichment: 0,
      requeued_for_mystery: 0,
      errors: [] as string[],
    };

    // ============================================
    // 1. ARCHIVE UNRESPONSIVE (5+ emails, 0 replies, 14+ days)
    // ============================================
    const { data: unresponsive } = await supabase
      .from('prospects')
      .select(`
        id, name, email,
        emails!inner(id, direction)
      `)
      .eq('archived', false)
      .in('stage', ['contacted', 'outreach'])
      .lt('last_contacted_at', sevenDaysAgo);

    if (unresponsive && unresponsive.length > 0) {
      for (const prospect of unresponsive) {
        // Count outbound vs inbound emails
        const emails = prospect.emails as Array<{ id: string; direction: string }>;
        const outbound = emails.filter(e => e.direction === 'outbound').length;
        const inbound = emails.filter(e => e.direction === 'inbound').length;

        // If 5+ outbound and 0 inbound, archive
        if (outbound >= 5 && inbound === 0) {
          await supabase
            .from('prospects')
            .update({
              archived: true,
              archived_at: new Date().toISOString(),
              archive_reason: 'unresponsive_5_emails',
              stage: 'lost',
            })
            .eq('id', prospect.id);

          await supabase.from('activities').insert({
            prospect_id: prospect.id,
            type: 'archived',
            title: 'Auto-archived: Unresponsive',
            description: `Sent ${outbound} emails with no response over 14+ days`,
          });

          results.archived_unresponsive++;
        }
      }
    }

    // ============================================
    // 2. ARCHIVE STALE (30+ days in new/researching, no activity)
    // ============================================
    const { data: stale } = await supabase
      .from('prospects')
      .select('id, name, stage, created_at')
      .eq('archived', false)
      .in('stage', ['new', 'researching'])
      .lt('created_at', thirtyDaysAgo)
      .is('last_contacted_at', null)
      .limit(100);

    if (stale && stale.length > 0) {
      const staleIds = stale.map(p => p.id);

      await supabase
        .from('prospects')
        .update({
          archived: true,
          archived_at: new Date().toISOString(),
          archive_reason: 'stale_30_days',
          stage: 'lost',
        })
        .in('id', staleIds);

      results.archived_stale = stale.length;

      logger.info({ count: stale.length }, 'Archived stale prospects');
    }

    // ============================================
    // 3. RE-QUEUE FOR ENRICHMENT (has website but no email)
    // ============================================
    const { data: needsEnrichment } = await supabase
      .from('prospects')
      .select('id, name, website')
      .eq('archived', false)
      .not('website', 'is', null)
      .is('email', null)
      .limit(50);

    if (needsEnrichment && needsEnrichment.length > 0) {
      for (const prospect of needsEnrichment) {
        // Check if already in queue
        const { data: existing } = await supabase
          .from('sales_nav_enrichment_queue')
          .select('id')
          .eq('prospect_id', prospect.id)
          .in('status', ['pending', 'processing'])
          .limit(1);

        if (!existing || existing.length === 0) {
          await supabase.from('sales_nav_enrichment_queue').insert({
            prospect_id: prospect.id,
            prospect_name: prospect.name,
            company: prospect.name,
            status: 'pending',
          });
          results.requeued_for_enrichment++;
        }
      }
    }

    // ============================================
    // 4. RE-QUEUE FOR MYSTERY SHOPPER (generic email, no GM contact)
    // ============================================
    const genericPatterns = ['info@', 'contact@', 'reception@', 'reservations@', 'hello@'];
    const { data: needsMystery } = await supabase
      .from('prospects')
      .select('id, name, email, tags')
      .eq('archived', false)
      .not('email', 'is', null)
      .is('contact_name', null)
      .limit(50);

    if (needsMystery && needsMystery.length > 0) {
      for (const prospect of needsMystery) {
        // Check if email is generic
        const isGeneric = genericPatterns.some(p =>
          prospect.email?.toLowerCase().startsWith(p)
        );

        if (isGeneric) {
          const tags = prospect.tags || [];
          // Check if not already processed by mystery shopper
          if (!tags.includes('mystery-inquiry-sent') && !tags.includes('needs-contact-discovery')) {
            await supabase
              .from('prospects')
              .update({
                tags: [...tags, 'needs-contact-discovery'],
              })
              .eq('id', prospect.id);

            results.requeued_for_mystery++;
          }
        }
      }
    }

    // ============================================
    // 5. LOG ACTIVITY
    // ============================================
    await supabase.from('activities').insert({
      type: 'system',
      title: 'Re-engagement cron completed',
      description: JSON.stringify(results),
    });

    logger.info(results, 'Re-engagement cron complete');

    return success({
      message: 'Re-engagement processing complete',
      ...results,
    });
  } catch (error) {
    logger.error({ error }, 'Re-engagement cron failed');
    return errors.internal('Re-engagement failed', error);
  }
}
