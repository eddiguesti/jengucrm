export type ProspectTier = 'hot' | 'warm' | 'cold';

export type ProspectStage =
  | 'new'
  | 'researching'
  | 'outreach'
  | 'contacted'
  | 'engaged'
  | 'meeting'
  | 'proposal'
  | 'won'
  | 'lost';

export type PropertyType = 'hotel' | 'resort' | 'restaurant' | 'spa' | 'cruise';

export type EmailStatus =
  | 'draft'
  | 'approved'
  | 'scheduled'
  | 'sent'
  | 'opened'
  | 'replied'
  | 'bounced';

export type ActivityType =
  | 'email_sent'
  | 'email_opened'
  | 'call'
  | 'meeting'
  | 'note'
  | 'stage_change'
  | 'linkedin_message'
  | 'mystery_shopper';

export interface Prospect {
  id: string;
  name: string;
  property_type: PropertyType | null;
  city: string | null;
  country: string | null;
  region: string | null;
  full_address: string | null;
  website: string | null;
  email: string | null;
  phone: string | null;
  contact_name: string | null;
  contact_title: string | null;
  google_place_id: string | null;
  google_rating: number | null;
  google_review_count: number | null;
  google_price_level: number | null;
  google_photos: string[] | null;
  linkedin_url: string | null;
  instagram_handle: string | null;
  star_rating: number | null;
  chain_affiliation: string | null;
  estimated_rooms: number | null;
  score: number;
  score_breakdown: Record<string, number> | null;
  tier: ProspectTier;
  stage: ProspectStage;
  source: string | null;
  source_url: string | null;
  source_job_title: string | null;
  source_job_description: string | null;
  job_pain_points: {
    responsibilities?: string[];
    pain_points?: string[];
    communication_tasks?: string[];
    admin_tasks?: string[];
    speed_requirements?: string[];
    summary?: string;
  } | null;
  // Lead classification
  lead_source: LeadSource | null;
  lead_quality: 'hot' | 'warm' | 'cold' | null;
  email_confidence: 'low' | 'medium' | 'high' | null;
  pain_signal_count: number;
  // AI scoring
  ai_score: number | null;
  ai_grade: 'A' | 'B' | 'C' | 'D' | 'F' | null;
  ai_analysis: Record<string, unknown> | null;
  last_contacted_at: string | null;
  next_follow_up_at: string | null;
  notes: string | null;
  tags: string[] | null;
  created_at: string;
  updated_at: string;
  // Archive fields
  archived: boolean;
  archived_at: string | null;
  archive_reason: string | null;
}

export type EmailDirection = 'inbound' | 'outbound';

export type EmailType =
  | 'outreach'
  | 'follow_up'
  | 'mystery_shopper'
  | 'reply'
  | 'meeting_request'
  | 'not_interested'
  | 'positive_reply';

export interface Email {
  id: string;
  prospect_id: string;
  campaign_id: string | null;
  subject: string;
  body: string;
  template_id: string | null;
  personalization_notes: string | null;
  tone: string;
  status: EmailStatus;
  scheduled_for: string | null;
  sent_at: string | null;
  opened_at: string | null;
  replied_at: string | null;
  sequence_number: number;
  created_at: string;
  // New email tracking fields
  to_email: string | null;
  from_email: string | null;
  message_id: string | null;
  email_type: EmailType | null;
  direction: EmailDirection;
  thread_id: string | null;
  reply_to_id: string | null;
}

export interface EmailThread {
  thread_id: string;
  emails: Email[];
  lastActivity: string;
  hasReply: boolean;
  hasMeetingRequest: boolean;
}

export interface Notification {
  id: string;
  prospect_id: string;
  email_id: string | null;
  type: 'meeting_request' | 'positive_reply' | 'urgent';
  title: string;
  message: string | null;
  read: boolean;
  read_at: string | null;
  sent_email: boolean;
  sent_push: boolean;
  created_at: string;
}

