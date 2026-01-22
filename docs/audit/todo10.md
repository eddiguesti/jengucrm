# TODO 10: End-to-End User Flows - Complete Audit

**Priority: HIGH** 🟡
**Estimated Time: 3-4 hours**

---

## 🎯 A. Complete Prospect Journey (Happy Path)

### Flow: New Prospect → Enriched → Contacted → Engaged → Meeting

- [ ] **Step 1: Import New Prospect**
  - [ ] Navigate to `/prospects`
  - [ ] Click "Add Prospect" button
  - [ ] Fill in form:
    - [ ] Company name: "Test Hotel"
    - [ ] Location: "Miami, FL"
    - [ ] Contact name: "John Smith" (GM)
    - [ ] Industry: Hotels
    - [ ] Tier: "warm"
  - [ ] Click "Save"
  - [ ] Verify prospect appears in list
  - [ ] Stage should be: `new`

- [ ] **Step 2: Enrich Prospect**
  - [ ] Click on prospect row
  - [ ] Click "Enrich" button
  - [ ] System finds website
  - [ ] System finds email
  - [ ] Verify:
    - [ ] `website` field populated
    - [ ] `email` field populated (personal, not info@)
    - [ ] `enrichment_status` = `enriched`
    - [ ] Stage updated to `enriched`

- [ ] **Step 3: Assign to Campaign**
  - [ ] Navigate to `/outreach/campaigns`
  - [ ] Open existing campaign (or create new one)
  - [ ] Click "Add Leads"
  - [ ] Search for "Test Hotel"
  - [ ] Select prospect
  - [ ] Click "Add to Campaign"
  - [ ] Verify:
    - [ ] `campaign_leads` table has new row
    - [ ] Lead status = `pending`
    - [ ] Lead appears in campaign leads list

- [ ] **Step 4: Email Sending (Automated)**
  - [ ] Wait for cron job (or trigger manually)
  - [ ] `/api/cron/hourly-email` runs
  - [ ] System:
    - [ ] Selects eligible lead
    - [ ] Generates personalized email
    - [ ] Sends via mailbox
    - [ ] Updates database
  - [ ] Verify:
    - [ ] `emails` table has new outbound email
    - [ ] Lead status = `contacted`
    - [ ] Prospect stage = `contacted`
    - [ ] Mailbox `sent_today` incremented
    - [ ] Activity logged

- [ ] **Step 5: Receive Reply**
  - [ ] Simulate reply or wait for real reply
  - [ ] `/api/cron/check-replies` detects inbound
  - [ ] System:
    - [ ] Creates inbound email record
    - [ ] Updates lead status to `engaged`
    - [ ] Updates prospect stage to `engaged`
    - [ ] Creates notification
  - [ ] Verify:
    - [ ] Reply appears in `/emails`
    - [ ] Notification badge shows new item
    - [ ] Lead status = `engaged`

- [ ] **Step 6: Book Meeting**
  - [ ] User reviews reply at `/outreach/inbox`
  - [ ] User clicks "Book Meeting"
  - [ ] System:
    - [ ] Updates lead status to `meeting`
    - [ ] Updates prospect stage to `meeting`
    - [ ] Sends meeting notification
  - [ ] Verify:
    - [ ] Prospect stage = `meeting`
    - [ ] Activity logged: "meeting_booked"

---

## 📂 B. Bulk Import Flow

### Flow: CSV Import → Bulk Enrichment → Campaign Creation

- [ ] **Step 1: Import Sales Navigator CSV**
  - [ ] Navigate to `/sales-navigator`
  - [ ] Click "Upload CSV"
  - [ ] Select file: `sales-nav-export.csv`
  - [ ] Click "Import"
  - [ ] System:
    - [ ] Parses CSV
    - [ ] Deduplicates
    - [ ] Inserts prospects
  - [ ] Verify:
    - [ ] Prospects imported (check count)
    - [ ] No duplicates created
    - [ ] Stage = `new`
    - [ ] Source = `sales_navigator`

- [ ] **Step 2: Trigger Bulk Enrichment**
  - [ ] Navigate to `/prospects`
  - [ ] Filter: Stage = `new`
  - [ ] Select 50 prospects
  - [ ] Click "Bulk Enrich"
  - [ ] System:
    - [ ] Finds websites (Cloudflare Worker)
    - [ ] Finds emails (MillionVerifier)
  - [ ] Wait for completion (5-10 min)
  - [ ] Verify:
    - [ ] Websites found for ~90%
    - [ ] Emails found for ~50%
    - [ ] Stage updated to `enriched`
    - [ ] Enrichment logs created

