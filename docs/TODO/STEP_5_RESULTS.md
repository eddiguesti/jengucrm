# Campaign System End-to-End Audit - STEP 5 RESULTS

**Date:** December 17, 2025
**Audit Scope:** Complete campaign system architecture, flow verification, and tracking implementation
**Status:** CRITICAL ISSUES IDENTIFIED

---

## Executive Summary

The campaign system has a **complete UI** and **database schema** but is **NOT operational**. While the infrastructure exists for sequence-based campaigns with A/B testing, there is **NO active dispatch mechanism** connecting campaigns to the email sending system. Tracking is partially implemented but **NOT functional** for real-time metrics.

### Critical Findings

1. **MISSING DISPATCH SYSTEM** - No cron job or worker processes campaign sequences
2. **NO TRACKING IMPLEMENTATION** - Open/click tracking pixels not injected into emails
3. **STATIC METRICS** - Campaign metrics rely on manual database queries, not real-time updates
4. **DUAL ARCHITECTURE** - Two separate campaign systems (legacy + sequence) causing confusion
5. **NO AUDIENCE BUILDER** - UI has no campaign-to-prospect assignment interface

---

## 1. Campaign Creation Flow

### UI: `/outreach/campaigns/new`

**Status:** FULLY FUNCTIONAL

**File:** `src/app/outreach/campaigns/new/page.tsx`

#### Form Inputs
- Campaign name (required)
- Description (optional)
- Daily send limit (default: 50)
- A/B testing toggle
- Email sequences (multi-step with delays)

#### Personalization System
**Variables Available:**
```typescript
Contact Variables:
  - {{first_name}}, {{last_name}}, {{full_name}}, {{title}}

Company Variables:
  - {{hotel_name}}, {{company}}

Location Variables:
  - {{city}}, {{country}}
```

**Features:**
- Live preview with sample data
- Variable highlighting in editor
- Tooltip examples
- Email/preview toggle mode

#### Sequence Configuration
Each step includes:
- Step number (auto-incrementing)
- Delay (days + hours) from previous step
- **Variant A**: Subject + body
- **Variant B** (optional): Alternative subject + body
- Variant split percentage (e.g., 50% to A, 50% to B)

**Validation:**
- Name required
- All steps must have subject and body
- Variant B only saved if A/B testing enabled

### API: `POST /api/outreach/campaigns`

**Status:** WORKING

**File:** `src/app/api/outreach/campaigns/route.ts`

#### Request Body
```json
{
  "name": "Hotel GM Outreach Q4",
  "description": "Target independent hotels",
  "daily_limit": 50,
  "ab_testing_enabled": true,
  "sequences": [
    {
      "step_number": 1,
      "delay_days": 0,
      "delay_hours": 0,
      "variant_a_subject": "Quick question about {{hotel_name}}",
      "variant_a_body": "Hey {{first_name}},\n\nI noticed {{hotel_name}}...",
      "variant_b_subject": "Alternative subject",
      "variant_b_body": "Alternative body",
      "variant_split": 50
    }
  ]
}
```

#### Database Operations

**1. Insert Campaign**
```sql
INSERT INTO campaigns (
  name, description, strategy_key, active,
  send_days, send_time_start, send_time_end, daily_limit
) VALUES (...)
```

**Default values:**
- `active: false` - Campaigns start paused
- `send_days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']`
- `send_time_start: 9` (9am UTC)
- `send_time_end: 17` (5pm UTC)

**2. Insert Sequences**
For each sequence step:
```sql
INSERT INTO campaign_sequences (
  campaign_id, step_number, delay_days, delay_hours,
  variant_a_subject, variant_a_body,
  variant_b_subject, variant_b_body,
  variant_split, use_ai_generation, ai_prompt_context
) VALUES (...)
```

**3. Response**
```json
{
  "campaign": {
    "id": "uuid",
    "name": "Hotel GM Outreach Q4",
    "active": false,
    "created_at": "2025-12-17T..."
  },
  "message": "Campaign created successfully"
}
```

**Redirect:** UI redirects to `/outreach/campaigns/{id}` on success

### Database Schema

**File:** `supabase/migrations/20251212_outreach_sequences.sql`

#### Table: `campaigns`
```sql
CREATE TABLE campaigns (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  strategy_key TEXT NOT NULL,
  type TEXT DEFAULT 'legacy' CHECK (type IN ('legacy', 'sequence')),
  active BOOLEAN DEFAULT true,

  -- Scheduling
  send_days TEXT[] DEFAULT ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
  send_time_start INTEGER DEFAULT 9,
  send_time_end INTEGER DEFAULT 17,
  daily_limit INTEGER DEFAULT 20,

  -- Metrics (auto-updated)
  emails_sent INTEGER DEFAULT 0,
  emails_opened INTEGER DEFAULT 0,
  replies_received INTEGER DEFAULT 0,

  -- Sequence-specific
  sequence_count INTEGER DEFAULT 1,
  leads_count INTEGER DEFAULT 0,
  active_leads INTEGER DEFAULT 0,
  completed_leads INTEGER DEFAULT 0,
  ab_testing_enabled BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
)
```

