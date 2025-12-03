/**
 * Email Finder Engine
 *
 * World-class email discovery system that combines:
 * 1. Pattern-based email generation
 * 2. Domain pattern analysis
 * 3. Hunter.io API (direct lookup + domain search)
 * 4. SMTP verification (mailbox existence)
 * 5. Confidence scoring with multiple signals
 *
 * Returns the most likely valid email with confidence score
 */

import { logger } from '../../logger';
import { generateEmailsFromName, extractDomainFromUrl, parseFullName, type EmailCandidate } from './patterns';
import { getDomainPattern, applyPattern, saveDomainPattern, type DomainPattern } from './domain-analyzer';
import { hunterFindEmail, hunterVerifyEmail, getConfiguredServices, type HunterEmailResult, type HunterVerifyResult } from './services';
import { verifyEmailSmtp, type SmtpVerifyResult } from './smtp-verify';
import { canSendTo } from '../verification';

export interface EmailFinderResult {
  email: string | null;
  confidence: number; // 0-100
  confidenceLevel: 'high' | 'medium' | 'low' | 'very_low';
  isVerified: boolean;
  verificationMethod: 'hunter' | 'smtp' | 'pattern_only' | 'none';
  alternatives: EmailAlternative[];
  metadata: {
    domainPattern?: string;
    domainCatchAll?: boolean;
    hunterScore?: number;
    smtpValid?: boolean;
    sources: string[];
    warnings: string[];
  };
  searchDuration: number;
}

export interface EmailAlternative {
  email: string;
  confidence: number;
  reason: string;
}

export interface FindEmailOptions {
  // Name (required)
  fullName?: string;
  firstName?: string;
  lastName?: string;

  // Domain (one required)
  domain?: string;
  website?: string;
  companyName?: string;

  // Verification options
  verifySmtp?: boolean; // Enable SMTP verification (default: true)
  useHunter?: boolean; // Use Hunter.io (default: true if configured)
  maxCandidates?: number; // Max emails to verify (default: 5)
  timeout?: number; // Verification timeout ms (default: 15000)
}

/**
 * Calculate confidence score from multiple signals
 */
function calculateConfidence(signals: {
  hunterFound: boolean;
  hunterScore?: number;
  smtpVerified: boolean;
  smtpDeliverable?: boolean;
  patternMatch: boolean;
  patternConfidence?: number;
  domainCatchAll: boolean;
  hasMultipleSources: boolean;
}): number {
  let score = 0;

  // Hunter.io found email (major signal)
  if (signals.hunterFound) {
    score += 30;
    if (signals.hunterScore) {
      score += Math.min(signals.hunterScore * 0.3, 30); // Up to +30 from Hunter score
    }
  }

  // SMTP verification (strongest signal)
  if (signals.smtpVerified) {
    if (signals.smtpDeliverable) {
      score += 40; // Deliverable = +40
    } else if (!signals.domainCatchAll) {
      score += 25; // Valid but unknown deliverability = +25
    } else {
      score += 10; // Catch-all domain, can't verify = +10
    }
  }

  // Pattern match from domain analysis
  if (signals.patternMatch) {
    const patternBonus = signals.patternConfidence
      ? (signals.patternConfidence / 100) * 15
      : 10;
    score += patternBonus;
  }

  // Multiple sources confirm
  if (signals.hasMultipleSources) {
    score += 10;
  }

  // Penalize catch-all domains (can't truly verify)
  if (signals.domainCatchAll) {
    score = Math.min(score, 70); // Cap at 70 for catch-all
  }

  return Math.min(Math.round(score), 100);
}

/**
 * Get confidence level from score
 */
function getConfidenceLevel(score: number): 'high' | 'medium' | 'low' | 'very_low' {
  if (score >= 80) return 'high';
  if (score >= 60) return 'medium';
  if (score >= 40) return 'low';
  return 'very_low';
}

/**
 * Main email finder function
 */
