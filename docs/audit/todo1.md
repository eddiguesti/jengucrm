# TODO 1: Email System & Cron Jobs - COMPREHENSIVE CODE AUDIT

**Priority: CRITICAL** 🔴
**Estimated Time: 4-6 hours** (increased due to depth of analysis)

---

## 📋 OVERVIEW

This audit covers the **entire email sending pipeline** from cron triggers to SMTP delivery. We'll examine every file, every function, every edge case.

### Critical Files to Audit

1. `src/app/api/cron/hourly-email/route.ts` - Main email cron (MISSING FROM EXTERNAL CRON!)
2. `src/app/api/auto-email/route.ts` - Core email sending logic (597 lines - complex!)
3. `src/lib/email/send.ts` - SMTP & Azure Graph integration (469 lines)
4. `src/services/email.service.ts` - Email business logic layer
5. `src/lib/constants.ts` - Warmup configuration & filters
6. `src/app/api/cron/follow-up/route.ts` - Follow-up automation (DISABLED!)
7. `src/app/api/cron/check-replies/route.ts` - Reply detection (DISABLED!)
8. `vercel.json` - Cron configuration (ONLY 1 CRON CONFIGURED!)

---

## 🚨 CRITICAL ISSUES FOUND (Fix Immediately)

### 1. **External Cron NOT Configured** (BLOCKER)
**File**: N/A (missing configuration)
**Issue**: `/api/cron/hourly-email` endpoint exists but is NOT being called every 5 minutes
**Impact**: NO EMAILS ARE BEING SENT (system completely inactive)

**Evidence**:
- `src/app/api/cron/hourly-email/route.ts:14-23` contains comment: "Setup: External cron service (cron-job.org)"
- Last email sent: December 10, 2025 (27 days ago)
- No activities logged in last 24 hours

**Required Fix**:
```bash
# Configure at cron-job.org:
URL: https://crm.jengu.ai/api/cron/hourly-email
Method: GET
Schedule: */5 8-18 * * 1-5  # Every 5 min, 8am-6pm Mon-Fri
Header: Authorization: Bearer {CRON_SECRET from env}
Timezone: UTC
```

**Verification**:
```bash
# Test manually first:
curl -X GET https://crm.jengu.ai/api/cron/hourly-email \
  -H "Authorization: Bearer $CRON_SECRET"

# Should return:
{
  "success": true,
  "message": "Email sent to 1 prospect",
  "warmup": { "day": 32, "stage": "Mature (day 22+)", "daily_limit": 60 }
}
```

---

### 2. **Follow-Up Cron Disabled** (FEATURE BROKEN)
**File**: `src/app/api/cron/follow-up/route.ts:19`
**Issue**: Function always returns "disabled" without checking database
**Impact**: No automated follow-ups sent (prospects go cold)

**Current Code** (Lines 18-25):
```typescript
try {
  console.log('[Follow-up Cron] Email sending disabled - skipping follow-ups...');

  return NextResponse.json({
    success: true,
    message: 'Follow-up emails disabled - email sending disabled',
    disabled: true,
  });
}
```

**🐛 BUG**: Hardcoded to disabled state - no actual logic!

**Required Fix**: Implement proper follow-up logic:
```typescript
// 1. Find prospects contacted 3+ days ago with no reply
// 2. Check if they have follow-up sequence steps available
// 3. Send follow-up email with appropriate template
// 4. Update lead's current_step and last_email_at
```

**Reference Implementation**: See TODO 3 for campaign sequence logic

---

### 3. **Reply Checking Disabled** (FEATURE BROKEN)
**File**: `src/app/api/cron/check-replies/route.ts:16-23`
**Issue**: Always returns "EMERGENCY STOP" without checking inbox
**Impact**: Replies are never detected, prospects stay in "contacted" stage

**Current Code** (Lines 16-23):
```typescript
try {
  // EMERGENCY STOP - All email operations disabled
  return NextResponse.json({
    success: true,
    message: "EMERGENCY STOP - Reply checking disabled",
    disabled: true,
    emergency_stop: true,
  });
}
```

**🐛 BUG**: No IMAP connection, no reply detection logic!

**Required Fix**: Implement IMAP checking:
```typescript
// 1. Connect to each mailbox via IMAP (lib/email/imap.ts exists!)
// 2. Fetch unread emails from INBOX
// 3. Match replies to sent emails (by thread/subject/to address)
// 4. Update prospect stage to "engaged"
// 5. Create notification for user
// 6. Mark email as read in IMAP
```

