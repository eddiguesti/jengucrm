# Jengu CRM - Complete System Architecture

## Executive Summary

**Jengu CRM** is an AI-powered B2B hotel outreach automation system. It automates the entire sales pipeline from prospect discovery to meeting booking through personalized, AI-generated cold emails.

### Goals
1. **Find hotel prospects** via job boards, LinkedIn Sales Navigator, manual imports
2. **Enrich prospects** with GM names, emails, websites, and pain signals
3. **Send personalized cold emails** using AI (Grok) to generate content
4. **Handle replies automatically** and detect engagement
5. **Send follow-ups** to non-responders on a schedule
6. **Track everything** for optimization and reporting

---

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         JENGU CRM ARCHITECTURE                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌─────────────────────┐          ┌──────────────────────┐            │
│   │   VERCEL (Next.js)  │          │  CLOUDFLARE WORKERS  │            │
│   │                     │          │                      │            │
│   │  • Web UI           │←------→  │  • Email Sending     │            │
│   │  • API Endpoints    │          │  • Enrichment        │            │
│   │  • SMTP Proxy       │          │  • Cron Jobs (24/7)  │            │
│   │  • Email Generation │          │  • D1 Database       │            │
│   └──────────┬──────────┘          │  • Durable Objects   │            │
│              │                     └──────────┬───────────┘            │
│              │                                │                         │
│              └─────────────┬─────────────────┘                         │
│                            │                                            │
│              ┌─────────────▼───────────────┐                           │
│              │    SUPABASE (PostgreSQL)    │                           │
│              │                             │                           │
│              │  • Main Database            │                           │
│              │  • prospects, emails        │                           │
│              │  • campaigns, mailboxes     │                           │
│              │  • Real-time API            │                           │
│              └─────────────────────────────┘                           │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Two Deployment Models

| Component | Purpose | Database | Email Sending |
|-----------|---------|----------|---------------|
| **Vercel/Next.js** | Web UI, API endpoints, SMTP proxy | Supabase (PostgreSQL) | Via SMTP proxy |
| **Cloudflare Workers** | 24/7 cron jobs, enrichment, email sending | D1 (SQLite) | Via Vercel proxy |

**Why both?**
- Cloudflare Workers can't do direct SMTP (no TCP sockets)
- Vercel proxies SMTP connections for Cloudflare
- Cloudflare runs 24/7 with no cold starts
- Data syncs between Supabase and D1

---

## The Prospect Journey

```
┌──────────────────────────────────────────────────────────────────────────┐
│                     PROSPECT LIFECYCLE FLOW                              │
└──────────────────────────────────────────────────────────────────────────┘

    ┌──────────────┐
    │   SOURCES    │  Job Boards, LinkedIn Sales Navigator, Manual Import
    └──────┬───────┘
           │
           ▼
    ┌──────────────┐
    │  stage: NEW  │  Has: company name, location
    │              │  Missing: website, email, contact name
    └──────┬───────┘
           │
           │  ENRICHMENT (Cloudflare Workers - Off-hours 6am-7am, 7pm-11pm)
           │  • Find website via DuckDuckGo + Grok AI
           │  • Find email via MillionVerifier patterns
           │  • Extract contact name from website
           │
           ▼
    ┌──────────────┐
    │   ENRICHED   │  Has: website, contact email, contact name
    │              │  Ready for: campaign assignment
    └──────┬───────┘
           │
           │  USER ASSIGNS TO CAMPAIGN (UI or script)
           │
           ▼
    ┌──────────────┐
    │   CAMPAIGN   │  In: campaign_leads table
    │    LEAD      │  Status: active, current_step: 0
    └──────┬───────┘
           │
           │  EMAIL SENDING (Cloudflare Workers - 8am-6pm Mon-Sat)
           │  • Check warmup limit (per mailbox)
           │  • Generate email with Grok AI
           │  • Send via SMTP through Vercel proxy
           │
           ▼
    ┌──────────────┐
    │  CONTACTED   │  Email sent, waiting for reply
    │              │  Follow-up scheduled for 3 days later
    └──────┬───────┘
           │
           │  IF NO REPLY after 3 days → FOLLOW-UP CRON (10am weekdays)
           │  IF REPLY detected → stage: ENGAGED
           │
           ├────────────────────────────────┐
           │                                │
           ▼                                ▼
    ┌──────────────┐                ┌──────────────┐
    │   ENGAGED    │                │  COMPLETED   │
    │              │                │              │
    │  Reply recv'd│                │ No reply x3  │
    └──────┬───────┘                └──────────────┘
           │
           │  USER BOOKS MEETING
           │
           ▼
    ┌──────────────┐
    │   MEETING    │  Success! Prospect converted
    └──────────────┘
```

