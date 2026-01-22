# TODO 7: Database Integrity - Complete Audit

**Priority: HIGH** 🟡
**Estimated Time: 2-3 hours**

---

## 💾 A. Database Connection & Health

### 1. Supabase Connection
- [ ] **Test Connection**
  ```bash
  npx tsx -e "
    import { createClient } from '@supabase/supabase-js';
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    const { data, error } = await supabase.from('prospects').select('count');
    console.log('Connection:', error ? 'FAILED' : 'SUCCESS');
    console.log('Prospects:', data);
  "
  ```

- [ ] **Verify Environment Variables**
  - [ ] `NEXT_PUBLIC_SUPABASE_URL` set
  - [ ] `SUPABASE_SERVICE_ROLE_KEY` set (not anon key!)
  - [ ] Keys valid and not expired

- [ ] **Check Database Dashboard**
  - [ ] Login to Supabase dashboard
  - [ ] View database size
  - [ ] Check active connections
  - [ ] Review query performance

---

## 📊 B. Schema Validation

### 1. All Tables Exist
- [ ] **Core Tables**
  - [ ] `prospects`
  - [ ] `emails`
  - [ ] `activities`
  - [ ] `campaigns`
  - [ ] `campaign_sequences`
  - [ ] `campaign_leads`
  - [ ] `mailboxes`
  - [ ] `mailbox_daily_stats`
  - [ ] `pain_signals`
  - [ ] `mystery_shopper_queue`

- [ ] **Check Table Schemas**
  ```sql
  -- For each table
  SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
  FROM information_schema.columns
  WHERE table_name = 'prospects';
  ```

### 2. Foreign Key Relationships
- [ ] **Verify Foreign Keys**
  ```sql
  SELECT
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
  FROM information_schema.table_constraints AS tc
  JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
  JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
  WHERE tc.constraint_type = 'FOREIGN KEY';
  ```

- [ ] **Expected Relationships**:
  - [ ] `emails.prospect_id` → `prospects.id`
  - [ ] `activities.prospect_id` → `prospects.id`
  - [ ] `campaign_sequences.campaign_id` → `campaigns.id`
  - [ ] `campaign_leads.campaign_id` → `campaigns.id`
  - [ ] `campaign_leads.prospect_id` → `prospects.id`
  - [ ] `campaign_leads.mailbox_id` → `mailboxes.id`
  - [ ] `mailbox_daily_stats.mailbox_id` → `mailboxes.id`

### 3. Cascade Delete Rules
- [ ] **Check ON DELETE Actions**
  - [ ] Delete campaign → cascade to sequences ✓
  - [ ] Delete campaign → cascade to leads ✓
  - [ ] Delete prospect → SET NULL or prevent? (decide)
  - [ ] Delete mailbox → prevent if has sent emails? (decide)

- [ ] **Test Cascade Delete**
  - [ ] Create test campaign
  - [ ] Add sequence
  - [ ] Delete campaign
  - [ ] Verify sequence deleted too

---

## 🔍 C. Data Quality Checks

### 1. Missing/Null Critical Fields
- [ ] **Prospects Table**
  ```sql
  -- Company names
  SELECT COUNT(*) FROM prospects WHERE company_name IS NULL;
  -- Should be 0

  -- Locations
  SELECT COUNT(*) FROM prospects WHERE location IS NULL;
  -- Some may be null (OK if enriching)

  -- Stage
  SELECT COUNT(*) FROM prospects WHERE stage IS NULL;
  -- Should be 0 (default: 'new')
  ```

- [ ] **Emails Table**
  ```sql
  -- From address
  SELECT COUNT(*) FROM emails WHERE from_address IS NULL;
  -- Should be 0

  -- Direction
  SELECT COUNT(*) FROM emails WHERE direction IS NULL;
  -- Should be 0
  ```

- [ ] **Campaigns Table**
  ```sql
  -- Name
  SELECT COUNT(*) FROM campaigns WHERE name IS NULL;
  -- Should be 0
  ```

### 2. Duplicate Detection
- [ ] **Duplicate Prospects**
  ```sql
  -- By company + location
  SELECT company_name, location, COUNT(*) as count
  FROM prospects
  GROUP BY company_name, location
  HAVING COUNT(*) > 1
  ORDER BY count DESC;
  ```

- [ ] **Duplicate Emails**
  ```sql
  -- Same email address
  SELECT email, COUNT(*) as count
  FROM prospects
  WHERE email IS NOT NULL
  GROUP BY email
  HAVING COUNT(*) > 1;
  ```

- [ ] **Run Deduplication**
  - [ ] Create script: `scripts/dedupe-all.ts`
  - [ ] Merge duplicate prospects (keep best data)
  - [ ] Update foreign key references
  - [ ] Log changes

### 3. Orphaned Records
- [ ] **Emails without Prospects**
  ```sql
  SELECT e.id, e.to_address
  FROM emails e
  LEFT JOIN prospects p ON e.prospect_id = p.id
  WHERE e.prospect_id IS NOT NULL
    AND p.id IS NULL;
  ```

