import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

/**
 * Mystery Shopper Cron Job
 * Runs every 30 minutes from 8am-8pm UTC (25 runs = continuous drip)
 *
 * Sends 2 mystery shopper emails per run to prospects with generic emails
 * (info@, reservations@, etc.) who haven't received one yet.
 *
 * Target: 50 emails/day spread naturally (25 runs × 2 emails = 50)
 * This creates a human-like sending pattern throughout the day.
 */

const MAX_QUEUE_ADDITIONS = 10;  // Add up to 10 new prospects to queue per run
const MAX_EMAILS_PER_RUN = 2;    // Send 2 emails per run (50/day across 25 runs)

// Generic email prefixes that indicate we should send mystery shopper
const GENERIC_EMAIL_PREFIXES = [
  'info@', 'reservations@', 'reservation@', 'reception@', 'frontdesk@',
  'hello@', 'contact@', 'enquiries@', 'enquiry@', 'booking@', 'bookings@',
  'stay@', 'guest@', 'guests@', 'sales@', 'events@', 'weddings@',
  'groups@', 'meetings@', 'concierge@', 'hotel@', 'resort@'
];

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const supabase = createServerClient();
  const stats = {
    added_to_queue: 0,
    new_prospects_found: 0,
    emails_sent: 0,
    removed_from_queue: 0,
    errors: [] as string[],
  };

  try {
    console.log('[Mystery Shopper Cron] Starting...');

    // Step 1A: Find NEW prospects with generic emails that haven't received mystery shopper
    // These are automatically eligible - no tag required
    const { data: newProspects, error: newProspectsError } = await supabase
      .from('prospects')
      .select('id, name, email, score, tier, tags')
      .eq('archived', false)
      .not('email', 'is', null)
      .order('created_at', { ascending: false })
      .limit(100);

    if (newProspectsError) {
      console.error('[Mystery Shopper Cron] New prospects fetch error:', newProspectsError);
      stats.errors.push(`New prospects fetch error: ${newProspectsError.message}`);
    }

    // Filter to generic emails without mystery-inquiry-sent tag
    const eligibleNewProspects = (newProspects || []).filter(p => {
      if (!p.email) return false;
      const emailLower = p.email.toLowerCase();
      const isGenericEmail = GENERIC_EMAIL_PREFIXES.some(prefix => emailLower.startsWith(prefix));
      const alreadySent = (p.tags || []).includes('mystery-inquiry-sent');
      return isGenericEmail && !alreadySent;
    });

    stats.new_prospects_found = eligibleNewProspects.length;
    console.log(`[Mystery Shopper Cron] Found ${eligibleNewProspects.length} new prospects with generic emails`);

    // Step 1B: Also get prospects with 'needs-contact-discovery' tag (legacy behavior)
    const { data: taggedProspects, error: taggedError } = await supabase
      .from('prospects')
      .select('id, name, email, score, tier, tags')
      .contains('tags', ['needs-contact-discovery'])
      .order('score', { ascending: false })
      .limit(50);

    if (taggedError) {
      console.error('[Mystery Shopper Cron] Tagged prospects fetch error:', taggedError);
      stats.errors.push(`Tagged fetch error: ${taggedError.message}`);
    }

    // Filter tagged prospects (same criteria)
    const eligibleTaggedProspects = (taggedProspects || []).filter(p => {
      if (!p.email) return false;
      const alreadySent = (p.tags || []).includes('mystery-inquiry-sent');
      return !alreadySent;
    });

    // Combine and dedupe (new prospects first, then tagged)
    const seenIds = new Set<string>();
    const allEligible = [...eligibleNewProspects, ...eligibleTaggedProspects].filter(p => {
      if (seenIds.has(p.id)) return false;
      seenIds.add(p.id);
      return true;
    });

    console.log(`[Mystery Shopper Cron] Total eligible: ${allEligible.length} (new: ${eligibleNewProspects.length}, tagged: ${eligibleTaggedProspects.length})`);

    // Check which are already in queue
    if (allEligible.length > 0) {
      const prospectIds = allEligible.map(p => p.id);
      const { data: existingQueue } = await supabase
        .from('mystery_shopper_queue')
        .select('prospect_id')
        .in('prospect_id', prospectIds)
        .not('status', 'in', '("completed","failed")');

      const existingIds = new Set((existingQueue || []).map(q => q.prospect_id));

      // Add new ones to queue
      const toAdd = allEligible
        .filter(p => !existingIds.has(p.id))
        .slice(0, MAX_QUEUE_ADDITIONS);

      for (const prospect of toAdd) {
        const priority = prospect.tier === 'hot' ? 1 : prospect.tier === 'warm' ? 5 : 9;

        const { error: insertError } = await supabase
          .from('mystery_shopper_queue')
          .insert({
            prospect_id: prospect.id,
            status: 'pending',
            priority,
          });

        if (insertError) {
          // Ignore duplicate errors (unique constraint)
          if (!insertError.message.includes('duplicate')) {
            stats.errors.push(`Queue insert error for ${prospect.name}: ${insertError.message}`);
          }
        } else {
          stats.added_to_queue++;
          console.log(`[Mystery Shopper Cron] Added ${prospect.name} to queue (priority ${priority})`);
        }
      }
    }

    // Step 2: Trigger mystery shopper emails for pending queue items
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';

    try {
      const response = await fetch(`${baseUrl}/api/mystery-inquiry`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: MAX_EMAILS_PER_RUN }),
      });

      const data = await response.json();

      if (response.ok) {
        stats.emails_sent = data.sent || 0;
        console.log(`[Mystery Shopper Cron] Sent ${stats.emails_sent} mystery shopper emails`);
      } else {
        stats.errors.push(`Mystery inquiry failed: ${data.error}`);
      }
    } catch (err) {
      stats.errors.push(`Mystery inquiry error: ${String(err)}`);
    }

    // Step 3: Clean up old completed/failed entries (older than 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: deleted, error: deleteError } = await supabase
      .from('mystery_shopper_queue')
      .delete()
      .in('status', ['completed', 'failed'])
      .lt('updated_at', thirtyDaysAgo)
      .select('id');

    if (deleteError) {
      stats.errors.push(`Cleanup error: ${deleteError.message}`);
    } else {
      stats.removed_from_queue = deleted?.length || 0;
    }

    console.log('[Mystery Shopper Cron] Complete:', stats);

    // Log activity
    await supabase.from('activities').insert({
      type: 'mystery_shopper',
      title: 'Mystery shopper auto-run completed',
      description: `Found ${stats.new_prospects_found} new prospects with generic emails. Added ${stats.added_to_queue} to queue, sent ${stats.emails_sent} emails, cleaned ${stats.removed_from_queue} old entries.${stats.errors.length > 0 ? ` Errors: ${stats.errors.join(', ')}` : ''}`,
    });

    return NextResponse.json({
      success: stats.errors.length === 0,
      message: `Queue: +${stats.added_to_queue}, Emails: ${stats.emails_sent}, Cleaned: ${stats.removed_from_queue}`,
      stats,
    });
  } catch (error) {
    console.error('[Mystery Shopper Cron] Fatal error:', error);
    return NextResponse.json({
      success: false,
      error: String(error),
      stats,
    }, { status: 500 });
  }
}
