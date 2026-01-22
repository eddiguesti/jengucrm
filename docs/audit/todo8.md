# TODO 8: Cloudflare Workers - Complete Audit

**Priority: MEDIUM** 🟡
**Estimated Time: 2-3 hours**

---

## ☁️ A. Cloudflare Worker Deployment

### 1. Worker Status
- [ ] **Check Deployment**
  ```bash
  cd cloudflare
  npx wrangler deployments list
  ```
  - [ ] Verify latest deployment
  - [ ] Check deployment status (active)
  - [ ] Review deployment date
  - [ ] Note worker URL

- [ ] **Current Configuration**
  - [ ] Worker name: `jengu-crm`
  - [ ] Compatibility date: `2024-12-01`
  - [ ] Node.js compat enabled

### 2. Environment Variables
- [ ] **List Secrets**
  ```bash
  npx wrangler secret list
  ```

- [ ] **Required Secrets**:
  - [ ] `GROK_API_KEY` (for email generation + website finding)
  - [ ] `SUPABASE_URL`
  - [ ] `SUPABASE_SERVICE_ROLE_KEY`
  - [ ] `MILLIONVERIFIER_API_KEY` (for email verification)

- [ ] **Optional Secrets**:
  - [ ] `ANTHROPIC_API_KEY` (fallback AI)
  - [ ] `ALERT_WEBHOOK_URL` (Slack/Discord)
  - [ ] `SMTP_INBOX_1/2/3` (legacy fallback)

- [ ] **Add Missing Secrets**
  ```bash
  npx wrangler secret put SECRET_NAME
  ```

### 3. Bindings Verification
- [ ] **D1 Database**
  - [ ] Binding name: `DB`
  - [ ] Database name: `jengu-crm`
  - [ ] Database ID: `c97651e6-10a6-496f-9ca9-c599a954c535`
  - [ ] Verify database exists
  ```bash
  npx wrangler d1 info jengu-crm
  ```

- [ ] **KV Namespaces**
  - [ ] `KV_CONFIG` (id: `2e46e9da15dc4e8e9fae31e3df55c446`)
  - [ ] `KV_CACHE` (id: `f16f5b6e2511482abb881e3212a9bca8`)
  - [ ] Verify both exist

- [ ] **Durable Objects**
  - [ ] `WarmupCounter` (email limits per inbox)
  - [ ] `InboxState` (inbox health tracking)
  - [ ] `RateLimiter` (API rate limiting)
  - [ ] `ProspectDedup` (deduplication)

---

## 📊 B. D1 Database

### 1. D1 Schema Validation
- [ ] **List Tables**
  ```bash
  npx wrangler d1 execute jengu-crm --command "SELECT name FROM sqlite_master WHERE type='table';"
  ```

- [ ] **Expected Tables**:
  - [ ] `prospects`
  - [ ] `emails`
  - [ ] `mailboxes`
  - [ ] `enrichment_queue`
  - [ ] `enrichment_logs`

### 2. D1 Data Check
- [ ] **Row Counts**
  ```bash
  npx wrangler d1 execute jengu-crm --command "SELECT COUNT(*) FROM prospects;"
  npx wrangler d1 execute jengu-crm --command "SELECT COUNT(*) FROM emails;"
  ```

- [ ] **Recent Data**
  ```bash
  npx wrangler d1 execute jengu-crm --command \
    "SELECT * FROM emails ORDER BY created_at DESC LIMIT 5;"
  ```

### 3. D1 Migrations
- [ ] **Review Migrations** (`cloudflare/migrations/`)
  - [ ] All migrations applied?
  - [ ] Check migration order
  - [ ] Verify schema matches Supabase

- [ ] **Apply Missing Migrations**
  ```bash
  npx wrangler d1 migrations apply jengu-crm
  ```

---

## ⏰ C. Cron Jobs (Cloudflare)

### 1. Cron Schedule Verification
- [ ] **Review** `wrangler.toml`
  ```toml
  [triggers.crons]
  crons = [
    "*/5 8-18 * * 1-6",    # Email sending (8am-6pm Mon-Sat)
    "0 7 * * *",           # Daily pipeline (7am daily)
    "0 10 * * 1-5",        # Follow-ups (10am weekdays)
    "*/5 6,19-23 * * *"    # Enrichment (off-hours)
  ]
  ```

- [ ] **Verify Cron Syntax**
  - [ ] Email sending: Every 5 min, 8am-6pm, Mon-Sat
  - [ ] Daily pipeline: 7am daily
  - [ ] Follow-ups: 10am weekdays only
  - [ ] Enrichment: Every 5 min, 6am + 7pm-11pm

### 2. Cron Job Execution
- [ ] **Check Cron Logs**
  ```bash
  npx wrangler tail --format pretty
  ```
  - [ ] Filter for cron events
  - [ ] Check recent executions
  - [ ] Review errors

