# Step 02: Data Model & Source of Truth

## Goal
Establish a single source of truth for every data entity. When you have two databases (Supabase + D1), you must be explicit about which one is authoritative for each type of data.

---

## Current State

### Two Databases
1. **Supabase (PostgreSQL)** - Main CRM database
2. **Cloudflare D1 (SQLite)** - Edge database for worker

### The Problem
Both databases have the same tables. Which one is correct when they disagree?

---

## What to Verify

### 1. Source of Truth Definition
- [ ] Every table has ONE authoritative database
- [ ] The other database is a cache/replica, not a peer
- [ ] Write operations only go to the authoritative source
- [ ] Sync direction is clearly defined (one-way, not bidirectional)

### 2. Data Consistency
- [ ] No orphaned records (email without prospect)
- [ ] No duplicate records (same prospect twice)
- [ ] Timestamps are consistent (UTC everywhere)
- [ ] IDs are globally unique (UUIDs, not auto-increment)

### 3. State Machine Validity
- [ ] Prospect stages follow valid transitions
- [ ] Email statuses follow valid transitions
- [ ] No impossible states (e.g., "sent" without sent_at)

---

## Common Failure Modes

| Failure | Impact | Detection |
|---------|--------|-----------|
| Prospect updated in Supabase, D1 not synced | CF worker uses stale data, sends wrong email | Compare counts/checksums |
| Email sent, D1 updated, Supabase not synced | Dashboard shows wrong stats | Audit log mismatch |
| Race condition: two crons update same prospect | Last write wins, data lost | Concurrent modification check |
| ID collision | Wrong prospect emailed | UUID validation |
| Timezone mismatch | Emails sent at wrong time | Timestamp audit |

---

## How to Make It Robust

### 1. Define Authoritative Source for Each Entity

```
┌─────────────────────────────────────────────────────────────────┐
│                    SOURCE OF TRUTH MATRIX                        │
├─────────────────┬─────────────────┬─────────────────────────────┤
│ Entity          │ Authoritative   │ Replica                     │
├─────────────────┼─────────────────┼─────────────────────────────┤
│ Prospects       │ Supabase        │ D1 (read cache)             │
│ Campaigns       │ Supabase        │ D1 (read cache)             │
│ Mailboxes       │ Supabase        │ D1 (read cache)             │
│ Emails (sent)   │ D1              │ Supabase (async sync)       │
│ Email metrics   │ D1              │ N/A                         │
│ Failed tasks    │ D1              │ N/A                         │
│ Inbox items     │ Supabase        │ D1 (read cache)             │
│ Activities      │ Supabase        │ N/A                         │
└─────────────────┴─────────────────┴─────────────────────────────┘
```

### 2. Implement Sync Direction