---

## Core Components

### 1. Prospects

**What is a prospect?**
A hotel contact that may become a customer.

**Key Fields:**
- `name` - Hotel name (e.g., "Hilton London")
- `city`, `country` - Location
- `contact_name` - GM/Manager name
- `email` - Personal email (not info@)
- `website` - Official website
- `stage` - new → enriched → contacted → engaged → meeting → won/lost
- `tier` - hot/warm/cold (priority)
- `score` - 0-100 (for sorting)

**Where stored:**
- **Supabase**: Full records with all enrichment data
- **D1 (Cloudflare)**: Minimal subset for worker operations

---

### 2. Campaigns

**What is a campaign?**
An email sequence strategy with A/B testing.

**Types:**
- `legacy` - Single email (old system)
- `sequence` - Multi-step with delays (new system)

**Key Fields:**
- `name` - "Cold: Direct & Human"
- `strategy_key` - Used for email generation prompts
- `active` - true/false
- `daily_limit` - Max emails/day for this campaign

---

### 3. Campaign Sequences

**What is a sequence?**
A step in a multi-email campaign.

**Example 3-Step Sequence:**
```
Step 1 (delay: 0 days)
  Subject: "Quick question about {{name}}'s operations"
  Body: Initial outreach...

Step 2 (delay: 3 days)
  Subject: "Re: {{name}} - following up"
  Body: Follow-up if no reply...

Step 3 (delay: 5 days)
  Subject: "Last note about {{name}}"
  Body: Final follow-up...
```

**Key Fields:**
- `campaign_id` - Parent campaign
- `step_number` - 1, 2, 3...
- `delay_days`, `delay_hours` - Wait time before sending
- `variant_a_subject/body` - Template A
- `variant_b_subject/body` - Template B (for A/B testing)
- `use_ai_generation` - If true, Grok generates per prospect

---

### 4. Campaign Leads

**What is a campaign lead?**
The junction that links a prospect to a campaign.

**Key Fields:**
- `campaign_id` - Which sequence to follow
- `prospect_id` - Who to email
- `mailbox_id` - Which inbox sends
- `current_step` - 0=not started, 1+=step number
- `status` - active/paused/completed/replied/bounced
- `next_email_at` - When to send next step

**The Critical Link:**
```
campaign_leads connects:
  → campaigns (sequence templates)
  → prospects (recipients)
  → mailboxes (sender accounts)
```

---

### 5. Mailboxes

**What is a mailbox?**
An SMTP email account for sending.

**Current Mailboxes:**
- `edd@jengu.me`
- `edd@jengu.shop`
- `edd@jengu.space`

**Key Fields:**
- `email`, `smtp_host`, `smtp_pass` - Credentials
- `warmup_stage` - 1-5 (increases over 5 weeks)
- `daily_limit` - Based on warmup stage (5→10→15→20→25)
- `sent_today` - Counter (resets at midnight)
- `health_score` - 0-100 (decreases on bounces)
- `status` - active/warming/paused/error

**Warmup Schedule:**
| Week | Stage | Daily Limit |
|------|-------|-------------|
| 1 | 1 | 5 emails |
| 2 | 2 | 10 emails |
| 3 | 3 | 15 emails |
| 4 | 4 | 20 emails |
| 5+ | 5 | 25 emails |

---

