/**
 * Centralized configuration management
 * - Single source of truth for all environment variables
 * - Type-safe access to configuration
 * - Validation of required values
 */

function getEnv(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (value === undefined && defaultValue === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value ?? defaultValue!;
}

function getEnvOptional(key: string): string | undefined {
  return process.env[key];
}

function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

function getEnvBoolean(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

export const config = {
  // Environment
  isDev: process.env.NODE_ENV === 'development',
  isProd: process.env.NODE_ENV === 'production',
  nodeEnv: process.env.NODE_ENV || 'development',

  // AI Services
  ai: {
    get apiKey() {
      return getEnvOptional('XAI_API_KEY') || getEnvOptional('ANTHROPIC_API_KEY');
    },
    get useGrok() {
      return !!getEnvOptional('XAI_API_KEY');
    },
    get baseUrl() {
      return getEnvOptional('XAI_API_KEY') ? 'https://api.x.ai' : undefined;
    },
    get model() {
      return getEnvOptional('XAI_API_KEY')
        ? 'grok-4-1-fast-non-reasoning'
        : 'claude-sonnet-4-20250514';
    },
  },

  // Azure AD / Microsoft Graph
  azure: {
    get tenantId() { return getEnvOptional('AZURE_TENANT_ID'); },
    get clientId() { return getEnvOptional('AZURE_CLIENT_ID'); },
    get clientSecret() { return getEnvOptional('AZURE_CLIENT_SECRET'); },
    get mailFrom() { return getEnv('AZURE_MAIL_FROM', 'edd@jengu.ai'); },
    get mailFromName() { return getEnv('AZURE_MAIL_FROM_NAME', 'Edward Guest'); },
    get isConfigured() {
      return !!(this.tenantId && this.clientId && this.clientSecret);
    },
  },

  // Supabase
  supabase: {
    get url() { return getEnv('NEXT_PUBLIC_SUPABASE_URL'); },
    get anonKey() { return getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'); },
    get serviceRoleKey() { return getEnvOptional('SUPABASE_SERVICE_ROLE_KEY'); },
  },

  // SMTP Inboxes
  smtp: {
    get dailyLimit() { return getEnvNumber('SMTP_DAILY_LIMIT', 20); },
    get inboxes() {
      const inboxes: Array<{
        email: string;
        password: string;
        host: string;
        port: number;
        displayName: string;
      }> = [];

      for (let i = 1; i <= 10; i++) {
        const config = getEnvOptional(`SMTP_INBOX_${i}`);
        if (!config) continue;

        const [email, password, host, port, displayName] = config.split('|');
        if (email && password && host && port) {
          inboxes.push({
            email,
            password,
            host,
            port: parseInt(port, 10),
            displayName: displayName || 'Jengu',
          });
        }
      }
      return inboxes;
    },
  },

  // Gmail (Mystery Shopper)
  gmail: {
    get user() { return getEnvOptional('GMAIL_SMTP_USER'); },
    get password() { return getEnvOptional('GMAIL_SMTP_PASS'); },
    get isConfigured() { return !!(this.user && this.password); },
  },

  // Google Places
  google: {
    get placesApiKey() { return getEnvOptional('GOOGLE_PLACES_API_KEY'); },
  },

  // Scraping
  scraper: {
    get apiKey() { return getEnvOptional('SCRAPERAPI_KEY'); },
  },

  // Hunter.io
  hunter: {
    get apiKey() { return getEnvOptional('HUNTER_API_KEY'); },
  },

  // Security
  security: {
    get cronSecret() { return getEnvOptional('CRON_SECRET'); },
    get appPassword() { return getEnv('APP_PASSWORD', 'JenguCRMbeta1!'); },
  },

  // Notifications
  notifications: {
    get email() { return getEnv('NOTIFICATION_EMAIL', 'edd@jengu.ai'); },
    get testEmail() { return getEnvOptional('TEST_EMAIL_ADDRESS'); },
  },

  // Rate Limits (free tier)
  rateLimits: {
    googlePlaces: getEnvNumber('RATE_LIMIT_GOOGLE_PLACES', 300),
    xaiEmails: getEnvNumber('RATE_LIMIT_XAI_EMAILS', 100),
    scrapeRuns: getEnvNumber('RATE_LIMIT_SCRAPE_RUNS', 10),
  },
} as const;

export default config;
