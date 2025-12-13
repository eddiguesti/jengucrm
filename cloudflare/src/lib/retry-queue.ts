/**
 * Retry Queue Service
 * Handles storing, retrieving, and retrying failed enrichment tasks
 */

import { Env } from '../types';

export type TaskType = 'find_website' | 'find_email' | 'scrape' | 'verify';

export interface FailedTask {
  id: string;
  type: TaskType;
  prospectId: string;
  prospectName: string | null;
  data: Record<string, unknown>;
  error: string;
  attempts: number;
  maxAttempts: number;
  nextRetryAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface DbRow {
  id: string;
  type: string;
  prospect_id: string;
  prospect_name: string | null;
  data: string | null;
  error: string;
  attempts: number;
  max_attempts: number;
  next_retry_at: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Generate exponential backoff delay
 * 1st retry: 5 min, 2nd: 30 min, 3rd: 2 hours
 */
function getBackoffDelay(attempts: number): number {
  const baseMinutes = [5, 30, 120, 480][Math.min(attempts, 3)];
  // Add jitter (±20%)
  const jitter = 1 + (Math.random() - 0.5) * 0.4;
  return baseMinutes * 60 * 1000 * jitter;
}

/**
 * Record a failed enrichment task
 */
export async function recordFailure(
  env: Env,
  type: TaskType,
  prospectId: string,
  prospectName: string | null,
  error: string,
  data: Record<string, unknown> = {}
): Promise<void> {
  const id = `fail_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const nextRetryAt = new Date(Date.now() + getBackoffDelay(1)).toISOString();

  try {
    await env.DB.prepare(`
      INSERT INTO failed_tasks (id, type, prospect_id, prospect_name, data, error, attempts, max_attempts, next_retry_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, 3, ?)
      ON CONFLICT (id) DO NOTHING
    `).bind(
      id,
      type,
      prospectId,
      prospectName,
      JSON.stringify(data),
      error.substring(0, 500),
      nextRetryAt
    ).run();

    console.log(`[RetryQueue] Recorded failure for ${prospectName || prospectId}: ${type} - ${error.substring(0, 100)}`);
  } catch (err) {
    console.error('[RetryQueue] Failed to record failure:', err);
  }
}

/**
 * Get tasks pending retry
 */
export async function getPendingTasks(
  env: Env,
  limit = 20
): Promise<FailedTask[]> {
  try {
    const result = await env.DB.prepare(`
      SELECT *
      FROM failed_tasks
      WHERE resolved_at IS NULL
        AND attempts < max_attempts
        AND (next_retry_at IS NULL OR next_retry_at <= datetime('now'))
      ORDER BY next_retry_at ASC
      LIMIT ?
    `).bind(limit).all<DbRow>();

    return (result.results || []).map(rowToTask);
  } catch (err) {
    console.error('[RetryQueue] Failed to get pending tasks:', err);
    return [];
  }
}

/**
 * Mark a task as retrying (increment attempts, update next retry time)
 */
export async function markRetrying(env: Env, taskId: string): Promise<void> {
  try {
    const task = await getTask(env, taskId);
    if (!task) return;

    const nextRetryAt = new Date(Date.now() + getBackoffDelay(task.attempts + 1)).toISOString();

    await env.DB.prepare(`
      UPDATE failed_tasks
      SET attempts = attempts + 1,
          next_retry_at = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).bind(nextRetryAt, taskId).run();
  } catch (err) {
    console.error('[RetryQueue] Failed to mark retrying:', err);
  }
}

/**
 * Mark a task as resolved (successful retry)
 */
export async function markResolved(env: Env, taskId: string): Promise<void> {
  try {
    await env.DB.prepare(`
      UPDATE failed_tasks
      SET resolved_at = datetime('now'),
          updated_at = datetime('now')
      WHERE id = ?
    `).bind(taskId).run();

    console.log(`[RetryQueue] Task ${taskId} resolved`);
  } catch (err) {
    console.error('[RetryQueue] Failed to mark resolved:', err);
  }
}

/**
 * Get a single task by ID
 */
export async function getTask(env: Env, taskId: string): Promise<FailedTask | null> {
  try {
    const row = await env.DB.prepare(`
      SELECT * FROM failed_tasks WHERE id = ?
    `).bind(taskId).first<DbRow>();

    return row ? rowToTask(row) : null;
  } catch (err) {
    console.error('[RetryQueue] Failed to get task:', err);
    return null;
  }
}

/**
 * Get failed task statistics
 */
export async function getStats(env: Env): Promise<{
  total: number;
  pending: number;
  resolved: number;
  byType: Record<string, number>;
  recentFailures: FailedTask[];
}> {
  try {
    const stats = await env.DB.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN resolved_at IS NULL AND attempts < max_attempts THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN resolved_at IS NOT NULL THEN 1 ELSE 0 END) as resolved
      FROM failed_tasks
    `).first<{ total: number; pending: number; resolved: number }>();

    const byTypeResult = await env.DB.prepare(`
      SELECT type, COUNT(*) as count
      FROM failed_tasks
      WHERE resolved_at IS NULL
      GROUP BY type
    `).all<{ type: string; count: number }>();

    const byType: Record<string, number> = {};
    for (const row of byTypeResult.results || []) {
      byType[row.type] = row.count;
    }

    const recentResult = await env.DB.prepare(`
      SELECT * FROM failed_tasks
      WHERE resolved_at IS NULL
      ORDER BY created_at DESC
      LIMIT 10
    `).all<DbRow>();

    return {
      total: stats?.total || 0,
      pending: stats?.pending || 0,
      resolved: stats?.resolved || 0,
      byType,
      recentFailures: (recentResult.results || []).map(rowToTask),
    };
  } catch (err) {
    console.error('[RetryQueue] Failed to get stats:', err);
    return { total: 0, pending: 0, resolved: 0, byType: {}, recentFailures: [] };
  }
}

/**
 * Clean up old resolved tasks (keep last 30 days)
 */
export async function cleanup(env: Env): Promise<number> {
  try {
    const result = await env.DB.prepare(`
      DELETE FROM failed_tasks
      WHERE resolved_at IS NOT NULL
        AND resolved_at < datetime('now', '-30 days')
    `).run();

    const deleted = result.meta?.changes || 0;
    if (deleted > 0) {
      console.log(`[RetryQueue] Cleaned up ${deleted} old resolved tasks`);
    }
    return deleted;
  } catch (err) {
    console.error('[RetryQueue] Cleanup failed:', err);
    return 0;
  }
}

/**
 * Resolve tasks by prospect ID (when prospect is manually resolved)
 */
export async function resolveByProspect(env: Env, prospectId: string): Promise<void> {
  try {
    await env.DB.prepare(`
      UPDATE failed_tasks
      SET resolved_at = datetime('now'),
          updated_at = datetime('now')
      WHERE prospect_id = ?
        AND resolved_at IS NULL
    `).bind(prospectId).run();
  } catch (err) {
    console.error('[RetryQueue] Failed to resolve by prospect:', err);
  }
}

function rowToTask(row: DbRow): FailedTask {
  return {
    id: row.id,
    type: row.type as TaskType,
    prospectId: row.prospect_id,
    prospectName: row.prospect_name,
    data: row.data ? JSON.parse(row.data) : {},
    error: row.error,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    nextRetryAt: row.next_retry_at,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
