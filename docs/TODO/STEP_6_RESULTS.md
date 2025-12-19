# STEP 6: Comprehensive Automation & Background Jobs Audit

**Audit Date:** December 17, 2025
**System:** Jengu CRM - AI-Powered Hotel Outreach
**Auditor:** Claude Code

---

## Executive Summary

The Jengu CRM system operates across **two infrastructure layers**:
- **Vercel (Next.js)** - Supabase-backed UI and manual operations
- **Cloudflare Workers** - Edge-based 24/7 automation with D1 database

**Critical Finding:** The system has a **dual-deployment architecture** with different automation schedules and databases, creating potential sync issues and complexity.

**Status:**
- ✅ Cloudflare Workers: Fully automated, comprehensive monitoring
- ⚠️ Vercel Crons: Partially disabled (email sending stopped)
- ❌ External Crons: **NOT VERIFIED** - No confirmation of cron-job.org setup

---

## 1. Complete Automation Inventory

### 1.1 Cloudflare Workers Cron Jobs (PRODUCTION)

**Deployment:** Edge workers at Cloudflare
**Database:** D1 (SQLite at edge) + Supabase sync
**Configuration:** `cloudflare/wrangler.toml`

| Cron Pattern | Frequency | Job Name | Entry Point | Purpose |
|--------------|-----------|----------|-------------|---------|
| `*/5 8-18 * * 1-6` | Every 5 min, 8am-6pm Mon-Sat | **Email Sending** | `cloudflare/src/workers/cron.ts::sendEmailBatch()` | Send outreach emails with 30% random skip |
| `0 7 * * *` | 7am daily | **Daily Pipeline** | `cloudflare/src/workers/cron.ts::runDailyPipeline()` | Reset counters, weekly cleanup on Sundays |
| `0 10 * * 1-5` | 10am weekdays | **Follow-ups** | `cloudflare/src/workers/cron.ts::sendFollowUps()` | Send follow-up nudges to contacted prospects |
| `*/5 6,19-23 * * *` | Every 5 min, 6-7am + 7pm-11pm daily | **Enrichment** | `cloudflare/src/workers/cron.ts::runEnrichmentBatch()` | Find websites + emails (100 prospects/batch) |
| `2-59/10 * * * *` | Every 10 min at :02, :12, etc. | **Sales Nav Trigger** | `cloudflare/src/workers/cron.ts::triggerSalesNavigatorEnrichment()` | Triggers Vercel endpoint for Supabase-backed enrichment |
| `0 3 * * *` | 3am daily | **Integrity & Sync** | `cloudflare/src/workers/cron.ts::runIntegrityAndSync()` | Data validation, auto-fix, D1↔Supabase sync |
| `*/1 * * * *` | Every minute | **Notifications** | `cloudflare/src/workers/cron.ts::sendPendingNotifications()` | Send pending reply notifications via Resend |

**Total Jobs:** 7 automated workflows

### 1.2 Vercel Cron Jobs (LEGACY/DISABLED)

**Deployment:** Vercel serverless functions
**Database:** Supabase (PostgreSQL)
**Configuration:** `vercel.json`

| Endpoint | Schedule | Status | Purpose |
|----------|----------|--------|---------|
| `/api/cron/daily` | `0 7 * * *` (7am UTC) | ✅ ACTIVE | Master pipeline orchestrator |
| `/api/cron/hourly-email` | External (every 5 min) | 🔴 **DISABLED** | Email sending (emergency stop active) |
| `/api/cron/check-replies` | External (every 4h) | 🔴 **DISABLED** | Reply checking (emergency stop) |
| `/api/cron/follow-up` | External (10am weekdays) | 🔴 **DISABLED** | Follow-ups (email disabled) |
| `/api/cron/sales-nav-enrichment` | External (every 15 min) | ⚠️ DELEGATED | Delegates to `/api/sales-navigator/enrichment` |
| `/api/cron/mystery-shopper` | External (every 30 min, 8am-8pm) | ✅ ACTIVE | Contact discovery via inquiries |

**Total Jobs:** 6 endpoints (3 disabled, 1 active, 1 delegated, 1 orchestrator)

### 1.3 Real-Time Event Handlers

**Cloudflare Email Routing:**
- **Handler:** `cloudflare/src/workers/email-handler.ts::handleEmail()`
- **Trigger:** Inbound email to `@jengu.me`, `@jengu.space`, `@jengu.shop`
- **Processing:**
  1. Parse email content
  2. Match to prospect in D1
  3. Analyze reply intent with AI (Grok)
  4. Update prospect stage
  5. Create notification
  6. Forward to Spacemail inbox
- **Idempotent:** Yes (checks `message_id` before processing)

### 1.4 External Cron Services (UNVERIFIED)

**⚠️ CRITICAL GAP:** No evidence of external cron service configuration found.

According to CLAUDE.md, the following should be configured at **cron-job.org**:

| Endpoint | Expected Schedule | Verification Status |
|----------|------------------|---------------------|
| `/api/cron/hourly-email` | `*/5 8-18 * * 1-5` | ❌ NOT VERIFIED |
| `/api/cron/check-replies` | `0 */4 * * *` | ❌ NOT VERIFIED |
| `/api/cron/sales-nav-enrichment` | `*/15 * * * *` | ❌ NOT VERIFIED |
| `/api/cron/follow-up` | `0 10 * * 1-5` | ❌ NOT VERIFIED |
| `/api/cron/mystery-shopper` | `*/30 8-20 * * *` | ❌ NOT VERIFIED |

