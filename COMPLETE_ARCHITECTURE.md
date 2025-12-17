# Jengu CRM - Complete System Architecture

**Last Updated**: December 17, 2025
**Analyzed by**: Claude Code

---

## Overview

Jengu CRM is a **hybrid architecture** with two parallel systems working together:

1. **Vercel (Next.js)** - Main web application (UI + API + daily cron)
2. **Cloudflare Workers** - Cloud-based automation (24/7 crons + email handling)

---

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         EXTERNAL TRIGGERS                            │
├─────────────────────────────────────────────────────────────────────┤
│ • cron-job.org (hourly-email every 5 min)                           │
│ • Cloudflare Cron Triggers (automated schedules)                    │
│ • Vercel Cron (daily at 7am UTC)                                    │
│ • Users (Web UI at crm.jengu.ai)                                    │
│ • Email Routing (inbound emails to Cloudflare)                      │
└─────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────┐
│                       VERCEL (crm.jengu.ai)                          │
├─────────────────────────────────────────────────────────────────────┤
│ • Next.js 16 (App Router)                                           │
│ • React 19 UI                                                        │
│ • API Routes                                                         │
│ • Daily cron (7am UTC)                                              │
│ • DuckDuckGo search proxy (for Cloudflare Workers)                  │
├─────────────────────────────────────────────────────────────────────┤
│ CRON: Daily Pipeline (7am UTC)                                      │
│   1. Job scraping → hot leads                                       │
│   2. Enrich 100 prospects/day (websites, emails)                    │
│   3. Mine reviews → pain signals                                    │
│   4. Check replies → process inbox                                  │
│   5. Follow-ups (DISABLED)                                          │
│   6. Cleanup → clear cache                                          │
└─────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────┐
│                    CLOUDFLARE WORKERS                                │
├─────────────────────────────────────────────────────────────────────┤
│ Worker Name: jengu-crm                                              │
│ • D1 Database (SQLite)                                              │
│ • KV Storage (Config + Cache)                                       │
│ • 4 Durable Objects (state management)                              │
│ • Email Routing (inbound emails)                                    │
├─────────────────────────────────────────────────────────────────────┤
│ CRON SCHEDULES:                                                      │
│ • */5 8-18 * * 1-6    → Email sending (Mon-Sat, 8am-6pm)           │
│ • 0 7 * * *           → Daily reset (counters, cleanup)              │
│ • 0 10 * * 1-5        → Follow-ups (Mon-Fri, 10am)                  │
│ • */5 6,19-23 * * *   → Enrichment (6am + 7pm-11pm daily)          │
│ • 2-59/10 * * * *     → Trigger Sales Nav enrichment (Vercel)       │
│ • */1 * * * *         → Notifications check (every minute)           │
└─────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────┐
│                           SUPABASE                                   │
├─────────────────────────────────────────────────────────────────────┤
│ PostgreSQL Database                                                  │
│ • prospects (1,000 hotels)                                          │
│ • emails (125 sent, 27 replies)                                     │
│ • campaigns (4 active)                                              │
│ • mailboxes (3 SMTP inboxes)                                        │
│ • activities (audit log)                                            │
│ • pain_signals (review mining)                                      │
│ • campaign_sequences (MISSING - need migration!)                    │
│ • campaign_leads (MISSING - need migration!)                        │
└─────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────┐
│                         EXTERNAL APIS                                │
├─────────────────────────────────────────────────────────────────────┤
│ • Grok (X.AI) → Email generation + website finding                  │
│ • Anthropic Claude → Analysis (minimal usage)                       │
│ • MillionVerifier → Email verification                              │
│ • DuckDuckGo → Free search (via Vercel proxy)                       │
│ • Google Places → 10k/month free (UNUSED for enrichment!)           │
│ • SMTP: mail.spacemail.com (3 inboxes)                             │
└─────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────┐
│                           OUTPUT                                     │
├─────────────────────────────────────────────────────────────────────┤
│ • 60 emails/day (3 inboxes × 20/day)                               │
│ • 100 prospects enriched/day (Vercel cron)                          │
│ • ~300 prospects enriched/day (Cloudflare during off-hours)        │
│ • Real-time reply processing via Email Routing                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Deployment Details

