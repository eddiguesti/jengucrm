# Step 15: Operational Runbooks

## ✅ DOCUMENTED - December 2024

## Goal
Document procedures for common operations and incidents so the system can be maintained reliably. When something goes wrong at 2am, you want a clear checklist, not guesswork.

---

## Current Status

### Runbooks Documented

1. **Emails Not Sending** - Diagnosis and resolution steps
2. **High Bounce Rate** - Alert response and prevention
3. **Inbox Health Degraded** - Health score recovery
4. **Reply Processing Stuck** - IMAP troubleshooting
5. **Database Sync Issues** - D1 ↔ Supabase sync
6. **Enrichment Pipeline Stuck** - Grok/MillionVerifier issues
7. **Worker Unresponsive** - Rollback and recovery
8. **Emergency Stop Procedure** - Immediate stop protocol
9. **New Inbox Setup** - Warmup and configuration
10. **Database Maintenance** - Cleanup and backups

### Daily/Weekly Checklists Included

- Morning health checks
- Weekly review checklist
- Quick reference card with key URLs and thresholds

---

## Runbook Structure

```
┌─────────────────────────────────────────────────────────┐
│                   RUNBOOK FORMAT                        │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  1. Symptoms      - How you know there's a problem      │
│  2. Diagnosis     - Commands to confirm the issue       │
│  3. Resolution    - Step-by-step fix                    │
│  4. Verification  - How to confirm it's fixed           │
│  5. Prevention    - How to avoid in future              │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Daily Operations Checklist

### Morning Check (5 minutes)

```bash
# 1. Check system health
curl https://marketing-agent.jengu.workers.dev/health

# 2. Check yesterday's email stats
curl https://marketing-agent.jengu.workers.dev/api/stats

# 3. Check for failures in dead letter queue
curl https://marketing-agent.jengu.workers.dev/api/retry-queue/stats

# 4. Check bounce rate (should be < 5%)
# Look at stats.bounces / stats.sent_today
```

### Weekly Check (15 minutes)

- [ ] Review inbox health scores (all > 80?)
- [ ] Check warmup progress per inbox
- [ ] Review reply rate trends
- [ ] Check failed enrichment queue
- [ ] Verify Supabase ↔ D1 sync status
- [ ] Review error logs for patterns

---

## Runbook 1: Emails Not Sending

### Symptoms
- Dashboard shows 0 emails sent today
- Email queue is empty
- No recent activity in logs

### Diagnosis

```bash
# Check if cron is running
curl https://marketing-agent.jengu.workers.dev/api/stats
# Look at: last_cron_run, emails_sent_today

# Check EMERGENCY_STOP flag
curl https://marketing-agent.jengu.workers.dev/api/config/emergency_stop

# Check eligible prospects
curl "https://marketing-agent.jengu.workers.dev/api/prospects?stage=ready&limit=5"

# Check inbox health
curl https://marketing-agent.jengu.workers.dev/api/inboxes/health
```

### Common Causes

| Cause | How to Check | Fix |
|-------|--------------|-----|
| EMERGENCY_STOP on | `/api/config` shows `true` | Set to `false` |
| No eligible prospects | All prospects are `contacted` or `bounced` | Import new prospects |
| All inboxes paused | Health scores < 50 | Wait or fix reputation |
| Warmup limit reached | `sent_today >= daily_limit` | Wait until tomorrow |
| Cron not triggering | No recent `last_cron_run` | Check Cloudflare dashboard |

### Resolution

```bash
# If EMERGENCY_STOP is on:
curl -X POST https://marketing-agent.jengu.workers.dev/api/config \
  -H "Content-Type: application/json" \
  -d '{"key": "emergency_stop", "value": false}'

# If inboxes are paused, check why:
curl https://marketing-agent.jengu.workers.dev/api/inboxes

