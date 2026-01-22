# TODO 4: Mailbox Configuration - Complete Audit

**Priority: HIGH** 🟡
**Estimated Time: 1-2 hours**

---

## 📮 A. Mailbox System Overview

### 1. Database Schema Validation
- [ ] **Mailboxes Table** (Supabase)
  - [ ] Verify all columns exist:
    - [ ] `id`, `email`, `display_name`
    - [ ] `smtp_host`, `smtp_port`, `smtp_user`, `smtp_pass`
    - [ ] `imap_host`, `imap_port`, `imap_user`, `imap_pass`
    - [ ] `status` (active, warming, paused, error)
    - [ ] `daily_limit`, `sent_today`, `total_sent`
    - [ ] `health_score` (0-100)
    - [ ] `warmup_enabled`, `warmup_stage` (1-5), `warmup_target_per_day`
    - [ ] `smtp_verified`, `imap_verified`
    - [ ] `last_error`, `last_send_at`
    - [ ] `created_at`, `updated_at`
  - [ ] Check encryption for password fields
  - [ ] Verify indexes on `email` and `status`

- [ ] **Mailbox Daily Stats Table**
  - [ ] Verify columns:
    - [ ] `id`, `mailbox_id`, `date`
    - [ ] `sent`, `bounced`, `replied`, `opened`
    - [ ] Unique constraint on (mailbox_id, date)

---

## 📧 B. Mailbox Configuration

### 1. Current Mailboxes Audit
- [ ] **Review Existing Mailboxes**
  ```sql
  SELECT email, status, daily_limit, sent_today, total_sent, health_score
  FROM mailboxes
  ORDER BY created_at;
  ```

- [ ] **Verify 3 Mailboxes**:
  1. [ ] `edd@jengu.me`
     - [ ] Status: active
     - [ ] Daily limit: 20
     - [ ] SMTP verified: yes
     - [ ] IMAP verified: yes

  2. [ ] `edd@jengu.shop`
     - [ ] Status: active
     - [ ] Daily limit: 20
     - [ ] Total sent: 4

  3. [ ] `edd@jengu.space`
     - [ ] Status: active
     - [ ] Daily limit: 20
     - [ ] Total sent: 5

### 2. SMTP Configuration Test
- [ ] **Test Each Mailbox**
  - [ ] Navigate to `/outreach/mailboxes`
  - [ ] Click test connection for each
  - [ ] Or use API:
    ```bash
    curl -X POST https://crm.jengu.ai/api/outreach/mailboxes/[id]/test \
      -H "Content-Type: application/json" \
      -d '{"type": "smtp"}'
    ```

- [ ] **Verify Connection Details**
  - [ ] Host: `mail.spacemail.com`
  - [ ] Port: 465 (SSL/TLS)
  - [ ] Authentication: Username/Password
  - [ ] Test actual send

- [ ] **Check Common Issues**
  - [ ] Invalid credentials
  - [ ] Blocked IP
  - [ ] Rate limiting
  - [ ] SSL/TLS errors

### 3. IMAP Configuration Test
- [ ] **Test IMAP for Reply Checking**
  - [ ] Same endpoint with `{"type": "imap"}`
  - [ ] Verify connection works
  - [ ] Test folder access (INBOX)
  - [ ] Check can read messages

---

## 🔥 C. Email Warmup System

### 1. Warmup Schedule Review
- [ ] **5-Week Warmup Plan**
  | Week | Daily Limit | Total by End |
  |------|-------------|--------------|
  | 1    | 5           | 35           |
  | 2    | 10          | 105          |
  | 3    | 15          | 210          |
  | 4    | 20          | 350          |
  | 5+   | 25          | Graduated    |

- [ ] **Check Current Warmup Stage**
  ```sql
  SELECT email, warmup_stage, warmup_enabled,
         DATE_PART('day', NOW() - created_at) as days_active
  FROM mailboxes;
  ```

- [ ] **Verify Auto-Progression**
  - [ ] Warmup stage increments every 7 days
  - [ ] Daily limit increases accordingly
  - [ ] Test progression logic

### 2. Warmup Safety Features
- [ ] **Random Delays**
  - [ ] Review code: 30-90 seconds between emails
  - [ ] Verify implementation
  - [ ] Test randomization

- [ ] **Skip Rate**
  - [ ] 30% random skip to look human
  - [ ] Check implementation
  - [ ] Verify doesn't skip all emails

