import { NextRequest } from 'next/server';
import { success, errors } from '@/lib/api-response';
import { logger } from '@/lib/logger';
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

  try {
    // Delegate to the main enrichment handler (single source of truth).
    // This keeps the cron behavior consistent with the UI "Start Enrichment".
    const origin = request.nextUrl.origin;
    const response = await fetch(`${origin}/api/sales-navigator/enrichment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start', limit: 1, includeResearch: false }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      logger.warn({ status: response.status, data }, 'Sales Nav enrichment cron delegate failed');
      return errors.internal('Enrichment failed', data);
    }

    return success((data as { data?: unknown }).data ?? data);
  } catch (error) {
    logger.error({ error }, 'Sales Nav enrichment cron failed');
    return errors.internal('Enrichment failed', error);
  }
}
