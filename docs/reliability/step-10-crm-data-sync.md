# Step 10: CRM Data Sync

## ✅ IMPLEMENTED - December 2024

## Goal
Keep Supabase and D1 in sync. Data should flow reliably between systems without manual intervention, and inconsistencies should be detected and resolved automatically.

---

## Implementation Summary

### Files Created/Modified

| File | Purpose |
|------|---------|
| `cloudflare/src/lib/data-sync.ts` | Sync service (Supabase ↔ D1) |
| `cloudflare/src/lib/data-integrity.ts` | Integrity checks and auto-fix |
| `cloudflare/migrations/010_sync_tracking.sql` | Sync log and integrity tables |
| `cloudflare/src/workers/cron.ts` | Daily sync at 3am |
| `cloudflare/src/workers/api.ts` | Sync status & trigger endpoints |

### Key Features

1. **Supabase → D1 sync** - Prospects and campaigns
2. **D1 → Supabase sync** - Emails for dashboard
3. **Integrity checking** - Orphaned emails, duplicates, invalid states
4. **Auto-fix** - Resolves common issues automatically
5. **Sync logging** - Full audit trail in `sync_log` table

### API Endpoints

- `GET /api/sync/status` - View sync status and pending counts
- `POST /api/sync/prospects` - Trigger prospect sync
- `POST /api/sync/campaigns` - Trigger campaign sync
- `POST /api/sync/emails` - Trigger email sync
- `POST /api/sync/full` - Full sync all entities

### Cron Schedule

- **3am daily** - Integrity checks + full sync

---

## Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      DATA FLOW                              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   SUPABASE (Source of Truth)                               │
│   ├── prospects                                            │
│   ├── campaigns                                            │
│   ├── mailboxes                                            │
│   └── inbox_items                                          │
│            │                                               │
│            │  Sync every 10 min                            │
│            ▼                                               │
│   D1 (Edge Cache)                                          │
│   ├── prospects (read replica)                             │
│   ├── campaigns (read replica)                             │
│   └── mailboxes (read replica)                             │
│                                                             │
│   D1 (Source of Truth)                                     │
│   ├── emails (written by CF worker)                        │
│   ├── job_queue                                            │
│   └── failed_tasks                                         │
│            │                                               │
│            │  Sync every 5 min                             │
│            ▼                                               │
│   SUPABASE (Replica)                                       │
│   └── emails (for dashboard/analytics)                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## What to Verify

### 1. Sync Jobs Running
- [ ] Supabase → D1 sync runs reliably
- [ ] D1 → Supabase sync runs reliably
- [ ] Sync jobs have retry logic

### 2. Data Consistency
- [ ] Record counts match (within tolerance)
- [ ] No orphaned records
- [ ] Timestamps consistent

### 3. Conflict Resolution
- [ ] Last-write-wins policy defined
- [ ] Conflicts logged for review
- [ ] No data loss

---

## Common Failure Modes

| Failure | Impact | Detection |
|---------|--------|-----------|
| Sync job fails | Stale data in D1 | Count mismatch |
| Network timeout | Partial sync | Incomplete batch |
| Schema mismatch | Insert fails | Error logs |
| Rate limiting | Sync backs up | Queue grows |

---

## How to Make It Robust

### 1. Supabase → D1 Sync (Prospects, Campaigns, Mailboxes)