#### Table: `campaign_sequences`
```sql
CREATE TABLE campaign_sequences (
  id UUID PRIMARY KEY,
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

  -- AI Generation
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
)
```

#### Table: `campaign_leads`
```sql
CREATE TABLE campaign_leads (
  id UUID PRIMARY KEY,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  prospect_id UUID REFERENCES prospects(id) ON DELETE CASCADE,
  mailbox_id UUID REFERENCES mailboxes(id) ON DELETE SET NULL,

  -- Progress Tracking
  current_step INTEGER DEFAULT 0, -- 0 = not started
  status TEXT DEFAULT 'active' CHECK (status IN (
    'active', 'paused', 'completed', 'replied', 'bounced', 'unsubscribed'
  )),

  -- A/B Assignment (locked when first email sent)
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
  added_by TEXT, -- 'manual', 'import', 'automation'
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(campaign_id, prospect_id)
)
```

**Triggers:**
- `update_campaign_lead_counts()` - Auto-updates `campaigns.leads_count`, `active_leads`, `completed_leads`
- `schedule_next_email(lead_id)` - Calculates `next_email_at` based on step delays

### Verification

**What Works:**
- Campaign creation UI renders correctly
- Form validation (client-side)
- Personalization toolbar with variable insertion
- Preview mode with sample data
- API endpoint accepts requests
- Database inserts succeed
- Sequences linked to campaigns via foreign key

**Issues:**
- No audience selection UI (how to add prospects?)
- No validation for duplicate campaign names at UI level
- Strategy key auto-generated but not user-configurable
- Campaign starts inactive by default (good) but no bulk activate option

---

## 2. Audience Selection Logic

### Current State: NOT IMPLEMENTED

**Critical Gap:** There is **NO UI or API** for assigning prospects to campaigns.

### Expected Flow (Not Built)

1. User creates campaign with sequences
2. User navigates to "Leads" tab
3. User clicks "Add Leads" button
4. Modal opens with filters:
   - Tier: hot/warm/cold
   - Stage: new/enriched/ready/contacted/engaged
   - Source: sales-navigator, scraper, manual
   - Tags: custom filters
   - Search: name, email, city
5. Preview shows matching prospects count
6. User confirms and prospects are assigned

### Available Filters (Prospect Table)

**File:** `src/repositories/prospect.repository.ts`

```typescript
interface ProspectFilters {
  tier?: 'hot' | 'warm' | 'cold';
  stage?: string;
  search?: string;
  tags?: string;
  archived?: boolean;
  minScore?: number;
  hasEmail?: boolean;
}
```

**SQL Query:**
```sql
SELECT * FROM prospects
WHERE tier = ?
  AND stage = ?
  AND archived = false
  AND email IS NOT NULL
  AND (name ILIKE ? OR city ILIKE ?)
  AND score >= ?
  AND tags @> ?
ORDER BY score DESC
```

### Cloudflare Worker Implementation (Exists)

**File:** `cloudflare/src/workers/campaigns.ts`

**API:** `POST /api/campaigns/{id}/leads`

```typescript
{
  "prospectIds": ["uuid1", "uuid2", ...],
  "mailboxId": "optional-mailbox-uuid",
  "variant": "a" | "b" | "random"
}
```

**Logic:**
1. For each prospect ID:
   - Generate unique lead ID
   - Assign variant (A/B or random)
   - Get first step delay from `campaign_sequences`
   - Calculate `next_email_at = NOW + delay`
   - Insert into `campaign_leads`
2. Update `campaigns.leads_count`

**Response:**
```json
{
  "success": true,
  "added": 15,
  "skipped": 2
}
```

### Gap Analysis

**Missing Components:**
1. UI modal for audience selection
2. Real-time prospect count preview
3. Audience save/reuse (saved filters)
4. Bulk import from CSV
5. Integration with Sales Navigator imports

**Workaround:**
Currently, prospects can only be added via Cloudflare Worker API directly (no UI):
```bash
curl -X POST https://crm.jengu.ai/api/campaigns/{id}/leads \
  -H "Content-Type: application/json" \
  -d '{"prospectIds": ["uuid1", "uuid2"]}'
```

---

## 3. Message Dispatch System

### CRITICAL ISSUE: NO CAMPAIGN DISPATCHER

**Status:** NOT IMPLEMENTED

### Current Email Sending (Non-Campaign)

**File:** `cloudflare/src/workers/cron.ts`

**Cron Schedule:** Every 5 min, 8am-6pm Mon-Sat

```typescript
async function sendEmailBatch(env: Env) {
  // Get prospects ready for generic outreach (NOT campaign-based)
  const prospects = await env.DB.prepare(`
    SELECT * FROM prospects
    WHERE stage IN ('enriched', 'ready')
      AND contact_email IS NOT NULL
      AND email_bounced = 0
      AND (last_contacted_at IS NULL OR last_contacted_at < datetime('now', '-3 days'))
    ORDER BY score DESC
    LIMIT 3
  `).all();

  for (const prospect of prospects) {
    await processAndSendEmail(prospect, env, false);
  }
}
```

