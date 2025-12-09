/**
 * Feature Flags
 * Centralized feature flag management for safe rollouts
 *
 * Usage:
 *   import { flags } from '@/lib/feature-flags';
 *   if (flags.AI_CACHING_ENABLED) { ... }
 */

/**
 * Feature flags configuration
 * All flags default to safe values (usually disabled for new features)
 */
export const flags = {
  /**
   * Legacy authentication token support
   * When disabled, only session_* tokens are accepted
   * @deprecated Will be removed in next major version
   */
  LEGACY_AUTH_ENABLED: process.env.LEGACY_AUTH_ENABLED === 'true',

  /**
   * AI response caching
   * Caches similar AI prompts to reduce costs and latency
   */
  AI_CACHING_ENABLED: process.env.AI_CACHING_ENABLED !== 'false',

  /**
   * AI cost tracking and alerts
   * Tracks AI API costs and alerts when thresholds are exceeded
   */
  AI_COST_TRACKING_ENABLED: process.env.AI_COST_TRACKING_ENABLED !== 'false',

  /**
   * New rate limiter with improved IP detection
   * Uses trusted proxy headers only (CF-Connecting-IP, X-Real-IP)
   */
  SECURE_RATE_LIMITER: process.env.SECURE_RATE_LIMITER !== 'false',

  /**
   * API route rate limiting
   * Applies rate limits to all API endpoints
   */
  API_RATE_LIMITING: process.env.API_RATE_LIMITING !== 'false',

  /**
   * Strict error handling
   * Prevents error details from leaking in production
   */
  STRICT_ERROR_HANDLING: process.env.STRICT_ERROR_HANDLING !== 'false',

  /**
   * AI Gateway usage
   * Routes all AI calls through centralized gateway
   */
  USE_AI_GATEWAY: process.env.USE_AI_GATEWAY !== 'false',

  /**
   * Enhanced visibility features (Phase 2)
   * These add read-only UI components for better system observability
   */
  SHOW_SYSTEM_HEALTH: process.env.SHOW_SYSTEM_HEALTH !== 'false',
  SHOW_RESPONSE_TIMES: process.env.SHOW_RESPONSE_TIMES !== 'false',
  SHOW_ENHANCED_FUNNEL: process.env.SHOW_ENHANCED_FUNNEL !== 'false',
} as const;

/**
 * Check if a feature flag is enabled
 */
export function isEnabled(flag: keyof typeof flags): boolean {
  return flags[flag];
}

/**
 * Get all feature flags for debugging/monitoring
 */
export function getAllFlags(): Record<string, boolean> {
  return { ...flags };
}

export default flags;
