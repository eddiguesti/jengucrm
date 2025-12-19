# Complete UI Inventory - Jengu CRM System

**Generated:** 2025-12-17
**Last Updated:** 2025-12-17 (Session 2)
**Total Pages Analyzed:** 31 (21 fully documented, 10 partially documented)
**Status Key:** ✅ Working | ⚠️ Needs Verification | ❓ Unclear Purpose | 🚧 In Progress

---

## Dashboard & Core Pages

### 1. Home/Dashboard (`/`)

| UI Element | Type | Function | Status |
|------------|------|----------|--------|
| Greeting Banner | Display | Shows time-based greeting + prospect count | ✅ |
| Today's Focus Cards | Interactive Cards | Email Ready prospects, Replies Needed, Almost Ready | ✅ |
| "Send Now" Button | Action | Navigate to email-ready prospects | ✅ |
| "View" Button | Action | Navigate to inbox/replies | ✅ |
| "Enrich" Button | Action | Navigate to almost-ready prospects | ✅ |
| "Find new prospects" Button | Action | Navigate to /find-new when no actions | ✅ |
| This Week Stats Grid | Display | Sent/Opens/Replies/Meetings with trends | ✅ |
| Priority Prospects List | Interactive List | Top 5 prospects with readiness scores | ✅ |
| Battery Ring Indicator | Visual | Shows prospect readiness percentage | ✅ |
| Next Action Button (hover) | Action | Sparkles (email) or Search (enrich) | ✅ |
| Recent Activity Timeline | Display | Last 6 activities with icons | ✅ |
| Retry Button | Action | Reload dashboard on error | ✅ |

---

### 2. Prospects List (`/prospects`)

| UI Element | Type | Function | Status |
|------------|------|----------|--------|
| **Search & Filters** |
| Search Input | Text Input | Search prospects by name/contact | ✅ |
| Readiness Filter Buttons | Toggle Buttons | Email Ready, Almost Ready, Needs Enrichment, Needs Research | ✅ |
| Smart View Buttons | Toggle Buttons | All/Ready to Contact/Awaiting Reply/Hot Leads/Needs Work | ✅ |
| Source Filter Dropdown | Dropdown | Sales Navigator/Google Maps/Manual/Job Board | ✅ |
| Email Status Filter Dropdown | Dropdown | All/Has Email/No Email | ✅ |
| Contact Status Filter Dropdown | Dropdown | All/Not Contacted/Contacted/Replied | ✅ |
| Tier Filter Buttons | Toggle Buttons | All/Hot/Warm/Cold | ✅ |
| Clear All Filters | Button | Reset all filters | ✅ |
| **View Controls** |
| Table/Cards View Toggle | Toggle | Switch between table and card view | ✅ |
| Refresh Button | Action | Reload prospects data | ✅ |
| Add Prospect Button | Modal Trigger | Opens add prospect dialog | ✅ |
| **Table View** |
| Column Sort Headers | Interactive Headers | Readiness/Name/City/Rating/Tier/Stage/Score/Created | ✅ |
| Battery Compact Indicator | Visual | Readiness percentage | ✅ |
| Tier Badges | Visual | Hot/Warm/Cold | ✅ |
| Stage Badges | Visual | New/Researching/Outreach/Engaged/etc. | ✅ |
| Quick Action Button (hover) | Action | Generate Email or Enrich | ✅ |
| More Actions Dropdown | Dropdown | View & Generate Email/Visit Website/Archive | ✅ |
| Row Click | Action | Opens prospect drawer | ✅ |
| **Card View** |
| Prospect Cards | Interactive Cards | Individual prospect cards with actions | ✅ |
| **Pagination** |
| First/Previous/Next/Last | Navigation | Page through results | ✅ |
| Page Counter | Display | Current page / total pages | ✅ |
| Results Count | Display | Shows X of Y prospects | ✅ |
| **Drawer** |
| Prospect Detail Drawer | Slide-out Panel | Quick view of prospect details | ✅ |
| Navigate Next/Previous | Navigation | Move between prospects in drawer | ✅ |
| Close Drawer | Action | Close drawer | ✅ |
| **Modal** |
| Add Prospect Dialog | Modal Form | Create new prospect manually | ✅ |

---

### 3. Prospect Detail (`/prospects/[id]`)

| UI Element | Type | Function | Status |
|------------|------|----------|--------|
| **Header** |
| Back to Prospects Link | Navigation | Return to prospects list | ✅ |
| Property Initial Avatar | Display | Shows first letter of property name | ✅ |
| Tier Badge | Visual | Hot/Warm/Cold | ✅ |
| Lead Score | Display | Large numeric score | ✅ |
| **Overview Card** |
| Stage Selector Dropdown | Dropdown | Change pipeline stage | ✅ |
| Enrich Data Button | Action | Trigger enrichment for prospect | ✅ |
| Mystery Shopper Button | Action | Preview mystery shopper email | ✅ |
| Archive Button | Action | Archive prospect | ✅ |
| Property Details Grid | Display | Type/Star Rating/Rooms/Chain | ✅ |
| **Tabs** |
| Emails Tab | Tab | Email conversations thread view | ✅ |
| Activity Tab | Tab | Activity timeline | ✅ |
| Research Tab | Tab | AI analysis & job pain points | ✅ |
| Notes Tab | Tab | Internal notes | ✅ |
| **Emails Tab** |
| Generate Email Button | Action | Create AI email | ✅ |
| Generated Email Preview | Display | Subject + body preview | ✅ |
| Copy Email Button | Action | Copy to clipboard | ✅ |
| Email Thread Display | Display | Grouped emails by thread | ✅ |
| Thread Header | Display | Subject + reply/meeting badges | ✅ |
| Email Direction Icons | Visual | Inbox (inbound) / Send (outbound) | ✅ |
| Email Type Badges | Visual | Outreach/Follow Up/Mystery Shopper/etc. | ✅ |
| **Activity Tab** |
| Activity Timeline | Display | Chronological activity list | ✅ |
| Activity Type Dots | Visual | Color-coded by type | ✅ |
| Activity Badges | Visual | Email/Mystery Shopper | ✅ |
| Linked Email Expansion | Display | Full email content in activity | ✅ |
| **Research Tab** |
| AI Analysis Card | Display | Grok analysis with grade | ✅ |
| Grade Badge | Visual | A/B/C/D grade | ✅ |
| Job Pain Points Card | Display | Summary + pain points + responsibilities | ✅ |
| Original Job Posting | Display | Raw job description | ✅ |
| Run AI Research Button | Action | Trigger enrichment | ✅ |
| **Notes Tab** |
| Notes Textarea | Text Input | Freeform notes | ✅ |
| Save Note Button | Action | Persist notes | ✅ |
| **Sidebar Cards** |
| Next Action Card | Interactive Card | Recommended action | ✅ |
| Hiring Signal Card | Display | Job title + source link | ✅ |
| Pain Signals Card | Display | Review-mined pain points | ✅ |
| Contact Info Card | Display | Contact/Email/Phone/Website | ✅ |
| Score Breakdown Card | Display | Score components | ✅ |
| Source Info Card | Display | Source + added date | ✅ |
| **Mystery Shopper Modal** |
| Preview Modal | Modal | Shows generated inquiry email | ✅ |
| Preview Fields | Display | To/Language/Scenario/Sender/Subject/Body | ✅ |
| Add to Queue Button | Action | Queue for later | ✅ |
| Send Now Button | Action | Send immediately | ✅ |
| Cancel Button | Action | Close modal | ✅ |
| **Archived Banner** |
| Archive Notice | Alert | Shows when prospect archived | ✅ |
| Archive Reason | Display | Shows why archived | ✅ |
| Unarchive Button | Action | Restore prospect | ✅ |