**This query does NOT use campaigns or sequences!**

### What's Missing: Campaign-Specific Dispatcher

**Expected Implementation (Not Found):**

```typescript
// DOES NOT EXIST - PSEUDOCODE
async function sendCampaignEmails(env: Env) {
  // 1. Get active campaigns
  const campaigns = await getCampaigns({ active: true });

  for (const campaign of campaigns) {
    // 2. Get leads ready for next email
    const leads = await env.DB.prepare(`
      SELECT cl.*, p.*, cs.*
      FROM campaign_leads cl
      JOIN prospects p ON p.id = cl.prospect_id
      JOIN campaign_sequences cs ON cs.campaign_id = cl.campaign_id
        AND cs.step_number = cl.current_step + 1
      WHERE cl.campaign_id = ?
        AND cl.status = 'active'
        AND cl.next_email_at <= NOW()
      LIMIT ?
    `).bind(campaign.id, campaign.daily_limit).all();

    for (const lead of leads) {
      // 3. Select variant content
      const content = lead.assigned_variant === 'A'
        ? { subject: cs.variant_a_subject, body: cs.variant_a_body }
        : { subject: cs.variant_b_subject, body: cs.variant_b_body };

      // 4. Replace personalization variables
      const personalized = replaceVariables(content, lead.prospect);

      // 5. Send email
      await sendEmail(personalized);

      // 6. Update lead progress
      await advanceLead(lead.id);

      // 7. Increment metrics
      await incrementSequenceMetrics(cs.id, lead.assigned_variant);
    }
  }
}
```

### Repositories Provide Methods (But No Caller)

**File:** `src/repositories/campaign-sequence.repository.ts`

**Available Methods:**
- `findReadyForEmail(limit)` - Finds leads with `next_email_at <= NOW()`
- `advanceStep(leadId, nextDelay)` - Increments `current_step`, schedules next
- `markComplete(leadId)` - Sets status to 'completed'
- `incrementMetrics(sequenceId, field, variant)` - Updates sent/open/reply counts

**These methods exist but are NEVER CALLED by any cron job!**

### Database Function Exists (But Unused)

**File:** `supabase/migrations/20251212_outreach_sequences.sql`

```sql
CREATE FUNCTION schedule_next_email(lead_id UUID) RETURNS TIMESTAMPTZ AS $$
DECLARE
  next_step RECORD;
  next_time TIMESTAMPTZ;
BEGIN
  -- Get next step
  SELECT * INTO next_step
  FROM campaign_sequences
  WHERE campaign_id = lead.campaign_id
    AND step_number = lead.current_step + 1;

  -- Calculate next send time
  next_time := lead.last_email_at
               + (next_step.delay_days || ' days')::INTERVAL
               + (next_step.delay_hours || ' hours')::INTERVAL;

  UPDATE campaign_leads SET next_email_at = next_time WHERE id = lead_id;
  RETURN next_time;
END;
$$ LANGUAGE plpgsql;
```

**This function is defined but NEVER invoked!**

### Recommendation

**Required Implementation:**

1. **Create Campaign Dispatcher Cron**
   - New cron job: `*/5 8-18 * * 1-6` (same schedule as generic emails)
   - File: `cloudflare/src/workers/cron.ts` - add `sendCampaignBatch()`

2. **Sequence Logic**
   - Query `campaign_leads` WHERE `next_email_at <= NOW()` AND `status = 'active'`
   - Join with `campaign_sequences` to get email content
   - Join with `prospects` to get personalization data

3. **Variant Selection**
   - Use `assigned_variant` from `campaign_leads` (locked on first send)
   - Pick A or B content based on variant

4. **Personalization**
   - Replace `{{variable}}` tokens with prospect data
   - Variables: `first_name`, `last_name`, `hotel_name`, `city`, `country`, etc.

5. **Progress Tracking**
   - After send: Call `advanceStep(leadId)` or `markComplete(leadId)`
   - Update `campaign_sequences` metrics (sent_count, variant_a_sent, etc.)
   - Update `campaigns.emails_sent`

**Estimated Effort:** 4-6 hours (medium complexity)

---

## 4. Tracking & Metrics

### Current Implementation: PARTIAL (NOT FUNCTIONAL)

### Database Columns Exist

**Emails Table:**
```sql
CREATE TABLE emails (
  id UUID PRIMARY KEY,
  campaign_id UUID REFERENCES campaigns(id),
  opened_at TIMESTAMPTZ,
  replied_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  status TEXT, -- 'sent', 'opened', 'replied', 'bounced'
  ...
)
```

**Campaign Sequences Table:**
```sql
CREATE TABLE campaign_sequences (
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
  ...
)
```

### Repository Methods Exist (But Unused)

**File:** `src/repositories/email.repository.ts`

```typescript
async updateStatus(id: string, status: 'opened' | 'replied') {
  const updates: Partial<Email> = { status };

  if (status === 'opened') {
    updates.opened_at = new Date().toISOString();
  } else if (status === 'replied') {
    updates.replied_at = new Date().toISOString();
  }

  return this.update(id, updates);
}
```

