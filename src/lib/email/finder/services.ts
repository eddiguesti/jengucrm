/**
 * Third-Party Email Finding Services Integration
 *
 * Integrates with:
 * - Hunter.io - Email finder and verifier
 * - Clearbit (planned)
 * - Apollo.io (planned)
 * - ZeroBounce (planned)
 */

import { logger } from '../../logger';

// API Keys from environment
const HUNTER_API_KEY = process.env.HUNTER_API_KEY;
const ZEROBOUNCE_API_KEY = process.env.ZEROBOUNCE_API_KEY;
const MILLIONVERIFIER_API_KEY = process.env.MILLIONVERIFIER_API_KEY;

export interface HunterEmailResult {
  email: string;
  score: number; // 0-100
  sources: { domain: string; uri: string; extractedOn: string }[];
  firstName: string;
  lastName: string;
  position?: string;
  company?: string;
  twitter?: string;
  linkedin?: string;
  phoneNumber?: string;
}

export interface HunterDomainSearchResult {
  domain: string;
  emails: HunterEmailResult[];
  pattern?: string;
  organization?: string;
  webmail: boolean;
  acceptAll: boolean; // catch-all
}

export interface HunterVerifyResult {
  email: string;
  result: 'deliverable' | 'undeliverable' | 'risky' | 'unknown';
  score: number;
  regexp: boolean;
  gibberish: boolean;
  disposable: boolean;
  webmail: boolean;
  mxRecords: boolean;
  smtpServer: boolean;
  smtpCheck: boolean;
  acceptAll: boolean;
  block: boolean;
  sources: { domain: string; uri: string }[];
}

export interface ZeroBounceResult {
  email: string;
  status: 'valid' | 'invalid' | 'catch-all' | 'unknown' | 'spamtrap' | 'abuse' | 'do_not_mail';
  subStatus: string;
  freeEmail: boolean;
  didYouMean?: string;
  account?: string;
  domain?: string;
  domainAgeDays?: string;
  smtpProvider?: string;
  mxRecord?: string;
  mxFound?: boolean;
  firstName?: string;
  lastName?: string;
  gender?: string;
  city?: string;
  region?: string;
  zipCode?: string;
  country?: string;
  processedAt?: string;
}

/**
 * MillionVerifier API result
 * Result codes:
 * 1 = ok (valid)
 * 2 = catch_all
 * 3 = unknown
 * 4 = error
 * 5 = disposable
 * 6 = invalid
 */
export interface MillionVerifierResult {
  email: string;
  result: 'ok' | 'catch_all' | 'unknown' | 'error' | 'disposable' | 'invalid';
  resultcode: number;
  subresult: string;
  free: boolean;
  role: boolean;  // true if generic/role email (info@, support@, etc.)
  credits: number;  // remaining credits
}

/**
 * Hunter.io - Find email by name and domain
 */
export async function hunterFindEmail(
  firstName: string,
  lastName: string,
  domain: string
): Promise<HunterEmailResult | null> {
  if (!HUNTER_API_KEY) {
    logger.debug('Hunter.io API key not configured');
    return null;
  }

  try {
    const params = new URLSearchParams({
      domain,
      first_name: firstName,
      last_name: lastName,
      api_key: HUNTER_API_KEY,
    });

    const response = await fetch(
      `https://api.hunter.io/v2/email-finder?${params}`,
      { method: 'GET' }
    );

    if (!response.ok) {
      const error = await response.text();
      logger.warn({ status: response.status, error }, 'Hunter.io email finder failed');
      return null;
    }

    const data = await response.json();

    if (!data.data?.email) {
      return null;
    }

    return {
      email: data.data.email,
      score: data.data.score || 0,
      sources: data.data.sources || [],
      firstName: data.data.first_name || firstName,
      lastName: data.data.last_name || lastName,
      position: data.data.position,
      company: data.data.company,
      twitter: data.data.twitter,
      linkedin: data.data.linkedin_url,
      phoneNumber: data.data.phone_number,
    };
  } catch (error) {
    logger.error({ error, domain, firstName, lastName }, 'Hunter.io find email error');
    return null;
  }
}

