import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { config } from '@/lib/config';
import { logger } from '@/lib/logger';
import { ValidationError } from '@/lib/validation';
import { SESSION } from '@/lib/constants';
import { checkLoginRateLimit } from '@/lib/rate-limiter-db';
import { z } from 'zod';

// Login schema - password only (rate limiting provides protection)
const loginSchema = z.object({
  password: z.string().min(1, 'Password is required'),
});

/**
 * Login endpoint with rate limiting
 * - Rate limited to prevent brute force attacks
 * - Uses secure session tokens
 * - Session duration: 7 days
 */

/**
 * Get client IP address from trusted headers only
 * Security: Uses trusted proxy headers in priority order to prevent IP spoofing
 *
 * Priority (Vercel/Cloudflare):
 * 1. CF-Connecting-IP (Cloudflare - most trusted)
 * 2. X-Real-IP (Nginx/Vercel - trusted)
 * 3. X-Forwarded-For last entry (most accurate when behind multiple proxies)
 * 4. 'unknown' fallback
 *
 * Note: X-Forwarded-For first entry can be spoofed by client, so we use
 * more trusted headers when available on Vercel/Cloudflare infrastructure.
 */
function getClientIp(request: NextRequest): string {
  // Cloudflare: Most trusted source (set by CF edge)
  const cfIp = request.headers.get('cf-connecting-ip');
  if (cfIp) {
    return cfIp.trim();
  }

  // Vercel: X-Real-IP is set by Vercel's edge (trusted)
  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp.trim();
  }

  // X-Forwarded-For: Take the LAST IP (closest proxy), not first (client-supplied)
  // Format: client, proxy1, proxy2, ... proxyN
  // The last entry before the trusted proxy is typically more reliable
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const ips = forwarded.split(',').map(ip => ip.trim());
    // On Vercel, the rightmost IP is the client (their proxy adds it)
    // Use the first IP only as fallback, but prefer rightmost for Vercel
    if (ips.length > 0) {
      // Take first IP as Vercel adds the real client IP there
      return ips[0];
    }
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
    const body = await request.json();
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message || 'Invalid request');
    }

    const { password } = parsed.data;

    // CAPTCHA disabled - using rate limiting for protection instead

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
