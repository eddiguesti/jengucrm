# TODO 9: Analytics & Reporting - Complete Audit

**Priority: MEDIUM** 🟡
**Estimated Time: 1-2 hours**

---

## 📊 A. Dashboard Analytics

### 1. Main Dashboard (`/`)
- [ ] **Summary Cards**
  - [ ] Total Prospects
    - [ ] Number accurate
    - [ ] Trend indicator (if exists)
    - [ ] Clickable to prospects page
  - [ ] Emails Sent
    - [ ] Count from `emails` table
    - [ ] Today/This Week/This Month breakdown
  - [ ] Reply Rate
    - [ ] Calculation: replies / sent * 100
    - [ ] Verify math correct
  - [ ] Meetings Booked
    - [ ] Count from activities or notifications
    - [ ] Verify accurate

- [ ] **Charts/Graphs**
  - [ ] Email Volume Chart
    - [ ] X-axis: Time (days/weeks)
    - [ ] Y-axis: Email count
    - [ ] Data pulls from database
    - [ ] Chart renders correctly
    - [ ] Hover tooltips work
  - [ ] Conversion Funnel
    - [ ] Stages: Contacted → Engaged → Meeting → Won
    - [ ] Counts accurate
    - [ ] Percentages calculated correctly
  - [ ] Reply Rate Trend
    - [ ] Over time
    - [ ] Moving average (if applicable)

- [ ] **Recent Activity Feed**
  - [ ] Lists recent activities
  - [ ] Sorted by date (newest first)
  - [ ] Filters by type (if available)
  - [ ] Click to view details
  - [ ] Pagination/Load More works

---

## 📧 B. Email Analytics

### 1. Email Stats Page (`/emails` or separate analytics)
- [ ] **Overall Metrics**
  - [ ] Total Sent
  - [ ] Total Received (Replies)
  - [ ] Open Rate
    - [ ] Formula: opened / sent * 100
    - [ ] Verify accurate
  - [ ] Click Rate
    - [ ] Formula: clicked / sent * 100
  - [ ] Bounce Rate
    - [ ] Formula: bounced / sent * 100

- [ ] **Time Series Data**
  - [ ] Emails sent per day/week/month
  - [ ] Reply rate over time
  - [ ] Open rate trend

- [ ] **Breakdown by**:
  - [ ] Campaign
  - [ ] Mailbox (agent)
  - [ ] Prospect tier
  - [ ] Prospect stage

### 2. Email Performance
- [ ] **Best Performing Campaigns**
  - [ ] Highest reply rate
  - [ ] Most meetings booked
  - [ ] Best open rate

- [ ] **Best Performing Mailboxes**
  - [ ] Most emails sent
  - [ ] Highest reply rate
  - [ ] Best deliverability

- [ ] **Best Performing Email Templates**
  - [ ] Subject line analysis
  - [ ] Body content analysis
  - [ ] Personalization impact

---

## 👥 C. Prospect Analytics

### 1. Prospect Stats
- [ ] **Total Count**
  - [ ] All prospects
  - [ ] New (last 7/30 days)
  - [ ] Growth rate

- [ ] **By Stage Distribution**
  - [ ] New: [count] ([%])
  - [ ] Enriched: [count] ([%])
  - [ ] Contacted: [count] ([%])
  - [ ] Engaged: [count] ([%])
  - [ ] Meeting: [count] ([%])
  - [ ] Won: [count] ([%])
  - [ ] Lost: [count] ([%])

- [ ] **By Tier Distribution**
  - [ ] Hot: [count] ([%])
  - [ ] Warm: [count] ([%])
  - [ ] Cold: [count] ([%])

- [ ] **By Location**
  - [ ] Top 10 locations
  - [ ] Map visualization (if exists)

### 2. Enrichment Analytics
- [ ] **Enrichment Success Rates**
  - [ ] Websites Found: [count]/[attempted] ([%])
  - [ ] Emails Found: [count]/[attempted] ([%])
  - [ ] Overall Enrichment Rate: [%]

- [ ] **Enrichment Performance**
  - [ ] Average time per prospect
  - [ ] Success rate over time
  - [ ] By source (Sales Nav, scraping, manual)

- [ ] **Queue Status**
  - [ ] Prospects waiting for enrichment
  - [ ] Current processing
  - [ ] Recently completed

---

## 📬 D. Campaign Analytics

