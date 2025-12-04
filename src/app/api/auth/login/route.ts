import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { config } from '@/lib/config';
import { logger } from '@/lib/logger';
import { ValidationError } from '@/lib/validation';
import { SESSION } from '@/lib/constants';
import { checkLoginRateLimit } from '@/lib/rate-limiter-db';
import { z } from 'zod';

// Login schema with captcha token
const loginWithCaptchaSchema = z.object({
  password: z.string().min(1, 'Password is required'),
  captchaToken: z.string().optional(),
});

/**
 * Verify Turnstile token with Cloudflare
 */
async function verifyTurnstileToken(token: string): Promise<boolean> {
  const secretKey = process.env.TURNSTILE_SECRET_KEY;

  // Skip verification if no secret key configured (dev mode)
  if (!secretKey) {
    logger.warn('Turnstile secret key not configured, skipping verification');
    return true;
  }

  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret: secretKey,
        response: token,
      }),
    });

    const result = await response.json();
    return result.success === true;
  } catch (error) {
    logger.error({ error }, 'Turnstile verification failed');
    return false;
  }
}

/**
 * Login endpoint with rate limiting and CAPTCHA
 * - Rate limited to prevent brute force attacks
 * - CAPTCHA verification to stop bots
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
    const body = await request.json();
    const parsed = loginWithCaptchaSchema.safeParse(body);

    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message || 'Invalid request');
    }

    const { password, captchaToken } = parsed.data;

    // Verify CAPTCHA token (required in production)
    if (config.isProd) {
      if (!process.env.TURNSTILE_SECRET_KEY) {
        logger.error('TURNSTILE_SECRET_KEY not configured in production - CAPTCHA verification disabled');
        // In production without CAPTCHA, we still allow login but log the security concern
        // This prevents breaking existing deployments, but the log will alert operators
      } else {
        if (!captchaToken) {
          logger.warn({ ip }, 'Login attempt without CAPTCHA token');
          return NextResponse.json(
            { success: false, error: 'Security verification required' },
            { status: 400 }
          );
        }

        const captchaValid = await verifyTurnstileToken(captchaToken);
        if (!captchaValid) {
          logger.warn({ ip }, 'Login failed - invalid CAPTCHA');
          return NextResponse.json(
            { success: false, error: 'Security verification failed. Please try again.' },
            { status: 400 }
          );
        }
      }
    }

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
