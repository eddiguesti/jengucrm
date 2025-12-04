/**
 * AI-Powered Prospect Cleanup & Scoring
 *
 * Uses Grok to analyze and score prospects:
 * - Filter out irrelevant prospects (big chains, wrong job roles, non-hotels)
 * - Score remaining prospects on fit potential (1-100)
 * - Analyze job descriptions for automation opportunities
 * - Classify hotel size and decision-making capability
 */

import { createServerClient } from '@/lib/supabase';
import { JobPainPoints } from '@/lib/extract-job-pain-points';
import { logger } from '@/lib/logger';
import { executeWithCircuit } from '@/lib/scrapers/circuit-breaker';

const XAI_API_KEY = process.env.XAI_API_KEY;

// Job titles that indicate wrong type of hire (not relevant for our software)
const IRRELEVANT_JOB_TITLES = [
  'sous chef', 'chef', 'cook', 'kitchen', 'culinary',
  'housekeeping', 'housekeeper', 'room attendant', 'cleaner',
  'bartender', 'barista', 'waiter', 'waitress', 'server',
  'dishwasher', 'steward', 'porter', 'bellhop', 'valet',
  'security', 'guard', 'maintenance', 'engineer', 'technician',
  'laundry', 'linen', 'spa therapist', 'massage', 'lifeguard',
  'driver', 'shuttle', 'landscaper', 'gardener',
];

// Big hotel chains - we can't sell to corporate decision makers
const BIG_HOTEL_CHAINS = [
  'marriott', 'hilton', 'ihg', 'intercontinental', 'holiday inn',
  'hyatt', 'accor', 'wyndham', 'choice hotels', 'best western',
  'radisson', 'sheraton', 'westin', 'w hotel', 'st regis',
  'ritz carlton', 'ritz-carlton', 'four seasons', 'fairmont',
  'sofitel', 'novotel', 'ibis', 'mercure', 'pullman',
  'crowne plaza', 'kimpton', 'doubletree', 'hampton inn',
  'courtyard by marriott', 'residence inn', 'springhill suites',
  'aloft', 'element', 'moxy', 'ac hotels', 'le meridien',
  'waldorf astoria', 'conrad', 'canopy', 'curio', 'tapestry',
  'embassy suites', 'homewood suites', 'home2 suites',
  'tru by hilton', 'motto', 'signia', 'lxr',
  'regent', 'park hyatt', 'andaz', 'grand hyatt', 'hyatt regency',
  'hyatt place', 'hyatt house', 'thompson', 'tommie',
  'mgm', 'caesars', 'wynn', 'bellagio', 'venetian', 'palazzo',
  'mandarin oriental', 'peninsula', 'shangri-la', 'banyan tree',
  'anantara', 'six senses', 'aman', 'como', 'one&only',
  'rosewood', 'montage', 'auberge', 'oetker collection',
  'rocco forte', 'dorchester collection', 'leading hotels',
];

// Keywords that suggest non-hotel businesses
const NON_HOTEL_KEYWORDS = [
  'restaurant only', 'pub', 'bar & grill', 'cafe', 'coffee shop',
  'nightclub', 'casino', 'cruise', 'airline', 'airport',
  'hospital', 'nursing home', 'care home', 'retirement',
  'university', 'college', 'school', 'student accommodation',
  'office', 'coworking', 'serviced apartment', 'aparthotel',
];

interface ProspectForReview {
  id: string;
  name: string;
  city?: string;
  country?: string;
  source_job_title?: string;
  source_job_description?: string;
  job_pain_points?: JobPainPoints | null;
  chain_affiliation?: string;
  property_type?: string;
  tags?: string[];
  notes?: string;
}

interface CleanupResult {
  prospect_id: string;
  action: 'keep' | 'archive' | 'delete';
  reason: string;
  confidence: 'high' | 'medium' | 'low';
}

// AI Scoring result
export interface AIScoreResult {
  prospect_id: string;
  action: 'keep' | 'archive';
  fit_score: number; // 1-100
  fit_grade: 'A' | 'B' | 'C' | 'D' | 'F'; // A=80-100, B=60-79, C=40-59, D=20-39, F=0-19
  reason: string;
  buying_signals: string[];
  concerns: string[];
  hotel_size_estimate: 'small' | 'medium' | 'large' | 'unknown';
  decision_maker_access: 'direct' | 'likely' | 'unlikely' | 'unknown';
  automation_opportunity: 'high' | 'medium' | 'low';
  recommended_approach: string;
}

