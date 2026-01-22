# TODO 3: Campaign Management - Complete Audit

**Priority: CRITICAL** 🔴
**Estimated Time: 2-3 hours**

---

## 📬 A. Campaign System Overview

### 1. Database Schema Validation
- [ ] **Campaigns Table**
  - [ ] Verify schema in Supabase:
    - [ ] `id`, `name`, `description`
    - [ ] `strategy_key` (unique identifier)
    - [ ] `active` (boolean)
    - [ ] `send_days` (array: monday-sunday)
    - [ ] `send_time_start`, `send_time_end` (hours: 9-17)
    - [ ] `daily_limit` (max emails per day)
    - [ ] `emails_sent`, `replies_received` (counters)
    - [ ] `created_at`, `updated_at`

- [ ] **Campaign Sequences Table**
  - [ ] Verify schema:
    - [ ] `id`, `campaign_id` (foreign key)
    - [ ] `step_number` (1, 2, 3...)
    - [ ] `delay_days`, `delay_hours` (wait time)
    - [ ] `variant_a_subject`, `variant_a_body`
    - [ ] `variant_b_subject`, `variant_b_body` (A/B testing)
    - [ ] `sent_count`, `open_count`, `reply_count`
  - [ ] Check CASCADE delete on campaign_id

- [ ] **Campaign Leads Table**
  - [ ] Verify schema:
    - [ ] `id`, `campaign_id`, `prospect_id`, `mailbox_id`
    - [ ] `current_step` (which email in sequence)
    - [ ] `status` (active, paused, completed, bounced, etc.)
    - [ ] `assigned_variant` (A or B)
    - [ ] `last_email_at`, `next_email_at`
    - [ ] `emails_sent`, `has_replied`

---

## 🎯 B. Campaign Creation & Management

### 1. Create Campaign UI Test
- [ ] **Navigate to** `/outreach/campaigns/new`
  - [ ] Verify page loads
  - [ ] Check all form fields present:
    - [ ] Campaign name (required)
    - [ ] Description (optional)
    - [ ] Send schedule (days of week)
    - [ ] Send time window (start/end hours)
    - [ ] Daily limit
  - [ ] Test form validation
  - [ ] Submit and verify creation
  - [ ] Check redirect to campaign detail

- [ ] **Verify Database Record**
  ```sql
  SELECT * FROM campaigns
  WHERE name = 'Test Campaign'
  ORDER BY created_at DESC LIMIT 1;
  ```

### 2. Campaign List Page
- [ ] **Navigate to** `/outreach/campaigns`
  - [ ] Verify all campaigns display
  - [ ] Check campaign cards show:
    - [ ] Name, description
    - [ ] Active/Paused status
    - [ ] Email count (sent/replies)
    - [ ] Number of leads
    - [ ] Number of sequence steps
  - [ ] Test filters:
    - [ ] Active only
    - [ ] Paused only
    - [ ] All
  - [ ] Test search functionality
  - [ ] Test "New Campaign" button

### 3. Campaign Detail Page
- [ ] **Navigate to** `/outreach/campaigns/[id]`
  - [ ] Verify campaign data displays
  - [ ] Check tabs:
    - [ ] Sequences
    - [ ] Leads
    - [ ] Settings
    - [ ] Analytics (if exists)
  - [ ] Test Activate/Pause toggle
  - [ ] Test edit settings
  - [ ] Test delete campaign (with confirmation)

---

## ✉️ C. Email Sequences

### 1. Add Email Sequence Steps
- [ ] **Add Step 1 (Initial Outreach)**
  - [ ] Click "Add Step" or similar
  - [ ] Fill in:
    - [ ] Step number: 1
    - [ ] Delay: 0 days, 0 hours (immediate)
    - [ ] Subject: "Quick question about {{hotel_name}}"
    - [ ] Body: [Use personalization variables]
  - [ ] Test personalization toolbar:
    - [ ] Click {{first_name}} → inserts at cursor
    - [ ] Click {{hotel_name}} → inserts at cursor
    - [ ] Verify all variables work
  - [ ] Test preview mode
  - [ ] Save sequence step

- [ ] **Add Step 2 (Follow-up)**
  - [ ] Step number: 2
  - [ ] Delay: 3 days, 0 hours
  - [ ] Subject: "Following up - {{hotel_name}}"
  - [ ] Body: [Reference previous email]
  - [ ] Save

