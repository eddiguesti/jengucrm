# TODO 6: API Endpoints - Complete Testing

**Priority: CRITICAL** 🔴
**Estimated Time: 3-4 hours**

---

## 🔐 A. Authentication & Security

### 1. CRON_SECRET Authentication
- [ ] **Test Protected Endpoints**
  ```bash
  # Should fail (401 Unauthorized)
  curl https://crm.jengu.ai/api/cron/daily

  # Should succeed (200 OK)
  curl https://crm.jengu.ai/api/cron/daily \
    -H "Authorization: Bearer ${CRON_SECRET}"
  ```

- [ ] **Verify on All Cron Endpoints**:
  - [ ] `/api/cron/daily`
  - [ ] `/api/cron/hourly-email`
  - [ ] `/api/cron/check-replies`
  - [ ] `/api/cron/follow-up`
  - [ ] `/api/cron/sales-nav-enrichment`

### 2. Rate Limiting
- [ ] **Check Rate Limits** (`src/lib/api-rate-limit.ts`)
  - [ ] Review configuration
  - [ ] Test exceeding limits
  - [ ] Verify 429 response
  - [ ] Check reset timer

---

## 📧 B. Email Endpoints

### 1. Send Email
- [ ] **`POST /api/auto-email`**
  ```bash
  curl -X POST https://crm.jengu.ai/api/auto-email \
    -H "Authorization: Bearer ${CRON_SECRET}" \
    -H "Content-Type: application/json" \
    -d '{"max_emails": 1}'
  ```
  - [ ] Returns 200 OK
  - [ ] Response includes count sent
  - [ ] Email actually sends
  - [ ] Database updated
  - [ ] Activity logged

- [ ] **`POST /api/test-email`**
  ```bash
  curl -X POST https://crm.jengu.ai/api/test-email \
    -H "Content-Type: application/json" \
    -d '{
      "to": "test@example.com",
      "subject": "Test",
      "body": "Test email"
    }'
  ```
  - [ ] Sends test email
  - [ ] Respects mailbox selection
  - [ ] Returns tracking info

### 2. Email Generation
- [ ] **`POST /api/generate-email`**
  ```bash
  curl -X POST https://crm.jengu.ai/api/generate-email \
    -H "Content-Type: application/json" \
    -d '{
      "prospect_id": "[prospect-uuid]",
      "strategy": "cold_pattern_interrupt"
    }'
  ```
  - [ ] Returns generated email
  - [ ] Subject personalized
  - [ ] Body personalized
  - [ ] Uses Grok AI
  - [ ] Quality check passes

### 3. Email Simulation
- [ ] **`POST /api/simulate-email`**
  - [ ] Preview without sending
  - [ ] Shows personalization
  - [ ] Returns formatted email

### 4. Email Retrieval
- [ ] **`GET /api/emails`**
  ```bash
  curl https://crm.jengu.ai/api/emails?limit=10
  ```
  - [ ] Returns email list
  - [ ] Pagination works
  - [ ] Filters work (direction, status, date)

- [ ] **`GET /api/emails/[id]`**
  - [ ] Returns specific email
  - [ ] Includes tracking data
  - [ ] Shows thread if reply

---

## 👥 C. Prospect Endpoints

### 1. List Prospects
- [ ] **`GET /api/prospects`**
  ```bash
  curl https://crm.jengu.ai/api/prospects?limit=20&stage=enriched
  ```
  - [ ] Returns prospects
  - [ ] Pagination works
  - [ ] Filters work:
    - [ ] `stage`
    - [ ] `tier`
    - [ ] `has_email`
    - [ ] `search`
  - [ ] Sorting works

### 2. Get Prospect
- [ ] **`GET /api/prospects/[id]`**
  ```bash
  curl https://crm.jengu.ai/api/prospects/[uuid]
  ```
  - [ ] Returns full prospect data
  - [ ] Includes relationships (emails, activities)
  - [ ] 404 if not found

