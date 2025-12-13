# Step 04: Queue Architecture & Workers

## Goal
Decouple operations so that failures in one component don't cascade. Use queues for anything that doesn't need immediate response - email sending, enrichment, analytics aggregation.

---

## Current State

**Problem:** Everything is synchronous in the cron job.

```
Cron fires → Query prospects → Generate email → Send email → Update DB
                    ↓
            If any step fails, entire batch fails
            No retry, no visibility, no prioritization
```

---

## What to Verify

### 1. Queue Implementation
- [ ] Async operations go through a queue
- [ ] Failed jobs are retried with backoff
- [ ] Dead letter queue captures permanent failures
- [ ] Queue depth is monitored

### 2. Worker Reliability
- [ ] Workers are idempotent
- [ ] Timeouts are configured
- [ ] Poison messages don't block queue

### 3. Prioritization
- [ ] High-priority items processed first
- [ ] Stale items eventually processed

---

## Common Failure Modes

| Failure | Impact | Current State |
|---------|--------|---------------|
| Email generation fails | Entire batch stops | No retry |
| SMTP timeout | Email lost | Logged but not retried |
| Rate limit hit | Subsequent emails skipped | No backoff queue |
| Worker crash mid-batch | Partial completion, no visibility | No checkpointing |
| Slow enrichment | Blocks email sending | Same thread |

---

## How to Make It Robust

### 1. Implement Job Queue Table

```sql
-- D1 migration
CREATE TABLE job_queue (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL, -- 'send_email', 'enrich_website', 'enrich_email', 'process_reply'
  priority INTEGER DEFAULT 5, -- 1=highest, 10=lowest
  payload TEXT NOT NULL, -- JSON
  status TEXT DEFAULT 'pending', -- pending, processing, completed, failed, dead
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  last_error TEXT,
  scheduled_for TEXT DEFAULT (datetime('now')),
  locked_until TEXT,
  locked_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE INDEX idx_job_queue_pending ON job_queue(status, priority, scheduled_for)
  WHERE status = 'pending';
CREATE INDEX idx_job_queue_processing ON job_queue(status, locked_until)
  WHERE status = 'processing';
```

### 2. Queue Service