### 1. Campaign Performance (`/outreach/campaigns/[id]` or `/outreach/analytics`)
- [ ] **Per Campaign Metrics**
  - [ ] Total Leads
  - [ ] Emails Sent (by step)
  - [ ] Open Rate (by step)
  - [ ] Reply Rate (by step)
  - [ ] Meeting Rate
  - [ ] Conversion Rate

- [ ] **Funnel Visualization**
  - [ ] Step 1 sent → opened → replied
  - [ ] Step 2 sent → opened → replied
  - [ ] Step 3 sent → opened → replied
  - [ ] Drop-off at each stage

- [ ] **A/B Test Results** (if enabled)
  - [ ] Variant A performance
  - [ ] Variant B performance
  - [ ] Statistical significance
  - [ ] Winner declaration

### 2. Campaign Comparison
- [ ] **Compare Campaigns**
  - [ ] Side-by-side stats
  - [ ] Which performs better
  - [ ] Why (subject lines, timing, etc.)

- [ ] **Best Practices Identified**
  - [ ] Best send times
  - [ ] Best send days
  - [ ] Optimal sequence length
  - [ ] Ideal delay between emails

---

## 📮 E. Mailbox Analytics

### 1. Agents Page (`/agents`)
- [ ] **Per Mailbox Stats**
  - [ ] Email address
  - [ ] Sent today
  - [ ] Sent this week/month
  - [ ] Total sent (lifetime)
  - [ ] Reply rate
  - [ ] Open rate
  - [ ] Health score

- [ ] **Pipeline Funnel**
  - [ ] Contacted
  - [ ] Engaged
  - [ ] Meeting
  - [ ] Proposal
  - [ ] Closed
  - [ ] Visual bar chart

- [ ] **Clickable Stats**
  - [ ] Click "Sent Today" → filter emails
  - [ ] Click "Replies" → filter replies
  - [ ] Navigate to details

### 2. Mailbox Health
- [ ] **Health Indicators**
  - [ ] Health score (0-100)
  - [ ] Color coding (green/yellow/red)
  - [ ] Bounce rate
  - [ ] Spam reports (if tracked)
  - [ ] Blacklist status (if checked)

- [ ] **Warmup Progress**
  - [ ] Current stage (1-5)
  - [ ] Days in current stage
  - [ ] Progress bar
  - [ ] Next stage requirements

---

## 📈 F. Growth Metrics

### 1. Trends Over Time
- [ ] **Prospect Growth**
  - [ ] Chart: prospects added per day
  - [ ] Projection: future growth

- [ ] **Email Volume Growth**
  - [ ] Chart: emails sent per week
  - [ ] Capacity utilization
  - [ ] Scaling needs

- [ ] **Reply Rate Trend**
  - [ ] Chart: reply rate over time
  - [ ] Improving or declining?

### 2. Conversion Funnel
- [ ] **Full Funnel**
  - [ ] Prospects → Enriched → Contacted → Engaged → Meeting → Won
  - [ ] Count at each stage
  - [ ] Conversion rate between stages
  - [ ] Where prospects drop off most

- [ ] **Time in Stage**
  - [ ] Average days in each stage
  - [ ] Identify bottlenecks

---

## 🎯 G. Goal Tracking

### 1. Monthly Goals (if set)
- [ ] **Email Sending Goal**
  - [ ] Target: [X] emails/month
  - [ ] Current: [Y]
  - [ ] Progress: [Y/X%]

- [ ] **Reply Goal**
  - [ ] Target: [X] replies/month
  - [ ] Current: [Y]
  - [ ] Progress: [Y/X%]

- [ ] **Meeting Goal**
  - [ ] Target: [X] meetings/month
  - [ ] Current: [Y]
  - [ ] Progress: [Y/X%]

### 2. Target Metrics
- [ ] **Reply Rate Target**
  - [ ] Goal: > 5%
  - [ ] Current: [X%]
  - [ ] On track?

- [ ] **Enrichment Target**
  - [ ] Goal: > 50% of prospects enriched
  - [ ] Current: [X%]
  - [ ] On track?

---

## 🔔 H. Notifications & Alerts

### 1. Notification System
- [ ] **Navigate to** `/notifications`
  - [ ] List all notifications
  - [ ] Mark as read
  - [ ] Filter by type

- [ ] **Notification Types**:
  - [ ] Meeting requests
  - [ ] Positive replies
  - [ ] Bounces
  - [ ] System errors
  - [ ] Mailbox health issues
  - [ ] Daily summary

