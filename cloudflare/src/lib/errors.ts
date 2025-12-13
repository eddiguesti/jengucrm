/**
 * Custom Error Classes
 *
 * Hierarchical error system for consistent error handling across the codebase.
 * All errors extend BaseError and include:
 * - Error code for programmatic handling
 * - HTTP status code for API responses
 * - Timestamp for debugging
 * - Optional context for additional details
 */

// ==================
// BASE ERROR
// ==================

export abstract class BaseError extends Error {
  abstract readonly code: string;
  abstract readonly statusCode: number;
  readonly timestamp: Date;
  readonly context?: Record<string, unknown>;

  constructor(message: string, context?: Record<string, unknown>) {
    super(message);
    this.name = this.constructor.name;
    this.timestamp = new Date();
    this.context = context;
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      timestamp: this.timestamp.toISOString(),
      context: this.context,
    };
  }

  /**
   * Create a standardized API response from this error
   */
  toResponse(requestId?: string): Response {
    return new Response(
      JSON.stringify({
        success: false,
        error: {
          code: this.code,
          message: this.message,
          context: this.context,
        },
        meta: {
          requestId,
          timestamp: this.timestamp.toISOString(),
        },
      }),
      {
        status: this.statusCode,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

// ==================
// VALIDATION ERRORS
// ==================

/**
 * Thrown when input validation fails (Zod, custom validation, etc.)
 */
export class ValidationError extends BaseError {
  readonly code = 'VALIDATION_ERROR' as const;
  readonly statusCode = 400;
  readonly field?: string;

  constructor(message: string, field?: string, context?: Record<string, unknown>) {
    super(message, context);
    this.field = field;
  }
}

/**
 * Thrown when a required parameter is missing
 */
export class MissingParameterError extends BaseError {
  readonly code = 'MISSING_PARAMETER' as const;
  readonly statusCode = 400;
  readonly parameter: string;

  constructor(parameter: string, context?: Record<string, unknown>) {
    super(`Missing required parameter: ${parameter}`, context);
    this.parameter = parameter;
  }
}

// ==================
// BUSINESS LOGIC ERRORS
// ==================

/**
 * Thrown when a business rule is violated
 */
export class BusinessRuleError extends BaseError {
  readonly code = 'BUSINESS_RULE_ERROR' as const;
  readonly statusCode = 422;
  readonly rule: string;

  constructor(rule: string, message: string, context?: Record<string, unknown>) {
    super(message, context);
    this.rule = rule;
  }
}

/**
 * Thrown when a state transition is not allowed
 */
export class InvalidStateTransitionError extends BaseError {
  readonly code = 'INVALID_STATE_TRANSITION' as const;
  readonly statusCode = 422;
  readonly fromState: string;
  readonly toState: string;
  readonly entityType: string;

  constructor(
    entityType: string,
    fromState: string,
    toState: string,
    entityId?: string
  ) {
    super(
      `Invalid ${entityType} state transition: ${fromState} → ${toState}`,
      { entityId }
    );
    this.entityType = entityType;
    this.fromState = fromState;
    this.toState = toState;
  }
}

// ==================
// NOT FOUND ERRORS
// ==================

/**
 * Thrown when a requested resource is not found
 */
export class NotFoundError extends BaseError {
  readonly code = 'NOT_FOUND' as const;
  readonly statusCode = 404;
  readonly resourceType: string;
  readonly resourceId?: string;

  constructor(resourceType: string, resourceId?: string) {
    super(
      resourceId
        ? `${resourceType} not found: ${resourceId}`
        : `${resourceType} not found`
    );
    this.resourceType = resourceType;
    this.resourceId = resourceId;
  }
}

/**
 * Thrown when a prospect is not found
 */
export class ProspectNotFoundError extends BaseError {
  readonly code = 'PROSPECT_NOT_FOUND' as const;
  readonly statusCode = 404;
  readonly prospectId: string;

  constructor(prospectId: string) {
    super(`Prospect not found: ${prospectId}`);
    this.prospectId = prospectId;
  }
}

/**
 * Thrown when a campaign is not found
 */
export class CampaignNotFoundError extends BaseError {
  readonly code = 'CAMPAIGN_NOT_FOUND' as const;
  readonly statusCode = 404;
  readonly campaignId: string;

  constructor(campaignId: string) {
    super(`Campaign not found: ${campaignId}`);
    this.campaignId = campaignId;
  }
}

/**
 * Thrown when an email is not found
 */
export class EmailNotFoundError extends BaseError {
  readonly code = 'EMAIL_NOT_FOUND' as const;
  readonly statusCode = 404;
  readonly emailId: string;

  constructor(emailId: string) {
    super(`Email not found: ${emailId}`);
    this.emailId = emailId;
  }
}

// ==================
// EXTERNAL API ERRORS
// ==================

/**
 * Thrown when an external API call fails
 */
export class ExternalAPIError extends BaseError {
  readonly code = 'EXTERNAL_API_ERROR' as const;
  readonly statusCode = 502;
  readonly provider: string;
  readonly originalStatus?: number;

  constructor(
    provider: string,
    message: string,
    originalStatus?: number,
    context?: Record<string, unknown>
  ) {
    super(`${provider} API error: ${message}`, context);
    this.provider = provider;
    this.originalStatus = originalStatus;
  }
}

/**
 * Thrown when Grok API fails
 */
export class GrokAPIError extends BaseError {
  readonly code = 'GROK_API_ERROR' as const;
  readonly statusCode = 502;
  readonly provider = 'Grok';
  readonly originalStatus?: number;

  constructor(message: string, originalStatus?: number, context?: Record<string, unknown>) {
    super(`Grok API error: ${message}`, context);
    this.originalStatus = originalStatus;
  }
}

/**
 * Thrown when Claude API fails
 */
export class ClaudeAPIError extends BaseError {
  readonly code = 'CLAUDE_API_ERROR' as const;
  readonly statusCode = 502;
  readonly provider = 'Claude';
  readonly originalStatus?: number;

  constructor(message: string, originalStatus?: number, context?: Record<string, unknown>) {
    super(`Claude API error: ${message}`, context);
    this.originalStatus = originalStatus;
  }
}

/**
 * Thrown when MillionVerifier API fails
 */
export class MillionVerifierAPIError extends BaseError {
  readonly code = 'MILLIONVERIFIER_API_ERROR' as const;
  readonly statusCode = 502;
  readonly provider = 'MillionVerifier';
  readonly originalStatus?: number;

  constructor(message: string, originalStatus?: number, context?: Record<string, unknown>) {
    super(`MillionVerifier API error: ${message}`, context);
    this.originalStatus = originalStatus;
  }
}

/**
 * Thrown when Supabase API fails
 */
export class SupabaseAPIError extends BaseError {
  readonly code = 'SUPABASE_API_ERROR' as const;
  readonly statusCode = 502;
  readonly provider = 'Supabase';
  readonly originalStatus?: number;

  constructor(message: string, originalStatus?: number, context?: Record<string, unknown>) {
    super(`Supabase API error: ${message}`, context);
    this.originalStatus = originalStatus;
  }
}

// ==================
// RATE LIMIT ERRORS
// ==================

/**
 * Thrown when a rate limit is exceeded
 */
export class RateLimitError extends BaseError {
  readonly code = 'RATE_LIMIT_EXCEEDED' as const;
  readonly statusCode = 429;
  readonly retryAfter?: number;
  readonly limitType: string;

  constructor(
    limitType: string,
    message?: string,
    retryAfter?: number,
    context?: Record<string, unknown>
  ) {
    super(message || `Rate limit exceeded: ${limitType}`, context);
    this.limitType = limitType;
    this.retryAfter = retryAfter;
  }

  toResponse(requestId?: string): Response {
    const response = super.toResponse(requestId);
    const headers = new Headers(response.headers);
    if (this.retryAfter) {
      headers.set('Retry-After', String(this.retryAfter));
    }
    return new Response(response.body, {
      status: response.status,
      headers,
    });
  }
}

/**
 * Thrown when daily email limit is reached
 */
export class DailyLimitReachedError extends BaseError {
  readonly code = 'DAILY_LIMIT_REACHED' as const;
  readonly statusCode = 429;
  readonly sent: number;
  readonly limit: number;

  constructor(sent: number, limit: number) {
    super(`Daily email limit reached: ${sent}/${limit}`, { sent, limit });
    this.sent = sent;
    this.limit = limit;
  }
}

/**
 * Thrown when inbox sending limit is reached
 */
export class InboxLimitReachedError extends BaseError {
  readonly code = 'INBOX_LIMIT_REACHED' as const;
  readonly statusCode = 429;
  readonly inboxId: string;
  readonly sent: number;
  readonly limit: number;

  constructor(inboxId: string, sent: number, limit: number) {
    super(`Inbox ${inboxId} limit reached: ${sent}/${limit}`, { inboxId, sent, limit });
    this.inboxId = inboxId;
    this.sent = sent;
    this.limit = limit;
  }
}

// ==================
// INFRASTRUCTURE ERRORS
// ==================

/**
 * Thrown when circuit breaker is open
 */
export class CircuitBreakerOpenError extends BaseError {
  readonly code = 'CIRCUIT_BREAKER_OPEN' as const;
  readonly statusCode = 503;
  readonly service: string;

  constructor(service: string, context?: Record<string, unknown>) {
    super(`Circuit breaker open for service: ${service}`, context);
    this.service = service;
  }
}

/**
 * Thrown when a service is unavailable
 */
export class ServiceUnavailableError extends BaseError {
  readonly code = 'SERVICE_UNAVAILABLE' as const;
  readonly statusCode = 503;
  readonly service: string;

  constructor(service: string, message?: string, context?: Record<string, unknown>) {
    super(message || `Service unavailable: ${service}`, context);
    this.service = service;
  }
}

/**
 * Thrown when database operation fails
 */
export class DatabaseError extends BaseError {
  readonly code = 'DATABASE_ERROR' as const;
  readonly statusCode = 500;
  readonly operation: string;

  constructor(operation: string, originalError?: Error, context?: Record<string, unknown>) {
    super(
      `Database error during ${operation}: ${originalError?.message || 'unknown'}`,
      { ...context, originalError: originalError?.message }
    );
    this.operation = operation;
  }
}

// ==================
// EMAIL ERRORS
// ==================

/**
 * Thrown when no inbox is available for sending
 */
export class NoInboxAvailableError extends BaseError {
  readonly code = 'NO_INBOX_AVAILABLE' as const;
  readonly statusCode = 503;

  constructor(reason?: string, context?: Record<string, unknown>) {
    super(reason || 'No healthy inbox available for sending', context);
  }
}

/**
 * Thrown when email sending fails
 */
export class EmailSendError extends BaseError {
  readonly code = 'EMAIL_SEND_ERROR' as const;
  readonly statusCode = 500;
  readonly prospectId?: string;
  readonly inboxId?: string;

  constructor(
    message: string,
    prospectId?: string,
    inboxId?: string,
    context?: Record<string, unknown>
  ) {
    super(message, { prospectId, inboxId, ...context });
    this.prospectId = prospectId;
    this.inboxId = inboxId;
  }
}

/**
 * Thrown when email composition fails
 */
export class EmailCompositionError extends BaseError {
  readonly code = 'EMAIL_COMPOSITION_ERROR' as const;
  readonly statusCode = 500;
  readonly prospectId: string;

  constructor(prospectId: string, reason: string, context?: Record<string, unknown>) {
    super(`Failed to compose email for prospect ${prospectId}: ${reason}`, context);
    this.prospectId = prospectId;
  }
}

// ==================
// AUTHENTICATION ERRORS
// ==================

/**
 * Thrown when authentication fails
 */
export class AuthenticationError extends BaseError {
  readonly code = 'AUTHENTICATION_FAILED' as const;
  readonly statusCode = 401;

  constructor(message?: string, context?: Record<string, unknown>) {
    super(message || 'Authentication required', context);
  }
}

/**
 * Thrown when authorization fails (authenticated but not permitted)
 */
export class AuthorizationError extends BaseError {
  readonly code = 'AUTHORIZATION_FAILED' as const;
  readonly statusCode = 403;

  constructor(message?: string, context?: Record<string, unknown>) {
    super(message || 'Permission denied', context);
  }
}

// ==================
// FALLBACK ERROR
// ==================

/**
 * Fallback error for truly unexpected situations
 */
export class UnexpectedError extends BaseError {
  readonly code = 'UNEXPECTED_ERROR' as const;
  readonly statusCode = 500;
}

// ==================
// UTILITY FUNCTIONS
// ==================

/**
 * Check if an error is a known application error
 */
export function isAppError(error: unknown): error is BaseError {
  return error instanceof BaseError;
}

/**
 * Wrap unknown errors in a consistent format
 */
export function wrapError(error: unknown, fallbackMessage = 'An unexpected error occurred'): BaseError {
  if (isAppError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return new UnexpectedError(error.message, { originalError: error.name });
  }

  return new UnexpectedError(fallbackMessage, { originalError: String(error) });
}

/**
 * Check if error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (!isAppError(error)) {
    return false;
  }

  // These errors are transient and can be retried
  const retryableCodes = [
    'EXTERNAL_API_ERROR',
    'GROK_API_ERROR',
    'CLAUDE_API_ERROR',
    'MILLIONVERIFIER_API_ERROR',
    'SUPABASE_API_ERROR',
    'SERVICE_UNAVAILABLE',
    'DATABASE_ERROR',
    'RATE_LIMIT_EXCEEDED',
  ];

  return retryableCodes.includes(error.code);
}