# Manually trigger email send:
curl -X POST https://marketing-agent.jengu.workers.dev/cron/send-emails
```

### Verification
- Check `/api/stats` shows `emails_sent_today > 0`
- Check prospect stages advancing

---

## Runbook 2: High Bounce Rate

### Symptoms
- Bounce rate > 5%
- Alert notification received
- Inbox health score dropping

### Diagnosis

```bash
# Get bounce details
curl https://marketing-agent.jengu.workers.dev/api/bounces/recent

# Check which emails bounced
curl "https://marketing-agent.jengu.workers.dev/api/emails?status=bounced&limit=20"

# Check bounce types
# hard = permanent, soft = temporary, block = spam filter
```

### Resolution

**For hard bounces (invalid emails):**
```bash
# These prospects are auto-marked as bounced
# No action needed, they won't be emailed again
```

**For block bounces (spam filter):**
```bash
# 1. Pause email sending immediately
curl -X POST https://marketing-agent.jengu.workers.dev/api/config \
  -d '{"key": "emergency_stop", "value": true}'

# 2. Review email content for spam triggers
# 3. Reduce sending volume
# 4. Wait 24-48 hours before resuming
```

**For soft bounces (temporary):**
```bash
# These are auto-retried after 24 hours
# Monitor if they persist
```

### Prevention
- Always verify emails with MillionVerifier
- Keep daily send volume low during warmup
- Monitor bounce rate daily

---

## Runbook 3: Inbox Health Degraded

### Symptoms
- Health score < 80 for an inbox
- Emails going to spam
- Low open/reply rates

### Diagnosis

```bash
# Get inbox details
curl https://marketing-agent.jengu.workers.dev/api/inboxes

# Check recent send history for this inbox
curl "https://marketing-agent.jengu.workers.dev/api/emails?inbox=inbox1@example.com&limit=50"

# Check bounce history for this inbox
curl "https://marketing-agent.jengu.workers.dev/api/bounces?inbox=inbox1@example.com"
```

### Health Score Factors

| Factor | Weight | How to Improve |
|--------|--------|----------------|
| Bounce rate | 40% | Better email verification |
| Complaint rate | 30% | Better targeting |
| Reply rate | 20% | Better email content |
| Age of inbox | 10% | Time |

### Resolution

**If health < 50:**
```bash
# Inbox is auto-paused
# Wait 7 days with no sending
# Health recovers gradually
```

**If health 50-80:**
```bash
# Reduce daily limit for this inbox
curl -X POST https://marketing-agent.jengu.workers.dev/api/inboxes/update \
  -d '{"inbox": "inbox1@example.com", "daily_limit": 10}'

# Focus on warm leads only
# Monitor for 1 week
```

### Verification
- Health score improving daily
- Bounce rate decreasing

---

## Runbook 4: Reply Processing Stuck

### Symptoms
- Replies showing in email but not processed
- Reply count not updating
- Prospect stages not advancing

### Diagnosis

```bash
# Check IMAP connection
curl https://marketing-agent.jengu.workers.dev/api/inboxes/imap-status

# Check recent inbox items
curl "https://marketing-agent.jengu.workers.dev/api/inbox?limit=20"

# Check reply processing errors
curl https://marketing-agent.jengu.workers.dev/api/errors?type=reply_processing
```

### Common Causes

| Cause | Fix |
|-------|-----|
| IMAP credentials expired | Update credentials in secrets |
| Thread matching failed | Check email message IDs |
| AI classification error | Check Grok API status |

### Resolution

```bash
# Re-process stuck replies
curl -X POST https://marketing-agent.jengu.workers.dev/api/inbox/reprocess

# If IMAP broken, update credentials:
wrangler secret put SMTP_INBOX_1
# Format: email|password|smtphost|smtpport|displayname|imaphost|imapport

# Manual reply classification
curl -X POST https://marketing-agent.jengu.workers.dev/api/inbox/123/classify
```

### Verification
- Check `/api/inbox` shows recent items processed
- Prospect stages updated

---

## Runbook 5: Database Sync Issues

### Symptoms
- Data different between Supabase and D1
- Prospects showing different stages
- Emails not appearing in both systems

### Diagnosis

```bash
# Run sync check
curl https://marketing-agent.jengu.workers.dev/api/sync/check