export interface Activity {
  id: string;
  prospect_id: string;
  type: ActivityType;
  title: string;
  description: string | null;
  email_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface ScrapeRun {
  id: string;
  source: string;
  locations: string[] | null;
  job_titles: string[] | null;
  total_found: number;
  new_prospects: number;
  duplicates_skipped: number;
  errors: number;
  error_log: string[] | null;
  status: 'running' | 'completed' | 'failed';
  started_at: string;
  completed_at: string | null;
}

export interface EmailTemplate {
  id: string;
  name: string;
  description: string | null;
  subject_template: string;
  body_template: string;
  category: string | null;
  tone: string;
  times_used: number;
  open_rate: number | null;
  reply_rate: number | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PipelineStats {
  total: number;
  byTier: Record<ProspectTier, number>;
  byStage: Record<ProspectStage, number>;
  recentActivity: number;
}

// Lead source types
export type LeadSource = 'job_posting' | 'review_mining' | 'manual';

// Pain signal platforms
export type ReviewPlatform = 'tripadvisor' | 'google' | 'booking';

// Pain signal interface
export interface PainSignal {
  id: string;
  prospect_id: string;
  source_platform: ReviewPlatform;
  keyword_matched: string;
  review_snippet: string;
  review_rating: number | null;
  review_date: string | null;
  reviewer_name: string | null;
  review_url: string | null;
  detected_at: string;
  created_at: string;
}

// Review scrape log interface
export interface ReviewScrapeLog {
  id: string;
  platform: ReviewPlatform;
  location: string;
  properties_scanned: number;
  reviews_scanned: number;
  pain_signals_found: number;
  new_leads_created: number;
  errors: number;
  error_log: string[] | null;
  status: 'running' | 'completed' | 'failed';
  started_at: string;
  completed_at: string | null;
}

// Extended prospect with pain signals
export interface ProspectWithPainSignals extends Prospect {
  lead_source: LeadSource;
  pain_signal_count: number;
  pain_signals?: PainSignal[];
}

// Pain keywords by category
export const PAIN_KEYWORDS = {
  response: [
    'no response', 'never replied', 'slow response', "didn't respond",
    'no reply', "didn't reply", 'never responded', 'no answer',
    "didn't answer", 'never got back', 'still waiting', 'waiting for',
    'took days', 'took forever', 'hours to respond', 'days to respond'
  ],
  communication: [
    'ignored', 'ignored my', 'unresponsive', "couldn't reach",
    "couldn't contact", 'no one answered', 'impossible to reach',
    'hard to reach', 'poor communication', 'lack of communication',
    'no communication', 'communication issue', 'never called back'
  ],
  booking: [
    'booking issue', 'booking problem', 'reservation issue',
    'reservation problem', 'lost my booking', 'lost reservation',
    'double booked', 'overbooked', 'no record of', "couldn't find my"
  ],
  email: [
    'never emailed', "didn't email", 'no email', 'email ignored',
    'sent email', 'emailed them', 'wrote to them', 'contacted them'
  ]
} as const;

// Target locations for review mining
export const REVIEW_MINING_LOCATIONS = {
  'French Overseas': [
    'French Polynesia', 'Bora Bora', 'Tahiti', 'Moorea',
    'Martinique', 'Guadeloupe', 'La Réunion', 'Saint-Barthélemy', 'Saint-Martin'
  ],
  'Indian Ocean': [
    'Maldives', 'Mauritius', 'Seychelles', 'Zanzibar'
  ],
  'Caribbean': [
    'Turks and Caicos', 'Bahamas', 'Barbados', 'St Lucia',
    'Antigua', 'Anguilla', 'British Virgin Islands', 'Cayman Islands'
  ],
  'Mediterranean': [
    'Santorini', 'Mykonos', 'Ibiza', 'Mallorca',
    'Amalfi Coast', 'Sardinia', 'Corsica', 'Croatian Coast'
  ],
  'Alps': [
    'Courchevel', 'Megève', 'Chamonix', 'Zermatt',
    'Verbier', 'Gstaad', 'St Moritz'
  ],
  'Other Luxury': [
    'Dubai', 'Bali', 'Phuket', 'Koh Samui', 'Cabo San Lucas'
  ]
} as const;

// Premium locations for scoring
export const PREMIUM_LOCATIONS = [
  'Maldives', 'French Polynesia', 'Seychelles', 'Bora Bora',
  'Tahiti', 'Moorea', 'Saint-Barthélemy'
];

// =====================================================
// OUTREACH SYSTEM TYPES (SmartLead-style)
// =====================================================

export type MailboxStatus = 'active' | 'warming' | 'paused' | 'error';

export interface Mailbox {
  id: string;
  email: string;
  display_name: string | null;