- [ ] **Business Hours**
  - [ ] Only send 9am-5pm recipient timezone
  - [ ] Test timezone calculation
  - [ ] Verify enforcement

### 3. Health Monitoring
- [ ] **Health Score Calculation**
  - [ ] Review algorithm
  - [ ] Factors:
    - [ ] Bounce rate (↓ score)
    - [ ] Reply rate (↑ score)
    - [ ] Open rate (↑ score)
    - [ ] Spam reports (↓↓ score)

- [ ] **Auto-Pause on Low Health**
  - [ ] If health < 50%, pause mailbox
  - [ ] Verify trigger works
  - [ ] Test notification sent

- [ ] **Recovery Protocol**
  - [ ] How to restore health score
  - [ ] Warmup restart if needed

---

## 🎛️ D. Mailbox Management UI

### 1. Mailboxes List Page
- [ ] **Navigate to** `/outreach/mailboxes`
  - [ ] Verify all mailboxes display
  - [ ] Check summary cards:
    - [ ] Total mailboxes
    - [ ] Active count
    - [ ] Warming count
    - [ ] Total capacity
    - [ ] Remaining capacity
  - [ ] Test refresh button
  - [ ] Test "Add Mailbox" button

### 2. Mailbox Card Display
- [ ] **Each Mailbox Card Shows**:
  - [ ] Email address
  - [ ] Display name
  - [ ] Status badge (color-coded)
  - [ ] Health score (with color indicator)
  - [ ] Sent today / Daily limit
  - [ ] Total sent (lifetime)
  - [ ] Warmup progress bar (if warming)
  - [ ] SMTP/IMAP verified indicators
  - [ ] Last error (if any)
  - [ ] Action menu (3 dots)

- [ ] **Test Actions**:
  - [ ] View Details
  - [ ] Test Connection
  - [ ] Pause/Resume
  - [ ] Edit (if implemented)
  - [ ] Delete

### 3. Add New Mailbox
- [ ] **Click "Add Mailbox"**
  - [ ] Form displays with sections:
    - [ ] Account Info (email, display name)
    - [ ] SMTP Settings (host, port, user, pass)
    - [ ] IMAP Settings (optional but recommended)
    - [ ] Warmup Settings (enable, target)

- [ ] **Test Validation**
  - [ ] Email format check
  - [ ] Required field validation
  - [ ] Port number validation

- [ ] **Submit and Verify**
  - [ ] Mailbox created in database
  - [ ] Auto-test connection runs
  - [ ] Status set correctly
  - [ ] Warmup enabled if checked

### 4. Mailbox Detail Page
- [ ] **Navigate to** `/outreach/mailboxes/[id]`
  - [ ] View detailed stats
  - [ ] See daily sending history (chart)
  - [ ] View recent emails sent
  - [ ] Check error logs
  - [ ] Edit configuration
  - [ ] Test connection manually

---

## 🔄 E. Mailbox Rotation & Load Balancing

### 1. Rotation Logic
- [ ] **Review Algorithm** (`src/lib/email/send.ts`)
  - [ ] Round-robin selection
  - [ ] Skip if at daily limit
  - [ ] Skip if in error state
  - [ ] Prefer lower sent_today count

- [ ] **Test Rotation**
  - [ ] Send 10 emails
  - [ ] Verify distributed across mailboxes
  - [ ] Check not all from same inbox

### 2. Capacity Management
- [ ] **Daily Limit Enforcement**
  - [ ] Set mailbox to limit 5
  - [ ] Send 5 emails
  - [ ] Verify 6th fails/uses different mailbox
  - [ ] Check `sent_today` increments

- [ ] **Daily Reset**
  - [ ] Verify cron job resets `sent_today` at midnight
  - [ ] Or check Cloudflare Durable Object handles this
  - [ ] Test reset logic

### 3. Failover Handling
- [ ] **SMTP Failure**
  - [ ] Simulate SMTP error
  - [ ] Verify tries next mailbox
  - [ ] Check error logged
  - [ ] Verify mailbox marked with error

- [ ] **All Mailboxes Down**
  - [ ] Pause all mailboxes
  - [ ] Try to send email
  - [ ] Verify graceful error
  - [ ] Check notification sent

---

## 🌐 F. Cloudflare Integration

### 1. Durable Objects (Warmup Counter)
- [ ] **Review** `cloudflare/src/durable-objects/warmup-counter.ts`
  - [ ] Check daily limit logic
  - [ ] Verify reset at midnight
  - [ ] Test increment logic

