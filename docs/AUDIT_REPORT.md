# Comprehensive Diagnostic Audit Report

## CRM Automation Platform for Luxury Hospitality Prospecting

---

## A. Architecture Summary

### Technology Stack

| Layer       | Technology                          | Version                  |
| ----------- | ----------------------------------- | ------------------------ |
| Framework   | Next.js                             | 16.0.0 (App Router)      |
| UI          | React                               | 19.2.0                   |
| Language    | TypeScript                          | 5.x                      |
| Database    | Supabase (PostgreSQL)               | Latest                   |
| Styling     | TailwindCSS                         | 4.x                      |
| AI          | Anthropic Claude API                | claude-sonnet-4-20250514 |
| AI Fallback | X.AI Grok                           | grok-3-mini-fast-latest  |
| Email       | SMTP + Microsoft Graph + Gmail IMAP | Multi-provider           |

### Codebase Metrics

- **208 TypeScript files** across the project
- **36+ API routes** in `src/app/api/`
- **20 UI pages** in `src/app/`
- **50+ UI components** in `src/components/`
- **24 database tables** in Supabase

### Core Architectural Patterns

1. **Repository Pattern** - Data access abstraction via `src/lib/repositories/`
2. **Service Layer** - Business logic in `src/lib/services/`
3. **Feature Flags** - Runtime configuration in `src/lib/feature-flags.ts`
4. **Circuit Breaker** - Resilience pattern for external calls
5. **Dead Letter Queue** - Failed operation recovery via `dead_letter_queue` table
6. **Multi-inbox Rotation** - 10 SMTP inboxes with warmup schedules

---

## B. Functional Map

### Data Flow: Lead → CRM Update

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           LEAD SOURCES (13+)                                │
├─────────────────────────────────────────────────────────────────────────────┤
│ Job Boards: Indeed, Glassdoor, SimplyHired, Caterer, LinkedIn, Hospitality  │
│ Hotelier, Hcareers, Hosco, CareerBuilder, ZipRecruiter, Monster             │
│ Google Maps │ Sales Navigator │ Review Mining (TripAdvisor, Google, Booking)│
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PROSPECT DATABASE                                     │
│  Stage: new → researching → outreach → contacted → engaged → meeting →      │
│         proposal → won/lost                                                  │
│  Tier: hot (70+) │ warm (40-69) │ cold (<40)                                │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    ▼                              ▼
┌───────────────────────────────────┐  ┌───────────────────────────────────────────┐
│      ENRICHMENT PIPELINE          │  │         MYSTERY SHOPPER FLOW              │
│ Website scraping                  │  │ Generate inquiry → Send → Track reply     │
│ LinkedIn lookup                   │  │ Parse response → Extract GM name          │
│ Email finder (Hunter.io)          │  │ Calculate response time                   │
│ Contact name extraction           │  └───────────────────────────────────────────┘
└───────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          CAMPAIGN SYSTEM                                     │
│  Sequences: outreach → follow_up_1 → follow_up_2 → follow_up_3              │
│  Email Types: outreach │ follow_up │ mystery_shopper                        │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      OUTBOUND EMAIL SYSTEM                                   │
│  10 SMTP inboxes with warmup schedules                                      │
│  Rotation: Round-robin by warmup tier (full → partial → new)                │
│  Rate limits: Per-inbox daily caps                                          │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      REPLY PROCESSING                                        │
│  Gmail IMAP polling │ Microsoft Graph webhooks                              │
│  AI Classification: positive │ negative │ out_of_office │ bounce │ meeting  │
│  Sentiment scoring │ Auto stage updates                                     │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      CRM UPDATES                                             │
│  Activities table │ Notifications │ Stage transitions │ Tier recalculation  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Database Schema (24 Tables)

**Core Tables:**
| Table | Purpose | Key Fields |
|-------|---------|------------|
| `prospects` | Main CRM records | id, name, company, email, stage, tier, score |
| `emails` | All email records | prospect_id, direction, email_type, status, sent_at |
| `activities` | Event log | prospect_id, type, title, description |
| `notifications` | User alerts | prospect_id, type, read, message |
| `campaigns` | Outreach campaigns | id, status, sequence_step |
| `campaign_prospects` | M:M junction | campaign_id, prospect_id, sequence_position |

