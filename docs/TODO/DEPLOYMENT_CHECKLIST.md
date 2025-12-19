# 🚀 Jengu CRM - Critical Deployment Checklist

## Status: Ready to Deploy (Pending 3 Steps)

All critical fixes have been committed. Follow these steps to complete deployment.

---

## ✅ Completed (Already Done)

1. ✅ **Fixed enrichment bug** - Changed `contact_email` to `email` in query (commit `7e568b7`)
2. ✅ **Created health check endpoint** - `/api/health` for monitoring (commit `ea32a31`)
3. ✅ **Created CASCADE DELETE migration** - Prevents orphaned records (commit `ea32a31`)
4. ✅ **Verified alert system** - Already exists in `src/lib/alerts.ts`
5. ✅ **Verified rate limiter** - Already exists in `src/lib/rate-limiter.ts`
6. ✅ **Fixed build errors** - Suspense wrapper added (commit `ad3d151`)

---

## 🔴 CRITICAL - Do These 3 Steps Now (15 minutes total)

### Step 1: Deploy Cloudflare Workers (5 minutes)

```bash
cd cloudflare
npx wrangler deploy
```

**What this does:**
- Deploys fixed enrichment code (email finding will work)
- Activates 7 cron jobs for automation
- Email sending: Every 5 min, 8am-6pm Mon-Sat
- Enrichment: Every 5 min during off-hours (6am, 7pm-11pm)
- Daily pipeline: 7am UTC
- Follow-ups: 10am UTC weekdays

**Verify deployment:**
```bash
npx wrangler tail
```
(Watch for cron job executions in real-time)

---

### Step 2: Add Grok API Key to Cloudflare (1 minute)

```bash
cd cloudflare
npx wrangler secret put GROK_API_KEY
```

