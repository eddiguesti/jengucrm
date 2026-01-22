# TODO 2: Prospect Database & Enrichment - Complete Audit

**Priority: CRITICAL** 🔴
**Estimated Time: 2-3 hours**

---

## 👥 A. Prospect Database Structure

### 1. Database Schema Validation
- [ ] **Prospects Table** (`prospects`)
  - [ ] Review schema in Supabase dashboard
  - [ ] Verify all required columns exist:
    - [ ] `id` (UUID, primary key)
    - [ ] `company_name` (text, not null)
    - [ ] `email` (text, nullable)
    - [ ] `contact_name` (text, nullable)
    - [ ] `stage` (enum: new, enriched, contacted, engaged, meeting, won, lost)
    - [ ] `tier` (enum: hot, warm, cold)
    - [ ] `location` (text)
    - [ ] `website` (text)
    - [ ] `enrichment_status` (enum)
    - [ ] `pain_signals` (jsonb)
    - [ ] `created_at`, `updated_at`
  - [ ] Check indexes exist for:
    - [ ] `email`
    - [ ] `stage`
    - [ ] `tier`
    - [ ] `created_at`

### 2. Data Quality Assessment
- [ ] **Run Quality Report**
  ```sql
  -- Total prospects
  SELECT COUNT(*) FROM prospects;

  -- With email
  SELECT COUNT(*) FROM prospects WHERE email IS NOT NULL;

  -- With valid email (not generic)
  SELECT COUNT(*) FROM prospects
  WHERE email NOT LIKE '%info@%'
    AND email NOT LIKE '%contact@%'
    AND email NOT LIKE '%reservations@%';

  -- By stage
  SELECT stage, COUNT(*) FROM prospects GROUP BY stage;

  -- By tier
  SELECT tier, COUNT(*) FROM prospects GROUP BY tier;
  ```

- [ ] **Expected Results**:
  - [ ] Total: ~11,118 prospects (confirmed)
  - [ ] With email: Should be > 1,000
  - [ ] Valid emails: Currently 26 (0.2%) ← **CRITICAL ISSUE**
  - [ ] Most should be in 'new' or 'enriched' stages

### 3. Duplicate Detection
- [ ] **Find Duplicates**
  ```sql
  -- By company name + location
  SELECT company_name, location, COUNT(*) as count
  FROM prospects
  GROUP BY company_name, location
  HAVING COUNT(*) > 1;

  -- By email
  SELECT email, COUNT(*) as count
  FROM prospects
  WHERE email IS NOT NULL
  GROUP BY email
  HAVING COUNT(*) > 1;
  ```

- [ ] **Cleanup Script**
  - [ ] Create deduplication logic
  - [ ] Merge duplicate records (keep best data)
  - [ ] Update references in other tables
  - [ ] Run: `npx tsx scripts/dedupe-prospects.ts`

---

## 🔍 B. Enrichment System

### 1. Website Finding (Cloudflare Worker)
- [ ] **Review Logic** (`cloudflare/src/workers/enrich.ts`)
  - [ ] Verify DuckDuckGo search works
  - [ ] Check Grok AI integration for URL selection
  - [ ] Test URL verification (HEAD/GET request)
  - [ ] Review success rate tracking

- [ ] **Test Website Finding**
  - [ ] Select 10 prospects without websites
  - [ ] Run: `POST /enrich/websites` on Cloudflare Worker
  - [ ] Verify websites found and saved
  - [ ] Check accuracy (manually verify 5 URLs)
  - [ ] Expected success rate: ~90%

- [ ] **Monitor Cloudflare Worker**
  - [ ] Check D1 database has data
  - [ ] Review cron job logs
  - [ ] Verify enrichment runs during off-hours (6am, 7-11pm)

### 2. Email Finding (MillionVerifier)
- [ ] **Email Pattern Generation**
  - [ ] Review patterns in `lib/enrichment/email-finder.ts`:
    - [ ] `firstname.lastname@domain.com`
    - [ ] `firstname@domain.com`
    - [ ] `firstnamelastname@domain.com`
    - [ ] `f.lastname@domain.com`
  - [ ] Verify contact name parsing works
  - [ ] Check domain extraction from website

- [ ] **MillionVerifier Integration**
  - [ ] Verify API key: `MILLIONVERIFIER_API_KEY`
  - [ ] Test API: `npx tsx scripts/test-millionverifier.ts`
  - [ ] Check rate limits (not exceeded)
  - [ ] Verify email verification accuracy
  - [ ] Monitor credit balance

