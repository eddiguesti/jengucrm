import Anthropic from '@anthropic-ai/sdk';

export interface JobPainPoints {
  responsibilities: string[]; // Key tasks they need to do
  pain_points: string[]; // Things that could be automated
  communication_tasks: string[]; // Guest communication related
  admin_tasks: string[]; // Repetitive admin work
  speed_requirements: string[]; // Time-sensitive tasks
  summary: string; // One-liner for email personalization
}

/**
 * Use Grok to extract pain points from a job description
 * These are used to personalize outreach emails
 */
export async function extractJobPainPoints(
  jobTitle: string,
  jobDescription: string
): Promise<JobPainPoints | null> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey || !jobDescription) return null;

  try {
    const anthropic = new Anthropic({
      apiKey,
      baseURL: 'https://api.x.ai',
    });

    const prompt = `Analyze this hotel job posting and extract pain points that AI automation could solve.

JOB TITLE: ${jobTitle}

JOB DESCRIPTION:
${jobDescription.slice(0, 3000)}

Extract the following (be specific and brief):

1. RESPONSIBILITIES: What are the 3-5 key tasks this role handles?
2. PAIN POINTS: What repetitive/time-consuming tasks could be automated?
3. COMMUNICATION TASKS: Any guest communication mentioned (emails, messages, inquiries)?
4. ADMIN TASKS: Any admin/paperwork tasks mentioned?
5. SPEED REQUIREMENTS: Any mentions of quick response times, fast turnaround, 24/7 coverage?
6. SUMMARY: One short sentence describing their biggest automatable pain point for email personalization.

Output ONLY valid JSON:
{
  "responsibilities": ["task1", "task2"],
  "pain_points": ["pain1", "pain2"],
  "communication_tasks": ["comm1"],
  "admin_tasks": ["admin1"],
  "speed_requirements": ["speed1"],
  "summary": "They spend significant time on X which could be automated"
}`;

    const response = await anthropic.messages.create({
      model: 'grok-4-1-fast-non-reasoning',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    });

    const textContent = response.content.find(c => c.type === 'text');
    if (!textContent || textContent.type !== 'text') return null;

    const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    return JSON.parse(jsonMatch[0]) as JobPainPoints;
  } catch (err) {
    console.error('Pain point extraction error:', err);
    return null;
  }
}
