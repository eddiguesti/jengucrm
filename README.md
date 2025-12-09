# Jengu CRM

AI-powered hotel outreach system for automated B2B sales.

## Quick Start

```bash
npm install
npm run dev
```

## Documentation

See [CLAUDE.md](./CLAUDE.md) for full system documentation including:

- Architecture overview
- Cron job configuration
- API endpoints
- Troubleshooting

## Key Commands

```bash
# Check today's email activity
npx tsx scripts/check-today-emails.ts

# Check database status
npx tsx scripts/check-db.ts

# Run development server
npm run dev
```

## External Services

- **Vercel**: Hosting + daily cron
- **Supabase**: Database
- **cron-job.org**: External cron jobs (hourly email, replies)
- **Azure**: Email sending via Graph API
- **Grok (x.ai)**: Email generation

## Folder Structure

```
src/app/api/     # API routes
src/lib/         # Business logic
src/services/    # Service layer
src/repositories/# Database access
scripts/         # Utility scripts
docs/            # Historical documentation
```