- [ ] **Test Email Finding**
  - [ ] Select 10 prospects with websites but no emails
  - [ ] Run: `POST /enrich/emails` on Cloudflare Worker
  - [ ] Verify emails found and verified
  - [ ] Check quality (deliverability score > 80%)
  - [ ] Expected success rate: ~40-60%

### 3. Enrichment Pipeline (Full Flow)
- [ ] **Local Enrichment** (when needed)
  - [ ] Script: `npx tsx scripts/enrich-all.ts`
  - [ ] Test find websites step
  - [ ] Test find emails step
  - [ ] Verify batch processing works (50/100 at a time)
  - [ ] Check error handling

- [ ] **Cloud Enrichment** (Cloudflare - preferred)
  - [ ] Endpoint: `POST /enrich/auto`
  - [ ] Verify it runs both websites + emails
  - [ ] Check scheduling (off-hours)
  - [ ] Monitor progress: `GET /enrich/status`
  - [ ] Review success rates

- [ ] **Enrichment Triggers**
  - [ ] Manual: `POST /api/enrichment/trigger`
  - [ ] Automatic: Cloudflare cron (every 5 min, off-hours)
  - [ ] Test both methods work

---

## 📥 C. Data Import Systems

### 1. Sales Navigator Import
- [ ] **CSV Import Flow**
  - [ ] Go to `/sales-navigator`
  - [ ] Test file upload (.csv or .numbers)
  - [ ] Verify parsing works
  - [ ] Check data mapping:
    - [ ] Company name
    - [ ] Contact name
    - [ ] Title
    - [ ] Location
    - [ ] LinkedIn URL
  - [ ] Verify prospects created in database

- [ ] **Auto-Enrichment**
  - [ ] After import, enrichment should queue
  - [ ] Check: `GET /api/sales-navigator/enrichment`
  - [ ] Verify cron picks up Sales Nav prospects
  - [ ] Monitor enrichment progress

- [ ] **Scoring System**
  - [ ] Review scoring logic
  - [ ] Test tier assignment (hot/warm/cold)
  - [ ] Verify pain signal detection

### 2. Job Board Scraping
- [ ] **Review Scrapers** (`src/lib/scrapers/`)
  - [ ] Hospitality Online
  - [ ] Hcareers
  - [ ] Indeed
  - [ ] LinkedIn Jobs

- [ ] **Test Scraping**
  - [ ] Run: `POST /api/scrape`
  - [ ] Verify job postings found
  - [ ] Check prospect creation from job postings
  - [ ] Validate data quality
  - [ ] Monitor for broken scrapers

- [ ] **Scraping Schedule**
  - [ ] Check if `/api/cron/scrape-jobs` exists
  - [ ] Verify it runs daily
  - [ ] Review results

### 3. Manual Prospect Addition
- [ ] **Add Prospect UI**
  - [ ] Go to `/prospects`
  - [ ] Click "Add Prospect" button
  - [ ] Test form validation
  - [ ] Enter test data
  - [ ] Submit and verify creation
  - [ ] Check all fields saved correctly

---

## 📊 D. Prospect Management

### 1. Prospect Detail Page
- [ ] **Navigate to Prospect** (`/prospects/[id]`)
  - [ ] Select any prospect
  - [ ] Verify all data displays:
    - [ ] Company name, location
    - [ ] Contact name, email
    - [ ] Website link (clickable)
    - [ ] Stage, tier
    - [ ] Pain signals
    - [ ] Activity history
  - [ ] Test edit functionality
  - [ ] Test delete functionality

### 2. Prospect List Page
- [ ] **View All Prospects** (`/prospects`)
  - [ ] Verify list loads
  - [ ] Check pagination works
  - [ ] Test search functionality
  - [ ] Test filters:
    - [ ] By stage
    - [ ] By tier
    - [ ] By location
    - [ ] With/without email
  - [ ] Test sorting (by date, name, tier)
  - [ ] Test bulk actions:
    - [ ] Select multiple
    - [ ] Bulk assign to campaign
    - [ ] Bulk change stage
    - [ ] Bulk delete

