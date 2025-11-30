# Jengu Marketing Agent - Comprehensive System Audit

**Date:** November 30, 2025
**Version:** 1.0
**Auditor:** Claude Code

---

## PART 1: FUNCTIONALITY & USER JOURNEY AUDIT

### Executive Summary

The Jengu Marketing Agent is a sophisticated B2B sales automation platform targeting the luxury hospitality industry. It combines multi-channel lead discovery, AI-powered personalization, and automated outreach with a 4-inbox email rotation system supporting 80 emails/day capacity.

### Complete Feature Inventory

| # | Feature | Status | Location | Notes |
|---|---------|--------|----------|-------|
| 1 | Job Board Scraping | ✅ Complete | `/api/scrape`, 13 scrapers | Parallel execution, dedup, auto-enrich |
| 2 | Review Mining | ✅ Complete | `/api/review-mining/*` | TripAdvisor + Google, pain signal detection |
| 3 | **🔥 7-Step Email Finder** | ✅ Complete | `lib/enrichment/email-finder.ts` | **CRITICAL** - Hunter.io + patterns + verification |
| 4 | Google Places Enrichment | ✅ Complete | `/api/enrich` | Ratings, reviews, photos, contact extraction |
| 5 | Website Scraping | ✅ Complete | `lib/enrichment/website-scraper.ts` | Emails, phones, social links, team members |
| 6 | Lead Scoring | ✅ Complete | `lib/enrichment/scoring.ts` | Multi-factor, 0-100 scale, auto-tiering |
| 7 | AI Email Generation | ✅ Complete | `/api/generate-email` | Grok 4, personalized hooks, context-aware |
| 7 | Multi-Inbox Email Sending | ✅ Complete | `lib/email.ts` | Azure + 3 Spacemail, warmup limits |
| 8 | IMAP Reply Detection | ✅ Complete | `/api/check-replies` | All 4 inboxes checked |
| 9 | AI Instant Replies | ✅ Complete | `/api/check-replies` | <30 second response, thread continuity |
| 10 | Thread Continuity | ✅ Complete | `forceInbox` in email.ts | Replies from same inbox |
| 11 | Auto-Archiving | ✅ Complete | `/api/check-replies` | On "not interested" detection |
| 12 | Mystery Shopper Testing | ✅ Complete | `/api/mystery-shopper` | Response time tracking |
| 13 | Sales Pipeline (Kanban) | ✅ Complete | `/pipeline` | 8 stages, drag-and-drop |
| 14 | Prospect Detail View | ✅ Complete | `/prospects/[id]` | Full enrichment data, timeline |
| 15 | Activity Logging | ✅ Complete | `/api/activities` | All interactions tracked |
| 16 | Notifications | ✅ Complete | `/api/notifications` | Meeting requests, positive replies |
| 17 | Dashboard Analytics | ✅ Complete | `/`, `/stats` | Tier/stage breakdown, email metrics |
| 18 | Per-Inbox Stats (Agents) | ✅ Complete | `/agents` | Individual inbox performance |
| 19 | Email History | ✅ Complete | `/emails` | Searchable, thread grouping |
| 20 | Test Lab | ✅ Complete | `/test-lab` | Email testing, API debugging |
| 21 | Settings & Status | ✅ Complete | `/settings` | API health checks |
| 22 | Cron Automation | ✅ Complete | `/api/cron/*` | Daily scraping, mining, reply checking |

---

### 🔥 EMAIL ENRICHMENT PIPELINE (Core Value Driver)

