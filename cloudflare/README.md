# Jengu CRM - Cloudflare Workers Edition

A globally distributed, fault-tolerant email outreach system built on Cloudflare's edge infrastructure.

**NOTE: This system uses SMTP inboxes only (Azure/jengu.ai is disabled)**

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CLOUDFLARE EDGE                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  CRON Triggers ──► Worker ──► Durable Objects                       │
│       │              │              │                                │
│       │              │              ├─ WarmupCounter (email limits)  │
│       │              │              ├─ InboxState (circuit breaker)  │
│       │              │              ├─ RateLimiter (AI quotas)       │
│       │              │              └─ ProspectDedup (bloom filter)  │
│       │              │                                               │
│       │              └──► D1 (SQLite) ◄── KV Cache                   │
│       │                                                              │
│       ├── */5 8-18 * * 1-6  (Email sending)                         │
│       ├── 0 7 * * *         (Daily pipeline)                        │
│       ├── */1 * * * *       (Reply checking - DISABLED)             │
│       └── 0 10 * * 1-5      (Follow-ups)                            │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Quick Start

### 1. Prerequisites

```bash
# Install Wrangler CLI
npm install -g wrangler

# Login to Cloudflare
wrangler login
```

### 2. Clone and Install

```bash
cd cloudflare
npm install
```

### 3. Create Infrastructure

```bash
# Create D1 database (if not already created)
wrangler d1 create jengu-crm
# The database_id is already in wrangler.toml: c97651e6-10a6-496f-9ca9-c599a954c535

# Create KV namespaces (if not already created)
wrangler kv:namespace create KV_CONFIG
wrangler kv:namespace create KV_CACHE
# IDs are already in wrangler.toml
```

### 4. Configure Secrets (REQUIRED)

```bash
# AI API Keys (at least one required)
wrangler secret put GROK_API_KEY        # Primary - Grok for email generation
wrangler secret put ANTHROPIC_API_KEY   # Fallback - Claude

# SMTP Inboxes (format: email|password|host|port|displayName)
# Example: team1@yourdomain.com|password123|smtp.yourdomain.com|587|Team One
wrangler secret put SMTP_INBOX_1
wrangler secret put SMTP_INBOX_2
wrangler secret put SMTP_INBOX_3

# Enrichment (recommended)
wrangler secret put MILLIONVERIFIER_API_KEY  # Email pattern verification
wrangler secret put VERCEL_SEARCH_SECRET     # Optional: protect /api/search on Vercel

# Sales Navigator CSV enrichment (recommended)
# This lets Cloudflare Cron trigger your Next.js/Vercel Sales Nav enrichment runner endpoint.
wrangler secret put VERCEL_CRON_SECRET       # Must match Next.js CRON_SECRET

# NOTE: Azure secrets are NOT required - Azure sending is disabled
# The following are optional if you want to keep them for future use:
# wrangler secret put AZURE_TENANT_ID
# wrangler secret put AZURE_CLIENT_ID
# wrangler secret put AZURE_CLIENT_SECRET
# wrangler secret put AZURE_MAIL_FROM

# Optional
wrangler secret put ALERT_WEBHOOK_URL   # Slack/Discord webhook for alerts
```

### 5. Deploy Database Schema

```bash
# Run the schema migration
wrangler d1 execute jengu-crm --file=./migrations/001_schema.sql

# Seed with default campaigns
wrangler d1 execute jengu-crm --file=./migrations/002_seed.sql

# Optional: Import existing data
wrangler d1 execute jengu-crm --file=./migrations/003_campaigns.sql
# For prospects, you may need to split the file - see migrations/004_prospects_part_*
```

### 6. Deploy Worker

```bash
npm run deploy
```

### 7. Initialize SMTP Inboxes

```bash
# Initialize the inbox pool with your SMTP inboxes
curl -X POST https://jengu-crm.YOUR-SUBDOMAIN.workers.dev/api/admin/initialize-inboxes
```

### 8. Verify Deployment

```bash
# Check health
curl https://jengu-crm.YOUR-SUBDOMAIN.workers.dev/health

# Check inbox status
curl https://jengu-crm.YOUR-SUBDOMAIN.workers.dev/api/status/inboxes

# Check warmup status
curl https://jengu-crm.YOUR-SUBDOMAIN.workers.dev/api/status/warmup
```