/**
 * Quick filter using rules (no AI needed)
 */
function quickFilter(prospect: ProspectForReview): CleanupResult | null {
  const name = prospect.name.toLowerCase();
  const jobTitle = (prospect.source_job_title || '').toLowerCase();
  const chain = (prospect.chain_affiliation || '').toLowerCase();

  // Check for irrelevant job titles
  for (const title of IRRELEVANT_JOB_TITLES) {
    if (jobTitle.includes(title)) {
      return {
        prospect_id: prospect.id,
        action: 'archive',
        reason: `Irrelevant job role: ${prospect.source_job_title}`,
        confidence: 'high',
      };
    }
  }

  // Check for big hotel chains
  for (const chainName of BIG_HOTEL_CHAINS) {
    if (name.includes(chainName) || chain.includes(chainName)) {
      return {
        prospect_id: prospect.id,
        action: 'archive',
        reason: `Big hotel chain: ${chainName}`,
        confidence: 'high',
      };
    }
  }

  // Check for non-hotel businesses
  for (const keyword of NON_HOTEL_KEYWORDS) {
    if (name.includes(keyword)) {
      return {
        prospect_id: prospect.id,
        action: 'archive',
        reason: `Not a hotel: ${keyword}`,
        confidence: 'high',
      };
    }
  }

  return null; // Needs AI review or is likely good
}

/**
 * Use Grok to analyze and SCORE prospects with detailed analysis
 */
