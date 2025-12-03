# Functional Improvements: Prospect Readiness System

## The Core Problem

**Current state**: You can see a prospect's **score** (lead quality) but not their **readiness** (can I email them now?).

**Questions users can't easily answer:**
- Which prospects are ready for outreach RIGHT NOW?
- Which prospects need enrichment before I can email them?
- What's missing from each prospect?
- How much work until this lead is actionable?

---

## The Solution: Battery Indicator System

### Visual Concept

```
┌─────────────────────────────────────────────────────────────┐
│  PROSPECT LIST - Ready to Email                             │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ ████████████████████████ The Ritz London              │ │
│  │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ 95%                          │ │
│  │ ★★★★★ 4.8 · London · Hot · Score: 87                   │ │
│  │ ✓ Email · ✓ Contact · ✓ Website · ✓ Enriched          │ │
│  │                                        [Generate Email] │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ ████████████████░░░░░░░░ Four Seasons Dubai           │ │
│  │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░ 68%                          │ │
│  │ ★★★★★ 4.9 · Dubai · Hot · Score: 92                    │ │
│  │ ✓ Email · ✗ Contact · ✓ Website · ✓ Enriched          │ │
│  │                                        [Enrich Data]    │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ ████████░░░░░░░░░░░░░░░░ Grand Hotel Barcelona        │ │
│  │ ▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░ 35%                          │ │
│  │ ★★★★☆ 4.2 · Barcelona · Warm · Score: 54               │ │
│  │ ✗ Email · ✗ Contact · ✓ Website · ✗ Enriched          │ │
│  │                                        [Start Research] │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Battery Levels Meaning

| Level | Range | Meaning | Action |
|-------|-------|---------|--------|
| 🟢 Full | 90-100% | **Email Ready** - All data present, high confidence | Generate & Send |
| 🟡 High | 70-89% | **Almost Ready** - Minor gaps, usable | Quick enrich then send |
| 🟠 Medium | 50-69% | **Needs Work** - Key data missing | Run enrichment |
| 🔴 Low | 30-49% | **Research Needed** - Significant gaps | Full research required |
| ⚫ Empty | 0-29% | **New Lead** - Minimal data | Start from scratch |

---

## Readiness Score Calculation

### Component Breakdown (100 points total)

```
CONTACT (40 pts)
├── Has email                    15 pts
├── Email is verified/high conf  10 pts (bonus)
├── Has contact name             10 pts
└── Has contact title             5 pts

PROPERTY (25 pts)
├── Has website                  10 pts
├── Has Google Place ID          10 pts
└── Has star rating               5 pts

ENRICHMENT (25 pts)
├── Has Google rating             5 pts
├── Has review count              5 pts
├── Has social links              5 pts
├── Has full address              5 pts
└── Has chain classification      5 pts

RESEARCH (10 pts)
├── Has notes (50+ chars)         5 pts
└── Has tags (2+)                 5 pts
```

### Readiness Tiers

```typescript
type ReadinessTier =
  | 'email_ready'      // 90-100%: Can email now
  | 'almost_ready'     // 70-89%: Quick action needed
  | 'needs_enrichment' // 50-69%: Run enrichment
  | 'needs_research'   // 30-49%: Significant work
  | 'new_lead';        // 0-29%: Start fresh
```

---

## Enhanced Prospect List Design

### List View with Actions

```
┌─────────────────────────────────────────────────────────────────────────┐
│  PROSPECTS                                           [+ Add] [⚡ Bulk]  │
├─────────────────────────────────────────────────────────────────────────┤
│  Filter: [All ▾] [Email Ready ▾] [Hot ▾] [New ▾]    Search: [________] │
│  Sort: [Readiness ▾] [Score ▾] [Recent ▾]           Showing 47 of 234   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─ EMAIL READY (12) ────────────────────────────────────────────────┐  │
│  │                                                                    │  │
│  │  [████████████] The Ritz London                    Score: 87 HOT  │  │
│  │       95%       j.smith@ritz.com · GM · 4.8★                      │  │
│  │                 London, UK · Luxury Chain         [Generate Email] │  │
│  │                                                                    │  │
│  │  [████████████] Mandarin Oriental Paris            Score: 91 HOT  │  │
│  │       92%       m.dupont@mo.com · Director · 4.9★                 │  │
│  │                 Paris, FR · Luxury Chain          [Generate Email] │  │
│  │                                                                    │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌─ ALMOST READY (8) ─────────────────────────────────────────────────┐  │
│  │                                                                    │  │
│  │  [████████░░░░] Four Seasons Dubai                Score: 92 HOT   │  │
│  │       72%       info@fs.com · No contact · 4.9★                   │  │
│  │                 Dubai, UAE · Luxury Chain         [Find Contact]   │  │
│  │                 ⚠ Missing: Contact name, personal email            │  │
│  │                                                                    │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌─ NEEDS ENRICHMENT (15) ────────────────────────────────────────────┐  │
│  │                                                                    │  │
│  │  [████░░░░░░░░] Grand Hotel Barcelona             Score: 54 WARM  │  │
│  │       38%       No email · No contact · 4.2★                      │  │
│  │                 Barcelona, ES · Independent       [Enrich Now]     │  │
│  │                 ⚠ Missing: Email, contact, social links            │  │
│  │                                                                    │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Key Features

