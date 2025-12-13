import { NextRequest } from 'next/server';
import { success, errors } from '@/lib/api-response';
import config from '@/lib/config';

/**
 * Simple debug endpoint to check whether outgoing emails are currently disabled.
 * GET /api/debug-email
 */
export async function GET(request: NextRequest) {
  try {
    return success({
      disableOutgoing: config.email.disableOutgoing,
      message: config.email.disableOutgoing
        ? 'Outgoing emails are DISABLED (DISABLE_OUTGOING_EMAILS=true)'
        : 'Outgoing emails are ENABLED',
    });
  } catch (err) {
    return errors.internal('Failed to read email debug status', err);
  }
}