### 3. Create Prospect
- [ ] **`POST /api/prospects`**
  ```bash
  curl -X POST https://crm.jengu.ai/api/prospects \
    -H "Content-Type: application/json" \
    -d '{
      "company_name": "Test Hotel",
      "location": "Paris, France",
      "contact_name": "John Doe"
    }'
  ```
  - [ ] Creates prospect
  - [ ] Returns created record
  - [ ] Validation works
  - [ ] Activity logged

### 4. Update Prospect
- [ ] **`PATCH /api/prospects/[id]`**
  ```bash
  curl -X PATCH https://crm.jengu.ai/api/prospects/[uuid] \
    -H "Content-Type: application/json" \
    -d '{
      "stage": "contacted",
      "tier": "warm"
    }'
  ```
  - [ ] Updates prospect
  - [ ] Partial updates work
  - [ ] Activity logged

### 5. Delete Prospect
- [ ] **`DELETE /api/prospects/[id]`**
  - [ ] Deletes prospect
  - [ ] Cascades to related records (or prevents delete)
  - [ ] Returns confirmation

---

## 🔍 D. Enrichment Endpoints

### 1. Trigger Enrichment
- [ ] **`POST /api/enrichment/trigger`**
  ```bash
  curl -X POST https://crm.jengu.ai/api/enrichment/trigger \
    -H "Authorization: Bearer ${CRON_SECRET}" \
    -d '{"batch_size": 50}'
  ```
  - [ ] Starts enrichment process
  - [ ] Returns job ID or status
  - [ ] Processes in background

### 2. Enrichment Status
- [ ] **`GET /api/enrichment/status`**
  ```bash
  curl https://crm.jengu.ai/api/enrichment/status
  ```
  - [ ] Returns current progress
  - [ ] Shows queue size
  - [ ] Success/failure counts

### 3. Enrichment Stats
- [ ] **`GET /api/enrichment-stats`**
  - [ ] Overall enrichment metrics
  - [ ] Success rates
  - [ ] Recent activity

### 4. Find Email
- [ ] **`POST /api/find-email`**
  ```bash
  curl -X POST https://crm.jengu.ai/api/find-email \
    -H "Content-Type: application/json" \
    -d '{
      "prospect_id": "[uuid]"
    }'
  ```
  - [ ] Finds email for prospect
  - [ ] Uses MillionVerifier
  - [ ] Updates prospect
  - [ ] Returns email or error

### 5. Enrich Prospect
- [ ] **`POST /api/enrich`**
  - [ ] Enriches single prospect
  - [ ] Finds website
  - [ ] Finds email
  - [ ] Updates database

---

## 📬 E. Campaign Endpoints

### 1. List Campaigns
- [ ] **`GET /api/outreach/campaigns`**
  ```bash
  curl https://crm.jengu.ai/api/outreach/campaigns
  ```
  - [ ] Returns all campaigns
  - [ ] Includes stats
  - [ ] Filter by active/paused

### 2. Create Campaign
- [ ] **`POST /api/outreach/campaigns`**
  ```bash
  curl -X POST https://crm.jengu.ai/api/outreach/campaigns \
    -H "Content-Type: application/json" \
    -d '{
      "name": "Test Campaign API",
      "description": "Created via API",
      "daily_limit": 50
    }'
  ```
  - [ ] Creates campaign
  - [ ] Returns created record
  - [ ] Validation works

### 3. Get Campaign
- [ ] **`GET /api/outreach/campaigns/[id]`**
  - [ ] Returns campaign details
  - [ ] Includes sequences
  - [ ] Includes stats

### 4. Update Campaign
- [ ] **`PATCH /api/outreach/campaigns/[id]`**
  - [ ] Updates settings
  - [ ] Can activate/pause
  - [ ] Activity logged

### 5. Delete Campaign
- [ ] **`DELETE /api/outreach/campaigns/[id]`**
  - [ ] Deletes campaign
  - [ ] Handles cascades
  - [ ] Returns confirmation

### 6. Campaign Leads
- [ ] **`GET /api/outreach/campaigns/[id]/leads`**
  - [ ] Returns campaign leads
  - [ ] Includes prospect data
  - [ ] Shows progress

- [ ] **`POST /api/outreach/campaigns/[id]/leads`**
  - [ ] Adds leads to campaign
  - [ ] Bulk add support
  - [ ] Validates prospect exists