  // SMTP Config
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_pass: string;
  smtp_secure: boolean;

  // IMAP Config
  imap_host: string | null;
  imap_port: number;
  imap_user: string | null;
  imap_pass: string | null;
  imap_secure: boolean;

  // Warmup
  warmup_enabled: boolean;
  warmup_start_date: string;
  warmup_stage: number;
  warmup_target_per_day: number;
  daily_limit: number;

  // Daily Counters
  sent_today: number;
  bounces_today: number;
  last_reset_date: string;

  // Lifetime Stats
  total_sent: number;
  total_bounces: number;
  total_replies: number;
  total_opens: number;

  // Health
  health_score: number;
  bounce_rate: number;
  reply_rate: number;
  open_rate: number;

  // Status
  status: MailboxStatus;
  last_error: string | null;
  last_error_at: string | null;
  last_used_at: string | null;

  // Verification
  smtp_verified: boolean;
  smtp_verified_at: string | null;
  imap_verified: boolean;
  imap_verified_at: string | null;

  created_at: string;
  updated_at: string;
}

export interface MailboxDailyStats {
  id: string;
  mailbox_id: string;
  date: string;
  sent: number;
  bounces: number;
  opens: number;
  replies: number;
  bounce_rate: number;
  open_rate: number;
  reply_rate: number;
  created_at: string;
}

export type CampaignLeadStatus = 'active' | 'paused' | 'completed' | 'replied' | 'bounced' | 'unsubscribed';

export interface CampaignSequence {
  id: string;
  campaign_id: string;
  step_number: number;
  delay_days: number;
  delay_hours: number;

  // A/B Testing
  variant_a_subject: string;
  variant_a_body: string;
  variant_b_subject: string | null;
  variant_b_body: string | null;
  variant_split: number;

  // AI Generation
  use_ai_generation: boolean;
  ai_prompt_context: string | null;

  // Metrics
  sent_count: number;
  variant_a_sent: number;
  variant_b_sent: number;
  open_count: number;
  variant_a_opens: number;
  variant_b_opens: number;
  reply_count: number;
  variant_a_replies: number;
  variant_b_replies: number;
  bounce_count: number;

  created_at: string;
  updated_at: string;
}

export interface CampaignLead {
  id: string;
  campaign_id: string;
  prospect_id: string;
  mailbox_id: string | null;

  // Progress
  current_step: number;
  status: CampaignLeadStatus;
  assigned_variant: 'A' | 'B' | null;

  // Timing
  last_email_at: string | null;
  next_email_at: string | null;

  // Results
  emails_sent: number;
  emails_opened: number;
  has_replied: boolean;
  replied_at: string | null;

  // Metadata
  added_by: 'manual' | 'import' | 'automation' | null;
  notes: string | null;

  created_at: string;
  updated_at: string;

  // Joined data
  prospect?: Prospect;
  mailbox?: Mailbox;
}

export type InboxItemType = 'reply' | 'auto_reply' | 'bounce' | 'unsubscribe' | 'meeting_request' | 'positive' | 'negative' | 'other';
export type InboxSentiment = 'positive' | 'neutral' | 'negative';

export interface InboxItem {
  id: string;
  mailbox_id: string;
  prospect_id: string | null;
  campaign_id: string | null;

  // Email Identifiers
  message_id: string;
  in_reply_to: string | null;
  thread_id: string | null;
  references_ids: string[] | null;

  // Sender/Recipient
  from_email: string;
  from_name: string | null;
  to_email: string;
  to_name: string | null;

  // Content
  subject: string | null;
  body_text: string | null;
  body_html: string | null;
  snippet: string | null;
  attachments: { filename: string; size: number; contentType: string }[];

  // Classification
  direction: 'inbound' | 'outbound';
  email_type: InboxItemType | null;

  // Status
  is_read: boolean;
  is_starred: boolean;
  is_archived: boolean;
  is_spam: boolean;