**Automation Tables:**
| Table | Purpose |
|-------|---------|
| `mystery_shopper_queue` | Pending mystery shops |
| `mystery_shopper_results` | Completed shops with response times |
| `email_inboxes` | SMTP inbox configs + warmup state |
| `email_warmup_schedules` | Daily send limits per inbox |
| `dead_letter_queue` | Failed operations for retry |

**Intelligence Tables:**
| Table | Purpose |
|-------|---------|
| `pain_signals` | Extracted pain points from reviews |
| `review_sources` | TripAdvisor, Google, Booking.com links |
| `job_postings` | Scraped job listings |
| `competitor_analysis` | Competitive intel |
| `linkedin_profiles` | Sales Navigator data |

**System Tables:**
| Table | Purpose |
|-------|---------|
| `users` | Auth/accounts |
| `prospect_tags`, `tags` | Tagging system |
| `prospect_notes` | Manual notes |
| `email_threads` | Thread grouping |
| `prospect_archive` | Soft-deleted prospects |

### API Routes (36+)

**Prospect Management:**

- `GET/POST /api/prospects` - List/create
- `GET/PATCH/DELETE /api/prospects/[id]` - CRUD
- `POST /api/prospects/[id]/archive` - Archive
- `POST /api/prospects/[id]/generate-email` - AI email gen
- `POST /api/prospects/[id]/send-email` - Send email

**Automation:**

- `GET /api/cron/send-emails` - Outbound email cron
- `GET /api/cron/check-replies` - Reply polling cron
- `GET /api/cron/mystery-shopper` - Mystery shop cron
- `GET /api/cron/sales-nav-enrichment` - Enrichment cron
- `POST /api/mystery-shopper/send` - Manual mystery shop
- `POST /api/mystery-shopper/check-replies` - Manual reply check

**Analytics:**

- `GET /api/stats` - Dashboard metrics
- `GET /api/activities` - Activity feed
- `GET /api/notifications` - Notification list

**Campaign:**

- `GET/POST /api/campaigns` - Campaign management
- `POST /api/campaigns/[id]/send` - Send campaign

---

## C. UI/UX Journey Reality

### Navigation Structure

```
Dashboard (/)
├── Pipeline (/pipeline)
├── Emails (/emails)
├── Replies (/replies)
├── Campaigns (/campaigns)
├── Analytics (/analytics)
├── Notifications (/notifications)
├── Activity (/activity)
├── Mystery Shopper (/mystery-shopper)
├── Review Mining (/review-mining)
├── Sales Navigator (/sales-navigator)
├── Job Scraper (/job-scraper)
├── Settings (/settings)
└── Profile (/profile)
```

### User Journey Mapping

**Journey 1: View Pipeline Status**

1. User lands on Dashboard → sees summary cards
2. Navigates to Pipeline → sees Kanban board with stage columns
3. Clicks prospect card → opens detail page with tabs
4. Views Emails tab → sees threaded conversation
5. Views Activity tab → sees chronological events

**Journey 2: Send Outreach**

1. User navigates to Campaigns
2. Creates/selects campaign
3. Adds prospects to campaign
4. Triggers send
5. Views sent emails in Emails page
6. Monitors replies in Replies page

**Journey 3: Mystery Shopper**

1. User navigates to Mystery Shopper page
2. Views queue of pending prospects
3. Clicks "Send Batch" or individual send
4. Waits for replies (cron or manual check)
5. Views results with response times
6. GM names auto-extracted to prospect records

**Journey 4: Monitor Activity**

1. User navigates to Notifications → sees unread alerts for replies
2. Clicks notification → navigates to prospect detail
3. Alternatively: Activity page → sees all system events
4. Alternatively: Replies page → sees all inbound messages

### Page Inventory (20 Pages)