---

### 4. **Vercel Cron Missing Critical Jobs**
**File**: `vercel.json:3-8`
**Issue**: Only 1 cron job configured (daily pipeline)

**Current Config**:
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

**❌ MISSING**:
- `/api/cron/hourly-email` (use external cron instead - Vercel crons limited to 1/hour minimum)
- `/api/cron/check-replies` (should be every 5 min)
- `/api/cron/follow-up` (should be 10am UTC weekdays)

**Why External Cron Needed**:
Vercel crons have **1-hour minimum interval**. We need emails sent every 5-15 minutes for human-like behavior. External cron (cron-job.org) allows `*/5` minute intervals.

---

## 📧 A. Email Sending Deep Dive

### A1. Warmup System Analysis

**File**: `src/lib/constants.ts:68-140`

**Configuration** (Lines 68-83):
```typescript
export const WARMUP_SCHEDULE = {
  START_DATE: "2025-12-06",  // ⚠️ HARDCODED - should be dynamic per inbox!
  STAGES: [
    { maxDay: 7, limit: 15 },   // Week 1: 5/inbox × 3 = 15/day total
    { maxDay: 14, limit: 30 },  // Week 2: 10/inbox × 3 = 30/day total
    { maxDay: 21, limit: 45 },  // Week 3: 15/inbox × 3 = 45/day total
    { maxDay: 28, limit: 60 },  // Week 4: 20/inbox × 3 = 60/day total
    { maxDay: Infinity, limit: 60 },  // Week 5+: 20/inbox × 3 = 60/day max
  ],
  ABSOLUTE_MAX: 60,
  PER_INBOX_LIMIT: 20,
};
```

**🐛 BUGS & IMPROVEMENTS**:

1. **Hardcoded Start Date** (Line 70)
   - **Problem**: All inboxes share same warmup schedule
   - **Fix**: Move to database per-mailbox tracking:
   ```sql
   ALTER TABLE mailboxes ADD COLUMN warmup_start_date DATE;
   ALTER TABLE mailboxes ADD COLUMN warmup_stage INTEGER DEFAULT 1;
   ```

2. **No Inbox-Level Tracking**
   - **Problem**: `getDaysSinceWarmupStart()` (Line 88-104) calculates globally
   - **Fix**: Calculate per inbox based on `mailboxes.warmup_start_date`

3. **Timezone Handling** (Line 89-103)
   - **Current**: Uses local timezone parsing
   - **Issue**: Breaks if server timezone changes
   - **Fix**: Always store/calculate in UTC:
   ```typescript
   const startDate = new Date(`${WARMUP_SCHEDULE.START_DATE}T00:00:00Z`);
   ```

**Test Cases**:
```bash
# Test warmup calculation
node -e "
  const { getWarmupStatus } = require('./src/lib/constants.ts');
  console.log(getWarmupStatus());
  // Expected: { day: 32, limit: 60, stage: 'Mature (day 22+)' }
"

# Test different scenarios:
# - Day 1: Should return limit: 15
# - Day 7: Should return limit: 15 (not 30!)
# - Day 8: Should return limit: 30
# - Day 35: Should return limit: 60 (absolute max)
```

---

### A2. Email Filtering Logic (Critical for Deliverability)

**File**: `src/app/api/auto-email/route.ts:310-330`

**Filter Pipeline** (Lines 310-330):
```typescript
const eligibleProspects = prospects.filter((p) => {
  if (emailedIds.has(p.id)) return false;  // ✅ Already contacted
  if (!p.email) return false;  // ✅ Missing email

  // ⚠️ REGEX FILTERS - Performance concern for large datasets
  if (FAKE_EMAIL_PATTERNS.some((pattern) => pattern.test(p.email!)))
    return false;
  if (GENERIC_CORPORATE_EMAILS.some((pattern) => pattern.test(p.email!)))
    return false;
  if (GENERIC_EMAIL_PREFIXES.some((pattern) => pattern.test(p.email!)))
    return false;

  // ✅ Timezone-aware sending (9am-5pm local time)
  if (timezoneAwareSending && p.country && !isBusinessHours(p.country)) {
    logger.debug({ prospect: p.name, country: p.country, localHour },
      'Skipped: outside business hours');
    return false;
  }

  return true;
});
```