## Enrichment Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/enrich/status` | Enrichment progress counters |
| POST | `/enrich/auto` | Find websites + emails (batch) |
| POST | `/enrich/websites` | Find websites (batch) |
| POST | `/enrich/emails` | Find emails (batch) |
| POST | `/enrich/lookup-email` | Find best email for a single `{ website, contactName }` |

**Recommended config**
- Set `VERCEL_SEARCH_URL` in `wrangler.toml` (or via `wrangler secret/vars`) to your Vercel `/api/search` route.
- Set the same `VERCEL_SEARCH_SECRET` value on Vercel and Cloudflare to keep the proxy private.

## API Endpoints

### Prospects

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/prospects` | List prospects (supports `?stage=`, `?tier=`, `?limit=`) |
| POST | `/api/prospects` | Create prospect |

### Emails

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/emails` | List emails (supports `?prospect_id=`, `?direction=`) |
| POST | `/api/send-email` | Send email to specific prospect |

### Status

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/status/warmup` | Warmup counter status per inbox |
| GET | `/api/status/inboxes` | Inbox health & circuit breaker status |
| GET | `/api/status/rate-limits` | AI rate limit status |
| GET | `/api/stats` | Overall stats (prospects, emails today) |

### Admin

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/admin/initialize-inboxes` | Register all SMTP inboxes |
| POST | `/api/admin/trigger-send` | Manually trigger email send (up to 5) |

### Webhooks

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/webhook/email/inbound` | Handle inbound email (from email forwarding) |
| GET | `/webhook/tracking/open` | Track email opens (pixel) |
| GET | `/webhook/tracking/click` | Track link clicks |
| POST | `/webhook/bounce` | Handle bounce notifications |

## CRON Schedule

| Schedule | Description | Status |
|----------|-------------|--------|
| `*/5 8-18 * * 1-6` | Email sending (every 5 min, 8am-6pm Mon-Sat) | ACTIVE |
| `0 7 * * *` | Daily pipeline - reset counters (7am UTC) | ACTIVE |
| `*/1 * * * *` | Check replies | DISABLED (no Azure) |
| `0 10 * * 1-5` | Send follow-ups (10am weekdays) | ACTIVE |

**Human-like sending pattern:**
- 30% random skip rate for natural gaps
- 30-90 second delays between emails
- Sends 1-3 emails per 5-minute cycle

## Warmup Schedule

Conservative warmup for inbox reputation:

| Week | Per Inbox | 3 Inboxes Total |
|------|-----------|-----------------|
| 1 | 5/day | 15/day |
| 2 | 10/day | 30/day |
| 3 | 15/day | 45/day |
| 4 | 18/day | 54/day |
| 5+ | 20/day | 60/day |

**Auto-pause triggers:**
- Bounce rate > 5%
- 3 consecutive send failures (circuit breaker)
- Circuit breaker auto-recovers after 5 minutes

## Campaign Strategies

Four A/B tested email strategies:

| Strategy | Description | Use Case |
|----------|-------------|----------|
| `authority_scarcity` | Short, confident, loss aversion | Job board leads |
| `curiosity_value` | Pattern interrupt, vulnerability | Job board leads |
| `cold_direct` | Human, slightly awkward | Sales Navigator |
| `cold_pattern_interrupt` | Self-aware, honest opener | Sales Navigator |

## Monitoring

### Live Logs

```bash
# Tail all logs
wrangler tail

# Filter by status
wrangler tail --status error

# Filter by search term
wrangler tail --search "Email sent"
```

## Sales Navigator Enrichment (Hands-Off, Free Cron)

If you use the Next.js app to import Sales Navigator CSVs into Supabase, the enrichment queue is processed by:
- `GET /api/cron/sales-nav-enrichment` (Next.js)

This worker can trigger that endpoint on a schedule (see `wrangler.toml` cron: `2-59/10 * * * *`).

**Setup**
- Set `VERCEL_APP_URL` in `cloudflare/wrangler.toml` (e.g., `https://your-app.vercel.app`)
- Set secret `VERCEL_CRON_SECRET` in this worker, and set the same value as `CRON_SECRET` in the Next.js deployment.