| Page               | Primary Function       | Data Source                    |
| ------------------ | ---------------------- | ------------------------------ |
| `/`                | Dashboard metrics      | `/api/stats`                   |
| `/pipeline`        | Kanban board           | `/api/prospects`               |
| `/prospects/[id]`  | Prospect detail        | `/api/prospects/[id]`          |
| `/emails`          | Sent emails list       | `/api/emails`                  |
| `/replies`         | Inbound replies        | `/api/replies`                 |
| `/campaigns`       | Campaign management    | `/api/campaigns`               |
| `/analytics`       | Charts/trends          | `/api/stats`, `/api/analytics` |
| `/notifications`   | Alert center           | `/api/notifications`           |
| `/activity`        | Event feed             | `/api/activities`              |
| `/mystery-shopper` | Mystery shop mgmt      | `/api/mystery-shopper`         |
| `/review-mining`   | Pain signal extraction | `/api/pain-signals`            |
| `/sales-navigator` | LinkedIn imports       | `/api/sales-navigator`         |
| `/job-scraper`     | Job board scraping     | `/api/job-postings`            |
| `/settings`        | System config          | Various                        |
| `/profile`         | User settings          | `/api/users`                   |
| `/login`           | Authentication         | Auth                           |

---

## D. Working Areas (Fully Functional)

### 1. Prospect CRUD Operations

- **Location**: `src/app/api/prospects/`
- **Status**: ✅ Complete
- Create, read, update, delete prospects
- Stage transitions with activity logging
- Tier calculation based on scoring
- Archive/restore functionality

### 2. Email Sending Infrastructure

- **Location**: `src/lib/services/email-service.ts`
- **Status**: ✅ Complete
- 10-inbox rotation with warmup schedules
- Rate limiting per inbox
- SMTP delivery with retry logic
- Email tracking (sent, opened, bounced)

### 3. Reply Processing Pipeline

- **Location**: `src/app/api/cron/check-replies/`
- **Status**: ✅ Complete
- Gmail IMAP polling
- Microsoft Graph webhook integration
- AI classification (positive/negative/meeting/bounce)
- Auto-stage updates on positive replies
- Notification generation

### 4. Activity Logging

- **Location**: `src/app/activity/page.tsx`
- **Status**: ✅ Complete
- Comprehensive event tracking
- Filtering by type
- Search functionality
- Date grouping (Today/Yesterday/Older)

### 5. Notification System

- **Location**: `src/app/notifications/page.tsx`
- **Status**: ✅ Complete
- Real-time notification creation on events
- Mark read/unread
- Delete notifications
- Filter by type (meeting_request, positive_reply, email_reply, bounce)

### 6. Mystery Shopper Core

- **Location**: `src/app/mystery-shopper/page.tsx`
- **Status**: ✅ Complete
- AI-generated inquiry emails
- Send queue management
- Reply detection
- GM name extraction
- Response time calculation

### 7. Pipeline Kanban View

- **Location**: `src/app/pipeline/page.tsx`
- **Status**: ✅ Complete
- Drag-and-drop stage changes
- Tier filtering
- Search functionality
- Quick actions

### 8. Sales Navigator Import

- **Location**: `src/app/api/sales-navigator/route.ts`
- **Status**: ✅ Complete
- CSV file upload
- Deduplication logic
- Enrichment pipeline trigger
- LinkedIn profile linking

---

## E. Partially Working Areas

### 1. Campaign Sequencing

- **What Works**: Campaign creation, prospect assignment, initial send
- **What's Partial**: Follow-up sequencing appears to have manual trigger requirements
- **Evidence**: `sequence_step` field exists but automated step advancement unclear
- **Location**: `src/app/api/campaigns/`

### 2. Email Analytics

- **What Works**: Basic counts (sent, replies, bounces) in stats API
- **What's Partial**: Open tracking referenced but implementation unclear
- **Evidence**: `email_opened` activity type exists but no pixel tracking visible
- **Location**: `src/app/api/stats/route.ts:114` references `email_opened` but unclear source

### 3. Enrichment Pipeline

- **What Works**: Website scraping, email finder integration
- **What's Partial**: Personal email success rate tracking exists (stats API shows `withPersonalEmail` vs `withGenericEmail`)
- **Evidence**: `src/app/api/stats/route.ts:51-69` tracks enrichment but UI exposure limited
- **UI Gap**: Enrichment success metrics not prominently displayed