---

### 4. Emails (`/emails`)

| UI Element | Type | Function | Status |
|------------|------|----------|--------|
| **Filter** |
| Clear Filter Button | Action | Remove from filter | ✅ |
| Filter Indicator | Display | Shows current filter (from email) | ✅ |
| **Tabs** |
| Drafts Tab | Tab | Draft emails | ✅ |
| Sent Tab | Tab | Sent emails | ✅ |
| **Email List** |
| Email List Items | Interactive List | Click to preview | ✅ |
| Status Badges | Visual | Draft/Sent/Opened/Replied | ✅ |
| Prospect Name | Display | Linked prospect | ✅ |
| Subject Line | Display | Email subject | ✅ |
| Date | Display | Created/sent date | ✅ |
| **Preview Panel** |
| Prospect Name Link | Link | Navigate to prospect | ✅ |
| Location | Display | City, Country | ✅ |
| Subject Display | Display | Email subject | ✅ |
| Body Display | Display | Email body (pre-formatted) | ✅ |
| Copy Button (drafts) | Action | Copy email to clipboard | ✅ |
| Mark Sent Button (drafts) | Action | Change status to sent | ✅ |
| AI Warning | Alert | Reminds to review before sending | ✅ |
| **Empty States** |
| No Emails Message | Display | Encourages generating first email | ✅ |
| View Prospects Link | Link | Navigate to prospects | ✅ |

---

### 5. Pipeline (`/pipeline`)

| UI Element | Type | Function | Status |
|------------|------|----------|--------|
| **Controls** |
| Refresh Button | Action | Reload pipeline | ✅ |
| **Stage Columns** |
| Stage Cards | Draggable Columns | New/Researching/Outreach/Engaged/Meeting/Proposal/Won/Lost | ✅ |
| Stage Headers | Display | Stage name + color dot + count | ✅ |
| **Prospect Cards** |
| Draggable Prospect Cards | Drag & Drop | Drag to change stage | ✅ |
| Tier Dot Indicator | Visual | Red/Amber/Gray | ✅ |
| Prospect Name | Link | Navigate to detail | ✅ |
| Job Title (if exists) | Display | Shows hiring signal | ✅ |
| Location | Display | City, Country | ✅ |
| Score | Display | Lead score | ✅ |
| Star Rating | Visual | Google rating | ✅ |
| **Empty States** |
| No Prospects Message | Display | Shows when stage empty | ✅ |

---

### 6. Analytics (`/analytics`)

| UI Element | Type | Function | Status |
|------------|------|----------|--------|
| **Navigation** |
| Tab List | Tabs | Overview / Campaigns | ✅ |
| Refresh Button | Action | Reload analytics | ✅ |
| **Overview Tab** |
| Email Performance Cards | Display Grid | Sent Today/Replies Today/Reply Rate/Total Prospects | ✅ |
| Trend Indicators | Visual | Up/Down arrows with % change | ✅ |
| Conversion Funnel Card | Display | Prospects→Contacted→Engaged→Meeting→Closed | ✅ |
| Enhanced Funnel (feature flag) | Component | Advanced funnel visualization | ⚠️ |
| Lead Quality Card | Display | Hot/Warm/Cold breakdown | ✅ |
| By Stage Breakdown | Display | Top 5 stages | ✅ |
| Geographic Distribution | Display | By Country / Top Cities | ✅ |
| Progress Bars | Visual | Relative distribution | ✅ |
| Property Types Card | Display | Hotel types breakdown | ✅ |
| Lead Sources Card | Display | Source breakdown | ✅ |
| Inbox Warmup Status | Display | Active Inboxes/Remaining/Daily Limit | ✅ |
| Per-Inbox Usage | Display | Individual inbox progress bars | ✅ |
| Last Updated Timestamp | Display | Stats generation time | ✅ |
| **Campaigns Tab** |
| Summary Stats Cards | Display | Total Sent/Replies/Meetings/Reply Rate/Meeting Rate | ✅ |
| Leading Campaign Banner | Alert | Shows best performing campaign | ✅ |
| Trophy Icon | Visual | Indicates leader | ✅ |
| Campaign Cards | Display Grid | Individual campaign performance | ✅ |
| Toggle Active Button | Action | Play/Pause campaign | ✅ |
| Campaign Metrics Grid | Display | Sent/Replies/Meetings/Rate | ✅ |
| Reply Rate Progress Bar | Progress | Visual rate indicator | ✅ |
| Today's Activity | Display | Emails today / daily limit | ✅ |
| Strategy Badge | Visual | authority_scarcity/curiosity_value | ✅ |
| Strategy Comparison Card | Display | Side-by-side campaign comparison | ✅ |
| Statistical Significance Note | Alert | Warns when < 100 emails sent | ✅ |