- [ ] **Step 3: Create Campaign**
  - [ ] Navigate to `/outreach/campaigns`
  - [ ] Click "New Campaign"
  - [ ] Fill in:
    - [ ] Name: "Miami Hotels - Q1 2025"
    - [ ] Goal: "Book demos"
    - [ ] Target: Hotels in Miami
  - [ ] Click "Create"
  - [ ] Verify campaign created

- [ ] **Step 4: Add Email Sequence**
  - [ ] Open campaign
  - [ ] Click "Add Sequence Step"
  - [ ] Step 1:
    - [ ] Subject: AI-generated or custom
    - [ ] Body: Personalized template
    - [ ] Delay: 0 days (initial)
  - [ ] Click "Save Step"
  - [ ] Click "Add Sequence Step"
  - [ ] Step 2:
    - [ ] Follow-up email
    - [ ] Delay: 3 days
  - [ ] Verify:
    - [ ] 2 sequences created
    - [ ] Order correct
    - [ ] Templates saved

- [ ] **Step 5: Bulk Add Leads**
  - [ ] Click "Add Leads"
  - [ ] Filter: Location = "Miami", Tier = "hot"
  - [ ] Select all enriched prospects (with valid emails)
  - [ ] Click "Add to Campaign"
  - [ ] Verify:
    - [ ] All leads added
    - [ ] Status = `pending`
    - [ ] No duplicates

- [ ] **Step 6: Activate Campaign**
  - [ ] Toggle "Active" switch
  - [ ] Confirm activation
  - [ ] Verify:
    - [ ] Campaign status = `active`
    - [ ] Cron will pick up leads
    - [ ] Dashboard shows campaign as active

---

## 📮 C. Mailbox Warmup Journey

### Flow: Add Mailbox → Warmup → Graduation

- [ ] **Week 1: New Mailbox**
  - [ ] Navigate to `/outreach/mailboxes`
  - [ ] Click "Add Mailbox"
  - [ ] Enter SMTP/IMAP details
  - [ ] Test connection (should succeed)
  - [ ] Save mailbox
  - [ ] Verify:
    - [ ] Status = `warming`
    - [ ] Warmup stage = 1
    - [ ] Daily limit = 5 emails
    - [ ] Health score = 100%

- [ ] **Day 1-7: Send 5 emails/day**
  - [ ] Cron runs every 5 min
  - [ ] Mailbox sends up to 5 emails total
  - [ ] After 5 sent:
    - [ ] Mailbox rotation skips this inbox
    - [ ] `sent_today` = 5
  - [ ] Next day:
    - [ ] Counter resets to 0
    - [ ] Mailbox can send 5 again
  - [ ] End of Week 1:
    - [ ] Total sent: 35 emails
    - [ ] Warmup stage still = 1

- [ ] **Week 2: Stage Advancement**
  - [ ] Daily cron (7am UTC) runs
  - [ ] System:
    - [ ] Checks mailbox age (7+ days)
    - [ ] Advances warmup stage: 1 → 2
    - [ ] Increases daily limit: 5 → 10
  - [ ] Verify:
    - [ ] Warmup stage = 2
    - [ ] Daily limit = 10
    - [ ] Mailbox sends 10/day

- [ ] **Week 3-5: Continue Progression**
  - [ ] Week 3: Stage 3, limit 15/day
  - [ ] Week 4: Stage 4, limit 20/day
  - [ ] Week 5: Stage 5 (GRADUATED), limit 25/day
  - [ ] Verify at each stage:
    - [ ] Stage incremented
    - [ ] Daily limit correct
    - [ ] Health score remains high

- [ ] **Handle Bounce**
  - [ ] Simulate bounced email
  - [ ] System:
    - [ ] Detects bounce
    - [ ] Decrements health score
    - [ ] If health < 70%:
      - [ ] Auto-pauses mailbox
      - [ ] Status = `paused`
  - [ ] Verify:
    - [ ] Health score updated
    - [ ] Mailbox paused if necessary
    - [ ] Alert sent to user

---

## 🔄 D. Follow-Up Automation Flow

### Flow: Initial Email → No Reply → Auto Follow-Up

