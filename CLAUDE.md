# Jengu CRM - AI-Powered Hotel Outreach System

## Quick Reference

| Item               | Value                                       |
| ------------------ | ------------------------------------------- |
| **Production URL** | https://crm.jengu.ai                        |
| **Database**       | Supabase (PostgreSQL)                       |
| **Hosting**        | Vercel                                      |
| **Email Provider** | Azure Graph API + SMTP rotation             |
| **AI Models**      | Grok (x.ai) for emails, Claude for analysis |

## System Overview

Jengu CRM is an automated B2B sales outreach system targeting hotels. It:

1. **Scrapes** job boards and LinkedIn Sales Navigator for hotel prospects
2. **Enriches** prospects with GM names, emails, and pain signals
3. **Sends** AI-generated personalized cold emails
4. **Handles** replies and follow-ups automatically

---

## Architecture

```
src/
├── app/
│   ├── api/                    # API routes (Next.js App Router)
│   │   ├── cron/               # Scheduled job endpoints
│   │   │   ├── daily/          # Master pipeline (7am UTC via Vercel)
│   │   │   ├── hourly-email/   # Send emails (external cron)
│   │   │   ├── check-replies/  # Check inbox for replies
│   │   │   ├── follow-up/      # Send follow-up emails
│   │   │   ├── sales-nav-enrichment/  # Find emails for Sales Nav leads
│   │   │   └── mystery-shopper/       # Contact discovery via inquiries
│   │   ├── auto-email/         # Core email sending logic
│   │   ├── prospects/          # CRUD for prospects
│   │   ├── emails/             # Email history
│   │   └── stats/              # Dashboard statistics
│   │
│   ├── (pages)/                # UI pages
│   │   ├── prospects/          # Prospect list & detail views
│   │   ├── emails/             # Email history
│   │   ├── sales-navigator/    # Sales Nav import UI
│   │   └── pipeline/           # Automation dashboard
│
├── lib/                        # Core business logic
│   ├── email/                  # Email sending (Azure, SMTP, tracking)
│   ├── enrichment/             # Prospect enrichment pipeline
│   ├── scrapers/               # Job board scrapers
│   ├── constants.ts            # All magic numbers & config
│   └── ai-gateway.ts           # AI model routing (Grok/Claude)
│
├── services/                   # Business logic layer
│   ├── email.service.ts        # Email generation & filtering
│   └── campaign.service.ts     # Campaign management
│
└── repositories/               # Database access layer
    ├── prospect.repository.ts
    ├── email.repository.ts
    └── activity.repository.ts
```

---

## Cron Jobs

### Vercel-Managed (vercel.json)

| Endpoint          | Schedule    | Purpose                                         |
| ----------------- | ----------- | ----------------------------------------------- |
| `/api/cron/daily` | 7:00 AM UTC | Master pipeline - scrapes, enriches, follow-ups |

### External Cron (cron-job.org) - MUST BE CONFIGURED

| Endpoint                         | Schedule                         | Purpose                         |
| -------------------------------- | -------------------------------- | ------------------------------- |
| `/api/cron/hourly-email`         | **Every 5 min, 8am-6pm Mon-Fri** | Send outreach emails            |
| `/api/cron/check-replies`        | Every 1 min                      | Check for inbound replies       |
| `/api/cron/sales-nav-enrichment` | Every 5 min                      | Find emails for Sales Nav leads |
| `/api/cron/follow-up`            | 10am UTC Mon-Fri                 | Send follow-up nudges           |

### Current cron-job.org Configuration

```
URL: https://crm.jengu.ai/api/cron/hourly-email
Method: GET
Header: Authorization: Bearer {CRON_SECRET}
Schedule: */5 8-18 * * 1-5  (every 5 min, 8am-6pm, Mon-Fri)
```

**IMPORTANT**: The hourly-email cron must run every 5 minutes during business hours, NOT once per day!

---

## Email System

### Sending Infrastructure

1. **Primary**: Azure Graph API (`edd@jengu.ai`)
2. **Secondary**: SMTP inbox rotation (4 inboxes, 20 emails/day each)

### Warmup Configuration (src/lib/constants.ts)

```typescript
WARMUP_SCHEDULE = {
  START_DATE: "2025-12-06",
  ABSOLUTE_MAX: 80, // 4 inboxes × 20 emails
};
```