- [ ] **Test Durable Object**
  - [ ] Send email via Cloudflare worker
  - [ ] Check counter increments
  - [ ] Verify limit enforced

### 2. Inbox State Tracking
- [ ] **Review** `cloudflare/src/durable-objects/inbox-state.ts`
  - [ ] Check health tracking
  - [ ] Verify bounce detection
  - [ ] Test auto-pause trigger

### 3. Supabase Sync
- [ ] **Verify Cloudflare ↔ Supabase Sync**
  - [ ] Cloudflare reads mailboxes from Supabase
  - [ ] Sends update `sent_today` to Supabase
  - [ ] Bounces update `health_score` in Supabase
  - [ ] Test bidirectional sync

---

## 📊 G. Mailbox Analytics

### 1. Sending Stats
- [ ] **Per Mailbox**:
  - [ ] Total sent (lifetime)
  - [ ] Sent today
  - [ ] Sent this week
  - [ ] Sent this month

- [ ] **Verify Accuracy**
  - [ ] Cross-check with `emails` table
  - [ ] Compare with `mailbox_daily_stats`

### 2. Performance Metrics
- [ ] **Health Indicators**:
  - [ ] Bounce rate by mailbox
  - [ ] Reply rate by mailbox
  - [ ] Open rate by mailbox

- [ ] **Compare Performance**
  - [ ] Which mailbox performs best?
  - [ ] Which needs improvement?

### 3. Capacity Planning
- [ ] **Current vs Potential**
  - [ ] Total daily capacity: [sum of limits]
  - [ ] Average utilization: [%]
  - [ ] Recommendation: Add more mailboxes?

---

## 🧪 H. End-to-End Mailbox Test

### Complete Flow Test
- [ ] **Step 1: Add Test Mailbox**
  - [ ] Use a real inbox you control
  - [ ] Configure SMTP/IMAP
  - [ ] Enable warmup

- [ ] **Step 2: Test Connection**
  - [ ] Run SMTP test
  - [ ] Run IMAP test
  - [ ] Verify both pass

- [ ] **Step 3: Send Test Email**
  - [ ] Use `/api/test-email`
  - [ ] Specify this mailbox
  - [ ] Verify email sends
  - [ ] Check arrives in real inbox

- [ ] **Step 4: Check Tracking**
  - [ ] Open email (tracking pixel)
  - [ ] Click link (click tracking)
  - [ ] Reply to email
  - [ ] Verify all tracked

- [ ] **Step 5: Monitor Stats**
  - [ ] Check `sent_today` incremented
  - [ ] Verify `total_sent` increased
  - [ ] Check `last_send_at` updated

- [ ] **Step 6: Test Daily Limit**
  - [ ] Set limit to 2
  - [ ] Send 3 emails
  - [ ] Verify 3rd uses different mailbox or fails

- [ ] **Step 7: Test Health Degradation**
  - [ ] Send to invalid email (bounce)
  - [ ] Check health score decreases
  - [ ] Verify mailbox pauses if too low

---

## ✅ I. Acceptance Criteria

### Mailboxes Must:
- [ ] Connect successfully (SMTP + IMAP)
- [ ] Send emails reliably
- [ ] Track sending stats accurately
- [ ] Respect daily limits
- [ ] Rotate properly across inboxes
- [ ] Auto-pause on errors/low health
- [ ] Progress through warmup stages
- [ ] Sync with Cloudflare (if using workers)

### UI Must:
- [ ] Display all mailbox data
- [ ] Show real-time stats
- [ ] Allow easy configuration
- [ ] Test connections
- [ ] Provide health indicators

---

## 🚨 Known Issues to Fix

1. **Only 9 total emails sent** → Need to activate sending
2. **All mailboxes at 0 sent_today** → No recent activity
3. **Health score 100% but inactive** → Unused capacity
4. **Missing ANTHROPIC_API_KEY** → May affect some features

---

## 📝 Test Results Template

```markdown
### Mailbox Test Results
**Mailbox**: [email]
- [ ] ✅ SMTP Connection
- [ ] ✅ IMAP Connection
- [ ] ✅ Test Email Sent
- [ ] ✅ Email Received
- [ ] ✅ Tracking Works
- [ ] ✅ Daily Limit Enforced
- [ ] ❌ Issue: [description]

**Health Score**: [0-100]
**Status**: 🟢 Healthy / 🟡 Warning / 🔴 Error
```

---

**Next**: After completing this, move to `todo5.md` (UI/UX - All Pages & Buttons)