async function aiAnalyzeAndScoreProspects(prospects: ProspectForReview[]): Promise<AIScoreResult[]> {
  if (!XAI_API_KEY || prospects.length === 0) {
    return prospects.map(p => ({
      prospect_id: p.id,
      action: 'keep' as const,
      fit_score: 50,
      fit_grade: 'C' as const,
      reason: 'No AI available - default score',
      buying_signals: [],
      concerns: ['Could not analyze - AI unavailable'],
      hotel_size_estimate: 'unknown' as const,
      decision_maker_access: 'unknown' as const,
      automation_opportunity: 'medium' as const,
      recommended_approach: 'Standard outreach',
    }));
  }

  // Build detailed prospect info for AI analysis
  const prospectList = prospects.map((p, i) => {
    let info = `${i + 1}. "${p.name}" in ${p.city || 'Unknown'}, ${p.country || 'Unknown'}`;
    if (p.source_job_title) info += `\n   Job posting: ${p.source_job_title}`;
    if (p.source_job_description) {
      // Truncate but keep enough for analysis
      const desc = p.source_job_description.slice(0, 800);
      info += `\n   Job description: ${desc}${p.source_job_description.length > 800 ? '...' : ''}`;
    }
    if (p.job_pain_points) {
      info += `\n   Pain points identified: ${p.job_pain_points.summary || 'None'}`;
      if (p.job_pain_points.communication_tasks?.length) {
        info += `\n   Communication tasks: ${p.job_pain_points.communication_tasks.join(', ')}`;
      }
    }
    if (p.chain_affiliation) info += `\n   Chain: ${p.chain_affiliation}`;
    if (p.property_type) info += `\n   Type: ${p.property_type}`;
    return info;
  }).join('\n\n');

  try {
    // Use circuit breaker for Grok API
    const response = await executeWithCircuit(
      'grok-api',
      () => fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${XAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'grok-3-mini',
          messages: [
            {
              role: 'system',
              content: `You are a B2B sales intelligence expert for Jengu, a hospitality tech startup.

## ABOUT JENGU
Jengu sells AI-powered guest communication software to hotels:
- Automates guest inquiries, booking confirmations, pre-arrival messages
- WhatsApp, email, and SMS guest communication
- PMS integrations (Opera, Mews, Cloudbeds, etc.)
- 24/7 automated responses - helps small hotels compete with big chains
- Price: $200-500/month depending on size

## SCORING CRITERIA (Score 1-100)

### HIGH SCORE (80-100) - Grade A - HOT LEADS
- Independent/boutique hotels (can make own buying decisions)
- Hiring for guest-facing roles: Front desk, Guest relations, Reservations, Night audit
- Job description mentions: high volume inquiries, WhatsApp, guest communication, response time
- Small-medium size (under 100 rooms) - right budget range
- Luxury/upscale properties (can afford $300-500/month)
- Pain points match our product perfectly

### GOOD SCORE (60-79) - Grade B - WARM LEADS
- Hiring GM, Operations Manager, Revenue Manager (decision makers)
- Independent but larger properties (100-200 rooms)
- Job mentions technology, systems, efficiency, automation
- B&Bs, inns, guesthouses (smaller but good fit)

### MODERATE SCORE (40-59) - Grade C - WORTH A TRY
- Hiring IT/Digital roles (tech-savvy but not core user)
- Job description unclear about guest comms
- Could be independent or franchise (uncertain)
- Properties in secondary locations

### LOW SCORE (20-39) - Grade D - LONG SHOT
- Large properties (200+ rooms) - likely have existing systems
- Unclear if independent or chain
- Job role not directly related to guest comms
- Budget markets (may not afford premium software)

### ARCHIVE (0-19) - Grade F - NOT A FIT
- Definitely part of a big chain (corporate decisions)
- Wrong job role entirely (chef, housekeeping, security)
- Not a hotel (restaurant, cafe, hospital)
- Staffing agency posting (not direct hotel)

## ANALYZE THESE SIGNALS

**Buying Signals (positive):**
- "Busy front desk" / "high guest volume" - needs automation
- "24/7 coverage needed" - AI can help with off-hours
- "WhatsApp inquiries" - we specialize in this
- "Multiple languages" - AI handles this well
- "Quick response time" - AI excels here
- "Expanding" / "growing" - investing in tools
- "Modernizing" / "digitizing" - open to new tech

**Concerns (negative):**
- "Part of [chain name] family" - corporate decision
- "Opening soon" - might not be ready to buy
- "Budget hotel" - price sensitive
- Very large team mentioned - complex org
- Already using specific systems (may be locked in)

## OUTPUT FORMAT
Return JSON array with one object per prospect:
[{
  "index": 1,
  "action": "keep" or "archive",
  "fit_score": 75,
  "fit_grade": "B",
  "reason": "Independent boutique hotel hiring front desk - perfect ICP",
  "buying_signals": ["Mentions high WhatsApp volume", "Looking for quick response times"],
  "concerns": ["Large property - may have existing systems"],
  "hotel_size_estimate": "small" | "medium" | "large" | "unknown",
  "decision_maker_access": "direct" | "likely" | "unlikely" | "unknown",
  "automation_opportunity": "high" | "medium" | "low",
  "recommended_approach": "Lead with WhatsApp automation case study"
}]`
          },
          {
            role: 'user',
            content: `Analyze and score these ${prospects.length} hotel prospects. Consider their job postings, pain points, and likelihood to buy our guest communication software:\n\n${prospectList}`
          }
        ],
          temperature: 0.2,
          max_tokens: 4000,
        }),
      }),
      { throwOnOpen: true }
    );

    if (!response.ok) {
      const errorText = await response.text();
      logger.error({ status: response.status, error: errorText }, 'Grok API error');
      return prospects.map(p => ({
        prospect_id: p.id,
        action: 'keep' as const,
        fit_score: 50,
        fit_grade: 'C' as const,
        reason: 'AI error - default score',
        buying_signals: [],
        concerns: ['AI analysis failed'],
        hotel_size_estimate: 'unknown' as const,
        decision_maker_access: 'unknown' as const,
        automation_opportunity: 'medium' as const,
        recommended_approach: 'Standard outreach',
      }));
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '[]';

    // Parse JSON from response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      logger.error({ contentPreview: content.slice(0, 200) }, 'Could not parse AI response');
      return prospects.map(p => ({
        prospect_id: p.id,
        action: 'keep' as const,
        fit_score: 50,
        fit_grade: 'C' as const,
        reason: 'Could not parse AI response',
        buying_signals: [],
        concerns: ['Parse error'],
        hotel_size_estimate: 'unknown' as const,
        decision_maker_access: 'unknown' as const,
        automation_opportunity: 'medium' as const,
        recommended_approach: 'Standard outreach',
      }));
    }

    const decisions = JSON.parse(jsonMatch[0]) as Array<{
      index: number;
      action: 'keep' | 'archive';
      fit_score: number;
      fit_grade: 'A' | 'B' | 'C' | 'D' | 'F';
      reason: string;
      buying_signals: string[];
      concerns: string[];
      hotel_size_estimate: 'small' | 'medium' | 'large' | 'unknown';
      decision_maker_access: 'direct' | 'likely' | 'unlikely' | 'unknown';
      automation_opportunity: 'high' | 'medium' | 'low';
      recommended_approach: string;
    }>;

    return decisions.map(d => ({
      prospect_id: prospects[d.index - 1]?.id || '',
      action: d.action,
      fit_score: d.fit_score,
      fit_grade: d.fit_grade,
      reason: d.reason,
      buying_signals: d.buying_signals || [],
      concerns: d.concerns || [],
      hotel_size_estimate: d.hotel_size_estimate || 'unknown',
      decision_maker_access: d.decision_maker_access || 'unknown',
      automation_opportunity: d.automation_opportunity || 'medium',
      recommended_approach: d.recommended_approach || 'Standard outreach',
    })).filter(r => r.prospect_id);

  } catch (error) {
    logger.error({ error }, 'AI scoring error');
    return prospects.map(p => ({
      prospect_id: p.id,
      action: 'keep' as const,
      fit_score: 50,
      fit_grade: 'C' as const,
      reason: 'AI error - keeping by default',
      buying_signals: [],
      concerns: ['AI error'],
      hotel_size_estimate: 'unknown' as const,
      decision_maker_access: 'unknown' as const,
      automation_opportunity: 'medium' as const,
      recommended_approach: 'Standard outreach',
    }));
  }
}

