import { z } from 'zod';

/**
 * Zod schemas for API input validation
 * Ensures type-safe input handling across all endpoints
 */

// ============================================
// COMMON SCHEMAS
// ============================================

export const uuidSchema = z.string().uuid();

export const emailSchema = z.string().email().max(255);

export const paginationSchema = z.object({
  limit: z.coerce.number().min(1).max(1000).default(50),
  offset: z.coerce.number().min(0).default(0),
});

// ============================================
// PROSPECT SCHEMAS
// ============================================

export const prospectTierSchema = z.enum(['hot', 'warm', 'cold']);

export const prospectStageSchema = z.enum([
  'new', 'researching', 'outreach', 'contacted',
  'engaged', 'meeting', 'proposal', 'won', 'lost'
]);

export const propertyTypeSchema = z.enum([
  'hotel', 'resort', 'restaurant', 'spa', 'cruise'
]);

export const createProspectSchema = z.object({
  name: z.string().min(1).max(255),
  property_type: propertyTypeSchema.optional(),
  city: z.string().max(100).optional(),
  country: z.string().max(100).optional(),
  website: z.string().url().optional().or(z.literal('')),
  email: emailSchema.optional().or(z.literal('')),
  phone: z.string().max(50).optional(),
  contact_name: z.string().max(255).optional(),
  contact_title: z.string().max(255).optional(),
  notes: z.string().max(5000).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  source: z.string().max(50).optional(),
});

export const updateProspectSchema = createProspectSchema.partial().extend({
  tier: prospectTierSchema.optional(),
  stage: prospectStageSchema.optional(),
  score: z.number().min(0).max(100).optional(),
  archived: z.boolean().optional(),
  archive_reason: z.string().max(500).optional(),
});

export const prospectFiltersSchema = z.object({
  tier: prospectTierSchema.optional(),
  stage: prospectStageSchema.optional(),
  search: z.string().max(255).optional(),
  tags: z.string().max(50).optional(),
  ...paginationSchema.shape,
});

// ============================================
// EMAIL SCHEMAS
// ============================================

export const emailStatusSchema = z.enum([
  'draft', 'approved', 'scheduled', 'sent',
  'opened', 'replied', 'bounced'
]);

export const emailTypeSchema = z.enum([
  'outreach', 'follow_up', 'mystery_shopper',
  'reply', 'meeting_request', 'not_interested', 'positive_reply'
]);

export const sendEmailSchema = z.object({
  to: emailSchema,
  subject: z.string().min(1).max(500),
  body: z.string().min(1).max(50000),
  prospect_id: uuidSchema.optional(),
});

export const testEmailSchema = z.object({
  to_email: emailSchema,
  subject: z.string().min(1).max(500).optional(),
  body: z.string().min(1).max(50000).optional(),
});

// ============================================
// CAMPAIGN SCHEMAS
// ============================================

export const createCampaignSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  strategy_key: z.string().min(1).max(50),
  daily_limit: z.number().min(1).max(100).default(20),
});

export const updateCampaignSchema = z.object({
  id: uuidSchema,
  active: z.boolean().optional(),
  daily_limit: z.number().min(1).max(100).optional(),
});

// ============================================
// AUTO-EMAIL SCHEMAS
// ============================================

export const autoEmailSchema = z.object({
  max_emails: z.number().min(1).max(100).default(10),
  min_score: z.number().min(0).max(100).default(50),
  stagger_delay: z.boolean().default(false),
});

// ============================================
// SCRAPER SCHEMAS
// ============================================

export const scrapeRequestSchema = z.object({
  source: z.string().min(1).max(50),
  locations: z.array(z.string().max(100)).min(1).max(10),
  job_titles: z.array(z.string().max(100)).min(1).max(10).optional(),
  max_results: z.number().min(1).max(100).default(50),
});

// ============================================
// AUTH SCHEMAS
// ============================================

export const loginSchema = z.object({
  password: z.string().min(1).max(255),
});

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Parse and validate request body with a Zod schema
 * Returns typed data or throws validation error
 */
export async function parseBody<T extends z.ZodType>(
  request: Request,
  schema: T
): Promise<z.infer<T>> {
  try {
    const body = await request.json();
    return schema.parse(body);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.issues.map((e) => `${e.path.join('.')}: ${e.message}`);
      throw new ValidationError(`Invalid request body: ${messages.join(', ')}`);
    }
    throw new ValidationError('Invalid JSON in request body');
  }
}

/**
 * Parse and validate URL search params with a Zod schema
 */
export function parseSearchParams<T extends z.ZodType>(
  searchParams: URLSearchParams,
  schema: T
): z.infer<T> {
  const params: Record<string, string> = {};
  searchParams.forEach((value, key) => {
    params[key] = value;
  });

  try {
    return schema.parse(params);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.issues.map((e) => `${e.path.join('.')}: ${e.message}`);
      throw new ValidationError(`Invalid query parameters: ${messages.join(', ')}`);
    }
    throw error;
  }
}

/**
 * Custom validation error
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export default {
  // Schemas
  uuidSchema,
  emailSchema,
  paginationSchema,
  prospectTierSchema,
  prospectStageSchema,
  propertyTypeSchema,
  createProspectSchema,
  updateProspectSchema,
  prospectFiltersSchema,
  emailStatusSchema,
  emailTypeSchema,
  sendEmailSchema,
  testEmailSchema,
  createCampaignSchema,
  updateCampaignSchema,
  autoEmailSchema,
  scrapeRequestSchema,
  loginSchema,
  // Helpers
  parseBody,
  parseSearchParams,
  ValidationError,
};