The email enrichment system is the **most critical component** of the entire platform. Without valid decision-maker emails, all scraping is worthless. Here's the complete 7-step process:

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                        7-STEP EMAIL FINDER PIPELINE                                  │
│                        lib/enrichment/email-finder.ts                                │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  STEP 1: IDENTIFY DECISION-MAKER ROLE                                               │
│  ─────────────────────────────────────                                               │
│  Priority order (checks teamMembers from website scrape):                           │
│    1. General Manager / GM                                                          │
│    2. Operations Manager                                                            │
│    3. Director of Operations                                                        │
│    4. Owner / Proprietor                                                            │
│    5. Managing Director                                                             │
│    6. Hotel Manager                                                                 │
│    7. Revenue Manager                                                               │
│    8. IT Manager                                                                    │
│  Fallback: First person with any "Manager" or "Director" title                     │
│                                                                                      │
│  STEP 2: FIND PERSON'S NAME                                                         │
│  ─────────────────────────────                                                       │
│  Sources (from website-scraper.ts):                                                 │
│    • JSON-LD structured data on website                                             │
│    • HTML patterns: "John Smith - General Manager"                                  │
│    • Team/About/Leadership pages                                                    │
│    • Filters out fake names (placeholders, HTML artifacts)                          │
│                                                                                      │
│  STEP 3: IDENTIFY EMAIL DOMAIN                                                       │
│  ───────────────────────────────                                                     │
│  Priority:                                                                          │
│    1. Extract from website URL (thesavoy.com → thesavoy.com)                       │
│    2. Extract from existing business emails found                                   │
│    3. Skip generic domains (gmail, yahoo, hotmail, outlook)                        │
│                                                                                      │
│  STEP 4: DISCOVER EMAIL PATTERN (Hunter.io)                                         │
│  ──────────────────────────────────────────                                         │
│  API: https://api.hunter.io/v2/domain-search                                        │
│  Free tier: 25 domain searches/month                                                │
│  Returns: Company email pattern, e.g., "{first}.{last}"                            │
│  Also returns: Emails already found at that domain                                  │
│                                                                                      │
│  STEP 5: GENERATE EMAIL PERMUTATIONS                                                 │
│  ─────────────────────────────────────                                               │
│  If Hunter.io pattern found, use it first. Then generate alternatives:              │
│                                                                                      │
│    first.last@domain.com      (most common in hospitality)                          │
│    first@domain.com           (small properties)                                    │
│    flast@domain.com           (corporate style)                                     │
│    firstlast@domain.com       (no separator)                                        │
│    first_last@domain.com      (underscore)                                          │
│    first-last@domain.com      (hyphen)                                              │
│    last.first@domain.com      (reversed)                                            │
│    last@domain.com            (last name only)                                      │
│    f.last@domain.com          (initial.last)                                        │
│                                                                                      │
│  Generic fallbacks added:                                                           │
│    info@, reservations@, frontdesk@, reception@, gm@, manager@                     │
│                                                                                      │
│  STEP 6: VERIFY EMAILS (Hunter.io)                                                   │
│  ───────────────────────────────                                                     │
│  API: https://api.hunter.io/v2/email-verifier                                       │
│  Free tier: 50 verifications/month                                                  │
│  Returns: valid | invalid | accept_all | unknown                                    │
│  Strategy: Verify up to 5 emails, return first valid                               │
│                                                                                      │
│  STEP 7: RETURN RESULT WITH CONFIDENCE                                               │
│  ─────────────────────────────────────                                               │
│  Returns:                                                                           │
│    • validatedEmail: Best email found                                               │
│    • contactName: Decision-maker name                                               │
│    • contactRole: Their title                                                       │
│    • confidenceScore: high | medium | low                                           │
│    • emailPatternSource: Hunter.io | website_scrape | common_patterns              │
│    • allEmailsFound: All discovered emails                                          │
│    • fallbackMethod: If no email, suggests "Call reception"                        │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

#### Email Enrichment Flow in Practice

```
Prospect: "The Savoy Hotel, London"
         │
         ▼
┌────────────────────────────────────────┐
│  1. Google Places API                   │
│     → Get website: thesavoy.com         │
│     → Rating: 4.8★, 15000+ reviews      │
└────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────┐
│  2. Website Scrape                      │
│     → Scrape thesavoy.com               │
│     → Scrape thesavoy.com/about         │
│     → Scrape thesavoy.com/contact       │
│     → Found: James Olivier (GM)         │
│     → Found: info@thesavoy.com          │
└────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────┐
│  3. Hunter.io Domain Search             │
│     → Pattern: {first}.{last}           │
│     → Found emails at domain            │
└────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────┐
│  4. Generate Permutations               │
│     → james.olivier@thesavoy.com        │
│     → jolivier@thesavoy.com             │
│     → james@thesavoy.com                │
│     → gm@thesavoy.com                   │
└────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────┐
│  5. Verify Best Email                   │
│     → james.olivier@thesavoy.com ✅      │
│     → Status: valid                     │
│     → Confidence: HIGH                  │
└────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────┐
│  Result saved to prospect:              │
│     email: james.olivier@thesavoy.com   │
│     contact_name: James Olivier         │
│     contact_title: General Manager      │
│     tier: HOT (high score)              │
│     tags: [luxury, has-contact]         │
└────────────────────────────────────────┘
```

#### Key Files

