import { NextRequest } from 'next/server';
import { z } from 'zod';
import { createServerClient } from '@/lib/supabase';
import { success, errors } from '@/lib/api-response';
import { parseSearchParams, ValidationError } from '@/lib/validation';
import { logger } from '@/lib/logger';

const emailsQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(500).default(50),
});

export async function GET(request: NextRequest) {
  const supabase = createServerClient();

  try {
    const params = parseSearchParams(new URL(request.url).searchParams, emailsQuerySchema);

    const { data, error } = await supabase
      .from('emails')
      .select('*, prospects(name, city, country)')
      .order('created_at', { ascending: false })
      .limit(params.limit);

    if (error) {
      logger.error({ error }, 'Failed to fetch emails');
      return errors.internal('Failed to fetch emails', error);
    }

    return success({ emails: data });
  } catch (error) {
    if (error instanceof ValidationError) {
      return errors.badRequest(error.message);
    }
    logger.error({ error }, 'Unexpected error fetching emails');
    return errors.internal('Failed to fetch emails', error);
  }
}

// DELETE: Remove emails by address (for cleaning up test emails)
export async function DELETE(request: NextRequest) {
  const supabase = createServerClient();

  try {
    const body = await request.json();
    const { addresses } = body;

    if (!addresses || !Array.isArray(addresses) || addresses.length === 0) {
      return errors.badRequest('addresses array is required');
    }

    let totalDeleted = 0;

    for (const address of addresses) {
      // Delete emails where to_email matches
      const { data: toDeleted } = await supabase
        .from('emails')
        .delete()
        .eq('to_email', address)
        .select('id');

      // Delete emails where from_email matches
      const { data: fromDeleted } = await supabase
        .from('emails')
        .delete()
        .eq('from_email', address)
        .select('id');

      totalDeleted += (toDeleted?.length || 0) + (fromDeleted?.length || 0);
    }

    logger.info({ addresses, totalDeleted }, 'Cleaned up test emails');

    return success({
      message: `Deleted ${totalDeleted} emails`,
      addresses,
      deleted: totalDeleted,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to delete emails');
    return errors.internal('Failed to delete emails', error);
  }
}
