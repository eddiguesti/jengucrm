# Jengu CRM - Cloudflare Workers Edition

A globally distributed, fault-tolerant email outreach system built on Cloudflare's edge infrastructure.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CLOUDFLARE EDGE                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  CRON Triggers ──► Queues ──► Workers ──► Durable Objects           │
│       │              │           │              │                    │
│       │              │           │              ├─ WarmupCounter     │
│       │              │           │              ├─ InboxState        │
│       │              │           │              ├─ RateLimiter       │
│       │              │           │              └─ ProspectDedup     │
│       │              │           │                                   │
│       │              │           └──► D1 (SQLite) ◄── KV Cache       │
│       │              │                    │                          │
│       │              │                    └──► R2 (Storage)          │
│       │              │                                               │
│       │              ├─ prospect-queue                               │
│       │              ├─ enrichment-queue                             │
│       │              ├─ email-finder-queue                           │
│       │              ├─ ai-queue                                     │
│       │              ├─ send-queue                                   │
│       │              ├─ inbound-queue                                │
│       │              └─ dead-letter-queue                            │
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
# Create D1 database
wrangler d1 create jengu-crm
# Copy the database_id to wrangler.toml

# Create KV namespaces
wrangler kv:namespace create KV_CONFIG
wrangler kv:namespace create KV_CACHE
# Copy the IDs to wrangler.toml

# Create R2 bucket
wrangler r2 bucket create jengu-storage

# Create queues
npm run queues:create
```

### 4. Configure Secrets

```bash
# Required
wrangler secret put GROK_API_KEY
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put AZURE_TENANT_ID
wrangler secret put AZURE_CLIENT_ID
wrangler secret put AZURE_CLIENT_SECRET
wrangler secret put AZURE_MAIL_FROM

# Optional
wrangler secret put OPENAI_API_KEY
wrangler secret put HUNTER_API_KEY
wrangler secret put APOLLO_API_KEY
wrangler secret put MILLIONVERIFIER_API_KEY
wrangler secret put ALERT_WEBHOOK_URL

# SMTP Inboxes (format: email|password|host|port|displayName)
wrangler secret put SMTP_INBOX_1
wrangler secret put SMTP_INBOX_2
wrangler secret put SMTP_INBOX_3
wrangler secret put SMTP_INBOX_4
```

### 5. Deploy Database Schema

```bash
npm run db:migrate
npm run db:seed
```

### 6. Deploy Worker

```bash
npm run deploy
```

### 7. Initialize Inboxes

```bash
curl -X POST https://your-worker.your-subdomain.workers.dev/api/admin/initialize-inboxes
```

## API Endpoints

### Prospects

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/prospects` | List prospects |
| POST | `/api/prospects` | Create prospect |

### Emails

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/emails` | List emails |
| POST | `/api/send-email` | Queue email for sending |

### Status

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/status/warmup` | Warmup counter status |
| GET | `/api/status/inboxes` | Inbox health status |
| GET | `/api/status/rate-limits` | AI rate limit status |

### Admin

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/admin/initialize-inboxes` | Register all inboxes |
| POST | `/api/admin/trigger-send` | Manually trigger sending |
| POST | `/api/admin/trigger-scrape` | Manually trigger scraping |

## CRON Schedule

| Schedule | Description |
|----------|-------------|
| `*/5 8-18 * * 1-6` | Email sending (every 5 min, 8am-6pm Mon-Sat) |
| `0 7 * * *` | Daily pipeline (7am UTC) |
| `*/1 * * * *` | Check replies (every minute) |
| `0 6 * * 0` | Weekly maintenance (6am Sunday) |

## Warmup Schedule

Conservative warmup for new inboxes:

| Week | Per Inbox | 4 Inboxes Total |
|------|-----------|-----------------|
| 1 | 5/day | 20/day |
| 2 | 10/day | 40/day |
| 3 | 15/day | 60/day |
| 4 | 18/day | 72/day |
| 5+ | 20/day | 80/day |

## Monitoring

### Cloudflare Dashboard

- **Workers Analytics**: Request counts, errors, latency
- **Queue Metrics**: Depth, processing rate, failures
- **D1 Analytics**: Query performance

### Logs

```bash
# Tail live logs
wrangler tail

# Filter by status
wrangler tail --status error
```

### Alerts

Set `ALERT_WEBHOOK_URL` secret to receive alerts for:
- Dead letter queue entries
- Meeting requests
- Manual review needed

## Development

```bash
# Run locally
npm run dev

# Type check
npm run typecheck

# Run tests
npm run test
```

## Costs (Free Tier)

| Service | Free Limit | Typical Usage |
|---------|------------|---------------|
| Workers | 100k req/day | ~5k req/day |
| D1 | 5GB, 5M reads/day | ~100k reads/day |
| KV | 100k reads/day | ~10k reads/day |
| R2 | 10GB | ~100MB |
| Queues | 1M ops/month | ~50k ops/month |
| Durable Objects | 1M req/month | ~100k req/month |

**Estimated cost at 80 emails/day: $0/month**

## Troubleshooting

### Emails not sending

1. Check warmup status: `GET /api/status/warmup`
2. Check inbox health: `GET /api/status/inboxes`
3. Check rate limits: `GET /api/status/rate-limits`
4. Check dead letter queue in R2

### High bounce rate

Inbox will auto-pause if bounce rate > 5%. To resume:

```bash
# Via API
curl -X POST https://your-worker.workers.dev/api/admin/resume-inbox \
  -H "Content-Type: application/json" \
  -d '{"inboxId": "smtp-1"}'
```

### AI generation failing

Check rate limiter status. If all providers failing:

1. Verify API keys are set correctly
2. Check Cloudflare logs for specific errors
3. Rate limiter will auto-recover after backoff period

## Migration from Vercel

1. Export prospects from Supabase
2. Import into D1:
   ```bash
   wrangler d1 execute jengu-crm --file=./exports/prospects.sql
   ```
3. Update DNS to point to Cloudflare Worker
4. Monitor both systems in parallel
5. Full cutover after 1 week of stability