**File: `cloudflare/src/workers/sync-from-supabase.ts`**
```typescript
export async function syncFromSupabase(env: Env): Promise<SyncResult> {
  const results = {
    prospects: { synced: 0, errors: 0 },
    campaigns: { synced: 0, errors: 0 },
    mailboxes: { synced: 0, errors: 0 },
  };

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

  // Get last sync timestamp
  const lastSync = await env.KV_CONFIG.get('last_supabase_sync') || '1970-01-01';

  // Sync prospects
  try {
    const { data: prospects } = await supabase
      .from('prospects')
      .select('*')
      .gte('updated_at', lastSync)
      .order('updated_at', { ascending: true })
      .limit(500);

    for (const prospect of prospects || []) {
      try {
        await upsertProspectToD1(prospect, env);
        results.prospects.synced++;
      } catch (error) {
        console.error(`Failed to sync prospect ${prospect.id}:`, error);
        results.prospects.errors++;
      }
    }
  } catch (error) {
    console.error('Prospect sync failed:', error);
  }

  // Sync campaigns
  try {
    const { data: campaigns } = await supabase
      .from('campaigns')
      .select('*')
      .gte('updated_at', lastSync);

    for (const campaign of campaigns || []) {
      try {
        await upsertCampaignToD1(campaign, env);
        results.campaigns.synced++;
      } catch (error) {
        results.campaigns.errors++;
      }
    }
  } catch (error) {
    console.error('Campaign sync failed:', error);
  }

  // Sync mailboxes
  try {
    const { data: mailboxes } = await supabase
      .from('mailboxes')
      .select('*')
      .gte('updated_at', lastSync);

    for (const mailbox of mailboxes || []) {
      try {
        await upsertMailboxToD1(mailbox, env);
        results.mailboxes.synced++;
      } catch (error) {
        results.mailboxes.errors++;
      }
    }
  } catch (error) {
    console.error('Mailbox sync failed:', error);
  }

  // Update last sync timestamp
  await env.KV_CONFIG.put('last_supabase_sync', new Date().toISOString());

  return results;
}

async function upsertProspectToD1(prospect: any, env: Env): Promise<void> {
  await env.DB.prepare(`
    INSERT INTO prospects (
      id, name, city, country, contact_name, contact_email, contact_title,
      phone, website, linkedin_url, stage, tier, score, lead_source,
      email_bounced, archived, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      city = excluded.city,
      country = excluded.country,
      contact_name = excluded.contact_name,
      contact_email = excluded.contact_email,
      contact_title = excluded.contact_title,
      phone = excluded.phone,
      website = excluded.website,
      linkedin_url = excluded.linkedin_url,
      stage = excluded.stage,
      tier = excluded.tier,
      score = excluded.score,
      lead_source = excluded.lead_source,
      email_bounced = excluded.email_bounced,
      archived = excluded.archived,
      updated_at = excluded.updated_at
  `).bind(
    prospect.id,
    prospect.name,
    prospect.city,
    prospect.country,
    prospect.contact_name,
    prospect.contact_email,
    prospect.contact_title,
    prospect.phone,
    prospect.website,
    prospect.linkedin_url,
    prospect.stage,
    prospect.tier,
    prospect.score,
    prospect.lead_source,
    prospect.email_bounced ? 1 : 0,
    prospect.archived ? 1 : 0,
    prospect.created_at,
    prospect.updated_at
  ).run();
}
```

### 2. D1 → Supabase Sync (Emails)

**File: `cloudflare/src/workers/sync-to-supabase.ts`**
```typescript
export async function syncToSupabase(env: Env): Promise<SyncResult> {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

  // Get unsynced emails
  const { results: emails } = await env.DB.prepare(`
    SELECT * FROM emails
    WHERE synced_to_supabase = 0
    ORDER BY created_at ASC
    LIMIT 100
  `).all();

  let synced = 0;
  let errors = 0;

  for (const email of emails || []) {
    try {
      // Upsert to Supabase
      const { error } = await supabase
        .from('emails')
        .upsert({
          id: email.id,
          prospect_id: email.prospect_id,
          campaign_id: email.campaign_id,
          subject: email.subject,
          body: email.body,
          to_email: email.to_email,
          from_email: email.from_email,
          message_id: email.message_id,
          direction: email.direction,
          status: email.status,
          sent_at: email.sent_at,
          opened_at: email.opened_at,
          clicked_at: email.clicked_at,
          replied_at: email.replied_at,
          bounced_at: email.bounced_at,
          created_at: email.created_at,
        });

      if (error) throw error;

      // Mark as synced in D1
      await env.DB.prepare(`
        UPDATE emails SET synced_to_supabase = 1 WHERE id = ?
      `).bind(email.id).run();

      synced++;
    } catch (error) {
      console.error(`Failed to sync email ${email.id}:`, error);
      errors++;
    }
  }

  return { synced, errors, pending: (emails?.length || 0) - synced };
}
```

### 3. Sync Status Tracking

```typescript
interface SyncStatus {
  lastSyncAt: string;
  direction: 'supabase_to_d1' | 'd1_to_supabase';
  recordsSynced: number;
  errors: number;
  pendingCount: number;
  healthy: boolean;
}

async function getSyncStatus(env: Env): Promise<{
  supabaseToD1: SyncStatus;
  d1ToSupabase: SyncStatus;
}> {
  const lastSupabaseSync = await env.KV_CONFIG.get('last_supabase_sync');
  const lastD1Sync = await env.KV_CONFIG.get('last_d1_sync');

  // Check pending email syncs
  const { results: pendingEmails } = await env.DB.prepare(`
    SELECT COUNT(*) as count FROM emails WHERE synced_to_supabase = 0
  `).all();

  // Check if sync is healthy (within last 15 minutes)
  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();

  return {
    supabaseToD1: {
      lastSyncAt: lastSupabaseSync || 'never',
      direction: 'supabase_to_d1',
      recordsSynced: 0, // Would need to track this
      errors: 0,
      pendingCount: 0,
      healthy: lastSupabaseSync > fifteenMinutesAgo,
    },
    d1ToSupabase: {
      lastSyncAt: lastD1Sync || 'never',
      direction: 'd1_to_supabase',
      recordsSynced: 0,
      errors: 0,
      pendingCount: pendingEmails?.[0]?.count || 0,
      healthy: (pendingEmails?.[0]?.count || 0) < 100,
    },
  };
}
```

### 4. Data Consistency Checker

**Run hourly:**
```typescript
async function verifyDataConsistency(env: Env): Promise<ConsistencyReport> {
  const issues: string[] = [];
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

  // 1. Check prospect counts
  const { count: supabaseProspects } = await supabase
    .from('prospects')
    .select('*', { count: 'exact', head: true });

  const { results: d1Prospects } = await env.DB.prepare(`
    SELECT COUNT(*) as count FROM prospects
  `).all();

  const prospectDiff = Math.abs((supabaseProspects || 0) - (d1Prospects?.[0]?.count || 0));
  if (prospectDiff > 50) {
    issues.push(`Prospect count mismatch: Supabase=${supabaseProspects}, D1=${d1Prospects?.[0]?.count}`);
  }

  // 2. Check for orphaned emails (email with no prospect)
  const { results: orphanedEmails } = await env.DB.prepare(`
    SELECT COUNT(*) as count FROM emails e
    LEFT JOIN prospects p ON e.prospect_id = p.id
    WHERE p.id IS NULL AND e.direction = 'outbound'
  `).all();

  if ((orphanedEmails?.[0]?.count || 0) > 0) {
    issues.push(`Found ${orphanedEmails[0].count} orphaned emails`);
  }

  // 3. Check sync queue health
  const { results: syncBacklog } = await env.DB.prepare(`
    SELECT COUNT(*) as count FROM emails
    WHERE synced_to_supabase = 0
    AND created_at < datetime('now', '-1 hour')
  `).all();

  if ((syncBacklog?.[0]?.count || 0) > 100) {
    issues.push(`Sync backlog: ${syncBacklog[0].count} emails older than 1 hour not synced`);
  }

  // 4. Check for duplicate emails
  const { results: duplicateEmails } = await env.DB.prepare(`
    SELECT message_id, COUNT(*) as count
    FROM emails
    WHERE message_id IS NOT NULL
    GROUP BY message_id
    HAVING count > 1
  `).all();

  if (duplicateEmails?.length) {
    issues.push(`Found ${duplicateEmails.length} duplicate message IDs`);
  }

  // Alert if issues found
  if (issues.length > 0) {
    await sendAlert('Data Consistency Issues', issues.join('\n'), env);
  }

  return {
    healthy: issues.length === 0,
    issues,
    checkedAt: new Date().toISOString(),
    counts: {
      supabaseProspects,
      d1Prospects: d1Prospects?.[0]?.count,
      pendingSync: syncBacklog?.[0]?.count,
    },
  };
}
```

### 5. Conflict Resolution

```typescript
// When same record updated in both places, use last-write-wins
async function resolveConflict(
  d1Record: any,
  supabaseRecord: any,
  table: string
): Promise<'d1' | 'supabase'> {
  const d1Updated = new Date(d1Record.updated_at).getTime();
  const supabaseUpdated = new Date(supabaseRecord.updated_at).getTime();

  // Log conflict for audit
  console.warn(`Conflict detected in ${table}:`, {
    id: d1Record.id,
    d1Updated: d1Record.updated_at,
    supabaseUpdated: supabaseRecord.updated_at,
  });

  // Last write wins
  return d1Updated > supabaseUpdated ? 'd1' : 'supabase';
}
```

### 6. Full Resync Command

```typescript
// For manual recovery - full resync from Supabase
async function fullResyncFromSupabase(env: Env): Promise<void> {
  console.log('Starting full resync from Supabase...');

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

  // Clear D1 prospects (they're a cache)
  await env.DB.prepare('DELETE FROM prospects').run();

  // Fetch all prospects from Supabase
  let offset = 0;
  const batchSize = 1000;

  while (true) {
    const { data: prospects } = await supabase
      .from('prospects')
      .select('*')
      .range(offset, offset + batchSize - 1);

    if (!prospects?.length) break;

    for (const prospect of prospects) {
      await upsertProspectToD1(prospect, env);
    }

    console.log(`Synced ${offset + prospects.length} prospects`);
    offset += batchSize;
  }

  await env.KV_CONFIG.put('last_full_resync', new Date().toISOString());
  console.log('Full resync complete');
}
```

### 7. Sync Cron Schedule

```typescript
// In wrangler.toml
// crons = ["*/10 * * * *"]  // Every 10 minutes

export async function handleSyncCron(env: Env): Promise<void> {
  const minute = new Date().getMinutes();

  // Supabase → D1: Run at 0, 10, 20, 30, 40, 50
  if (minute % 10 === 0) {
    await syncFromSupabase(env);
  }

  // D1 → Supabase: Run at 5, 15, 25, 35, 45, 55
  if (minute % 10 === 5) {
    await syncToSupabase(env);
  }

  // Consistency check: Run at 0 (hourly)
  if (minute === 0) {
    await verifyDataConsistency(env);
  }
}
```

---

## Sync Dashboard

Show:
- Last sync times (both directions)
- Pending sync count
- Consistency check results
- Manual resync button

---

## Verification Checklist

- [x] Supabase → D1 sync running (daily at 3am via `runIntegrityAndSync`)
- [x] D1 → Supabase sync running (daily at 3am via `runFullSync`)
- [x] Consistency checker running (daily at 3am via `runIntegrityChecks`)
- [x] Sync backlog tracked (`/api/sync/status` shows `unsyncedEmails`)
- [x] Orphaned records detected and auto-fixed
- [x] Full resync command available (`POST /api/sync/full`)

---

## Recovery Procedures

### Sync Stuck
```sql
-- Check sync backlog
SELECT COUNT(*) FROM emails WHERE synced_to_supabase = 0;

-- Force resync
UPDATE emails SET synced_to_supabase = 0 WHERE synced_to_supabase = 1;
```

### Data Mismatch
```bash
# Full resync from Supabase
curl -X POST https://jengu-crm.workers.dev/admin/resync \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```