### GitHub Repository
- **Repo**: `git@github.com:eddiguesti/jengucrm.git`
- **Branch**: `main`
- **CI/CD**: GitHub Actions

### GitHub Actions CI/CD
Located at `.github/workflows/ci.yml`:
- ✅ Lint & Type Check (on push/PR)
- ✅ Unit Tests (Vitest)
- ✅ Build verification
- ❌ No auto-deploy (manual deploys)

### Vercel Deployment
- **URL**: https://crm.jengu.ai
- **Project**: Auto-deploys from GitHub `main` branch
- **Framework**: Next.js 16 (App Router)
- **Node Version**: 20
- **Cron**: Managed via `vercel.json`

#### Vercel Cron Configuration
```json
{
  "crons": [{
    "path": "/api/cron/daily",
    "schedule": "0 7 * * *"  // 7am UTC daily
  }]
}
```

**What it does**:
1. Scrapes job boards
2. Enriches 100 prospects (was 20, now fixed!)
3. Mines reviews
4. Checks email replies
5. Cleanup

**What it does NOT do**:
- ❌ Does not send emails (handled by external cron)
- ❌ Does not run continuously (once per day)

### Cloudflare Workers Deployment
- **Worker Name**: `jengu-crm`
- **Account**: (Your Cloudflare account)
- **Deploy Command**: `cd cloudflare && npx wrangler deploy`
- **Config**: `cloudflare/wrangler.toml`

#### Cloudflare Resources

**D1 Database** (SQLite):
- Name: `jengu-crm`
- ID: `c97651e6-10a6-496f-9ca9-c599a954c535`
- Purpose: Lightweight caching, not primary database

**KV Namespaces**:
1. `KV_CONFIG` - Configuration storage
   - ID: `2e46e9da15dc4e8e9fae31e3df55c446`
2. `KV_CACHE` - Temporary cache
   - ID: `f16f5b6e2511482abb881e3212a9bca8`

**Durable Objects** (State Management):
1. `WarmupCounter` - Email warmup tracking per inbox
2. `InboxState` - Inbox health monitoring
3. `RateLimiter` - API rate limiting
4. `ProspectDedup` - Deduplication logic

**Environment Variables** (Secrets):
Required (set via `wrangler secret put`):
- `GROK_API_KEY` - X.AI API for email generation
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Database access
- `VERCEL_CRON_SECRET` - Auth token for triggering Vercel APIs
- `MILLIONVERIFIER_API_KEY` - Email verification

Optional:
- `ANTHROPIC_API_KEY` - AI fallback
- `ALERT_WEBHOOK_URL` - Slack/Discord alerts
- `SMTP_INBOX_1/2/3` - Legacy fallback (not needed with Supabase)

**Environment Variables** (Public):
- `VERCEL_SEARCH_URL` = "https://crm.jengu.ai/api/search"
- `VERCEL_APP_URL` = "https://crm.jengu.ai"

---

## Cron Schedule Comparison

### Vercel Cron (Managed by Vercel)
| Schedule | Endpoint | Purpose |
|----------|----------|---------|
| 7am UTC daily | `/api/cron/daily` | Master pipeline |

### External Cron (cron-job.org - MUST BE CONFIGURED)
| Schedule | Endpoint | Purpose |
|----------|----------|---------|
| `*/5 8-18 * * 1-5` | `/api/cron/hourly-email` | Send 1 email every 5 min |
| `*/15 * * * *` | `/api/cron/sales-nav-enrichment` | Email finding |
| `*/30 8-20 * * *` | `/api/cron/mystery-shopper` | Contact discovery |
| `0 */4 * * *` | `/api/cron/check-replies` | Reply checking |

