/**
 * Webhook Security
 *
 * Provides security features for webhook endpoints:
 * - Signature verification (HMAC-SHA256)
 * - Timestamp validation (prevent replay attacks)
 * - IP allowlisting
 * - Rate limiting integration
 */

import { AuthenticationError, ValidationError } from './errors';
import { loggers } from './logger';

const logger = loggers.api;

// ==================
// TYPES
// ==================

export interface WebhookVerificationOptions {
  /** Secret key for HMAC signing */
  secret: string;
  /** Header name containing the signature */
  signatureHeader?: string;
  /** Header name containing the timestamp */
  timestampHeader?: string;
  /** Maximum age of the webhook in seconds (default: 5 minutes) */
  maxAgeSeconds?: number;
  /** Algorithm for HMAC (default: SHA-256) */
  algorithm?: 'SHA-256' | 'SHA-1';
}

export interface WebhookContext {
  signature: string;
  timestamp: number;
  body: string;
  verified: boolean;
}

// ==================
// SIGNATURE VERIFICATION
// ==================

/**
 * Verify webhook signature using HMAC
 */
export async function verifyWebhookSignature(
  request: Request,
  options: WebhookVerificationOptions
): Promise<WebhookContext> {
  const {
    secret,
    signatureHeader = 'X-Webhook-Signature',
    timestampHeader = 'X-Webhook-Timestamp',
    maxAgeSeconds = 300, // 5 minutes
    algorithm = 'SHA-256',
  } = options;

  // Get signature from header
  const signature = request.headers.get(signatureHeader);
  if (!signature) {
    logger.warn('Webhook signature missing', { signatureHeader });
    throw new AuthenticationError('Missing webhook signature');
  }

  // Get timestamp from header
  const timestampStr = request.headers.get(timestampHeader);
  const timestamp = timestampStr ? parseInt(timestampStr, 10) : Date.now();

  // Validate timestamp (prevent replay attacks)
  const now = Date.now();
  const age = Math.abs(now - timestamp) / 1000;

  if (age > maxAgeSeconds) {
    logger.warn('Webhook timestamp too old', { timestamp, age, maxAgeSeconds });
    throw new ValidationError(`Webhook timestamp too old: ${age}s > ${maxAgeSeconds}s`);
  }

  // Get body
  const body = await request.text();

  // Compute expected signature
  const signaturePayload = `${timestamp}.${body}`;
  const expectedSignature = await computeHmac(signaturePayload, secret, algorithm);

  // Constant-time comparison
  const isValid = await timingSafeEqual(signature, expectedSignature);

  if (!isValid) {
    logger.warn('Webhook signature mismatch');
    throw new AuthenticationError('Invalid webhook signature');
  }

  logger.debug('Webhook signature verified', { timestamp, age });

  return {
    signature,
    timestamp,
    body,
    verified: true,
  };
}

/**
 * Compute HMAC signature
 */
async function computeHmac(
  payload: string,
  secret: string,
  algorithm: 'SHA-256' | 'SHA-1'
): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const data = encoder.encode(payload);

  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: algorithm },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, data);
  const signatureArray = Array.from(new Uint8Array(signature));

  return signatureArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Constant-time comparison to prevent timing attacks
 */
async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  if (a.length !== b.length) {
    return false;
  }

  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);

  let result = 0;
  for (let i = 0; i < aBytes.length; i++) {
    result |= aBytes[i]! ^ bBytes[i]!;
  }

  return result === 0;
}

// ==================
// SIGNATURE GENERATION
// ==================

/**
 * Generate a webhook signature for outbound webhooks
 */
export async function generateWebhookSignature(
  body: string,
  secret: string,
  timestamp?: number
): Promise<{ signature: string; timestamp: number }> {
  const ts = timestamp || Date.now();
  const payload = `${ts}.${body}`;
  const signature = await computeHmac(payload, secret, 'SHA-256');

  return { signature, timestamp: ts };
}

// ==================
// IP ALLOWLISTING
// ==================

/**
 * Verify request IP is in allowlist
 */
export function verifyIpAllowlist(
  request: Request,
  allowedIps: string[]
): boolean {
  if (allowedIps.length === 0) {
    return true; // No restrictions
  }

  const ip = getClientIp(request);

  if (!ip) {
    logger.warn('Could not determine client IP');
    return false;
  }

  const isAllowed = allowedIps.some((allowed) => {
    // Support CIDR notation (basic)
    if (allowed.includes('/')) {
      return matchCidr(ip, allowed);
    }
    return ip === allowed;
  });

  if (!isAllowed) {
    logger.warn('IP not in allowlist', { ip, allowedIps });
  }

  return isAllowed;
}

