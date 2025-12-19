import { success, errors } from '@/lib/api-response';
import { logger } from '@/lib/logger';
import { createServerClient } from '@/lib/supabase';

const CLOUDFLARE_WORKER_URL = 'https://jengu-crm.edd-181.workers.dev';

interface EnrichmentStatus {
  total: number;
  needsWebsite: number;
  needsEmail: number;
  enriched: number;
  contacted: number;
}

interface EnrichmentProgress {
  isRunning: boolean;
  type: 'websites' | 'emails' | 'auto' | null;
  processed: number;
  total: number;
  found: number;
  websitesFound: number;
  emailsFound: number;
  startedAt: string | null;
  lastUpdatedAt: string | null;
}

interface GoogleDebug {
  googleConfigured: boolean;
  dailyLimit: number;
  usedToday: number;
  remaining: number;
  canUse: boolean;
}

export async function GET() {
  try {
    // Fetch enrichment stats from Cloudflare Worker in parallel
    const [statusRes, progressRes, googleRes] = await Promise.all([
      fetch(`${CLOUDFLARE_WORKER_URL}/enrich/status`, {
        headers: { 'Accept': 'application/json' },
        next: { revalidate: 30 } // Cache for 30 seconds
      }),
      fetch(`${CLOUDFLARE_WORKER_URL}/enrich/progress`, {
        headers: { 'Accept': 'application/json' },
        next: { revalidate: 5 } // Cache for 5 seconds (progress updates frequently)
      }),
      fetch(`${CLOUDFLARE_WORKER_URL}/enrich/debug-google`, {
        headers: { 'Accept': 'application/json' },
        next: { revalidate: 60 } // Cache for 60 seconds
      }),
    ]);

    const status: EnrichmentStatus = statusRes.ok
      ? await statusRes.json()
      : { total: 0, needsWebsite: 0, needsEmail: 0, enriched: 0, contacted: 0 };

    const progress: EnrichmentProgress = progressRes.ok
      ? await progressRes.json()
      : { isRunning: false, type: null, processed: 0, total: 0, found: 0, websitesFound: 0, emailsFound: 0, startedAt: null, lastUpdatedAt: null };

    const googleDebug: GoogleDebug = googleRes.ok
      ? await googleRes.json()
      : { googleConfigured: false, dailyLimit: 100, usedToday: 0, remaining: 100, canUse: false };

    // Get Supabase stats for historical enrichment data
    const supabase = createServerClient();

    // Get prospects with website/email coverage
    const { data: prospects } = await supabase
      .from('prospects')
      .select('id, website, email, created_at, updated_at')
      .eq('archived', false);

    // Calculate coverage rates
    const totalProspects = prospects?.length || 0;
    const withWebsite = prospects?.filter(p => p.website)?.length || 0;
    const withEmail = prospects?.filter(p => p.email)?.length || 0;

    // Get today's enrichment activity from activities table
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data: todayActivities } = await supabase
      .from('activities')
      .select('type, title, description, created_at')
      .gte('created_at', today.toISOString())
      .or('type.eq.enrichment,type.eq.system')
      .order('created_at', { ascending: false })
      .limit(50);

    // Parse enrichment activities
    let websitesFoundToday = 0;
    let emailsFoundToday = 0;
    let enrichmentRuns = 0;

    for (const activity of todayActivities || []) {
      if (activity.title?.includes('website') || activity.description?.includes('website')) {
        const match = activity.description?.match(/found (\d+)/);
        if (match) websitesFoundToday += parseInt(match[1]);
      }
      if (activity.title?.includes('email') || activity.description?.includes('email')) {
        const match = activity.description?.match(/found (\d+)/);
        if (match) emailsFoundToday += parseInt(match[1]);
      }
      if (activity.type === 'enrichment') {
        enrichmentRuns++;
      }
    }

    // Build comprehensive enrichment stats
    const enrichmentStats = {
      // Current status (from D1)
      pipeline: {
        total: status.total,
        needsWebsite: status.needsWebsite,
        needsEmail: status.needsEmail,
        enriched: status.enriched,
        contacted: status.contacted,
      },

      // Coverage (from Supabase)
      coverage: {
        total: totalProspects,
        withWebsite,
        withEmail,
        websiteRate: totalProspects > 0 ? Math.round((withWebsite / totalProspects) * 100) : 0,
        emailRate: totalProspects > 0 ? Math.round((withEmail / totalProspects) * 100) : 0,
      },

      // API Usage
      apiUsage: {
        google: {
          configured: googleDebug.googleConfigured,
          dailyLimit: googleDebug.dailyLimit,
          usedToday: googleDebug.usedToday,
          remaining: googleDebug.remaining,
          percentUsed: googleDebug.dailyLimit > 0
            ? Math.round((googleDebug.usedToday / googleDebug.dailyLimit) * 100)
            : 0,
        },
        // Note: Brave doesn't have a simple counter endpoint, so we show availability
        brave: {
          configured: true, // We know we have 3 keys
          keysAvailable: 3,
          monthlyLimit: 6000, // 2000 per key
        },
      },

      // Today's activity
      today: {
        websitesFound: websitesFoundToday,
        emailsFound: emailsFoundToday,
        enrichmentRuns,
      },

      // Current progress (if running)
      progress: {
        isRunning: progress.isRunning,
        type: progress.type,
        processed: progress.processed,
        total: progress.total,
        found: progress.found,
        websitesFound: progress.websitesFound,
        emailsFound: progress.emailsFound,
        startedAt: progress.startedAt,
        lastUpdatedAt: progress.lastUpdatedAt,
      },

      generatedAt: new Date().toISOString(),
    };

    return success(enrichmentStats);
  } catch (error) {
    logger.error({ error }, 'Failed to fetch enrichment stats');
    return errors.internal('Failed to fetch enrichment stats', error);
  }
}
