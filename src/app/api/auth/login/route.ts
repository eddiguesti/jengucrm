import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { config } from '@/lib/config';
import { logger } from '@/lib/logger';
import { parseBody, loginSchema, ValidationError } from '@/lib/validation';
import { SESSION } from '@/lib/constants';
import { checkLoginRateLimit } from '@/lib/rate-limiter-db';

/**
 * Login endpoint with rate limiting
 * - Rate limited to prevent brute force attacks
 * - Uses secure session tokens
 * - Shorter session duration (7 days instead of 30)
 */

function getClientIp(request: NextRequest): string {
  // Get IP from various headers (Vercel, Cloudflare, etc.)
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp;
  }
  return 'unknown';
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);

  try {
    // Check rate limit first
    const rateLimit = await checkLoginRateLimit(ip);

    if (!rateLimit.allowed) {
      logger.warn({ ip, resetAt: rateLimit.resetAt }, 'Login rate limit exceeded');

      return NextResponse.json(
        {
          success: false,
          error: 'Too many login attempts. Please try again later.',
          retryAfter: Math.ceil((rateLimit.resetAt.getTime() - Date.now()) / 1000),
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil((rateLimit.resetAt.getTime() - Date.now()) / 1000)),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': rateLimit.resetAt.toISOString(),
          },
        }
      );
    }

    // Parse and validate request body
    const { password } = await parseBody(request, loginSchema);

    if (password === config.security.appPassword) {
      // Generate a session token (better than static 'authenticated')
      const sessionToken = `${SESSION.TOKEN_PREFIX}${crypto.randomUUID()}`;

      // Set a secure cookie
      const cookieStore = await cookies();
      cookieStore.set(SESSION.COOKIE_NAME, sessionToken, {
        httpOnly: true,
        secure: config.isProd,
        sameSite: 'lax',
        maxAge: SESSION.DURATION_SECONDS,
        path: '/',
      });

      logger.info({ ip }, 'Login successful');

      return NextResponse.json({
        success: true,
        expiresIn: SESSION.DURATION_SECONDS,
      });
    }

    logger.warn({ ip }, 'Login failed - invalid password');

    return NextResponse.json(
      { success: false, error: 'Invalid password' },
      { status: 401 }
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 400 }
      );
    }

    logger.error({ ip, error }, 'Login error');

    return NextResponse.json(
      { success: false, error: 'Invalid request' },
      { status: 400 }
    );
  }
}

export async function DELETE() {
  // Logout - clear the cookie
  const cookieStore = await cookies();
  cookieStore.delete(SESSION.COOKIE_NAME);

  logger.info('User logged out');

  return NextResponse.json({ success: true });
}