**Performance Issue**:
- **50 regex patterns** checked per prospect (Lines 313-319)
- **On 500 prospects**: 25,000 regex evaluations!
- **Solution**: Pre-compile regexes, cache results, or use database-level filtering

**Improvement**: Add prospect-level `email_validation_status` field:
```sql
ALTER TABLE prospects ADD COLUMN email_valid BOOLEAN DEFAULT NULL;
ALTER TABLE prospects ADD COLUMN email_invalid_reason TEXT;

-- Index for fast filtering:
CREATE INDEX idx_prospects_email_valid ON prospects(email_valid)
  WHERE email_valid = true;
```

**Then filter in SQL** (much faster):
```typescript
.eq('email_valid', true)  // Database index scan instead of regex
```

---

### A3. Email Generation (AI Gateway)

**File**: `src/app/api/auto-email/route.ts:57-116`

**AI Generation Logic** (Lines 69-98):
```typescript
const prospectContext = {
  name: prospect.name,
  city: prospect.city,
  country: prospect.country,
  propertyType: prospect.property_type,
  jobTitle: prospect.source_job_title,
  contactName: prospect.contact_name,
};

const prompt = strategy.generatePrompt(prospectContext);

const result = await aiGateway.generateJSON<{
  subject: string;
  body: string;
}>({
  prompt,
  maxTokens: 500,
  cacheTTL: 0,  // ⚠️ NO CACHING - expensive!
  cacheKey,
  context: `email-gen:${prospect.name}`,
});
```

**🐛 ISSUES**:

1. **No Caching** (Line 95)
   - **Current**: `cacheTTL: 0` disables caching
   - **Impact**: Every email = new AI call ($$$)
   - **Fix**: Cache similar prompts for 1 hour:
   ```typescript
   cacheTTL: 3600, // 1 hour
   cacheKey: `email:${campaign.strategy_key}:${prospect.tier}:${prospect.propertyType}`,
   ```

2. **No Retry Logic**
   - **Current**: Single AI call, fails if API down
   - **Fix**: Add retry with exponential backoff (see `lib/retry.ts`)

3. **No Timeout**
   - **Current**: Can hang indefinitely
   - **Fix**: Add 30s timeout (constants.ts:18)

4. **No Rate Limiting**
   - **Current**: Can exceed AI API limits
   - **Fix**: Add rate limiter from `lib/rate-limiter.ts`

**Test Cases**:
```bash
# Test email generation
curl -X POST https://crm.jengu.ai/api/generate-email \
  -H "Content-Type: application/json" \
  -d '{
    "prospect_id": "xxx",
    "campaign_id": "yyy"
  }'

# Edge cases to test:
# - Missing prospect fields (null city, country, etc.)
# - Very long company names (>100 chars)
# - Special characters in names (José, François, etc.)
# - Empty pain points array
# - AI API returns invalid JSON
# - AI API timeout (simulate with network delay)
```

---

### A4. SMTP Sending with Rotation

**File**: `src/lib/email/send.ts:92-175`

**SMTP Send Function** (Simplified):
```typescript
async function sendViaSmtp(inbox: SmtpInbox, options: SendEmailOptions) {
  const transporter = nodemailer.createTransport({
    host: inbox.host,
    port: inbox.port,
    secure: inbox.secure,  // ⚠️ SSL/TLS handling
    auth: {
      user: inbox.email,
      pass: inbox.password,  // ⚠️ Plain text in memory!
    },
  });

  // ✅ Good: Retry logic with exponential backoff
  const result = await retry(
    () => transporter.sendMail({
      from: `${inbox.name} <${inbox.email}>`,
      to: options.to,
      subject: options.subject,
      html: formatEmailHtml(options.body),
    }),
    {
      attempts: 3,
      delay: 2000,
      isRetryable: isRetryableEmailError,  // Smart retry logic
    }
  );

  incrementInboxSendCount(inbox.email);  // ⚠️ In-memory counter - not persisted!
  await recordSuccessfulSend(options.to, inbox.email, options.emailId, result.messageId);

  return { success: true, messageId: result.messageId, deliveryTime, sentFrom: inbox.email };
}
```

**🐛 ISSUES**:

1. **In-Memory Inbox Counter** (Line 141)
   - **Problem**: `incrementInboxSendCount()` uses memory - resets on restart!
   - **Impact**: Can exceed daily limits after server restart
   - **Fix**: Use database counter:
   ```sql
   UPDATE mailboxes
   SET sent_today = sent_today + 1
   WHERE email = 'inbox@example.com';
   ```