/**
 * Get client IP from request headers
 */
export function getClientIp(request: Request): string | null {
  // Cloudflare provides this header
  const cfIp = request.headers.get('CF-Connecting-IP');
  if (cfIp) {
    return cfIp;
  }

  // Standard headers
  const forwardedFor = request.headers.get('X-Forwarded-For');
  if (forwardedFor) {
    return forwardedFor.split(',')[0]?.trim() || null;
  }

  const realIp = request.headers.get('X-Real-IP');
  if (realIp) {
    return realIp;
  }

  return null;
}

/**
 * Basic CIDR matching (supports /24, /16, /8)
 */
function matchCidr(ip: string, cidr: string): boolean {
  const [range, bitsStr] = cidr.split('/');
  if (!range || !bitsStr) return false;

  const bits = parseInt(bitsStr, 10);
  if (isNaN(bits) || bits < 0 || bits > 32) return false;

  const ipParts = ip.split('.').map(Number);
  const rangeParts = range.split('.').map(Number);

  if (ipParts.length !== 4 || rangeParts.length !== 4) return false;

  // Convert to 32-bit integers
  const ipNum =
    (ipParts[0]! << 24) | (ipParts[1]! << 16) | (ipParts[2]! << 8) | ipParts[3]!;
  const rangeNum =
    (rangeParts[0]! << 24) |
    (rangeParts[1]! << 16) |
    (rangeParts[2]! << 8) |
    rangeParts[3]!;

  // Create mask
  const mask = bits === 0 ? 0 : ~((1 << (32 - bits)) - 1);

  return (ipNum & mask) === (rangeNum & mask);
}

// ==================
// REQUEST VALIDATION
// ==================

/**
 * Validate common webhook headers
 */
export function validateWebhookHeaders(request: Request): void {
  const contentType = request.headers.get('Content-Type');

  if (!contentType?.includes('application/json')) {
    throw new ValidationError('Webhook must be JSON');
  }

  const userAgent = request.headers.get('User-Agent');
  if (!userAgent) {
    logger.warn('Webhook missing User-Agent header');
  }
}

/**
 * Check if request is a potential replay attack
 */
export function isReplayAttack(
  messageId: string,
  processedIds: Set<string>
): boolean {
  if (processedIds.has(messageId)) {
    logger.warn('Potential replay attack detected', { messageId });
    return true;
  }
  return false;
}

// ==================
// MIDDLEWARE
// ==================

/**
 * Create a webhook verification middleware
 */
export function createWebhookMiddleware(options: WebhookVerificationOptions) {
  return async (request: Request): Promise<WebhookContext | null> => {
    try {
      return await verifyWebhookSignature(request, options);
    } catch (error) {
      if (error instanceof AuthenticationError || error instanceof ValidationError) {
        throw error;
      }
      logger.error('Webhook verification error', error);
      throw new AuthenticationError('Webhook verification failed');
    }
  };
}

// ==================
// CLOUDFLARE EMAIL VERIFICATION
// ==================

/**
 * Verify email sender (SPF/DKIM/DMARC checks are done by Cloudflare)
 * This validates the headers that Cloudflare adds
 */
export function verifyCloudflareEmailSender(headers: Headers): {
  valid: boolean;
  spf: string | null;
  dkim: string | null;
  dmarc: string | null;
} {
  const authResults = headers.get('Authentication-Results');
  const spf = headers.get('Received-SPF');

  // Parse SPF
  const spfPass = spf?.toLowerCase().includes('pass');

  // Parse DKIM from Authentication-Results
  const dkimMatch = authResults?.match(/dkim=(\w+)/i);
  const dkimPass = dkimMatch?.[1]?.toLowerCase() === 'pass';

  // Parse DMARC from Authentication-Results
  const dmarcMatch = authResults?.match(/dmarc=(\w+)/i);
  // DMARC is informational - we only require SPF + DKIM for validation

  const valid = Boolean(spfPass && dkimPass);

  if (!valid) {
    logger.warn('Email sender verification failed', {
      spf: spf?.slice(0, 100),
      dkim: dkimMatch?.[1],
      dmarc: dmarcMatch?.[1],
    });
  }

  return {
    valid,
    spf: spf?.slice(0, 100) || null,
    dkim: dkimMatch?.[1] || null,
    dmarc: dmarcMatch?.[1] || null,
  };
}