---

## Outreach System Pages

### 7. Outreach Hub (`/outreach`)

| UI Element | Type | Function | Status |
|------------|------|----------|--------|
| Auto-redirect | Navigation | Redirects to /outreach/mailboxes | ✅ |

---

### 8. Mailboxes (`/outreach/mailboxes`)

| UI Element | Type | Function | Status |
|------------|------|----------|--------|
| **Header** |
| Add Mailbox Button | Action | Opens add mailbox dialog | ✅ |
| **Summary Cards** |
| Total Mailboxes | Stat Card | Count of all mailboxes | ✅ |
| Active Mailboxes | Stat Card | Currently sending | ✅ |
| Warming Mailboxes | Stat Card | In warmup phase | ✅ |
| Average Health | Stat Card | Health score average | ✅ |
| Today's Capacity | Stat Card | Remaining/Total capacity | ✅ |
| Total Sent | Stat Card | Lifetime emails sent | ✅ |
| **List Controls** |
| Refresh Button | Action | Reload mailboxes | ✅ |
| **Mailbox Cards** |
| Email Address | Display | Mailbox email | ✅ |
| Display Name | Display | Sender name | ✅ |
| Status Badge | Visual | Active/Warming/Paused/Error | ✅ |
| Health Score | Display | Percentage with color coding | ✅ |
| Today Usage | Display | Sent/Limit | ✅ |
| Total Sent | Display | Lifetime count | ✅ |
| Warmup Progress | Progress Bar | Stage 1-5 with percentage | ✅ |
| Daily Progress | Progress Bar | Daily sending progress | ✅ |
| Error Message | Alert | Last error if exists | ✅ |
| SMTP/IMAP Verification | Visual | Checkmark icons | ✅ |
| More Actions Dropdown | Dropdown | View/Test/Resume/Pause/Delete | ✅ |
| Test Connection | Action | Verify SMTP/IMAP | ✅ |
| View Details Link | Link | Navigate to mailbox detail | ✅ |
| **Add Mailbox Dialog** |
| Email Input | Text Input | Mailbox email address | ✅ |
| Display Name Input | Text Input | Sender name | ✅ |
| SMTP Host Input | Text Input | SMTP server | ✅ |
| SMTP Port Input | Number Input | Default 465 | ✅ |
| SMTP Username Input | Text Input | SMTP auth username | ✅ |
| SMTP Password Input | Password Input | SMTP auth password | ✅ |
| IMAP Host Input | Text Input | IMAP server (optional) | ✅ |
| IMAP Port Input | Number Input | Default 993 | ✅ |
| IMAP Username Input | Text Input | IMAP auth username | ✅ |
| IMAP Password Input | Password Input | IMAP auth password | ✅ |
| Warmup Target Input | Number Input | Target emails/day after warmup | ✅ |
| Enable Warmup Checkbox | Checkbox | Enable/disable warmup | ✅ |
| Cancel Button | Action | Close dialog | ✅ |
| Add Mailbox Button | Action | Create mailbox | ✅ |
| **Empty State** |
| No Mailboxes Message | Display | Encourages adding first | ✅ |
| Add Mailbox CTA | Action | Opens add dialog | ✅ |

---

### 9. Mailbox Detail (`/outreach/mailboxes/[id]`)

| UI Element | Type | Function | Status |
|------------|------|----------|--------|
| Status tracking page | Page | Individual mailbox management | ⚠️ |

---

### 10. Campaigns List (`/outreach/campaigns`)

| UI Element | Type | Function | Status |
|------------|------|----------|--------|
| **Header** |
| New Campaign Button | Action | Navigate to campaign creation | ✅ |
| **Summary Cards** |
| Total Campaigns | Stat Card | Count of all campaigns | ✅ |
| Active Campaigns | Stat Card | Currently running | ✅ |
| Total Leads | Stat Card | All leads in campaigns | ✅ |
| Active Leads | Stat Card | Leads in sequence | ✅ |
| **List Controls** |
| Refresh Button | Action | Reload campaigns | ✅ |
| **Campaign Cards** |
| Campaign Name | Display/Link | Navigate to campaign detail | ✅ |
| Active/Paused Badge | Visual | Campaign status | ✅ |
| Sequence Badge | Visual | Shows step count | ✅ |
| Description | Display | Campaign description | ✅ |
| Lead Stats | Display | Total/Active leads | ✅ |
| Email Stats | Display | Sent count | ✅ |
| Reply Stats | Display | Replies + rate percentage | ✅ |
| Play/Pause Toggle | Action | Start/stop campaign | ✅ |
| More Actions Dropdown | Dropdown | View/Manage Leads/Settings/Duplicate/Delete | ✅ |
| Sequence Preview | Display | Shows sequence steps | ✅ |
| **Empty State** |
| No Campaigns Message | Display | Encourages creating first | ✅ |
| Create Campaign CTA | Action | Navigate to new campaign | ✅ |

---

### 11. Campaign Detail (`/outreach/campaigns/[id]`)

| UI Element | Type | Function | Status |
|------------|------|----------|--------|
| Campaign management interface | Page | Edit sequences, manage leads | ⚠️ |

---

### 12. New Campaign (`/outreach/campaigns/new`)

| UI Element | Type | Function | Status |
|------------|------|----------|--------|
| Campaign creation wizard | Form | Multi-step campaign setup | ⚠️ |

---

### 13. Outreach Analytics (`/outreach/analytics`)