2. **Password in Memory** (Line 118)
   - **Security**: Plain text password in `inbox.password`
   - **Fix**: Use encrypted env vars or secrets manager

3. **No Connection Pooling**
   - **Performance**: New SMTP connection per email (slow!)
   - **Fix**: Reuse transporter connections:
   ```typescript
   const transporterCache = new Map<string, nodemailer.Transporter>();
   ```

4. **Bounce Detection** (Lines 159-162)
   - **Current**: Parses error strings with regex
   - **Issue**: May miss bounce types
   - **Fix**: Use SMTP status codes (550, 551, 552, 553, 554)

**Test Cases**:
```bash
# Test SMTP connection
curl -X POST https://crm.jengu.ai/api/debug-smtp

# Expected response:
{
  "inboxes": [
    { "email": "inbox1@example.com", "status": "connected", "sent_today": 5, "limit": 20 },
    { "email": "inbox2@example.com", "status": "auth_failed", "error": "Invalid password" }
  ]
}

# Test bounce handling:
# - Send to invalid@nonexistent-domain-12345.com (should detect bounce)
# - Send to valid address (should succeed)
# - Check database for bounce record
```

---

### A5. Inbox Rotation Logic

**File**: `src/lib/email/inbox-tracker.ts` (assumed to exist based on imports)

**How It Should Work**:
1. Get all SMTP inboxes from config
2. Check each inbox's `sent_today` count
3. Return first inbox where `sent_today < PER_INBOX_LIMIT`
4. If all exhausted, fall back to Azure Graph

**Current Implementation** (from code analysis):
```typescript
// src/lib/email/send.ts:359-362
const availableSmtpInbox = getAvailableInbox();
if (availableSmtpInbox) {
  return sendViaSmtp(availableSmtpInbox, options);
}
```

**🐛 POTENTIAL ISSUES**:
1. **No Round-Robin**: May favor first inbox (uneven distribution)
2. **No Health Checking**: May select inbox with recent failures
3. **No Warmup Awareness**: May select new inbox not ready for volume

**Improvement**:
```typescript
function getAvailableInbox(): SmtpInbox | null {
  const inboxes = getSmtpInboxes();

  // Filter: active, healthy, under limit, warmup-ready
  const available = inboxes.filter(inbox =>
    inbox.status === 'active' &&
    inbox.health_score >= 70 &&
    getInboxSendCount(inbox.email) < inbox.daily_limit &&
    inbox.warmup_stage >= 3  // Only use warmed-up inboxes
  );

  if (available.length === 0) return null;

  // Round-robin: pick inbox with lowest sent_today
  return available.sort((a, b) =>
    getInboxSendCount(a.email) - getInboxSendCount(b.email)
  )[0];
}
```

---

## ⏰ B. Cron Jobs Deep Dive

### B1. Hourly Email Cron (Main Sender)

**File**: `src/app/api/cron/hourly-email/route.ts`

**Full Analysis**:

**Line 14-24**: Documentation (excellent!)
```typescript
/**
 * HUMAN-LIKE EMAIL CRON
 *
 * Sends 1 email at random intervals to mimic human sending patterns.
 * Call every 5 minutes - randomly skips ~30% of calls to create natural gaps.
 * Result: emails sent every 5-15 minutes with variation.
 *
 * Setup: External cron service (cron-job.org) to call every 5 minutes:
 * - URL: https://jengu.ai/api/cron/hourly-email
 * - Schedule: every 5 mins, 8am-6pm Mon-Fri
 * - Method: GET
 * - Header: Authorization: Bearer YOUR_CRON_SECRET
 *
 * Math: ~80 calls/day × 70% send rate = ~56 emails (close to 80 with some doubles)
 */
```

**Line 26-35**: Auth Check (secure but could be better)
```typescript
const authHeader = request.headers.get("authorization");
const cronSecret = process.env.CRON_SECRET;

if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
```

**🔒 SECURITY IMPROVEMENTS**:
1. **Add Request Signing**: Verify request came from cron-job.org
2. **Add Rate Limiting**: Prevent abuse if secret leaked
3. **Add IP Whitelist**: Only allow cron-job.org IPs
4. **Rotate Secret**: Add secret rotation mechanism