## Cron Jobs - What Runs When

### Cloudflare Workers (wrangler.toml)

| Pattern | Time | Purpose |
|---------|------|---------|
| `*/5 8-18 * * 1-6` | Every 5min, 8am-6pm Mon-Sat | **Email Sending** |
| `0 7 * * *` | 7am daily | **Daily Pipeline** (reset counters) |
| `0 10 * * 1-5` | 10am weekdays | **Follow-up Emails** |
| `*/5 6,19-23 * * *` | Every 5min, 6-7am + 7pm-11pm | **Enrichment** |

### Vercel (vercel.json)

| Pattern | Time | Purpose |
|---------|------|---------|
| `0 7 * * *` | 7am UTC | Daily master pipeline |

### External Cron (cron-job.org - Optional/Legacy)

| Endpoint | Schedule | Purpose |
|----------|----------|---------|
| `/api/cron/hourly-email` | `*/5 8-18 * * 1-5` | Send 1 email (alternative to Cloudflare) |

---

## Email Sending Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│                       EMAIL SENDING FLOW                                  │
└──────────────────────────────────────────────────────────────────────────┘

Cloudflare Cron (every 5 min, 8am-6pm)
            │
            ▼
    ┌───────────────────┐
    │  Check WarmupCounter  │  ← Durable Object
    │  (daily limit reached?)│
    └───────────┬───────────┘
                │
                ▼ NO (can send)
    ┌───────────────────┐
    │  Query D1 Database │
    │  Find eligible prospects:
    │  • stage: enriched/ready
    │  • has valid email
    │  • not bounced
    │  • not contacted in 3 days
    └───────────┬───────────┘
                │
                ▼
    ┌───────────────────┐
    │  Safety Checks    │
    │  • Email format valid
    │  • Not in bounce_list
    │  • Spam keyword check
    └───────────┬───────────┘
                │
                ▼
    ┌───────────────────┐
    │  Generate Email   │  ← Grok AI
    │  with personalization:
    │  • Hotel name, city
    │  • Contact name
    │  • Pain signals
    └───────────┬───────────┘
                │
                ▼
    ┌───────────────────┐
    │  Get Available Inbox │  ← InboxState Durable Object
    │  • status: active
    │  • health_score > 50
    │  • under daily limit
    └───────────┬───────────┘
                │
                ▼
    ┌───────────────────┐
    │  Send via SMTP    │
    │  (Cloudflare → Vercel → SMTP)
    └───────────┬───────────┘
                │
        ┌───────┴───────┐
        │               │
        ▼ SUCCESS       ▼ FAILURE
┌──────────────┐  ┌──────────────┐
│ Update DB:   │  │ Handle Bounce:│
│ • sent_today++│ │ • health_score-10
│ • stage=contacted │ │ • Add to bounce_list
│ • Create email│  │ • Maybe pause inbox
└──────────────┘  └──────────────┘
```

---

## Enrichment Pipeline

```
┌──────────────────────────────────────────────────────────────────────────┐
│                       ENRICHMENT PIPELINE                                 │
└──────────────────────────────────────────────────────────────────────────┘