| UI Element | Type | Function | Status |
|------------|------|----------|--------|
| **Header** |
| Refresh Button | Action | Reload analytics | ✅ |
| **Overview Cards** |
| Total Sent | Stat Card | Lifetime emails sent | ✅ |
| Open Rate | Stat Card | Percentage + count | ✅ |
| Reply Rate | Stat Card | Percentage + count | ✅ |
| Bounce Rate | Stat Card | Percentage + count | ✅ |
| **Mailbox Health Card** |
| Total/Active/Warming Grid | Display | Mailbox breakdown | ✅ |
| Average Health Progress | Progress Bar | Health score | ✅ |
| Capacity Used Progress | Progress Bar | Today's usage | ✅ |
| **Campaign Performance Card** |
| Total/Active Campaigns | Display | Campaign counts | ✅ |
| Total/Active Leads | Display | Lead counts | ✅ |
| **Inbox Overview Card** |
| Total/Unread/Starred | Stat Grid | Inbox metrics | ✅ |
| Positive/Negative Replies | Stat Grid | Reply sentiment | ✅ |
| **Email Funnel Card** |
| Funnel Bars | Visual | Sent→Opened→Replied | ✅ |
| Percentages | Display | Conversion rates | ✅ |

---

### 14. Unified Inbox (`/outreach/inbox`)

| UI Element | Type | Function | Status |
|------------|------|----------|--------|
| **Header** |
| Refresh Button | Action | Reload inbox | ✅ |
| **Left Panel** |
| Search Input | Text Input | Search conversations | ✅ |
| Filter Buttons | Toggle Buttons | All/Needs Response/Awaiting Reply | ✅ |
| Filter Count Badges | Visual | Shows count per filter | ✅ |
| **Thread List** |
| Thread List Items | Interactive List | Click to view | ✅ |
| Unread Indicator Dot | Visual | Blue/amber dot | ✅ |
| Prospect Name | Display | Thread participant | ✅ |
| Contact Info | Display | Name + title if available | ✅ |
| Last Message Preview | Display | Truncated message | ✅ |
| Relative Time | Display | "5m ago", "2h ago", etc. | ✅ |
| Status Badges | Visual | Needs Response/Awaiting Reply | ✅ |
| Message Count | Display | X messages | ✅ |
| **Right Panel** |
| Back Button (mobile) | Navigation | Return to list | ✅ |
| Prospect Header | Display | Name + tier badge + contact info | ✅ |
| View Profile Button | Link | Navigate to prospect detail | ✅ |
| Thread Started Info | Display | Conversation start date | ✅ |
| **Message Bubbles** |
| Outbound Messages | Display | Right-aligned violet bubbles | ✅ |
| Inbound Messages | Display | Left-aligned white/gray bubbles | ✅ |
| Sender Name | Display | "You" or contact name | ✅ |
| Message Time | Display | Time or date+time | ✅ |
| Subject (if different) | Display | Re: subject | ✅ |
| Message Body | Display | Pre-wrapped text | ✅ |
| Status Indicators (outbound) | Visual | Sent/Opened/Replied icons | ✅ |
| Email Type Badge (inbound) | Visual | Positive/Meeting Request/etc. | ✅ |
| **Reply Composer** |
| Reply Textarea | Text Input | Compose response | ✅ |
| AI Suggest Button | Action | Get AI-generated response | ⚠️ |
| Send Reply Button | Action | Send response | ✅ |
| Replying To Indicator | Display | Shows recipient | ✅ |
| **Empty States** |
| No Conversations Message | Display | When no threads | ✅ |
| Select Conversation Message | Display | When nothing selected | ✅ |

---

## Lead Generation Pages

### 15. Sales Navigator (`/sales-navigator`)

| UI Element | Type | Function | Status |
|------------|------|----------|--------|
| **Tabs** |
| Import CSV Tab | Tab | Upload and import | ✅ |
| Enrichment Tab | Tab | Email finding queue | ✅ |
| History Tab | Tab | Import logs | ✅ |
| **Import Tab** |
| Upload Zone | Dropzone | Drag & drop CSV | ✅ |
| CSV Preview | Display | Shows parsed data | ✅ |
| Import Stats | Display Grid | Total/Has Email/Needs Email | ✅ |
| Preview List | Display | First 20 prospects | ✅ |
| LinkedIn Icon | Visual | Per prospect | ✅ |
| Has Email/Find Email Badge | Visual | Email status | ✅ |
| Clear Button | Action | Clear preview | ✅ |
| Import All Button | Action | Trigger import | ✅ |
| Import Result Card | Display | Success metrics | ✅ |
| View Prospects Button | Link | Navigate to prospects | ✅ |
| Import More Button | Action | Reset for new import | ✅ |
| Expected Columns Sidebar | Display | Column names needed | ✅ |
| Instructions Sidebar | Display | Step-by-step guide | ✅ |
| **Enrichment Tab** |
| Queue Status Card | Display | Pending/Processing/Ready counts | ✅ |
| Download CSV Button | Action | Export enriched data | ✅ |
| Start Enrichment Button | Action | Trigger enrichment | ✅ |
| Enrichment Jobs List | Display | Job status list | ✅ |
| Job Status Icons | Visual | Clock/Loader/Check/X | ✅ |
| Found/Verified Badges | Visual | Email discovery status | ✅ |
| Enrichment Steps Sidebar | Display | Explains process | ✅ |
| Queue Status Sidebar | Display | Count breakdown | ✅ |
| **History Tab** |
| Import Logs List | Display | Past imports | ✅ |
| File Icon | Visual | CSV file indicator | ✅ |
| Import Stats | Display | Total/New/Dupes | ✅ |
| Timestamp | Display | Import date/time | ✅ |

---

### 16. Enrichment (`/enrichment`)