**File: `cloudflare/src/lib/queue.ts`**
```typescript
export interface Job {
  id: string;
  type: string;
  priority: number;
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
}

export async function enqueue(
  type: string,
  payload: Record<string, unknown>,
  options: {
    priority?: number;
    scheduledFor?: Date;
    maxAttempts?: number;
  } = {},
  env: Env
): Promise<string> {
  const id = `job_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  await env.DB.prepare(`
    INSERT INTO job_queue (id, type, priority, payload, max_attempts, scheduled_for)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    type,
    options.priority || 5,
    JSON.stringify(payload),
    options.maxAttempts || 3,
    options.scheduledFor?.toISOString() || new Date().toISOString()
  ).run();

  return id;
}

export async function dequeue(
  types: string[],
  batchSize: number,
  workerId: string,
  env: Env
): Promise<Job[]> {
  const lockDuration = 300; // 5 minutes
  const lockUntil = new Date(Date.now() + lockDuration * 1000).toISOString();

  // Fetch and lock jobs atomically
  const { results } = await env.DB.prepare(`
    UPDATE job_queue SET
      status = 'processing',
      locked_until = ?,
      locked_by = ?,
      attempts = attempts + 1,
      updated_at = datetime('now')
    WHERE id IN (
      SELECT id FROM job_queue
      WHERE status = 'pending'
      AND type IN (${types.map(() => '?').join(',')})
      AND scheduled_for <= datetime('now')
      ORDER BY priority ASC, scheduled_for ASC
      LIMIT ?
    )
    RETURNING *
  `).bind(lockUntil, workerId, ...types, batchSize).all();

  return (results || []).map(row => ({
    id: row.id as string,
    type: row.type as string,
    priority: row.priority as number,
    payload: JSON.parse(row.payload as string),
    attempts: row.attempts as number,
    maxAttempts: row.max_attempts as number,
  }));
}

export async function complete(jobId: string, env: Env): Promise<void> {
  await env.DB.prepare(`
    UPDATE job_queue SET
      status = 'completed',
      completed_at = datetime('now'),
      updated_at = datetime('now')
    WHERE id = ?
  `).bind(jobId).run();
}

export async function fail(
  jobId: string,
  error: string,
  env: Env
): Promise<void> {
  // Check if we should retry or move to dead letter
  const { results } = await env.DB.prepare(`
    SELECT attempts, max_attempts FROM job_queue WHERE id = ?
  `).bind(jobId).all();

  const job = results?.[0];
  if (!job) return;

  if (job.attempts >= job.max_attempts) {
    // Move to dead letter queue
    await env.DB.prepare(`
      UPDATE job_queue SET
        status = 'dead',
        last_error = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).bind(error, jobId).run();
  } else {
    // Schedule retry with exponential backoff
    const backoffMinutes = Math.pow(2, job.attempts) * 5; // 5, 10, 20, 40...
    const retryAt = new Date(Date.now() + backoffMinutes * 60 * 1000);

    await env.DB.prepare(`
      UPDATE job_queue SET
        status = 'pending',
        scheduled_for = ?,
        last_error = ?,
        locked_until = NULL,
        locked_by = NULL,
        updated_at = datetime('now')
      WHERE id = ?
    `).bind(retryAt.toISOString(), error, jobId).run();
  }
}
```

### 3. Worker Implementation

**File: `cloudflare/src/workers/job-worker.ts`**
```typescript
const JOB_HANDLERS: Record<string, (payload: any, env: Env) => Promise<void>> = {
  'send_email': handleSendEmail,
  'enrich_website': handleEnrichWebsite,
  'enrich_email': handleEnrichEmail,
  'process_reply': handleProcessReply,
  'sync_to_supabase': handleSyncToSupabase,
};

export async function processJobs(env: Env) {
  const workerId = `worker_${Date.now()}`;
  const jobs = await dequeue(
    Object.keys(JOB_HANDLERS),
    10, // Process 10 jobs per run
    workerId,
    env
  );

  console.log(`Processing ${jobs.length} jobs`);

  for (const job of jobs) {
    const handler = JOB_HANDLERS[job.type];
    if (!handler) {
      await fail(job.id, `Unknown job type: ${job.type}`, env);
      continue;
    }

    try {
      await handler(job.payload, env);
      await complete(job.id, env);
    } catch (error) {
      console.error(`Job ${job.id} failed:`, error);
      await fail(job.id, error.message, env);
    }
  }
}

async function handleSendEmail(payload: { prospectId: string; campaignId: string }, env: Env) {
  const prospect = await getProspect(payload.prospectId, env);
  if (!prospect) throw new Error('Prospect not found');

  const campaign = await getCampaign(payload.campaignId, env);
  if (!campaign) throw new Error('Campaign not found');

  await sendEmailToProspect(prospect, campaign, env);
}

async function handleEnrichWebsite(payload: { prospectId: string }, env: Env) {
  const prospect = await getProspect(payload.prospectId, env);
  if (!prospect) throw new Error('Prospect not found');

  await findWebsiteForProspect(prospect, env);
}

// ... other handlers
```

### 4. Cron Enqueues Jobs Instead of Processing

**File: `cloudflare/src/workers/cron.ts`**
```typescript
export async function handleEmailCron(env: Env) {
  // Get prospects eligible for email
  const prospects = await getEligibleProspects(env);

  // Enqueue each as a job instead of processing immediately
  for (const prospect of prospects) {
    await enqueue('send_email', {
      prospectId: prospect.id,
      campaignId: prospect.campaign_id,
    }, {
      priority: prospect.tier === 'hot' ? 1 : prospect.tier === 'warm' ? 3 : 5,
    }, env);
  }

  console.log(`Enqueued ${prospects.length} email jobs`);
}

