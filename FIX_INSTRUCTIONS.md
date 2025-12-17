# Jengu CRM - Fix Instructions

**Date**: December 17, 2025

## Overview

This document contains all the fixes needed to get your Jengu CRM fully operational.

---

## ✅ DONE: Local Code Fixes

The following fixes have been committed locally:

### 1. Disabled EMERGENCY_STOP
- **File**: `src/lib/constants.ts:60`
- **Change**: `EMERGENCY_STOP: true` → `false`
- **Impact**: Email sending will resume

### 2. Updated Daily Limits
- **File**: `src/lib/constants.ts:72-76`
- **Change**: 80/day → 60/day (3 mailboxes × 20)
- **Impact**: Limits match actual mailbox count

### 3. Increased Enrichment
- **File**: `src/app/api/cron/daily/route.ts:121`
- **Change**: `limit: 20` → `limit: 100`
- **Impact**: 5x faster enrichment (47 days → 10 days to complete backlog)

**Commit**: `c3d31f3` - "Fix: Disable EMERGENCY_STOP, update limits to 60/day..."

---

## 🚨 ACTION REQUIRED: Push to GitHub

The code changes are committed but NOT pushed to production yet.

### Manual Steps:

1. **Setup SSH key** (if not already done):
   ```bash
   # Generate SSH key
   ssh-keygen -t ed25519 -C "your_email@example.com"

   # Add to ssh-agent
   eval "$(ssh-agent -s)"
   ssh-add ~/.ssh/id_ed25519

   # Copy public key
   cat ~/.ssh/id_ed25519.pub
   # Add this to GitHub: Settings → SSH and GPG keys → New SSH key
   ```

2. **Push to production**:
   ```bash
   git push origin main
   ```

3. **Verify deployment**:
   - Vercel will auto-deploy within ~2 minutes
   - Check: https://vercel.com/your-project/deployments
   - Wait for "Ready" status

---

## 🚨 ACTION REQUIRED: Run Database Migration

The campaign tables are missing and need to be created in Supabase.

### Steps:

1. **Go to Supabase SQL Editor**:
   - URL: https://supabase.com/dashboard/project/bxcwlwglvcqujrdudxkw/sql/new
   - Or: Dashboard → SQL Editor → New Query

2. **Copy and paste this SQL**:

