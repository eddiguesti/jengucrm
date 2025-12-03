/**
 * Safe SMTP Email Verification
 *
 * Uses the SMTP handshake protocol to verify if an email exists:
 * 1. Connect to MX server
 * 2. EHLO/HELO handshake
 * 3. MAIL FROM (our domain)
 * 4. RCPT TO (target email) - server responds if mailbox exists
 * 5. QUIT (never send actual mail)
 *
 * This is industry-standard email verification (used by Hunter, ZeroBounce, etc.)
 */

import * as dns from 'dns';
import * as net from 'net';
import { promisify } from 'util';
import { logger } from '../../logger';

const resolveMx = promisify(dns.resolveMx);

export interface SmtpVerifyResult {
  email: string;
  isValid: boolean;
  isDeliverable: boolean;
  isCatchAll: boolean;
  isDisabled: boolean;
  mxRecords: string[];
  smtpResponse?: string;
  error?: string;
  verificationMethod: 'smtp' | 'mx-only' | 'syntax-only';
}

// Rate limiting - max 1 verification per domain per second
const domainLastCheck = new Map<string, number>();
const RATE_LIMIT_MS = 1000;

// Cache results for 24 hours
const verificationCache = new Map<string, { result: SmtpVerifyResult; timestamp: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Get MX records for a domain
 */
async function getMxRecords(domain: string): Promise<string[]> {
  try {
    const records = await resolveMx(domain);
    if (!records || records.length === 0) {
      return [];
    }
    // Sort by priority (lower = preferred)
    return records
      .sort((a, b) => a.priority - b.priority)
      .map(r => r.exchange);
  } catch {
    return [];
  }
}

/**
 * Safe SMTP verification using handshake protocol
 * Does NOT send any actual email
 */
async function smtpHandshake(
  email: string,
  mxHost: string,
  timeout: number = 10000
): Promise<{ isValid: boolean; isCatchAll: boolean; response: string }> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let response = '';
    let step = 0;
    const domain = email.split('@')[1];

    const cleanup = () => {
      socket.removeAllListeners();
      socket.destroy();
    };

    const timeoutId = setTimeout(() => {
      cleanup();
      resolve({ isValid: false, isCatchAll: false, response: 'Timeout' });
    }, timeout);

    socket.on('data', (data) => {
      const line = data.toString();
      response += line;

      // Parse SMTP response code
      const code = parseInt(line.substring(0, 3), 10);

      if (step === 0 && code === 220) {
        // Server greeting received, send EHLO
        step = 1;
        socket.write(`EHLO verification.local\r\n`);
      } else if (step === 1 && code === 250) {
        // EHLO accepted, send MAIL FROM
        step = 2;
        socket.write(`MAIL FROM:<verify@verification.local>\r\n`);
      } else if (step === 2 && code === 250) {
        // MAIL FROM accepted, send RCPT TO
        step = 3;
        socket.write(`RCPT TO:<${email}>\r\n`);
      } else if (step === 3) {
        // RCPT TO response - this tells us if mailbox exists
        step = 4;
        socket.write(`QUIT\r\n`);

        clearTimeout(timeoutId);

        if (code === 250) {
          // Mailbox exists
          resolve({ isValid: true, isCatchAll: false, response: line });
        } else if (code === 550 || code === 551 || code === 552 || code === 553) {
          // Mailbox doesn't exist
          resolve({ isValid: false, isCatchAll: false, response: line });
        } else if (code === 450 || code === 451 || code === 452) {
          // Temporary failure - might be greylisting or rate limiting
          resolve({ isValid: false, isCatchAll: false, response: `Temporary: ${line}` });
        } else {
          // Unknown response - could be catch-all
          resolve({ isValid: true, isCatchAll: true, response: line });
        }
      } else if (step === 4) {
        cleanup();
      } else if (code >= 400) {
        // Error at any step
        clearTimeout(timeoutId);
        cleanup();
        resolve({ isValid: false, isCatchAll: false, response: line });
      }
    });

    socket.on('error', (err) => {
      clearTimeout(timeoutId);
      cleanup();
      resolve({ isValid: false, isCatchAll: false, response: `Error: ${err.message}` });
    });

    socket.on('close', () => {
      clearTimeout(timeoutId);
    });

    // Connect to MX server on port 25
    socket.connect(25, mxHost);
  });
}

/**
 * Check if a domain has catch-all enabled by testing a random email
 */
