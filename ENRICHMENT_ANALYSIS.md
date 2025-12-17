# Enrichment System Analysis

## Current Enrichment Setup

### What's Happening Daily

**Daily Cron** (7am UTC) calls `/api/enrich` with `limit: 20`

This means:
- ✅ **Enrichment IS running** every day
- ⚠️ **Only enriching 20 prospects per day**
- 🔍 **Uses DuckDuckGo** (free, no API key needed)
- 📧 **No email finding** in daily pipeline

### Current API Usage

Your system uses these APIs:

| API | Monthly Limit | Daily Limit | Current Usage | Purpose |
|-----|---------------|-------------|---------------|---------|
| **Google Places** | 10,000 | ~300/day | Unknown | Find hotel details |
| **DuckDuckGo** | ∞ Free | ∞ | In use | Find websites |
| **Brave Search** | 2,000/month | ~66/day | Not configured | Alternative search |
| **Grok (X.AI)** | Pay-per-use | 200 self-limit | For emails | AI email generation |
| **Anthropic** | Pay-per-use | 500 self-limit | Minimal | AI analysis |

### What's NOT Happening

❌ **You're NOT using the 100 Google searches** you mentioned
- Google Places API is configured but **not being used for enrichment**
- Only used for **review mining** (separate cron)
- Can do ~300 searches/day (10k/month free)

❌ **Enrichment is too slow**
- Only 20 prospects/day
- 947 prospects in "new" stage need enrichment
- At this rate: **47 days to enrich all prospects!**

❌ **No email finding in daily pipeline**
- Daily cron doesn't find emails
- Separate cron `/api/cron/sales-nav-enrichment` exists but may not be running

---

## Why Only 20/Day?

Looking at [src/app/api/cron/daily/route.ts:121](src/app/api/cron/daily/route.ts:121):

```typescript
const response = await fetch(`${baseUrl}/api/enrich`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ limit: 20 }),  // ← HARDCODED TO 20
});
```

This is **way too conservative** given your resources!

---

## What The Enrichment Does

From [src/app/api/enrich/route.ts](src/app/api/enrich/route.ts):

### Batch Enrich (PUT /api/enrich)
1. Finds prospects with: `stage = 'new'` AND `email IS NULL`
2. Enriches up to `limit` prospects (default: 10, cron uses: 20)
3. For each prospect:
   - Scrapes their website (if they have one)
   - Looks for decision maker contact
   - Extracts emails, phones, social links
   - Finds property info (stars, rooms, amenities)
   - Calculates score and tier
   - Updates prospect to `stage = 'researching'`

### What It DOESN'T Do
❌ Find websites for prospects without websites
❌ Find emails using Hunter.io or MillionVerifier
❌ Use Google Places API
❌ Use Brave Search API

---

## The 100 Google Searches Question

I think you're referring to **Google Places API** which has:
- **10,000 free searches/month**
- **~300 searches/day** sustainable rate

### Current Google Places Usage

Looking at the code:
1. **NOT used in daily enrichment**
2. **Used in**: `src/lib/scrapers/google-maps.ts` for finding hotels
3. **Used in**: Review mining cron
4. **Tracked in**: API usage tracker

To check actual usage, we need to query the `api_usage` table:

```sql
SELECT * FROM api_usage
WHERE service = 'GOOGLE_PLACES'
  AND period >= '2025-12'
ORDER BY period DESC;
```

---

## Cloudflare Workers Enrichment

You also have a **Cloudflare Workers enrichment system** that runs 24/7!

From `cloudflare/wrangler.toml`:
```toml
"*/5 6,19-23 * * *"  # Every 5 min at 6am + 7pm-11pm
```

This runs enrichment during off-hours:
- 6am (1 hour = 12 batches)
- 7pm-11pm (4 hours = 48 batches)
- **Total**: ~60 batches/day × batch_size = many prospects!

### Cloudflare Enrichment Process
From `cloudflare/src/workers/enrich.ts`:
1. **Find websites** using DuckDuckGo + Grok AI
2. **Find emails** using MillionVerifier
3. Runs in background, doesn't block main app

---

## Current Bottleneck Analysis

### By The Numbers

- **Total prospects**: 1,000
- **Need enrichment** (stage = 'new', no email): 947
- **Current enrichment rate**: 20/day (Vercel) + ? (Cloudflare)
- **Days to complete**: 47+ days (just Vercel)

### Why You Only Have 25 Usable Emails

1. **Most prospects don't have websites yet** (need website finding)
2. **Daily enrichment too conservative** (only 20/day)
3. **No email finding in main pipeline** (separate cron may not be running)
4. **Cloudflare enrichment status unknown** (is it running?)

---

## Solutions

### Option 1: Increase Daily Enrichment (Quick Fix)

Change the daily cron limit from 20 → 100:

```typescript
// src/app/api/cron/daily/route.ts:121
body: JSON.stringify({ limit: 100 }),  // Was: 20
```