/**
 * Convert fit grade to tier
 */
function gradeToTier(grade: string): 'hot' | 'warm' | 'cold' {
  switch (grade) {
    case 'A': return 'hot';
    case 'B': return 'warm';
    default: return 'cold';
  }
}

/**
 * Main cleanup and scoring function - runs after scraping
 */
export async function cleanupProspects(options: {
  dryRun?: boolean;
  limit?: number;
  stage?: string;
} = {}): Promise<{
  analyzed: number;
  archived: number;
  kept: number;
  scored: number;
  scoreBreakdown: { A: number; B: number; C: number; D: number; F: number };
  results: CleanupResult[];
}> {
  const supabase = createServerClient();
  const { dryRun = false, limit = 100, stage = 'new' } = options;

  // Get prospects to analyze - include job description and pain points
  const { data: prospects, error } = await supabase
    .from('prospects')
    .select('id, name, city, country, source_job_title, source_job_description, job_pain_points, chain_affiliation, property_type, tags, notes')
    .eq('stage', stage)
    .eq('archived', false)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !prospects) {
    logger.error({ error }, 'Error fetching prospects');
    return { analyzed: 0, archived: 0, kept: 0, scored: 0, scoreBreakdown: { A: 0, B: 0, C: 0, D: 0, F: 0 }, results: [] };
  }

  const results: CleanupResult[] = [];
  const needsAiReview: ProspectForReview[] = [];
  const scoreBreakdown = { A: 0, B: 0, C: 0, D: 0, F: 0 };

  // First pass: quick rule-based filtering
  for (const prospect of prospects) {
    const quickResult = quickFilter(prospect);
    if (quickResult) {
      results.push(quickResult);
      scoreBreakdown.F++; // Rule-filtered = F grade
    } else {
      needsAiReview.push(prospect);
    }
  }

  // Second pass: AI scoring for prospects that passed quick filter
  let scored = 0;
  if (needsAiReview.length > 0) {
    // Process in batches of 10 for detailed AI analysis
    for (let i = 0; i < needsAiReview.length; i += 10) {
      const batch = needsAiReview.slice(i, i + 10);
      const aiResults = await aiAnalyzeAndScoreProspects(batch);

      for (const result of aiResults) {
        // Track grade breakdown
        scoreBreakdown[result.fit_grade]++;

        // Convert to CleanupResult for backward compatibility
        results.push({
          prospect_id: result.prospect_id,
          action: result.action,
          reason: result.reason,
          confidence: result.fit_score >= 60 ? 'high' : result.fit_score >= 40 ? 'medium' : 'low',
        });

        // Update prospect with AI scores (unless dry run)
        if (!dryRun && result.action === 'keep') {
          const tier = gradeToTier(result.fit_grade);

          await supabase
            .from('prospects')
            .update({
              tier,
              ai_score: result.fit_score,
              ai_grade: result.fit_grade,
              ai_analysis: {
                reason: result.reason,
                buying_signals: result.buying_signals,
                concerns: result.concerns,
                hotel_size_estimate: result.hotel_size_estimate,
                decision_maker_access: result.decision_maker_access,
                automation_opportunity: result.automation_opportunity,
                recommended_approach: result.recommended_approach,
                analyzed_at: new Date().toISOString(),
              },
            })
            .eq('id', result.prospect_id);

          // Add activity log for high-scoring prospects
          if (result.fit_score >= 70) {
            await supabase.from('activities').insert({
              prospect_id: result.prospect_id,
              type: 'note',
              title: `AI Score: ${result.fit_score}/100 (Grade ${result.fit_grade})`,
              description: `${result.reason}\n\nBuying signals: ${result.buying_signals.join(', ') || 'None identified'}\n\nRecommended approach: ${result.recommended_approach}`,
            });
          }

          scored++;
        }
      }
    }
  }

  // Apply archive actions (unless dry run)
  let archived = 0;
  let kept = 0;

  if (!dryRun) {
    for (const result of results) {
      if (result.action === 'archive') {
        await supabase
          .from('prospects')
          .update({
            archived: true,
            archived_at: new Date().toISOString(),
            archive_reason: `AI Cleanup: ${result.reason}`,
            ai_score: 0,
            ai_grade: 'F',
          })
          .eq('id', result.prospect_id);

        // Log activity
        await supabase.from('activities').insert({
          prospect_id: result.prospect_id,
          type: 'note',
          title: 'Auto-archived by AI cleanup',
          description: result.reason,
        });

        archived++;
      } else {
        kept++;
      }
    }
  } else {
    archived = results.filter(r => r.action === 'archive').length;
    kept = results.filter(r => r.action === 'keep').length;
  }

  return {
    analyzed: prospects.length,
    archived,
    kept,
    scored,
    scoreBreakdown,
    results,
  };
}