export async function findEmail(options: FindEmailOptions): Promise<EmailFinderResult> {
  const startTime = Date.now();
  const sources: string[] = [];
  const warnings: string[] = [];

  // Parse name
  let firstName = options.firstName || '';
  let lastName = options.lastName || '';

  if (options.fullName) {
    const parsed = parseFullName(options.fullName);
    firstName = firstName || parsed.firstName;
    lastName = lastName || parsed.lastName;
  }

  if (!firstName) {
    return {
      email: null,
      confidence: 0,
      confidenceLevel: 'very_low',
      isVerified: false,
      verificationMethod: 'none',
      alternatives: [],
      metadata: { sources, warnings: ['First name is required'] },
      searchDuration: Date.now() - startTime,
    };
  }

  // Get domain
  let domain = options.domain;
  if (!domain && options.website) {
    domain = extractDomainFromUrl(options.website) || undefined;
  }
  if (!domain && options.companyName) {
    // Try common domain patterns from company name
    const cleanCompany = options.companyName.toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 30);
    domain = `${cleanCompany}.com`; // Guess .com - will verify
    warnings.push('Domain guessed from company name');
  }

  if (!domain) {
    return {
      email: null,
      confidence: 0,
      confidenceLevel: 'very_low',
      isVerified: false,
      verificationMethod: 'none',
      alternatives: [],
      metadata: { sources, warnings: ['Domain is required'] },
      searchDuration: Date.now() - startTime,
    };
  }

  const useHunter = options.useHunter !== false && getConfiguredServices().includes('hunter');
  const verifySmtp = options.verifySmtp !== false;
  const maxCandidates = options.maxCandidates || 5;

  let bestResult: {
    email: string;
    confidence: number;
    isVerified: boolean;
    verificationMethod: 'hunter' | 'smtp' | 'pattern_only';
    hunterScore?: number;
    smtpResult?: SmtpVerifyResult;
  } | null = null;

  const alternatives: EmailAlternative[] = [];
  let domainPattern: DomainPattern | null = null;
  let domainCatchAll = false;

  // Step 1: Try Hunter.io direct lookup (fastest if available)
  if (useHunter && lastName) {
    sources.push('hunter_finder');
    const hunterResult = await hunterFindEmail(firstName, lastName, domain);

    if (hunterResult && hunterResult.email) {
      logger.info({ email: hunterResult.email, score: hunterResult.score }, 'Hunter found email');

      // Verify with Hunter's verification API for extra confidence
      let verifyResult: HunterVerifyResult | null = null;
      if (hunterResult.score < 90) {
        verifyResult = await hunterVerifyEmail(hunterResult.email);
      }

      const hunterConfidence = calculateConfidence({
        hunterFound: true,
        hunterScore: verifyResult?.score || hunterResult.score,
        smtpVerified: verifyResult?.smtpCheck || false,
        smtpDeliverable: verifyResult?.result === 'deliverable',
        patternMatch: false,
        domainCatchAll: verifyResult?.acceptAll || false,
        hasMultipleSources: (hunterResult.sources?.length || 0) > 1,
      });

      bestResult = {
        email: hunterResult.email,
        confidence: hunterConfidence,
        isVerified: verifyResult?.smtpCheck || hunterResult.score >= 90,
        verificationMethod: 'hunter',
        hunterScore: hunterResult.score,
      };

      domainCatchAll = verifyResult?.acceptAll || false;

      // If Hunter is very confident, we can return early
      if (hunterConfidence >= 85) {
        return {
          email: bestResult.email,
          confidence: bestResult.confidence,
          confidenceLevel: getConfidenceLevel(bestResult.confidence),
          isVerified: bestResult.isVerified,
          verificationMethod: 'hunter',
          alternatives,
          metadata: {
            domainPattern: undefined,
            domainCatchAll,
            hunterScore: hunterResult.score,
            sources,
            warnings,
          },
          searchDuration: Date.now() - startTime,
        };
      }
    }
  }

  // Step 2: Get domain pattern for pattern-based generation
  sources.push('domain_pattern');
  domainPattern = await getDomainPattern(domain);

  if (domainPattern) {
    domainCatchAll = domainCatchAll || domainPattern.isCatchAll;
    logger.debug({ domain, pattern: domainPattern.pattern, confidence: domainPattern.confidence }, 'Domain pattern found');
  }

  // Step 3: Generate email candidates
  sources.push('pattern_generation');
  let candidates: EmailCandidate[];

  if (domainPattern && domainPattern.pattern !== 'unknown' && domainPattern.confidence >= 60 && lastName) {
    // Use known pattern first, then fallback to generated
    const patternEmail = applyPattern(domainPattern.pattern, firstName, lastName, domain);
    candidates = [
      { email: patternEmail, pattern: domainPattern.pattern, priority: 0 },
      ...generateEmailsFromName(`${firstName} ${lastName}`, domain)
        .filter(c => c.email !== patternEmail)
        .slice(0, maxCandidates - 1),
    ];
  } else {
    candidates = generateEmailsFromName(`${firstName} ${lastName}`, domain).slice(0, maxCandidates);
  }

  if (candidates.length === 0) {
    // No candidates possible (likely missing last name)
    if (bestResult) {
      return {
        email: bestResult.email,
        confidence: bestResult.confidence,
        confidenceLevel: getConfidenceLevel(bestResult.confidence),
        isVerified: bestResult.isVerified,
        verificationMethod: bestResult.verificationMethod,
        alternatives,
        metadata: {
          domainPattern: domainPattern?.pattern,
          domainCatchAll,
          hunterScore: bestResult.hunterScore,
          sources,
          warnings: [...warnings, 'No candidates generated - missing last name?'],
        },
        searchDuration: Date.now() - startTime,
      };
    }

    return {
      email: null,
      confidence: 0,
      confidenceLevel: 'very_low',
      isVerified: false,
      verificationMethod: 'none',
      alternatives: [],
      metadata: { sources, warnings: [...warnings, 'Could not generate email candidates'] },
      searchDuration: Date.now() - startTime,
    };
  }

  // Step 4: SMTP verification of candidates
  if (verifySmtp) {
    sources.push('smtp_verification');

    for (const candidate of candidates) {
      // Skip if already found by Hunter with same email
      if (bestResult?.email === candidate.email) continue;

      // Check if we can send to this email (not bounced/blacklisted)
      const canSend = await canSendTo(candidate.email);
      if (!canSend.canSend) {
        warnings.push(`${candidate.email}: ${canSend.reason}`);
        continue;
      }

      const smtpResult = await verifyEmailSmtp(candidate.email, {
        timeout: options.timeout || 15000,
        skipCatchAllCheck: domainCatchAll, // Already know it's catch-all
      });

      const isPatternMatch = domainPattern?.pattern === candidate.pattern;
      const smtpConfidence = calculateConfidence({
        hunterFound: false,
        smtpVerified: smtpResult.isValid,
        smtpDeliverable: smtpResult.isDeliverable,
        patternMatch: isPatternMatch,
        patternConfidence: isPatternMatch ? domainPattern?.confidence : undefined,
        domainCatchAll: smtpResult.isCatchAll || domainCatchAll,
        hasMultipleSources: false,
      });

      if (smtpResult.isValid && smtpResult.isDeliverable) {
        // Found a deliverable email via SMTP
        if (!bestResult || smtpConfidence > bestResult.confidence) {
          bestResult = {
            email: candidate.email,
            confidence: smtpConfidence,
            isVerified: true,
            verificationMethod: 'smtp',
            smtpResult,
          };
        } else {
          alternatives.push({
            email: candidate.email,
            confidence: smtpConfidence,
            reason: 'SMTP verified',
          });
        }
      } else if (smtpResult.isValid && !smtpResult.isCatchAll) {
        // Valid but not deliverable (might be greylisting or rate limiting)
        alternatives.push({
          email: candidate.email,
          confidence: Math.max(smtpConfidence - 20, 20),
          reason: 'SMTP valid but delivery uncertain',
        });
      }

      // Early exit if we found a high-confidence result
      if (bestResult && bestResult.confidence >= 85) {
        break;
      }
    }
  }

  // Step 5: If no verified result, use pattern-based with lower confidence
  if (!bestResult && candidates.length > 0) {
    const topCandidate = candidates[0];
    const isPatternMatch = domainPattern?.pattern === topCandidate.pattern;

    bestResult = {
      email: topCandidate.email,
      confidence: calculateConfidence({
        hunterFound: false,
        smtpVerified: false,
        patternMatch: isPatternMatch,
        patternConfidence: isPatternMatch ? domainPattern?.confidence : undefined,
        domainCatchAll,
        hasMultipleSources: false,
      }),
      isVerified: false,
      verificationMethod: 'pattern_only',
    };

    // Add other candidates as alternatives
    for (const candidate of candidates.slice(1, 4)) {
      alternatives.push({
        email: candidate.email,
        confidence: Math.max(bestResult.confidence - 10 - (candidate.priority * 2), 10),
        reason: `Pattern: ${candidate.pattern}`,
      });
    }
  }

  // Save successful pattern discovery
  if (bestResult && bestResult.confidence >= 70 && domainPattern && !domainPattern.pattern) {
    const usedCandidate = candidates.find(c => c.email === bestResult!.email);
    if (usedCandidate) {
      saveDomainPattern({
        ...domainPattern,
        pattern: usedCandidate.pattern,
        confidence: bestResult.confidence,
        sampleSize: (domainPattern.sampleSize || 0) + 1,
        lastUpdated: new Date(),
      }).catch(() => {}); // Fire and forget
    }
  }

  const finalResult: EmailFinderResult = {
    email: bestResult?.email || null,
    confidence: bestResult?.confidence || 0,
    confidenceLevel: getConfidenceLevel(bestResult?.confidence || 0),
    isVerified: bestResult?.isVerified || false,
    verificationMethod: bestResult?.verificationMethod || 'none',
    alternatives: alternatives.slice(0, 5),
    metadata: {
      domainPattern: domainPattern?.pattern,
      domainCatchAll,
      hunterScore: bestResult?.hunterScore,
      smtpValid: bestResult?.smtpResult?.isValid,
      sources,
      warnings,
    },
    searchDuration: Date.now() - startTime,
  };

  logger.info({
    name: `${firstName} ${lastName}`,
    domain,
    email: finalResult.email,
    confidence: finalResult.confidence,
    duration: finalResult.searchDuration,
  }, 'Email finder completed');

  return finalResult;
}

/**
 * Bulk find emails with rate limiting
 */
export async function findEmailsBatch(
  prospects: Array<{
    fullName?: string;
    firstName?: string;
    lastName?: string;
    domain?: string;
    website?: string;
  }>,
  options: { concurrency?: number } & Omit<FindEmailOptions, 'fullName' | 'firstName' | 'lastName' | 'domain' | 'website'> = {}
): Promise<EmailFinderResult[]> {
  const concurrency = options.concurrency || 2;
  const results: EmailFinderResult[] = [];

  for (let i = 0; i < prospects.length; i += concurrency) {
    const batch = prospects.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(p => findEmail({ ...options, ...p }))
    );
    results.push(...batchResults);

    // Rate limit between batches
    if (i + concurrency < prospects.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  return results;
}
