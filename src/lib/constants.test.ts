import { describe, it, expect } from 'vitest';
import {
  EMAIL,
  SCORING,
  PAGINATION,
  RATE_LIMITS,
  FAKE_EMAIL_PATTERNS,
  GENERIC_CORPORATE_EMAILS,
  TIMEOUTS,
  SESSION,
} from './constants';

describe('Constants', () => {
  describe('EMAIL', () => {
    it('should have reasonable delay values', () => {
      expect(EMAIL.MIN_DELAY).toBeGreaterThan(0);
      expect(EMAIL.STAGGER_DELAY_MIN).toBeLessThan(EMAIL.STAGGER_DELAY_MAX);
    });

    it('should have max follow-ups defined', () => {
      expect(EMAIL.MAX_FOLLOW_UPS).toBeGreaterThan(0);
      expect(EMAIL.MAX_FOLLOW_UPS).toBeLessThanOrEqual(5);
    });

    it('should have follow-up days array', () => {
      expect(EMAIL.FOLLOW_UP_DAYS).toHaveLength(2);
      expect(EMAIL.FOLLOW_UP_DAYS[0]).toBeLessThan(EMAIL.FOLLOW_UP_DAYS[1]);
    });
  });

  describe('SCORING', () => {
    it('should have tier thresholds in order', () => {
      expect(SCORING.HOT_THRESHOLD).toBeGreaterThan(SCORING.WARM_THRESHOLD);
      expect(SCORING.WARM_THRESHOLD).toBeGreaterThan(0);
    });

    it('should have auto email min score', () => {
      expect(SCORING.AUTO_EMAIL_MIN_SCORE).toBeGreaterThan(0);
      expect(SCORING.AUTO_EMAIL_MIN_SCORE).toBeLessThanOrEqual(100);
    });

    it('should have max score of 100', () => {
      expect(SCORING.MAX_SCORE).toBe(100);
    });
  });

  describe('PAGINATION', () => {
    it('should have sensible defaults', () => {
      expect(PAGINATION.DEFAULT_LIMIT).toBeGreaterThan(0);
      expect(PAGINATION.MAX_LIMIT).toBeGreaterThan(PAGINATION.DEFAULT_LIMIT);
    });
  });

  describe('RATE_LIMITS', () => {
    it('should define login rate limit', () => {
      expect(RATE_LIMITS.LOGIN_ATTEMPTS_HOURLY).toBeGreaterThan(0);
    });

    it('should define SMTP inbox daily limit', () => {
      expect(RATE_LIMITS.SMTP_INBOX_DAILY).toBeGreaterThan(0);
      expect(RATE_LIMITS.SMTP_INBOX_DAILY).toBeLessThanOrEqual(50);
    });

    it('should define AI emails daily limit', () => {
      expect(RATE_LIMITS.AI_EMAILS_DAILY).toBeGreaterThan(0);
    });
  });

  describe('TIMEOUTS', () => {
    it('should have IMAP timeouts', () => {
      expect(TIMEOUTS.IMAP_CONNECTION).toBeGreaterThan(0);
      expect(TIMEOUTS.IMAP_AUTH).toBeGreaterThan(0);
      expect(TIMEOUTS.IMAP_OPERATION).toBeGreaterThan(0);
    });

    it('should have email send timeout', () => {
      expect(TIMEOUTS.EMAIL_SEND).toBeGreaterThan(0);
    });
  });

  describe('SESSION', () => {
    it('should have cookie name', () => {
      expect(SESSION.COOKIE_NAME).toBe('auth_token');
    });

    it('should have token prefix', () => {
      expect(SESSION.TOKEN_PREFIX).toBe('session_');
    });

    it('should have reasonable duration', () => {
      expect(SESSION.DURATION_SECONDS).toBeGreaterThan(0);
      // Should be at least 1 day
      expect(SESSION.DURATION_SECONDS).toBeGreaterThanOrEqual(86400);
    });
  });

  describe('FAKE_EMAIL_PATTERNS', () => {
    it('should be array of RegExp', () => {
      expect(Array.isArray(FAKE_EMAIL_PATTERNS)).toBe(true);
      FAKE_EMAIL_PATTERNS.forEach(pattern => {
        expect(pattern).toBeInstanceOf(RegExp);
      });
    });

    it('should match known fake patterns', () => {
      const fakeEmails = [
        'johndoe@hotel.com',
        'test@website.com',
        'placeholder@resort.com',
      ];

      fakeEmails.forEach(email => {
        const matches = FAKE_EMAIL_PATTERNS.some(p => p.test(email));
        expect(matches).toBe(true);
      });
    });

    it('should not match real emails', () => {
      const realEmails = [
        'john.smith@hotel.com',
        'maria@resort.com',
        'reservations@property.com',
      ];

      realEmails.forEach(email => {
        const matches = FAKE_EMAIL_PATTERNS.some(p => p.test(email));
        expect(matches).toBe(false);
      });
    });
  });

  describe('GENERIC_CORPORATE_EMAILS', () => {
    it('should be array of RegExp', () => {
      expect(Array.isArray(GENERIC_CORPORATE_EMAILS)).toBe(true);
    });

    it('should match major chain info emails', () => {
      const chainEmails = [
        'info@marriott.com',
        'info@hilton.com',
        'info@hyatt.com',
      ];

      chainEmails.forEach(email => {
        const matches = GENERIC_CORPORATE_EMAILS.some(p => p.test(email));
        expect(matches).toBe(true);
      });
    });

    it('should not match individual hotel emails', () => {
      const hotelEmails = [
        'info@grandhotel.com',
        'reservations@boutique-inn.com',
      ];

      hotelEmails.forEach(email => {
        const matches = GENERIC_CORPORATE_EMAILS.some(p => p.test(email));
        expect(matches).toBe(false);
      });
    });
  });
});