- [ ] **Day 1: Initial Email Sent**
  - [ ] Lead contacted via campaign
  - [ ] Email sent successfully
  - [ ] `campaign_leads.current_step` = 1
  - [ ] `campaign_leads.last_email_at` = NOW
  - [ ] No reply received

- [ ] **Day 4: Follow-Up Cron Runs**
  - [ ] `/api/cron/follow-up` triggers (10am UTC)
  - [ ] System:
    - [ ] Finds leads with:
      - [ ] `current_step` = 1
      - [ ] `last_email_at` >= 3 days ago
      - [ ] Status = `contacted` (no reply)
    - [ ] Checks if sequence step 2 exists
    - [ ] Sends follow-up email
  - [ ] Verify:
    - [ ] Follow-up email sent
    - [ ] `current_step` = 2
    - [ ] `last_email_at` updated
    - [ ] Email logged in `emails` table

- [ ] **Day 7: Second Follow-Up (if configured)**
  - [ ] If sequence has step 3
  - [ ] Same process repeats
  - [ ] Verify email sent and step incremented

- [ ] **Reply Received After Follow-Up**
  - [ ] Prospect replies to follow-up
  - [ ] System:
    - [ ] Detects reply
    - [ ] Stops further follow-ups
    - [ ] Updates status to `engaged`
  - [ ] Verify:
    - [ ] No more automated emails sent
    - [ ] User notified of engagement

---

## 🌐 E. Cloudflare Worker End-to-End

### Flow: Cron → Enrichment → Email Sending

- [ ] **Enrichment Cron (Off-Hours)**
  - [ ] Time: 6am or 7pm-11pm UTC
  - [ ] Worker cron: `*/5 6,19-23 * * *`
  - [ ] System:
    - [ ] Fetches 20 prospects without websites
    - [ ] DuckDuckGo search + Grok AI selection
    - [ ] Saves websites to Supabase
    - [ ] Fetches 10 prospects with websites, no emails
    - [ ] Generates email patterns
    - [ ] Verifies with MillionVerifier
    - [ ] Saves emails to Supabase
  - [ ] Verify:
    - [ ] Websites found
    - [ ] Emails found
    - [ ] Supabase updated
    - [ ] Logs show progress

- [ ] **Email Sending Cron (Business Hours)**
  - [ ] Time: 8am-6pm Mon-Sat
  - [ ] Worker cron: `*/5 8-18 * * 1-6`
  - [ ] System:
    - [ ] Loads mailboxes from Supabase
    - [ ] Fetches eligible leads
    - [ ] For each lead:
      - [ ] Check daily limit (Durable Object: WarmupCounter)
      - [ ] Generate email (Grok AI)
      - [ ] Send via SMTP
      - [ ] Increment counter
    - [ ] Update Supabase:
      - [ ] `sent_today` in mailboxes
      - [ ] Email record
      - [ ] Lead status
  - [ ] Verify:
    - [ ] Emails sent
    - [ ] Counters updated
    - [ ] Supabase synced
    - [ ] No limit exceeded

- [ ] **Daily Reset Cron (7am UTC)**
  - [ ] Worker cron: `0 7 * * *`
  - [ ] System:
    - [ ] Resets all `sent_today` to 0
    - [ ] Advances warmup stages (if eligible)
    - [ ] Cleans up old logs
  - [ ] Verify:
    - [ ] Counters reset
    - [ ] Warmup stages advanced
    - [ ] System ready for new day

---

## 🧪 F. API-Driven Workflow

### Flow: API Calls → Database → Response

- [ ] **Create Prospect via API**
  ```bash
  curl -X POST https://crm.jengu.ai/api/prospects \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $API_KEY" \
    -d '{
      "company_name": "API Test Hotel",
      "location": "New York, NY",
      "contact_name": "Jane Doe",
      "title": "General Manager"
    }'
  ```
  - [ ] Returns prospect ID
  - [ ] Check database for new record
  - [ ] Stage = `new`

- [ ] **Enrich via API**
  ```bash
  curl -X POST https://crm.jengu.ai/api/enrich \
    -H "Authorization: Bearer $API_KEY" \
    -d '{"prospect_id": "xxx"}'
  ```
  - [ ] Returns enrichment status
  - [ ] Check database for updated fields
  - [ ] `website` and `email` populated