**Line 38-46**: Emergency Stop Check (good safety mechanism)
```typescript
if (EMAIL.EMERGENCY_STOP) {
  return NextResponse.json({
    success: true,
    message: "EMERGENCY STOP - All email sending disabled",
    disabled: true,
    emergency_stop: true,
  });
}
```

✅ **GOOD**: Clear kill switch for emergencies

**Line 67-83**: Random Skip Logic (excellent for human-like sending!)
```typescript
const skipChance = Math.random();
if (skipChance < 0.3) {  // 30% skip rate
  return NextResponse.json({
    success: true,
    message: "Skipped this cycle (human-like randomness)",
    skipped: true,
    skip_reason: "Random delay for natural pattern",
    warmup: { ...warmupStatus },
  });
}
```

✅ **EXCELLENT**: Creates realistic sending patterns
📊 **Math Check**:
- Cron runs: 12 times/hour × 10 hours = 120 calls/day
- Skip rate: 30% = 36 skips
- Actual sends: 84 attempts/day
- With warmup limit (60): Sends 60 emails/day

**Line 85-101**: Email Sending
```typescript
const baseUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3000";

const response = await fetch(`${baseUrl}/api/auto-email`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: cronSecret ? `Bearer ${cronSecret}` : "",
  },
  body: JSON.stringify({
    max_emails: 1,  // ✅ Only 1 email per cron call (human-like)
    min_score: 0,
    stagger_delay: false,  // ⚠️ Why disabled? Should be true!
  }),
});
```

**🐛 ISSUE**: `stagger_delay: false` (Line 99)
- **Problem**: Disables 30-90s random delay between emails
- **Impact**: Less human-like behavior
- **Fix**: Change to `stagger_delay: true`

**Improvement: Add Logging**:
```typescript
// After fetch, log result for monitoring
const result = await response.json();
await supabase.from('activities').insert({
  type: 'cron_hourly_email',
  title: result.data?.sent === 1 ? 'Email sent' : 'No email sent',
  description: JSON.stringify(result.data),
});
```

---

### B2. Daily Pipeline Cron

**File**: `src/app/api/cron/daily/route.ts`

**Purpose**: Runs at 7am UTC daily (from vercel.json)

**Expected Tasks**:
1. Reset daily email counters (`sent_today = 0`)
2. Advance warmup stages (if >= 7 days)
3. Clean up old activity logs (>30 days)
4. Update campaign statistics
5. Generate daily email report

**Test**:
```bash
curl -X GET https://crm.jengu.ai/api/cron/daily \
  -H "Authorization: Bearer $CRON_SECRET"
```

**Checklist**:
- [ ] Runs at 7am UTC (check Vercel logs)
- [ ] Resets inbox counters
- [ ] Advances warmup stages correctly
- [ ] Sends daily summary email
- [ ] Logs execution time
- [ ] Handles errors gracefully

---

## 🧪 C. Comprehensive Test Plan

### C1. Unit Tests (Create These!)

**File**: `src/lib/email/send.test.ts` (create)

```typescript
describe('Email Sending', () => {
  describe('sendViaSmtp', () => {
    it('should retry on transient errors', async () => {
      // Mock: First 2 calls fail with "connection timeout", 3rd succeeds
      // Assert: 3 attempts made, final result is success
    });

    it('should NOT retry on permanent bounces', async () => {
      // Mock: SMTP returns 550 error (permanent bounce)
      // Assert: Only 1 attempt, result includes bounceType
    });

    it('should detect and record bounces', async () => {
      // Mock: SMTP error "550 User not found"
      // Assert: recordBounce() called with correct params
    });
  });

  describe('Inbox Rotation', () => {
    it('should select inbox with lowest sent_today', () => {
      // Setup: 3 inboxes with sent_today: 5, 10, 3
      // Assert: Returns inbox with sent_today = 3
    });

    it('should skip inboxes at daily limit', () => {
      // Setup: All inboxes at limit except Azure
      // Assert: Falls back to Azure
    });
  });

  describe('Warmup Logic', () => {
    it('should calculate correct limit for each stage', () => {
      // Test days: 1, 7, 8, 14, 15, 21, 22, 28, 35
      // Assert: Correct limits: 15, 15, 30, 30, 45, 45, 60, 60, 60
    });
  });
});
```

### C2. Integration Tests

**File**: `src/app/api/__tests__/auto-email.test.ts` (create)