- [ ] **Add Step 3 (Final Follow-up)**
  - [ ] Step number: 3
  - [ ] Delay: 5 days, 0 hours
  - [ ] Save

- [ ] **Verify in Database**
  ```sql
  SELECT * FROM campaign_sequences
  WHERE campaign_id = '[campaign-id]'
  ORDER BY step_number;
  ```

### 2. A/B Testing (if enabled)
- [ ] **Create Variant B**
  - [ ] Different subject line
  - [ ] Different email body
  - [ ] Save both variants

- [ ] **Test Assignment Logic**
  - [ ] Verify leads randomly assigned A or B
  - [ ] Check 50/50 split maintained
  - [ ] Test performance tracking by variant

### 3. Sequence Management
- [ ] **Edit Sequence Step**
  - [ ] Update subject/body
  - [ ] Change delay timing
  - [ ] Save and verify

- [ ] **Delete Sequence Step**
  - [ ] Remove a step
  - [ ] Verify other steps renumber
  - [ ] Check active leads not broken

- [ ] **Reorder Steps**
  - [ ] Drag and drop (if supported)
  - [ ] Verify order saved correctly

---

## 👥 D. Lead Management

### 1. Add Leads to Campaign
- [ ] **Manual Assignment**
  - [ ] Go to `/prospects`
  - [ ] Select multiple prospects
  - [ ] Click "Add to Campaign"
  - [ ] Choose campaign
  - [ ] Verify leads added to `campaign_leads`

- [ ] **Bulk Import**
  - [ ] Use CSV upload (if exists)
  - [ ] Map columns
  - [ ] Import and verify

- [ ] **Auto-Assignment** (if configured)
  - [ ] Set rules (e.g., all 'enriched' prospects)
  - [ ] Test rule triggers
  - [ ] Verify correct prospects added

### 2. Lead Status Management
- [ ] **View Campaign Leads**
  - [ ] Go to campaign detail → Leads tab
  - [ ] Verify all leads display
  - [ ] Check status indicators:
    - [ ] Active (sending in progress)
    - [ ] Completed (finished sequence)
    - [ ] Replied (got response)
    - [ ] Bounced (email failed)
    - [ ] Unsubscribed
    - [ ] Paused

- [ ] **Pause/Resume Leads**
  - [ ] Select lead(s)
  - [ ] Pause sending
  - [ ] Verify `next_email_at` cleared
  - [ ] Resume and verify scheduled again

- [ ] **Remove Leads**
  - [ ] Remove lead from campaign
  - [ ] Verify database updated
  - [ ] Check email history preserved

### 3. Lead Progression
- [ ] **Test Email Sequence Flow**
  - [ ] Add test lead to campaign
  - [ ] Trigger email send (Step 1)
  - [ ] Verify:
    - [ ] Email sent
    - [ ] `current_step` = 1
    - [ ] `last_email_at` = now
    - [ ] `next_email_at` = now + delay
    - [ ] Status = 'active'

  - [ ] Wait for Step 2 delay (or manually trigger)
  - [ ] Verify:
    - [ ] Step 2 email sent
    - [ ] `current_step` = 2
    - [ ] Counters incremented

  - [ ] Continue through all steps
  - [ ] Verify final status = 'completed'

---

## 🤖 E. Campaign Automation

### 1. Email Sending Logic
- [ ] **Review Code** (`src/services/campaign.service.ts`)
  - [ ] Check lead selection logic
  - [ ] Verify timing calculation (delay_days/hours)
  - [ ] Test business hours check
  - [ ] Review personalization replacement
  - [ ] Check error handling

- [ ] **Test Sending Process**
  - [ ] Manually trigger: `POST /api/auto-email`
  - [ ] Or trigger campaign-specific endpoint
  - [ ] Verify:
    - [ ] Only eligible leads selected
    - [ ] Emails personalized correctly
    - [ ] Tracking added
    - [ ] Database updated
    - [ ] Errors logged

### 2. Campaign Scheduling
- [ ] **Send Days**
  - [ ] Set campaign to Monday-Friday only
  - [ ] Verify no sends on weekend
  - [ ] Test with different day combinations

- [ ] **Send Time Window**
  - [ ] Set 9am-5pm
  - [ ] Verify sends only during window
  - [ ] Test timezone handling

- [ ] **Daily Limit**
  - [ ] Set limit (e.g., 50/day)
  - [ ] Verify stops at limit
  - [ ] Check resets daily

