import { NextRequest } from 'next/server';
import { z } from 'zod';
import { createServerClient } from '@/lib/supabase';
import { success, errors } from '@/lib/api-response';
import { parseSearchParams, ValidationError } from '@/lib/validation';
import { logger } from '@/lib/logger';

const emailsQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(500).default(50),
  direction: z.enum(['inbound', 'outbound']).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  email_type: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const supabase = createServerClient();

  try {
    const params = parseSearchParams(new URL(request.url).searchParams, emailsQuerySchema);

    let query = supabase
      .from('emails')
      .select('*, prospects(id, name, company, city, country, stage, tier)')
      .order('created_at', { ascending: false });

    // Apply filters
    if (params.direction) {
      query = query.eq('direction', params.direction);
    }
    if (params.from) {
      query = query.eq('from_email', params.from);
    }
    if (params.to) {
      query = query.eq('to_email', params.to);
    }
    if (params.email_type) {
      query = query.eq('email_type', params.email_type);
    }

    const { data, error } = await query.limit(params.limit);

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
// OPTIMIZED: Uses batch operations instead of N+1 loop queries
export async function DELETE(request: NextRequest) {
  const supabase = createServerClient();

  try {
    const body = await request.json();
    const { addresses } = body;

    if (!addresses || !Array.isArray(addresses) || addresses.length === 0) {
      return errors.badRequest('addresses array is required');
    }

    // Build OR conditions for batch deletion
    const orConditions = addresses.map(addr => `to_email.eq.${addr},from_email.eq.${addr}`).join(',');

    // Single batch delete for all addresses
    const { data: deleted, error } = await supabase
      .from('emails')
      .delete()
      .or(orConditions)
      .select('id');

    if (error) {
      logger.error({ error }, 'Failed to batch delete emails');
      return errors.internal('Failed to delete emails', error);
    }

    const totalDeleted = deleted?.length || 0;
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