---

## 📮 F. Mailbox Endpoints

### 1. List Mailboxes
- [ ] **`GET /api/outreach/mailboxes`**
  ```bash
  curl https://crm.jengu.ai/api/outreach/mailboxes
  ```
  - [ ] Returns all mailboxes
  - [ ] Includes stats
  - [ ] Summary metrics

### 2. Create Mailbox
- [ ] **`POST /api/outreach/mailboxes`**
  ```bash
  curl -X POST https://crm.jengu.ai/api/outreach/mailboxes \
    -H "Content-Type: application/json" \
    -d '{
      "email": "test@example.com",
      "smtp_host": "smtp.example.com",
      "smtp_port": 465,
      "smtp_user": "test@example.com",
      "smtp_pass": "password"
    }'
  ```
  - [ ] Creates mailbox
  - [ ] Encrypts password
  - [ ] Tests connection
  - [ ] Returns result

### 3. Test Mailbox
- [ ] **`POST /api/outreach/mailboxes/[id]/test`**
  - [ ] Tests SMTP connection
  - [ ] Tests IMAP connection
  - [ ] Returns success/error

### 4. Update Mailbox
- [ ] **`PATCH /api/outreach/mailboxes/[id]`**
  - [ ] Updates settings
  - [ ] Can pause/resume
  - [ ] Re-tests if credentials changed

### 5. Delete Mailbox
- [ ] **`DELETE /api/outreach/mailboxes/[id]`**
  - [ ] Deletes mailbox
  - [ ] Prevents if has sent emails (or reassigns)

---

## ⏰ G. Cron Endpoints

### 1. Daily Cron
- [ ] **`GET /api/cron/daily`**
  ```bash
  curl https://crm.jengu.ai/api/cron/daily \
    -H "Authorization: Bearer ${CRON_SECRET}"
  ```
  - [ ] Executes daily tasks
  - [ ] Returns execution summary
  - [ ] Logs activity

### 2. Hourly Email Cron
- [ ] **`GET /api/cron/hourly-email`**
  - [ ] Sends batch of emails
  - [ ] Respects warmup limits
  - [ ] Returns count sent

### 3. Check Replies Cron
- [ ] **`GET /api/cron/check-replies`**
  - [ ] Checks IMAP for new emails
  - [ ] Parses replies
  - [ ] Updates campaign leads
  - [ ] Creates notifications

### 4. Follow-up Cron
- [ ] **`GET /api/cron/follow-up`**
  - [ ] Finds prospects needing follow-up
  - [ ] Sends follow-up emails
  - [ ] Returns count

### 5. Sales Nav Enrichment Cron
- [ ] **`GET /api/cron/sales-nav-enrichment`**
  - [ ] Processes Sales Nav queue
  - [ ] Finds emails
  - [ ] Updates prospects

---

## 📊 H. Stats & Analytics Endpoints

### 1. Dashboard Stats
- [ ] **`GET /api/stats`**
  ```bash
  curl https://crm.jengu.ai/api/stats
  ```
  - [ ] Returns overview metrics
  - [ ] Prospect counts
  - [ ] Email stats
  - [ ] Campaign performance

### 2. Detailed Stats
- [ ] **`GET /api/stats/detailed`**
  - [ ] Breakdown by time period
  - [ ] Breakdown by campaign
  - [ ] Breakdown by mailbox

### 3. Agent Stats
- [ ] **`GET /api/agents`**
  - [ ] Stats per mailbox
  - [ ] Reply rates
  - [ ] Pipeline funnels

### 4. Analytics
- [ ] **`GET /api/outreach/analytics`**
  - [ ] Campaign analytics
  - [ ] Email performance
  - [ ] Time series data

---

## 🔧 I. Utility Endpoints

### 1. Health Check
- [ ] **`GET /api/health`**
  ```bash
  curl https://crm.jengu.ai/api/health
  ```
  - [ ] Returns system health
  - [ ] Database connection
  - [ ] External API status
  - [ ] Queue status

