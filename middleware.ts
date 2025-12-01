import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Routes that don't require authentication
const publicRoutes = ['/login', '/api/auth/login'];

// API routes that need to work for cron jobs (authenticated via header)
const cronRoutes = ['/api/cron/', '/api/check-replies', '/api/auto-email', '/api/setup-campaigns'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public routes
  if (publicRoutes.some(route => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // Allow cron routes if they have the right auth header
  if (cronRoutes.some(route => pathname.startsWith(route))) {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    // If cron secret is set, validate it
    if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
      return NextResponse.next();
    }

    // Also allow if authenticated via cookie (for manual testing)
    const authToken = request.cookies.get('auth_token');
    if (authToken?.value === 'authenticated') {
      return NextResponse.next();
    }

    // If no cron secret is set, allow (for development)
    if (!cronSecret) {
      return NextResponse.next();
    }

    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Allow other API routes only for authenticated users
  if (pathname.startsWith('/api/')) {
    const authToken = request.cookies.get('auth_token');
    if (authToken?.value !== 'authenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.next();
  }

  // Check authentication for all other routes
  const authToken = request.cookies.get('auth_token');

  if (authToken?.value !== 'authenticated') {
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
