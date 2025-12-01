import { NextResponse } from 'next/server';
import { logger } from './logger';

/**
 * Standardized API response helpers
 * Ensures consistent response format across all endpoints
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

  // Log full error details server-side
  logger.error({
    errorId,
    message,
    status,
    cause: cause instanceof Error ? cause.message : String(cause),
    stack: cause instanceof Error ? cause.stack : undefined,
  }, `API Error: ${message}`);

  return NextResponse.json(
    {
      success: false,
      error: message,
      errorId,
      details: isDev && cause ? (cause instanceof Error ? cause.message : String(cause)) : undefined,
    },
    { status }
  );
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