# Compare specific prospect
PROSPECT_ID="abc123"

# Check D1
curl "https://marketing-agent.jengu.workers.dev/api/prospects/$PROSPECT_ID"

# Check Supabase (via Vercel)
curl "https://crm.jengu.ai/api/prospects/$PROSPECT_ID"
```

### Resolution

**If D1 is behind:**
```bash
# Sync specific prospect from Supabase to D1
curl -X POST https://marketing-agent.jengu.workers.dev/api/sync/prospect \
  -d '{"prospect_id": "abc123", "direction": "supabase_to_d1"}'
```

**If Supabase is behind:**
```bash
# Sync from D1 to Supabase
curl -X POST https://marketing-agent.jengu.workers.dev/api/sync/prospect \
  -d '{"prospect_id": "abc123", "direction": "d1_to_supabase"}'
```

**Full resync (careful, slow):**
```bash
# Only for emergencies
curl -X POST https://marketing-agent.jengu.workers.dev/api/sync/full
```

### Prevention
- All writes should go to source of truth first
- Async replication to other system
- Daily sync verification job

---

## Runbook 6: Enrichment Pipeline Stuck

### Symptoms
- Prospects staying in `new` stage
- No website/email data being added
- Enrichment queue growing

### Diagnosis

```bash
# Check enrichment status
curl https://marketing-agent.jengu.workers.dev/api/enrich/status

# Check pending enrichment count
curl "https://marketing-agent.jengu.workers.dev/api/prospects?stage=new&has_website=false"

# Check enrichment errors
curl https://marketing-agent.jengu.workers.dev/api/errors?type=enrichment
```

### Common Causes

| Cause | How to Check | Fix |
|-------|--------------|-----|
| Grok API down | Check x.ai status | Wait or use fallback |
| MillionVerifier down | Check API status | Wait |
| Rate limit hit | Check error logs | Wait 1 hour |
| Invalid prospects | Check prospect data | Clean up data |

### Resolution

```bash
# Manually trigger enrichment
curl -X POST https://marketing-agent.jengu.workers.dev/api/enrich/auto

# Retry failed enrichments
curl -X POST https://marketing-agent.jengu.workers.dev/api/enrich/retry-failed

# Skip problematic prospect
curl -X POST https://marketing-agent.jengu.workers.dev/api/prospects/abc123/skip-enrichment
```

### Verification
- Enrichment status shows progress
- Prospects moving from `new` to `enriched`

---

## Runbook 7: Worker Unresponsive

### Symptoms
- Health endpoint not responding
- All API calls timing out
- Cloudflare dashboard shows errors

### Diagnosis

```bash
# Check Cloudflare dashboard for errors
# Go to: Workers & Pages > marketing-agent > Logs

# Check recent deployments
npx wrangler deployments list

# Check if D1 is responding
# Try a simple query in Cloudflare dashboard
```

### Resolution

**If recent deployment broke it:**
```bash
cd cloudflare
./scripts/rollback.sh
```

**If D1 is the problem:**
```bash
# Check D1 status in Cloudflare dashboard
# Contact Cloudflare support if persistent
```

**If unknown cause:**
```bash
# Redeploy current version (sometimes fixes issues)
cd cloudflare
npx wrangler deploy
```

### Verification
- Health endpoint returns 200
- API calls responding

---

## Runbook 8: Emergency Stop Procedure

### When to Use
- Sending spam by accident
- Major bug discovered
- Legal/compliance issue
- Customer complaint

### Immediate Actions (< 1 minute)

```bash
# 1. STOP ALL EMAIL SENDING
curl -X POST https://marketing-agent.jengu.workers.dev/api/config \
  -H "Content-Type: application/json" \
  -d '{"key": "emergency_stop", "value": true}'

# 2. Verify it's stopped
curl https://marketing-agent.jengu.workers.dev/api/config/emergency_stop
# Should return: {"emergency_stop": true}