### 4. Review Mining

- **What Works**: Pain signal extraction, TripAdvisor/Google/Booking scraping
- **What's Partial**: Integration with prospect scoring unclear
- **Evidence**: `pain_signals` table exists, `lead_source='review_mining'` counted in stats
- **UI Gap**: `src/app/review-mining/` page exists but integration with main pipeline unclear

### 5. Job Scraper Integration

- **What Works**: 13 job board scrapers, job posting storage
- **What's Partial**: Automatic prospect creation from jobs unclear
- **Evidence**: `job_postings` table exists, scrapers defined in `src/lib/job-scrapers/`
- **UI Gap**: Connection between scraped jobs and created prospects not visible

---

## F. Broken or Incomplete

### 1. Email Open Tracking

- **Status**: 🔴 Incomplete
- **Evidence**: Activity type `email_opened` referenced in `src/app/activity/page.tsx:49` but no tracking pixel implementation found
- **Impact**: Cannot measure email engagement beyond replies

### 2. Competitor Analysis

- **Status**: 🔴 Table exists, no visible UI
- **Evidence**: `competitor_analysis` table in schema but no pages or API routes found
- **Impact**: Feature appears abandoned or never implemented

### 3. Email Thread Grouping

- **Status**: 🟡 Partial implementation
- **Evidence**: `email_threads` table exists, prospect detail shows emails but threading logic unclear
- **Impact**: May show flat email list instead of proper conversation threads

### 4. Dead Letter Queue Processing

- **Status**: 🟡 Table exists, retry mechanism unclear
- **Evidence**: `dead_letter_queue` table exists in schema
- **Impact**: Failed operations may not be automatically retried

### 5. Webhook Delivery

- **Status**: 🔴 Referenced but not implemented
- **Evidence**: No webhook configuration UI found, no outbound webhook sending logic visible
- **Impact**: Cannot notify external systems of events

---

## G. Visibility Gaps

### 1. Enrichment Progress Not Surfaced

- **Gap**: User cannot see which prospects are pending enrichment vs enriched
- **Backend**: Enrichment cron exists, results tracked
- **Frontend**: No dedicated enrichment status column or filter in pipeline

### 2. Email Warmup Status Hidden

- **Gap**: User cannot see inbox warmup progress or which inboxes are "ready"
- **Backend**: `email_warmup_schedules` table tracks daily limits
- **Frontend**: No warmup dashboard in Settings or elsewhere

### 3. Cron Job Health Not Visible

- **Gap**: User cannot see if automation is running successfully
- **Backend**: `src/app/api/stats/route.ts:228-248` tracks `lastCronRun`
- **Frontend**: Not prominently displayed on dashboard

### 4. Queue Depths Not Exposed

- **Gap**: User cannot see how many items are pending in various queues
- **Backend**: `mystery_shopper_queue`, `dead_letter_queue` counts available
- **Frontend**: Only mystery shopper queue shown, others hidden

### 5. Conversion Funnel Exists but Buried

- **Gap**: Full funnel data computed but not visualized
- **Backend**: `src/app/api/stats/route.ts:251-258` computes funnel
- **Frontend**: Analytics page exists but funnel visualization unclear

### 6. Response Time Analytics Hidden

- **Gap**: Mystery shopper response times tracked but not displayed
- **Backend**: `src/app/api/stats/route.ts:193-225` computes avg/min/max
- **Frontend**: Not visible in Mystery Shopper page or dashboard

### 7. Weekly Trends Computed but Not Charted

- **Gap**: Week-over-week comparison exists in API
- **Backend**: `src/app/api/stats/route.ts:136-190` computes trends with % change
- **Frontend**: Trend data available but chart implementation unclear

---

## H. Structural Gaps

### 1. Stage → Tier Mismatch

- **Issue**: Stage progression (new→won) and Tier (hot/warm/cold) are independent concepts
- **Gap**: No visible logic connecting stage advancement to tier score changes
- **Impact**: User may see "hot" prospect in "new" stage (confusing)

### 2. Campaign vs Direct Email Ambiguity

- **Issue**: Emails can be sent via campaigns OR directly from prospect detail
- **Gap**: No unified "all outreach" view that merges both paths
- **Impact**: User must check multiple places to see full email history

