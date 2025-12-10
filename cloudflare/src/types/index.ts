/**
 * Cloudflare Worker Environment Bindings
 * Free Tier Architecture - No Queues, No R2
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

  // Secrets (set via wrangler secret put)
  GROK_API_KEY: string;
  ANTHROPIC_API_KEY: string;
  OPENAI_API_KEY?: string;
  AZURE_TENANT_ID: string;
  AZURE_CLIENT_ID: string;
  AZURE_CLIENT_SECRET: string;
  AZURE_MAIL_FROM: string;
  HUNTER_API_KEY?: string;
  APOLLO_API_KEY?: string;
  MILLIONVERIFIER_API_KEY?: string;
  ALERT_WEBHOOK_URL?: string;

  // SMTP Inboxes (format: email|password|host|port|displayName)
  SMTP_INBOX_1?: string;
  SMTP_INBOX_2?: string;
  SMTP_INBOX_3?: string;
  SMTP_INBOX_4?: string;
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
  | 'cold_pattern_interrupt';

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
