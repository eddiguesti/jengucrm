/**
 * Request Context - Track request ID and timing through the request lifecycle
 */

import {
  generateRequestId,
  ApiResponse,
  successResponse,
  errorResponse,
  ErrorCode,
  ErrorCodes,
  getStatusCode,
  isRetryable,
} from './contracts';

export interface RequestContext {
  requestId: string;
  startTime: number;
  path: string;
  method: string;
}

/**
 * Create a request context from an incoming request
 */
export function createRequestContext(request: Request): RequestContext {
  const url = new URL(request.url);
  return {
    requestId: request.headers.get('x-request-id') || generateRequestId(),
    startTime: Date.now(),
    path: url.pathname,
    method: request.method,
  };
}

/**
 * Log helper with request ID prefix
 */
export function logWithContext(ctx: RequestContext, level: 'info' | 'warn' | 'error', message: string, data?: Record<string, unknown>): void {
  const prefix = `[${ctx.requestId}] [${level.toUpperCase()}]`;
  const msg = `${prefix} ${message}`;

  if (data) {
    console[level](msg, JSON.stringify(data));
  } else {
    console[level](msg);
  }
}

/**
 * Create a JSON response with proper headers
 */
export function jsonResponse<T>(body: ApiResponse<T>, status: number = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'X-Request-Id': body.meta.requestId,
    },
  });
}

/**
 * Create a success JSON response
 */
export function success<T>(ctx: RequestContext, data: T): Response {
  const body = successResponse(data, ctx.requestId, ctx.startTime);
  return jsonResponse(body, 200);
}

/**
 * Create an error JSON response
 */
export function error(
  ctx: RequestContext,
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>
): Response {
  const body = errorResponse(code, message, ctx.requestId, isRetryable(code), details);
  return jsonResponse(body, getStatusCode(code));
}

/**
 * Wrap a handler with error handling and request context
 */
export function withErrorHandling(
  handler: (request: Request, ctx: RequestContext) => Promise<Response>
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    const ctx = createRequestContext(request);

    try {
      const response = await handler(request, ctx);

      // Add request ID to response headers if not already present
      if (!response.headers.has('X-Request-Id')) {
        const headers = new Headers(response.headers);
        headers.set('X-Request-Id', ctx.requestId);
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
      }

      return response;
    } catch (err) {
      logWithContext(ctx, 'error', 'Unhandled error', {
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });

      return error(ctx, ErrorCodes.INTERNAL_ERROR, err instanceof Error ? err.message : 'Unknown error');
    }
  };
}

/**
 * Validate required fields in request body
 */
export function validateRequired<T extends Record<string, unknown>>(
  body: T,
  fields: (keyof T)[]
): { valid: true } | { valid: false; missing: string[] } {
  const missing: string[] = [];

  for (const field of fields) {
    if (body[field] === undefined || body[field] === null || body[field] === '') {
      missing.push(String(field));
    }
  }

  if (missing.length > 0) {
    return { valid: false, missing };
  }

  return { valid: true };
}

/**
 * Parse JSON body with error handling
 */
export async function parseBody<T>(request: Request, ctx: RequestContext): Promise<T | Response> {
  try {
    return await request.json() as T;
  } catch {
    return error(ctx, ErrorCodes.BAD_REQUEST, 'Invalid JSON body');
  }
}
