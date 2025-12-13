# Step 03: Idempotency & Deduplication

## Goal
Ensure that every operation can be safely retried without causing duplicates. If the cron fires twice, if a webhook is delivered twice, if the network hiccups - the system should handle it gracefully.

---

## What is Idempotency?

Running an operation multiple times produces the same result as running it once.

```
sendEmail(prospect_123) → email sent
sendEmail(prospect_123) → "already sent today" (no duplicate)
sendEmail(prospect_123) → "already sent today" (no duplicate)
```

---

## What to Verify

### 1. Email Sending
- [ ] Same prospect never emailed twice in 24 hours
- [ ] Same email ID can't be inserted twice
- [ ] Cron restart doesn't re-send emails

### 2. Enrichment
- [ ] Same prospect not enriched twice simultaneously
- [ ] Webhook retry doesn't duplicate data

### 3. Reply Processing
- [ ] Same reply not processed twice
- [ ] Duplicate message-IDs rejected

### 4. Database Operations
- [ ] Upserts used instead of blind inserts
- [ ] Unique constraints enforced

---

## Common Failure Modes

| Failure | Impact | How It Happens |
|---------|--------|----------------|
| Duplicate email sent | Unprofessional, damages reputation | Cron fires twice, no check |
| Duplicate prospect created | Split data, confusing reports | Import runs twice |
| Reply processed twice | Wrong stats, double notifications | Webhook retry |
| Enrichment runs twice | Wasted API calls, race conditions | Overlapping cron runs |

---

## How to Make It Robust

### 1. Email Sending Idempotency

**Before sending, check if already sent today:**
```typescript
async function canSendToProspect(prospectId: string, env: Env): Promise<boolean> {
  // Check if we've sent to this prospect in last 24 hours
  const { results } = await env.DB.prepare(`
    SELECT id FROM emails
    WHERE prospect_id = ?
    AND direction = 'outbound'
    AND sent_at > datetime('now', '-24 hours')
    LIMIT 1
  `).bind(prospectId).all();

  return results.length === 0;
}

async function sendEmail(prospect: Prospect, env: Env) {
  // Idempotency check
  if (!await canSendToProspect(prospect.id, env)) {
    console.log(`Skipping ${prospect.id} - already emailed today`);
    return { skipped: true, reason: 'already_emailed_today' };
  }

  // Generate idempotency key for this specific send attempt
  const idempotencyKey = `send:${prospect.id}:${new Date().toISOString().split('T')[0]}`;

  // Try to acquire lock
  const locked = await acquireLock(idempotencyKey, 300, env); // 5 min lock
  if (!locked) {
    console.log(`Skipping ${prospect.id} - send in progress`);
    return { skipped: true, reason: 'send_in_progress' };
  }

  try {
    // Actually send
    const result = await doSendEmail(prospect, env);
    return result;
  } finally {
    await releaseLock(idempotencyKey, env);
  }
}
```

### 2. Distributed Locking with KV

**File: `cloudflare/src/lib/lock.ts`**
```typescript
export async function acquireLock(
  key: string,
  ttlSeconds: number,
  env: Env
): Promise<boolean> {
  const lockKey = `lock:${key}`;
  const existing = await env.KV_CACHE.get(lockKey);

  if (existing) {
    return false; // Already locked
  }

  // Set lock with expiration
  await env.KV_CACHE.put(lockKey, Date.now().toString(), {
    expirationTtl: ttlSeconds,
  });

  return true;
}

export async function releaseLock(key: string, env: Env): Promise<void> {
  await env.KV_CACHE.delete(`lock:${key}`);
}

export async function withLock<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>,
  env: Env
): Promise<T | null> {
  const acquired = await acquireLock(key, ttlSeconds, env);
  if (!acquired) {
    return null;
  }

  try {
    return await fn();
  } finally {
    await releaseLock(key, env);
  }
}
```

### 3. Cron Idempotency

**Ensure only one instance of each cron runs:**
```typescript
export async function handleCron(event: ScheduledEvent, env: Env) {
  const cronId = event.cron; // e.g., "*/5 8-18 * * 1-6"
  const runId = `cron:${cronId}:${event.scheduledTime}`;

  // Check if this exact cron run was already processed
  const alreadyRun = await env.KV_CACHE.get(runId);
  if (alreadyRun) {
    console.log(`Cron ${cronId} already ran at ${event.scheduledTime}`);
    return;
  }

  // Mark as running (with 10 min TTL in case of crash)
  await env.KV_CACHE.put(runId, 'running', { expirationTtl: 600 });

  try {
    await processCron(cronId, env);
    // Mark as completed
    await env.KV_CACHE.put(runId, 'completed', { expirationTtl: 3600 });
  } catch (error) {
    await env.KV_CACHE.put(runId, 'failed', { expirationTtl: 3600 });
    throw error;
  }
}
```

### 4. Email Message-ID Uniqueness

**Enforce unique message IDs:**
```sql
-- D1 schema
CREATE UNIQUE INDEX IF NOT EXISTS idx_emails_message_id
ON emails(message_id) WHERE message_id IS NOT NULL;
```

