/**
 * Input Validation with Zod Schemas
 *
 * Provides strict validation for all API inputs:
 * - Prospect data
 * - Email data
 * - Campaign data
 * - API request parameters
 * - Webhook payloads
 */

import { z } from 'zod';
import { ValidationError } from './errors';

// ==================
// COMMON SCHEMAS
// ==================

/** UUID v4 format */
export const UUIDSchema = z.string().uuid();

/** ISO 8601 datetime string */
export const DateTimeSchema = z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/));

/** Email address */
export const EmailSchema = z.string().email().toLowerCase().trim();

/** URL with http/https */
export const URLSchema = z.string().url().refine(
  (url) => url.startsWith('http://') || url.startsWith('https://'),
  { message: 'URL must use http or https protocol' }
);

/**
 * Safe string validation (no script tags, SQL injection)
 * Use safeString() helper for min/max constraints
 */
const isSafeString = (s: string) => !/<script|javascript:|on\w+=/i.test(s);

/** Create a safe string schema with optional min/max constraints */
export function safeString(minLen?: number, maxLen?: number) {
  let schema = z.string().transform((s) => s.trim());

  if (minLen !== undefined) {
    schema = schema.refine((s) => s.length >= minLen, {
      message: `String must be at least ${minLen} characters`,
    });
  }

  if (maxLen !== undefined) {
    schema = schema.refine((s) => s.length <= maxLen, {
      message: `String must be at most ${maxLen} characters`,
    });
  }

  return schema.refine(isSafeString, {
    message: 'String contains potentially unsafe content',
  });
}

/** Basic safe string (just sanitization, no length constraints) */
export const SafeStringSchema = z.string()
  .transform((s) => s.trim())
  .refine(isSafeString, { message: 'String contains potentially unsafe content' });

// ==================
// PROSPECT SCHEMAS
// ==================

export const ProspectStageSchema = z.enum([
  'new',
  'enriching',
  'enriched',
  'ready',
  'contacted',
  'engaged',
  'meeting',
  'won',
  'lost',
]);

export const ProspectTierSchema = z.enum(['hot', 'warm', 'cold']);

export const ProspectSchema = z.object({
  id: UUIDSchema,
  name: safeString(1, 200),
  city: safeString(undefined, 100).optional(),
  country: z.string().length(2).toUpperCase().optional(),
  propertyType: z.string().max(50).optional(),
  contactName: safeString(undefined, 100).optional(),
  contactEmail: EmailSchema.optional().nullable(),
  contactTitle: safeString(undefined, 100).optional(),
  phone: z.string().max(50).optional(),
  website: URLSchema.optional().nullable(),
  stage: ProspectStageSchema,
  tier: ProspectTierSchema,
  score: z.number().int().min(0).max(100),
  leadSource: z.string().min(1).max(50),
  tags: z.array(z.string().max(50)).default([]),
  archived: z.boolean().default(false),
  emailVerified: z.boolean().default(false),
  emailBounced: z.boolean().default(false),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
});

export type Prospect = z.infer<typeof ProspectSchema>;

/** Schema for creating a prospect (fewer required fields) */
export const CreateProspectSchema = z.object({
  name: safeString(1, 200),
  city: safeString(undefined, 100).optional(),
  country: z.string().length(2).toUpperCase().optional(),
  propertyType: z.string().max(50).optional(),
  contactName: safeString(undefined, 100).optional(),
  contactEmail: EmailSchema.optional(),
  contactTitle: safeString(undefined, 100).optional(),
  phone: z.string().max(50).optional(),
  website: URLSchema.optional(),
  leadSource: z.string().min(1).max(50).default('manual'),
  tags: z.array(z.string().max(50)).default([]),
});

export type CreateProspectInput = z.infer<typeof CreateProspectSchema>;

/** Schema for updating a prospect */
export const UpdateProspectSchema = CreateProspectSchema.partial().extend({
  stage: ProspectStageSchema.optional(),
  tier: ProspectTierSchema.optional(),
  score: z.number().int().min(0).max(100).optional(),
  archived: z.boolean().optional(),
});

export type UpdateProspectInput = z.infer<typeof UpdateProspectSchema>;

// ==================
// EMAIL SCHEMAS
// ==================

export const EmailStatusSchema = z.enum([
  'pending',
  'sent',
  'delivered',
  'opened',
  'clicked',
  'replied',
  'bounced',
  'failed',
]);

export const EmailSchema_DB = z.object({
  id: UUIDSchema,
  prospectId: UUIDSchema,
  campaignId: UUIDSchema.optional().nullable(),
  inboxId: z.string().optional().nullable(),
  toEmail: EmailSchema,
  toName: safeString(undefined, 100).optional(),
  fromEmail: EmailSchema,
  fromName: safeString(undefined, 100).optional(),
  subject: safeString(1, 500),
  bodyHtml: z.string().min(1).max(50000),
  bodyText: z.string().max(50000).optional(),
  status: EmailStatusSchema,
  sentAt: DateTimeSchema.optional().nullable(),
  openedAt: DateTimeSchema.optional().nullable(),
  clickedAt: DateTimeSchema.optional().nullable(),
  repliedAt: DateTimeSchema.optional().nullable(),
  bouncedAt: DateTimeSchema.optional().nullable(),
  createdAt: DateTimeSchema,
});

export type Email = z.infer<typeof EmailSchema_DB>;

/** Schema for sending an email */
export const SendEmailSchema = z.object({
  prospectId: UUIDSchema,
  campaignId: UUIDSchema.optional(),
  subject: safeString(1, 500).optional(),
  body: z.string().min(1).max(50000).optional(),
  strategy: z.string().optional(),
  followUp: z.boolean().default(false),
});