- [ ] **Assign to Campaign via API**
  ```bash
  curl -X POST https://crm.jengu.ai/api/campaigns/xxx/leads \
    -H "Authorization: Bearer $API_KEY" \
    -d '{"prospect_ids": ["xxx"]}'
  ```
  - [ ] Returns success
  - [ ] Check `campaign_leads` table
  - [ ] Lead status = `pending`

- [ ] **Trigger Email Sending via API**
  ```bash
  curl -X POST https://crm.jengu.ai/api/cron/hourly-email \
    -H "Authorization: Bearer $CRON_SECRET"
  ```
  - [ ] Returns emails sent count
  - [ ] Check `emails` table
  - [ ] Email sent to assigned lead

---

## 🔍 G. Error Handling & Recovery

### Flow: Failure → Detection → Recovery

- [ ] **Scenario 1: Mailbox Auth Failure**
  - [ ] Trigger: Change mailbox password to wrong value
  - [ ] Expected:
    - [ ] Email send fails
    - [ ] Error logged to `activities`
    - [ ] Mailbox status = `error`
    - [ ] `last_error` field populated
    - [ ] User notified (if alerts configured)
  - [ ] Recovery:
    - [ ] Fix password
    - [ ] Test connection
    - [ ] Status back to `active`

- [ ] **Scenario 2: Enrichment API Rate Limit**
  - [ ] Trigger: Exceed MillionVerifier quota
  - [ ] Expected:
    - [ ] API returns 429 error
    - [ ] System pauses enrichment
    - [ ] Logs error
    - [ ] Retries later
  - [ ] Recovery:
    - [ ] Wait for quota reset
    - [ ] Enrichment resumes automatically

- [ ] **Scenario 3: Database Connection Lost**
  - [ ] Trigger: Network issue or Supabase downtime
  - [ ] Expected:
    - [ ] API returns 500 error
    - [ ] Cron job fails gracefully
    - [ ] Error logged to console
    - [ ] No data corruption
  - [ ] Recovery:
    - [ ] Connection restored
    - [ ] Next cron run succeeds

- [ ] **Scenario 4: Duplicate Prospect Import**
  - [ ] Trigger: Import same CSV twice
  - [ ] Expected:
    - [ ] Deduplication logic runs
    - [ ] Duplicates detected by email or company+location
    - [ ] Only new prospects inserted
    - [ ] Log shows "X duplicates skipped"
  - [ ] Verify:
    - [ ] No duplicate records created
    - [ ] Existing records not overwritten

---

## 📊 H. Dashboard Metrics Validation

### Flow: Activity → Database → Dashboard Display

- [ ] **Send 10 emails**
  - [ ] Via cron or manual trigger
  - [ ] Verify `emails` table has 10 new rows

- [ ] **Navigate to Dashboard (`/`)**
  - [ ] Check "Emails Sent Today"
    - [ ] Should show: 10
  - [ ] Check "Total Prospects"
    - [ ] Should match `SELECT COUNT(*) FROM prospects`
  - [ ] Check "Active Campaigns"
    - [ ] Should match `SELECT COUNT(*) FROM campaigns WHERE active = true`

- [ ] **Receive 2 replies**
  - [ ] Simulate or wait for real replies
  - [ ] Check "Reply Rate"
    - [ ] Should calculate: (2 / 10) * 100 = 20%

- [ ] **Navigate to `/outreach/analytics`**
  - [ ] Check email volume chart
    - [ ] X-axis: Last 7 days
    - [ ] Y-axis: Email count per day
    - [ ] Today should show 10
  - [ ] Check reply rate trend
    - [ ] Should show 20%

- [ ] **Verify Real-Time Updates**
  - [ ] Send 1 more email
  - [ ] Refresh dashboard
  - [ ] "Emails Sent Today" should update to 11

---

## 🎨 I. UI/UX Complete Journey

### Flow: Login → Navigate → Interact → Logout

- [ ] **Login (if auth enabled)**
  - [ ] Navigate to `/login`
  - [ ] Enter credentials
  - [ ] Click "Sign In"
  - [ ] Redirected to `/`

- [ ] **Dashboard Navigation**
  - [ ] Click "Prospects" in sidebar
    - [ ] Navigate to `/prospects`
  - [ ] Click "Emails" in sidebar
    - [ ] Navigate to `/emails`
  - [ ] Click "Campaigns" in sidebar
    - [ ] Navigate to `/outreach/campaigns`
  - [ ] Click "Mailboxes" in sidebar
    - [ ] Navigate to `/outreach/mailboxes`
  - [ ] Click "Analytics" in sidebar
    - [ ] Navigate to `/outreach/analytics`

