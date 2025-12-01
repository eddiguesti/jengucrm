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
