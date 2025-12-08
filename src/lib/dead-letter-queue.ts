import { createServerClient } from '@/lib/supabase';
import { logger } from '@/lib/logger';

export type JobType = 'enrichment' | 'email' | 'scrape' | 'reply_check' | 'mystery_shopper';

interface DLQJob {
  id?: string;
  job_type: JobType;
  payload: Record<string, unknown>;
  error: string;
  error_code?: string;
  attempts?: number;
  max_attempts?: number;
  next_retry_at?: string;
}

/**
 * Dead Letter Queue for failed jobs
 *
 * Jobs that fail are added to this queue for later retry.
 * The DLQ processor runs periodically to retry failed jobs.
 */
export const dlq = {
  /**
   * Add a failed job to the dead letter queue
   */
  async add(job: Omit<DLQJob, 'id'>): Promise<void> {
    const supabase = createServerClient();

    try {
      // Calculate next retry time (exponential backoff)
      const attempts = job.attempts || 1;
      const baseDelay = 5 * 60 * 1000; // 5 minutes
      const maxDelay = 24 * 60 * 60 * 1000; // 24 hours
      const delay = Math.min(baseDelay * Math.pow(2, attempts - 1), maxDelay);
      const nextRetryAt = new Date(Date.now() + delay).toISOString();

      await supabase.from('dead_letter_queue').insert({
        job_type: job.job_type,
        payload: job.payload,
        error: job.error,
        error_code: job.error_code,
        attempts: attempts,
        max_attempts: job.max_attempts || 3,
        next_retry_at: nextRetryAt,
      });

      logger.info({
        jobType: job.job_type,
        error: job.error,
        attempts,
        nextRetryAt,
      }, 'Job added to DLQ');
    } catch (error) {
      logger.error({ error, job }, 'Failed to add job to DLQ');
    }
  },

  /**
   * Get jobs ready for retry
   */
  async getRetryable(limit = 20): Promise<DLQJob[]> {
    const supabase = createServerClient();

    try {
      const { data, error } = await supabase
        .from('dead_letter_queue')
        .select('*')
        .is('processed_at', null)
        .lt('next_retry_at', new Date().toISOString())
        .order('next_retry_at', { ascending: true })
        .limit(limit);

      if (error) {
        logger.error({ error }, 'Failed to fetch DLQ jobs');
        return [];
      }

      // Filter in memory since supabase doesn't support column-to-column comparison easily
      return (data || []).filter(job => job.attempts < job.max_attempts);
    } catch (error) {
      logger.error({ error }, 'Failed to fetch DLQ jobs');
      return [];
    }
  },

  /**
   * Mark a job as processed (either succeeded or permanently failed)
   */
  async markProcessed(jobId: string): Promise<void> {
    const supabase = createServerClient();

    try {
      await supabase
        .from('dead_letter_queue')
        .update({
          processed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', jobId);
    } catch (error) {
      logger.error({ error, jobId }, 'Failed to mark DLQ job as processed');
    }
  },

  /**
   * Increment attempts and update next retry time
   */
  async incrementAttempts(jobId: string, newError?: string): Promise<void> {
    const supabase = createServerClient();

    try {
      // Get current job
      const { data: job } = await supabase
        .from('dead_letter_queue')
        .select('attempts, max_attempts')
        .eq('id', jobId)
        .single();

      if (!job) return;

      const newAttempts = (job.attempts || 1) + 1;

      // If we've exceeded max attempts, mark as processed (permanently failed)
      if (newAttempts >= job.max_attempts) {
        await supabase
          .from('dead_letter_queue')
          .update({
            attempts: newAttempts,
            error: newError || 'Max attempts exceeded',
            processed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', jobId);

        logger.warn({ jobId, attempts: newAttempts }, 'DLQ job permanently failed');
        return;
      }

      // Calculate next retry time (exponential backoff)
      const baseDelay = 5 * 60 * 1000; // 5 minutes
      const maxDelay = 24 * 60 * 60 * 1000; // 24 hours
      const delay = Math.min(baseDelay * Math.pow(2, newAttempts - 1), maxDelay);
      const nextRetryAt = new Date(Date.now() + delay).toISOString();

      await supabase
        .from('dead_letter_queue')
        .update({
          attempts: newAttempts,
          error: newError,
          next_retry_at: nextRetryAt,
          updated_at: new Date().toISOString(),
        })
        .eq('id', jobId);
    } catch (error) {
      logger.error({ error, jobId }, 'Failed to increment DLQ attempts');
    }
  },

  /**
   * Get DLQ statistics
   */
  async getStats(): Promise<{
    pending: number;
    processed: number;
    byType: Record<string, number>;
    oldestPending: string | null;
  }> {
    const supabase = createServerClient();

    try {
      const [pendingResult, processedResult, byTypeResult] = await Promise.all([
        supabase
          .from('dead_letter_queue')
          .select('*', { count: 'exact', head: true })
          .is('processed_at', null),
        supabase
          .from('dead_letter_queue')
          .select('*', { count: 'exact', head: true })
          .not('processed_at', 'is', null),
        supabase
          .from('dead_letter_queue')
          .select('job_type')
          .is('processed_at', null),
      ]);

      const byType: Record<string, number> = {};
      for (const job of byTypeResult.data || []) {
        byType[job.job_type] = (byType[job.job_type] || 0) + 1;
      }

      // Get oldest pending job
      const { data: oldest } = await supabase
        .from('dead_letter_queue')
        .select('created_at')
        .is('processed_at', null)
        .order('created_at', { ascending: true })
        .limit(1);

      return {
        pending: pendingResult.count || 0,
        processed: processedResult.count || 0,
        byType,
        oldestPending: oldest?.[0]?.created_at || null,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get DLQ stats');
      return { pending: 0, processed: 0, byType: {}, oldestPending: null };
    }
  },

  /**
   * Clean up old processed jobs (older than 7 days)
   */
  async cleanup(daysOld = 7): Promise<number> {
    const supabase = createServerClient();

    try {
      const cutoff = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000).toISOString();

      const { data, error } = await supabase
        .from('dead_letter_queue')
        .delete()
        .not('processed_at', 'is', null)
        .lt('processed_at', cutoff)
        .select('id');

      if (error) {
        logger.error({ error }, 'DLQ cleanup failed');
        return 0;
      }

      const cleaned = data?.length || 0;
      if (cleaned > 0) {
        logger.info({ cleaned, daysOld }, 'DLQ cleanup complete');
      }
      return cleaned;
    } catch (error) {
      logger.error({ error }, 'DLQ cleanup failed');
      return 0;
    }
  },
};