export type SendEmailInput = z.infer<typeof SendEmailSchema>;

// ==================
// CAMPAIGN SCHEMAS
// ==================

export const CampaignStatusSchema = z.enum(['draft', 'active', 'paused', 'completed', 'archived']);

export const CampaignSchema = z.object({
  id: UUIDSchema,
  name: safeString(1, 100),
  description: safeString(undefined, 500).optional(),
  status: CampaignStatusSchema,
  strategy: z.string().optional(),
  sequenceCount: z.number().int().min(1).max(10).default(1),
  leadsCount: z.number().int().min(0).default(0),
  abTestingEnabled: z.boolean().default(false),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
});

export type Campaign = z.infer<typeof CampaignSchema>;

/** Schema for creating a campaign */
export const CreateCampaignSchema = z.object({
  name: safeString(1, 100),
  description: safeString(undefined, 500).optional(),
  strategy: z.string().optional(),
  sequenceCount: z.number().int().min(1).max(10).default(1),
  abTestingEnabled: z.boolean().default(false),
});

export type CreateCampaignInput = z.infer<typeof CreateCampaignSchema>;

// ==================
// API REQUEST SCHEMAS
// ==================

/** Pagination parameters */
export const PaginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type PaginationParams = z.infer<typeof PaginationSchema>;

/** Prospect list filters */
export const ProspectFiltersSchema = PaginationSchema.extend({
  stage: ProspectStageSchema.optional(),
  tier: ProspectTierSchema.optional(),
  leadSource: z.string().optional(),
  hasEmail: z.coerce.boolean().optional(),
  archived: z.coerce.boolean().optional(),
  search: safeString(undefined, 100).optional(),
});

export type ProspectFilters = z.infer<typeof ProspectFiltersSchema>;

/** Email list filters */
export const EmailFiltersSchema = PaginationSchema.extend({
  status: EmailStatusSchema.optional(),
  prospectId: UUIDSchema.optional(),
  campaignId: UUIDSchema.optional(),
  fromDate: DateTimeSchema.optional(),
  toDate: DateTimeSchema.optional(),
});

export type EmailFilters = z.infer<typeof EmailFiltersSchema>;

// ==================
// WEBHOOK SCHEMAS
// ==================

/** Inbound email webhook payload */
export const InboundEmailWebhookSchema = z.object({
  messageId: z.string().min(1),
  from: EmailSchema,
  to: EmailSchema,
  subject: z.string().max(1000),
  bodyText: z.string().optional(),
  bodyHtml: z.string().optional(),
  receivedAt: DateTimeSchema,
  inReplyTo: z.string().optional(),
  references: z.array(z.string()).optional(),
});

export type InboundEmailWebhook = z.infer<typeof InboundEmailWebhookSchema>;

/** Bounce webhook payload */
export const BounceWebhookSchema = z.object({
  messageId: z.string().min(1),
  email: EmailSchema,
  bounceType: z.enum(['hard', 'soft', 'complaint']),
  reason: z.string().max(500).optional(),
  timestamp: DateTimeSchema,
});

export type BounceWebhook = z.infer<typeof BounceWebhookSchema>;

/** Tracking webhook (open/click) */
export const TrackingWebhookSchema = z.object({
  type: z.enum(['open', 'click']),
  emailId: UUIDSchema,
  timestamp: DateTimeSchema,
  userAgent: z.string().max(500).optional(),
  ipAddress: z.string().max(45).optional(),
  url: URLSchema.optional(), // For clicks
});

export type TrackingWebhook = z.infer<typeof TrackingWebhookSchema>;

// ==================
// VALIDATION UTILITIES
// ==================

/**
 * Validate input and throw ValidationError if invalid
 */
export function validate<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);

  if (!result.success) {
    const errors = result.error.issues.map((e) => ({
      path: e.path.join('.'),
      message: e.message,
    }));

    throw new ValidationError(
      `Validation failed: ${errors.map((e) => `${e.path}: ${e.message}`).join(', ')}`,
      errors[0]?.path,
      { errors }
    );
  }

  return result.data;
}

/**
 * Validate input and return Result
 */
export function safeValidate<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; errors: z.ZodError } {
  const result = schema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return { success: false, errors: result.error };
}

/**
 * Validate request body from Request object
 */
export async function validateRequestBody<T>(
  request: Request,
  schema: z.ZodSchema<T>
): Promise<T> {
  const contentType = request.headers.get('content-type');

  let body: unknown;

  if (contentType?.includes('application/json')) {
    try {
      body = await request.json();
    } catch {
      throw new ValidationError('Invalid JSON in request body');
    }
  } else if (contentType?.includes('application/x-www-form-urlencoded')) {
    const formData = await request.formData();
    body = Object.fromEntries(formData.entries());
  } else {
    throw new ValidationError('Unsupported content type');
  }

  return validate(schema, body);
}

/**
 * Validate URL search parameters
 */
export function validateSearchParams<T>(
  url: URL,
  schema: z.ZodSchema<T>
): T {
  const params: Record<string, string> = {};

  url.searchParams.forEach((value, key) => {
    params[key] = value;
  });

  return validate(schema, params);
}

// ==================
// SANITIZATION UTILITIES
// ==================

/**
 * Sanitize HTML content to prevent XSS
 */
export function sanitizeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Sanitize email address
 */
export function sanitizeEmail(email: string): string {
  return email.trim().toLowerCase().replace(/[<>]/g, '');
}

/**
 * Validate and sanitize URL
 */
export function sanitizeUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}