- [ ] **Campaign Leads without Prospects**
  ```sql
  SELECT cl.id
  FROM campaign_leads cl
  LEFT JOIN prospects p ON cl.prospect_id = p.id
  WHERE p.id IS NULL;
  ```

- [ ] **Activities without Prospects**
  ```sql
  SELECT a.id, a.type
  FROM activities a
  LEFT JOIN prospects p ON a.prospect_id = p.id
  WHERE a.prospect_id IS NOT NULL
    AND p.id IS NULL;
  ```

- [ ] **Cleanup Orphaned Records**
  - [ ] Delete or reassign as appropriate
  - [ ] Log cleanup actions

### 4. Invalid Data
- [ ] **Email Format Validation**
  ```sql
  SELECT email FROM prospects
  WHERE email IS NOT NULL
    AND email NOT LIKE '%@%'
    OR email LIKE '% %';
  ```

- [ ] **Invalid Enums**
  ```sql
  -- Check stage values
  SELECT DISTINCT stage FROM prospects;
  -- Should only be: new, enriched, contacted, engaged, meeting, won, lost

  -- Check tier values
  SELECT DISTINCT tier FROM prospects;
  -- Should only be: hot, warm, cold
  ```

- [ ] **Date Consistency**
  ```sql
  -- Updated at should be >= created at
  SELECT id FROM prospects
  WHERE updated_at < created_at;
  -- Should be 0
  ```

---

## 📈 D. Data Statistics

### 1. Row Counts
- [ ] **Count All Tables**
  ```sql
  SELECT
    schemaname,
    tablename,
    n_live_tup AS row_count
  FROM pg_stat_user_tables
  ORDER BY n_live_tup DESC;
  ```

- [ ] **Expected Counts** (approximate):
  - [ ] prospects: ~11,000
  - [ ] emails: ~137
  - [ ] activities: ~7,000
  - [ ] campaigns: ~5
  - [ ] mailboxes: ~3

### 2. Data Distribution
- [ ] **Prospects by Stage**
  ```sql
  SELECT stage, COUNT(*) as count
  FROM prospects
  GROUP BY stage
  ORDER BY count DESC;
  ```

- [ ] **Prospects by Tier**
  ```sql
  SELECT tier, COUNT(*) as count
  FROM prospects
  GROUP BY tier
  ORDER BY count DESC;
  ```

- [ ] **Emails by Direction**
  ```sql
  SELECT direction, COUNT(*) as count
  FROM emails
  GROUP BY direction;
  ```

- [ ] **Activities by Type**
  ```sql
  SELECT type, COUNT(*) as count
  FROM activities
  GROUP BY type
  ORDER BY count DESC
  LIMIT 20;
  ```

### 3. Growth Over Time
- [ ] **Prospects Created Per Day**
  ```sql
  SELECT
    DATE(created_at) as date,
    COUNT(*) as count
  FROM prospects
  WHERE created_at > NOW() - INTERVAL '30 days'
  GROUP BY DATE(created_at)
  ORDER BY date DESC;
  ```

- [ ] **Emails Sent Per Day**
  ```sql
  SELECT
    DATE(created_at) as date,
    direction,
    COUNT(*) as count
  FROM emails
  WHERE created_at > NOW() - INTERVAL '30 days'
  GROUP BY DATE(created_at), direction
  ORDER BY date DESC;
  ```

---

## 🔐 E. Security & Permissions

### 1. Row Level Security (RLS)
- [ ] **Check RLS Status**
  ```sql
  SELECT
    schemaname,
    tablename,
    rowsecurity
  FROM pg_tables
  WHERE schemaname = 'public';
  ```

- [ ] **RLS Policies**
  - [ ] Review who can read/write
  - [ ] Verify service role can access all
  - [ ] Check anon key restrictions (if used)

### 2. Sensitive Data Protection
- [ ] **Encrypted Fields**
  - [ ] SMTP passwords encrypted?
  - [ ] IMAP passwords encrypted?
  - [ ] API keys encrypted?

- [ ] **Access Logs**
  - [ ] Review recent database access
  - [ ] Check for suspicious queries
  - [ ] Monitor for data exfiltration attempts

---

## 🗂️ F. Indexes & Performance

### 1. Index Verification
- [ ] **List All Indexes**
  ```sql
  SELECT
    tablename,
    indexname,
    indexdef
  FROM pg_indexes
  WHERE schemaname = 'public'
  ORDER BY tablename;
  ```

- [ ] **Required Indexes**:
  - [ ] `prospects.email` (B-tree)
  - [ ] `prospects.stage` (B-tree)
  - [ ] `prospects.tier` (B-tree)
  - [ ] `prospects.created_at` (B-tree)
  - [ ] `emails.prospect_id` (B-tree)
  - [ ] `emails.created_at` (B-tree)
  - [ ] `activities.prospect_id` (B-tree)
  - [ ] `campaign_leads.campaign_id` (B-tree)
  - [ ] `campaign_leads.prospect_id` (B-tree)