| File | Purpose |
|------|---------|
| `lib/enrichment/email-finder.ts` | 7-step email finder with Hunter.io integration |
| `lib/enrichment/website-scraper.ts` | Scrapes contact pages, extracts emails/phones/team members |
| `lib/enrichment/auto-enrich.ts` | Orchestrates full enrichment pipeline |
| `lib/enrichment/google-places.ts` | Google Places API for ratings, website, photos |
| `lib/enrichment/scoring.ts` | Calculates prospect score, assigns tier |

#### Configuration Required

```bash
# Hunter.io API (25 domain searches + 50 verifications/month FREE)
HUNTER_API_KEY=[your-key]

# Google Places (500 calls/day)
GOOGLE_PLACES_API_KEY=[your-key]
```

---

### User Journey Map

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           JENGU CRM USER JOURNEY                                 │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐                     │
│  │  DISCOVERY   │────▶│  ENRICHMENT  │────▶│   SCORING    │                     │
│  │              │     │              │     │              │                     │
│  │ • Job Boards │     │ • Google API │     │ • 0-100 pts  │                     │
│  │ • Review     │     │ • Website    │     │ • Hot/Warm/  │                     │
│  │   Mining     │     │   Scrape     │     │   Cold tier  │                     │
│  │ • Manual Add │     │ • Contact    │     │              │                     │
│  │              │     │   Extract    │     │              │                     │
│  └──────────────┘     └──────────────┘     └──────────────┘                     │
│         │                    │                    │                              │
│         ▼                    ▼                    ▼                              │
│  ┌─────────────────────────────────────────────────────────────────┐            │
│  │                      PROSPECT DATABASE                           │            │
│  │  prospects table: name, email, phone, rating, score, tier, stage │            │
│  └─────────────────────────────────────────────────────────────────┘            │
│                                    │                                             │
│                                    ▼                                             │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐                     │
│  │   OUTREACH   │────▶│    EMAIL     │────▶│   TRACKING   │                     │
│  │              │     │              │     │              │                     │
│  │ • AI writes  │     │ • Inbox      │     │ • IMAP check │                     │
│  │   email      │     │   rotation   │     │ • Reply      │                     │
│  │ • Mystery    │     │ • Warmup     │     │   detection  │                     │
│  │   shopper    │     │   limits     │     │ • AI instant │                     │
│  │ • User       │     │ • Thread     │     │   reply      │                     │
│  │   approves   │     │   continuity │     │              │                     │
│  └──────────────┘     └──────────────┘     └──────────────┘                     │
│                                                   │                              │
│                                                   ▼                              │
│  ┌─────────────────────────────────────────────────────────────────┐            │
│  │                         PIPELINE                                 │            │
│  │  New → Researching → Outreach → Engaged → Meeting → Proposal    │            │
│  │                                                    ↓      ↓      │            │
│  │                                                   Won    Lost    │            │
│  └─────────────────────────────────────────────────────────────────┘            │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Pain Points Identified in Current System

| Issue | Severity | Description |
|-------|----------|-------------|
| No follow-up sequences | High | Single email, no automated drip campaigns |
| Manual email approval | Medium | Every email requires user to click send |
| No scheduling | Medium | Can't schedule emails for optimal send times |
| Single user only | Medium | No team/role support |
| No email open tracking | Medium | Only reply detection, no pixel tracking |
| Memory-based rate limits | Low | Resets on Vercel cold start |

---

## PART 2: VALUE ENHANCEMENT OPPORTUNITIES

### Opportunity Matrix

| Priority | Enhancement | Impact | Effort | ROI |
|----------|-------------|--------|--------|-----|
| 🔴 P0 | Follow-up Sequences | Very High | Medium | 4x reply rate |
| 🔴 P0 | Email Scheduling | High | Low | Better open rates |
| 🟡 P1 | Open/Click Tracking | High | Medium | Campaign optimization |
| 🟡 P1 | A/B Testing | High | Medium | Message optimization |
| 🟡 P1 | LinkedIn Enrichment | High | High | Better contact data |
| 🟢 P2 | Bulk Operations | Medium | Low | Time savings |
| 🟢 P2 | Export/Import | Medium | Low | Data portability |
| 🟢 P2 | Multi-user/Teams | Medium | High | Scale operations |
| 🟢 P2 | Webhook Integrations | Medium | Medium | CRM sync |
| 🔵 P3 | Phone Call Tracking | Low | High | Full activity log |
| 🔵 P3 | Calendar Integration | Low | Medium | Meeting automation |

### Detailed Enhancement Recommendations

#### 1. Follow-up Sequences (P0 - Must Have)

**Current State:** Single email sent, no follow-up unless user manually generates another.