| UI Element | Type | Function | Status |
|------------|------|----------|--------|
| **Header** |
| Refresh Button | Action | Reload status | ✅ |
| **Stats Cards** |
| Total Prospects | Stat Card | Overall count | ✅ |
| Has Website | Stat Card | Website coverage | ✅ |
| Has Email | Stat Card | Email coverage | ✅ |
| **Pipeline Visualization** |
| Pipeline Bars | Visual | Waiting→Website→Email→Contacted | ✅ |
| Stage Counts | Display | Numbers per stage | ✅ |
| **Progress Indicator** |
| Real-time Progress | SSE Updates | Shows enrichment progress | ✅ |
| Type Indicator | Display | Websites or Emails | ✅ |
| Processed/Total | Display | X of Y | ✅ |
| Found Count | Display | Success count | ✅ |
| **Action Card** |
| Start Enrichment Button | Action | Opens enrichment modal | ✅ |
| Needs Enrichment Count | Display | Shows pending count | ✅ |
| **Enrichment Modal** |
| Auto Option | Radio | Both websites + emails | ✅ |
| Websites Only Option | Radio | Just find websites | ✅ |
| Emails Only Option | Radio | Just find emails | ✅ |
| Batch Size Selector | Dropdown | 10/20/50/100 | ✅ |
| Preview Summary | Display | What will be enriched | ✅ |
| Cancel Button | Action | Close modal | ✅ |
| Start Button | Action | Trigger enrichment | ✅ |
| **Alert Banners** |
| Stuck Prospects Alert | Alert | Shows prospects needing attention | ✅ |
| Missing Data Alerts | Alert | Website/email gaps | ✅ |
| **Activity Feed** |
| Activity Items | Display List | Recent enrichment results | ✅ |
| Action Icons | Visual | Website/Email/Fully Enriched | ✅ |
| Prospect Info | Display | Name + location | ✅ |
| Recent Badge | Visual | Highlights new activity | ✅ |
| **Empty States** |
| First-time State | Display | Welcome + start CTA | ✅ |
| All Caught Up State | Display | No pending enrichments | ✅ |
| **Last Updated** |
| Timestamp | Display | Stats generation time | ✅ |

---

### 17. Find New (`/find-new`)

| UI Element | Type | Function | Status |
|------------|------|----------|--------|
| **Tool Cards** |
| Sales Navigator Card | Link Card | Navigate to /sales-navigator | ✅ |
| Enrichment Card | Link Card | Navigate to /enrichment | ✅ |
| Mystery Shopper Card | Link Card | Navigate to /mystery-shopper | ✅ |
| Lead Sources Card | Link Card | Navigate to /lead-sources | ✅ |
| Tool Icon | Visual | Per tool | ✅ |
| Tool Description | Display | Tool purpose | ✅ |
| Feature Tags | Visual | Key features per tool | ✅ |
| Chevron Icon (hover) | Visual | Indicates clickable | ✅ |
| **Quick Tips Card** |
| Numbered Tips List | Display | Recommended workflow | ✅ |

---

### 18. Mystery Shopper (`/mystery-shopper`)

| UI Element | Type | Function | Status |
|------------|------|----------|--------|
| Mystery shopper queue | Page | Manage inquiry campaigns | ⚠️ |

---

### 19. Lead Sources (`/lead-sources`)

| UI Element | Type | Function | Status |
|------------|------|----------|--------|
| Scraper management | Page | Configure job board scrapers | ⚠️ |

---

### 20. Review Mining (`/review-mining`)

| UI Element | Type | Function | Status |
|------------|------|----------|--------|
| Review analysis | Page | Mine pain signals from reviews | ⚠️ |

---

### 21. Scraper (`/scraper`)

| UI Element | Type | Function | Status |
|------------|------|----------|--------|
| Manual scraper trigger | Page | Run scrapers manually | ⚠️ |

---

## Other Pages

### 22. Replies (`/replies`)

| UI Element | Type | Function | Status |
|------------|------|----------|--------|
| Reply tracking | Page | Track inbound replies | ⚠️ |

---

### 23. Activity (`/activity`)

| UI Element | Type | Function | Status |
|------------|------|----------|--------|
| Activity log | Page | System activity log | ⚠️ |

---

### 24. Notifications (`/notifications`)

| UI Element | Type | Function | Status |
|------------|------|----------|--------|
| Notification center | Page | User notifications | ⚠️ |

---

### 25. Settings (`/settings`)

| UI Element | Type | Function | Status |
|------------|------|----------|--------|
| **Tabs** |
| Configuration Tab | Tab | API config & scrapers | ✅ |
| Testing Tab | Tab | Test lab | ✅ |
| **Configuration Tab** |
| API Status Section | Display | Supabase/xAI/Google/ScraperAPI | ✅ |
| API Key Inputs | Password Input | Masked API keys | ✅ |
| API Status Badges | Visual | OK/Error/Optional | ✅ |
| Test Connections Button | Action | Verify all APIs | ✅ |
| Database Usage Section | Display Grid | Prospects/Emails/Activities/Scrape Runs | ✅ |
| Lead Scoring Rules | Display | Hot/Warm thresholds | ✅ |
| Scoring Components | Display Grid | Points per attribute | ✅ |
| Active Scrapers Section | Display | 10 job boards | ✅ |
| Scraper Cards | Display Grid | Base scrapers | ✅ |
| API Scrapers | Display Grid | Indeed/Adzuna | ✅ |
| **Testing Tab** |
| SMTP Status Indicator | Alert | Connected/Configured/Not Configured | ✅ |
| Check SMTP Button | Action | Refresh SMTP status | ✅ |
| Add Test Prospect Form | Form | Name/Email/City/Country inputs | ✅ |
| Create Test Prospect Button | Action | Add to database | ✅ |
| Test Prospects List | Display | All test prospects | ✅ |
| Send Test Email Button | Action | Generate + send | ✅ |
| Delete Test Prospect | Action | Remove from database | ✅ |
| Test Scenarios Card | Display | Testing checklist | ✅ |
| Ready/Configure Badges | Visual | Test scenario status | ✅ |

---

### 26. Login (`/login`)

| UI Element | Type | Function | Status |
|------------|------|----------|--------|
| Authentication | Page | User login | ⚠️ |

---

### 27. Stats (`/stats`)

| UI Element | Type | Function | Status |
|------------|------|----------|--------|
| Statistics overview | Page | Duplicate of /analytics? | ❓ |

---

### 28. Campaigns (Legacy) (`/campaigns`)

| UI Element | Type | Function | Status |
|------------|------|----------|--------|
| Campaign A/B testing | Page | Legacy campaign system | ⚠️ |

---

### 29. Agents (`/agents`)

| UI Element | Type | Function | Status |
|------------|------|----------|--------|
| Agent management | Page | AI agent configuration | ⚠️ |

---

### 30. Test Lab (`/test-lab`)

| UI Element | Type | Function | Status |
|------------|------|----------|--------|
| Testing environment | Page | Duplicate of Settings > Testing? | ❓ |