### Key Metrics to Watch

1. **Warmup Status**: `GET /api/status/warmup`
   - Check `remaining` count per inbox
   - Monitor `bounceRate` (should be < 5%)

2. **Inbox Health**: `GET /api/status/inboxes`
   - All inboxes should show `circuitState: "closed"`
   - Watch for `consecutiveFailures`

3. **Rate Limits**: `GET /api/status/rate-limits`
   - Monitor `budgetRemaining` (daily AI cost cap: $10)

## Troubleshooting

### Emails not sending

1. **Check warmup limit reached:**
   ```bash
   curl https://your-worker.workers.dev/api/status/warmup
   ```
   Look for `remaining: 0`

2. **Check inbox health:**
   ```bash
   curl https://your-worker.workers.dev/api/status/inboxes
   ```
   Look for `circuitState: "open"` or `healthy: false`

3. **Check eligible prospects:**
   ```bash
   curl "https://your-worker.workers.dev/api/prospects?stage=enriched"
   ```
   Need prospects with `stage: enriched` or `ready` and valid email

4. **Check SMTP secrets are set:**
   ```bash
   wrangler secret list
   ```
   Should show `SMTP_INBOX_1`, `SMTP_INBOX_2`, etc.

### Circuit breaker open

If inbox shows `circuitState: "open"`:
- Wait 5 minutes for auto-recovery to `half-open`
- Next successful send will close the circuit
- Or manually reset via D1 query

### AI generation failing

1. Check API keys are set: `wrangler secret list`
2. Check rate limits: `GET /api/status/rate-limits`
3. Check logs: `wrangler tail --search "AI generation"`
4. Rate limiter auto-recovers with exponential backoff

### No healthy inboxes

```bash
# Re-initialize inboxes
curl -X POST https://your-worker.workers.dev/api/admin/initialize-inboxes

# Verify
curl https://your-worker.workers.dev/api/status/inboxes
```

## Development

```bash
# Run locally with hot reload
npm run dev

# Type check
npm run typecheck

# Deploy
npm run deploy
```

## Costs (Free Tier)

| Service | Free Limit | Estimated Usage |
|---------|------------|-----------------|
| Workers | 100k req/day | ~2k req/day |
| D1 | 5GB, 5M reads/day | ~50k reads/day |
| KV | 100k reads/day | ~5k reads/day |
| Durable Objects | 1M req/month | ~50k req/month |

**Estimated cost at 60 emails/day: $0/month**

## File Structure

```
cloudflare/
├── src/
│   ├── index.ts                    # Worker entry point
│   ├── types/index.ts              # TypeScript interfaces
│   ├── workers/
│   │   ├── api.ts                  # HTTP API handler
│   │   └── cron.ts                 # CRON orchestration
│   ├── durable-objects/
│   │   ├── warmup-counter.ts       # Per-inbox email limits
│   │   ├── inbox-state.ts          # Circuit breaker & health
│   │   ├── rate-limiter.ts         # AI API rate limiting
│   │   └── prospect-dedup.ts       # Bloom filter dedup
│   └── lib/
│       ├── email-sender.ts         # SMTP sending via Mailchannels
│       ├── ai-gateway.ts           # Grok/Claude with failover
│       └── campaign-strategies.ts  # Email generation prompts
├── migrations/
│   ├── 001_schema.sql              # Database schema
│   ├── 002_seed.sql                # Default campaigns
│   ├── 003_campaigns.sql           # Campaign data
│   ├── 004_prospects.sql           # Prospect data (large)
│   └── 005_emails.sql              # Email history
├── wrangler.toml                   # Cloudflare config
└── package.json
```

## Inbound Email Handling

Since Azure inbox checking is disabled, set up email forwarding to webhook:

1. Configure your email provider to forward replies to:
   `https://your-worker.workers.dev/webhook/email/inbound`

2. Webhook expects JSON:
   ```json
   {
     "messageId": "unique-id",
     "from": "prospect@example.com",
     "to": "your-inbox@domain.com",
     "subject": "Re: Your email",
     "body": "Email content..."
   }
   ```

3. System will:
   - Match to prospect by `from` email
   - Update prospect stage to `engaged`
   - Send alert to webhook if configured