- [ ] **Manual Trigger**
  - [ ] Trigger cron via Cloudflare dashboard
  - [ ] Or via API endpoint
  - [ ] Verify execution

### 3. Cron Job Functions
- [ ] **Email Sending Cron** (`src/workers/cron.ts`)
  - [ ] Fetches eligible prospects
  - [ ] Selects mailbox
  - [ ] Sends emails
  - [ ] Updates counters
  - [ ] Respects daily limits

- [ ] **Enrichment Cron** (`src/workers/enrich.ts`)
  - [ ] Finds websites (batch of 20)
  - [ ] Finds emails (batch of 10)
  - [ ] Updates Supabase
  - [ ] Logs progress

---

## 🔍 D. Enrichment Worker

### 1. Website Finding
- [ ] **Review Logic** (`cloudflare/src/workers/enrich.ts`)
  - [ ] DuckDuckGo search query construction
  - [ ] Grok AI for URL selection
  - [ ] URL verification (HEAD/GET)
  - [ ] Success rate tracking

- [ ] **Test Website Finding**
  ```bash
  curl -X POST https://jengu-crm.[worker-url].workers.dev/enrich/websites \
    -H "Content-Type: application/json" \
    -d '{"limit": 10}'
  ```
  - [ ] Returns progress
  - [ ] Websites found
  - [ ] Database updated

- [ ] **Check Logs**
  ```bash
  npx wrangler tail --format pretty | grep "website"
  ```

### 2. Email Finding
- [ ] **Review Logic**
  - [ ] Email pattern generation
  - [ ] MillionVerifier API integration
  - [ ] Batch processing (10 at a time)
  - [ ] Error handling

- [ ] **Test Email Finding**
  ```bash
  curl -X POST https://jengu-crm.[worker-url].workers.dev/enrich/emails \
    -H "Content-Type: application/json" \
    -d '{"limit": 10}'
  ```
  - [ ] Emails found
  - [ ] Verification works
  - [ ] Database updated

### 3. Auto Enrichment
- [ ] **Combined Enrichment** (`/enrich/auto`)
  ```bash
  curl -X POST .../enrich/auto \
    -d '{"websites": 20, "emails": 10}'
  ```
  - [ ] Runs both steps
  - [ ] Returns combined stats

- [ ] **Status Endpoint** (`/enrich/status`)
  ```bash
  curl https://jengu-crm.[worker-url].workers.dev/enrich/status
  ```
  - [ ] Shows current queue
  - [ ] Recent activity
  - [ ] Success rates

---

## 📧 E. Email Sender Worker

### 1. Mailbox Loading
- [ ] **Supabase Integration** (`src/lib/supabase.ts`)
  - [ ] Fetches active mailboxes from Supabase
  - [ ] Caches mailbox config
  - [ ] Refreshes periodically

- [ ] **Test Mailbox Fetch**
  - [ ] Worker starts
  - [ ] Mailboxes loaded
  - [ ] Logged to console

### 2. Email Sending
- [ ] **SMTP Integration** (`src/lib/email-sender.ts`)
  - [ ] Connects to SMTP
  - [ ] Authenticates
  - [ ] Sends email
  - [ ] Handles errors

- [ ] **Test Email Send**
  ```bash
  curl -X POST .../api/send-email \
    -H "Content-Type: application/json" \
    -d '{
      "to": "test@example.com",
      "subject": "Test from Worker",
      "body": "Test body"
    }'
  ```

### 3. Warmup Counter (Durable Object)
- [ ] **Review** `src/durable-objects/warmup-counter.ts`
  - [ ] Tracks daily sends per mailbox
  - [ ] Enforces daily limit
  - [ ] Resets at midnight
  - [ ] Advances warmup stage weekly

- [ ] **Test Counter**
  - [ ] Send email
  - [ ] Check counter incremented
  - [ ] Hit daily limit
  - [ ] Verify sending stops

### 4. Inbox Health (Durable Object)
- [ ] **Review** `src/durable-objects/inbox-state.ts`
  - [ ] Tracks bounces
  - [ ] Calculates health score
  - [ ] Auto-pauses on low health
  - [ ] Syncs with Supabase

---

## 🔄 F. Supabase ↔ Cloudflare Sync

### 1. Data Flow
- [ ] **Supabase → Cloudflare**
  - [ ] Worker reads mailboxes from Supabase
  - [ ] Worker reads prospects from Supabase (via D1?)
  - [ ] Worker reads campaigns from Supabase

- [ ] **Cloudflare → Supabase**
  - [ ] Worker updates `sent_today` in mailboxes
  - [ ] Worker updates `health_score` in mailboxes
  - [ ] Worker updates prospect enrichment data
  - [ ] Worker logs activities

