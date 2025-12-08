import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { success, errors } from '@/lib/api-response';
import { logger } from '@/lib/logger';
import { config } from '@/lib/config';
import { GENERIC_EMAIL_PREFIXES, FAKE_EMAIL_PATTERNS } from '@/lib/constants';

/**
 * POST /api/admin/cleanup-generic-emails
 * Cleans up generic emails from Sales Navigator prospects
 * - Sets email to NULL for prospects with generic emails
 * - Adds 'needs-email' tag
 * - Creates enrichment queue entry if not exists
 */
export async function POST(request: NextRequest) {
  // Verify admin auth
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${config.security.cronSecret}`) {
    return errors.unauthorized('Unauthorized');
  }

  const supabase = createServerClient();

  try {
    const body = await request.json().catch(() => ({}));
    const batchSize = body.batch_size || 100;
    const dryRun = body.dry_run ?? true;

    // Find Sales Nav prospects with generic emails
    const { data: prospects, error: fetchError } = await supabase
      .from('prospects')
      .select('id, name, email, contact_name, tags, linkedin_url')
      .eq('source', 'sales_navigator')
      .not('email', 'is', null)
      .limit(batchSize);

    if (fetchError) {
      return errors.internal('Failed to fetch prospects', fetchError);
    }

    if (!prospects || prospects.length === 0) {
      return success({ message: 'No prospects to clean', processed: 0 });
    }

    // Filter to only generic emails
    const prospectsWithGenericEmails = prospects.filter(p => {
      if (!p.email) return false;
      // Check fake patterns first
      if (FAKE_EMAIL_PATTERNS.some(pattern => pattern.test(p.email))) return true;
      // Check generic prefixes
      if (GENERIC_EMAIL_PREFIXES.some(pattern => pattern.test(p.email))) return true;
      return false;
    });

    logger.info({
      totalChecked: prospects.length,
      genericFound: prospectsWithGenericEmails.length,
      dryRun,
    }, 'Cleanup: Found prospects with generic emails');

    if (prospectsWithGenericEmails.length === 0) {
      return success({ message: 'No generic emails found in batch', processed: 0 });
    }

    if (dryRun) {
      return success({
        message: 'Dry run - no changes made',
        would_clean: prospectsWithGenericEmails.length,
        examples: prospectsWithGenericEmails.slice(0, 10).map(p => ({
          name: p.name,
          contact: p.contact_name,
          generic_email: p.email,
        })),
      });
    }

    // Process each prospect
    let cleaned = 0;
    let queuedForEnrichment = 0;
    const results: Array<{ name: string; email: string; status: string }> = [];

    for (const prospect of prospectsWithGenericEmails) {
      try {
        // Update prospect: clear email, add needs-email tag
        const currentTags = prospect.tags || [];
        const newTags = [...currentTags.filter((t: string) => t !== 'email-found'), 'needs-email'];

        await supabase
          .from('prospects')
          .update({
            email: null,
            tags: [...new Set(newTags)],
          })
          .eq('id', prospect.id);

        cleaned++;

        // Check if already in enrichment queue
        const { data: existing } = await supabase
          .from('sales_nav_enrichment_queue')
          .select('id, status')
          .eq('prospect_id', prospect.id)
          .single();

        if (!existing) {
          // Parse contact name for firstname/lastname
          const nameParts = (prospect.contact_name || '').split(' ');
          const firstname = nameParts[0] || '';
          const lastname = nameParts.slice(1).join(' ') || '';

          // Add to enrichment queue
          await supabase.from('sales_nav_enrichment_queue').insert({
            prospect_id: prospect.id,
            prospect_name: prospect.contact_name || prospect.name,
            company: prospect.name,
            firstname,
            lastname,
            linkedin_url: prospect.linkedin_url,
            status: 'pending',
          });
          queuedForEnrichment++;
        } else if (existing.status === 'completed' || existing.status === 'failed') {
          // Reset to pending for re-processing
          await supabase
            .from('sales_nav_enrichment_queue')
            .update({ status: 'pending', email_found: null, error: null })
            .eq('id', existing.id);
          queuedForEnrichment++;
        }

        results.push({
          name: prospect.name,
          email: prospect.email!,
          status: 'cleaned',
        });
      } catch (err) {
        logger.error({ error: err, prospect: prospect.name }, 'Failed to clean prospect');
        results.push({
          name: prospect.name,
          email: prospect.email!,
          status: 'error',
        });
      }
    }

    logger.info({ cleaned, queuedForEnrichment }, 'Cleanup completed');

    return success({
      message: `Cleaned ${cleaned} prospects with generic emails`,
      cleaned,
      queued_for_enrichment: queuedForEnrichment,
      results: results.slice(0, 20),
    });
  } catch (error) {
    logger.error({ error }, 'Cleanup failed');
    return errors.internal('Cleanup failed', error);
  }
}

/**
 * GET /api/admin/cleanup-generic-emails
 * Get stats on how many prospects need cleanup
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${config.security.cronSecret}`) {
    return errors.unauthorized('Unauthorized');
  }

  const supabase = createServerClient();

  try {
    // Count Sales Nav prospects with emails
    const { data: allWithEmail, error } = await supabase
      .from('prospects')
      .select('id, email')
      .eq('source', 'sales_navigator')
      .not('email', 'is', null);

    if (error) {
      return errors.internal('Failed to fetch', error);
    }

    // Count generic vs personal
    let genericCount = 0;
    let personalCount = 0;
    let fakeCount = 0;

    for (const p of allWithEmail || []) {
      if (!p.email) continue;

      if (FAKE_EMAIL_PATTERNS.some(pattern => pattern.test(p.email))) {
        fakeCount++;
      } else if (GENERIC_EMAIL_PREFIXES.some(pattern => pattern.test(p.email))) {
        genericCount++;
      } else {
        personalCount++;
      }
    }

    // Count enrichment queue status
    const { data: queue } = await supabase
      .from('sales_nav_enrichment_queue')
      .select('status');

    const queueStats = {
      pending: queue?.filter(q => q.status === 'pending').length || 0,
      processing: queue?.filter(q => q.status === 'processing').length || 0,
      completed: queue?.filter(q => q.status === 'completed').length || 0,
      failed: queue?.filter(q => q.status === 'failed').length || 0,
    };

    return success({
      sales_nav_emails: {
        total: allWithEmail?.length || 0,
        personal: personalCount,
        generic: genericCount,
        fake_or_invalid: fakeCount,
        needs_cleanup: genericCount + fakeCount,
      },
      enrichment_queue: queueStats,
    });
  } catch (error) {
    return errors.internal('Failed to get stats', error);
  }
}
