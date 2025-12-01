import { describe, it, expect } from 'vitest';
import { buildFollowUpPrompt, FOLLOW_UP_CONFIG, FollowUpContext } from './follow-up';

describe('Follow-up Prompts', () => {
  describe('buildFollowUpPrompt', () => {
    const baseContext: FollowUpContext = {
      prospectName: 'Grand Hotel',
      city: 'London',
      propertyType: 'hotel',
      followUpNumber: 1,
      previousSubject: 'Quick question about guest comms',
      previousBody: 'Hi, I noticed your property...',
      daysSinceLast: 3,
    };

    it('should include prospect details', () => {
      const prompt = buildFollowUpPrompt(baseContext);

      expect(prompt).toContain('Grand Hotel');
      expect(prompt).toContain('London');
      expect(prompt).toContain('hotel');
    });

    it('should reference previous email', () => {
      const prompt = buildFollowUpPrompt(baseContext);

      expect(prompt).toContain('Quick question about guest comms');
      expect(prompt).toContain('Hi, I noticed your property...');
    });

    it('should include follow-up number', () => {
      const prompt = buildFollowUpPrompt(baseContext);
      expect(prompt).toContain('#1');
    });

    it('should have different instructions for final follow-up', () => {
      const finalContext = { ...baseContext, followUpNumber: 2 };
      const prompt = buildFollowUpPrompt(finalContext);

      expect(prompt).toContain('FINAL follow-up');
      expect(prompt).toContain('easy out');
    });

    it('should include JSON output instruction', () => {
      const prompt = buildFollowUpPrompt(baseContext);
      expect(prompt).toContain('JSON');
      expect(prompt).toContain('subject');
      expect(prompt).toContain('body');
    });

    it('should mention days since last email', () => {
      const prompt = buildFollowUpPrompt(baseContext);
      expect(prompt).toContain('3 days ago');
    });
  });

  describe('FOLLOW_UP_CONFIG', () => {
    it('should have max emails limit', () => {
      expect(FOLLOW_UP_CONFIG.maxEmails).toBe(3);
    });

    it('should have days to wait array', () => {
      expect(FOLLOW_UP_CONFIG.daysToWait).toHaveLength(2);
      expect(FOLLOW_UP_CONFIG.daysToWait[0]).toBe(3);
      expect(FOLLOW_UP_CONFIG.daysToWait[1]).toBe(5);
    });
  });
});