/**
 * Score a single prospect with detailed analysis
 */
export async function scoreProspect(prospectId: string): Promise<AIScoreResult | null> {
  const supabase = createServerClient();

  const { data: prospect, error } = await supabase
    .from('prospects')
    .select('id, name, city, country, source_job_title, source_job_description, job_pain_points, chain_affiliation, property_type, tags, notes')
    .eq('id', prospectId)
    .single();

  if (error || !prospect) {
    logger.error({ error, prospectId }, 'Error fetching prospect');
    return null;
  }

  // Check quick filter first
  const quickResult = quickFilter(prospect);
  if (quickResult) {
    return {
      prospect_id: prospect.id,
      action: 'archive',
      fit_score: 0,
      fit_grade: 'F',
      reason: quickResult.reason,
      buying_signals: [],
      concerns: [quickResult.reason],
      hotel_size_estimate: 'unknown',
      decision_maker_access: 'unknown',
      automation_opportunity: 'low',
      recommended_approach: 'Do not contact - not a fit',
    };
  }

  const results = await aiAnalyzeAndScoreProspects([prospect]);
  return results[0] || null;
}

/**
 * Get cleanup preview without making changes
 */
export async function previewCleanup(limit = 50): Promise<{
  toArchive: Array<{ id: string; name: string; reason: string }>;
  toKeep: Array<{ id: string; name: string; score?: number; grade?: string }>;
  scoreBreakdown: { A: number; B: number; C: number; D: number; F: number };
}> {
  const result = await cleanupProspects({ dryRun: true, limit });

  const supabase = createServerClient();
  const { data: prospects } = await supabase
    .from('prospects')
    .select('id, name')
    .in('id', result.results.map(r => r.prospect_id));

  const prospectMap = new Map(prospects?.map(p => [p.id, p.name]) || []);

  return {
    toArchive: result.results
      .filter(r => r.action === 'archive')
      .map(r => ({
        id: r.prospect_id,
        name: prospectMap.get(r.prospect_id) || 'Unknown',
        reason: r.reason,
      })),
    toKeep: result.results
      .filter(r => r.action === 'keep')
      .map(r => ({
        id: r.prospect_id,
        name: prospectMap.get(r.prospect_id) || 'Unknown',
      })),
    scoreBreakdown: result.scoreBreakdown,
  };
}