# 3. Note the time and reason
echo "$(date): Emergency stop activated - [REASON]" >> incident.log
```

### Investigation (next 30 minutes)

```bash
# Check recent emails sent
curl "https://marketing-agent.jengu.workers.dev/api/emails?limit=50&order=desc"

# Check for errors
curl https://marketing-agent.jengu.workers.dev/api/errors?limit=100

# Check affected prospects
# (depends on the issue)
```

### Resolution

1. Fix the root cause
2. Test fix in staging
3. Deploy fix
4. Gradually re-enable:

```bash
# Set max emails very low first
curl -X POST https://marketing-agent.jengu.workers.dev/api/config \
  -d '{"key": "max_emails_per_run", "value": 1}'

# Disable emergency stop
curl -X POST https://marketing-agent.jengu.workers.dev/api/config \
  -d '{"key": "emergency_stop", "value": false}'

# Monitor closely for 1 hour
# Gradually increase max_emails_per_run
```

---

## Runbook 9: New Inbox Setup

### Procedure

```bash
# 1. Set up SMTP credentials
wrangler secret put SMTP_INBOX_4
# Enter: email|password|smtp.host.com|465|Display Name

# 2. Verify connection
curl -X POST https://marketing-agent.jengu.workers.dev/api/inboxes/test \
  -d '{"inbox": "new@example.com"}'

# 3. Set warmup schedule
curl -X POST https://marketing-agent.jengu.workers.dev/api/inboxes \
  -d '{
    "email": "new@example.com",
    "warmup_enabled": true,
    "warmup_start_date": "2025-01-01",
    "daily_limit": 5
  }'

# 4. Monitor warmup for first week
# Check health daily
```

### Warmup Schedule Reference

| Week | Daily Limit |
|------|-------------|
| 1 | 5 |
| 2 | 10 |
| 3 | 15 |
| 4 | 20 |
| 5+ | 25-40 |

---

## Runbook 10: Database Maintenance

### Weekly: Clean Old Data

```bash
# Run cleanup job
curl -X POST https://marketing-agent.jengu.workers.dev/api/maintenance/cleanup

# This removes:
# - Job queue items older than 30 days
# - Error logs older than 14 days
# - Processed inbox items older than 90 days
```

### Monthly: Database Optimization

```bash
# Vacuum D1 database (via Cloudflare dashboard)
# Go to: Workers & Pages > D1 > marketing-agent-db > Settings > Vacuum

# Check table sizes
curl https://marketing-agent.jengu.workers.dev/api/maintenance/db-stats
```

### Backup Procedure

```bash
# Export D1 to file (for local backup)
npx wrangler d1 export marketing-agent-db --output backup-$(date +%Y%m%d).sql

# Supabase has automatic daily backups
# Check: Supabase dashboard > Settings > Database > Backups
```

---

## Quick Reference Card

### Essential URLs

| What | URL |
|------|-----|
| Health check | `GET /health` |
| System stats | `GET /api/stats` |
| Queue status | `GET /api/retry-queue/stats` |
| Inbox health | `GET /api/inboxes/health` |
| Recent errors | `GET /api/errors?limit=20` |

### Emergency Commands

```bash
# Stop all sending
curl -X POST .../api/config -d '{"key":"emergency_stop","value":true}'

# Rollback deployment
./scripts/rollback.sh

# Check system status
curl .../health
```

### Key Thresholds

| Metric | Warning | Critical |
|--------|---------|----------|
| Bounce rate | > 3% | > 5% |
| Inbox health | < 80 | < 50 |
| Error rate | > 1% | > 5% |
| Queue depth | > 100 | > 500 |
| Response time | > 2s | > 5s |

---

## Verification Checklist

- [ ] All runbooks documented
- [ ] Daily operations checklist created
- [ ] Emergency procedures clear
- [ ] Quick reference card available
- [ ] Team trained on runbooks
- [ ] Runbooks tested quarterly
- [ ] Contact escalation defined
- [ ] Backup procedures documented