### Email Filtering

Prospects are filtered before sending:

- Generic emails rejected: `info@`, `reservations@`, `contact@`, etc.
- Bounced emails excluded
- Already-emailed prospects skipped
- Business hours check (9am-5pm in prospect's timezone)

### Human-Like Sending

- Cron called every 5 minutes
- 30% random skip rate for natural gaps
- Random delays: 30-90 seconds between emails

---

## Database Schema (Supabase)

### Key Tables

| Table                   | Purpose                             |
| ----------------------- | ----------------------------------- |
| `prospects`             | Hotel contacts with enrichment data |
| `emails`                | All sent/received emails            |
| `activities`            | Activity log for audit trail        |
| `campaigns`             | Email campaign definitions          |
| `pain_signals`          | Review-mined pain points            |
| `mystery_shopper_queue` | Pending contact discovery requests  |

### Prospect Stages

```
new → enriched → contacted → engaged → meeting → won/lost
```

### Prospect Tiers

- `hot`: High-value prospects (hiring, pain signals)
- `warm`: Medium priority
- `cold`: Lower priority

---

## Environment Variables

### Required

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Azure Email (primary)
AZURE_TENANT_ID=
AZURE_CLIENT_ID=
AZURE_CLIENT_SECRET=
AZURE_MAIL_FROM=edd@jengu.ai

# AI
XAI_API_KEY=              # Grok for email generation
ANTHROPIC_API_KEY=        # Claude for analysis

# Cron Auth
CRON_SECRET=              # Bearer token for cron endpoints
```

### Optional

```bash
# SMTP Inboxes (rotation)
SMTP_INBOX_1=email|password|host|port|name
SMTP_INBOX_2=...
SMTP_DAILY_LIMIT=20

# Email Finding
HUNTER_API_KEY=           # Hunter.io
MILLIONVERIFIER_API_KEY=  # Email verification

# Mystery Shopper
GMAIL_SMTP_USER=
GMAIL_SMTP_PASS=
GMAIL_IMAP_USER=
GMAIL_IMAP_PASS=

# Features
TIMEZONE_AWARE_SENDING=true
```

---

## API Endpoints

### Core Operations

| Method | Endpoint              | Purpose              |
| ------ | --------------------- | -------------------- |
| GET    | `/api/prospects`      | List prospects       |
| GET    | `/api/prospects/[id]` | Get prospect detail  |
| POST   | `/api/auto-email`     | Send outreach emails |
| GET    | `/api/stats`          | Dashboard statistics |
| GET    | `/api/emails`         | Email history        |

### Enrichment

| Method | Endpoint               | Purpose                 |
| ------ | ---------------------- | ----------------------- |
| POST   | `/api/enrich`          | Enrich a prospect       |
| POST   | `/api/find-email`      | Find email for prospect |
| POST   | `/api/sales-navigator` | Import Sales Nav leads  |

### Testing

| Method | Endpoint              | Purpose                       |
| ------ | --------------------- | ----------------------------- |
| POST   | `/api/test-email`     | Send test email               |
| POST   | `/api/simulate-email` | Preview email without sending |
| GET    | `/api/debug-smtp`     | Check SMTP status             |

---

## Scripts (scripts/)

### Database

- `check-db.ts` - Query database status
- `check-today-emails.ts` - See today's email activity
- `query-prospects.ts` - Query prospects

### Enrichment

- `import-sales-nav.ts` - Import from Sales Navigator
- `backfill-sales-nav-scores.ts` - Score existing prospects
- `fix-countries.ts` - Fix country data

### Testing

- `test-grok-email.ts` - Test Grok email generation
- `test-millionverifier.ts` - Test email verification
- `debug-auto-email.ts` - Debug email sending

### Cleanup

- `cleanup-chains-and-dupes.ts` - Remove hotel chain HQs and duplicates
- `dedupe-sales-nav.ts` - Deduplicate Sales Nav imports

---

## Common Tasks

### Check Today's Emails

```bash
npx tsx scripts/check-today-emails.ts
```

### Debug Why Emails Aren't Sending

1. Check cron is running: Look at cron-job.org dashboard
2. Check eligible prospects: `npx tsx scripts/query-prospects.ts`
3. Check warmup limit: Look at `src/lib/constants.ts`
4. Test endpoint: `curl https://crm.jengu.ai/api/cron/hourly-email -H "Authorization: Bearer $CRON_SECRET"`

### Manually Send Emails

```bash
curl -X POST https://crm.jengu.ai/api/auto-email \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"max_emails": 5}'
```

### Check Database

```bash
npx tsx scripts/check-db.ts
```

---

## Troubleshooting

### No emails sending

1. **External cron not configured** - hourly-email must run every 5 min
2. **All prospects have generic emails** - need personal emails (not info@)
3. **Warmup limit reached** - check daily limit in constants.ts
4. **CRON_SECRET mismatch** - verify Bearer token

### Emails bouncing

1. Check MillionVerifier API key
2. Review bounced emails in database
3. Check domain reputation

### Cron jobs failing

1. Check Vercel function logs
2. Verify environment variables in Vercel dashboard
3. Check cron-job.org execution history

---

## File Locations

| What                | Where                           |
| ------------------- | ------------------------------- |
| Email sending logic | `src/lib/email/send.ts`         |
| Warmup config       | `src/lib/constants.ts`          |
| AI email generation | `src/lib/ai-gateway.ts`         |
| Prospect filtering  | `src/services/email.service.ts` |
| Database queries    | `src/repositories/*.ts`         |
| Cron endpoints      | `src/app/api/cron/*/route.ts`   |

---

## Cloudflare Workers (cloudflare/)

The system has been migrated to run on Cloudflare Workers for 24/7 cloud-based operation.

### Architecture

```
cloudflare/
├── src/
│   ├── index.ts              # Main entry point (HTTP, cron, email handlers)
│   ├── types/index.ts        # TypeScript types and Env interface
│   ├── workers/
│   │   ├── api.ts            # HTTP API routes
│   │   ├── cron.ts           # Cron job handlers
│   │   ├── enrich.ts         # Enrichment worker (websites + emails)
│   │   └── email-handler.ts  # Inbound email processing
│   ├── lib/
│   │   ├── ai-gateway.ts     # AI model routing
│   │   ├── email-sender.ts   # SMTP email sending
│   │   └── email-service.ts  # Email business logic
│   └── durable-objects/
│       ├── warmup-counter.ts # Daily email limits per inbox
│       ├── inbox-state.ts    # Inbox health tracking
│       ├── rate-limiter.ts   # API rate limiting
│       └── prospect-dedup.ts # Deduplication
├── migrations/               # D1 database migrations
└── wrangler.toml            # Cloudflare config
```

### Cron Schedule (Cloudflare)

| Pattern               | Purpose                                      |
| --------------------- | -------------------------------------------- |
| `*/5 8-18 * * 1-6`    | Email sending (8am-6pm Mon-Sat, every 5 min) |
| `0 7 * * *`           | Daily pipeline (reset counters, cleanup)     |
| `0 10 * * 1-5`        | Follow-up emails (10am weekdays)             |
| `*/5 6,19-23 * * *`   | Enrichment (6am + 7pm-11pm, every 5 min)     |

### Enrichment System

Cloud-based enrichment runs automatically during off-hours. Two-step process:

1. **Find Websites** (DuckDuckGo + Grok):
   - Search DDG for "[company name] [location] official website"
   - Use Grok AI to pick the best result from search results
   - Verify URL exists with HEAD/GET request
   - ~90% success rate

2. **Find Emails** (MillionVerifier):
   - Generate email patterns from contact name + domain
   - Test patterns: `firstname.lastname@`, `firstname@`, `firstnamelastname@`, `f.lastname@`
   - Verify with MillionVerifier API

### Enrichment Endpoints (Cloudflare Worker)

| Method | Endpoint           | Purpose                         |
| ------ | ------------------ | ------------------------------- |
| POST   | `/enrich/auto`     | Run both websites + emails      |
| POST   | `/enrich/websites` | Find websites only (batch of 20)|
| POST   | `/enrich/emails`   | Find emails only (batch of 10)  |
| GET    | `/enrich/status`   | Check enrichment progress       |

### Environment Variables (Cloudflare)

Set via `wrangler secret put`:

```bash
# Required
wrangler secret put GROK_API_KEY           # x.ai API key (email gen + website finder)

# Supabase (for mailbox management via UI)
wrangler secret put SUPABASE_URL              # e.g., https://xxx.supabase.co
wrangler secret put SUPABASE_SERVICE_ROLE_KEY # Service role key (not anon key!)

# Legacy (fallback if Supabase not configured)
wrangler secret put SMTP_INBOX_1           # format: email|password|host|port|displayName
wrangler secret put SMTP_INBOX_2
wrangler secret put SMTP_INBOX_3

# Enrichment
wrangler secret put MILLIONVERIFIER_API_KEY  # Email pattern verification

# Optional
wrangler secret put ANTHROPIC_API_KEY      # AI fallback
wrangler secret put ALERT_WEBHOOK_URL      # Slack/Discord alerts
```

### Mailbox Management (Supabase Integration)

Mailboxes are now managed via the UI at `/outreach/mailboxes` and stored in Supabase.
Cloudflare Workers automatically read from Supabase and sync stats.

**How it works:**
1. UI creates/updates mailboxes in Supabase `mailboxes` table
2. Cloudflare Workers fetch active mailboxes from Supabase on startup
3. After each email send, Workers update `sent_today` in Supabase
4. On bounce, Workers update `health_score` and may auto-pause
5. Daily at 7am, counters reset and warmup stage advances

**Setup:**
```bash
# 1. Create mailboxes table in Supabase
# Run: supabase/migrations/20251212_outreach_mailboxes.sql

# 2. Import existing mailboxes
npx tsx scripts/setup-cloudflare-supabase.ts

# 3. Set Cloudflare secrets
cd cloudflare
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler deploy
```

### Deploy to Cloudflare

```bash
cd cloudflare
npx wrangler deploy
```

---

## Outreach System (/outreach)

New SmartLead-style email outreach system with mailbox management and warmup.

### UI Pages

| Path                    | Purpose                        |
| ----------------------- | ------------------------------ |
| `/outreach/mailboxes`   | Manage email accounts, warmup  |
| `/outreach/campaigns`   | Email sequences (coming soon)  |
| `/outreach/inbox`       | Unified inbox (coming soon)    |
| `/outreach/analytics`   | Performance metrics            |

### Mailbox Features

- Add/edit/remove email accounts (SMTP + IMAP)
- Visual warmup progress (5 stages over 5 weeks)
- Health monitoring with auto-pause on high bounce rates
- Daily sending limits that scale with warmup

### Warmup Schedule

| Week | Daily Limit | Cumulative |
|------|-------------|------------|
| 1    | 5           | 35         |
| 2    | 10          | 105        |
| 3    | 15          | 210        |
| 4    | 20          | 350        |
| 5+   | 25          | Graduated  |

### Database Tables (Supabase)

| Table                 | Purpose                    |
| --------------------- | -------------------------- |
| `mailboxes`           | Email account configs      |
| `mailbox_daily_stats` | Historical stats per day   |

---

## Local Scripts (scripts/)

For manual/local enrichment when needed:

### Import Sales Navigator CSVs

```bash
# Import specific file
npx tsx scripts/import-sales-nav-csv.ts "/path/to/file.csv"

# Import all new CSVs from sales navigator folder
npx tsx scripts/import-sales-nav-csv.ts --all
```

### Find Websites (Local)

```bash
# Find websites for 50 prospects (default)
npx tsx scripts/find-websites-grok.ts

# Find websites for 500 prospects
npx tsx scripts/find-websites-grok.ts --limit=500

# Dry run (no database updates)
npx tsx scripts/find-websites-grok.ts --dry-run
```

### Find Emails (Local)

```bash
# Find emails for 50 prospects
npx tsx scripts/enrich-with-millionverifier.ts

# Find emails for 100 prospects
npx tsx scripts/enrich-with-millionverifier.ts --limit=100
```

### Full Enrichment Pipeline (Local)

```bash
# Run overnight enrichment
npx tsx scripts/enrich-all.ts

# Or use the shell script with nohup
nohup bash scripts/overnight-enrich.sh &
```

### Convert Numbers to CSV

Sales Navigator exports .numbers files. Convert with:

```bash
cd "/Users/edd/Documents/Jengu/sales navigator"
# Convert specific file
osascript -e 'tell application "Numbers" to open POSIX file "/path/to/file.numbers"'
osascript -e 'tell application "Numbers" to export front document to POSIX file "/path/to/output.csv" as CSV'
```