async function checkCatchAll(domain: string, mxHost: string): Promise<boolean> {
  const randomEmail = `nonexistent-${Date.now()}-${Math.random().toString(36).slice(2)}@${domain}`;
  const result = await smtpHandshake(randomEmail, mxHost, 8000);
  return result.isValid; // If random email is "valid", it's a catch-all
}

/**
 * Verify an email address using safe SMTP handshake
 */
export async function verifyEmailSmtp(
  email: string,
  options: { skipCatchAllCheck?: boolean; timeout?: number } = {}
): Promise<SmtpVerifyResult> {
  const normalizedEmail = email.toLowerCase().trim();
  const domain = normalizedEmail.split('@')[1];

  if (!domain) {
    return {
      email: normalizedEmail,
      isValid: false,
      isDeliverable: false,
      isCatchAll: false,
      isDisabled: false,
      mxRecords: [],
      error: 'Invalid email format',
      verificationMethod: 'syntax-only',
    };
  }

  // Check cache
  const cached = verificationCache.get(normalizedEmail);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.result;
  }

  // Rate limiting per domain
  const lastCheck = domainLastCheck.get(domain) || 0;
  const timeSinceLastCheck = Date.now() - lastCheck;
  if (timeSinceLastCheck < RATE_LIMIT_MS) {
    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_MS - timeSinceLastCheck));
  }
  domainLastCheck.set(domain, Date.now());

  // Get MX records
  const mxRecords = await getMxRecords(domain);

  if (mxRecords.length === 0) {
    const result: SmtpVerifyResult = {
      email: normalizedEmail,
      isValid: false,
      isDeliverable: false,
      isCatchAll: false,
      isDisabled: false,
      mxRecords: [],
      error: 'No MX records found',
      verificationMethod: 'mx-only',
    };
    verificationCache.set(normalizedEmail, { result, timestamp: Date.now() });
    return result;
  }

  // Try SMTP verification with primary MX
  const mxHost = mxRecords[0];

  try {
    const smtpResult = await smtpHandshake(normalizedEmail, mxHost, options.timeout || 10000);

    // Check for catch-all if not skipped and email appears valid
    let isCatchAll = smtpResult.isCatchAll;
    if (!options.skipCatchAllCheck && smtpResult.isValid && !isCatchAll) {
      isCatchAll = await checkCatchAll(domain, mxHost);
    }

    const result: SmtpVerifyResult = {
      email: normalizedEmail,
      isValid: smtpResult.isValid,
      isDeliverable: smtpResult.isValid && !isCatchAll,
      isCatchAll,
      isDisabled: false,
      mxRecords,
      smtpResponse: smtpResult.response,
      verificationMethod: 'smtp',
    };

    verificationCache.set(normalizedEmail, { result, timestamp: Date.now() });
    logger.debug({ email: normalizedEmail, result: result.isValid, catchAll: isCatchAll }, 'SMTP verification completed');

    return result;
  } catch (error) {
    const result: SmtpVerifyResult = {
      email: normalizedEmail,
      isValid: false,
      isDeliverable: false,
      isCatchAll: false,
      isDisabled: false,
      mxRecords,
      error: String(error),
      verificationMethod: 'smtp',
    };
    verificationCache.set(normalizedEmail, { result, timestamp: Date.now() });
    return result;
  }
}

/**
 * Batch verify multiple emails with rate limiting
 */
export async function verifyEmailsBatch(
  emails: string[],
  options: { concurrency?: number; skipCatchAllCheck?: boolean } = {}
): Promise<SmtpVerifyResult[]> {
  const concurrency = options.concurrency || 2;
  const results: SmtpVerifyResult[] = [];

  // Process in batches
  for (let i = 0; i < emails.length; i += concurrency) {
    const batch = emails.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(email => verifyEmailSmtp(email, { skipCatchAllCheck: options.skipCatchAllCheck }))
    );
    results.push(...batchResults);

    // Rate limit between batches
    if (i + concurrency < emails.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  return results;
}

/**
 * Clear verification cache
 */
export function clearVerificationCache(): void {
  verificationCache.clear();
}

/**
 * Get cache stats
 */
export function getVerificationCacheStats(): { size: number; oldestEntry: number | null } {
  let oldest: number | null = null;
  for (const entry of verificationCache.values()) {
    if (oldest === null || entry.timestamp < oldest) {
      oldest = entry.timestamp;
    }
  }
  return { size: verificationCache.size, oldestEntry: oldest };
}