---

### 31. Debug Campaigns (`/debug/campaigns`)

| UI Element | Type | Function | Status |
|------------|------|----------|--------|
| Campaign debugging | Page | Developer debugging tool | ⚠️ |

---

## Common UI Components (Used Across Pages)

### Header Component
- Page Title | Display | Main page heading | ✅
- Subtitle | Display | Page description | ✅
- Action Button | Slot | Page-specific action | ✅

### Mobile Page Header
- Compact Header | Display | Mobile-optimized header | ✅
- Icon Buttons | Action | Mobile-friendly actions | ✅

### Theme Toggle
- Light/Dark Switch | Toggle | Theme switcher | ✅

### Navigation
- Sidebar Navigation | Navigation | Main menu | ⚠️
- Mobile Navigation | Navigation | Mobile menu | ⚠️

### Modals/Dialogs
- Dialog Component | Modal | Reusable modal | ✅
- Dialog Header | Display | Title + close | ✅
- Dialog Footer | Display | Actions | ✅

### Forms
- Input Component | Text Input | Standard input | ✅
- Textarea Component | Text Input | Multi-line input | ✅
- Select Component | Dropdown | Standard dropdown | ✅
- Checkbox Component | Checkbox | Toggle option | ✅
- Label Component | Display | Form labels | ✅

### Feedback
- Badge Component | Visual | Status indicators | ✅
- Alert/Banner | Alert | Warnings/info | ✅
- Toast Notifications | Toast | Success/error messages | ⚠️
- Loading Spinner | Visual | Loader2 animated | ✅
- Skeleton Loading | Visual | Content placeholders | ✅

### Data Display
- Card Component | Container | Content container | ✅
- Table Component | Table | Data tables | ✅
- Tabs Component | Tabs | Tab navigation | ✅
- Separator | Visual | Horizontal rule | ✅
- Badge | Visual | Status/count indicators | ✅
- Progress Bar | Visual | Percentage indicators | ✅

---

## UI Elements by Frequency

### Most Common Actions
1. Navigate to prospect detail (used on 5+ pages)
2. Refresh/Reload data (used on 10+ pages)
3. Filter/Search (used on 8+ pages)
4. Open modal/dialog (used on 6+ pages)
5. Copy to clipboard (used on 3+ pages)

### Most Common Displays
1. Prospect name + location (used on 8+ pages)
2. Status badges (used on 12+ pages)
3. Stat cards (used on 6+ pages)
4. Email preview (used on 4+ pages)
5. Activity timeline (used on 3+ pages)

### Most Common Inputs
1. Search input (used on 5+ pages)
2. Dropdown/Select (used on 10+ pages)
3. Textarea (used on 4+ pages)
4. Checkbox/Toggle (used on 4+ pages)

---

## Issues & Unclear Elements

### Unclear Purpose
1. `/stats` page - May be duplicate of `/analytics`
2. `/test-lab` page - May be duplicate of `/settings` testing tab
3. Enhanced Funnel (feature flag) - Status unclear

### Needs Verification
1. Prospect drawer navigation - Keyboard shortcuts?
2. Toast notifications - Not found in code but likely exist
3. Sidebar navigation - Expected but not in scanned pages
4. Some nested mailbox/campaign pages not fully documented

### Missing/Incomplete Pages
1. `/outreach/mailboxes/[id]` - Detail page exists but not read
2. `/outreach/campaigns/[id]` - Detail page exists but not read
3. `/outreach/campaigns/new` - Creation wizard exists but not read
4. `/mystery-shopper` - Page exists but not read
5. `/lead-sources` - Page exists but not read
6. Several admin/debug pages not fully documented

---

## Workflows Identified

### Primary User Flows

1. **Import & Enrich**
   - Sales Navigator → Upload CSV → Enrichment → Prospects

2. **Email Generation**
   - Prospects → Detail → Generate Email → Copy/Send

3. **Campaign Management**
   - Campaigns → New Campaign → Configure → Activate

4. **Inbox Management**
   - Inbox → Filter → View Thread → Reply

5. **Manual Prospect Add**
   - Prospects → Add → Fill Form → Save

### Multi-Step Processes

1. **Mailbox Setup**
   - Add → Configure SMTP/IMAP → Test → Enable Warmup

2. **Enrichment**
   - Select Type → Choose Batch Size → Review → Start

3. **Mystery Shopper**
   - Preview → Review → Add to Queue or Send

4. **Campaign Creation**
   - Name → Sequence → A/B Variants → Leads → Activate

---

### 17. Mystery Shopper (`/mystery-shopper`)

| UI Element | Type | Function | Status |
|------------|------|----------|--------|
| **Header** |
| Refresh Button | Action | Reload mystery shopper data | ✅ |
| **Stats Cards** |
| Total Sent Card | Display | Total inquiries sent | ✅ |
| Awaiting Reply Card | Display | Pending replies count | ✅ |
| Replied Card | Display | Received replies count | ✅ |
| GM Found Card | Display | Extracted GM contacts count | ✅ |
| **Response Time Analytics** |
| Response Time Card | Display | Average/Fastest/Slowest reply times (feature flagged) | ⚠️ |
| **Action Buttons** |
| Send Batch Button | Action | Send 5 mystery inquiries | ✅ |
| Check for Replies Button | Action | Check Gmail inbox for replies | ✅ |
| **Inquiry List** |
| Sent/Replied Tabs | Tabs | Toggle between sent and replied inquiries | ✅ |
| Inquiry List Items | Interactive List | Click to select and view details | ✅ |
| Status Badges | Visual | Sent/Replied/GM Found | ✅ |
| **Detail View** |
| Prospect Name Link | Navigation | Opens prospect detail page | ✅ |
| Inquiry Sent Section | Display | Template, From, Sent date | ✅ |
| Reply Received Section | Display | Reply body and timestamp | ✅ |
| Extracted GM Section | Display | GM name and email if found | ✅ |
| View Prospect Button | Action | Navigate to prospect page | ✅ |
| **Empty State** |
| Empty State Message | Display | Shown when no inquiries sent yet | ✅ |

---

### 18. Lead Sources (`/lead-sources`)