**Proposed Enhancement:**
```
prospects table additions:
  - sequence_id: uuid (FK to sequences)
  - sequence_step: integer
  - next_followup_at: timestamp

sequences table:
  - id, name, steps: jsonb[]
  - step structure: {delay_days, subject_template, body_template, condition}

Example sequence:
  Step 1: Day 0 - Initial outreach
  Step 2: Day 3 - "Just checking in..."
  Step 3: Day 7 - Value prop reinforcement
  Step 4: Day 14 - Breakup email

Cron job: /api/cron/process-sequences
  - Finds prospects where next_followup_at < now()
  - Generates and sends follow-up email
  - Advances sequence_step or marks complete
```

**Expected Impact:** 3-4x improvement in reply rates (industry benchmark: follow-ups get 65% of responses)

#### 2. Email Scheduling (P0 - Must Have)

**Current State:** Emails sent immediately on API call.

**Proposed Enhancement:**
```
emails table additions:
  - scheduled_for: timestamp
  - status: 'scheduled' | 'sent' | 'failed'

UI change:
  - Add datetime picker on email approval
  - Default to next business day 9am recipient timezone

Cron job: /api/cron/send-scheduled
  - Runs every 15 minutes
  - Finds emails where scheduled_for < now() AND status = 'scheduled'
  - Respects daily inbox limits
```

**Expected Impact:** 20-30% improvement in open rates (send during business hours)

#### 3. Open/Click Tracking (P1 - Should Have)

**Current State:** Only reply detection, no visibility into opens.

**Proposed Enhancement:**
```
Option A: Tracking pixel (simple)
  - Add 1x1 transparent image to email footer
  - /api/track/open?eid=[email_id] serves pixel, logs open

Option B: Click tracking (comprehensive)
  - Rewrite all links to /api/track/click?url=[original]&eid=[id]
  - Redirect to original after logging

emails table additions:
  - opened_at: timestamp
  - opened_count: integer
  - clicked_at: timestamp
  - clicked_links: jsonb[]
```

**Expected Impact:** Campaign optimization, identify engaged prospects faster

#### 4. A/B Testing (P1 - Should Have)

**Current State:** `email_templates` table exists but no split testing logic.

**Proposed Enhancement:**
```
email_templates table additions:
  - variant: 'A' | 'B' | 'control'
  - parent_template_id: uuid (for variants)

When generating email:
  - Randomly assign variant (50/50 or weighted)
  - Track which template used per email
  - Dashboard shows: open rate, reply rate per variant
  - Auto-pause losing variant after N sends

Key tests to run:
  - Subject line variations
  - Email length (short vs detailed)
  - CTA placement
  - Personalization level
```

**Expected Impact:** Continuous improvement of messaging, 10-20% lift over time

#### 5. LinkedIn Enrichment (P1 - Should Have)

**Current State:** Website scraping extracts some team members, but limited.

**Proposed Enhancement:**
```
Options:
  A) RocketReach API - $99/mo for 1200 lookups
  B) Apollo.io API - $49/mo for 600 contacts
  C) Snov.io - $39/mo for 1000 lookups

Integration:
  - After Google Places enrichment, lookup company on LinkedIn
  - Find: GM, Director of Operations, Revenue Manager
  - Extract: Name, title, email (if available), LinkedIn URL

prospects table additions:
  - linkedin_url: text
  - enriched_contacts: jsonb[] (all discovered contacts)
```

**Expected Impact:** 50%+ improvement in email deliverability (right person, right email)

---

## PART 3: ARCHITECTURE REVIEW