- [ ] **Responsive Design**
  - [ ] Resize browser to mobile width
  - [ ] Verify:
    - [ ] Sidebar collapses to hamburger menu
    - [ ] Tables scroll horizontally
    - [ ] Buttons stack vertically
    - [ ] All content readable

- [ ] **Dark Mode (if implemented)**
  - [ ] Click theme toggle
  - [ ] Verify:
    - [ ] All pages use dark theme
    - [ ] Text contrast readable
    - [ ] Charts update colors

---

## ✅ J. Acceptance Criteria

### System Must:
- [ ] Import prospects successfully (manual + CSV)
- [ ] Enrich prospects (websites + emails)
- [ ] Create campaigns with sequences
- [ ] Assign leads to campaigns
- [ ] Send automated emails on schedule
- [ ] Detect and process replies
- [ ] Send follow-up emails automatically
- [ ] Track mailbox warmup progression
- [ ] Enforce daily sending limits
- [ ] Display accurate analytics
- [ ] Handle errors gracefully
- [ ] Sync between Supabase and Cloudflare Workers
- [ ] Complete full prospect journey: new → enriched → contacted → engaged → meeting

### Zero Tolerance:
- [ ] No data loss
- [ ] No duplicate emails sent
- [ ] No sending over daily limits
- [ ] No emails sent outside business hours (if configured)
- [ ] No crashes or unhandled exceptions

---

## 🚨 K. Known Issues to Fix Before Launch

1. **No email sequences in campaigns** → Create templates for each campaign
2. **No leads assigned to campaigns** → Bulk add enriched prospects
3. **Cron jobs not running** → Configure external cron (cron-job.org)
4. **Low enrichment rate (0.3%)** → Run overnight enrichment pipeline
5. **Missing ANTHROPIC_API_KEY** → Add to environment variables
6. **No activities in 24h** → Verify cron jobs are scheduled and executing

---

## 📝 Test Results Template

```markdown
### End-to-End Test Results
**Date**: [date]
**Tester**: [name]

#### Prospect Journey (A)
- [ ] ✅ Prospect created
- [ ] ✅ Enrichment successful
- [ ] ✅ Assigned to campaign
- [ ] ✅ Email sent
- [ ] ✅ Reply detected
- [ ] ✅ Meeting booked
- [ ] ❌ Issue: [description]

#### Bulk Import Flow (B)
- [ ] ✅ CSV imported
- [ ] ✅ Bulk enrichment works
- [ ] ✅ Campaign created
- [ ] ✅ Sequence added
- [ ] ✅ Leads assigned
- [ ] ✅ Campaign activated

#### Mailbox Warmup (C)
- [ ] ✅ Mailbox added
- [ ] ✅ Warmup stage advances weekly
- [ ] ✅ Daily limits enforced
- [ ] ✅ Health monitoring works

#### Follow-Up Automation (D)
- [ ] ✅ Initial email sent
- [ ] ✅ Follow-up triggered after delay
- [ ] ✅ Sequence completes
- [ ] ✅ Stops on reply

#### Cloudflare Worker (E)
- [ ] ✅ Enrichment cron works
- [ ] ✅ Email sending cron works
- [ ] ✅ Daily reset works
- [ ] ✅ Supabase sync works

#### API-Driven Workflow (F)
- [ ] ✅ All API endpoints functional
- [ ] ✅ Proper error responses
- [ ] ✅ Authentication works

#### Error Handling (G)
- [ ] ✅ Mailbox errors detected
- [ ] ✅ Rate limits handled
- [ ] ✅ Database errors caught
- [ ] ✅ Duplicates prevented

#### Dashboard Metrics (H)
- [ ] ✅ Counts accurate
- [ ] ✅ Charts render correctly
- [ ] ✅ Real-time updates work

#### UI/UX Journey (I)
- [ ] ✅ All pages accessible
- [ ] ✅ All buttons work
- [ ] ✅ Responsive on mobile
- [ ] ✅ No console errors

**Overall Status**: 🟢 All Flows Working / 🟡 Minor Issues / 🔴 Critical Failures

**Notes**:
[Any observations, edge cases found, or recommendations]
```

---

**Next**: After completing all 10 TODOs, the system should be fully functional, tested, and ready for production use.