### 2. Sync Verification
- [ ] **Test Bidirectional Sync**
  - [ ] Send email via worker
  - [ ] Check Supabase mailbox stats updated
  - [ ] Update mailbox in Supabase
  - [ ] Check worker sees changes

- [ ] **Conflict Resolution**
  - [ ] What if both update same record?
  - [ ] Last write wins?
  - [ ] Version tracking?

---

## 🌐 G. API Routes (Worker)

### 1. HTTP Endpoints
- [ ] **`GET /health`**
  ```bash
  curl https://jengu-crm.[worker-url].workers.dev/health
  ```
  - [ ] Returns worker status
  - [ ] D1 connection status
  - [ ] Supabase connection status
  - [ ] Cron job status

- [ ] **`POST /enrich/websites`**
  - [ ] Batch website finding
  - [ ] Returns progress

- [ ] **`POST /enrich/emails`**
  - [ ] Batch email finding
  - [ ] Returns progress

- [ ] **`POST /enrich/auto`**
  - [ ] Combined enrichment
  - [ ] Returns summary

- [ ] **`GET /enrich/status`**
  - [ ] Queue status
  - [ ] Recent activity

### 2. Email Handling (if implemented)
- [ ] **Inbound Email Webhook**
  - [ ] Receives forwarded emails
  - [ ] Parses sender, subject, body
  - [ ] Matches to campaign lead
  - [ ] Updates status
  - [ ] Creates notification

---

## 📊 H. Monitoring & Logging

### 1. Worker Logs
- [ ] **Tail Logs**
  ```bash
  npx wrangler tail --format pretty
  ```
  - [ ] Review log output
  - [ ] Check error rates
  - [ ] Identify issues

### 2. Analytics
- [ ] **Cloudflare Dashboard**
  - [ ] Worker requests (volume)
  - [ ] Success rate
  - [ ] Errors
  - [ ] CPU time
  - [ ] Duration

- [ ] **Set Up Alerts**
  - [ ] High error rate
  - [ ] Slow responses (>1s)
  - [ ] Cron job failures

### 3. Durable Object Monitoring
- [ ] **Check DO Instances**
  - [ ] List active instances
  - [ ] Review storage usage
  - [ ] Check alarm schedules

---

## 🧪 I. End-to-End Worker Test

### Complete Flow
- [ ] **Step 1: Deploy Latest Code**
  ```bash
  cd cloudflare
  npx wrangler deploy
  ```

- [ ] **Step 2: Verify Deployment**
  ```bash
  curl https://jengu-crm.[worker-url].workers.dev/health
  ```

- [ ] **Step 3: Test Enrichment**
  ```bash
  curl -X POST .../enrich/auto -d '{"websites": 5, "emails": 3}'
  ```
  - [ ] Monitor logs
  - [ ] Check Supabase for updates

- [ ] **Step 4: Test Email Sending**
  - [ ] Trigger cron manually
  - [ ] Or use API endpoint
  - [ ] Verify email sends
  - [ ] Check database updates

- [ ] **Step 5: Check Stats**
  ```bash
  curl .../enrich/status
  ```
  - [ ] Verify counts
  - [ ] Check success rates

---

## ✅ J. Acceptance Criteria

### Worker Must:
- [ ] Deploy successfully
- [ ] Execute cron jobs on schedule
- [ ] Handle HTTP requests
- [ ] Connect to D1 and Supabase
- [ ] Send emails via SMTP
- [ ] Run enrichment (websites + emails)
- [ ] Log activity
- [ ] Handle errors gracefully

### Durable Objects Must:
- [ ] Track per-inbox daily limits
- [ ] Reset counters at midnight
- [ ] Advance warmup stages
- [ ] Monitor inbox health
- [ ] Auto-pause on issues

---

## 🚨 Known Issues to Fix

1. **Worker may not be deployed** → Deploy with wrangler
2. **Cron jobs may not be scheduled** → Verify in wrangler.toml
3. **Secrets may be missing** → Add all required secrets
4. **D1 database may be empty** → Sync from Supabase

---

## 📝 Test Results Template

```markdown
### Cloudflare Worker Test Results
**Date**: [date]
**Worker**: jengu-crm

#### Deployment
- [ ] ✅ Deployed successfully
- [ ] ✅ Health check passes
- [ ] ✅ Secrets configured
- [ ] ❌ Issue: [description]

#### Functionality
- [ ] ✅ Enrichment works
- [ ] ✅ Email sending works
- [ ] ✅ Cron jobs execute
- [ ] ✅ Supabase sync works

#### Performance
- [ ] Avg response time: [ms]
- [ ] Success rate: [%]
- [ ] Error rate: [%]

**Status**: 🟢 Working / 🟡 Issues / 🔴 Down
```

---

**Next**: After completing this, move to `todo9.md` (Analytics & Reporting)