Runs: 6-7am + 7pm-11pm (off-hours, doesn't conflict with email sending)

STAGE 1: Find Websites
─────────────────────────────────────────────────
Input: Prospects with website=NULL

Process:
  1. Search DuckDuckGo: "[hotel name] [city] official website"
  2. Get top 5-10 results
  3. Send to Grok AI: "Pick the most likely official website"
  4. Verify URL exists (HEAD request)
  5. Update prospect.website

Success Rate: ~90%


STAGE 2: Find Emails
─────────────────────────────────────────────────
Input: Prospects with website but email=NULL

Process:
  1. Extract domain from website (hilton.com)
  2. Get contact name (from stage 1 or website scraping)
  3. Generate email patterns:
     • jane.smith@hilton.com
     • jane@hilton.com
     • jsmith@hilton.com
     • j.smith@hilton.com
  4. Verify each with MillionVerifier API
  5. Pick first verified pattern

Success Rate: ~70%


STAGE 3: Find Pain Signals (Optional)
─────────────────────────────────────────────────
Input: Prospects with website

Process:
  1. Search Google Maps for reviews
  2. Parse 1-2 star reviews
  3. Extract pain points: "noisy", "staff rude", etc.
  4. Store in pain_signals table

Use: Personalize emails with relevant pain points
```

---

## Database Schema (Key Tables)

### Supabase (PostgreSQL)

```sql
-- Core Tables
prospects        -- Hotel contacts (11,000+)
emails           -- All sent/received (137 sent)
campaigns        -- Email strategies (5 campaigns)
campaign_sequences  -- Multi-step templates (12 sequences)
campaign_leads   -- Prospect-campaign links (69 assigned)
mailboxes        -- SMTP accounts (3 active)
activities       -- Audit log

-- Enrichment
pain_signals     -- Review-mined insights
enrichment_stats -- Progress tracking

-- Support
bounce_list      -- Hard bounces (blocked)
notifications    -- Pending alerts
```

### D1 (Cloudflare SQLite)

```sql
-- Lightweight mirror for Workers
prospects        -- Minimal subset
emails           -- Send history
mailboxes        -- Fallback config
bounce_list      -- Hard blocks
```

---

## Why Emails Weren't Sending

The diagnosis revealed **3 blockers**:

| Blocker | Status | Fix |
|---------|--------|-----|
| Campaigns have no sequences | ✅ FIXED | Added 3-step sequences to all 4 campaigns |
| Campaigns have no leads | ✅ FIXED | Assigned 69 prospects with valid emails |
| Cron jobs not running | ⏳ PENDING | Cloudflare Workers need to be deployed/verified |

**Current State After Fixes:**
- 4 campaigns with 3 sequences each (12 total)
- 69 prospects assigned to campaigns
- 3 mailboxes ready (60 emails/day capacity)
- **Only need cron to trigger**

---

## How to Verify Everything Works

### 1. Check Campaigns Have Sequences
```bash
npx tsx scripts/diagnose-no-emails.ts
# Should show: Email sequences: 3 for each campaign
```

### 2. Check Leads Assigned
```bash
# Should show: Assigned leads: 17-18 per campaign
```

### 3. Check Mailboxes Ready
```bash
# Should show: 3 active mailboxes, 60 daily capacity
```

### 4. Verify Cloudflare Cron Running
```bash
# Check Cloudflare dashboard → Workers & Pages → jengu-crm → Logs
# Should see cron invocations every 5 minutes during business hours
```

### 5. Test Manual Email Send
```bash
curl -X POST https://crm.jengu.ai/api/cron/hourly-email \
  -H "Authorization: Bearer simple123"
```

---

## Key Files Reference

| Component | File |
|-----------|------|
| Cloudflare cron | `/cloudflare/src/workers/cron.ts` |
| Email sender (CF) | `/cloudflare/src/lib/email-sender.ts` |
| Email sender (Vercel) | `/src/lib/email/send.ts` |
| Warmup counter | `/cloudflare/src/durable-objects/warmup-counter.ts` |
| Enrichment | `/cloudflare/src/workers/enrich.ts` |
| Campaign repository | `/src/repositories/campaign-sequence.repository.ts` |
| Constants/warmup | `/src/lib/constants.ts` |
| Cron config (CF) | `/cloudflare/wrangler.toml` |
| Cron config (Vercel) | `/vercel.json` |

---

## Summary: What Should Happen

1. **Daily at 7am**: Reset counters, advance warmup stages
2. **Every 5min, 8am-6pm**: Send 1-3 emails from campaign leads
3. **Off-hours (6am, 7pm-11pm)**: Enrich new prospects (find websites/emails)
4. **10am weekdays**: Send follow-ups to non-responders
5. **Real-time**: Detect replies via email routing webhook
6. **Continuous**: Track opens, bounces, health scores

**End Result**: Automated cold email machine that sends personalized AI emails to hotel GMs, follows up automatically, and tracks everything.