### 2. Query Performance
- [ ] **Slow Queries**
  - [ ] Enable slow query log in Supabase
  - [ ] Review queries > 1s
  - [ ] Optimize with indexes or rewrites

- [ ] **Explain Plans**
  ```sql
  EXPLAIN ANALYZE
  SELECT * FROM prospects
  WHERE email IS NOT NULL
    AND stage = 'enriched';
  ```
  - [ ] Check uses indexes
  - [ ] No sequential scans on large tables

### 3. Database Size
- [ ] **Table Sizes**
  ```sql
  SELECT
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
  FROM pg_tables
  WHERE schemaname = 'public'
  ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
  ```

- [ ] **Total Database Size**
  - [ ] Check against Supabase plan limits
  - [ ] Plan for growth

---

## 🔄 G. Migrations & Version Control

### 1. Migration Files
- [ ] **Review Migrations** (`supabase/migrations/`)
  - [ ] All migrations applied?
  - [ ] Check migration order
  - [ ] Verify no conflicts

- [ ] **Recent Migrations**:
  - [ ] `20251217_add_cascade_deletes.sql`
  - [ ] `fix_campaigns_tables.sql`
  - [ ] `20251212_outreach_mailboxes.sql`

### 2. Schema Drift
- [ ] **Compare Local vs Production**
  ```bash
  npx tsx scripts/compare-local-vs-production.ts
  ```
  - [ ] Check for differences
  - [ ] Apply missing migrations

### 3. Rollback Plan
- [ ] **Backup Before Changes**
  - [ ] How to backup database?
  - [ ] How to restore from backup?
  - [ ] Test backup/restore process

---

## 🧪 H. Data Integrity Tests

### 1. Referential Integrity
- [ ] **Test Foreign Keys**
  ```sql
  -- Try to insert invalid foreign key
  INSERT INTO emails (prospect_id, from_address, to_address, direction)
  VALUES ('00000000-0000-0000-0000-000000000000', 'test@test.com', 'test2@test.com', 'outbound');
  -- Should FAIL
  ```

### 2. Constraint Validation
- [ ] **NOT NULL Constraints**
  ```sql
  -- Try to insert NULL into required field
  INSERT INTO prospects (company_name) VALUES (NULL);
  -- Should FAIL
  ```

- [ ] **UNIQUE Constraints**
  ```sql
  -- Check unique constraint on campaign strategy_key
  SELECT strategy_key, COUNT(*)
  FROM campaigns
  GROUP BY strategy_key
  HAVING COUNT(*) > 1;
  -- Should be 0
  ```

### 3. Check Constraints
- [ ] **Email Format**
  - [ ] Add check constraint if missing
  ```sql
  ALTER TABLE prospects
  ADD CONSTRAINT email_format_check
  CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$');
  ```

- [ ] **Daily Limit > 0**
  ```sql
  SELECT * FROM mailboxes WHERE daily_limit <= 0;
  -- Should be 0
  ```

---

## 📊 I. Database Monitoring

### 1. Setup Monitoring
- [ ] **Supabase Dashboard**
  - [ ] Enable database metrics
  - [ ] Set up alerts for:
    - [ ] High CPU usage
    - [ ] Slow queries
    - [ ] Connection limit
    - [ ] Disk space

### 2. Query Performance Insights
- [ ] **Review Top Queries**
  - [ ] Identify most frequent
  - [ ] Check for N+1 queries
  - [ ] Optimize slow queries

### 3. Connection Pooling
- [ ] **Verify Pooling Setup**
  - [ ] Check max connections
  - [ ] Review connection usage
  - [ ] Ensure not hitting limits

---

## ✅ J. Acceptance Criteria

### Database Must:
- [ ] All tables present with correct schema
- [ ] All foreign keys enforced
- [ ] No orphaned records (or minimal)
- [ ] < 1% duplicate rate
- [ ] All required indexes exist
- [ ] No slow queries (>1s)
- [ ] Proper RLS policies
- [ ] Sensitive data encrypted

---

## 🚨 Known Issues to Fix

1. **Potential orphaned records** → Cleanup script needed
2. **No check constraints on email format** → Add validation
3. **Some duplicates exist** → Run deduplication
4. **Cascade deletes may be missing** → Apply migration

---

## 📝 Test Results Template

```markdown
### Database Integrity Test Results
**Date**: [date]
**Database**: [production/staging]

#### Schema
- [ ] ✅ All tables exist
- [ ] ✅ All columns correct
- [ ] ✅ Foreign keys enforced
- [ ] ❌ Issue: [description]

#### Data Quality
- [ ] Duplicates: [count]
- [ ] Orphaned records: [count]
- [ ] Invalid data: [count]

#### Performance
- [ ] Slow queries: [count]
- [ ] Missing indexes: [count]
- [ ] Database size: [size]

**Status**: 🟢 Healthy / 🟡 Needs Attention / 🔴 Critical
```

---

**Next**: After completing this, move to `todo8.md` (Cloudflare Workers)