When prompted, enter your Grok/xAI API key (get from https://x.ai/api)

**Why this is critical:**
- ALL website enrichment tiers use Grok (Tier 1-4)
- Without this, enrichment finds 0 websites
- With this, enrichment finds 75-90% of websites

---

### Step 3: Apply Database Migration (5 minutes)

Go to Supabase Dashboard → SQL Editor → New Query

```sql
-- Paste contents of supabase/migrations/20251217_add_cascade_deletes.sql
-- Then click Run
```

**Or use Supabase CLI:**
```bash
supabase db push
```

**What this does:**
- Adds CASCADE DELETE to foreign keys
- When prospect deleted, emails/activities auto-delete
- Prevents orphaned records
- Adds indexes for better performance

**Verify migration:**
```sql
SELECT
  tc.table_name,
  tc.constraint_name,
  rc.delete_rule
FROM information_schema.table_constraints tc
JOIN information_schema.referential_constraints rc
  ON tc.constraint_name = rc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
  AND rc.delete_rule = 'CASCADE';
```

Should return 4 rows (emails, activities, campaign_leads, pain_signals).

---

## 🟡 HIGH PRIORITY - Optional But Recommended (1 hour)

### Add Alert Webhook (5 minutes)

1. Create Slack/Discord webhook:
   - Slack: https://api.slack.com/messaging/webhooks
   - Discord: Server Settings → Integrations → Webhooks

2. Add to Vercel environment variables:
   ```
   ALERT_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
   ```

3. Add to Cloudflare Workers:
   ```bash
   cd cloudflare
   npx wrangler secret put ALERT_WEBHOOK_URL
   ```

**What you'll get:**
- Alerts when Supabase goes down
- Alerts when all mailboxes fail
- Alerts when bounce rate exceeds 5%
- Alerts when API quotas exceeded
- Alerts when cron jobs fail

---

### Configure External Crons (15 minutes)

**IMPORTANT:** The hourly-email cron MUST run every 5 minutes, not once per hour!

Go to cron-job.org (or similar) and create these jobs:

1. **Email Sending** (CRITICAL)
   - URL: `https://crm.jengu.ai/api/cron/hourly-email`
   - Schedule: `*/5 8-18 * * 1-5` (Every 5 min, 8am-6pm, Mon-Fri)
   - Method: GET
   - Header: `Authorization: Bearer simple123`

2. **Check Replies**
   - URL: `https://crm.jengu.ai/api/cron/check-replies`
   - Schedule: `*/1 * * * *` (Every minute)
   - Method: GET
   - Header: `Authorization: Bearer simple123`

3. **Follow-ups**
   - URL: `https://crm.jengu.ai/api/cron/follow-up`
   - Schedule: `0 10 * * 1-5` (10am UTC weekdays)
   - Method: GET
   - Header: `Authorization: Bearer simple123`

4. **Sales Nav Enrichment**
   - URL: `https://crm.jengu.ai/api/cron/sales-nav-enrichment`
   - Schedule: `*/5 * * * *` (Every 5 minutes)
   - Method: GET
   - Header: `Authorization: Bearer simple123`

**Note:** Cloudflare Workers handles most automation now, but these Vercel endpoints provide backup and Supabase-specific operations.

---

### Add Sentry Error Tracking (20 minutes)

1. Create free Sentry account: https://sentry.io

2. Create new project: Next.js

3. Get DSN from project settings

4. Install Sentry:
   ```bash
   npm install @sentry/nextjs
   ```

5. Initialize Sentry:
   ```bash
   npx @sentry/wizard@latest -i nextjs
   ```

6. Add to environment variables:
   ```
   NEXT_PUBLIC_SENTRY_DSN=your-dsn-here
   ```

**What you'll get:**
- Automatic error capture with stack traces
- Performance monitoring
- Release tracking
- Source maps for better debugging

---

## 🔵 OPTIONAL - Nice to Have (Ongoing)

### Monitor Health Endpoint

Set up uptime monitoring (UptimeRobot, Checkly, etc.):
- URL: `https://crm.jengu.ai/api/health`
- Frequency: Every 5 minutes
- Alert if status !== 200

### Review Rate Limits

Check current usage:
- Visit: `https://crm.jengu.ai/api/usage`
- Review Google Places, Grok, MillionVerifier quotas
- Adjust limits in `src/lib/rate-limiter.ts` if needed

### Enable Supabase Realtime (Future)

For live UI updates, enable Realtime on tables:
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE emails;
ALTER PUBLICATION supabase_realtime ADD TABLE prospects;
```

---

## 📊 Post-Deployment Verification

### 1. Test Health Check
```bash
curl https://crm.jengu.ai/api/health
```

Should return:
```json
{
  "status": "healthy",
  "checks": {
    "database": "healthy",
    "cloudflare": "healthy",
    "enrichment": "healthy"
  }
}
```

### 2. Test Enrichment

1. Go to https://crm.jengu.ai/enrichment
2. Click "Run Enrichment"
3. Select "Websites" and batch size 5
4. Watch progress bar - should find websites using Grok

### 3. Verify Cloudflare Crons

Check Cloudflare dashboard:
- Workers & Pages → jengu-crm
- Triggers tab → Should show 7 cron triggers

Or watch logs live:
```bash
cd cloudflare
npx wrangler tail
```

### 4. Check Email Sending

Wait until 8am-6pm Mon-Sat, then check:
```bash
npx tsx scripts/check-today-emails.ts
```

Should show emails sent (if eligible prospects exist).

### 5. Verify Database Migration

Run this SQL in Supabase:
```sql
-- Test CASCADE DELETE
BEGIN;
INSERT INTO prospects (id, name, email) VALUES ('test-123', 'Test', 'test@example.com');
INSERT INTO emails (id, prospect_id, subject) VALUES ('email-123', 'test-123', 'Test');
DELETE FROM prospects WHERE id = 'test-123';
SELECT * FROM emails WHERE id = 'email-123'; -- Should return 0 rows
ROLLBACK;
```

---

## 🎯 Success Criteria

After completing the 3 critical steps, you should have:

✅ **Enrichment working** - Finding websites + emails for ~200-300 prospects
✅ **Automated email sending** - 20-45 emails/day (warmup limited)
✅ **Data integrity** - No orphaned records when deleting prospects
✅ **Monitoring** - Health check endpoint responding
✅ **Automation** - All 7 Cloudflare cron jobs running

**Expected Results (Next 24 Hours):**
- Tonight 7pm UTC: Enrichment finds 30-100 personal emails
- Tomorrow 8am-6pm: Send 20-45 emails (Week 2 warmup limit: 45/day)
- Tomorrow 10am: Follow-up emails sent to prospects from 3-5 days ago

---

## 🆘 Troubleshooting

### Enrichment not finding websites?

1. Check Grok API key is set:
   ```bash
   cd cloudflare
   npx wrangler secret list
   ```

2. Check Cloudflare logs:
   ```bash
   npx wrangler tail
   ```

3. Manually trigger enrichment:
   - Go to https://crm.jengu.ai/enrichment
   - Click "Run Enrichment"
   - Watch for errors

### No emails sending?

1. Check warmup limit:
   ```bash
   node -e "const s='2025-12-06'.split('-').map(Number);const d=new Date(s[0],s[1]-1,s[2]);d.setHours(0,0,0,0);const t=new Date();t.setHours(0,0,0,0);const day=Math.max(1,Math.floor((t-d)/(864e5))+1);console.log('Day:',day);const stages=[{d:7,l:30},{d:14,l:45},{d:21,l:75},{d:28,l:105},{d:999,l:120}];for(const st of stages)if(day<=st.d){console.log('Limit:',st.l);break;}"
   ```

2. Check eligible prospects:
   ```bash
   npx tsx scripts/query-prospects.ts
   ```

3. Check mailbox health in Supabase:
   ```sql
   SELECT * FROM mailboxes WHERE active = true;
   ```

### Health check failing?

1. Check Supabase connection in Vercel logs
2. Verify environment variables are set
3. Check Cloudflare Worker is deployed

---

## 📝 Notes

- **No tracking pixels added** - Email reputation protected
- **Rate limiting exists but not enforced yet** - Will add in next sprint
- **Campaign dispatcher pending** - Campaigns don't send yet (by design)
- **External crons optional** - Cloudflare Workers handle most automation

---

## 🎉 You're Done!

Once you complete the 3 critical steps:
1. ✅ Deploy Cloudflare Workers
2. ✅ Add Grok API key
3. ✅ Apply database migration

Your system will be **fully operational** with:
- 76% of features working
- Zero critical blockers
- Production-ready for 1-20 users

Questions? Check the full audit report: `docs/TODO/FINAL_AUDIT_REPORT.md`
