/**
 * Email Generation Prompts
 * Prompts for generating outreach emails
 *
 * Note: Campaign-specific prompts are in campaign-strategies.ts
 * This file contains shared prompts and utilities
 */

export interface ProspectContext {
  name: string;
  city: string | null;
  country: string | null;
  propertyType: string | null;
  jobTitle?: string | null;
  painSignals?: { keyword: string; snippet: string }[];
  jobPainPoints?: {
    summary?: string;
    communicationTasks?: string[];
    adminTasks?: string[];
    speedRequirements?: string[];
  };
}

/**
 * Build subtle context from pain points for email personalization
 */
export function buildSubtleContext(painPoints?: ProspectContext['jobPainPoints']): string {
  if (!painPoints) return '';

  const commTasks = painPoints.communicationTasks?.slice(0, 2).join(', ') || '';
  const speedReqs = painPoints.speedRequirements?.slice(0, 1).join('') || '';

  let context = '';
  if (painPoints.summary) {
    context = `PAIN INSIGHT (use subtly, don't mention job posting): "${painPoints.summary}"`;
  }
  if (commTasks) {
    context += `\nCOMMUNICATION TASKS they deal with: ${commTasks}`;
  }
  if (speedReqs) {
    context += `\nSPEED PRESSURE they face: ${speedReqs}`;
  }

  return context;
}

/**
 * Guidelines for personalization based on available intel
 */
export function getPersonalizationGuidelines(hasIntel: boolean): string {
  if (hasIntel) {
    return `
**IMPORTANT**: We have intel about their specific pain points. Use this SUBTLY:
- DON'T say "I saw you're hiring" or "I noticed your job posting"
- DO reference specific tasks like "handling late-night inquiries" or "managing booking confirmations"
- Make it feel like you understand hotels, not like you scraped their data
- The goal: they think "how did he know we struggle with that?"`;
  }

  return `
No specific intel available. Use generic hotel pain points:
- Response times to guest inquiries
- After-hours coverage
- Repetitive booking confirmations`;
}

/**
 * Email rules that apply to all strategies
 */
export const COMMON_EMAIL_RULES = [
  'NO bullet points, NO signature (added automatically)',
  'NEVER mention "job posting", "hiring", or "saw you\'re looking for"',
  '2-3 short paragraphs with \\n\\n between',
  'Output ONLY valid JSON: {"subject": "subject here", "body": "email body here"}',
] as const;

/**
 * Signature to be appended to all emails
 */
export const EMAIL_SIGNATURE = `
Edd
Jengu.ai
`;

/**
 * Parse AI response to extract email JSON
 */
export function parseEmailResponse(response: string): { subject: string; body: string } | null {
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
}
