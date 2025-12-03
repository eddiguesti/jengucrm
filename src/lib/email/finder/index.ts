/**
 * Email Finder Module
 *
 * A comprehensive email discovery engine combining:
 * - Pattern-based generation (35+ patterns)
 * - Domain pattern learning
 * - Hunter.io integration
 * - SMTP verification
 * - Confidence scoring
 */

// Main finder
export { findEmail, findEmailsBatch, type EmailFinderResult, type EmailAlternative, type FindEmailOptions } from './engine';

// Pattern generation
export {
  generateEmailCandidates,
  generateEmailsFromName,
  generateCorporateEmails,
  parseFullName,
  extractDomainFromUrl,
  type NameParts,
  type EmailCandidate,
} from './patterns';

// Domain analysis
export {
  getDomainPattern,
  saveDomainPattern,
  applyPattern,
  clearPatternCache,
  type DomainPattern,
} from './domain-analyzer';

// SMTP verification
export {
  verifyEmailSmtp,
  verifyEmailsBatch,
  clearVerificationCache,
  getVerificationCacheStats,
  type SmtpVerifyResult,
} from './smtp-verify';

// Third-party services
export {
  hunterFindEmail,
  hunterDomainSearch,
  hunterVerifyEmail,
  zeroBounceVerify,
  getHunterQuota,
  getZeroBounceCredits,
  getConfiguredServices,
  type HunterEmailResult,
  type HunterDomainSearchResult,
  type HunterVerifyResult,
  type ZeroBounceResult,
} from './services';