**Before inserting reply:**
```typescript
async function saveIncomingEmail(email: IncomingEmail, env: Env) {
  // Check for duplicate by message_id
  if (email.messageId) {
    const { results } = await env.DB.prepare(`
      SELECT id FROM emails WHERE message_id = ?
    `).bind(email.messageId).all();

    if (results.length > 0) {
      console.log(`Duplicate email ignored: ${email.messageId}`);
      return { duplicate: true };
    }
  }

  // Insert new email
  await env.DB.prepare(`
    INSERT INTO emails (id, message_id, ...)
    VALUES (?, ?, ...)
  `).bind(generateId(), email.messageId, ...).run();
}
```

### 5. Prospect Deduplication on Import

**File: `src/lib/import/deduplicator.ts`**
```typescript
export async function importProspect(
  data: ImportData,
  env: Env
): Promise<{ action: 'created' | 'updated' | 'skipped'; id: string }> {
  // Check for existing by email (most reliable)
  if (data.email) {
    const existing = await findProspectByEmail(data.email, env);
    if (existing) {
      // Update existing instead of creating duplicate
      await updateProspect(existing.id, data, env);
      return { action: 'updated', id: existing.id };
    }
  }

  // Check for existing by name + location
  const fuzzyMatch = await findProspectByNameAndLocation(
    data.name,
    data.city,
    data.country,
    env
  );
  if (fuzzyMatch && fuzzyMatch.confidence > 0.9) {
    await updateProspect(fuzzyMatch.id, data, env);
    return { action: 'updated', id: fuzzyMatch.id };
  }

  // Create new prospect
  const id = await createProspect(data, env);
  return { action: 'created', id };
}
```

### 6. Enrichment Idempotency

**Don't re-enrich if recently enriched:**
```typescript
async function shouldEnrich(prospect: Prospect, type: 'website' | 'email'): boolean {
  // Already has the data
  if (type === 'website' && prospect.website) return false;
  if (type === 'email' && prospect.contact_email) return false;

  // Recently attempted (within 24 hours)
  const lastAttempt = await getLastEnrichmentAttempt(prospect.id, type);
  if (lastAttempt && hoursSince(lastAttempt) < 24) {
    return false;
  }

  return true;
}
```

### 7. Database Upsert Pattern

**Always use upserts for idempotent writes:**
```typescript
// Bad - fails on duplicate
await env.DB.prepare(`
  INSERT INTO prospects (id, name, email) VALUES (?, ?, ?)
`).bind(id, name, email).run();

// Good - idempotent
await env.DB.prepare(`
  INSERT INTO prospects (id, name, email)
  VALUES (?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    name = excluded.name,
    email = excluded.email,
    updated_at = datetime('now')
`).bind(id, name, email).run();
```

### 8. Idempotency Keys for API Calls

**For external API calls that modify state:**
```typescript
async function chargePayment(customerId: string, amount: number) {
  const idempotencyKey = `charge:${customerId}:${amount}:${Date.now().toString().slice(0, -3)}`;

  return await stripeClient.charges.create({
    customer: customerId,
    amount: amount,
  }, {
    idempotencyKey: idempotencyKey,
  });
}
```

---

## Deduplication Windows

| Operation | Deduplication Window | Key |
|-----------|---------------------|-----|
| Email to prospect | 24 hours | `email:{prospect_id}:{date}` |
| Cron run | 5 minutes | `cron:{cron_pattern}:{timestamp}` |
| Reply processing | Forever | `reply:{message_id}` |
| Enrichment attempt | 24 hours | `enrich:{prospect_id}:{type}` |
| Import | Forever | `import:{email}` or `import:{name}:{city}` |

---

## Verification Checklist

- [ ] Email dedup check before every send
- [ ] Distributed locks on critical operations
- [ ] Cron runs tracked and deduplicated
- [ ] Message-ID uniqueness enforced
- [ ] Import deduplication working
- [ ] Upserts used for all writes
- [ ] No duplicate alerts/notifications

---

## Testing Idempotency

```typescript
describe('Idempotency', () => {
  it('should not send duplicate emails', async () => {
    const prospect = await createTestProspect();

    // First send should work
    const result1 = await sendEmail(prospect);
    expect(result1.sent).toBe(true);

    // Second send should be blocked
    const result2 = await sendEmail(prospect);
    expect(result2.skipped).toBe(true);
    expect(result2.reason).toBe('already_emailed_today');

    // Only one email in database
    const emails = await getEmailsForProspect(prospect.id);
    expect(emails.length).toBe(1);
  });

  it('should handle concurrent sends gracefully', async () => {
    const prospect = await createTestProspect();

    // Simulate concurrent sends
    const results = await Promise.all([
      sendEmail(prospect),
      sendEmail(prospect),
      sendEmail(prospect),
    ]);

    // Only one should succeed
    const sent = results.filter(r => r.sent);
    expect(sent.length).toBe(1);
  });
});
```