export async function handleEnrichmentCron(env: Env) {
  // Get prospects needing enrichment
  const needsWebsite = await getProspectsNeedingWebsite(env, 50);
  const needsEmail = await getProspectsNeedingEmail(env, 20);

  // Enqueue website jobs (lower priority)
  for (const prospect of needsWebsite) {
    await enqueue('enrich_website', { prospectId: prospect.id }, { priority: 7 }, env);
  }

  // Enqueue email jobs (higher priority)
  for (const prospect of needsEmail) {
    await enqueue('enrich_email', { prospectId: prospect.id }, { priority: 5 }, env);
  }
}
```

### 5. Job Worker Cron

**Add to wrangler.toml:**
```toml
[triggers]
crons = [
  "*/1 * * * *",     # Job worker - runs every minute
  "*/5 8-18 * * 1-6" # Enqueue emails - runs every 5 min during business hours
]
```

**Handle in index.ts:**
```typescript
export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    switch (event.cron) {
      case '*/1 * * * *':
        await processJobs(env);
        break;
      case '*/5 8-18 * * 1-6':
        await handleEmailCron(env);
        break;
    }
  }
};
```

### 6. Dead Letter Queue Handling

```typescript
// Fetch dead jobs for manual review
async function getDeadJobs(env: Env, limit = 50) {
  const { results } = await env.DB.prepare(`
    SELECT * FROM job_queue
    WHERE status = 'dead'
    ORDER BY updated_at DESC
    LIMIT ?
  `).bind(limit).all();

  return results;
}

// Retry a dead job (manual intervention)
async function retryDeadJob(jobId: string, env: Env) {
  await env.DB.prepare(`
    UPDATE job_queue SET
      status = 'pending',
      attempts = 0,
      scheduled_for = datetime('now'),
      updated_at = datetime('now')
    WHERE id = ? AND status = 'dead'
  `).bind(jobId).run();
}

// Clear old completed jobs
async function cleanupOldJobs(env: Env) {
  await env.DB.prepare(`
    DELETE FROM job_queue
    WHERE status = 'completed'
    AND completed_at < datetime('now', '-7 days')
  `).run();
}
```

### 7. Queue Monitoring

```typescript
async function getQueueStats(env: Env) {
  const { results } = await env.DB.prepare(`
    SELECT
      type,
      status,
      COUNT(*) as count,
      AVG(attempts) as avg_attempts
    FROM job_queue
    GROUP BY type, status
  `).all();

  const stats = {
    byType: {},
    byStatus: {},
    totalPending: 0,
    totalProcessing: 0,
    totalDead: 0,
  };

  for (const row of results || []) {
    // Aggregate stats
  }

  return stats;
}
```

---

## Queue Priorities

| Job Type | Priority | Reason |
|----------|----------|--------|
| process_reply | 1 | Don't miss replies |
| send_email (hot) | 2 | High-value prospects |
| send_email (warm) | 4 | Medium priority |
| send_email (cold) | 6 | Lower priority |
| enrich_email | 5 | Enables sending |
| enrich_website | 7 | Nice to have |
| sync_to_supabase | 8 | Background task |
| cleanup | 10 | Lowest priority |

---

## Verification Checklist

- [ ] Job queue table created
- [ ] Enqueue/dequeue working correctly
- [ ] Exponential backoff on failures
- [ ] Dead letter queue capturing failures
- [ ] Job worker running every minute
- [ ] Queue stats visible in dashboard
- [ ] Old jobs cleaned up automatically

---

## Failure Recovery

### Queue Stuck
```sql
-- Unlock jobs stuck in processing (worker crashed)
UPDATE job_queue SET
  status = 'pending',
  locked_until = NULL,
  locked_by = NULL
WHERE status = 'processing'
AND locked_until < datetime('now');
```

### Too Many Dead Jobs
```sql
-- Find common failure patterns
SELECT type, last_error, COUNT(*) as count
FROM job_queue
WHERE status = 'dead'
GROUP BY type, last_error
ORDER BY count DESC;
```