**Required Setup:**
```
URL: https://crm.jengu.ai/api/cron/{endpoint}
Method: GET
Header: Authorization: Bearer {CRON_SECRET}
```

---

## 2. Detailed Job Documentation

### 2.1 Email Sending (Cloudflare)

**File:** `cloudflare/src/workers/cron.ts` (lines 163-226)
**Schedule:** `*/5 8-18 * * 1-6` (every 5 min, 8am-6pm Mon-Sat)
**Batch Size:** 1-3 emails per cycle (dynamic based on remaining quota)

**Logic:**
1. Check warmup status from Durable Object
2. Calculate remaining daily quota
3. Query D1 for eligible prospects:
   - Stage: `enriched` or `ready`
   - Has personal email (not generic like `info@`)
   - Not bounced
   - Not contacted in last 3 days
   - Sort by score DESC
4. For each prospect:
   - Run safety checks (emergency stop, blocked emails)
   - Get available SMTP inbox from Supabase
   - Check warmup allowance
   - Generate email with Grok AI
   - Run multi-layer safety validation
   - Send via SMTP
   - Record in D1 + Supabase
   - Random delay 30-90 seconds
5. 30% random skip rate for human-like pattern

**Dependencies:**
- Durable Object: `WARMUP_COUNTER` (quota tracking)
- Durable Object: `INBOX_STATE` (health monitoring)
- Supabase: `mailboxes` table
- AI: Grok API (email generation)
- External: SMTP servers