```sql
-- =====================================================
-- FIX: Create missing campaign tables
-- =====================================================

-- 1. Create campaign_sequences table
CREATE TABLE IF NOT EXISTS campaign_sequences (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,

    -- Step Configuration
    step_number INTEGER NOT NULL,
    delay_days INTEGER DEFAULT 0,
    delay_hours INTEGER DEFAULT 0,

    -- Email Content (A/B testing)
    variant_a_subject TEXT NOT NULL,
    variant_a_body TEXT NOT NULL,
    variant_b_subject TEXT,
    variant_b_body TEXT,
    variant_split INTEGER DEFAULT 50 CHECK (variant_split >= 0 AND variant_split <= 100),

    -- AI Generation Settings
    use_ai_generation BOOLEAN DEFAULT false,
    ai_prompt_context TEXT,

    -- Step Metrics
    sent_count INTEGER DEFAULT 0,
    variant_a_sent INTEGER DEFAULT 0,
    variant_b_sent INTEGER DEFAULT 0,
    open_count INTEGER DEFAULT 0,
    variant_a_opens INTEGER DEFAULT 0,
    variant_b_opens INTEGER DEFAULT 0,
    reply_count INTEGER DEFAULT 0,
    variant_a_replies INTEGER DEFAULT 0,
    variant_b_replies INTEGER DEFAULT 0,
    bounce_count INTEGER DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(campaign_id, step_number)
);

CREATE INDEX IF NOT EXISTS idx_sequences_campaign ON campaign_sequences(campaign_id);
CREATE INDEX IF NOT EXISTS idx_sequences_step ON campaign_sequences(campaign_id, step_number);

-- Enable RLS
ALTER TABLE campaign_sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on campaign_sequences" ON campaign_sequences FOR ALL USING (true);

-- 2. Create campaign_leads table
CREATE TABLE IF NOT EXISTS campaign_leads (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
    prospect_id UUID REFERENCES prospects(id) ON DELETE CASCADE,
    mailbox_id UUID REFERENCES mailboxes(id) ON DELETE SET NULL,

    -- Progress Tracking
    current_step INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active' CHECK (status IN (
        'active', 'paused', 'completed', 'replied', 'bounced', 'unsubscribed'
    )),

    -- A/B Assignment
    assigned_variant TEXT CHECK (assigned_variant IN ('A', 'B')),

    -- Timing
    last_email_at TIMESTAMPTZ,
    next_email_at TIMESTAMPTZ,

    -- Result Tracking
    emails_sent INTEGER DEFAULT 0,
    emails_opened INTEGER DEFAULT 0,
    has_replied BOOLEAN DEFAULT false,
    replied_at TIMESTAMPTZ,

    -- Metadata
    added_by TEXT,
    notes TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(campaign_id, prospect_id)
);

CREATE INDEX IF NOT EXISTS idx_campaign_leads_campaign ON campaign_leads(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_leads_prospect ON campaign_leads(prospect_id);
CREATE INDEX IF NOT EXISTS idx_campaign_leads_status ON campaign_leads(status);
CREATE INDEX IF NOT EXISTS idx_campaign_leads_next_email ON campaign_leads(next_email_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_campaign_leads_mailbox ON campaign_leads(mailbox_id);

-- Enable RLS
ALTER TABLE campaign_leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on campaign_leads" ON campaign_leads FOR ALL USING (true);

-- 3. Update campaigns table with missing columns
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'legacy' CHECK (type IN ('legacy', 'sequence'));
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS sequence_count INTEGER DEFAULT 1;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS leads_count INTEGER DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS active_leads INTEGER DEFAULT 0;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS completed_leads INTEGER DEFAULT 0;

-- Done!
SELECT 'Tables created successfully!' as status;
```

3. **Click "Run"**

4. **Verify success**:
   ```bash
   npx tsx scripts/run-campaign-migration.ts
   ```

   Should show:
   ```
   ✅ campaign_sequences: EXISTS
   ✅ campaign_leads: EXISTS
   ✅ campaigns: EXISTS
   ```

---

## 🚨 ACTION REQUIRED: Configure External Cron

The email sending cron MUST be configured at cron-job.org (or similar service).

### Why This is Critical:
- Without this, NO EMAILS WILL SEND
- Vercel cron only runs at 7am UTC (enrichment only)
- Email sending needs to run every 5 minutes during business hours

### Steps:

1. **Go to cron-job.org** (or your cron service)
   - URL: https://console.cron-job.org/

2. **Create job**: `/api/cron/hourly-email`
   - **URL**: `https://crm.jengu.ai/api/cron/hourly-email`
   - **Schedule**: `*/5 8-18 * * 1-5` (every 5 min, 8am-6pm, Mon-Fri)
   - **Method**: GET
   - **Header**: `Authorization: Bearer YOUR_CRON_SECRET`
   - **Timeout**: 30 seconds

3. **Create job**: `/api/cron/sales-nav-enrichment`
   - **URL**: `https://crm.jengu.ai/api/cron/sales-nav-enrichment`
   - **Schedule**: `*/15 * * * *` (every 15 minutes)
   - **Method**: GET
   - **Header**: `Authorization: Bearer YOUR_CRON_SECRET`

4. **Create job**: `/api/cron/check-replies`
   - **URL**: `https://crm.jengu.ai/api/cron/check-replies`
   - **Schedule**: `0 */4 * * *` (every 4 hours)
   - **Method**: GET
   - **Header**: `Authorization: Bearer YOUR_CRON_SECRET`

