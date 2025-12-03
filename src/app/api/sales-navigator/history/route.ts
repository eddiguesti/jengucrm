import { createServerClient } from '@/lib/supabase';
import { success, errors } from '@/lib/api-response';
import { logger } from '@/lib/logger';

/**
 * GET /api/sales-navigator/history
 * Get import history
 */
export async function GET() {
  const supabase = createServerClient();

  try {
    const { data: logs } = await supabase
      .from('sales_nav_import_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);

    return success({ logs: logs || [] });
  } catch (error) {
    logger.error({ error }, 'Failed to get import history');
    return errors.internal('Failed to get history', error);
  }
}