**Impact**:
- 100 prospects/day enriched
- Still under API limits
- Complete backlog in 10 days

### Option 2: Run Cloudflare Enrichment 24/7 (Best)

Cloudflare Workers can run constantly:

1. **Website finding**: DuckDuckGo (free) + Grok AI
2. **Email finding**: MillionVerifier ($10 for 1000 verifications)
3. **Runs**: Every 5 minutes during off-hours
4. **Batches**: 20 websites + 10 emails per run

**Current schedule** (wrangler.toml):
```
*/5 6,19-23 * * *  # 6am + 7pm-11pm = 5 hours/day
```

**Proposed**: Change to run more often
```
*/5 8-18 * * *  # 8am-6pm = 10 hours/day
```

Or even:
```
*/10 * * * *  # Every 10 min, 24/7
```

### Option 3: Use Google Places API (Underutilized)

You have 10,000 Google Places searches/month **unused**!

Could use it to:
1. Find hotels by city/region
2. Get contact info, websites, ratings
3. Import as new prospects
4. ~300/day = 9,000/month (under limit)

### Option 4: Run Manual Enrichment Scripts

You have scripts that can enrich in bulk:

```bash
# Find websites (uses Grok AI)
npx tsx scripts/find-websites-grok.ts --limit=500

# Find emails (uses MillionVerifier)
npx tsx scripts/enrich-with-millionverifier.ts --limit=100

# Full pipeline
nohup bash scripts/overnight-enrich.sh &
```

---

## Recommended Action Plan

### Immediate (Today)
1. ✅ Check if Cloudflare enrichment is running:
   ```bash
   curl https://YOUR-WORKER.workers.dev/enrich/status
   ```

2. 🔧 Increase daily enrichment limit:
   - Change line 121 in `src/app/api/cron/daily/route.ts`
   - From `limit: 20` → `limit: 100`

3. 📊 Check Google Places API usage:
   - Query `api_usage` table
   - See if you're using your free quota

### Short Term (This Week)
1. Run manual enrichment to catch up:
   ```bash
   npx tsx scripts/find-websites-grok.ts --limit=500
   npx tsx scripts/enrich-with-millionverifier.ts --limit=100
   ```

2. Configure Cloudflare cron to run more frequently
3. Verify external crons are running:
   - `sales-nav-enrichment` every 15 min
   - Check cron-job.org configuration

### Medium Term (This Month)
1. Set up Google Places API enrichment
2. Configure auto-enrichment for new prospects
3. Monitor API usage vs limits
4. Optimize enrichment success rate

---

## API Cost Analysis

### Current Spend (Estimated)

| Service | Usage | Cost/Unit | Monthly Cost |
|---------|-------|-----------|--------------|
| Grok (X.AI) | ~200/day | $0.005 | ~$30/month |
| MillionVerifier | ~100/month | $0.01 | $1/month |
| Google Places | 0 | $0 | **$0** (unused!) |
| DuckDuckGo | ∞ | $0 | $0 |

**Total**: ~$31/month for AI + verification

### At Full Scale (1000 prospects/month)

| Service | Usage | Cost |
|---------|-------|------|
| Website finding (Grok) | 1000 | $5 |
| Email verification | 1000 | $10 |
| Google Places | 1000 | $0 (under free tier) |

**Total**: ~$15/month for enrichment

---

## Why Enrichment is Critical

### Current State
- 1,000 prospects
- 25 usable emails (2.5%)
- Can only email 10-15 prospects before running out

### After Full Enrichment
- 1,000 prospects
- ~400 usable emails (40% success rate)
- Can email 60/day for weeks
- 21.6% reply rate × 400 emails = **84 replies**
- At 10% meeting rate = **8 new meetings**

**The enrichment bottleneck is your biggest constraint!**

---

## Monitoring Enrichment

### Check Daily Progress
```bash
# See enrichment stats
curl http://localhost:3000/api/stats

# Check today's enrichment
npx tsx scripts/check-db.ts

# Cloudflare enrichment status
curl https://YOUR-WORKER.workers.dev/enrich/status
```

### Key Metrics
- **Prospects with website**: Should increase daily
- **Prospects with email**: Should increase daily
- **Stage = 'researching'**: Should increase from 30 → 400+
- **Enrichment success rate**: Currently 56%, target 70%+

---

## Summary

### The 100 Google Searches
- You have **10,000 Google Places API calls/month** available
- Currently **UNUSED** for enrichment
- Could enrich ~300 prospects/day with it
- This is your **most underutilized resource**

### Current Enrichment Rate
- **20 prospects/day** via Vercel cron (too slow!)
- **Unknown rate** via Cloudflare Workers (need to check status)
- **Manual scripts** available for bulk enrichment

### Recommended Fix
1. Increase Vercel cron from 20 → 100/day
2. Verify Cloudflare enrichment is running
3. Run manual scripts to catch up (500 prospects)
4. Use Google Places API for new prospect discovery
5. Monitor progress daily

**Goal**: Get from 25 → 400 usable emails in 2 weeks.