5. **Get CRON_SECRET** from Vercel:
   ```bash
   # Check .env.local for CRON_SECRET
   grep CRON_SECRET .env.local
   ```

---

## ✅ OPTIONAL: Check Cloudflare Worker

Your Cloudflare Worker should be running enrichment automatically.

### Verify:

```bash
# Check worker status
curl https://YOUR-WORKER.workers.dev/enrich/status

# Check if it's enriching
# Look for logs in Cloudflare Dashboard → Workers & Pages → jengu-crm → Logs
```

### Expected Behavior:
- Runs every 5 minutes during: 6am (1 hour) + 7pm-11pm (4 hours)
- Enriches ~20 websites + 10 emails per run
- Total: ~300 prospects/day

---

## 📊 Expected Results After Fixes

### Email Sending:
- **Before**: 0 emails/week (EMERGENCY_STOP)
- **After**: ~60 emails/day (300/week)
- **Capacity**: 3 mailboxes × 20/day each

### Enrichment:
- **Before**: 20 prospects/day (47 days to complete)
- **After**: 100/day (Vercel) + 300/day (Cloudflare) = 400/day
- **Time to complete backlog**: ~3 days

### Campaigns:
- **Before**: API Error 500 (missing tables)
- **After**: Fully functional sequences with A/B testing

---

## 🧪 Testing

After completing all steps above, test the system:

### 1. Test Email Endpoint:
```bash
curl https://crm.jengu.ai/api/cron/hourly-email
```

Expected: `{"warmup": {...}, "result": {"sent": 1, ...}}`

### 2. Test Campaigns Page:
- Go to: https://crm.jengu.ai/outreach/campaigns
- Should show 4 campaigns without errors
- Try creating a new campaign sequence

### 3. Check Stats:
```bash
curl https://crm.jengu.ai/api/stats
```

Expected:
- `emails_sent_today` should start increasing
- `prospects_by_stage.researching` should increase as enrichment runs

### 4. Monitor Logs:
- Vercel: https://vercel.com/your-project/logs
- Cloudflare: Dashboard → Workers & Pages → jengu-crm → Logs
- Local: Check terminal where `npm run dev` is running

---

## 📝 Summary Checklist

- [x] Code fixes committed locally
- [ ] Push to GitHub (needs SSH key)
- [ ] Wait for Vercel deployment
- [ ] Run SQL migration in Supabase
- [ ] Configure external cron jobs
- [ ] Test email endpoint
- [ ] Test campaigns page
- [ ] Verify enrichment is running
- [ ] Monitor for 24 hours

---

## 🆘 Troubleshooting

### If emails still not sending:
1. Check EMERGENCY_STOP in deployed code: `curl https://crm.jengu.ai/api/cron/hourly-email`
2. Check external cron is running: Look at cron-job.org execution log
3. Check mailbox status: `curl https://crm.jengu.ai/api/outreach/mailboxes`
4. Check prospects have emails: `curl https://crm.jengu.ai/api/stats`

### If campaigns page still errors:
1. Verify migration ran: `npx tsx scripts/run-campaign-migration.ts`
2. Check Supabase logs for errors
3. Refresh browser cache (Ctrl+Shift+R)

### If enrichment too slow:
1. Check Cloudflare Worker logs for errors
2. Verify API keys in Cloudflare secrets
3. Consider running manual enrichment: `npx tsx scripts/find-websites-grok.ts --limit=500`

---

## 📞 Need Help?

Check the comprehensive documentation:
- [COMPLETE_ARCHITECTURE.md](COMPLETE_ARCHITECTURE.md) - Full system architecture
- [EMAIL_SYSTEM_ANALYSIS.md](EMAIL_SYSTEM_ANALYSIS.md) - Email system deep dive
- [ENRICHMENT_ANALYSIS.md](ENRICHMENT_ANALYSIS.md) - Enrichment system details
- [CLAUDE.md](CLAUDE.md) - Project instructions and reference

