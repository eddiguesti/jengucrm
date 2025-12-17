/**
 * Cloudflare Worker Environment Bindings
 * Production Architecture
 */
export interface Env {
  // D1 Database
  DB: D1Database;

  // KV Namespaces
  KV_CONFIG: KVNamespace;
  KV_CACHE: KVNamespace;

  // Durable Objects
  WARMUP_COUNTER: DurableObjectNamespace;
  INBOX_STATE: DurableObjectNamespace;
  RATE_LIMITER: DurableObjectNamespace;
  PROSPECT_DEDUP: DurableObjectNamespace;

  // Supabase (for mailboxes table - UI stores mailbox configs here)
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;

  // AI API Keys (at least one required)
  GROK_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  OPENAI_API_KEY?: string;

  // Email Sending - Resend (recommended, $0 for first 3k/month)
  RESEND_API_KEY?: string;

  // Azure (optional - currently disabled)
  AZURE_TENANT_ID?: string;
  AZURE_CLIENT_ID?: string;
  AZURE_CLIENT_SECRET?: string;
  AZURE_MAIL_FROM?: string;

  // Email enrichment (optional)
  HUNTER_API_KEY?: string;
  APOLLO_API_KEY?: string;
  MILLIONVERIFIER_API_KEY?: string;

  // Web scraping (for DDG search from Cloudflare)
  SCRAPERAPI_KEY?: string;

  // Google Custom Search API (100 queries/day FREE, then $5 per 1000)
  // Higher quality results than Brave, use sparingly
  GOOGLE_SEARCH_API_KEY?: string;
  GOOGLE_SEARCH_CX?: string; // Custom Search Engine ID

  // Brave Search API keys (free tier: 2k/month each, rotate for 3x rate)
  BRAVE_SEARCH_API_KEY?: string;   // Primary key
  BRAVE_SEARCH_API_KEY_2?: string; // Secondary key
  BRAVE_SEARCH_API_KEY_3?: string; // Tertiary key

  // Proxy URLs for each Brave API key (optional - for IP rotation)
  // Format: https://proxy-user:pass@proxy-host:port OR https://proxy-service.com/fetch?url=
  PROXY_URL_1?: string; // Used with BRAVE_SEARCH_API_KEY
  PROXY_URL_2?: string; // Used with BRAVE_SEARCH_API_KEY_2
  PROXY_URL_3?: string; // Used with BRAVE_SEARCH_API_KEY_3

  // Vercel DDG Proxy URL (free - uses existing Vercel deployment)
  VERCEL_SEARCH_URL?: string; // e.g., https://crm.jengu.ai/api/search
  // Optional shared secret for the Vercel DDG proxy
  // If set, Cloudflare will send `Authorization: Bearer ...` to `/api/search`
  VERCEL_SEARCH_SECRET?: string;

  // Next.js/Vercel app URL (for triggering Supabase-backed jobs like Sales Navigator enrichment)
  // Example: https://your-app.vercel.app
  VERCEL_APP_URL?: string;
  // Secret must match the Next.js `CRON_SECRET` (sent as Authorization: Bearer ...)
  VERCEL_CRON_SECRET?: string;

  // Alerts (Slack/Discord webhook)
  ALERT_WEBHOOK_URL?: string;

  // SMTP Inboxes (format: email|password|host|port|displayName)
  SMTP_INBOX_1?: string;
  SMTP_INBOX_2?: string;
  SMTP_INBOX_3?: string;
  SMTP_INBOX_4?: string;

  // Email forwarding - forward all inbound emails to this address
  // So you can see them in your Spacemail inbox too
  EMAIL_FORWARD_TO?: string;
}

/**
 * Domain Types
 */
export interface RawProspect {
  name: string;
  city: string;
  country?: string;
  jobTitle?: string;
  jobDescription?: string;
  sourceUrl?: string;
  website?: string;
}

export interface Prospect {
  id: string;
  name: string;
  city: string;
  country: string | null;
  propertyType: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactTitle: string | null;
  phone: string | null;
  website: string | null;
  stage: ProspectStage;
  tier: ProspectTier;
  score: number;
  leadSource: string;
  sourceUrl: string | null;
  sourceJobTitle: string | null;
  jobPainPoints: JobPainPoints | null;
  researchNotes: string | null;
  tags: string[];
  lastContactedAt: string | null;
  lastRepliedAt: string | null;
  archived: boolean;
  emailVerified: boolean;
  emailBounced: boolean;
  createdAt: string;
  updatedAt: string;
  // Website scraper data for personalization
  starRating: number | null;
  chainAffiliation: string | null;
  estimatedRooms: number | null;
  googleRating: number | null;
  googleReviewCount: number | null;
}

