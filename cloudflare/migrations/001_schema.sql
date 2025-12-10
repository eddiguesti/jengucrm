-- Jengu CRM - D1 Database Schema
-- Run with: wrangler d1 execute jengu-crm --file=./migrations/001_schema.sql

-- =============================================
-- PROSPECTS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS prospects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  city TEXT,
  country TEXT,
  property_type TEXT,

  -- Contact Info
  contact_name TEXT,
  contact_email TEXT,
  contact_title TEXT,
  phone TEXT,
  website TEXT,

  -- Social
  linkedin_url TEXT,
  instagram_url TEXT,

  -- Pipeline
  stage TEXT DEFAULT 'new' CHECK (stage IN ('new', 'enriching', 'enriched', 'ready', 'contacted', 'engaged', 'meeting', 'won', 'lost')),
  tier TEXT DEFAULT 'cold' CHECK (tier IN ('hot', 'warm', 'cold')),
  score INTEGER DEFAULT 0,

  -- Source
  lead_source TEXT DEFAULT 'manual',
  source_url TEXT,
  source_job_title TEXT,
  job_pain_points TEXT, -- JSON

  -- Enrichment
  research_notes TEXT,
  tags TEXT, -- JSON array

  -- Timestamps
  last_contacted_at TEXT,
  last_replied_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),

  -- Flags
  archived INTEGER DEFAULT 0,
  email_verified INTEGER DEFAULT 0,
  email_bounced INTEGER DEFAULT 0
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_prospects_stage ON prospects(stage);
CREATE INDEX IF NOT EXISTS idx_prospects_tier ON prospects(tier);
CREATE INDEX IF NOT EXISTS idx_prospects_lead_source ON prospects(lead_source);
CREATE INDEX IF NOT EXISTS idx_prospects_archived ON prospects(archived);
CREATE INDEX IF NOT EXISTS idx_prospects_email ON prospects(contact_email);
CREATE INDEX IF NOT EXISTS idx_prospects_score ON prospects(score DESC);
CREATE INDEX IF NOT EXISTS idx_prospects_created ON prospects(created_at DESC);

-- Composite index for email eligibility query
CREATE INDEX IF NOT EXISTS idx_prospects_eligible ON prospects(stage, archived, contact_email, email_bounced);

-- =============================================
-- EMAILS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS emails (
  id TEXT PRIMARY KEY,
  prospect_id TEXT REFERENCES prospects(id) ON DELETE CASCADE,
  campaign_id TEXT,

  -- Content
  subject TEXT NOT NULL,
  body TEXT NOT NULL,

  -- Addresses
  to_email TEXT,
  from_email TEXT,

  -- Threading
  message_id TEXT UNIQUE,
  in_reply_to TEXT,
  thread_id TEXT,

  -- Type
  direction TEXT DEFAULT 'outbound' CHECK (direction IN ('inbound', 'outbound')),
  email_type TEXT CHECK (email_type IN ('outreach', 'follow_up', 'reply', 'auto_reply')),

  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'opened', 'clicked', 'replied', 'bounced', 'orphan')),

  -- Timestamps
  sent_at TEXT,
  opened_at TEXT,
  clicked_at TEXT,
  replied_at TEXT,
  bounced_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_emails_prospect ON emails(prospect_id);
CREATE INDEX IF NOT EXISTS idx_emails_campaign ON emails(campaign_id);
CREATE INDEX IF NOT EXISTS idx_emails_direction ON emails(direction);
CREATE INDEX IF NOT EXISTS idx_emails_status ON emails(status);
CREATE INDEX IF NOT EXISTS idx_emails_sent_at ON emails(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_emails_to ON emails(to_email);

-- =============================================
-- CAMPAIGNS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  strategy_key TEXT NOT NULL UNIQUE,
  description TEXT,

  -- Status
  active INTEGER DEFAULT 1,

  -- Scheduling
  daily_limit INTEGER DEFAULT 20,

  -- Metrics
  emails_sent INTEGER DEFAULT 0,
  emails_opened INTEGER DEFAULT 0,
  emails_clicked INTEGER DEFAULT 0,
  replies_received INTEGER DEFAULT 0,
  meetings_booked INTEGER DEFAULT 0,

  -- Timestamps
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- =============================================
-- ACTIVITIES TABLE (Audit Log)
-- =============================================
CREATE TABLE IF NOT EXISTS activities (
  id TEXT PRIMARY KEY,
  prospect_id TEXT REFERENCES prospects(id) ON DELETE CASCADE,

  type TEXT NOT NULL,
  title TEXT,
  description TEXT,
  metadata TEXT, -- JSON

  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_activities_prospect ON activities(prospect_id);
CREATE INDEX IF NOT EXISTS idx_activities_type ON activities(type);
CREATE INDEX IF NOT EXISTS idx_activities_created ON activities(created_at DESC);

-- =============================================
-- PAIN SIGNALS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS pain_signals (
  id TEXT PRIMARY KEY,
  prospect_id TEXT REFERENCES prospects(id) ON DELETE CASCADE,

  source_platform TEXT NOT NULL,
  keyword_matched TEXT NOT NULL,
  review_snippet TEXT,
  review_rating REAL,
  review_date TEXT,
  review_url TEXT,

  detected_at TEXT DEFAULT (datetime('now')),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pain_signals_prospect ON pain_signals(prospect_id);
CREATE INDEX IF NOT EXISTS idx_pain_signals_platform ON pain_signals(source_platform);
