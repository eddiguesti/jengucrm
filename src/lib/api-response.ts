import { NextResponse } from 'next/server';
import { logger } from './logger';
import { flags } from './feature-flags';

/**
 * Standardized API response helpers
 * Ensures consistent response format across all endpoints
 *
 * Security:
 * - Never exposes stack traces in production
 * - Uses STRICT_ERROR_HANDLING flag for additional protection
 * - Generates error IDs for correlation without exposing details
 */

export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  error: string;
  errorId?: string;
  details?: string;
}

export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;

/**
 * Create a successful API response
 */
export function success<T>(data: T, status = 200): NextResponse<ApiSuccessResponse<T>> {
  return NextResponse.json({ success: true, data }, { status });
}

/**
 * Create an error API response
 * - Generates unique errorId for tracking
 * - Logs error details server-side
 * - Returns sanitized error to client
 */
export function error(
  message: string,
  status = 500,
  cause?: Error | unknown
): NextResponse<ApiErrorResponse> {
  const errorId = crypto.randomUUID().slice(0, 8);
  const isDev = process.env.NODE_ENV === 'development';

  // Determine if we should show error details
  // - Never in production with STRICT_ERROR_HANDLING
  // - Only in development when flag allows
  const showDetails = isDev && !flags.STRICT_ERROR_HANDLING;

  // Log full error details server-side (always)
  logger.error({
    errorId,
    message,
    status,
    cause: cause instanceof Error ? cause.message : String(cause),
    stack: cause instanceof Error ? cause.stack : undefined,
  }, `API Error [${errorId}]: ${message}`);

  // Build sanitized response
  const response: ApiErrorResponse = {
    success: false,
    error: message,
    errorId,
  };

  // Only include details in development with strict handling disabled
  if (showDetails && cause) {
    response.details = cause instanceof Error ? cause.message : String(cause);
  }

  return NextResponse.json(response, { status });
}

/**
 * Common error responses
 */
export const errors = {
  badRequest: (message = 'Bad request', cause?: unknown) =>
    error(message, 400, cause),

  unauthorized: (message = 'Unauthorized') =>
    error(message, 401),

  forbidden: (message = 'Forbidden') =>
    error(message, 403),

  notFound: (message = 'Not found') =>
    error(message, 404),

  conflict: (message = 'Conflict', cause?: unknown) =>
    error(message, 409, cause),

  tooManyRequests: (message = 'Too many requests') =>
    error(message, 429),

  internal: (message = 'Internal server error', cause?: unknown) =>
    error(message, 500, cause),

  serviceUnavailable: (message = 'Service unavailable', cause?: unknown) =>
    error(message, 503, cause),
};

/**
 * Wrap async route handler with error handling
 */
export function withErrorHandling<T>(
  handler: () => Promise<NextResponse<T>>
): Promise<NextResponse<T | ApiErrorResponse>> {
  return handler().catch((err) => {
    return errors.internal('An unexpected error occurred', err);
  });
}