```typescript
describe('POST /api/auto-email', () => {
  it('should send email to eligible prospect', async () => {
    // Setup: Create test prospect with valid email
    // Call: POST /api/auto-email with max_emails: 1
    // Assert: Email sent, prospect stage = 'contacted', activity logged
  });

  it('should respect warmup daily limit', async () => {
    // Setup: Set warmup limit = 5, send 5 emails
    // Call: Try to send 6th email
    // Assert: Returns error "Warmup daily limit reached"
  });

  it('should filter generic emails', async () => {
    // Setup: Prospects with emails: info@hotel.com, john@hotel.com
    // Call: POST /api/auto-email
    // Assert: Only john@hotel.com receives email
  });
});
```

### C3. End-to-End Tests

```bash
# E2E Test Script
#!/bin/bash

echo "🧪 Running E2E Email System Tests"

# 1. Test cron authentication
echo "[1/10] Testing cron auth..."
curl -X GET https://crm.jengu.ai/api/cron/hourly-email \
  -H "Authorization: Bearer invalid" \
  | jq '.error' # Should return "Unauthorized"

# 2. Test warmup status
echo "[2/10] Testing warmup status..."
curl https://crm.jengu.ai/api/auto-email | jq '.warmup'

# 3. Test emergency stop
echo "[3/10] Testing emergency stop..."
# (Temporarily set EMERGENCY_STOP = true in constants.ts, deploy, test, revert)

# 4. Test email generation
echo "[4/10] Testing email generation..."
curl -X POST https://crm.jengu.ai/api/generate-email \
  -d '{"prospect_id": "test-id"}' | jq '.subject, .body'

# 5. Test SMTP connection
echo "[5/10] Testing SMTP connections..."
curl https://crm.jengu.ai/api/debug-smtp | jq '.inboxes'

# 6. Send test email
echo "[6/10] Sending test email..."
curl -X POST https://crm.jengu.ai/api/auto-email \
  -H "Authorization: Bearer $CRON_SECRET" \
  -d '{"max_emails": 1}' | jq '.sent'

# 7. Check database for sent email
echo "[7/10] Verifying database..."
# (SQL query to check emails table)

# 8. Test daily limit enforcement
echo "[8/10] Testing daily limit..."
# (Send emails until limit hit, verify error)

# 9. Test inbox rotation
echo "[9/10] Testing inbox rotation..."
# (Send 3 emails, check which inboxes used)

# 10. Test reply detection
echo "[10/10] Testing reply detection..."
curl https://crm.jengu.ai/api/cron/check-replies \
  -H "Authorization: Bearer $CRON_SECRET"

echo "✅ E2E Tests Complete"
```

---

## 📝 D. Code Quality Improvements

### D1. Add TypeScript Strict Mode

**File**: `tsconfig.json`

```json
{
  "compilerOptions": {
    "strict": true,  // Enable all strict checks
    "strictNullChecks": true,  // Catch potential null/undefined bugs
    "noImplicitAny": true,  // Require explicit types
    "noUnusedLocals": true,  // Warn on unused variables
    "noUnusedParameters": true
  }
}
```

### D2. Add Error Tracking

**File**: `src/lib/email/send.ts` (enhance)

```typescript
import * as Sentry from '@sentry/nextjs';

async function sendViaSmtp(...) {
  try {
    // ... existing code
  } catch (error) {
    // Add Sentry error tracking
    Sentry.captureException(error, {
      tags: {
        component: 'email-sender',
        inbox: inbox.email,
        recipient: options.to,
      },
      extra: {
        subject: options.subject,
        deliveryTime,
      },
    });

    // Existing error handling
    return { success: false, error: errorStr, ... };
  }
}
```

### D3. Add Performance Monitoring

```typescript
import { logger } from '@/lib/logger';

async function sendEmail(options) {
  const startTime = performance.now();

  try {
    const result = await sendViaSmtp(...);

    const duration = performance.now() - startTime;
    logger.info({
      component: 'email-sender',
      duration_ms: duration,
      success: result.success,
      inbox: result.sentFrom,
    }, 'Email send completed');

    // Alert if slow
    if (duration > 5000) {
      logger.warn({ duration_ms: duration }, 'Slow email send detected');
    }

    return result;
  } catch (error) {
    logger.error({ error, duration_ms: performance.now() - startTime }, 'Email send failed');
    throw error;
  }
}
```

---

## ✅ E. Acceptance Criteria