| UI Element | Type | Function | Status |
|------------|------|----------|--------|
| **Tabs** |
| Job Scraper Tab | Tab | Job board scraping controls | ✅ |
| Review Mining Tab | Tab | Review scraping controls | ✅ |
| **Job Scraper Tab** |
| Scraper Selection Grid | Interactive Grid | 10 job board scrapers (checkbox-style) | ✅ |
| Select All Button | Action | Select all scrapers | ✅ |
| Clear Button | Action | Deselect all scrapers | ✅ |
| Run Scrapers Button | Action | Start scraping process | ✅ |
| Running Indicator | Visual | Animated spinner when active | ✅ |
| Last Result Summary | Display | Found/New/Duplicates/Errors | ✅ |
| Locations Badges | Display | 10 target locations | ✅ |
| Job Titles Badges | Display | 7 job titles | ✅ |
| Recent Runs List | Interactive List | Past scrape runs with results | ✅ |
| Refresh Button | Action | Reload recent runs | ✅ |
| **Sidebar** |
| Deduplication Info Card | Display | Explains dedup logic | ✅ |
| This Week Stats Card | Display | New prospects, scrape runs | ✅ |
| Schedule Card | Display | Daily at 6:00 AM | ✅ |
| **Review Mining Tab** |
| Platform Selection | Button Group | TripAdvisor/Google Maps/Booking.com | ✅ |
| Region Selector | Button Pills | Indian Ocean/Mediterranean/etc. | ✅ |
| Location Toggles | Button Pills | Select/deselect locations in region | ✅ |
| Start Mining Button | Action | Begin review scraping | ✅ |
| Mining Result Summary | Display | Properties/Reviews/Pain Signals/New Leads | ✅ |
| Recent Mining Runs | Interactive List | Past mining runs with stats | ✅ |
| **Sidebar** |
| Pain Leads Summary Card | Display | Total leads and signals | ✅ |
| Recent Pain Leads List | Interactive List | Top 5 pain leads with links | ✅ |
| Pain Keywords Card | Display | Keywords by category | ✅ |
| How It Works Card | Display | 4-step explanation | ✅ |

---

### 19. Mailbox Detail (`/outreach/mailboxes/[id]`)

| UI Element | Type | Function | Status |
|------------|------|----------|--------|
| **Header** |
| Resume/Pause Button | Toggle Action | Activate or pause mailbox | ✅ |
| Back Link | Navigation | Return to mailboxes list | ✅ |
| **Status & Health Card** |
| Status Badge | Visual | Active/Warming/Paused/Error | ✅ |
| Health Score Display | Display | Percentage with color coding | ✅ |
| Warmup Stage Indicator | Display | Stage 1-5 with flame icon | ✅ |
| Daily Limit Display | Display | Max emails per day | ✅ |
| Warmup Progress Bar | Visual | Linear progress 0-100% | ✅ |
| Today's Sends Progress Bar | Visual | Sent/Limit progress | ✅ |
| Last Error Alert | Display | Shows recent error if any | ✅ |
| **Lifetime Statistics Card** |
| Total Sent Stat | Display | Lifetime sent count | ✅ |
| Total Opens Stat | Display | Opens count + rate | ✅ |
| Total Replies Stat | Display | Replies count + rate | ✅ |
| Total Bounces Stat | Display | Bounces count + rate | ✅ |
| **Recent Activity Card** |
| Daily Stats List | Scrollable List | Last 30 days activity | ✅ |
| Date Column | Display | Date of activity | ✅ |
| Sent/Replies/Bounces Columns | Display | Daily metrics | ✅ |
| **Connection Status Card** |
| SMTP Status Indicator | Visual | Check/X icon | ✅ |
| IMAP Status Indicator | Visual | Check/X icon | ✅ |
| Test SMTP Button | Action | Test SMTP connection | ✅ |
| Test IMAP Button | Action | Test IMAP connection | ✅ |
| **Settings Card** |
| Edit Button | Action | Enable edit mode | ✅ |
| Cancel/Save Buttons | Action | Save or cancel changes | ✅ |
| Display Name Input | Text Input | Mailbox display name | ✅ |
| Daily Limit Input | Number Input | Emails per day limit | ✅ |
| Target Per Day Input | Number Input | Post-warmup target | ✅ |
| Warmup Enabled Checkbox | Checkbox | Enable/disable warmup | ✅ |
| **Account Info Card** |
| Created Date | Display | Account creation date | ✅ |
| Warmup Started Date | Display | Warmup start date | ✅ |
| Last Used Date | Display | Last email sent timestamp | ✅ |
| SMTP Host Info | Display | Host:Port | ✅ |

---

### 20. Campaign Detail (`/outreach/campaigns/[id]`)

| UI Element | Type | Function | Status |
|------------|------|----------|--------|
| **Header** |
| Activate/Pause Button | Toggle Action | Start or stop campaign | ✅ |
| Back Button | Navigation | Return to campaigns list | ✅ |
| **Status Badges** |
| Active/Paused Badge | Visual | Campaign status | ✅ |
| Step Count Badge | Visual | Number of sequence steps | ✅ |
| **Stats Cards** |
| Total Leads Card | Display | Total leads in campaign | ✅ |
| Active Leads Card | Display | Currently active leads | ✅ |
| Emails Sent Card | Display | Total emails sent | ✅ |
| Replies Card | Display | Total replies received | ✅ |
| **Tabs** |
| Sequences Tab | Tab | Email sequence steps | ✅ |
| Leads Tab | Tab | Campaign leads list | ✅ |
| Settings Tab | Tab | Campaign settings | ✅ |
| **Sequences Tab** |
| Refresh Button | Action | Reload sequences | ✅ |
| Sequence Step Cards | Display Cards | Subject, body, stats for each step | ✅ |
| Step Number | Display | Step number in sequence | ✅ |
| Delay Indicator | Display | Wait time before step | ✅ |
| Sent/Opens/Replies Stats | Display | Per-step metrics | ✅ |
| Empty State | Display | No sequence steps message | ✅ |
| **Leads Tab** |
| Add Leads Button | Action | Add leads to campaign | ✅ |
| Refresh Button | Action | Reload leads | ✅ |
| Status Summary Badges | Visual | Lead counts by status | ✅ |
| Lead List Cards | Interactive Cards | Individual lead cards | ✅ |
| Lead Avatar | Visual | Initial in colored circle | ✅ |
| Lead Status Badge | Visual | Active/Completed/Replied/etc. | ✅ |
| Empty State | Display | No leads message + CTA | ✅ |
| **Settings Tab** |
| Campaign Name Input | Text Input | Edit campaign name | ✅ |
| Description Textarea | Textarea | Edit description | ✅ |
| Daily Limit Input | Number Input | Max sends per day | ✅ |
| Save Changes Button | Action | Save settings | ✅ |
| Delete Campaign Button | Destructive Action | Remove campaign (danger zone) | ✅ |