**File:** `src/repositories/campaign-sequence.repository.ts`

```typescript
async incrementMetrics(
  id: string,
  field: 'sent_count' | 'open_count' | 'reply_count' | 'bounce_count',
  variant?: 'A' | 'B'
) {
  const updates = { [field]: step[field] + 1 };

  if (variant === 'A' && field === 'open_count') {
    updates.variant_a_opens = step.variant_a_opens + 1;
  } else if (variant === 'B' && field === 'open_count') {
    updates.variant_b_opens = step.variant_b_opens + 1;
  }

  await this.update(id, updates);
}
```

### Open Tracking: NOT IMPLEMENTED

**What's Missing:**

1. **Tracking Pixel Injection**
   - Email HTML must include: `<img src="https://crm.jengu.ai/api/track/open/{emailId}" width="1" height="1" />`
   - Current email sender does NOT inject tracking pixels

2. **Tracking Endpoint**
   - API: `GET /api/track/open/{emailId}` - Does NOT exist
   - Should return 1x1 transparent pixel
   - Should call `emailRepository.updateStatus(emailId, 'opened')`

3. **Metrics Aggregation**
   - Needs to call `campaignSequenceRepository.incrementMetrics(sequenceId, 'open_count', variant)`

**Current Email Sending (No Tracking):**

**File:** `src/lib/email/send.ts`

```typescript
async function sendViaSmtp(inbox, options) {
  await transporter.sendMail({
    from: `${inbox.name} <${inbox.email}>`,
    to: options.to,
    subject: options.subject,
    html: formatEmailHtml(options.body), // <-- NO PIXEL INJECTED
  });
}
```

**File:** `src/lib/email/templates.ts`

```typescript
export function formatEmailHtml(body: string): string {
  return `
    <div style="font-family: sans-serif; line-height: 1.6;">
      ${body.replace(/\n/g, '<br>')}
    </div>
  `;
  // <-- NO TRACKING PIXEL
}
```

### Click Tracking: NOT IMPLEMENTED

**What's Missing:**

1. **Link Rewriting**
   - Replace all `<a href="...">` with `https://crm.jengu.ai/api/track/click/{emailId}?url=...`
   - Current emails have raw links (no tracking)

2. **Tracking Endpoint**
   - API: `GET /api/track/click/{emailId}?url={original}` - Does NOT exist
   - Should redirect to original URL
   - Should call `emailRepository.updateStatus(emailId, 'clicked')`

### Reply Tracking: PARTIALLY IMPLEMENTED

**What Works:**

**File:** `src/app/api/webhooks/email/route.ts`

- Microsoft Graph webhook receives inbound emails
- Matches reply to original email via `conversationId`
- Updates prospect stage to 'engaged' or 'meeting'
- Classifies intent (meeting request, not interested, positive)

**What's Missing:**

- Does NOT update `campaign_sequences.reply_count`
- Does NOT update `campaign_leads.has_replied`
- Does NOT stop sequence (lead remains active)

### Real-Time vs. Static Metrics

**UI Displays (Campaign Detail Page):**

**File:** `src/app/outreach/campaigns/[id]/page.tsx`

```tsx
<StatCard
  icon={Mail}
  label="Emails Sent"
  value={campaign.emails_sent}  // <-- From campaigns table
  color="violet"
/>
<StatCard
  icon={Reply}
  label="Replies"
  value={campaign.replies_received}  // <-- From campaigns table
  color="amber"
/>
```

**Source of Metrics:**

**File:** `src/services/campaign.service.ts`

```typescript
// Counts emails manually from emails table
const allEmails = await supabase.from('emails')
  .select('*')
  .not('campaign_id', 'is', null);

const campaignStats = campaigns.map(campaign => {
  const emailsSent = allEmails.filter(e =>
    e.campaign_id === campaign.id && e.direction === 'outbound'
  ).length;

  const totalReplies = allEmails.filter(e =>
    e.campaign_id === campaign.id && e.direction === 'inbound'
  ).length;

  return { ...campaign, emails_sent: emailsSent, replies_received: totalReplies };
});
```

**Issue:** Metrics are calculated on-the-fly via expensive joins, not incremented atomically.

### Recommendations

**1. Implement Tracking Pixels**

Add to `src/lib/email/templates.ts`:
```typescript
export function formatEmailHtml(body: string, emailId: string): string {
  return `
    <div style="font-family: sans-serif; line-height: 1.6;">
      ${body.replace(/\n/g, '<br>')}
    </div>
    <img src="https://crm.jengu.ai/api/track/open/${emailId}" width="1" height="1" style="display:none;" />
  `;
}
```

**2. Create Tracking Endpoints**