**Error Handling:**
- Try-catch per prospect (failures don't block batch)
- SMTP errors classified (hard/soft bounce)
- Bounce recording with retry logic
- Alert on failures via webhook

**Idempotency:** Partial
- No double-send protection (relies on stage updates)
- ✅ Won't send to same prospect if stage != `enriched`/`ready`
- ❌ Could send duplicate if cron runs twice before DB update

**Retry Logic:**
- Soft bounces: Retry with exponential backoff (max 3 attempts)
- Hard bounces: Permanent block
- Email generation failures: Skip prospect (no retry)

### 2.2 Daily Pipeline (Cloudflare)

**File:** `cloudflare/src/workers/cron.ts` (lines 231-251)
**Schedule:** `0 7 * * *` (7am UTC daily)

**Steps:**
1. Reset warmup counters (Durable Object POST `/daily-reset`)
2. Reset Supabase `mailbox_daily_stats`
3. Sunday only: Weekly maintenance
   - Archive stale prospects (30+ days no reply)
   - Delete old emails (90+ days)

**Dependencies:**
- Durable Object: `WARMUP_COUNTER`
- Supabase: `mailboxes`, `mailbox_daily_stats`
- D1: `prospects`, `emails`

**Error Handling:**
- Try-catch around each reset operation
- Alert on critical failures
- Continue execution even if one step fails

**Idempotency:** Yes
- Resetting counters to 0 is idempotent
- Archive/delete queries use date filters (safe to rerun)

### 2.3 Enrichment Pipeline (Cloudflare)

**File:** `cloudflare/src/workers/cron.ts` (lines 562-576)
**Schedule:** `*/5 6,19-23 * * *` (every 5 min, 6-7am + 7pm-11pm)
**Batch Size:** 100 prospects per run

**Delegate:** `cloudflare/src/workers/enrich.ts::handleEnrich()`

**Two-Phase Process:**

**Phase 1: Find Websites**
- Search DuckDuckGo via Vercel proxy (Cloudflare IPs blocked)
- Grok AI picks best result from search results
- Verify URL exists with HEAD/GET
- Success rate: ~90%

**Phase 2: Find Emails**
- Generate email patterns from `contact_name` + domain
- Patterns: `firstname.lastname@`, `firstname@`, `f.lastname@`, etc.
- Verify with MillionVerifier API
- Success rate: ~60%

**Dependencies:**
- Vercel: `/api/search` (DuckDuckGo proxy)
- AI: Grok API (website picking)
- External: MillionVerifier API (email verification)
- D1: `prospects`, `failed_tasks`

**Error Handling:**
- Failed tasks recorded in retry queue
- Exponential backoff: 5min → 30min → 2h
- Max 3 retry attempts
- Alerting on high failure rate

**Idempotency:** Yes
- Checks for existing `website` before enriching
- Checks for existing `contact_email` before finding
- Updates only if new data found

### 2.4 Integrity & Sync (Cloudflare)

**File:** `cloudflare/src/workers/cron.ts` (lines 657-756)
**Schedule:** `0 3 * * *` (3am daily)

**Phase 1: Integrity Checks**
- Orphaned emails (no prospect)
- Duplicate prospects (same email)
- Invalid state transitions
- Missing required fields

**Phase 2: Auto-Fix**
- Delete orphaned emails
- Merge duplicates (keep highest score)
- Reset invalid states

**Phase 3: Sync D1 ↔ Supabase**
- Bidirectional sync for:
  - `prospects`
  - `campaigns`
  - `emails`
- Conflict resolution: Newest timestamp wins
- Batch size: 500 records

**Phase 4: Cleanup**
- Delete resolved issues older than 30 days

**Dependencies:**
- D1: All tables
- Supabase: All tables
- KV: Sync state tracking

**Error Handling:**
- Detailed logging per phase
- Alert if >10 integrity issues found
- Alert if sync failures >5%
- Continue execution even on errors

**Idempotency:** Yes
- Checks are read-only
- Auto-fix operations are conditional
- Sync uses timestamps for conflict resolution

### 2.5 Mystery Shopper (Vercel)

**File:** `src/app/api/cron/mystery-shopper/route.ts`
**Schedule:** External cron every 30 min, 8am-8pm

**Randomization:**
- Initial delay: 0-15 minutes
- Email count: 0-3 emails (weighted distribution)
- Delay between emails: 1-10 minutes
- Average: ~50 emails/day

**Logic:**
1. Find prospects with generic emails (`info@`, `reservations@`, etc.)
2. Add up to 10 to queue
3. Send randomized number of inquiry emails
4. Clean up queue entries older than 30 days

**Dependencies:**
- Supabase: `prospects`, `mystery_shopper_queue`
- Gmail SMTP: Inquiry sending

**Error Handling:**
- Try-catch per email
- Log errors but continue
- Activity logging for audit

**Idempotency:** Yes
- Queue check prevents duplicates
- Already-sent tracked with `mystery-inquiry-sent` tag

---

## 3. Production Deployment Verification

### 3.1 Cloudflare Workers

**Deployment Status:** ✅ DEPLOYED (assumed)

**How to Verify:**
```bash
cd cloudflare
npx wrangler tail --format=pretty
# Should show live logs from production
```

**Environment Variables Required:**
- ✅ `GROK_API_KEY` - x.ai API
- ✅ `SUPABASE_URL` - Mailbox management
- ✅ `SUPABASE_SERVICE_ROLE_KEY` - Mailbox sync
- ⚠️ `MILLIONVERIFIER_API_KEY` - Email verification (optional)
- ⚠️ `ALERT_WEBHOOK_URL` - Slack/Discord alerts (optional)
- ⚠️ `RESEND_API_KEY` - Notification emails (optional)

**Cron Verification:**
```bash
# Check wrangler.toml for cron triggers
grep -A 5 "\[triggers\]" cloudflare/wrangler.toml
```

**Durable Objects:**
- ✅ `WarmupCounter` - Email quota tracking
- ✅ `InboxState` - SMTP health monitoring
- ✅ `RateLimiter` - API throttling
- ✅ `ProspectDedup` - Duplicate detection

### 3.2 Vercel Deployment

**Deployment Status:** ✅ DEPLOYED

**Managed Cron:**
```json
{
  "crons": [
    {
      "path": "/api/cron/daily",
      "schedule": "0 7 * * *"
    }
  ]
}
```

**Verification:**
- Check Vercel dashboard → Project → Cron Jobs
- Look for execution history and logs

**Environment Variables Required:**
- ✅ `NEXT_PUBLIC_SUPABASE_URL`
- ✅ `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- ✅ `SUPABASE_SERVICE_ROLE_KEY`
- ⚠️ `CRON_SECRET` - Auth for external crons
- ⚠️ `XAI_API_KEY` - Grok API (if not using Cloudflare)
- ⚠️ `GMAIL_SMTP_USER` / `GMAIL_SMTP_PASS` - Mystery shopper

### 3.3 External Cron Services

**Status:** ❌ **NOT VERIFIED**

**Required Setup at cron-job.org:**

1. **Email Sending (DISABLED):**
   ```
   URL: https://crm.jengu.ai/api/cron/hourly-email
   Schedule: */5 8-18 * * 1-5
   Header: Authorization: Bearer {CRON_SECRET}
   Status: SKIP (emergency stop active)
   ```

2. **Reply Checking (DISABLED):**
   ```
   URL: https://crm.jengu.ai/api/cron/check-replies
   Schedule: 0 */4 * * *
   Status: SKIP (emergency stop active)
   ```

3. **Sales Nav Enrichment:**
   ```
   URL: https://crm.jengu.ai/api/cron/sales-nav-enrichment
   Schedule: */15 * * * *
   Status: UNKNOWN (delegates to /api/sales-navigator/enrichment)
   ```

4. **Mystery Shopper:**
   ```
   URL: https://crm.jengu.ai/api/cron/mystery-shopper
   Schedule: */30 8-20 * * *
   Status: UNKNOWN
   ```

**Recommendation:** Configure monitoring alerts in cron-job.org to notify on failures.

---

## 4. Retry Logic & Idempotency Analysis

### 4.1 Retry Strategies

**Configuration:** `cloudflare/src/lib/retry.ts`

| Operation | Max Attempts | Initial Delay | Max Delay | Strategy |
|-----------|--------------|---------------|-----------|----------|
| Website Finding | 5 | 1 min | 32 min | Exponential (2x) |
| Email Finding | 5 | 1 min | 32 min | Exponential (2x) |
| Email Composition | 3 | 1 min | 4 min | Exponential (2x) |
| Email Sending | 2 | 5 min | 10 min | Linear |
| Reply Processing | 1 | 0 | 0 | None |
| Database Ops | 3 | 1 sec | 10 sec | Exponential (2x) |

**Retry Queue:** `cloudflare/src/lib/retry-queue.ts`

**Features:**
- Failed tasks stored in D1 `failed_tasks` table
- Exponential backoff with jitter
- Max 3 retry attempts per task
- Tasks auto-resolve after 30 days
- Manual resolution via prospect ID

**Statistics Tracking:**
```typescript
{
  total: number,
  pending: number,
  resolved: number,
  byType: Record<string, number>,
  recentFailures: Task[]
}
```

### 4.2 Idempotency Matrix

| Job | Idempotent? | Protection Mechanism | Risk if Run Twice |
|-----|-------------|---------------------|-------------------|
| Email Sending | ⚠️ PARTIAL | Stage check + last_contacted_at | Could send duplicate if run before DB update |
| Daily Pipeline | ✅ YES | Reset operations are idempotent | None - safe to rerun |
| Enrichment | ✅ YES | Checks existing data before updating | None - only adds missing data |
| Follow-ups | ⚠️ PARTIAL | last_contacted_at + email count | Could send extra follow-up |
| Integrity Checks | ✅ YES | Read-only + conditional auto-fix | None - checks are idempotent |
| Sync D1↔Supabase | ✅ YES | Timestamp-based conflict resolution | None - newest wins |
| Email Handler | ✅ YES | message_id duplicate check | None - duplicates rejected |
| Mystery Shopper | ✅ YES | Queue duplicate check + tag | None - tags prevent re-send |

**Critical Gaps:**
1. **Email sending lacks message ID deduplication** - if cron runs twice within seconds, could send duplicate emails
2. **No distributed lock** - multiple worker instances could process same batch
3. **Race condition** - prospect stage update is async (not atomic with email send)

**Recommendations:**
1. Add distributed lock using Durable Objects
2. Generate and store `message_id` BEFORE sending
3. Use database transaction for send + stage update
4. Implement send log with unique constraint

### 4.3 Soft Bounce Handling

**File:** `cloudflare/src/lib/bounce-handler.ts`

**Classification:**
- **Hard Bounce:** Invalid address, domain doesn't exist → Permanent block
- **Soft Bounce:** Mailbox full, server unavailable → Retry
- **Complaint:** Spam report → Permanent block

**Retry Logic for Soft Bounces:**
```typescript
{
  maxRetries: 3,
  delays: [24 hours, 48 hours, 72 hours],
  escalation: "After 3 failures, convert to hard bounce"
}
```

**Tracking:**
- D1 `bounces` table stores all bounce events
- Prospect `email_bounced` flag updated
- Inbox health score degraded on bounces
- Auto-pause inbox if bounce rate >5%

---

## 5. Queue Systems

### 5.1 Retry Queue (Enrichment)

**Storage:** D1 `failed_tasks` table
**Location:** `cloudflare/src/lib/retry-queue.ts`

**Task Types:**
- `find_website` - DuckDuckGo + Grok failed
- `find_email` - MillionVerifier failed
- `scrape` - Website scraping failed
- `verify` - Email verification failed

**Processing:**
- Enrichment cron checks queue before processing new prospects
- Retries pending tasks with backoff
- Mark resolved on success

**Cleanup:** Old resolved tasks deleted after 30 days

### 5.2 Mystery Shopper Queue

**Storage:** Supabase `mystery_shopper_queue` table
**Location:** `src/app/api/cron/mystery-shopper/route.ts`

**Fields:**
- `prospect_id` - Target prospect
- `status` - pending | completed | failed
- `priority` - 1 (hot) | 5 (warm) | 9 (cold)
- `created_at`, `updated_at`

**Processing:**
- Cron adds up to 10 new prospects per run
- Sends randomized number of inquiries
- Marks completed with `mystery-inquiry-sent` tag

**Cleanup:** Completed/failed entries deleted after 30 days

### 5.3 Email Send Queue

**⚠️ NO PERSISTENT QUEUE**

Current implementation uses synchronous sending with delays:
```typescript
for (const prospect of prospects) {
  await sendEmail(prospect);
  await sleep(30000 + Math.random() * 60000);
}
```

**Issues:**
- If worker crashes mid-batch, remaining emails lost
- No retry on network failures
- No priority ordering

**Recommendation:** Implement Queue API (Cloudflare) for durable email queue.

### 5.4 Notification Queue

**Storage:** D1 `notifications` table
**Location:** `cloudflare/src/workers/cron.ts::sendPendingNotifications()`

**Processing:**
- Every minute, fetch up to 5 pending notifications
- Send via Resend API
- Mark sent with timestamp
- Store errors for debugging

**Idempotent:** Yes (checks `sent = 0`)

---

## 6. Failure Scenario Testing

### 6.1 AI Provider Failure (Grok API)

**Scenario:** Grok API returns 500 error or times out

**Current Handling:**
```typescript
// cloudflare/src/lib/ai-gateway.ts
try {
  const result = await retryEmailComposition(() => callGrok(...));
  if (!result.success) {
    throw new Error('Email generation failed');
  }
} catch (error) {
  // Alert to webhook
  await alertAIProviderFailure('grok', error.message, env);
  // Return null, cron skips this prospect
  return null;
}
```

**Impact:**
- Email not sent for this prospect
- Prospect remains in `enriched` stage
- Retried on next cron cycle
- Alert sent to webhook

**Circuit Breaker:** `cloudflare/src/lib/circuit-breaker.ts`
- After 5 consecutive failures, circuit opens
- Switch to fallback (Claude API if configured)
- Auto-recover after 60 seconds

**Gaps:**
- No fallback AI provider configured by default
- No rate limit handling (429 errors)

### 6.2 Database Unavailability (D1 / Supabase)

**Scenario:** D1 database locked or Supabase unreachable

**D1 Failure:**
```typescript
// D1 uses SQLite - local to worker
// Failures are rare but possible during maintenance
try {
  await env.DB.prepare('SELECT ...').all();
} catch (error) {
  // No retry logic for D1 - worker fails
  throw error;
}
```

**Impact:**
- Worker invocation fails
- Cron retries automatically (Cloudflare built-in)
- No data loss (state in Durable Objects persists)

**Supabase Failure:**
```typescript
// Supabase mailbox fetch
const { data, error } = await supabase.from('mailboxes').select('*');
if (error) {
  // Falls back to env.SMTP_INBOX_* variables
  console.log('Supabase unavailable, using legacy config');
}
```

**Impact:**
- Graceful degradation to env variables
- Email sending continues with static config
- Mailbox health stats not updated

**Gaps:**
- No retry logic for D1 queries
- No connection pooling for Supabase
- No timeout configuration

### 6.3 SMTP Server Failure

**Scenario:** SMTP server refuses connection or times out

**Handling:**
```typescript
// cloudflare/src/lib/email-sender.ts
const result = await sendEmail({...});
if (!result.success) {
  // Classify error
  const bounceType = classifySMTPError(result.error);

  // Record bounce
  await recordBounce({ email, type: bounceType, ... });

  // Update inbox health
  await inboxState.fetch('/mark-failure', {
    method: 'POST',
    body: JSON.stringify({ inboxId, error: result.error })
  });

  // Alert if critical
  await alertEmailSendingFailure(email, result.error, inboxId, env);
}
```

**Automatic Actions:**
1. Mark inbox unhealthy (health score degraded)
2. Try different inbox on next send
3. Auto-pause inbox if bounce rate >5%
4. Alert via webhook

**Recovery:**
- Daily reset clears "sent_today" counters
- Health score recovers by +5 per clean day
- Manual resume via `/outreach/mailboxes` UI

**Gaps:**
- No automatic inbox rotation mid-batch
- No fallback to alternative SMTP provider

### 6.4 External API Failure (MillionVerifier)

**Scenario:** MillionVerifier API rate limit or downtime

**Handling:**
```typescript
// cloudflare/src/workers/enrich.ts
try {
  const result = await retryEmailFinding(() => verifyEmail(email));
  if (!result.success) {
    // Record failure in retry queue
    await recordFailure(env, 'find_email', prospectId, name, result.error);
  }
} catch (error) {
  // Skip this prospect, continue batch
  console.error('Email verification failed:', error);
}
```

**Impact:**
- Enrichment continues with remaining prospects
- Failed task added to retry queue
- Retried with exponential backoff (5min → 30min → 2h)
- Alert if failure rate >20%

**Gaps:**
- No fallback email finder (Hunter.io)
- No caching of verification results

### 6.5 Webhook/Alert Failure

**Scenario:** Slack webhook returns 404 or times out

**Handling:**
```typescript
// cloudflare/src/lib/alerting.ts
try {
  const response = await fetch(webhookUrl, {...});
  if (!response.ok) {
    logger.error('Failed to send alert', ...);
    return false;
  }
  return true;
} catch (error) {
  logger.error('Failed to send alert', error);
  return false;
}
```

**Impact:**
- Alert silently fails
- Logged to console (Cloudflare Logs)
- Main workflow continues unaffected

**Gaps:**
- No retry logic for alerts
- No secondary notification channel
- No alert failure tracking

---

## 7. Logging & Monitoring

### 7.1 Structured Logging

**Implementation:** `cloudflare/src/lib/logger.ts`

**Features:**
- JSON-structured logs
- Log levels: DEBUG, INFO, WARN, ERROR
- Context propagation (requestId, prospectId, etc.)
- Error serialization with stack traces
- Performance timing (duration tracking)

**Example Log:**
```json
{
  "level": "error",
  "message": "Email sending failed",
  "timestamp": "2025-12-17T15:30:00Z",
  "context": {
    "service": "email-sender",
    "requestId": "abc123",
    "prospectId": "xyz789",
    "inboxId": "inbox-1"
  },
  "error": {
    "name": "SMTPError",
    "message": "Connection timeout",
    "code": "ETIMEDOUT",
    "stack": "..."
  },
  "duration": 30000
}
```

**Loggers by Service:**
- `loggers.api` - HTTP API requests
- `loggers.cron` - Cron job execution
- `loggers.enrichment` - Website/email finding
- `loggers.emailSender` - SMTP operations
- `loggers.sync` - D1↔Supabase sync
- `loggers.integrity` - Data integrity checks

**Viewing Logs:**
```bash
# Real-time tail
cd cloudflare
npx wrangler tail --format=pretty

# Search logs in Cloudflare dashboard
# Workers & Pages → jengu-crm → Logs
```

### 7.2 Error Tracking

**Implementation:** `cloudflare/src/lib/errors.ts`

**Error Types:**
- `BaseError` - Base class with error codes
- `ValidationError` - Invalid input
- `NotFoundError` - Resource not found
- `ConflictError` - Duplicate/constraint violation
- `UnauthorizedError` - Auth failure
- `ExternalServiceError` - API failures
- `DatabaseError` - D1/Supabase errors

**Error Context:**
```typescript
throw new ExternalServiceError(
  'Grok API failed',
  'GROK_API_ERROR',
  { status: 500, prospectId: 'abc' }
);
```

**Centralized Handler:**
```typescript
// cloudflare/src/index.ts
catch (err) {
  const appError = wrapError(err);
  logger.error('Request failed', err, {
    path: reqCtx.path,
    errorCode: appError.code
  });
  return appError.toResponse(requestId);
}
```

**Gaps:**
- ❌ No integration with Sentry/Rollbar
- ❌ No error aggregation/grouping
- ❌ No automatic error rate alerting

### 7.3 Metrics & Monitoring

**Durable Object Stats:**

**WarmupCounter:**
```typescript
GET /status
{
  "summary": {
    "sent": 45,
    "remaining": 75,
    "dailyLimit": 120
  },
  "inboxes": [
    {
      "id": "inbox-1",
      "email": "edd@jengu.me",
      "sentToday": 15,
      "dailyLimit": 40,
      "warmupDay": 28,
      "reputationScore": 98
    }
  ]
}
```

**InboxState:**
```typescript
GET /pool
{
  "inboxes": [
    {
      "id": "inbox-1",
      "healthy": true,
      "healthScore": 98,
      "totalSends": 450,
      "totalFailures": 3,
      "avgLatencyMs": 1200
    }
  ]
}
```

**Retry Queue:**
```typescript
GET /api/failed-tasks/stats
{
  "total": 25,
  "pending": 8,
  "resolved": 17,
  "byType": {
    "find_website": 5,
    "find_email": 3
  }
}
```

**Gaps:**
- ❌ No Prometheus/Grafana integration
- ❌ No alerting on metric thresholds
- ❌ No SLO/SLA tracking
- ❌ No APM (Application Performance Monitoring)

### 7.4 Alerting System

**Implementation:** `cloudflare/src/lib/alerting.ts`

**Alert Types:**
- `email_sending_failure` - SMTP errors
- `enrichment_failure` - Website/email finding errors
- `ai_provider_failure` - Grok/Claude failures
- `database_error` - D1/Supabase errors
- `integrity_issue` - Data integrity violations
- `rate_limit_exceeded` - API throttling
- `health_check_failure` - Service degradation
- `performance_degradation` - Slow operations
- `security_warning` - Auth failures
- `system_error` - General errors

**Severity Levels:**
- `info` - Informational
- `warning` - Potential issue
- `error` - Operation failed
- `critical` - Service degraded

**Delivery:**
- Webhook URL configured via `env.ALERT_WEBHOOK_URL`
- Supports Slack, Discord, generic webhooks
- Auto-format for platform (attachments, embeds)

**Features:**
- Rate limiting (max 10 alerts/min per type)
- Deduplication (5-minute window)
- Context enrichment
- Emoji severity indicators

**Example Alert:**
```json
{
  "type": "email_sending_failure",
  "severity": "error",
  "title": "Email Sending Failed",
  "message": "Failed to send email to jo***@example.com: SMTP timeout",
  "context": {
    "inboxId": "inbox-1",
    "prospectId": "abc123"
  },
  "timestamp": "2025-12-17T15:30:00Z"
}
```

**Gaps:**
- ❌ No PagerDuty integration
- ❌ No SMS/phone alerting
- ❌ No on-call rotation
- ❌ No alert acknowledgment tracking

---

## 8. Health Checks

**Current Status:** ❌ **NOT IMPLEMENTED**

**Recommendation:** Add health check endpoints for monitoring

**Proposed Endpoints:**

```typescript
// GET /health
{
  "status": "healthy",
  "timestamp": "2025-12-17T15:30:00Z",
  "checks": {
    "database": { "status": "healthy", "latency": 12 },
    "supabase": { "status": "healthy", "latency": 45 },
    "grok": { "status": "degraded", "latency": 5000 },
    "smtp": { "status": "healthy", "healthyInboxes": 3 }
  }
}

// GET /ready (Kubernetes readiness)
{
  "ready": true
}

// GET /live (Kubernetes liveness)
{
  "alive": true
}
```

**Monitoring Integrations:**
- UptimeRobot - HTTP endpoint monitoring
- Better Uptime - Status page
- Pingdom - Global availability

---

## 9. Critical Gaps & Recommendations

### 9.1 High Priority (Fix Immediately)

1. **❌ External Cron Not Verified**
   - **Issue:** No evidence of cron-job.org configuration
   - **Impact:** Vercel endpoints may not be running
   - **Action:** Verify/configure external crons or disable endpoints
   - **Owner:** DevOps

2. **❌ Email Sending Not Idempotent**
   - **Issue:** Could send duplicate emails if cron runs twice
   - **Impact:** Poor prospect experience, spam complaints
   - **Action:** Add message ID generation + send log
   - **Owner:** Backend

3. **❌ No Distributed Lock**
   - **Issue:** Multiple workers could process same batch
   - **Impact:** Race conditions, duplicate sends
   - **Action:** Implement Durable Object lock manager
   - **Owner:** Backend

4. **❌ No Error Tracking Service**
   - **Issue:** Errors only in console logs, hard to debug
   - **Impact:** Slow incident response, missed issues
   - **Action:** Integrate Sentry or Rollbar
   - **Owner:** DevOps

### 9.2 Medium Priority (Fix This Sprint)

5. **⚠️ No Health Check Endpoints**
   - **Issue:** Can't monitor service health externally
   - **Impact:** Downtime not detected proactively
   - **Action:** Add `/health`, `/ready`, `/live`
   - **Owner:** Backend

6. **⚠️ No Persistent Email Queue**
   - **Issue:** Emails lost if worker crashes mid-batch
   - **Impact:** Prospects missed, revenue loss
   - **Action:** Implement Cloudflare Queue API
   - **Owner:** Backend

7. **⚠️ Alert Failures Silent**
   - **Issue:** Alerts fail silently, incidents missed
   - **Impact:** Critical issues not communicated
   - **Action:** Add secondary alerting channel + retry
   - **Owner:** Backend

8. **⚠️ No Metrics Dashboard**
   - **Issue:** No visibility into system performance
   - **Impact:** Can't detect degradation proactively
   - **Action:** Add Grafana + Prometheus or Datadog
   - **Owner:** DevOps

### 9.3 Low Priority (Backlog)

9. **ℹ️ Dual Database Architecture**
   - **Issue:** D1 + Supabase creates sync complexity
   - **Impact:** Data inconsistency risk
   - **Action:** Migrate fully to Supabase or D1
   - **Owner:** Architect

10. **ℹ️ No APM Integration**
    - **Issue:** Can't trace request flows end-to-end
    - **Impact:** Hard to debug performance issues
    - **Action:** Add New Relic or Datadog APM
    - **Owner:** DevOps

11. **ℹ️ Limited AI Fallback**
    - **Issue:** Grok failures block email sending
    - **Impact:** Lost opportunities when AI down
    - **Action:** Configure Claude as fallback
    - **Owner:** Backend

12. **ℹ️ No Rate Limit Handling**
    - **Issue:** 429 errors from APIs not retried properly
    - **Impact:** Enrichment failures spike during high usage
    - **Action:** Implement exponential backoff for 429s
    - **Owner:** Backend

---

## 10. Deployment Checklist

### 10.1 Cloudflare Workers

**Pre-Deploy:**
- [ ] Review `wrangler.toml` cron schedules
- [ ] Check all secrets are set (`wrangler secret list`)
- [ ] Run local tests (`npm test`)
- [ ] Review recent git commits for breaking changes

**Deploy:**
```bash
cd cloudflare
npx wrangler deploy
```

**Post-Deploy:**
- [ ] Tail logs for 5 minutes (`wrangler tail`)
- [ ] Check Durable Objects initialized (`wrangler d1 execute`)
- [ ] Verify cron jobs running (wait for next scheduled time)
- [ ] Test email sending manually
- [ ] Monitor Cloudflare dashboard for errors

### 10.2 Vercel

**Pre-Deploy:**
- [ ] Check `vercel.json` cron configuration
- [ ] Review environment variables in dashboard
- [ ] Test build locally (`npm run build`)
- [ ] Check Supabase connection

**Deploy:**
```bash
vercel --prod
# or git push (auto-deploy)
```

**Post-Deploy:**
- [ ] Check Vercel dashboard → Deployments
- [ ] View function logs
- [ ] Verify cron job in Vercel dashboard
- [ ] Test API endpoints manually
- [ ] Check Supabase for data

### 10.3 External Cron Services

**Setup at cron-job.org:**
1. Create account
2. For each endpoint:
   - Add URL: `https://crm.jengu.ai/api/cron/{name}`
   - Set schedule (see table in Section 1.4)
   - Add header: `Authorization: Bearer {CRON_SECRET}`
   - Enable failure notifications
3. Test each endpoint manually
4. Monitor execution history

**Verification:**
```bash
# Test endpoint with curl
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://crm.jengu.ai/api/cron/hourly-email

# Should return:
# { "success": true, "message": "...", ... }
```

---

## 11. Monitoring Setup Guide

### 11.1 Essential Monitoring

**Cloudflare Workers:**
1. Enable Logpush (Workers → Settings → Logpush)
2. Configure destination (Datadog, S3, etc.)
3. Set up alert rules in Cloudflare dashboard

**Vercel:**
1. Enable log drains (Settings → Log Drains)
2. Connect to log aggregator (Datadog, Logtail)
3. Set up deployment notifications (Slack, email)

**External Monitoring:**
1. UptimeRobot:
   - Monitor: `https://crm.jengu.ai/health` (once implemented)
   - Interval: 5 minutes
   - Alert: Email + Slack
2. Sentry:
   - Add SDK to Cloudflare Workers
   - Add SDK to Next.js app
   - Configure error grouping rules

### 11.2 Recommended Alerts

**Critical (Immediate Action):**
- All email inboxes unhealthy
- Database unreachable for >5 minutes
- Cron job failed 3+ times in a row
- Error rate >10% over 5 minutes

**Warning (Review Within 1 Hour):**
- AI provider circuit breaker opened
- Email bounce rate >5%
- Enrichment failure rate >20%
- Data integrity issues detected

**Info (Daily Review):**
- Daily email quota reached
- Weekly prospect archive summary
- Retry queue backlog >50 tasks

---

## 12. Incident Response Runbook

### 12.1 Email Sending Stopped

**Symptoms:**
- No emails sent for >1 hour during business hours
- Dashboard shows 0 sends

**Diagnosis:**
```bash
# 1. Check Cloudflare cron logs
npx wrangler tail --filter=sendEmailBatch

# 2. Check warmup counter
curl https://jengu-crm.workers.dev/warmup/status

# 3. Check inbox health
curl https://jengu-crm.workers.dev/inbox/pool

# 4. Check D1 prospects
npx wrangler d1 execute jengu-crm --command \
  "SELECT COUNT(*) FROM prospects WHERE stage IN ('enriched', 'ready')"
```

**Resolution:**
1. If emergency stop active → Disable in `constants.ts`
2. If no healthy inboxes → Check SMTP credentials
3. If no eligible prospects → Lower score threshold or enrich more
4. If quota reached → Increase warmup limit or wait for reset

### 12.2 Enrichment Failing

**Symptoms:**
- Retry queue growing (>100 tasks)
- Prospects stuck in `new` stage

**Diagnosis:**
```bash
# Check failed tasks
curl https://jengu-crm.workers.dev/api/failed-tasks/stats

# Check recent failures
npx wrangler tail --filter=enrichment
```

**Resolution:**
1. If MillionVerifier quota exceeded → Wait or upgrade plan
2. If DuckDuckGo blocked → Verify Vercel proxy working
3. If Grok API failing → Check API key, rate limits
4. Manual enrichment: Run `scripts/find-websites-grok.ts`

### 12.3 Database Sync Issues

**Symptoms:**
- Data integrity alert triggered
- Orphaned emails, duplicates found

**Diagnosis:**
```bash
# Run integrity check manually
curl https://jengu-crm.workers.dev/api/integrity/check

# Check sync status
curl https://jengu-crm.workers.dev/api/sync/status
```

**Resolution:**
1. Review integrity check results
2. Run auto-fix: `curl -X POST .../api/integrity/fix`
3. Manually resolve duplicates in Supabase
4. Re-run full sync if needed

---

## Appendix A: File Index

**Cloudflare Workers:**
- `cloudflare/src/index.ts` - Entry point, HTTP/cron/email handlers
- `cloudflare/src/workers/cron.ts` - Cron job orchestration
- `cloudflare/src/workers/api.ts` - HTTP API routes
- `cloudflare/src/workers/enrich.ts` - Enrichment logic
- `cloudflare/src/workers/email-handler.ts` - Inbound email processing
- `cloudflare/src/lib/email-sender.ts` - SMTP sending
- `cloudflare/src/lib/ai-gateway.ts` - AI provider routing
- `cloudflare/src/lib/retry.ts` - Retry strategies
- `cloudflare/src/lib/retry-queue.ts` - Failed task queue
- `cloudflare/src/lib/logger.ts` - Structured logging
- `cloudflare/src/lib/alerting.ts` - Alert system
- `cloudflare/src/lib/email-safety.ts` - Safety checks
- `cloudflare/src/lib/bounce-handler.ts` - Bounce handling
- `cloudflare/src/lib/data-integrity.ts` - Integrity checks
- `cloudflare/src/lib/data-sync.ts` - D1↔Supabase sync
- `cloudflare/src/durable-objects/warmup-counter.ts` - Email quota
- `cloudflare/src/durable-objects/inbox-state.ts` - SMTP health

**Vercel API:**
- `src/app/api/cron/daily/route.ts` - Master pipeline
- `src/app/api/cron/hourly-email/route.ts` - Email sending (disabled)
- `src/app/api/cron/check-replies/route.ts` - Reply checking (disabled)
- `src/app/api/cron/follow-up/route.ts` - Follow-ups (disabled)
- `src/app/api/cron/mystery-shopper/route.ts` - Contact discovery
- `src/app/api/cron/sales-nav-enrichment/route.ts` - Sales Nav delegation

**Configuration:**
- `cloudflare/wrangler.toml` - Cloudflare config + cron schedules
- `vercel.json` - Vercel cron configuration

---

## Appendix B: Environment Variables Reference

**Cloudflare Workers:**
```bash
# Required
GROK_API_KEY=                    # x.ai API key
SUPABASE_URL=                    # Supabase project URL
SUPABASE_SERVICE_ROLE_KEY=       # Supabase service key

# Optional
MILLIONVERIFIER_API_KEY=         # Email verification
ALERT_WEBHOOK_URL=               # Slack/Discord webhook
RESEND_API_KEY=                  # Notification emails
ANTHROPIC_API_KEY=               # Claude AI (fallback)
VERCEL_APP_URL=                  # For triggering Vercel endpoints
VERCEL_CRON_SECRET=              # Auth for Vercel triggers
EMAIL_FORWARD_TO=                # Default email forward address

# Legacy (fallback if Supabase not configured)
SMTP_INBOX_1=email|password|host|port|displayName
SMTP_INBOX_2=...
SMTP_INBOX_3=...
```

**Vercel:**
```bash
# Required
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Optional
CRON_SECRET=                     # Auth for external crons
XAI_API_KEY=                     # Grok API (if not using Cloudflare)
ANTHROPIC_API_KEY=               # Claude API
GMAIL_SMTP_USER=                 # Mystery shopper SMTP
GMAIL_SMTP_PASS=
GMAIL_IMAP_USER=                 # Mystery shopper IMAP
GMAIL_IMAP_PASS=
```

---

## Conclusion

The Jengu CRM automation system is **functionally comprehensive** but has **critical operational gaps**:

**Strengths:**
- ✅ Robust error handling and retry logic
- ✅ Comprehensive safety checks for email sending
- ✅ Real-time inbound email processing via Cloudflare
- ✅ Structured logging with context propagation
- ✅ Alerting system with rate limiting and deduplication

**Critical Weaknesses:**
- ❌ External cron configuration not verified
- ❌ Email sending lacks idempotency guarantees
- ❌ No distributed locking mechanism
- ❌ No error tracking service (Sentry)
- ❌ No health check endpoints
- ❌ No metrics dashboard

**Immediate Actions Required:**
1. Verify external cron setup at cron-job.org
2. Implement message ID-based deduplication for emails
3. Add distributed lock using Durable Objects
4. Set up Sentry for error tracking
5. Add `/health` endpoint with service checks
6. Configure UptimeRobot monitoring

**Overall Risk Level:** 🟡 **MEDIUM**

The system will continue operating with current setup, but production incidents will be harder to detect and debug without proper monitoring infrastructure.

---

**Report Generated:** December 17, 2025
**Next Review:** January 17, 2025 (monthly)