### 3. Reply Handling
- [ ] **Reply Detection**
  - [ ] Send email from campaign
  - [ ] Reply to it
  - [ ] Wait for check-replies cron
  - [ ] Verify:
    - [ ] Reply detected
    - [ ] Lead marked `has_replied = true`
    - [ ] Further emails stopped
    - [ ] Notification created

- [ ] **Unsubscribe Handling**
  - [ ] Reply with "unsubscribe"
  - [ ] Verify lead paused
  - [ ] Check added to suppression list

---

## 📊 F. Campaign Analytics

### 1. Performance Metrics
- [ ] **Campaign Stats**
  - [ ] Total leads
  - [ ] Emails sent (by step)
  - [ ] Open rate
  - [ ] Reply rate
  - [ ] Meeting rate
  - [ ] Conversion rate

- [ ] **Verify Calculations**
  - [ ] Cross-check with database queries
  - [ ] Ensure percentages correct
  - [ ] Check charts/graphs accurate

### 2. A/B Test Results
- [ ] **Compare Variants**
  - [ ] Variant A vs B performance
  - [ ] Open rates
  - [ ] Reply rates
  - [ ] Statistical significance

### 3. Lead Funnel
- [ ] **Visualize Progression**
  - [ ] Active → Completed
  - [ ] Active → Replied
  - [ ] Active → Bounced
  - [ ] See drop-off at each step

---

## 🧪 G. End-to-End Campaign Test

### Complete Campaign Flow
- [ ] **Step 1: Create Campaign**
  - [ ] Name: "Test Campaign - E2E"
  - [ ] Schedule: Mon-Fri, 9am-5pm
  - [ ] Daily limit: 10

- [ ] **Step 2: Add 3 Email Steps**
  - [ ] Step 1: Intro (immediate)
  - [ ] Step 2: Follow-up (2 days)
  - [ ] Step 3: Final (4 days)

- [ ] **Step 3: Add 5 Test Leads**
  - [ ] Select prospects with valid emails
  - [ ] Assign to campaign
  - [ ] Verify all added correctly

- [ ] **Step 4: Activate Campaign**
  - [ ] Toggle to active
  - [ ] Verify status updated

- [ ] **Step 5: Send First Batch**
  - [ ] Trigger email cron
  - [ ] Verify 5 emails sent
  - [ ] Check database updates

- [ ] **Step 6: Simulate Reply**
  - [ ] Reply to one email
  - [ ] Run check-replies
  - [ ] Verify lead marked replied

- [ ] **Step 7: Wait for Follow-up**
  - [ ] Fast-forward time (or wait 2 days)
  - [ ] Trigger sending
  - [ ] Verify Step 2 sent to 4 leads (not replied one)

- [ ] **Step 8: Complete Sequence**
  - [ ] Continue through Step 3
  - [ ] Verify all completed
  - [ ] Check final statuses

- [ ] **Step 9: Review Results**
  - [ ] Check campaign analytics
  - [ ] Verify all counters correct
  - [ ] Review email history

---

## ✅ H. Acceptance Criteria

### Campaigns Must:
- [ ] Create/edit/delete successfully
- [ ] Have email sequences configured
- [ ] Have leads assigned
- [ ] Send emails on schedule
- [ ] Track all metrics accurately
- [ ] Handle replies correctly
- [ ] Respect daily limits
- [ ] Stop on completion

### UI Must:
- [ ] Display all campaign data
- [ ] Show accurate stats
- [ ] Allow easy sequence editing
- [ ] Support bulk lead management
- [ ] Provide clear status indicators

---

## 🚨 Known Issues to Fix

1. **All campaigns have 0 sequences** → Add email templates
2. **All campaigns have 0 leads** → Assign prospects
3. **Campaign sequences table may be empty** → Verify schema exists
4. **No campaign activity in database** → Fix sending logic

---

## 📝 Test Results Template

```markdown
### Campaign Test Results
- **Campaign Name**: [name]
- **Sequences Added**: [count]
- **Leads Assigned**: [count]
- **Emails Sent**: [count]
- **Replies**: [count]
- **Reply Rate**: [%]

**Issues Found**:
- [ ] [description]

**Status**: 🟢 Working / 🟡 Issues / 🔴 Broken
```

---

**Next**: After completing this, move to `todo4.md` (Mailbox Configuration)