/**
 * Hunter.io - Search domain for all emails
 */
export async function hunterDomainSearch(
  domain: string,
  options: { type?: 'personal' | 'generic'; limit?: number } = {}
): Promise<HunterDomainSearchResult | null> {
  if (!HUNTER_API_KEY) {
    logger.debug('Hunter.io API key not configured');
    return null;
  }

  try {
    const params = new URLSearchParams({
      domain,
      api_key: HUNTER_API_KEY,
      limit: String(options.limit || 10),
    });

    if (options.type) {
      params.set('type', options.type);
    }

    const response = await fetch(
      `https://api.hunter.io/v2/domain-search?${params}`,
      { method: 'GET' }
    );

    if (!response.ok) {
      const error = await response.text();
      logger.warn({ status: response.status, error }, 'Hunter.io domain search failed');
      return null;
    }

    const data = await response.json();

    return {
      domain,
      emails: (data.data?.emails || []).map((e: Record<string, unknown>) => ({
        email: e.value,
        score: e.confidence || 0,
        sources: e.sources || [],
        firstName: e.first_name || '',
        lastName: e.last_name || '',
        position: e.position,
        company: data.data?.organization,
      })),
      pattern: data.data?.pattern,
      organization: data.data?.organization,
      webmail: data.data?.webmail || false,
      acceptAll: data.data?.accept_all || false,
    };
  } catch (error) {
    logger.error({ error, domain }, 'Hunter.io domain search error');
    return null;
  }
}

/**
 * Hunter.io - Verify email deliverability
 */
export async function hunterVerifyEmail(email: string): Promise<HunterVerifyResult | null> {
  if (!HUNTER_API_KEY) {
    logger.debug('Hunter.io API key not configured');
    return null;
  }

  try {
    const params = new URLSearchParams({
      email,
      api_key: HUNTER_API_KEY,
    });

    const response = await fetch(
      `https://api.hunter.io/v2/email-verifier?${params}`,
      { method: 'GET' }
    );

    if (!response.ok) {
      const error = await response.text();
      logger.warn({ status: response.status, error }, 'Hunter.io verify failed');
      return null;
    }

    const data = await response.json();
    const d = data.data;

    return {
      email: d.email,
      result: d.result,
      score: d.score || 0,
      regexp: d.regexp || false,
      gibberish: d.gibberish || false,
      disposable: d.disposable || false,
      webmail: d.webmail || false,
      mxRecords: d.mx_records || false,
      smtpServer: d.smtp_server || false,
      smtpCheck: d.smtp_check || false,
      acceptAll: d.accept_all || false,
      block: d.block || false,
      sources: d.sources || [],
    };
  } catch (error) {
    logger.error({ error, email }, 'Hunter.io verify error');
    return null;
  }
}

/**
 * ZeroBounce - Verify email (more accurate than Hunter for some domains)
 */
export async function zeroBounceVerify(email: string): Promise<ZeroBounceResult | null> {
  if (!ZEROBOUNCE_API_KEY) {
    logger.debug('ZeroBounce API key not configured');
    return null;
  }

  try {
    const params = new URLSearchParams({
      api_key: ZEROBOUNCE_API_KEY,
      email,
    });

    const response = await fetch(
      `https://api.zerobounce.net/v2/validate?${params}`,
      { method: 'GET' }
    );

    if (!response.ok) {
      const error = await response.text();
      logger.warn({ status: response.status, error }, 'ZeroBounce verify failed');
      return null;
    }

    const data = await response.json();

    return {
      email: data.address || email,
      status: data.status?.toLowerCase() || 'unknown',
      subStatus: data.sub_status || '',
      freeEmail: data.free_email === 'True' || data.free_email === true,
      didYouMean: data.did_you_mean,
      account: data.account,
      domain: data.domain,
      domainAgeDays: data.domain_age_days,
      smtpProvider: data.smtp_provider,
      mxRecord: data.mx_record,
      mxFound: data.mx_found === 'true' || data.mx_found === true,
      firstName: data.firstname,
      lastName: data.lastname,
      gender: data.gender,
      city: data.city,
      region: data.region,
      zipCode: data.zipcode,
      country: data.country,
      processedAt: data.processed_at,
    };
  } catch (error) {
    logger.error({ error, email }, 'ZeroBounce verify error');
    return null;
  }
}