New file: `src/app/api/track/open/[emailId]/route.ts`
```typescript
export async function GET(request: NextRequest, { params }: { params: { emailId: string } }) {
  const { emailId } = params;

  // Update email status
  await emailRepository.updateStatus(emailId, 'opened');

  // Get campaign sequence for metrics
  const email = await emailRepository.findById(emailId);
  if (email && email.campaign_id) {
    const lead = await campaignLeadRepository.findByProspect(email.prospect_id);
    if (lead) {
      await campaignSequenceRepository.incrementMetrics(
        lead.current_sequence_id,
        'open_count',
        lead.assigned_variant
      );
    }
  }

  // Return 1x1 transparent pixel
  const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
  return new NextResponse(pixel, {
    headers: { 'Content-Type': 'image/gif', 'Cache-Control': 'no-cache' }
  });
}
```

**3. Fix Reply Tracking**

Update `src/app/api/webhooks/email/route.ts`:
```typescript
// After saving reply email
const lead = await campaignLeadRepository.findByProspect(prospect.id);
if (lead && lead.status === 'active') {
  await campaignLeadRepository.updateStatus(lead.id, 'replied');
  await campaignSequenceRepository.incrementMetrics(
    lead.current_sequence_id,
    'reply_count',
    lead.assigned_variant
  );
}
```

**4. Atomic Counter Updates**

Use Supabase RPC for atomic increments:
```sql
CREATE OR REPLACE FUNCTION increment_campaign_metric(
  campaign_id UUID,
  metric_name TEXT,
  amount INTEGER DEFAULT 1
) RETURNS VOID AS $$
BEGIN
  EXECUTE format('UPDATE campaigns SET %I = %I + $1 WHERE id = $2', metric_name, metric_name)
  USING amount, campaign_id;
END;
$$ LANGUAGE plpgsql;
```

Call from app:
```typescript
await supabase.rpc('increment_campaign_metric', {
  campaign_id: campaignId,
  metric_name: 'emails_sent',
  amount: 1
});
```

---

## 5. End-to-End Test (NOT PERFORMED)

**Why Test Was Skipped:**