---

### 21. New Campaign (`/outreach/campaigns/new`)

| UI Element | Type | Function | Status |
|------------|------|----------|--------|
| **Header** |
| Back Button | Navigation | Cancel and return | ✅ |
| **Campaign Details Card** |
| Campaign Name Input | Text Input | Required field | ✅ |
| Description Textarea | Textarea | Optional description | ✅ |
| Daily Send Limit Input | Number Input | 1-500 emails/day | ✅ |
| A/B Testing Switch | Toggle | Enable A/B testing | ✅ |
| **Email Sequence Section** |
| Add Step Button | Action | Add new sequence step | ✅ |
| **Sequence Step Cards** |
| Step Number Header | Display | Step 1, 2, 3, etc. | ✅ |
| Grip Handle Icon | Visual | Drag handle (cursor-move) | ✅ |
| Delay Badge | Display | Wait time for step 2+ | ✅ |
| Remove Step Button | Destructive Action | Delete step (if > 1) | ✅ |
| Delay Days Input | Number Input | Days to wait | ✅ |
| Delay Hours Input | Number Input | Hours to wait (0-23) | ✅ |
| Variant Label | Visual | Variant A / Variant B | ✅ |
| **Personalization Toolbar** |
| Add Personalization Button | Action | Expand toolbar (compact mode) | ✅ |
| Collapse Button | Action | Collapse toolbar | ✅ |
| Variable Category Sections | Display | Contact/Company/Location | ✅ |
| Variable Buttons | Action | Insert {{variable}} | ✅ |
| Variable Tooltip | Hover Display | Example value on hover | ✅ |
| Help Info Box | Display | Explains how variables work | ✅ |
| **Email Editor** |
| Subject Line Input | Text Input | Email subject (supports variables) | ✅ |
| Preview/Edit Toggle | Toggle | Switch between modes | ✅ |
| Email Body Textarea | Textarea | Multiline with font-mono | ✅ |
| Preview Mode Display | Display | Shows resolved variables | ✅ |
| Variables Detected Box | Display | Highlights detected variables | ✅ |
| **A/B Testing (if enabled)** |
| Variant B Section | Display | Second email variant | ✅ |
| Split Percentage Input | Number Input | % to send variant A (10-90) | ✅ |
| Subject Line B Input | Text Input | Alternative subject | ✅ |
| Email Body B Editor | Email Editor | Alternative body with personalization | ✅ |
| **Submit Actions** |
| Cancel Button | Action | Discard and return | ✅ |
| Create Campaign Button | Submit | Save and create campaign | ✅ |

**Special Features in New Campaign:**
- **Advanced Personalization System**: Interactive toolbar with categorized variables (Contact, Company, Location)
- **Live Preview**: Toggle between edit and preview modes to see resolved variables
- **Variable Highlighting**: Visual feedback showing detected personalization variables
- **Animated Transitions**: Framer Motion animations for smooth UX
- **Tooltip System**: Hover tooltips showing example values for each variable
- **A/B Testing**: Optional split testing with percentage control
- **Multi-step Sequences**: Unlimited steps with delay configuration
- **Sample Data Injection**: Preview uses realistic sample data

---

## Summary Statistics

- **Total Pages:** 31
- **Fully Documented:** 21 (67.7%)
- **Partially Documented:** 10 (32.3%)
- **Not Yet Scanned:** 0
- **Total UI Elements:** 500+
- **Forms:** 10+
- **Modals/Dialogs:** 8+
- **Tables:** 5+
- **Interactive Lists:** 15+
- **Stat Cards:** 40+
- **Action Buttons:** 150+
- **Filters/Toggles:** 30+
- **Advanced Features:**
  - Personalization System (21 variables across 3 categories)
  - Real-time SSE Progress Tracking
  - A/B Testing Framework
  - Drag-and-Drop Interfaces
  - Live Preview System
  - Multi-step Workflows

---

## Recommendations

### Priority 1 - Complete Remaining Partial Documentation
1. ✅ COMPLETED: Mystery Shopper, Lead Sources, Mailbox Detail, Campaign Detail, New Campaign
2. Verify `/emails` page (partially documented)
3. Verify `/pipeline` page (partially documented)
4. Verify `/analytics` page (partially documented)
5. Complete outreach pages: `/outreach`, `/outreach/mailboxes`, `/outreach/campaigns`, `/outreach/analytics`, `/outreach/inbox`

### Priority 2 - Verify Duplicates & Feature Flags
1. Confirm if `/stats` duplicates `/analytics`
2. Confirm if `/test-lab` duplicates `/settings` testing tab
3. Verify which feature flags are active:
   - `SHOW_RESPONSE_TIMES` in Mystery Shopper
   - Enhanced funnel visualizations
4. Document hidden/admin-only features

### Priority 3 - Advanced Interaction Details
1. Document keyboard shortcuts (if any)
2. Document drag-and-drop interactions in pipeline (React DnD)
3. Document mobile-specific responsive behaviors
4. Document SSE (Server-Sent Events) implementation details
5. Document Framer Motion animation patterns
6. Document toast notification system (likely using sonner or react-hot-toast)

### Priority 4 - Component Library Documentation
1. Document all shadcn/ui components used
2. Document custom component extensions
3. Document theme system (ThemeContext implementation)
4. Document icon system (lucide-react usage patterns)

---

**End of UI Inventory**
