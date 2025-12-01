import { describe, it, expect } from 'vitest';
import {
  SCORING_SYSTEM_PROMPT,
  buildScoringUserPrompt,
  IRRELEVANT_JOB_TITLES,
  BIG_HOTEL_CHAINS,
  NON_HOTEL_KEYWORDS,
} from './scoring';

describe('Scoring Prompts', () => {
  describe('SCORING_SYSTEM_PROMPT', () => {
    it('should contain scoring criteria', () => {
      expect(SCORING_SYSTEM_PROMPT).toContain('SCORING CRITERIA');
      expect(SCORING_SYSTEM_PROMPT).toContain('Grade A');
      expect(SCORING_SYSTEM_PROMPT).toContain('Grade F');
    });

    it('should mention Jengu product', () => {
      expect(SCORING_SYSTEM_PROMPT).toContain('Jengu');
      expect(SCORING_SYSTEM_PROMPT).toContain('guest communication');
    });

    it('should include output format', () => {
      expect(SCORING_SYSTEM_PROMPT).toContain('OUTPUT FORMAT');
      expect(SCORING_SYSTEM_PROMPT).toContain('fit_score');
      expect(SCORING_SYSTEM_PROMPT).toContain('fit_grade');
    });
  });

  describe('buildScoringUserPrompt', () => {
    it('should include prospect count', () => {
      const prompt = buildScoringUserPrompt('prospect data here', 5);
      expect(prompt).toContain('5 hotel prospects');
    });

    it('should include prospect data', () => {
      const prospects = 'Hotel ABC in London';
      const prompt = buildScoringUserPrompt(prospects, 1);
      expect(prompt).toContain('Hotel ABC in London');
    });
  });

  describe('Filter Lists', () => {
    it('should include common irrelevant job titles', () => {
      expect(IRRELEVANT_JOB_TITLES).toContain('chef');
      expect(IRRELEVANT_JOB_TITLES).toContain('housekeeping');
      expect(IRRELEVANT_JOB_TITLES).toContain('security');
    });

    it('should include major hotel chains', () => {
      expect(BIG_HOTEL_CHAINS).toContain('marriott');
      expect(BIG_HOTEL_CHAINS).toContain('hilton');
      expect(BIG_HOTEL_CHAINS).toContain('hyatt');
    });

    it('should include non-hotel keywords', () => {
      expect(NON_HOTEL_KEYWORDS).toContain('restaurant only');
      expect(NON_HOTEL_KEYWORDS).toContain('hospital');
    });
  });
});