### 3. Prospect Drawer
- [ ] **Quick View** (drawer component)
  - [ ] Click prospect from any list
  - [ ] Verify drawer opens
  - [ ] Check all info displays
  - [ ] Test quick actions:
    - [ ] Send email
    - [ ] Add to campaign
    - [ ] Change stage
    - [ ] Add note
  - [ ] Verify close/navigate works

---

## 🏷️ E. Prospect Segmentation

### 1. Stage Management
- [ ] **Stage Progression**
  - [ ] new → enriched (after finding email)
  - [ ] enriched → contacted (after first email)
  - [ ] contacted → engaged (after reply)
  - [ ] engaged → meeting (after booking)
  - [ ] meeting → won/lost

- [ ] **Auto-Stage Updates**
  - [ ] Verify email send updates stage
  - [ ] Check reply updates stage
  - [ ] Test manual stage changes

### 2. Tier Assignment
- [ ] **Tier Logic**
  - [ ] Hot: Hiring + pain signals
  - [ ] Warm: Hiring OR pain signals
  - [ ] Cold: Neither

- [ ] **Test Tier Calculation**
  - [ ] Review scoring algorithm
  - [ ] Manually verify 10 prospects
  - [ ] Check tier updates trigger correctly

### 3. Custom Fields
- [ ] **Pain Signals**
  - [ ] Verify JSONB storage
  - [ ] Check pain signal detection
  - [ ] Test display in UI
  - [ ] Verify used in email personalization

- [ ] **Tags/Labels** (if implemented)
  - [ ] Test adding tags
  - [ ] Filter by tags
  - [ ] Bulk tag operations

---

## 🧪 F. Enrichment Testing

### End-to-End Test: Enrich 100 Prospects
- [ ] **Step 1**: Select prospects
  ```sql
  SELECT id FROM prospects
  WHERE email IS NULL
  ORDER BY created_at DESC
  LIMIT 100;
  ```

- [ ] **Step 2**: Run enrichment
  ```bash
  curl -X POST https://crm.jengu.ai/api/enrichment/trigger \
    -H "Authorization: Bearer [CRON_SECRET]"
  ```

- [ ] **Step 3**: Monitor progress
  - [ ] Check enrichment status endpoint
  - [ ] Watch activity logs
  - [ ] Monitor database updates

- [ ] **Step 4**: Verify results
  - [ ] Count prospects with new websites
  - [ ] Count prospects with new emails
  - [ ] Calculate success rates
  - [ ] Check data quality

- [ ] **Step 5**: Validate
  - [ ] Manually verify 10 websites (correct company?)
  - [ ] Manually verify 5 emails (deliverable?)
  - [ ] Check for false positives

---

## 📈 G. Analytics & Reporting

- [ ] **Prospect Stats Dashboard**
  - [ ] Total prospects over time
  - [ ] Enrichment success rate
  - [ ] Stage distribution
  - [ ] Tier distribution
  - [ ] Source breakdown (Sales Nav, scraping, manual)

- [ ] **Enrichment Performance**
  - [ ] Websites found per day
  - [ ] Emails found per day
  - [ ] Success rates by source
  - [ ] API usage and costs

---

## ✅ H. Acceptance Criteria

### Prospect Database Must:
- [ ] Have >10,000 prospects
- [ ] >50% enrichment rate (email found)
- [ ] <5% duplicate rate
- [ ] All required fields populated
- [ ] Proper stage/tier assignment

### Enrichment System Must:
- [ ] Find websites with >80% success rate
- [ ] Find emails with >40% success rate
- [ ] Run automatically via cron
- [ ] Handle errors gracefully
- [ ] Track progress and results

---

## 🚨 Known Issues to Fix

1. **Only 0.2% have valid emails** → Run aggressive enrichment
2. **947 prospects stuck in 'new' stage** → Process backlog
3. **No enrichment activity in 7+ days** → Restart cron jobs
4. **Potential duplicates** → Run deduplication

---

## 📝 Test Results Template

```markdown
### Prospect Database Test Results
- **Date**: [Date]
- **Total Prospects**: [count]
- **With Email**: [count] ([%])
- **Valid Emails**: [count] ([%])
- **Duplicates Found**: [count]

#### Enrichment Performance
- **Websites Found**: [count]/[attempted] ([%])
- **Emails Found**: [count]/[attempted] ([%])
- **Time Taken**: [minutes]

**Status**: 🔴 Critical / 🟡 Needs Work / 🟢 Good
```

---

**Next**: After completing this, move to `todo3.md` (Campaign Management)