/**
 * MillionVerifier - Fast, cheap email verification
 * $0.0039 per verification (500 credits = ~$2)
 *
 * Results:
 * - ok: Valid email that will receive mail
 * - catch_all: Domain accepts all emails (can't verify individual)
 * - unknown: Could not verify (temporary issue)
 * - error: Verification failed
 * - disposable: Temporary/throwaway email
 * - invalid: Email does not exist
 */
export async function millionVerifierVerify(email: string): Promise<MillionVerifierResult | null> {
  if (!MILLIONVERIFIER_API_KEY) {
    logger.debug('MillionVerifier API key not configured');
    return null;
  }

  try {
    const params = new URLSearchParams({
      api: MILLIONVERIFIER_API_KEY,
      email,
      timeout: '10',  // 10 second timeout
    });

    const response = await fetch(
      `https://api.millionverifier.com/api/v3/?${params}`,
      { method: 'GET' }
    );

    if (!response.ok) {
      const error = await response.text();
      logger.warn({ status: response.status, error }, 'MillionVerifier verify failed');
      return null;
    }

    const data = await response.json();

    logger.debug({
      email,
      result: data.result,
      subresult: data.subresult,
      role: data.role,
      credits: data.credits,
    }, 'MillionVerifier result');

    return {
      email: data.email || email,
      result: data.result,
      resultcode: data.resultcode,
      subresult: data.subresult || '',
      free: data.free === true,
      role: data.role === true,
      credits: data.credits || 0,
    };
  } catch (error) {
    logger.error({ error, email }, 'MillionVerifier verify error');
    return null;
  }
}

/**
 * Check MillionVerifier remaining credits
 */
export async function getMillionVerifierCredits(): Promise<number | null> {
  if (!MILLIONVERIFIER_API_KEY) {
    return null;
  }

  try {
    // MillionVerifier returns credits in every response
    // Use a test email to check credits
    const result = await millionVerifierVerify('test@test.com');
    return result?.credits ?? null;
  } catch {
    return null;
  }
}

/**
 * Check Hunter.io API quota
 */
export async function getHunterQuota(): Promise<{ used: number; available: number } | null> {
  if (!HUNTER_API_KEY) {
    return null;
  }

  try {
    const response = await fetch(
      `https://api.hunter.io/v2/account?api_key=${HUNTER_API_KEY}`,
      { method: 'GET' }
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return {
      used: data.data?.requests?.searches?.used || 0,
      available: data.data?.requests?.searches?.available || 0,
    };
  } catch {
    return null;
  }
}

/**
 * Check ZeroBounce API credits
 */
export async function getZeroBounceCredits(): Promise<number | null> {
  if (!ZEROBOUNCE_API_KEY) {
    return null;
  }

  try {
    const response = await fetch(
      `https://api.zerobounce.net/v2/getcredits?api_key=${ZEROBOUNCE_API_KEY}`,
      { method: 'GET' }
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return parseInt(data.Credits, 10) || 0;
  } catch {
    return null;
  }
}

/**
 * Check which services are configured
 */
export function getConfiguredServices(): string[] {
  const services: string[] = [];
  if (HUNTER_API_KEY) services.push('hunter');
  if (ZEROBOUNCE_API_KEY) services.push('zerobounce');
  if (MILLIONVERIFIER_API_KEY) services.push('millionverifier');
  return services;
}
