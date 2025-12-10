# Jengu CRM - Complete System Documentation

> **AI-Powered B2B Sales Automation Platform for Hotel Outreach**
>
> Generated: December 2024 | Version: 2.0 (Comprehensive Analysis)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [How the System Works](#how-the-system-works)
3. [Technical Architecture](#technical-architecture)
4. [Directory Structure](#directory-structure)
5. [Complete File-by-File Documentation](#complete-file-by-file-documentation)
6. [Database Schema](#database-schema)
7. [API Reference](#api-reference)
8. [Cron Jobs & Automation Pipeline](#cron-jobs--automation-pipeline)
9. [Data Flow Diagrams](#data-flow-diagrams)
10. [Recommended Improvements](#recommended-improvements)
11. [Quick Reference Commands](#quick-reference-commands)

---

## Executive Summary

### What is Jengu CRM?

Jengu CRM is an **AI-powered B2B sales automation system** specifically designed for the hospitality industry. It automates the entire outreach pipeline from lead discovery to meeting booking, targeting hotels, resorts, and hospitality properties.

### What Problem Does It Solve?

Traditional B2B sales in hospitality requires:
- Manual lead research across job boards and directories
- Time-consuming contact discovery for General Managers
- Writing personalized emails one-by-one
- Following up manually with non-responders
- Tracking engagement across multiple prospects

**Jengu automates all of this:**
- Scrapes 13+ job boards for hotel hiring signals
- Mines TripAdvisor/Google reviews for pain signals
- Finds and validates GM email addresses
- Generates AI-personalized cold emails (Grok/Claude)
- Sends emails at human-like intervals
- Auto-responds to replies with psychology-optimized messaging
- Tracks everything in a unified dashboard

### Why Was It Built?

The system was built to:
1. **Scale outreach** - Send 80+ personalized emails/day automatically
2. **Improve targeting** - Use hiring signals and pain points for relevance
3. **Increase response rates** - AI-personalized messages, not templates
4. **Reduce manual work** - Full automation from lead to meeting
5. **Maintain compliance** - Warmup schedules, bounce detection, reputation tracking

### Key Metrics

| Metric | Value |
|--------|-------|
| Daily email capacity | 80 emails (4 inboxes x 20) |
| Job boards monitored | 13+ |
| Campaign strategies | 4 (A/B testing) |
| Prospect scoring dimensions | 5 |
| AI response time | < 30 seconds |
| Email validation layers | 7 |

### Technology Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | Next.js 14 (App Router), React, TypeScript, Tailwind CSS |
| **Backend** | Next.js API Routes, Server Actions |
| **Database** | Supabase (PostgreSQL) with Row Level Security |
| **AI Services** | X.AI Grok (email generation), Anthropic Claude (analysis) |
| **Email** | Azure Graph API, SMTP rotation (4 inboxes), Gmail |
| **Hosting** | Vercel (frontend + serverless functions) |
| **External Cron** | cron-job.org for high-frequency jobs |

---

## How the System Works

### Step-by-Step Workflow

#### 1. Lead Acquisition (Daily at 7am UTC)

The system acquires leads from two primary sources:

**Job Board Scraping:**
```
Morning cron triggers -> 13 scrapers run in parallel
   |-- Hosco, HCareers, HotelCareer, TalentsHotels
   |-- JournalDesPalaces, HospitalityOnline, HotelJobs, eHotelier
   |-- Indeed (optional), Adzuna (optional)
   +-- LinkedIn, Glassdoor (limited)
        |
Extract: Hotel name, city, job title, job description
        |
Filter: Remove kitchen staff, housekeeping, chain HQs
        |
AI: Extract pain points from job descriptions (Grok)
        |
Create prospect with stage='new', tier based on signals
```

**Review Mining:**
```
Cron triggers -> Rotate through 14 markets + 2 platforms
   |-- TripAdvisor scraper
   +-- Google Places API
        |
Find: Hotels with communication/service complaints
        |
Extract: Pain keywords, review snippets, ratings
        |
Create prospect with lead_source='review_mining', tier='warm'
```

#### 2. Enrichment Pipeline

Every new prospect goes through enrichment:

```
Prospect (stage='new')
        |
Website Scrape:
   |-- Team page analysis (JSON-LD, regex patterns)
   |-- Email extraction (prioritize GM emails)
   |-- Phone numbers, social links
   |-- Star rating, room count, chain affiliation
   +-- Amenities (spa, pool, restaurant)
        |
Contact Finding:
   |-- Step 1: Website team members
   |-- Step 2: Google search for GM names
   |-- Step 3: Name validation (filter fake names)
   |-- Step 4: WHOIS lookup (optional)
   +-- Step 5: Best match selection + email generation
        |
Email Finding (7 steps):
   |-- Website scrape results
   |-- Apollo.io search (free API)
   |-- Decision-maker role matching
   |-- Email pattern discovery
   |-- Permutation generation (10 patterns)
   |-- MillionVerifier validation
   +-- Confidence scoring
        |
Scoring (0-100 scale):
   |-- Contact Quality (35 pts): Email, name, phone
   |-- Online Presence (25 pts): Website, LinkedIn, Instagram
   |-- Property Quality (30 pts): Stars, chain tier
   |-- Market Tier (15 pts): Premium cities bonus
   +-- Hiring Signals (20 pts): GM/Director roles bonus
        |
AI Research Notes (Grok):
   Generate 200-word sales-ready research summary
        |
Update prospect: stage='researching', score, tier, tags
```

#### 3. Email Sending (Every 5 min, 8am-6pm Mon-Sat)

```
Cron triggers /api/cron/hourly-email
        |
Random 30% skip (human-like gaps)
        |
Check warmup limit (80/day max)
        |
Find eligible prospects:
   |-- stage IN ['new', 'researching']
   |-- not archived
   |-- has email (not null)
   |-- score >= minimum threshold
   |-- not already contacted
   +-- within business hours (prospect's timezone)
        |
Filter emails:
   |-- Reject fake patterns (test@, admin@)
   |-- Reject generic corporate (info@, reservations@)
   |-- Reject role-based (support@, sales@)
   +-- Validate: syntax, MX, MillionVerifier, bounce history
        |
Generate AI email:
   |-- Load campaign strategy (4 options)
   |-- Build prospect context (name, city, pain points)
   |-- Call Grok/Claude with personalization prompt
   +-- Parse JSON response {subject, body}
        |
Send email:
   |-- Primary: Microsoft Graph API (edd@jengu.ai)
   +-- Fallback: SMTP rotation (4 Spacemail inboxes)
        |
Record:
   |-- Save to emails table
   |-- Update prospect stage -> 'contacted'
   |-- Log activity
   +-- Increment campaign counter
        |
Stagger delay: 30-90 seconds random
        |
Repeat for next prospect (max 1 per cron run)
```

#### 4. Reply Handling (Every 1 min)

```
Cron triggers /api/cron/check-replies
        |
Check all inboxes in parallel:
   |-- Azure Graph API (edd@jengu.ai)
   |-- IMAP (Spacemail inboxes)
   +-- Gmail (mystery shopper personas)
        |
For each new email:
   |-- Skip if from our own inboxes
   +-- Match to prospect (4 strategies):
      |-- Direct to_email match
      |-- Message-ID threading
      |-- Subject line matching
      +-- Prospect email lookup
        |
AI Analysis (intent classification):
   |-- meeting_request -> Update stage='meeting', notify
   |-- interested -> Update stage='engaged', send AI reply
   |-- needs_info -> Send helpful AI reply
   |-- not_interested -> Archive prospect
   |-- delegation -> Archive, create new prospect
   +-- out_of_office -> Archive (auto-reply)
        |
Instant AI Reply (< 30 seconds):
   Psychology-optimized response using:
   |-- Curiosity gaps (Zeigarnik Effect)
   |-- Loss aversion framing
   |-- Authority positioning
   |-- Reciprocity (offer value first)
   |-- Scarcity (limited availability)
   +-- Social proof
        |
Record: Save inbound email, update prospect, log activity
```

#### 5. Follow-Up System (10am UTC Mon-Fri)

```
Cron triggers /api/cron/follow-up
        |
Find prospects:
   |-- stage = 'contacted'
   |-- last_contacted_at > 3 days ago
   |-- no reply received
   +-- < MAX_FOLLOW_UPS (3)
        |
Generate follow-up email:
   |-- Day 3: Gentle nudge
   |-- Day 5: Value add
   +-- Day 7+: Final attempt
        |
Send and record (same as initial send)
```

---

## Technical Architecture

### System Diagram

```
+-------------------------------------------------------------------------+
|                           EXTERNAL TRIGGERS                              |
+-------------------------------------------------------------------------+
|  Vercel Cron (7am UTC)           cron-job.org (5-min intervals)         |
|  +-- /api/cron/daily             |-- /api/cron/hourly-email             |
|                                  |-- /api/cron/check-replies            |
|                                  |-- /api/cron/sales-nav-enrichment     |
|                                  +-- /api/cron/follow-up                |
+-------------------------------------------------------------------------+
                                     |
                                     v
+-------------------------------------------------------------------------+
|                            API LAYER (Next.js)                           |
+-------------------------------------------------------------------------+
|  src/app/api/                                                            |
|  |-- cron/*          Scheduled automation endpoints                      |
|  |-- auto-email      Send outreach emails                                |
|  |-- check-replies   Process inbound emails                              |
|  |-- enrich          Enrichment pipeline                                 |
|  |-- prospects       CRUD operations                                     |
|  |-- campaigns       Campaign management                                 |
|  +-- stats           Dashboard analytics                                 |
+-------------------------------------------------------------------------+
                                     |
                                     v
+-------------------------------------------------------------------------+
|                           SERVICE LAYER                                  |
+-------------------------------------------------------------------------+
|  src/services/                                                           |
|  |-- email.service.ts      Email generation, filtering, sending         |
|  |-- campaign.service.ts   Campaign stats, daily limits                  |
|  +-- stats.service.ts      Dashboard statistics                          |
+-------------------------------------------------------------------------+
                                     |
                                     v
+-------------------------------------------------------------------------+
|                           CORE LIBRARIES                                 |
+-------------------------------------------------------------------------+
|  src/lib/                                                                |
|  |-- ai-gateway.ts         AI orchestration (Grok/Claude)                |
|  |-- email/                Email infrastructure                          |
|  |   |-- send.ts           Azure Graph + SMTP sending                    |
|  |   |-- verification.ts   Validation + bounce detection                 |
|  |   |-- finder/           Email discovery (7-step process)              |
|  |   +-- imap.ts           Inbox monitoring                              |
|  |-- enrichment/           Lead enrichment                               |
|  |   |-- website-scraper   Hotel website analysis                        |
|  |   |-- contact-finder    Decision-maker discovery                      |
|  |   +-- scoring.ts        Lead scoring (5 dimensions)                   |
|  |-- scrapers/             Job board scrapers (13+)                      |
|  |-- constants.ts          Configuration, patterns, limits               |
|  +-- config.ts             Environment variables                         |
+-------------------------------------------------------------------------+
                                     |
                                     v
+-------------------------------------------------------------------------+
|                          REPOSITORY LAYER                                |
+-------------------------------------------------------------------------+
|  src/repositories/                                                       |
|  |-- prospect.repository.ts    Prospect CRUD + filtering                 |
|  |-- email.repository.ts       Email records + stats                     |
|  |-- campaign.repository.ts    Campaign management                       |
|  +-- activity.repository.ts    Activity logging                          |
+-------------------------------------------------------------------------+
                                     |
                                     v
+-------------------------------------------------------------------------+
|                          DATA LAYER                                      |
+-------------------------------------------------------------------------+
|  Supabase (PostgreSQL)                                                   |
|  |-- prospects          Hotel contacts + enrichment data                 |
|  |-- emails             All sent/received emails                         |
|  |-- activities         Audit trail                                      |
|  |-- campaigns          A/B test strategies                              |
|  |-- pain_signals       Review-mined pain points                         |
|  +-- rate_limits        API rate limiting                                |
+-------------------------------------------------------------------------+
                                     |
                                     v
+-------------------------------------------------------------------------+
|                       EXTERNAL INTEGRATIONS                              |
+-------------------------------------------------------------------------+
|  Email Sending          AI Generation           Email Finding            |
|  |-- Azure Graph API    |-- Grok (x.ai)         |-- Apollo.io            |
|  |-- SMTP (Spacemail)   +-- Claude (Anthropic)  |-- Hunter.io            |
|  +-- Gmail (Mystery)                            +-- MillionVerifier      |
|                                                                          |
|  Job Boards             Review Mining           Other                    |
|  |-- Hosco, HCareers    |-- TripAdvisor         |-- Google Places        |
|  |-- Indeed, Adzuna     +-- Google Reviews      +-- WHOIS (Verisign)     |
|  +-- LinkedIn, etc.                                                      |
+-------------------------------------------------------------------------+
```

---

## Directory Structure

```
marketing-agent/
|-- src/
|   |-- app/                          # Next.js App Router
|   |   |-- api/                      # API Routes (50+)
|   |   |   |-- cron/                 # Scheduled Jobs (10)
|   |   |   |   |-- daily/            # Master daily pipeline
|   |   |   |   |-- hourly-email/     # Email sending (every 5 min)
|   |   |   |   |-- check-replies/    # Reply monitoring
|   |   |   |   |-- follow-up/        # Follow-up emails
|   |   |   |   |-- sales-nav-enrichment/  # Email finding
|   |   |   |   |-- mystery-shopper/  # Contact discovery
|   |   |   |   |-- scrape-jobs/      # Job board scraping
|   |   |   |   |-- mine-reviews/     # Review mining
|   |   |   |   |-- rescore/          # Weekly scoring
|   |   |   |   +-- re-engage/        # Cleanup/re-queue
|   |   |   |-- auto-email/           # Send emails endpoint
|   |   |   |-- check-replies/        # Process replies
|   |   |   |-- enrich/               # Enrichment endpoint
|   |   |   |-- prospects/            # Prospect CRUD
|   |   |   |-- campaigns/            # Campaign management
|   |   |   |-- emails/               # Email records
|   |   |   +-- stats/                # Analytics
|   |   +-- (pages)/                  # UI Pages (8)
|   |       |-- page.tsx              # Dashboard
|   |       |-- prospects/            # Prospect list/detail
|   |       |-- emails/               # Email history
|   |       |-- campaigns/            # Campaign management
|   |       |-- sales-navigator/      # Import UI
|   |       |-- pipeline/             # Automation dashboard
|   |       |-- analytics/            # Analytics
|   |       +-- settings/             # Configuration
|   |
|   |-- lib/                          # Core Libraries (60+ files)
|   |   |-- ai-gateway.ts             # AI orchestration
|   |   |-- constants.ts              # All configuration
|   |   |-- config.ts                 # Environment handling
|   |   |-- campaign-strategies.ts    # Email strategies (428 lines)
|   |   |-- reply-analysis.ts         # AI reply analysis (325 lines)
|   |   |-- scoring.ts                # Lead scoring
|   |   |-- supabase.ts               # Database client
|   |   |-- logger.ts                 # Logging (pino)
|   |   |-- email/                    # Email subsystem
|   |   |   |-- send.ts               # Multi-provider sending
|   |   |   |-- azure.ts              # Azure Graph API
|   |   |   |-- smtp-rotation.ts      # SMTP inbox rotation
|   |   |   |-- verification.ts       # Email validation
|   |   |   |-- tracking.ts           # Open/click tracking
|   |   |   |-- finder/               # Email discovery
|   |   |   |   |-- index.ts          # Main entry
|   |   |   |   |-- services.ts       # External APIs
|   |   |   |   |-- patterns.ts       # Email patterns
|   |   |   |   +-- domain-analyzer.ts
|   |   |   |-- imap.ts               # Inbox monitoring
|   |   |   +-- mystery-shopper-responder.ts
|   |   |-- enrichment/               # Lead enrichment
|   |   |   |-- index.ts              # Main entry
|   |   |   |-- auto-enrich.ts        # Pipeline (373 lines)
|   |   |   |-- website-scraper.ts    # Website analysis
|   |   |   |-- contact-finder.ts     # Contact discovery
|   |   |   |-- email-finder.ts       # Email finding
|   |   |   +-- scoring.ts            # Lead scoring
|   |   +-- scrapers/                 # Job board scrapers (13)
|   |       |-- index.ts              # Scraper registry
|   |       |-- hosco.ts              # Hosco scraper
|   |       |-- hcareers.ts           # HCareers scraper
|   |       |-- indeed.ts             # Indeed scraper
|   |       |-- adzuna.ts             # Adzuna scraper
|   |       |-- caterer.ts            # Caterer scraper
|   |       |-- simplyhired.ts
|   |       |-- glassdoor.ts
|   |       |-- hospitalityonline.ts
|   |       |-- thecaterer.ts
|   |       |-- jobtoday.ts
|   |       |-- totaljobs.ts
|   |       |-- jobsite.ts
|   |       +-- linkedin.ts
|   |
|   |-- services/                     # Service Layer
|   |   |-- email.service.ts          # Email orchestration
|   |   |-- campaign.service.ts       # Campaign management
|   |   +-- stats.service.ts          # Dashboard stats
|   |
|   |-- repositories/                 # Data Access Layer
|   |   |-- base.repository.ts        # Base CRUD operations
|   |   |-- prospect.repository.ts    # Prospect queries (223 lines)
|   |   |-- email.repository.ts       # Email queries
|   |   |-- campaign.repository.ts    # Campaign queries
|   |   +-- activity.repository.ts    # Activity queries
|   |
|   |-- components/                   # UI Components
|   |   |-- ui/                       # shadcn/ui components
|   |   |-- layout/                   # Header, sidebar
|   |   |-- prospects/                # Prospect components
|   |   +-- emails/                   # Email components
|   |
|   +-- types/                        # TypeScript definitions
|       +-- index.ts                  # All type definitions
|
|-- supabase/
|   +-- migrations/                   # Database migrations
|       |-- 001_initial.sql           # Core schema
|       |-- 002_review_mining.sql     # Pain signals
|       +-- 003_campaigns.sql         # Campaign A/B testing
|
|-- scripts/                          # Utility Scripts (15+)
|   |-- check-db.ts                   # Database status
|   |-- check-today-emails.ts         # Email activity
|   |-- import-sales-nav.ts           # Sales Nav import
|   |-- test-grok-email.ts            # Test AI generation
|   |-- debug-auto-email.ts           # Debug email sending
|   +-- cleanup-chains-and-dupes.ts   # Data cleanup
|
|-- docs/                             # Documentation
|   +-- SYSTEM_DOCUMENTATION.md       # This file
|
|-- CLAUDE.md                         # AI assistant context
|-- README.md                         # Quick start guide
|-- vercel.json                       # Vercel cron config
+-- package.json                      # Dependencies
```

---

## Complete File-by-File Documentation

### Core Configuration Files

| File | Purpose | Key Contents |
|------|---------|--------------|
| `src/lib/constants.ts` | Central configuration | Warmup schedule, email patterns, rate limits, timeouts |
| `src/lib/config.ts` | Environment handling | API keys, feature flags validation |
| `vercel.json` | Deployment config | Vercel cron schedule (daily at 7am UTC) |
| `CLAUDE.md` | AI assistant context | System overview for Claude Code |

### Campaign Strategies (`src/lib/campaign-strategies.ts`)

**Size:** 428 lines

**Exported Interfaces:**
```typescript
interface ProspectContext {
  name: string;
  city: string | null;
  country: string | null;
  propertyType: string | null;
  jobTitle?: string | null;
  contactName?: string | null;
  painSignals?: { keyword: string; snippet: string }[];
  jobPainPoints?: {
    summary?: string;
    communicationTasks?: string[];
    adminTasks?: string[];
    speedRequirements?: string[];
  };
}

interface CampaignStrategy {
  key: string;
  name: string;
  description: string;
  generatePrompt: (prospect: ProspectContext) => string;
}
```

**Four Strategies Defined:**

| Strategy Key | Name | Style | Word Count | Psychology |
|--------------|------|-------|------------|------------|
| `authority_scarcity` | Direct & Confident | Short, punchy, authority-first | 70-90 | Loss aversion, scarcity, "But You Are Free" |
| `curiosity_value` | Pattern Interrupt + Vulnerable | Vulnerability opener, labeling | 70-90 | Pattern interrupt, negative reverse |
| `cold_direct` | Cold: Direct & Human | Human, awkward, forward request | 80-100 | Vulnerability, qualifying CTA |
| `cold_pattern_interrupt` | Cold: Pattern Interrupt | Self-aware, direct | 80-100 | Honest opener, curiosity hook |

**Usage:**
- Job board leads -> `authority_scarcity` OR `curiosity_value`
- Sales Navigator leads -> `cold_direct` OR `cold_pattern_interrupt`

### Reply Analysis (`src/lib/reply-analysis.ts`)

**Size:** 325 lines

**Exported Types:**
```typescript
interface ReplyAnalysis {
  intent: 'meeting_request' | 'interested' | 'needs_info' | 'not_interested' | 'delegation' | 'out_of_office' | 'unclear';
  confidence: number; // 0-100
  sentiment: 'positive' | 'neutral' | 'negative';
  urgency: 'high' | 'medium' | 'low';
  entities: {
    proposedTimes?: string[];
    alternateContact?: { name?: string; email?: string; role?: string };
    decisionMaker?: string;
    timeline?: string;
    competitor?: string;
  };
  objection?: {
    type: 'budget' | 'timing' | 'authority' | 'need' | 'competitor' | 'other';
    detail: string;
    canOvercome: boolean;
  };
  recommendedAction: 'schedule_call' | 'send_info' | 'follow_up_later' | 'contact_alternate' | 'archive' | 'manual_review';
  actionReason: string;
  summary: string;
  keyPoints: string[];
}
```

**Exported Functions:**
- `analyzeReplyWithAI(subject, body, context)` -> `ReplyAnalysis`
- `analyzeRepliesBatch(replies[])` -> `ReplyAnalysis[]`
- `getActionPriority(analysis)` -> number (0-120)
- `getSuggestedResponseType(analysis)` -> string

**Fallback Keywords:**
- Meeting: 'meet', 'meeting', 'call', 'schedule', 'calendly', 'demo', 'chat'
- Not Interested: 'not interested', 'no thank', 'unsubscribe', 'remove me'
- Delegation: 'speak to', 'contact my', 'forwarding to', 'in charge of'
- Out of Office: 'out of office', 'on vacation', 'away from', 'return on'

### Auto-Email Route (`src/app/api/auto-email/route.ts`)

**Size:** 513 lines

**Endpoint:** `POST /api/auto-email`

**Request Body:**
```typescript
{
  max_emails?: number;     // Default: 1
  strategy_key?: string;   // Override campaign strategy
  dry_run?: boolean;       // Preview without sending
  prospect_ids?: string[]; // Specific prospects to email
}
```

**Response:**
```typescript
{
  success: boolean;
  sent: number;
  skipped: number;
  errors: number;
  warmup_limit: number;
  remaining_today: number;
  details: Array<{
    prospectId: string;
    prospectName: string;
    email: string;
    status: 'sent' | 'skipped' | 'error';
    reason?: string;
    campaign?: string;
    subject?: string;
  }>;
}
```

**Logic Flow:**
1. Check warmup limit (80/day max)
2. Query eligible prospects
3. Filter by email quality (reject generic/bounced)
4. Match to campaign strategy based on lead source
5. Generate email with Grok AI
6. Send via Azure Graph or SMTP rotation
7. Update prospect stage to 'contacted'
8. Log activity

### Daily Cron Route (`src/app/api/cron/daily/route.ts`)

**Size:** 250 lines

**Endpoint:** `GET /api/cron/daily`

**Schedule:** 7:00 AM UTC (via Vercel cron)

**Pipeline Steps:**
```
1. scrape-jobs (all 13 sources)
2. enrich-new (website + email discovery)
3. mine-reviews (pain signal detection)
4. check-replies (inbox monitoring)
5. send-follow-ups (Day 3, 7, 14)
6. cleanup (remove duplicates, bounces)
7. report (daily summary email)
```

### Repository Layer

#### `prospect.repository.ts` (223 lines)

```typescript
class ProspectRepository extends BaseRepository<Prospect> {
  // Find prospects ready for email
  findEligibleForEmail(limit: number): Promise<Prospect[]>

  // Find by complex filters
  findWithFilters(filters: ProspectFilters): Promise<Prospect[]>

  // Batch operations
  batchUpdateStage(ids: string[], stage: Stage): Promise<void>

  // Statistics
  getStatsByTier(): Promise<TierStats>
  getStatsByStage(): Promise<StageStats>
  getStatsBySource(): Promise<SourceStats>

  // Email-specific queries
  findNeedingFollowUp(days: number): Promise<Prospect[]>
  findNeedingEnrichment(): Promise<Prospect[]>
}
```

### Job Board Scrapers

| File | Source | Method | Key Features |
|------|--------|--------|--------------|
| `hosco.ts` | hosco.com | HTML scraping | Extracts from `__NEXT_DATA__` JSON |
| `hcareers.ts` | hcareers.com | HTML scraping | Logo alt tags for hotel names |
| `indeed.ts` | indeed.com | ScraperAPI | Requires SCRAPERAPI_KEY |
| `adzuna.ts` | adzuna.com | REST API | Requires API keys |
| `caterer.ts` | caterer.com | HTML scraping | UK hospitality |
| `simplyhired.ts` | simplyhired.com | HTML scraping | Job aggregator |
| `glassdoor.ts` | glassdoor.com | HTML scraping | Limited access |
| `hospitalityonline.ts` | hospitalityonline.com | HTML scraping | US hospitality |
| `thecaterer.ts` | thecaterer.com | HTML scraping | UK trade publication |
| `jobtoday.ts` | jobtoday.com | HTML scraping | European jobs |
| `totaljobs.ts` | totaljobs.com | HTML scraping | UK job board |
| `jobsite.ts` | jobsite.co.uk | HTML scraping | UK job board |
| `linkedin.ts` | Sales Navigator | Manual CSV import | Premium data |

---

## Database Schema

### Core Tables

#### `prospects`
```sql
CREATE TABLE prospects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Identity
  name TEXT NOT NULL,                    -- Hotel name
  city TEXT,
  country TEXT,
  property_type TEXT,                    -- hotel, hostel, resort, boutique, luxury

  -- Contact Information
  contact_name TEXT,
  contact_email TEXT,
  contact_title TEXT,
  phone TEXT,
  website TEXT,

  -- Enrichment Data
  star_rating INTEGER,
  room_count INTEGER,
  chain_affiliation TEXT,
  google_rating DECIMAL(2,1),
  linkedin_url TEXT,
  instagram_url TEXT,
  research_notes TEXT,

  -- Pipeline Status
  stage TEXT DEFAULT 'new',              -- new, enriched, contacted, engaged, meeting, won, lost
  tier TEXT DEFAULT 'cold',              -- hot, warm, cold
  score INTEGER DEFAULT 0,               -- 0-100

  -- Source Tracking
  lead_source TEXT DEFAULT 'job_posting', -- job_posting, sales_navigator, review_mining
  source_url TEXT,
  source_job_title TEXT,
  job_pain_points JSONB,
  pain_signal_count INTEGER DEFAULT 0,

  -- Metadata
  tags TEXT[],
  notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_contacted_at TIMESTAMPTZ,
  last_replied_at TIMESTAMPTZ,

  -- Flags
  archived BOOLEAN DEFAULT false,
  email_verified BOOLEAN DEFAULT false,
  email_bounced BOOLEAN DEFAULT false
);

-- Indexes
CREATE INDEX idx_prospects_stage ON prospects(stage);
CREATE INDEX idx_prospects_tier ON prospects(tier);
CREATE INDEX idx_prospects_lead_source ON prospects(lead_source);
CREATE INDEX idx_prospects_archived ON prospects(archived);
CREATE INDEX idx_prospects_email ON prospects(contact_email);
```

#### `emails`
```sql
CREATE TABLE emails (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  prospect_id UUID REFERENCES prospects(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES campaigns(id),

  -- Content
  subject TEXT NOT NULL,
  body TEXT NOT NULL,

  -- Direction & Type
  direction TEXT DEFAULT 'outbound',     -- outbound, inbound
  email_type TEXT,                       -- outreach, follow_up, reply, mystery_shopper

  -- Addresses
  to_email TEXT,
  from_email TEXT,

  -- Threading
  message_id TEXT UNIQUE,
  in_reply_to TEXT,
  thread_id TEXT,

  -- Status
  status TEXT DEFAULT 'pending',         -- pending, sent, delivered, opened, replied, bounced

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  replied_at TIMESTAMPTZ,
  bounced_at TIMESTAMPTZ,

  -- Tracking
  tracking_id TEXT,
  open_count INTEGER DEFAULT 0
);

-- Indexes
CREATE INDEX idx_emails_prospect ON emails(prospect_id);
CREATE INDEX idx_emails_campaign ON emails(campaign_id);
CREATE INDEX idx_emails_direction ON emails(direction);
CREATE INDEX idx_emails_status ON emails(status);
CREATE INDEX idx_emails_sent_at ON emails(sent_at);
```

#### `campaigns`
```sql
CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Identity
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  strategy_key TEXT NOT NULL UNIQUE,     -- authority_scarcity, curiosity_value, etc.

  -- Status
  active BOOLEAN DEFAULT true,

  -- Scheduling
  send_days TEXT[] DEFAULT ARRAY['monday','tuesday','wednesday','thursday','friday'],
  send_time_start INTEGER DEFAULT 9,     -- Hour in UTC
  send_time_end INTEGER DEFAULT 17,
  daily_limit INTEGER DEFAULT 20,

  -- Metrics (auto-updated)
  emails_sent INTEGER DEFAULT 0,
  emails_opened INTEGER DEFAULT 0,
  replies_received INTEGER DEFAULT 0,
  meetings_booked INTEGER DEFAULT 0,

  -- Calculated Rates
  open_rate DECIMAL(5,2) DEFAULT 0,
  reply_rate DECIMAL(5,2) DEFAULT 0,
  meeting_rate DECIMAL(5,2) DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Default campaigns
INSERT INTO campaigns (name, description, strategy_key, active, daily_limit) VALUES
  ('Direct & Confident', 'Short (70-90 words), punchy, authority-first', 'authority_scarcity', true, 20),
  ('Pattern Interrupt + Vulnerable', 'Vulnerability opener, labeling', 'curiosity_value', true, 20),
  ('Cold: Direct & Human', 'Human, awkward, forward request', 'cold_direct', true, 20),
  ('Cold: Pattern Interrupt', 'Self-aware, direct', 'cold_pattern_interrupt', true, 20);
```

#### `pain_signals`
```sql
CREATE TABLE pain_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID REFERENCES prospects(id) ON DELETE CASCADE,

  -- Source
  source_platform TEXT NOT NULL,         -- tripadvisor, google, booking
  keyword_matched TEXT NOT NULL,

  -- Review Data
  review_snippet TEXT NOT NULL,
  review_rating DECIMAL(2,1),
  review_date DATE,
  reviewer_name TEXT,
  review_url TEXT,

  -- Timestamps
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_pain_signals_prospect ON pain_signals(prospect_id);
CREATE INDEX idx_pain_signals_platform ON pain_signals(source_platform);
CREATE INDEX idx_pain_signals_keyword ON pain_signals(keyword_matched);
```

#### `activities`
```sql
CREATE TABLE activities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  prospect_id UUID REFERENCES prospects(id) ON DELETE CASCADE,

  -- Activity Data
  type TEXT NOT NULL,                    -- email_sent, email_opened, reply_received, stage_change
  title TEXT,
  description TEXT,
  metadata JSONB,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index
CREATE INDEX idx_activities_prospect ON activities(prospect_id);
CREATE INDEX idx_activities_type ON activities(type);
CREATE INDEX idx_activities_created ON activities(created_at DESC);
```

---

## API Reference

### Prospect Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/prospects` | List prospects with filters | Session |
| GET | `/api/prospects/[id]` | Get prospect detail | Session |
| POST | `/api/prospects` | Create prospect | Session |
| PATCH | `/api/prospects/[id]` | Update prospect | Session |
| DELETE | `/api/prospects/[id]` | Delete prospect | Session |
| POST | `/api/prospects/[id]/enrich` | Trigger enrichment | Session |

**Query Parameters for GET /api/prospects:**
```
stage: string           # Filter by stage
tier: string            # Filter by tier
lead_source: string     # Filter by source
archived: boolean       # Include archived
search: string          # Full-text search
page: number            # Pagination
limit: number           # Results per page
sort: string            # Sort field
order: 'asc' | 'desc'   # Sort order
```

### Email Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/emails` | List emails | Session |
| GET | `/api/emails/[id]` | Get email detail | Session |
| POST | `/api/auto-email` | Send automated emails | Cron/Session |
| POST | `/api/test-email` | Send test email | Session |
| POST | `/api/simulate-email` | Preview without sending | Session |

### Campaign Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/campaigns` | List campaigns | Session |
| GET | `/api/campaigns/[id]` | Get campaign detail | Session |
| POST | `/api/campaigns` | Create campaign | Session |
| PATCH | `/api/campaigns/[id]` | Update campaign | Session |
| GET | `/api/campaigns/[id]/stats` | Get campaign metrics | Session |

### Stats Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/stats` | Dashboard statistics | Session |
| GET | `/api/stats/emails` | Email metrics | Session |
| GET | `/api/stats/campaigns` | Campaign performance | Session |
| GET | `/api/stats/pipeline` | Pipeline funnel stats | Session |

### Cron Endpoints

| Method | Endpoint | Auth Header |
|--------|----------|-------------|
| GET | `/api/cron/daily` | `Authorization: Bearer {CRON_SECRET}` |
| GET | `/api/cron/hourly-email` | `Authorization: Bearer {CRON_SECRET}` |
| GET | `/api/cron/check-replies` | `Authorization: Bearer {CRON_SECRET}` |
| GET | `/api/cron/follow-up` | `Authorization: Bearer {CRON_SECRET}` |
| GET | `/api/cron/sales-nav-enrichment` | `Authorization: Bearer {CRON_SECRET}` |
| GET | `/api/cron/mystery-shopper` | `Authorization: Bearer {CRON_SECRET}` |
| GET | `/api/cron/rescore` | `Authorization: Bearer {CRON_SECRET}` |
| GET | `/api/cron/re-engage` | `Authorization: Bearer {CRON_SECRET}` |

---

## Cron Jobs & Automation Pipeline

### Vercel Cron (vercel.json)

```json
{
  "crons": [
    {
      "path": "/api/cron/daily",
      "schedule": "0 7 * * *"
    }
  ]
}
```

### External Cron (cron-job.org)

| Job | URL | Schedule | Notes |
|-----|-----|----------|-------|
| Hourly Email | `/api/cron/hourly-email` | `*/5 8-18 * * 1-5` | Business hours, Mon-Fri |
| Check Replies | `/api/cron/check-replies` | `*/1 * * * *` | Every minute, 24/7 |
| Sales Nav Enrichment | `/api/cron/sales-nav-enrichment` | `*/5 * * * *` | Every 5 min |
| Follow-up | `/api/cron/follow-up` | `0 10 * * 1-5` | 10am UTC Mon-Fri |
| Mystery Shopper | `/api/cron/mystery-shopper` | `0 */2 8-20 * *` | Every 2 hours, 8am-8pm |
| Rescore | `/api/cron/rescore` | `0 6 * * *` | 6am UTC daily |
| Re-engage | `/api/cron/re-engage` | `0 9 * * 1` | 9am UTC Monday |

### Complete System Timeline

```
DAILY SCHEDULE (Mon-Sat)

00:00 -----------------------------------------------------------------
       |
05:00  |  [SUNDAY ONLY] re-engage: Archive stale, re-queue failed
       |
06:00  |  [SUNDAY ONLY] rescore: Re-calculate all prospect scores
       |
07:00  |  * DAILY MASTER CRON:
       |    |-- scrape-jobs: Run 13 job board scrapers
       |    |-- enrich: Website scrape + contact finding
       |    |-- mine-reviews: TripAdvisor + Google pain signals
       |    |-- check-replies: Process any overnight emails
       |    +-- cleanup: Clear expired cache
       |
08:00 -|------------------------------------------------------------------
       |  EMAIL SENDING WINDOW OPENS
       |
       |  Every 5 minutes: hourly-email
       |    +-- Send 1 email (with 30% random skip)
       |
       |  Every 1 minute: check-replies
       |    +-- Monitor all inboxes, process replies
       |
       |  Every 15 minutes: sales-nav-enrichment
       |    +-- Find emails for Sales Nav leads
       |
       |  Every 30 minutes: mystery-shopper
       |    +-- Send 0-3 discovery inquiries
       |
10:00  |  follow-up: Send follow-up nudge emails
       |
       |  [Continue email sending]
       |
18:00 -|------------------------------------------------------------------
       |  EMAIL SENDING WINDOW CLOSES
       |
       |  Continue: check-replies, sales-nav-enrichment
       |
20:00  |  mystery-shopper window closes
       |
24:00 -----------------------------------------------------------------
```

### Rate Limits and Safeguards

| Limit | Value | Enforcement |
|-------|-------|-------------|
| Daily email cap | 80 | Warmup schedule in constants.ts |
| Per-inbox limit | 20 | SMTP rotation tracking |
| Campaign daily limit | Configurable | Database check before send |
| Random skip rate | 30% | Human-like sending gaps |
| Business hours | 9am-5pm | Prospect timezone check |
| Stagger delay | 30-90s | Between consecutive emails |

---

## Data Flow Diagrams

### Email Sending Flow

```
CRON (every 5 min)
       |
       v
+------------------+    30%     +------------------+
| Random Skip?     |----------->| Skip this cycle  |
+------------------+            +------------------+
       | 70%
       v
+------------------+            +------------------+
| Warmup check     |---limit--->| "Limit reached"  |
+------------------+  reached   +------------------+
       | OK
       v
+------------------+            +------------------+
| Query prospects  |---none---->| "No prospects"   |
| stage, score,    |   found    +------------------+
| email not null   |
+------------------+
       | found
       v
+------------------+
| Filter already   |
| emailed          |
+------------------+
       |
       v
+------------------+            +------------------+
| Reject patterns: |            |                  |
| - fake emails    |----skip--->| Skip prospect    |
| - generic emails |            |                  |
| - outside hours  |            +------------------+
+------------------+
       | pass
       v
+------------------+
| canSendTo()      |
| - syntax         |
| - disposable     |----block-->  Log "blocked"
| - bounced        |
| - MillionVerifier|
+------------------+
       | valid
       v
+------------------+
| Generate email   |
| (Grok/Claude AI) |
+------------------+
       |
       v
+------------------+
| Send via         |
| Azure/SMTP       |----error-->  Log "failed", continue
+------------------+
       | success
       v
+------------------+
| Save to DB:      |
| - emails table   |
| - prospect stage |
| - activity log   |
| - campaign count |
+------------------+
       |
       v
+------------------+
| Stagger delay    |
| (30-90 seconds)  |
+------------------+
       |
       v
    COMPLETE
```

### Reply Handling Flow

```
CRON (every 1 min)
       |
       v
+--------------------------------------------------+
| Check all inboxes in PARALLEL:                    |
| |-- Azure Graph API (edd@jengu.ai)               |
| |-- IMAP (Spacemail inboxes 1-4)                 |
| +-- Gmail (mystery shopper personas)             |
+--------------------------------------------------+
       |
       v
+------------------+
| For each email:  |
| Skip if from us  |
| Skip if exists   |
+------------------+
       |
       v
+--------------------------------------------------+
| Match to prospect (4 strategies):                 |
| 1. Direct to_email match (we sent to them)       |
| 2. Message-ID threading (In-Reply-To header)     |
| 3. Subject line matching (Re: stripped)          |
| 4. Prospect email lookup (direct match)          |
+--------------------------------------------------+
       | matched
       v
+--------------------------------------------------+
| AI Intent Analysis:                               |
| |-- meeting_request -> Stage='meeting', notify   |
| |-- interested -> Stage='engaged', AI reply      |
| |-- needs_info -> AI reply with info             |
| |-- not_interested -> Archive prospect           |
| |-- delegation -> Archive, create new prospect   |
| +-- out_of_office -> Archive (auto-reply)        |
+--------------------------------------------------+
       |
       v
+--------------------------------------------------+
| If positive intent:                               |
| |-- Generate instant AI reply (< 30s)            |
| |   |-- Curiosity gap technique                  |
| |   |-- Loss aversion framing                    |
| |   |-- Authority positioning                    |
| |   +-- Call-to-action for meeting               |
| +-- Send from SAME inbox (thread continuity)     |
+--------------------------------------------------+
       |
       v
+------------------+
| Record:          |
| - Save inbound   |
| - Update status  |
| - Log activity   |
+------------------+
```

---

## Recommended Improvements

### 1. Architecture

#### Split Large Files
- **Issue:** `auto-email/route.ts` is 513 lines with mixed concerns
- **Fix:** Extract into dedicated modules:
  ```
  src/lib/email/
  |-- eligibility.ts      # Prospect filtering
  |-- generation.ts       # AI email generation
  |-- sending.ts          # Multi-provider sending
  +-- warmup.ts           # Warmup logic
  ```

#### Event-Driven Architecture
- **Issue:** Direct function calls create tight coupling
- **Fix:** Implement event bus for:
  - `prospect.created` -> trigger enrichment
  - `email.sent` -> update campaign metrics
  - `reply.received` -> trigger analysis

### 2. Code Quality

#### Type Safety
- **Issue:** Some `any` types in API responses
- **Fix:** Add strict return types:
  ```typescript
  type ApiResponse<T> =
    | { success: true; data: T }
    | { success: false; error: string }
  ```

#### Error Handling
- **Issue:** Inconsistent error handling across endpoints
- **Fix:** Centralized error handler with proper error types

#### Logging
- **Issue:** Inconsistent logging patterns
- **Fix:** Structured logging with correlation IDs

### 3. Performance

#### Database Queries
- **Issue:** N+1 queries in prospect listing
- **Fix:** Use Supabase joins and batch operations

#### Caching
- **Issue:** No caching for frequently accessed data
- **Fix:** Add Redis/Upstash for:
  - Campaign settings
  - Warmup counters
  - Rate limit tracking

### 4. Reliability

#### Retry Logic
- **Issue:** No retry on transient failures
- **Fix:** Add exponential backoff for:
  - Email sending
  - AI API calls
  - External API integrations

#### Circuit Breaker
- **Issue:** API failures cascade
- **Fix:** Circuit breaker for external APIs

### 5. Monitoring

#### Add Metrics
- Email send success rate
- AI generation latency
- Enrichment pipeline throughput
- Reply detection accuracy

#### Add Alerts
- Warmup limit approaching
- Bounce rate spike
- AI API errors
- Cron job failures

### 6. Security

#### Rate Limiting
- **Issue:** No API rate limiting
- **Fix:** Add rate limiting middleware

#### Input Validation
- **Fix:** Ensure all API inputs are validated with Zod schemas

---

## Quick Reference Commands

```bash
# Check today's email activity
npx tsx scripts/check-today-emails.ts

# Debug why emails aren't sending
npx tsx scripts/debug-auto-email-filter.ts

# Test AI email generation
npx tsx scripts/test-grok-email.ts

# Import Sales Navigator leads
npx tsx scripts/import-sales-nav.ts <csv-file>

# Check database status
npx tsx scripts/check-db.ts

# Run development server
npm run dev

# Test cron endpoint manually
curl https://crm.jengu.ai/api/cron/hourly-email \
  -H "Authorization: Bearer $CRON_SECRET"

# Send test email
curl -X POST https://crm.jengu.ai/api/auto-email \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"max_emails": 1, "dry_run": true}'
```

---

## Environment Variables Reference

```bash
# Required - Database
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbG...
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...

# Required - Email (Azure)
AZURE_TENANT_ID=xxx
AZURE_CLIENT_ID=xxx
AZURE_CLIENT_SECRET=xxx
AZURE_MAIL_FROM=edd@jengu.ai

# Required - AI
XAI_API_KEY=xai-xxx
ANTHROPIC_API_KEY=sk-ant-xxx

# Required - Cron Auth
CRON_SECRET=xxx

# Optional - Email Finding
HUNTER_API_KEY=xxx
APOLLO_API_KEY=xxx
MILLIONVERIFIER_API_KEY=xxx

# Optional - SMTP Rotation
SMTP_INBOX_1=email|pass|host|port|name
SMTP_INBOX_2=...
SMTP_INBOX_3=...
SMTP_INBOX_4=...

# Optional - Mystery Shopper
GMAIL_SMTP_USER=xxx
GMAIL_SMTP_PASS=xxx

# Optional - Features
TIMEZONE_AWARE_SENDING=true
AUTO_REPLY_ENABLED=false
```

---

*Documentation generated via comprehensive codebase analysis*
*Version: 2.0 | Last Updated: December 2024*
*Codebase: Jengu CRM Marketing Agent*