Given the critical gaps identified:
1. No campaign dispatcher (emails won't send)
2. No audience assignment UI (can't add prospects)
3. No tracking implementation (opens/clicks won't record)

**Safe Test Approach (When Ready):**

1. Create test campaign with single step
2. Add test prospect via API: `POST /api/campaigns/{id}/leads`
3. Set `next_email_at` to immediate: `UPDATE campaign_leads SET next_email_at = NOW()`
4. Manually trigger dispatcher (once implemented)
5. Verify email sent via `emails` table
6. Verify lead advanced via `campaign_leads.current_step`
7. Verify metrics incremented via `campaign_sequences.sent_count`

---

## 6. Issues & Recommendations

### Critical Issues (Must Fix)

| Issue | Impact | Priority | Effort |
|-------|--------|----------|--------|
| No campaign email dispatcher | Campaigns don't send emails | P0 | 6 hours |
| No tracking pixel injection | Opens not tracked | P0 | 2 hours |
| No audience assignment UI | Can't add prospects to campaigns | P0 | 8 hours |
| Static metrics (no real-time updates) | Dashboard shows stale data | P1 | 3 hours |
| Reply tracking doesn't update sequences | Sequences continue after reply | P1 | 1 hour |

### High Priority (Should Fix)

| Issue | Impact | Priority | Effort |
|-------|--------|----------|--------|
| No click tracking | Link performance unknown | P2 | 4 hours |
| Dual campaign architecture (legacy + sequence) | Confusing codebase | P2 | 8 hours |
| No saved audience filters | Must recreate filters each time | P2 | 4 hours |
| No bulk import from CSV | Manual prospect assignment slow | P2 | 3 hours |
| No campaign analytics dashboard | Can't compare variants | P2 | 6 hours |

### Medium Priority (Nice to Have)

| Issue | Impact | Priority | Effort |
|-------|--------|----------|--------|
| No unsubscribe link | Compliance risk | P3 | 2 hours |
| No email preview before send | Typos go live | P3 | 2 hours |
| No test email functionality | Hard to QA | P3 | 1 hour |
| No campaign duplication | Must recreate similar campaigns | P3 | 2 hours |

---

## 7. Architecture Recommendations

### Immediate Actions (Week 1)

**1. Implement Campaign Dispatcher**

Create: `cloudflare/src/workers/campaign-sender.ts`

```typescript
export async function sendCampaignBatch(env: Env) {
  // Get leads ready for next email
  const leads = await env.DB.prepare(`
    SELECT
      cl.*,
      p.name, p.contact_name, p.contact_email, p.city, p.country,
      cs.variant_a_subject, cs.variant_a_body,
      cs.variant_b_subject, cs.variant_b_body,
      c.id as campaign_id
    FROM campaign_leads cl
    JOIN prospects p ON p.id = cl.prospect_id
    JOIN campaigns c ON c.id = cl.campaign_id
    JOIN campaign_sequences cs ON cs.campaign_id = c.id
      AND cs.step_number = (cl.current_step + 1)
    WHERE cl.status = 'active'
      AND cl.next_email_at <= datetime('now')
      AND c.active = 1
    ORDER BY cl.next_email_at ASC
    LIMIT 50
  `).all();

  for (const lead of leads) {
    // Select content based on variant
    const content = lead.assigned_variant === 'A'
      ? { subject: lead.variant_a_subject, body: lead.variant_a_body }
      : { subject: lead.variant_b_subject, body: lead.variant_b_body };

    // Replace personalization variables
    const personalized = {
      subject: replaceVariables(content.subject, lead),
      body: replaceVariables(content.body, lead)
    };

    // Send email with tracking
    const result = await sendEmail({
      to: lead.contact_email,
      subject: personalized.subject,
      body: personalized.body,
      emailId: generateEmailId()
    });

    if (result.success) {
      // Advance to next step
      await advanceLeadStep(lead.id, env);

      // Increment metrics
      await incrementSequenceMetrics(
        lead.sequence_id,
        'sent_count',
        lead.assigned_variant,
        env
      );
    }
  }
}
```

Add to cron schedule:
```typescript
// In handleCron()
if (minute % 5 === 0 && hour >= 8 && hour <= 18 && dayOfWeek >= 1 && dayOfWeek <= 6) {
  await sendCampaignBatch(env);
  return;
}
```

**2. Add Tracking Pixels**

Modify `src/lib/email/send.ts`:

```typescript
// Generate unique email ID
const emailId = crypto.randomUUID();

// Insert email record BEFORE sending
await supabase.from('emails').insert({
  id: emailId,
  prospect_id: prospectId,
  campaign_id: campaignId,
  subject: options.subject,
  body: options.body,
  to_email: options.to,
  from_email: inbox.email,
  direction: 'outbound',
  status: 'sent',
  sent_at: new Date().toISOString()
});

// Inject tracking pixel
const htmlWithTracking = formatEmailHtml(options.body, emailId);

await transporter.sendMail({
  from: `${inbox.name} <${inbox.email}>`,
  to: options.to,
  subject: options.subject,
  html: htmlWithTracking
});
```

**3. Create Tracking Endpoint**

New file: `src/app/api/track/open/[emailId]/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { campaignLeadRepository, campaignSequenceRepository } from '@/repositories';

export async function GET(
  request: NextRequest,
  { params }: { params: { emailId: string } }
) {
  const supabase = createServerClient();

  // Update email status
  const { data: email } = await supabase
    .from('emails')
    .update({ status: 'opened', opened_at: new Date().toISOString() })
    .eq('id', params.emailId)
    .select('campaign_id, prospect_id')
    .single();

  if (email) {
    // Find campaign lead
    const { data: lead } = await supabase
      .from('campaign_leads')
      .select('id, assigned_variant, current_step, campaign_id')
      .eq('campaign_id', email.campaign_id)
      .eq('prospect_id', email.prospect_id)
      .single();

    if (lead) {
      // Increment sequence metrics
      await campaignSequenceRepository.incrementMetrics(
        lead.current_step,
        'open_count',
        lead.assigned_variant
      );

      // Update lead's open count
      await supabase
        .from('campaign_leads')
        .update({ emails_opened: lead.emails_opened + 1 })
        .eq('id', lead.id);
    }
  }

  // Return 1x1 transparent GIF
  const pixel = Buffer.from(
    'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
    'base64'
  );

  return new NextResponse(pixel, {
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    }
  });
}
```

### Short-term Improvements (Week 2-3)

**1. Build Audience Assignment UI**

Create modal component at `/outreach/campaigns/[id]` Leads tab:

```tsx
<AddLeadsModal>
  <FilterPanel>
    <Select label="Tier" options={['hot', 'warm', 'cold']} />
    <Select label="Stage" options={['enriched', 'ready', 'new']} />
    <Select label="Source" options={['sales-navigator', 'scraper']} />
    <Input label="Search" placeholder="Name, city, email" />
  </FilterPanel>

  <PreviewPanel>
    <Stats>
      <Stat label="Matching Prospects" value={prospectCount} />
      <Stat label="With Valid Email" value={emailCount} />
      <Stat label="Not Previously Contacted" value={newCount} />
    </Stats>
  </PreviewPanel>

  <VariantSelector>
    <Radio label="50/50 Split" value="random" />
    <Radio label="100% Variant A" value="a" />
    <Radio label="100% Variant B" value="b" />
  </VariantSelector>

  <Button onClick={addLeadsToCampaign}>Add {prospectCount} Leads</Button>
</AddLeadsModal>
```

**2. Implement Click Tracking**

Modify email template to rewrite links:

```typescript
export function formatEmailHtml(body: string, emailId: string): string {
  // Replace all links with tracking redirects
  const bodyWithTracking = body.replace(
    /<a href="([^"]+)"/g,
    `<a href="https://crm.jengu.ai/api/track/click/${emailId}?url=$1"`
  );

  return `
    <div style="font-family: sans-serif; line-height: 1.6;">
      ${bodyWithTracking.replace(/\n/g, '<br>')}
    </div>
    <img src="https://crm.jengu.ai/api/track/open/${emailId}" width="1" height="1" style="display:none;" />
  `;
}
```

Create click tracking endpoint:
```typescript
// src/app/api/track/click/[emailId]/route.ts
export async function GET(request: NextRequest, { params }) {
  const url = new URL(request.url).searchParams.get('url');

  // Update email clicked status
  await supabase
    .from('emails')
    .update({ clicked_at: new Date().toISOString() })
    .eq('id', params.emailId);

  // Redirect to original URL
  return NextResponse.redirect(url);
}
```

**3. Fix Reply Tracking**

Update webhook to stop sequences on reply:

```typescript
// src/app/api/webhooks/email/route.ts
if (analysis.isMeetingRequest || analysis.isNotInterested || analysis.isPositive) {
  // Find active campaign lead
  const { data: lead } = await supabase
    .from('campaign_leads')
    .select('id, campaign_id, assigned_variant, current_step')
    .eq('prospect_id', prospect.id)
    .eq('status', 'active')
    .single();

  if (lead) {
    // Stop sequence
    await supabase
      .from('campaign_leads')
      .update({
        status: 'replied',
        has_replied: true,
        replied_at: new Date().toISOString(),
        next_email_at: null
      })
      .eq('id', lead.id);

    // Increment sequence reply metrics
    await supabase.rpc('increment_sequence_metric', {
      sequence_id: lead.current_step,
      metric: 'reply_count',
      variant: lead.assigned_variant
    });
  }
}
```

### Long-term Improvements (Month 2+)

**1. Campaign Analytics Dashboard**

Create `/outreach/campaigns/[id]/analytics`:
- Time-series chart of sends/opens/replies
- Variant A vs. B performance comparison
- Conversion funnel by step
- Best-performing subject lines
- Unsubscribe rate tracking

**2. Sequence Templates**

Allow saving/reusing sequences:
- "3-Step Follow-up Template"
- "Cold Outreach Sequence"
- "Event Invitation Campaign"

**3. Smart Send Time Optimization**

ML-based send time prediction:
- Analyze open rates by hour/day
- Auto-schedule emails for optimal times
- Timezone-aware scheduling

**4. Unified Campaign Architecture**

Migrate legacy campaigns to sequence-based:
- Deprecate `campaign.strategy_key`
- All campaigns use `campaign_sequences`
- Remove dual system

---

## 8. Data Consistency Checks

### Campaign Table Integrity

**Check 1:** Orphaned sequences
```sql
SELECT cs.id, cs.campaign_id
FROM campaign_sequences cs
LEFT JOIN campaigns c ON c.id = cs.campaign_id
WHERE c.id IS NULL;
```
**Result:** Should be 0 (foreign key constraint enforces)

**Check 2:** Invalid lead counts
```sql
SELECT c.id, c.leads_count, (SELECT COUNT(*) FROM campaign_leads WHERE campaign_id = c.id) as actual
FROM campaigns c
WHERE c.leads_count != (SELECT COUNT(*) FROM campaign_leads WHERE campaign_id = c.id);
```
**Result:** Should be 0 (trigger auto-updates)

**Check 3:** Stale metrics
```sql
SELECT c.id, c.emails_sent, COUNT(e.id) as actual_sent
FROM campaigns c
LEFT JOIN emails e ON e.campaign_id = c.id AND e.direction = 'outbound'
GROUP BY c.id
HAVING c.emails_sent != COUNT(e.id);
```
**Result:** Likely many (metrics not auto-updated)

### Sequence Integrity

**Check 4:** Duplicate step numbers
```sql
SELECT campaign_id, step_number, COUNT(*)
FROM campaign_sequences
GROUP BY campaign_id, step_number
HAVING COUNT(*) > 1;
```
**Result:** Should be 0 (unique constraint)

**Check 5:** Negative metrics
```sql
SELECT id, sent_count, open_count, reply_count
FROM campaign_sequences
WHERE sent_count < 0 OR open_count < 0 OR reply_count < 0;
```
**Result:** Should be 0

**Check 6:** Opens > Sends (impossible)
```sql
SELECT id, sent_count, open_count
FROM campaign_sequences
WHERE open_count > sent_count;
```
**Result:** Should be 0 (once tracking works)

### Lead Integrity

**Check 7:** Invalid next_email_at
```sql
SELECT id, status, next_email_at
FROM campaign_leads
WHERE status IN ('completed', 'unsubscribed', 'bounced')
  AND next_email_at IS NOT NULL;
```
**Result:** Should be 0 (terminal statuses shouldn't have next send)

**Check 8:** Current step > total steps
```sql
SELECT cl.id, cl.current_step, c.sequence_count
FROM campaign_leads cl
JOIN campaigns c ON c.id = cl.campaign_id
WHERE cl.current_step > c.sequence_count;
```
**Result:** Should be 0

---

## 9. File Locations

### Campaign Creation
- **UI:** `src/app/outreach/campaigns/new/page.tsx` (810 lines)
- **API:** `src/app/api/outreach/campaigns/route.ts` (137 lines)
- **Repository:** `src/repositories/campaign-sequence.repository.ts` (369 lines)
- **Database:** `supabase/migrations/20251212_outreach_sequences.sql` (191 lines)

### Campaign Detail
- **UI:** `src/app/outreach/campaigns/[id]/page.tsx` (737 lines)
- **List UI:** `src/app/outreach/campaigns/page.tsx`
- **Service:** `src/services/campaign.service.ts` (164 lines)

### Email Sending (Generic, Not Campaign-Based)
- **Cron:** `cloudflare/src/workers/cron.ts` (lines 163-226)
- **SMTP:** `src/lib/email/send.ts` (350+ lines)
- **Templates:** `src/lib/email/templates.ts`

### Tracking (Partial Implementation)
- **Webhook:** `src/app/api/webhooks/email/route.ts` (309 lines)
- **Email Repo:** `src/repositories/email.repository.ts` (lines 177-187)
- **Sequence Repo:** `src/repositories/campaign-sequence.repository.ts` (lines 92-117)

### Cloudflare Worker (Campaign APIs - Unused)
- **Campaigns:** `cloudflare/src/workers/campaigns.ts` (510 lines)
- **Database:** `cloudflare/migrations/003_campaigns.sql`

---

## 10. Summary & Next Steps

### What Works
- Campaign creation UI (fully functional)
- Database schema (complete with triggers)
- Repository methods (comprehensive but unused)
- Basic email sending (generic, non-campaign)
- Reply webhook (partial tracking)

### What Doesn't Work
- Campaign email dispatch (not implemented)
- Open/click tracking (not implemented)
- Audience assignment UI (not implemented)
- Real-time metrics (static queries instead)
- Variant A/B testing (infrastructure exists, no usage)

### Critical Path to Production

**Phase 1: Make Campaigns Send (Week 1)**
1. Implement campaign dispatcher cron job
2. Add tracking pixel injection
3. Create tracking webhook endpoints
4. Test with single campaign

**Phase 2: Make Campaigns Manageable (Week 2)**
1. Build audience assignment modal
2. Add campaign analytics dashboard
3. Fix reply tracking to stop sequences
4. Add unsubscribe handling

**Phase 3: Optimize & Scale (Week 3+)**
1. Atomic metric counters
2. Click tracking
3. Smart send time optimization
4. Campaign templates

### Risk Assessment

**Current State:** Campaign system is **NOT PRODUCTION READY**

**Risks:**
- Campaigns appear functional but don't send emails
- No way to assign prospects without API calls
- Metrics are misleading (show 0 but imply functionality)
- Dual architecture (legacy + sequence) causes confusion
- No unsubscribe link (compliance risk)

**Recommendation:** Mark campaigns as "Beta" in UI with warning banner until dispatcher + tracking implemented.

---

## Appendix: Campaign Dispatch Pseudocode

```typescript
/**
 * Campaign Email Dispatcher
 * Runs every 5 minutes during business hours
 */
async function sendCampaignBatch(env: Env) {
  // 1. Get active campaigns
  const campaigns = await getActiveCampaigns();

  for (const campaign of campaigns) {
    // 2. Check daily limit
    const sentToday = await countEmailsSentToday(campaign.id);
    if (sentToday >= campaign.daily_limit) continue;

    // 3. Get leads ready for next email
    const leads = await findLeadsReadyForEmail(campaign.id, campaign.daily_limit - sentToday);

    for (const lead of leads) {
      // 4. Get next sequence step
      const step = await getSequenceStep(campaign.id, lead.current_step + 1);
      if (!step) {
        // No more steps - mark complete
        await markLeadComplete(lead.id);
        continue;
      }

      // 5. Select variant content
      const content = lead.assigned_variant === 'A'
        ? { subject: step.variant_a_subject, body: step.variant_a_body }
        : { subject: step.variant_b_subject, body: step.variant_b_body };

      // 6. Personalize email
      const personalized = {
        subject: replaceVariables(content.subject, lead),
        body: replaceVariables(content.body, lead)
      };

      // 7. Create email record
      const emailId = await createEmailRecord({
        prospect_id: lead.prospect_id,
        campaign_id: campaign.id,
        subject: personalized.subject,
        body: personalized.body,
        to_email: lead.prospect_email,
        direction: 'outbound',
        status: 'sent'
      });

      // 8. Send with tracking
      const result = await sendEmail({
        to: lead.prospect_email,
        subject: personalized.subject,
        body: injectTrackingPixel(personalized.body, emailId),
        emailId
      });

      if (result.success) {
        // 9. Advance lead to next step
        await advanceLeadStep(lead.id, step.delay_days, step.delay_hours);

        // 10. Increment metrics
        await incrementSequenceMetrics(step.id, 'sent_count', lead.assigned_variant);
        await incrementCampaignMetrics(campaign.id, 'emails_sent');
      } else {
        // Handle bounce
        if (result.bounceType === 'hard') {
          await markLeadBounced(lead.id);
        }
      }

      // 11. Human-like delay
      await sleep(30000 + Math.random() * 60000); // 30-90 seconds
    }
  }
}
```

---

**Audit Completed:** December 17, 2025
**Next Review:** After Phase 1 implementation (Campaign Dispatcher + Tracking)