### Current Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                                 JENGU CRM ARCHITECTURE                               │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │                              VERCEL EDGE                                     │    │
│  │  ┌─────────────────────────────────────────────────────────────────────┐    │    │
│  │  │                         NEXT.JS APPLICATION                          │    │    │
│  │  │                                                                      │    │    │
│  │  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │    │    │
│  │  │  │    PAGES     │  │  COMPONENTS  │  │     LIB      │              │    │    │
│  │  │  │              │  │              │  │              │              │    │    │
│  │  │  │ /dashboard   │  │ Sidebar      │  │ email.ts     │              │    │    │
│  │  │  │ /prospects   │  │ Header       │  │ supabase.ts  │              │    │    │
│  │  │  │ /pipeline    │  │ ProspectCard │  │ scrapers/    │              │    │    │
│  │  │  │ /emails      │  │ EmailPreview │  │ enrichment/  │              │    │    │
│  │  │  │ /agents      │  │ Pipeline     │  │ rate-limiter │              │    │    │
│  │  │  │ /stats       │  │ StatsCard    │  │              │              │    │    │
│  │  │  └──────────────┘  └──────────────┘  └──────────────┘              │    │    │
│  │  │                                                                      │    │    │
│  │  │  ┌─────────────────────────────────────────────────────────────┐    │    │    │
│  │  │  │                      API ROUTES (/api)                       │    │    │    │
│  │  │  │                                                              │    │    │    │
│  │  │  │  CRUD              AUTOMATION           EXTERNAL             │    │    │    │
│  │  │  │  ─────             ──────────           ────────             │    │    │    │
│  │  │  │  /prospects        /scrape              /generate-email      │    │    │    │
│  │  │  │  /emails           /review-mining       /check-replies       │    │    │    │
│  │  │  │  /activities       /enrich              /mystery-shopper     │    │    │    │
│  │  │  │  /notifications    /auto-email          /webhooks            │    │    │    │
│  │  │  │                                                              │    │    │    │
│  │  │  │  CRON              STATS                                     │    │    │    │
│  │  │  │  ─────             ─────                                     │    │    │    │
│  │  │  │  /cron/scrape      /stats                                    │    │    │    │
│  │  │  │  /cron/mine        /stats/detailed                           │    │    │    │
│  │  │  │  /cron/check       /agents                                   │    │    │    │
│  │  │  └─────────────────────────────────────────────────────────────┘    │    │    │
│  │  └─────────────────────────────────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│                                         │                                            │
│                                         │ HTTPS                                      │
│                                         ▼                                            │
│  ┌─────────────────────────────────────────────────────────────────────────────┐    │
│  │                              EXTERNAL SERVICES                               │    │
│  │                                                                              │    │
│  │  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐          │    │
│  │  │     SUPABASE     │  │     EMAIL        │  │       AI         │          │    │
│  │  │                  │  │                  │  │                  │          │    │
│  │  │  PostgreSQL DB   │  │  Azure Graph     │  │  X.AI Grok 4     │          │    │
│  │  │  • prospects     │  │  • edd@jengu.ai  │  │  • Generation    │          │    │
│  │  │  • emails        │  │                  │  │  • Analysis      │          │    │
│  │  │  • activities    │  │  Spacemail SMTP  │  │                  │          │    │
│  │  │  • pain_signals  │  │  • jengu.me      │  │  Anthropic       │          │    │
│  │  │  • scrape_runs   │  │  • jengu.space   │  │  (fallback)      │          │    │
│  │  │                  │  │  • jengu.shop    │  │                  │          │    │
│  │  │                  │  │                  │  │                  │          │    │
│  │  │                  │  │  Gmail SMTP      │  │                  │          │    │
│  │  │                  │  │  (mystery shop)  │  │                  │          │    │
│  │  └──────────────────┘  └──────────────────┘  └──────────────────┘          │    │
│  │                                                                              │    │
│  │  ┌──────────────────┐  ┌──────────────────┐                                 │    │
│  │  │   ENRICHMENT     │  │   JOB BOARDS     │                                 │    │
│  │  │                  │  │                  │                                 │    │
│  │  │  Google Places   │  │  Hosco           │                                 │    │
│  │  │  • Rating        │  │  HCareers        │                                 │    │
│  │  │  • Reviews       │  │  HotelCareer     │                                 │    │
│  │  │  • Photos        │  │  TalentsHotels   │                                 │    │
│  │  │                  │  │  JournalPalaces  │                                 │    │
│  │  │  Website Scrape  │  │  Hospitality...  │                                 │    │
│  │  │  • Contacts      │  │  Indeed*         │                                 │    │
│  │  │  • Emails        │  │  Adzuna*         │                                 │    │
│  │  │  • Social        │  │  + 5 more        │                                 │    │
│  │  └──────────────────┘  └──────────────────┘                                 │    │
│  │                                                                              │    │
│  │  ┌──────────────────┐                                                        │    │
│  │  │  REVIEW MINING   │                                                        │    │
│  │  │                  │                                                        │    │
│  │  │  TripAdvisor     │                                                        │    │
│  │  │  Google Reviews  │                                                        │    │
│  │  └──────────────────┘                                                        │    │
│  └─────────────────────────────────────────────────────────────────────────────┘    │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘

* = Requires additional API key
```

### Data Flow Diagram

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│                              EMAIL FLOW (WITH INBOX ROTATION)                       │
├────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│                           ┌─────────────────────────────┐                          │
│                           │     USER CLICKS SEND        │                          │
│                           └──────────────┬──────────────┘                          │
│                                          │                                          │
│                                          ▼                                          │
│                           ┌─────────────────────────────┐                          │
│                           │   /api/auto-email (POST)    │                          │
│                           └──────────────┬──────────────┘                          │
│                                          │                                          │
│                                          ▼                                          │
│                           ┌─────────────────────────────┐                          │
│                           │    sendEmail(options)       │                          │
│                           └──────────────┬──────────────┘                          │
│                                          │                                          │
│                    ┌─────────────────────┼─────────────────────┐                   │
│                    ▼                     ▼                     ▼                   │
│    ┌───────────────────────┐ ┌───────────────────┐ ┌───────────────────┐          │
│    │  forceInbox set?      │ │  forceAzure?      │ │  selectInbox()    │          │
│    │  (thread continuity)  │ │                   │ │  (load balance)   │          │
│    └───────────┬───────────┘ └─────────┬─────────┘ └─────────┬─────────┘          │
│                │                       │                     │                     │
│                ▼                       ▼                     ▼                     │
│    ┌───────────────────────────────────────────────────────────────────┐          │
│    │                      INBOX SELECTION                               │          │
│    │                                                                    │          │
│    │   Azure (edd@jengu.ai)        │ Spacemail Rotation                │          │
│    │   ────────────────────        │ ──────────────────                │          │
│    │   • Primary inbox             │ • edd@jengu.me (SMTP_INBOX_1)     │          │
│    │   • Microsoft Graph API       │ • edd@jengu.space (SMTP_INBOX_2)  │          │
│    │   • Conversation threading    │ • edd@jengu.shop (SMTP_INBOX_3)   │          │
│    │                               │ • 20/day warmup limit each        │          │
│    │                               │ • Picks lowest send count         │          │
│    └───────────────────────────────────────────────────────────────────┘          │
│                                          │                                          │
│                                          ▼                                          │
│                           ┌─────────────────────────────┐                          │
│                           │   EMAIL SENT TO PROSPECT    │                          │
│                           │   from_email = selected     │                          │
│                           │   inbox email address       │                          │
│                           └──────────────┬──────────────┘                          │
│                                          │                                          │
│                                          ▼                                          │
│                           ┌─────────────────────────────┐                          │
│                           │   PROSPECT REPLIES          │                          │
│                           │   (to same inbox)           │                          │
│                           └──────────────┬──────────────┘                          │
│                                          │                                          │
│                                          ▼                                          │
│                           ┌─────────────────────────────┐                          │
│                           │  /api/check-replies (CRON)  │                          │
│                           └──────────────┬──────────────┘                          │
│                                          │                                          │
│                    ┌─────────────────────┼─────────────────────┐                   │
│                    ▼                     ▼                     ▼                   │
│    ┌───────────────────────┐ ┌───────────────────┐ ┌───────────────────┐          │
│    │  Azure Graph API      │ │  IMAP jengu.me    │ │ IMAP jengu.space  │          │
│    │  (check inbox)        │ │  (check inbox)    │ │ + jengu.shop      │          │
│    └───────────┬───────────┘ └─────────┬─────────┘ └─────────┬─────────┘          │
│                │                       │                     │                     │
│                └───────────────────────┼─────────────────────┘                     │
│                                        ▼                                            │
│                           ┌─────────────────────────────┐                          │
│                           │   MATCH TO PROSPECT         │                          │
│                           │   (by email address)        │                          │
│                           └──────────────┬──────────────┘                          │
│                                          │                                          │
│                                          ▼                                          │
│                           ┌─────────────────────────────┐                          │
│                           │   AI ANALYZES REPLY         │                          │
│                           │   (Grok 4)                  │                          │
│                           └──────────────┬──────────────┘                          │
│                                          │                                          │
│            ┌─────────────────────────────┼─────────────────────────────┐           │
│            ▼                             ▼                             ▼           │
│  ┌─────────────────────┐   ┌─────────────────────┐   ┌─────────────────────┐      │
│  │   MEETING REQUEST   │   │   POSITIVE REPLY    │   │   NOT INTERESTED    │      │
│  │                     │   │                     │   │                     │      │
│  │ • Stage → meeting   │   │ • Stage → engaged   │   │ • Stage → lost      │      │
│  │ • Notification      │   │ • AI instant reply  │   │ • Auto-archive      │      │
│  │ • Admin alert       │   │   (same inbox!)     │   │                     │      │
│  └─────────────────────┘   └─────────────────────┘   └─────────────────────┘      │
│                                                                                     │
└────────────────────────────────────────────────────────────────────────────────────┘
```

### Architecture Strengths

