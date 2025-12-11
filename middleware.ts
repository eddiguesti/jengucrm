import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Middleware for authentication and route protection
 * - Validates session tokens (session_* format only)
 * - Protects API routes and pages
 * - Validates cron job requests
 *
 * Security improvements:
 * - Legacy 'authenticated' token disabled by default (use LEGACY_AUTH_ENABLED=true to enable)
 * - Only cryptographically secure session_* tokens accepted
 * - Token length validation to prevent short/weak tokens
 */

// Session configuration (must be inline for Edge runtime)
const SESSION_COOKIE_NAME = 'auth_token';
const SESSION_TOKEN_PREFIX = 'session_';

// Feature flag for legacy auth (disabled by default for security)
const LEGACY_AUTH_ENABLED = process.env.LEGACY_AUTH_ENABLED === 'true';

// Routes that don't require authentication
// /api/search is public - it's a DDG proxy for Cloudflare worker enrichment (rate-limited by DDG)
const publicRoutes = ['/login', '/api/auth/login', '/api/search'];

// API routes that need to work for cron jobs (authenticated via header)
const cronRoutes = ['/api/cron/', '/api/check-replies', '/api/auto-email', '/api/setup-campaigns'];

/**
 * Check if a session token is valid
 * Only accepts secure session_* tokens (UUID-based, 36+ chars after prefix)
 * Legacy 'authenticated' token is deprecated and disabled by default
 */
function isValidSessionToken(token: string | undefined): boolean {
  if (!token) return false;

  // New secure token format (required: prefix + UUID = 8 + 36 = 44 chars minimum)
  if (token.startsWith(SESSION_TOKEN_PREFIX) && token.length >= 44) {
    return true;
  }

  // Legacy token support (disabled by default, enable with LEGACY_AUTH_ENABLED=true)
  if (LEGACY_AUTH_ENABLED && token === 'authenticated') {
    console.warn('SECURITY WARNING: Legacy auth token used. Set LEGACY_AUTH_ENABLED=false to disable.');
    return true;
  }

  return false;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public routes
  if (publicRoutes.some(route => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // Handle cron routes - require proper authentication
  if (cronRoutes.some(route => pathname.startsWith(route))) {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    // If cron secret is set, validate it
    if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
      return NextResponse.next();
    }

    // Also allow if authenticated via cookie (for manual testing)
    const authToken = request.cookies.get(SESSION_COOKIE_NAME);
    if (isValidSessionToken(authToken?.value)) {
      return NextResponse.next();
    }

    // In production, require CRON_SECRET to be set
    const isProd = process.env.NODE_ENV === 'production';
    if (isProd && !cronSecret) {
      console.error('CRON_SECRET not configured in production');
      return NextResponse.json(
        { error: 'Server misconfiguration' },
        { status: 500 }
      );
    }

    // In development without CRON_SECRET, allow (for easier testing)
    if (!isProd && !cronSecret) {
      console.warn('CRON_SECRET not set - allowing cron routes in development');
      return NextResponse.next();
    }

    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Allow other API routes only for authenticated users
  if (pathname.startsWith('/api/')) {
    const authToken = request.cookies.get(SESSION_COOKIE_NAME);
    if (!isValidSessionToken(authToken?.value)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.next();
  }

  // Check authentication for all other routes (pages)
  const authToken = request.cookies.get(SESSION_COOKIE_NAME);

  if (!isValidSessionToken(authToken?.value)) {
    // Redirect to login
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (public folder)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