export type ProspectStage =
  | 'new'
  | 'enriching'
  | 'enriched'
  | 'ready'
  | 'contacted'
  | 'engaged'
  | 'meeting'
  | 'won'
  | 'lost';

export type ProspectTier = 'hot' | 'warm' | 'cold';

export interface JobPainPoints {
  summary?: string;
  communicationTasks?: string[];
  adminTasks?: string[];
  speedRequirements?: string[];
}

export interface InboundEmail {
  messageId: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  receivedAt: string;
  inReplyTo?: string;
}

export interface Email {
  id: string;
  prospectId: string;
  campaignId: string | null;
  subject: string;
  body: string;
  toEmail: string;
  fromEmail: string;
  messageId: string | null;
  inReplyTo: string | null;
  direction: 'inbound' | 'outbound';
  emailType: 'outreach' | 'follow_up' | 'reply';
  status: 'pending' | 'sent' | 'delivered' | 'opened' | 'replied' | 'bounced';
  sentAt: string | null;
  openedAt: string | null;
  repliedAt: string | null;
  bouncedAt: string | null;
  createdAt: string;
}

export interface Campaign {
  id: string;
  name: string;
  strategyKey: string;
  description: string;
  active: boolean;
  dailyLimit: number;
  emailsSent: number;
  emailsOpened: number;
  repliesReceived: number;
  meetingsBooked: number;
}

export type CampaignStrategy =
  | 'authority_scarcity'
  | 'curiosity_value'
  | 'cold_direct'
  | 'cold_pattern_interrupt'
  | 'simple_personalized';

/**
 * Reply Analysis Types
 */
export type ReplyIntent =
  | 'meeting_request'
  | 'interested'
  | 'needs_info'
  | 'not_interested'
  | 'delegation'
  | 'out_of_office'
  | 'unclear';

export interface ReplyAnalysis {
  intent: ReplyIntent;
  confidence: number;
  sentiment: 'positive' | 'neutral' | 'negative';
  urgency: 'high' | 'medium' | 'low';
  entities: {
    proposedTimes?: string[];
    alternateContact?: { name?: string; email?: string; role?: string };
    decisionMaker?: string;
    timeline?: string;
  };
  recommendedAction: 'schedule_call' | 'send_info' | 'follow_up_later' | 'contact_alternate' | 'archive' | 'manual_review';
  summary: string;
}

/**
 * Inbox Types
 */
export interface InboxConfig {
  id: string;
  provider: 'azure' | 'smtp';
  email: string;
  displayName: string;
  host?: string;
  port?: number;
  password?: string;
}

export interface InboxStatus {
  id: string;
  provider: 'azure' | 'smtp';
  email: string;
  displayName: string;
  healthy: boolean;
  dailySent: number;
  dailyLimit: number;
  lastError: string | null;
  lastErrorAt: number | null;
  warmupDay: number;
  createdAt: number;
}

/**
 * Warmup Types
 */
export interface WarmupStatus {
  allowed: boolean;
  sent: number;
  limit: number;
  warmupDay: number;
  retryAfter: number;
}

/**
 * AI Provider Types
 */
export interface GeneratedEmail {
  subject: string;
  body: string;
  provider: string;
  latencyMs: number;
}

/**
 * Scraper Types
 */
export interface ScraperResult {
  prospects: RawProspect[];
  source: string;
  scrapedAt: number;
  errors: string[];
}

/**
 * Failed Task (stored in D1 for retry)
 */
export interface FailedTask {
  id: string;
  type: 'send_email' | 'enrich' | 'find_email';
  prospectId: string;
  data: string; // JSON
  error: string;
  attempts: number;
  maxAttempts: number;
  nextRetryAt: string;
  createdAt: string;
}

/**
 * Supabase Mailbox (from mailboxes table in Supabase)
 * This is the source of truth for mailbox configuration
 */
export interface SupabaseMailbox {
  id: string;
  email: string;
  display_name: string;
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_pass: string;
  smtp_secure: boolean;
  imap_host: string | null;
  imap_port: number | null;
  imap_user: string | null;
  imap_pass: string | null;
  imap_secure: boolean;
  warmup_enabled: boolean;
  warmup_start_date: string;
  warmup_stage: number;
  warmup_target_per_day: number;
  daily_limit: number;
  sent_today: number;
  bounces_today: number;
  last_reset_date: string;
  total_sent: number;
  total_bounces: number;
  total_replies: number;
  total_opens: number;
  health_score: number;
  bounce_rate: number;
  reply_rate: number;
  open_rate: number;
  status: 'active' | 'warming' | 'paused' | 'error';
  last_error: string | null;
  last_error_at: string | null;
  last_used_at: string | null;
  smtp_verified: boolean;
  imap_verified: boolean;
  created_at: string;
  updated_at: string;
}