1. **Clean Separation of Concerns**
   - API routes handle HTTP, lib/ contains business logic
   - Scrapers are modular and independently testable
   - Enrichment pipeline is composable

2. **Resilient Email System**
   - Multiple inbox fallback (Azure → Spacemail)
   - Warmup limits prevent deliverability issues
   - Thread continuity maintains conversation context

3. **Serverless-Ready**
   - Stateless API routes work on Vercel Edge
   - Database-backed state (no in-memory dependencies for core logic)
   - Cron jobs are idempotent

4. **Extensible Scraping**
   - Adding new job boards = single file in `lib/scrapers/`
   - Common interface: `scrape(locations, jobTitles) → prospects[]`
   - Parallel execution by default

### Architecture Weaknesses

1. **Rate Limiting in Memory**
   ```typescript
   // Current: resets on cold start
   const dailyUsage = new Map<string, number>();

   // Should be: database-backed
   const { data } = await supabase
     .from('rate_limits')
     .select('count')
     .eq('key', 'grok_calls')
     .eq('date', today);
   ```

2. **No Queue System**
   - Emails sent synchronously in API request
   - Long-running scrapes can timeout
   - Should use: Vercel Background Functions or external queue (Bull, SQS)

3. **Single Point of Failure for AI**
   - If Grok API is down, email generation fails
   - Fallback to Claude exists but may have different output format
   - Need: graceful degradation, cached templates

4. **No Retry Logic**
   - Failed email sends are not retried
   - Failed enrichments are not queued for retry
   - Need: exponential backoff, dead letter handling

### Recommended Architecture Improvements

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│                         PROPOSED ARCHITECTURE IMPROVEMENTS                          │
├────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│  1. DATABASE-BACKED RATE LIMITING                                                  │
│     ────────────────────────────                                                   │
│     rate_limits table:                                                             │
│       - key: text (e.g., 'grok_calls', 'google_places')                           │
│       - date: date                                                                 │
│       - count: integer                                                             │
│       - limit: integer                                                             │
│                                                                                     │
│  2. EMAIL QUEUE                                                                     │
│     ───────────                                                                     │
│     email_queue table:                                                             │
│       - id, email_id, status ('pending', 'processing', 'sent', 'failed')          │
│       - scheduled_for: timestamp                                                   │
│       - attempts: integer                                                          │
│       - last_error: text                                                           │
│                                                                                     │
│     Cron: /api/cron/process-email-queue (every 5 min)                             │
│       - Picks oldest pending emails (batch 10)                                     │
│       - Respects inbox daily limits                                                │
│       - Retries failed up to 3 times with exponential backoff                     │
│                                                                                     │
│  3. BACKGROUND JOB PROCESSOR                                                        │
│     ────────────────────────                                                        │
│     jobs table:                                                                     │
│       - id, type ('scrape', 'enrich', 'mine_reviews'), payload: jsonb             │
│       - status ('pending', 'running', 'complete', 'failed')                       │
│       - started_at, completed_at, error                                            │
│                                                                                     │
│     Cron: /api/cron/process-jobs (every 1 min)                                    │
│       - Runs one job at a time                                                     │
│       - Prevents parallel scrapes from overloading                                 │
│       - Provides status visibility in UI                                           │
│                                                                                     │
│  4. OBSERVABILITY                                                                   │
│     ─────────────                                                                   │
│     Add: Sentry for error tracking                                                 │
│     Add: PostHog for product analytics                                             │
│     Add: /api/health endpoint for uptime monitoring                               │
│                                                                                     │
└────────────────────────────────────────────────────────────────────────────────────┘
```

---

## DELIVERABLES

### 1. Functionality Gap Matrix

| Feature | Current State | Gap | Priority | Effort |
|---------|---------------|-----|----------|--------|
| Follow-up Sequences | None | Full implementation needed | P0 | 2-3 days |
| Email Scheduling | Immediate send only | Add scheduled_for, cron processor | P0 | 1 day |
| Open Tracking | None | Tracking pixel endpoint | P1 | 0.5 day |
| Click Tracking | None | Link rewriting, redirect endpoint | P1 | 1 day |
| A/B Testing | Template table exists | Split logic, analytics UI | P1 | 2 days |
| LinkedIn Enrichment | None | API integration | P1 | 1-2 days |
| Rate Limit Persistence | In-memory | Database table | P1 | 0.5 day |
| Bulk Operations | None | Batch endpoints, UI | P2 | 1 day |
| Export/Import | None | CSV endpoints | P2 | 0.5 day |
| Multi-user | None | Auth system, RLS policies | P2 | 3-5 days |
| Retry Logic | None | Queue table, processor | P2 | 1 day |

### 2. Value Enhancement Roadmap

```
WEEK 1-2: Foundation (P0)
├── Email Scheduling
│   ├── Add scheduled_for to emails table
│   ├── Create /api/cron/send-scheduled
│   └── Add datetime picker to email approval UI
│
└── Follow-up Sequences
    ├── Create sequences table
    ├── Add sequence_id, sequence_step to prospects
    ├── Create /api/cron/process-sequences
    └── Add sequence builder UI to /settings