**Supabase → D1 (Prospects, Campaigns, Mailboxes)**
```typescript
// Run every 10 minutes
async function syncProspectsToD1(env: Env) {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);

  // Get prospects updated since last sync
  const lastSync = await env.KV_CONFIG.get('last_prospect_sync');
  const { data: prospects } = await supabase
    .from('prospects')
    .select('*')
    .gte('updated_at', lastSync || '1970-01-01');

  // Upsert into D1
  for (const prospect of prospects || []) {
    await env.DB.prepare(`
      INSERT INTO prospects (id, name, contact_email, stage, score, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        contact_email = excluded.contact_email,
        stage = excluded.stage,
        score = excluded.score,
        updated_at = excluded.updated_at
    `).bind(
      prospect.id,
      prospect.name,
      prospect.contact_email,
      prospect.stage,
      prospect.score,
      prospect.updated_at
    ).run();
  }

  await env.KV_CONFIG.put('last_prospect_sync', new Date().toISOString());
}
```

**D1 → Supabase (Emails)**
```typescript
// Run every 5 minutes
async function syncEmailsToSupabase(env: Env) {
  // Get emails not yet synced
  const { results: emails } = await env.DB.prepare(`
    SELECT * FROM emails
    WHERE synced_to_supabase = 0
    ORDER BY created_at ASC
    LIMIT 100
  `).all();

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);

  for (const email of emails || []) {
    try {
      await supabase.from('emails').upsert({
        id: email.id,
        prospect_id: email.prospect_id,
        subject: email.subject,
        body: email.body,
        status: email.status,
        sent_at: email.sent_at,
      });

      // Mark as synced
      await env.DB.prepare(`
        UPDATE emails SET synced_to_supabase = 1 WHERE id = ?
      `).bind(email.id).run();
    } catch (error) {
      console.error(`Failed to sync email ${email.id}:`, error);
    }
  }
}
```

### 3. Add Sync Tracking Column

```sql
-- Add to D1 emails table
ALTER TABLE emails ADD COLUMN synced_to_supabase INTEGER DEFAULT 0;
CREATE INDEX idx_emails_unsynced ON emails(synced_to_supabase) WHERE synced_to_supabase = 0;

-- Add to Supabase prospects table
ALTER TABLE prospects ADD COLUMN d1_version INTEGER DEFAULT 0;
```

### 4. Implement Optimistic Locking

Prevent race conditions when updating records:

```typescript
async function updateProspect(
  prospectId: string,
  updates: Partial<Prospect>,
  expectedVersion: number
): Promise<boolean> {
  const result = await supabase
    .from('prospects')
    .update({
      ...updates,
      version: expectedVersion + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', prospectId)
    .eq('version', expectedVersion);

  if (result.count === 0) {
    // Another process updated this record
    throw new Error('Concurrent modification detected');
  }

  return true;
}
```

### 5. Define Valid State Transitions

**Prospect Stage Machine:**
```typescript
const VALID_STAGE_TRANSITIONS: Record<string, string[]> = {
  'new': ['enriching', 'enriched', 'archived'],
  'enriching': ['enriched', 'new', 'archived'],
  'enriched': ['ready', 'contacted', 'archived'],
  'ready': ['contacted', 'archived'],
  'contacted': ['engaged', 'meeting', 'lost', 'archived'],
  'engaged': ['meeting', 'lost', 'archived'],
  'meeting': ['won', 'lost', 'archived'],
  'won': ['archived'],
  'lost': ['contacted', 'archived'], // Can re-engage
  'archived': ['new'], // Can unarchive
};

function canTransition(from: string, to: string): boolean {
  return VALID_STAGE_TRANSITIONS[from]?.includes(to) || false;
}

async function updateProspectStage(id: string, newStage: string) {
  const prospect = await getProspect(id);

  if (!canTransition(prospect.stage, newStage)) {
    throw new Error(`Invalid transition: ${prospect.stage} → ${newStage}`);
  }

  await updateProspect(id, { stage: newStage });
}
```

**Email Status Machine:**
```typescript
const VALID_EMAIL_TRANSITIONS: Record<string, string[]> = {
  'pending': ['sent', 'failed'],
  'sent': ['delivered', 'bounced', 'opened'],
  'delivered': ['opened', 'clicked', 'replied', 'bounced'],
  'opened': ['clicked', 'replied'],
  'clicked': ['replied'],
  'replied': [], // Terminal
  'bounced': [], // Terminal
  'failed': ['pending'], // Can retry
};
```

### 6. Data Integrity Checks

**Run hourly:**
```typescript
async function verifyDataIntegrity(env: Env) {
  const issues: string[] = [];

  // 1. Check for orphaned emails
  const orphanedEmails = await env.DB.prepare(`
    SELECT e.id FROM emails e
    LEFT JOIN prospects p ON e.prospect_id = p.id
    WHERE p.id IS NULL
  `).all();

  if (orphanedEmails.results?.length) {
    issues.push(`Found ${orphanedEmails.results.length} orphaned emails`);
  }

  // 2. Check for duplicate prospects (same email)
  const duplicates = await env.DB.prepare(`
    SELECT contact_email, COUNT(*) as count
    FROM prospects
    WHERE contact_email IS NOT NULL
    GROUP BY LOWER(contact_email)
    HAVING count > 1
  `).all();

  if (duplicates.results?.length) {
    issues.push(`Found ${duplicates.results.length} duplicate prospect emails`);
  }

  // 3. Check for invalid states
  const invalidStates = await env.DB.prepare(`
    SELECT id, stage, status FROM emails
    WHERE status = 'sent' AND sent_at IS NULL
  `).all();

  if (invalidStates.results?.length) {
    issues.push(`Found ${invalidStates.results.length} emails marked sent without sent_at`);
  }

  // 4. Compare counts between databases
  const d1Count = await env.DB.prepare('SELECT COUNT(*) as count FROM prospects').first();
  const supabaseCount = await getSupabaseProspectCount(env);

  if (Math.abs(d1Count.count - supabaseCount) > 10) {
    issues.push(`Prospect count mismatch: D1=${d1Count.count}, Supabase=${supabaseCount}`);
  }

  if (issues.length > 0) {
    await sendAlert('Data Integrity Issues', issues.join('\n'), env);
  }

  return issues;
}
```

### 7. Timestamp Standardization

**All timestamps must be:**
- Stored in UTC
- ISO 8601 format: `2025-12-13T10:30:00Z`
- Generated consistently

```typescript
// Always use this for timestamps
function utcNow(): string {
  return new Date().toISOString();
}

// When displaying to user, convert to local
function toLocalTime(utc: string, timezone: string): string {
  return new Date(utc).toLocaleString('en-GB', { timeZone: timezone });
}
```

---

## Verification Checklist

- [ ] Source of truth documented for every entity
- [ ] Sync jobs run reliably in both directions
- [ ] Orphaned record check runs hourly
- [ ] Duplicate detection in place
- [ ] State transitions validated
- [ ] Optimistic locking on critical updates
- [ ] All timestamps in UTC

---

## Recovery Procedures

### Supabase Ahead of D1
```bash
# Force full sync from Supabase to D1
curl -X POST https://jengu-crm.workers.dev/admin/sync/full \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

### D1 Ahead of Supabase
```bash
# Force email sync from D1 to Supabase
curl -X POST https://jengu-crm.workers.dev/admin/sync/emails \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

### Data Corruption
```bash
# Export D1 to backup
wrangler d1 export jengu-crm --output=backup.sql

# Restore from Supabase (source of truth for prospects)
# Then rebuild D1 from Supabase data
```