- [ ] **Notification Delivery**
  - [ ] In-app notifications work
  - [ ] Email notifications (if configured)
  - [ ] Webhook to Slack/Discord (if configured)

---

## 📊 I. Reports & Exports

### 1. Standard Reports
- [ ] **Daily Email Report**
  - [ ] Emails sent yesterday
  - [ ] Replies received
  - [ ] Meetings booked
  - [ ] Issues encountered

- [ ] **Weekly Performance Report**
  - [ ] Total activity
  - [ ] Key metrics
  - [ ] Top performers
  - [ ] Recommendations

- [ ] **Monthly Summary**
  - [ ] Overall progress
  - [ ] Goal achievement
  - [ ] Trends
  - [ ] Next month planning

### 2. Custom Reports
- [ ] **Date Range Selection**
  - [ ] Pick start/end date
  - [ ] Generate report
  - [ ] View or download

- [ ] **Metric Selection**
  - [ ] Choose which metrics to include
  - [ ] Customize report layout

### 3. Export Functionality
- [ ] **Export Formats**
  - [ ] CSV
  - [ ] PDF (if available)
  - [ ] Excel (if available)

- [ ] **Exportable Data**:
  - [ ] Prospect list
  - [ ] Email history
  - [ ] Campaign stats
  - [ ] Analytics data

---

## 🧮 J. Data Accuracy Validation

### 1. Verify Key Metrics
- [ ] **Total Emails Sent**
  ```sql
  SELECT COUNT(*) FROM emails WHERE direction = 'outbound';
  ```
  - [ ] Compare with dashboard
  - [ ] Should match exactly

- [ ] **Total Replies**
  ```sql
  SELECT COUNT(*) FROM emails WHERE direction = 'inbound';
  ```
  - [ ] Compare with dashboard

- [ ] **Reply Rate**
  - [ ] Calculate manually
  - [ ] Compare with displayed rate
  - [ ] Check rounding

- [ ] **Open Rate**
  ```sql
  SELECT
    COUNT(*) FILTER (WHERE opened = true) * 100.0 / COUNT(*) as open_rate
  FROM emails
  WHERE direction = 'outbound';
  ```
  - [ ] Compare with dashboard

### 2. Cross-Reference Data
- [ ] **Campaign Stats**
  - [ ] Manual count emails by campaign
  - [ ] Compare with campaign page
  - [ ] Check discrepancies

- [ ] **Mailbox Stats**
  - [ ] Sum `sent_today` from mailboxes table
  - [ ] Compare with agents page
  - [ ] Verify matches

### 3. Data Freshness
- [ ] **Last Updated**
  - [ ] Check when data last refreshed
  - [ ] Real-time vs cached?
  - [ ] Refresh mechanism works?

---

## ✅ K. Acceptance Criteria

### Analytics Must:
- [ ] Display accurate data (±1% error max)
- [ ] Update in real-time or near real-time (<5 min)
- [ ] Load quickly (<2s)
- [ ] Charts render correctly
- [ ] Export functionality works
- [ ] Filters work correctly
- [ ] Date range selection works
- [ ] Notifications delivered

### Reports Must:
- [ ] Be easy to understand
- [ ] Actionable insights
- [ ] Automated delivery (if configured)
- [ ] Exportable formats

---

## 🚨 Known Issues to Fix

1. **Some charts may not have data** → Need historical data
2. **Open tracking not working** → Fix tracking pixels
3. **Notifications not sent** → Setup notification system
4. **Export features missing** → Implement CSV export

---

## 📝 Test Results Template

```markdown
### Analytics Test Results
**Date**: [date]

#### Data Accuracy
- [ ] ✅ Metrics match database queries
- [ ] ✅ Charts display correctly
- [ ] ✅ Calculations accurate
- [ ] ❌ Discrepancy: [description]

#### Performance
- [ ] Dashboard load time: [seconds]
- [ ] Chart render time: [seconds]
- [ ] Export generation: [seconds]

#### Functionality
- [ ] ✅ Filters work
- [ ] ✅ Date range selection works
- [ ] ✅ Export works
- [ ] ✅ Notifications sent

**Status**: 🟢 Accurate / 🟡 Minor Issues / 🔴 Inaccurate
```

---

**Next**: After completing this, move to `todo10.md` (End-to-End User Flows)
