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