  // AI Analysis
  sentiment: InboxSentiment | null;
  intent: string | null;
  ai_summary: string | null;
  priority: number;

  // Timestamps
  received_at: string;
  read_at: string | null;
  replied_at: string | null;
  created_at: string;
  updated_at: string;

  // Joined data
  prospect?: Prospect;
  mailbox?: Mailbox;
  campaign?: Campaign;
}

// Basic Campaign interface
export interface Campaign {
  id: string;
  name: string;
  description: string | null;
  strategy_key: string;
  active: boolean;
  send_days: string[];
  send_time_start: number;
  send_time_end: number;
  daily_limit: number;
  emails_sent: number;
  emails_opened: number;
  replies_received: number;
  meetings_booked: number;
  open_rate: number;
  reply_rate: number;
  meeting_rate: number;
  created_at: string;
  updated_at: string;
}

export type OutboxStatus = 'scheduled' | 'sending' | 'sent' | 'failed' | 'cancelled';

export interface OutboxItem {
  id: string;
  mailbox_id: string;
  prospect_id: string;
  campaign_id: string | null;
  campaign_lead_id: string | null;
  sequence_step: number | null;

  // Content
  to_email: string;
  to_name: string | null;
  subject: string;
  body_text: string | null;
  body_html: string | null;

  // Variant
  variant: 'A' | 'B' | null;

  // Scheduling
  scheduled_for: string | null;
  status: OutboxStatus;

  // Result
  message_id: string | null;
  sent_at: string | null;
  error_message: string | null;
  retry_count: number;

  // Tracking
  opened_at: string | null;
  clicked_at: string | null;
  replied_at: string | null;

  created_at: string;
  updated_at: string;
}

// Extended Campaign type for sequence campaigns
export interface SequenceCampaign {
  id: string;
  name: string;
  description: string | null;
  strategy_key: string;
  type: 'legacy' | 'sequence';
  active: boolean;

  // Scheduling
  send_days: string[];
  send_time_start: number;
  send_time_end: number;
  daily_limit: number;
  timezone: string;

  // Sequence
  sequence_count: number;
  default_mailbox_id: string | null;
  ab_testing_enabled: boolean;

  // Lead Counts
  leads_count: number;
  active_leads: number;
  completed_leads: number;

  // Metrics
  emails_sent: number;
  emails_opened: number;
  replies_received: number;
  meetings_booked: number;
  open_rate: number;
  reply_rate: number;
  meeting_rate: number;

  created_at: string;
  updated_at: string;

  // Joined data
  sequences?: CampaignSequence[];
  default_mailbox?: Mailbox;
}

// Input types for creating/updating
export interface CreateMailboxInput {
  email: string;
  display_name?: string;
  smtp_host: string;
  smtp_port?: number;
  smtp_user: string;
  smtp_pass: string;
  smtp_secure?: boolean;
  imap_host?: string;
  imap_port?: number;
  imap_user?: string;
  imap_pass?: string;
  imap_secure?: boolean;
  warmup_enabled?: boolean;
  warmup_target_per_day?: number;
}

export interface CreateSequenceInput {
  campaign_id: string;
  step_number: number;
  delay_days?: number;
  delay_hours?: number;
  variant_a_subject: string;
  variant_a_body: string;
  variant_b_subject?: string;
  variant_b_body?: string;
  variant_split?: number;
  use_ai_generation?: boolean;
  ai_prompt_context?: string;
}

export interface CreateCampaignLeadInput {
  campaign_id: string;
  prospect_id: string;
  mailbox_id?: string;
  added_by?: 'manual' | 'import' | 'automation';
}

// Analytics types
export interface OutreachAnalytics {
  totalMailboxes: number;
  activeMailboxes: number;
  totalCampaigns: number;
  activeCampaigns: number;
  totalLeads: number;
  activeLeads: number;

  // Email metrics
  totalSent: number;
  totalOpens: number;
  totalReplies: number;
  totalBounces: number;

  // Rates
  overallOpenRate: number;
  overallReplyRate: number;
  overallBounceRate: number;

  // Inbox
  unreadCount: number;
  priorityCount: number;

  // Warmup
  warmingMailboxes: number;
  averageHealthScore: number;
}