### 2. Debug SMTP
- [ ] **`GET /api/debug-smtp`**
  - [ ] Shows SMTP configuration
  - [ ] Tests connections
  - [ ] Returns diagnostics

### 3. Usage Tracking
- [ ] **`GET /api/usage`**
  - [ ] API usage stats
  - [ ] External API consumption
  - [ ] Rate limit status

### 4. Search
- [ ] **`GET /api/search?q=query`**
  - [ ] Searches prospects
  - [ ] Searches campaigns
  - [ ] Returns mixed results

---

## 📥 J. Import/Export Endpoints

### 1. Sales Navigator Import
- [ ] **`POST /api/sales-navigator`**
  ```bash
  curl -X POST https://crm.jengu.ai/api/sales-navigator \
    -F "file=@leads.csv"
  ```
  - [ ] Accepts CSV file
  - [ ] Parses data
  - [ ] Creates prospects
  - [ ] Returns import summary

### 2. Export Prospects
- [ ] **`GET /api/prospects/export`**
  - [ ] Returns CSV file
  - [ ] All fields included
  - [ ] Filtering works

### 3. Export Emails
- [ ] **`GET /api/emails/export`**
  - [ ] Returns CSV file
  - [ ] All email data

---

## 🧪 K. End-to-End API Test

### Complete User Journey via API
- [ ] **Step 1: Create Prospect**
  ```bash
  PROSPECT_ID=$(curl -X POST .../api/prospects \
    -d '{"company_name": "API Test Hotel"}' \
    -H "Content-Type: application/json" \
    | jq -r '.id')
  ```

- [ ] **Step 2: Enrich Prospect**
  ```bash
  curl -X POST .../api/enrich \
    -d "{\"prospect_id\": \"$PROSPECT_ID\"}"
  ```

- [ ] **Step 3: Create Campaign**
  ```bash
  CAMPAIGN_ID=$(curl -X POST .../api/outreach/campaigns \
    -d '{"name": "API Test Campaign"}' \
    | jq -r '.id')
  ```

- [ ] **Step 4: Add Lead to Campaign**
  ```bash
  curl -X POST .../api/outreach/campaigns/$CAMPAIGN_ID/leads \
    -d "{\"prospect_id\": \"$PROSPECT_ID\"}"
  ```

- [ ] **Step 5: Send Email**
  ```bash
  curl -X POST .../api/auto-email \
    -H "Authorization: Bearer $CRON_SECRET" \
    -d '{"max_emails": 1}'
  ```

- [ ] **Step 6: Verify Email Sent**
  ```bash
  curl .../api/emails?prospect_id=$PROSPECT_ID
  ```

- [ ] **Step 7: Cleanup**
  ```bash
  curl -X DELETE .../api/prospects/$PROSPECT_ID
  curl -X DELETE .../api/outreach/campaigns/$CAMPAIGN_ID
  ```

---

## ✅ L. Acceptance Criteria

### Every Endpoint Must:
- [ ] Return proper HTTP status codes
- [ ] Return JSON (unless file download)
- [ ] Handle errors gracefully
- [ ] Validate input
- [ ] Log activity
- [ ] Respect authentication
- [ ] Have consistent response format

### Response Format:
```json
{
  "success": true/false,
  "data": {...},
  "error": "error message if failed",
  "meta": {
    "pagination": {...},
    "total": 123
  }
}
```

---

## 🚨 Known Issues to Fix

1. **Some endpoints may not exist** → Create if missing
2. **Authentication not enforced everywhere** → Add CRON_SECRET checks
3. **Error handling inconsistent** → Standardize responses
4. **Missing validation** → Add input validation

---

## 📝 Test Results Template

```markdown
### API Endpoint: [endpoint]
**Method**: GET/POST/PATCH/DELETE
**URL**: [full URL]

#### Test Cases
- [ ] ✅ Happy path works
- [ ] ✅ Authentication required
- [ ] ✅ Validation works
- [ ] ✅ Error handling correct
- [ ] ❌ Issue: [description]

**Status**: 🟢 Pass / 🟡 Partial / 🔴 Fail
```

---

**Next**: After completing this, move to `todo7.md` (Database Integrity)