1. **Grouped by Readiness** - See what's actionable at a glance
2. **Battery Indicator** - Visual progress bar on every prospect
3. **Smart CTA** - Button changes based on what's needed next
4. **Missing Data Callout** - Shows exactly what's missing
5. **Quick Filters** - Filter by readiness tier instantly

---

## Action-Oriented Dashboard

Replace the current home page with an action-focused command center:

```
┌─────────────────────────────────────────────────────────────────────────┐
│  COMMAND CENTER                                      Mon, Dec 1, 2025   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─ YOUR QUEUE ──────────────────────────────────────────────────────┐  │
│  │                                                                    │  │
│  │  ⚡ 12 prospects ready to email                    [Send Batch →]  │  │
│  │  🔍  8 prospects need quick enrichment            [Enrich All →]  │  │
│  │  📬  3 replies waiting for response               [View Inbox →]  │  │
│  │  📅  2 meetings scheduled this week               [View Cal →]    │  │
│  │                                                                    │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌─ PIPELINE HEALTH ─────────────┐ ┌─ AUTOMATION STATUS ─────────────┐  │
│  │                               │ │                                  │  │
│  │  New        ████████ 45      │ │  Scraper      ● Running (2/5)    │  │
│  │  Research   ██████░░ 32      │ │  Enrichment   ○ Idle             │  │
│  │  Outreach   ████░░░░ 18      │ │  Email Queue  ● 12 pending       │  │
│  │  Engaged    ██░░░░░░  8      │ │  Reply Check  ● 3m ago           │  │
│  │  Meeting    █░░░░░░░  3      │ │                                  │  │
│  │  Won        █░░░░░░░  2      │ │  [Run Scraper] [Check Replies]   │  │
│  │                               │ │                                  │  │
│  └───────────────────────────────┘ └──────────────────────────────────┘  │
│                                                                          │
│  ┌─ TOP PRIORITIES ──────────────────────────────────────────────────┐  │
│  │                                                                    │  │
│  │  1. [████████████] The Ritz London · Hot 87 · Email Ready         │  │
│  │     Last contact: Never · In pipeline: 3 days    [Generate Email] │  │
│  │                                                                    │  │
│  │  2. [████████████] Park Hyatt Tokyo · Hot 84 · Email Ready        │  │
│  │     Last contact: Never · In pipeline: 5 days    [Generate Email] │  │
│  │                                                                    │  │
│  │  3. [████████░░░░] St. Regis NYC · Hot 89 · Missing Contact       │  │
│  │     Score high but no personal contact           [Find Contact]   │  │
│  │                                                                    │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌─ RECENT ACTIVITY ─────────────────────────────────────────────────┐  │
│  │                                                                    │  │
│  │  2m ago   📬 Reply from Grand Hyatt Singapore                     │  │
│  │  15m ago  ✉️  Email sent to The Peninsula HK                       │  │
│  │  1h ago   🔍 Enriched 5 new prospects                             │  │
│  │  2h ago   📥 Scraper found 12 new leads                           │  │
│  │                                                                    │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Functional Improvements Summary

### 1. Readiness System
- Calculate readiness score (0-100%) for every prospect
- Show battery indicator on all prospect views
- Group/filter prospects by readiness tier
- Show exactly what's missing for each prospect

### 2. Smart CTAs
- Button text changes based on prospect state
- "Generate Email" for email-ready
- "Find Contact" for missing contact
- "Enrich Now" for needs enrichment
- "Start Research" for new leads

### 3. Action Queue Dashboard
- Show counts by actionability
- "12 ready to email" → One-click batch action
- "8 need enrichment" → One-click bulk enrich
- Prioritized list of top actions

### 4. Missing Data Callouts
- Show what's missing inline
- "⚠ Missing: Contact name, personal email"
- Clickable to jump to enrichment

### 5. Progress Tracking
- Days in current stage
- Days since last contact
- Stale lead indicators (>7 days same stage)

### 6. Bulk Actions
- Select multiple prospects
- Bulk enrich, bulk email, bulk stage change
- Bulk archive stale leads

---

## Implementation Priority

### Phase 1: Core Readiness System
1. Create readiness calculation utility
2. Build BatteryIndicator component
3. Add to prospect list and cards

### Phase 2: Enhanced Prospect List
1. Grouped view by readiness
2. Smart CTAs per prospect
3. Missing data callouts
4. Filters and sorting

### Phase 3: Action Dashboard
1. Queue counts and quick actions
2. Top priorities list
3. Pipeline health view
4. Recent activity feed

### Phase 4: Bulk Operations
1. Multi-select on prospect list
2. Bulk action dropdown
3. Batch email sending
4. Batch enrichment
