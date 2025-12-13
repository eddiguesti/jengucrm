# Jengu CRM

AI-powered hotel outreach system for automated B2B sales.

## Quick Start

```bash
npm install
npm run dev
```

## Documentation

| Document | Purpose |
|----------|---------|
| [CLAUDE.md](./CLAUDE.md) | AI assistant instructions & quick reference |
| [docs/](./docs/) | Full documentation index |
| [docs/architecture/](./docs/architecture/) | System architecture |
| [docs/reliability/](./docs/reliability/) | 15-step reliability implementation |
| [docs/api/](./docs/api/) | API reference |

## Project Structure

```
├── CLAUDE.md              # AI assistant context & instructions
├── docs/                  # All documentation
│   ├── architecture/      # System design
│   ├── api/               # API reference
│   ├── reliability/       # 15-step reliability plan
│   └── archive/           # Historical docs
├── src/                   # Next.js application
│   ├── app/api/           # API routes
│   ├── lib/               # Business logic
│   ├── services/          # Service layer
│   └── repositories/      # Database access
├── cloudflare/            # Cloudflare Workers
│   ├── src/               # Worker source code
│   └── migrations/        # D1 database migrations
├── scripts/               # Utility scripts
└── supabase/              # Supabase migrations
```

## Key Commands

```bash
# Development
npm run dev                              # Start Next.js dev server

# Cloudflare Workers
cd cloudflare && npx wrangler deploy     # Deploy to Cloudflare
cd cloudflare && npx tsc --noEmit        # Type check

# Scripts
npx tsx scripts/check-today-emails.ts    # Check today's email activity
npx tsx scripts/check-db.ts              # Check database status
```

## External Services

| Service | Purpose |
|---------|---------|
| Vercel | Next.js hosting + daily cron |
| Supabase | PostgreSQL database (source of truth) |
| Cloudflare Workers | Email sending, enrichment, cron jobs |
| Cloudflare D1 | Edge database for Workers |
| Azure Graph API | Primary email sending |
| Grok (x.ai) | AI email generation |

## Quick Links

- **Production**: https://crm.jengu.ai
- **Cloudflare Worker**: https://jengu-crm.edd-181.workers.dev
- **Health Check**: https://jengu-crm.edd-181.workers.dev/health