### 3. Notification → Source Traceability

- **Issue**: Notifications link to prospect but not to specific email/activity
- **Evidence**: `src/app/notifications/page.tsx:391` links to `/prospects/{id}` only
- **Impact**: User must search within prospect detail to find triggering event

### 4. Multiple Lead Source Flows

- **Issue**: Leads come from 4+ sources (job scraper, review mining, sales nav, manual)
- **Gap**: No unified "lead source" report showing which sources perform best
- **Impact**: Cannot optimize lead generation strategy

### 5. Mystery Shopper Results Not Linked to Enrichment

- **Issue**: GM names extracted by mystery shopper not visible in enrichment flow
- **Gap**: Results stored in `mystery_shopper_results` but enrichment status separate
- **Impact**: User doesn't see mystery shopper as enrichment mechanism

---

## I. UX/Language Inconsistencies

### 1. "Stage" vs "Status" Terminology

- **Issue**: Code uses `stage` consistently but some UI may say "status"
- **Locations**: Pipeline page header, prospect cards
- **Recommendation Scope**: Audit all user-facing strings

### 2. "Tier" Visualization Inconsistency

- **Issue**: Tiers shown as badges (hot/warm/cold) but scoring (0-100) also exists
- **Gap**: User sees "warm" without knowing it means score 40-69
- **Locations**: Pipeline cards, prospect detail

### 3. Activity Type Naming

- **Issue**: Internal types (`email_sent`, `mystery_shopper`) shown raw to users
- **Evidence**: `src/app/activity/page.tsx:191-198` uses raw type as filter keys
- **Gap**: `email_sent` should display as "Email Sent" or "Outbound Email"

### 4. Notification Type Labels

- **Issue**: Types inconsistent between notification page and stats
- **Evidence**: `meeting_request` vs `meeting` used in different places
- **Locations**: `src/app/notifications/page.tsx:44` vs `src/app/activity/page.tsx:56`

### 5. Date Formatting Inconsistency

- **Issue**: Multiple date format functions with different outputs
- **Evidence**: `formatDate()` in notifications returns "5m ago", activity page has both `formatDate()` and `formatFullDate()`
- **Gap**: Some places show relative time, others show absolute dates

### 6. Action Button Labeling

- **Issue**: "Send Batch" vs "Send All" vs "Send Email" terminology varies
- **Locations**: Mystery Shopper page, Campaign page, Prospect detail
- **Gap**: No consistent verb for email sending action

### 7. Empty State Messaging

- **Issue**: Different tone/style across empty states
- **Evidence**:
  - Notifications: "You'll receive notifications when prospects reply to your emails"
  - Activity: "Activity will appear here as you use the system"
- **Gap**: No consistent empty state voice

---

## J. Clarifying Questions

### Architecture Questions

1. **Email Open Tracking**: Is pixel tracking intentionally omitted, or is this a planned feature?
2. **Dead Letter Queue**: What is the intended retry policy for failed operations?
3. **Competitor Analysis**: Is this feature deprecated or planned for future development?

### Business Logic Questions

4. **Campaign Sequences**: Should follow-ups auto-advance on a schedule, or require manual trigger?
5. **Tier Recalculation**: When should a prospect's tier/score be automatically updated?
6. **Enrichment Priority**: Should hot prospects be enriched before cold ones?

### UX Intent Questions

7. **Dashboard Priority**: What are the 3-5 most critical metrics users should see first?
8. **Mystery Shopper Flow**: Should this be presented as a "lead qualification" tool or "research" tool?
9. **Notification Preferences**: Should users be able to configure which event types generate notifications?

### Integration Questions

10. **External Webhooks**: Is there a need to notify external systems (Slack, CRM, etc.) of events?
11. **Calendar Integration**: Should meeting requests connect to Google/Outlook calendar?
12. **Reporting Export**: Is there a need for CSV/PDF export of analytics data?

---

## Audit Complete

This diagnostic covers the full system as explored. All observations are based on code analysis without executing or modifying the system.

**Awaiting instructions on priority areas for Phase 2: Proposal & Execution.**
