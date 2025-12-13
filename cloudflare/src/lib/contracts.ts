/**
 * Service Contracts - Shared types for API requests and responses
 *
 * All API endpoints should use these standard response formats
 * to ensure consistency across the system.
 */

// ==================
// STANDARD API RESPONSE
// ==================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta: ApiMeta;
}

export interface ApiError {
  code: string;
  message: string;
  retryable: boolean;
  details?: Record<string, unknown>;
}

export interface ApiMeta {
  requestId: string;
  duration?: number;
  timestamp: string;
}

// ==================
// ERROR CODES
// ==================

export const ErrorCodes = {
  // Client errors (4xx)
  BAD_REQUEST: 'BAD_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',
  CONFLICT: 'CONFLICT',

  // Server errors (5xx)
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  TIMEOUT: 'TIMEOUT',

  // Business logic errors
  PROSPECT_NOT_FOUND: 'PROSPECT_NOT_FOUND',
  EMAIL_NOT_FOUND: 'EMAIL_NOT_FOUND',
  CAMPAIGN_NOT_FOUND: 'CAMPAIGN_NOT_FOUND',
  MAILBOX_UNAVAILABLE: 'MAILBOX_UNAVAILABLE',
  WARMUP_LIMIT_REACHED: 'WARMUP_LIMIT_REACHED',
  INVALID_EMAIL: 'INVALID_EMAIL',
  EMAIL_BOUNCED: 'EMAIL_BOUNCED',
  ALREADY_CONTACTED: 'ALREADY_CONTACTED',
  ENRICHMENT_FAILED: 'ENRICHMENT_FAILED',
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];

// ==================
// REQUEST TYPES
// ==================

export interface SendEmailRequest {
  prospectId: string;
  campaignId?: string;
  strategy?: string;
  scheduledFor?: string;
}

export interface EnrichmentRequest {
  prospectId: string;
  type: 'website' | 'email' | 'both';
}

export interface CreateProspectRequest {
  name: string;
  city: string;
  country?: string;
  website?: string;
  contactEmail?: string;
  contactName?: string;
  source?: string;
}

// ==================
// RESPONSE TYPES
// ==================

export interface SendEmailResponseData {
  emailId: string;
  messageId?: string;
  status: 'sent' | 'queued' | 'failed';
  sentAt?: string;
}

export interface EnrichmentResponseData {
  prospectId: string;
  website?: string;
  email?: string;
  status: 'complete' | 'partial' | 'failed';
}

export interface HealthCheckData {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime?: number;
  dependencies: {
    database: DependencyStatus;
    smtp: DependencyStatus;
    externalApis: DependencyStatus;
  };
}

export interface DependencyStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  latencyMs?: number;
  lastError?: string;
  lastErrorAt?: string;
}

// ==================
// HELPER FUNCTIONS
// ==================

/**
 * Generate a unique request ID
 */
export function generateRequestId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `req_${timestamp}_${random}`;
}

/**
 * Create a success response
 */
export function successResponse<T>(
  data: T,
  requestId: string,
  startTime: number
): ApiResponse<T> {
  return {
    success: true,
    data,
    meta: {
      requestId,
      duration: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    },
  };
}

/**
 * Create an error response
 */
export function errorResponse(
  code: ErrorCode,
  message: string,
  requestId: string,
  retryable: boolean = false,
  details?: Record<string, unknown>
): ApiResponse<never> {
  return {
    success: false,
    error: {
      code,
      message,
      retryable,
      details,
    },
    meta: {
      requestId,
      timestamp: new Date().toISOString(),
    },
  };
}

/**
 * Get HTTP status code for error code
 */
export function getStatusCode(code: ErrorCode): number {
  const statusMap: Record<string, number> = {
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    VALIDATION_ERROR: 422,
    RATE_LIMITED: 429,
    CONFLICT: 409,
    INTERNAL_ERROR: 500,
    SERVICE_UNAVAILABLE: 503,
    EXTERNAL_SERVICE_ERROR: 502,
    DATABASE_ERROR: 500,
    TIMEOUT: 504,
    PROSPECT_NOT_FOUND: 404,
    EMAIL_NOT_FOUND: 404,
    CAMPAIGN_NOT_FOUND: 404,
    MAILBOX_UNAVAILABLE: 503,
    WARMUP_LIMIT_REACHED: 429,
    INVALID_EMAIL: 400,
    EMAIL_BOUNCED: 400,
    ALREADY_CONTACTED: 409,
    ENRICHMENT_FAILED: 500,
  };
  return statusMap[code] || 500;
}

/**
 * Check if an error code is retryable
 */
export function isRetryable(code: ErrorCode): boolean {
  const retryableCodes: ErrorCode[] = [
    ErrorCodes.RATE_LIMITED,
    ErrorCodes.SERVICE_UNAVAILABLE,
    ErrorCodes.EXTERNAL_SERVICE_ERROR,
    ErrorCodes.TIMEOUT,
    ErrorCodes.MAILBOX_UNAVAILABLE,
    ErrorCodes.WARMUP_LIMIT_REACHED,
  ];
  return retryableCodes.includes(code);
}

/**
 * JSON response with CORS headers
 */
export function jsonResponse<T>(
  body: ApiResponse<T>,
  status: number = 200
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