### Cloudflare Cron (Automatic, Always Running)
| Schedule | Purpose | Status |
|----------|---------|--------|
| `*/5 8-18 * * 1-6` | Email sending (Mon-Sat) | ✅ Active |
| `0 7 * * *` | Daily reset | ✅ Active |
| `0 10 * * 1-5` | Follow-ups (Mon-Fri) | ✅ Active |
| `*/5 6,19-23 * * *` | Enrichment (off-hours) | ✅ Active |
| `2-59/10 * * * *` | Trigger Sales Nav enrichment | ✅ Active |
| `*/1 * * * *` | Notifications | ✅ Active |

---

## Data Flow

### Email Sending Flow

```
1. Cloudflare Cron (every 5 min, 8am-6pm Mon-Sat)
       ↓
2. 30% random skip (human-like pattern)
       ↓
3. Query Supabase for prospects ready to email
       ↓
4. Select campaign strategy (4 active campaigns)
       ↓
5. Generate email via Grok AI
       ↓
6. Select available SMTP inbox (3 mailboxes, 20/day limit each)
       ↓
7. Send email via SMTP
       ↓
8. Record in Supabase emails table
       ↓
9. Update mailbox sent_today counter
```

**Result**: ~60 emails/day (3 inboxes × 20 each)

### Enrichment Flow (Cloudflare Workers)

```
1. Cloudflare Cron (every 5 min, 6am + 7pm-11pm)
       ↓
2. Get batch of prospects from Supabase (stage='new', no email)
       ↓
3. PHASE 1: Find Websites
   - Search DuckDuckGo via Vercel proxy (free, unlimited)
   - Use Grok AI to pick best result
   - Verify URL exists (HEAD/GET request)
   - Update prospect.website in Supabase
       ↓
4. PHASE 2: Find Emails
   - Generate email patterns (firstname.lastname@domain, etc.)
   - Verify with MillionVerifier API ($0.01 per verification)
   - Update prospect.email in Supabase
       ↓
5. Update prospect stage to 'researching'
```

**Capacity**:
- Runs 5 hours/day: 6am (1 hour) + 7pm-11pm (4 hours)
- 12 runs/hour × 5 hours = 60 runs/day
- 20 websites + 10 emails per run
- **Total: ~300 prospects/day enriched**

### Enrichment Flow (Vercel Daily Cron)

```
1. Vercel Cron (7am UTC daily)
       ↓
2. Call /api/enrich (PUT) with limit=100
       ↓
3. Get prospects from Supabase (stage='new', no email)
       ↓
4. For each prospect (if they have a website):
   - Scrape website for emails, phones, team members
   - Find decision maker contact (GM, Director, Owner)
   - Extract property info (stars, rooms, amenities)
   - Calculate score and tier
   - Update prospect in Supabase
       ↓
5. Total: 100 prospects/day enriched
```

**Limitation**: Only enriches prospects that **already have websites**

**Combined**: 100 (Vercel) + 300 (Cloudflare) = **~400 prospects/day**

---

## Email Infrastructure

### Mailboxes (3 Total)
Managed in Supabase `mailboxes` table:

| Email | Provider | Daily Limit | Warmup Stage | Status |
|-------|----------|-------------|--------------|--------|
| edd@jengu.shop | SpaceMail | 20 | 4 | Active |
| edd@jengu.space | SpaceMail | 20 | 4 | Active |
| edd@jengu.me | SpaceMail | 20 | 4 | Active |

**SMTP Server**: `mail.spacemail.com:465` (SSL)

**Total Capacity**: 60 emails/day

### Warmup Configuration
From `src/lib/constants.ts`:
```typescript
WARMUP_SCHEDULE = {
  START_DATE: "2025-12-06",
  STAGES: [{ maxDay: Infinity, limit: 60 }],
  ABSOLUTE_MAX: 60,
  PER_INBOX_LIMIT: 20,
}
```

**Current Status**:
- Day 12 of warmup
- Stage: "Building (days 8-14)"
- Daily limit: 60 emails

### Email Routing (Inbound)
Cloudflare Email Routing handles **inbound emails** in real-time:

1. Email sent to edd@jengu.shop/space/me
2. Cloudflare intercepts via Email Routing
3. Calls `handleEmail()` in Cloudflare Worker
4. Parses email, extracts reply
5. Updates Supabase (prospect replied, email thread)
6. Sends notification