### Must Pass ALL These Tests:

- [ ] **External cron configured** and calling `/api/cron/hourly-email` every 5 minutes
- [ ] **Emails being sent** (check activity log for today)
- [ ] **Warmup limits enforced** (cannot exceed daily limit)
- [ ] **Inbox rotation working** (emails distributed across inboxes)
- [ ] **Generic emails filtered** (no emails sent to info@, reservations@, etc.)
- [ ] **Timezone-aware sending** (only during 9am-5pm prospect local time)
- [ ] **Bounce detection working** (bounces recorded in database)
- [ ] **Reply detection working** (NOT CURRENTLY IMPLEMENTED - TODO!)
- [ ] **Follow-ups working** (NOT CURRENTLY IMPLEMENTED - TODO!)
- [ ] **Azure fallback working** (when SMTP exhausted)
- [ ] **Emergency stop works** (no emails when EMERGENCY_STOP = true)
- [ ] **Auth working** (401 error without correct CRON_SECRET)
- [ ] **Logging working** (all sends logged to activities table)
- [ ] **Error handling working** (no unhandled exceptions)

---

## 📊 F. Monitoring Dashboard (Create This!)

Create `/app/email-monitoring/page.tsx`:

```typescript
export default function EmailMonitoringPage() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    // Fetch stats every 30s
    const interval = setInterval(async () => {
      const res = await fetch('/api/auto-email');
      setStats(await res.json());
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div>
      <h1>Email System Monitoring</h1>

      {/* Warmup Progress */}
      <Card>
        <h2>Warmup Status</h2>
        <p>Day: {stats?.warmup.day}</p>
        <p>Stage: {stats?.warmup.stage}</p>
        <p>Daily Limit: {stats?.warmup.daily_limit}</p>
        <p>Sent Today: {stats?.sent_today}</p>
        <p>Remaining: {stats?.warmup.remaining}</p>
        <ProgressBar value={stats?.sent_today} max={stats?.warmup.daily_limit} />
      </Card>

      {/* Inbox Status */}
      <Card>
        <h2>Inbox Status</h2>
        {stats?.inboxes.details.map(inbox => (
          <div key={inbox.email}>
            <p>{inbox.email}</p>
            <p>Sent Today: {inbox.sentToday}/{inbox.dailyLimit}</p>
            <p>Health: {inbox.healthScore}%</p>
          </div>
        ))}
      </Card>

      {/* Recent Activity */}
      <Card>
        <h2>Recent Emails</h2>
        {/* Fetch and display last 10 emails from database */}
      </Card>

      {/* Alerts */}
      <Card>
        <h2>Alerts</h2>
        {stats?.warmup.remaining === 0 && <Alert type="warning">Daily limit reached</Alert>}
        {stats?.inboxes.remaining_capacity === 0 && <Alert type="error">All inboxes exhausted!</Alert>}
      </Card>
    </div>
  );
}
```

---

## 🔧 G. Quick Fixes (Do These NOW)

1. **Configure External Cron** (5 min)
   - Go to cron-job.org
   - Add job with schedule `*/5 8-18 * * 1-5`
   - URL: `https://crm.jengu.ai/api/cron/hourly-email`
   - Header: `Authorization: Bearer {CRON_SECRET}`

2. **Enable Stagger Delay** (1 min)
   - File: `src/app/api/cron/hourly-email/route.ts:99`
   - Change: `stagger_delay: false` → `stagger_delay: true`

3. **Fix Reply Checking** (30 min)
   - File: `src/app/api/cron/check-replies/route.ts`
   - Remove hardcoded disabled state
   - Implement IMAP checking logic

4. **Fix Follow-Up Logic** (30 min)
   - File: `src/app/api/cron/follow-up/route.ts`
   - Remove hardcoded disabled state
   - Implement sequence-based follow-ups

5. **Add Database Counter** (15 min)
   - Update `sent_today` in mailboxes table instead of memory
   - SQL: `UPDATE mailboxes SET sent_today = sent_today + 1 WHERE email = ?`

---

**TOTAL ESTIMATED TIME**: 6-8 hours for complete audit + fixes
**CRITICAL PATH**: Configure external cron (5 min) → Enable stagger (1 min) → Test (10 min) = **16 minutes to start sending emails!**

---

**Next**: After emails are sending, move to [todo2.md](./todo2.md) (Prospect Database & Enrichment)
