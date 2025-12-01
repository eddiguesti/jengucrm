import { describe, it, expect } from 'vitest';
import {
  createProspectSchema,
  autoEmailSchema,
  createCampaignSchema,
  ValidationError,
} from './validation';

describe('Validation Schemas', () => {
  describe('createProspectSchema', () => {
    it('should validate valid prospect data', () => {
      const data = {
        name: 'Test Hotel',
        email: 'test@hotel.com',
        city: 'London',
        country: 'UK',
      };

      const result = createProspectSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should reject invalid email', () => {
      const data = {
        name: 'Test Hotel',
        email: 'not-an-email',
      };

      const result = createProspectSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('should require name', () => {
      const data = {
        email: 'test@hotel.com',
      };

      const result = createProspectSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('should allow empty email string', () => {
      const data = {
        name: 'Test Hotel',
        email: '',
      };

      const result = createProspectSchema.safeParse(data);
      expect(result.success).toBe(true);
    });
  });

  describe('autoEmailSchema', () => {
    it('should use default values', () => {
      const result = autoEmailSchema.parse({});

      expect(result.max_emails).toBe(10);
      expect(result.min_score).toBe(50);
      expect(result.stagger_delay).toBe(false);
    });

    it('should validate custom values', () => {
      const data = {
        max_emails: 25,
        min_score: 70,
        stagger_delay: true,
      };

      const result = autoEmailSchema.parse(data);

      expect(result.max_emails).toBe(25);
      expect(result.min_score).toBe(70);
      expect(result.stagger_delay).toBe(true);
    });

    it('should reject max_emails over limit', () => {
      const result = autoEmailSchema.safeParse({ max_emails: 101 });
      expect(result.success).toBe(false);
    });

    it('should accept max_emails at limit', () => {
      const result = autoEmailSchema.safeParse({ max_emails: 100 });
      expect(result.success).toBe(true);
    });
  });

  describe('createCampaignSchema', () => {
    it('should validate campaign creation', () => {
      const data = {
        name: 'Test Campaign',
        description: 'A test campaign',
        strategy_key: 'authority_scarcity',
        daily_limit: 10,
      };

      const result = createCampaignSchema.parse(data);

      expect(result.name).toBe('Test Campaign');
      expect(result.daily_limit).toBe(10);
    });

    it('should use default daily_limit of 20', () => {
      const data = {
        name: 'Test Campaign',
        description: 'A test',
        strategy_key: 'curiosity_value',
      };

      const result = createCampaignSchema.parse(data);
      expect(result.daily_limit).toBe(20);
    });

    it('should require strategy_key', () => {
      const data = {
        name: 'Test Campaign',
        description: 'A test',
      };

      const result = createCampaignSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });
});

describe('ValidationError', () => {
  it('should be throwable with message', () => {
    const error = new ValidationError('Invalid input');
    expect(error.message).toBe('Invalid input');
    expect(error.name).toBe('ValidationError');
  });

  it('should be instanceof Error', () => {
    const error = new ValidationError('Test');
    expect(error instanceof Error).toBe(true);
  });
});