**Advantage**: No IMAP needed! Real-time reply processing.

---

## Database Schema

### Supabase (Primary Database)

**Tables**:
- `prospects` (1,000 rows)
- `emails` (125 sent, 27 replies)
- `campaigns` (4 active)
- `mailboxes` (3 inboxes)
- `mailbox_daily_stats` (history)
- `activities` (audit log)
- `pain_signals` (review mining)
- ⚠️ `campaign_sequences` (MISSING!)
- ⚠️ `campaign_leads` (MISSING!)

**Missing Tables**: Need to run `supabase/migrations/fix_campaigns_tables.sql`

### Cloudflare D1 (Cache Only)
Used for:
- Temporary prospect cache
- Deduplication checking
- Rate limit tracking

**Not primary database** - Supabase is source of truth.

---

## API Integrations

### Active APIs

| Service | Purpose | Limit | Current Usage | Cost |
|---------|---------|-------|---------------|------|
| **Grok (X.AI)** | Email generation + website finding | 200/day self-limit | ~100/day | ~$30/month |
| **MillionVerifier** | Email verification | Pay-per-use | ~100/month | $1/month |
| **DuckDuckGo** | Free search | Unlimited | Active | Free |
| **SpaceMail SMTP** | Email sending | 60/day | Active | Unknown |
| **Supabase** | Database | 500MB free | Active | Free tier |

### Unused/Underutilized APIs

| Service | Limit | Status | Opportunity |
|---------|-------|--------|-------------|
| **Google Places** | 10k/month | ❌ Unused | Could find 300 hotels/day! |
| **Brave Search** | 2k/month | ❌ Not configured | Alternative to DDG |
| **Anthropic Claude** | Pay-per-use | ⚠️ Minimal | Fallback only |

**Cost Optimization**: Google Places API is **completely unused** but has 10,000 free searches/month!

---

## External Service Configuration

### cron-job.org (External Cron Service)
**Must be manually configured** - not automatic!

Required setup:
1. Create account at https://cron-job.org
2. Add jobs:
   - `/api/cron/hourly-email` - `*/5 8-18 * * 1-5`
   - `/api/cron/sales-nav-enrichment` - `*/15 * * * *`
   - `/api/cron/mystery-shopper` - `*/30 8-20 * * *`
   - `/api/cron/check-replies` - `0 */4 * * *`
3. Set header: `Authorization: Bearer {CRON_SECRET}`

**Critical**: Without this, the `/api/cron/hourly-email` won't run and **no emails will send**!

---

## Configuration Files

### Vercel
- `vercel.json` - Cron schedule
- `.env.local` - Local environment variables
- `.env.vercel.prod` - Production secrets (encrypted)

### Cloudflare
- `cloudflare/wrangler.toml` - Worker configuration
- Secrets via `wrangler secret put` command
- No `.env` files (secrets stored in Cloudflare)

### GitHub
- `.github/workflows/ci.yml` - CI/CD pipeline
- Tests + linting on every PR/push
- No auto-deploy (manual)

---

## Recent Changes (Local, Not Deployed)

Based on today's session:

1. ✅ **Disabled EMERGENCY_STOP** (was blocking all emails)
   - File: `src/lib/constants.ts:60`
   - Changed: `EMERGENCY_STOP: true` → `false`

2. ✅ **Updated daily limits** (3 mailboxes, not 4)
   - File: `src/lib/constants.ts:72-76`
   - Changed: 80/day → 60/day
   - Reason: Only 3 SMTP inboxes configured

3. ✅ **Increased enrichment** (5x faster)
   - File: `src/app/api/cron/daily/route.ts:121`
   - Changed: `limit: 20` → `limit: 100`
   - Impact: 47 days → 10 days to complete backlog

**Status**: ⚠️ **NOT DEPLOYED** - Changes only on local machine

---

## Deployment Process

### Deploying Vercel Changes

```bash
# 1. Commit changes
git add src/lib/constants.ts src/app/api/cron/daily/route.ts
git commit -m "Fix: Disable EMERGENCY_STOP, optimize enrichment to 100/day"

# 2. Push to GitHub
git push origin main

# 3. Vercel auto-deploys from main branch (within ~2 minutes)
# Or manual: vercel --prod
```