WEEK 3-4: Optimization (P1)
├── Open/Click Tracking
│   ├── Create /api/track/open and /api/track/click
│   ├── Add tracking fields to emails table
│   └── Add tracking stats to /emails page
│
├── A/B Testing
│   ├── Add variant field to email_templates
│   ├── Implement random assignment in generate-email
│   └── Add comparison UI to /stats
│
└── Database Rate Limiting
    ├── Create rate_limits table
    ├── Replace in-memory tracker
    └── Add usage dashboard to /settings

WEEK 5-6: Expansion (P2)
├── LinkedIn Enrichment
│   ├── Integrate RocketReach or Apollo API
│   ├── Add to enrichment pipeline
│   └── Store contacts in prospects.enriched_contacts
│
├── Bulk Operations
│   ├── Add /api/prospects/bulk-update
│   ├── Add /api/prospects/bulk-archive
│   └── Add multi-select to prospects table UI
│
└── Export/Import
    ├── Create /api/export/prospects (CSV)
    ├── Create /api/import/prospects
    └── Add buttons to /prospects page
```

### 3. Top 5 Immediate Actions

| # | Action | Impact | Effort | Owner |
|---|--------|--------|--------|-------|
| **1** | **Implement Email Scheduling** - Add `scheduled_for` column, create cron processor, add UI datetime picker | High - Enables optimal send times, improves open rates | 1 day | Dev |
| **2** | **Build Follow-up Sequences** - Create sequences table, add cron processor, build sequence assignment UI | Very High - 3-4x reply rate improvement | 2-3 days | Dev |
| **3** | **Add Open Tracking Pixel** - Create `/api/track/open`, inject into email footer, log opens | Medium - Better engagement visibility | 0.5 day | Dev |
| **4** | **Persist Rate Limits to DB** - Create rate_limits table, replace in-memory Map, survives cold starts | Medium - Prevents quota overruns | 0.5 day | Dev |
| **5** | **Add Health/Status Endpoint** - Create `/api/health`, add to /settings page, set up uptime monitor | Low - Operational visibility | 0.5 day | Dev |

---

## Appendix: Environment Variable Reference

```bash
# Required - Database
NEXT_PUBLIC_SUPABASE_URL=https://[project].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[anon-key]
SUPABASE_SERVICE_ROLE_KEY=[service-role-key]

# Required - Primary Email (Azure)
AZURE_TENANT_ID=[tenant-id]
AZURE_CLIENT_ID=[client-id]
AZURE_CLIENT_SECRET=[secret]
AZURE_MAIL_FROM=edd@jengu.ai
AZURE_MAIL_FROM_NAME=Edward Guest

# Required - Rotation Inboxes (Spacemail)
SMTP_INBOX_1=edd@jengu.me:password:mail.spacemail.com:465:Edward Guest
SMTP_INBOX_2=edd@jengu.space:password:mail.spacemail.com:465:Edward Guest
SMTP_INBOX_3=edd@jengu.shop:password:mail.spacemail.com:465:Edward Guest
SMTP_DAILY_LIMIT=20

# Required - AI
XAI_API_KEY=[grok-api-key]

# Required - Enrichment
GOOGLE_PLACES_API_KEY=[api-key]

# Email Finder (Hunter.io - 25 searches + 50 verifications/month FREE)
HUNTER_API_KEY=[api-key]

# Optional - Mystery Shopper
GMAIL_SMTP_USER=andy.chukwuat@gmail.com
GMAIL_SMTP_PASS=[app-password]

# Optional - Fallback AI
ANTHROPIC_API_KEY=[claude-key]

# Optional - Enhanced Scraping
SCRAPERAPI_KEY=[key]
ADZUNA_APP_ID=[id]
ADZUNA_API_KEY=[key]

# Optional - Notifications
TEST_EMAIL_ADDRESS=edd.guest@gmail.com
NOTIFICATION_EMAIL=edd@jengu.ai
CRON_SECRET=[secret]
```

---

*Generated by Claude Code - Jengu Marketing Agent System Audit v1.0*