### Deploying Cloudflare Changes

```bash
cd cloudflare

# 1. Deploy worker
npx wrangler deploy

# 2. Set/update secrets (if needed)
npx wrangler secret put GROK_API_KEY
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY

# 3. Check status
npx wrangler tail  # Live logs
```

---

## Monitoring & Debugging

### Check System Status

```bash
# Overall stats
curl https://crm.jengu.ai/api/stats

# Enrichment status (Cloudflare)
curl https://jengu-crm.YOUR-SUBDOMAIN.workers.dev/enrich/status

# Test email endpoint
curl https://crm.jengu.ai/api/cron/hourly-email

# Check mailboxes
curl https://crm.jengu.ai/api/outreach/mailboxes
```

### View Logs

**Vercel Logs**:
- Dashboard: https://vercel.com/YOUR-PROJECT/logs
- Or via CLI: `vercel logs`

**Cloudflare Logs**:
```bash
cd cloudflare
npx wrangler tail jengu-crm
```

**Local Logs**:
- Next.js dev server output
- Check terminal where `npm run dev` is running

---

## Current System State

### What's Working ✅
- ✅ Vercel app deployed at crm.jengu.ai
- ✅ Cloudflare Worker deployed and running crons
- ✅ 3 SMTP mailboxes configured in Supabase
- ✅ Daily cron enriching prospects (was 20/day, soon 100/day)
- ✅ Email sending infrastructure ready
- ✅ Real-time email routing via Cloudflare
- ✅ Database with 1,000 prospects

### What's Broken/Pending ⚠️
- ⚠️ EMERGENCY_STOP enabled (local fix not deployed)
- ⚠️ External cron (cron-job.org) may not be configured
- ⚠️ Campaign tables missing (need migration)
- ⚠️ Only 25 usable emails out of 1,000 prospects
- ⚠️ Google Places API unused (10k/month wasted)
- ⚠️ Enrichment too slow (20/day → fixed locally to 100/day)

### What Needs Attention 🚨
1. **Deploy local changes** to production
2. **Run database migration** for campaign tables
3. **Verify external cron** is configured at cron-job.org
4. **Check Cloudflare enrichment** is running (off-hours)
5. **Optimize enrichment** to use Google Places API

---

## Performance Metrics

### Current State (Before Fixes)
- Emails sent this week: **0** (EMERGENCY_STOP)
- Emails sent last week: **82**
- Total emails all-time: **125**
- Reply rate: **21.6%** (27 replies)
- Prospects with usable emails: **25 / 1,000** (2.5%)
- Enrichment rate: **20/day** (too slow)

### After Fixes (Projected)
- Daily email capacity: **60/day** (3 mailboxes × 20)
- Enrichment rate: **100/day (Vercel) + 300/day (Cloudflare) = 400/day**
- Time to enrich backlog: **~3 days** (947 prospects ÷ 400/day)
- Expected usable emails: **~380** (40% success rate)
- Monthly emails: **60/day × 20 business days = 1,200**
- Expected replies: **1,200 × 21.6% = 259 replies/month**

---

## Summary

Your Jengu CRM uses a **sophisticated hybrid architecture**:

### Two Parallel Systems
1. **Vercel** - User-facing web app + daily enrichment
2. **Cloudflare** - 24/7 automation + email handling

### Data Flow
- **Prospects**: Supabase → Cloudflare enrichment → Vercel enrichment → Email campaigns
- **Emails**: Cloudflare sends → Supabase stores → Cloudflare routes replies
- **Monitoring**: All systems → Supabase activities table

### Key Insight
The system was **designed to scale** but has **conservative limits** holding it back:
- 20 prospects/day enrichment (now 100)
- 80/day email limit (now 60, matched to 3 mailboxes)
- EMERGENCY_STOP enabled (now disabled)
- Google Places API unused (10k/month available)

After today's fixes and proper deployment, the system will operate at **full capacity**!
