/**
 * AI-Powered Prospect Cleanup
 *
 * Uses Grok to analyze and filter out irrelevant prospects:
 * - Big hotel chains (Marriott, Hilton, IHG, etc.)
 * - Wrong job roles (sous chef, housekeeping, bartender, etc.)
 * - Non-hotel businesses
 * - Duplicates and low-quality leads
 */

import { createServerClient } from '@/lib/supabase';

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
 * Use Grok to analyze uncertain prospects
 */
async function aiAnalyzeProspects(prospects: ProspectForReview[]): Promise<CleanupResult[]> {
  if (!XAI_API_KEY || prospects.length === 0) {
    return prospects.map(p => ({
      prospect_id: p.id,
      action: 'keep' as const,
      reason: 'No AI available - keeping by default',
      confidence: 'low' as const,
    }));
  }

  const prospectList = prospects.map((p, i) =>
    `${i + 1}. "${p.name}" in ${p.city || 'Unknown'}, ${p.country || 'Unknown'}` +
    (p.source_job_title ? ` (hiring: ${p.source_job_title})` : '') +
    (p.chain_affiliation ? ` [Chain: ${p.chain_affiliation}]` : '') +
    (p.property_type ? ` [Type: ${p.property_type}]` : '')
  ).join('\n');

  try {
    const response = await fetch('https://api.x.ai/v1/chat/completions', {
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
            content: `You are a lead qualification expert for Jengu.

## ABOUT JENGU
Jengu is a hospitality tech startup that sells AI-powered guest communication software to hotels. Our product:
- Automates guest inquiries, booking confirmations, pre-arrival messages
- Handles WhatsApp, email, and SMS guest communication
- Integrates with PMS systems
- Helps small hotels compete with big chains by providing 24/7 automated responses

## IDEAL CUSTOMER PROFILE (ICP)
Our perfect customers are:
- **Independent hotels** (single property, owner-operated)
- **Boutique hotels** (unique, design-focused, under 100 rooms)
- **Small hotel groups** (2-10 properties, regional operators)
- **B&Bs, inns, guesthouses, lodges** (family-run, personal service)
- **Luxury independent properties** (high-end, no chain affiliation)

## WHY JOB POSTINGS MATTER
We find hotels by their job postings. Good signals:
- **KEEP**: Front desk, receptionist, guest relations, reservations, night auditor, revenue manager, operations manager, GM, hotel manager, guest services
- These roles indicate the hotel needs help with guest communication - exactly what we solve!

## BAD PROSPECTS TO ARCHIVE

### Wrong Job Roles (not our target):
- Chef, cook, sous chef, kitchen staff (restaurant hiring, not guest comms)
- Housekeeping, room attendant, cleaner (operations, not guest-facing)
- Bartender, server, waiter (F&B, not hotel operations)
- Maintenance, engineer, security (facilities, not our product)
- Spa therapist, lifeguard (amenities staff)

### Big Hotel Chains (can't sell to corporate):
- Marriott, Hilton, Hyatt, IHG, Accor, Wyndham brands
- These have corporate contracts - individual properties can't buy software
- Exception: Franchises MIGHT be independent owners - mark as "keep" if unsure

### Not Hotels:
- Standalone restaurants, pubs, bars, cafes
- Nightclubs, casinos (different industry)
- Hospitals, care homes, student accommodation
- Serviced apartments, hostels (different model)

## YOUR TASK
Analyze each prospect and decide:
- "keep" = Good fit for Jengu, should receive outreach
- "archive" = Not a fit, remove from pipeline

Respond in JSON format only:
[{"index": 1, "action": "keep" or "archive", "reason": "brief reason"}]`
          },
          {
            role: 'user',
            content: `Analyze these prospects and decide which to keep or archive:\n\n${prospectList}`
          }
        ],
        temperature: 0.1,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      console.error('Grok API error:', response.status);
      return prospects.map(p => ({
        prospect_id: p.id,
        action: 'keep' as const,
        reason: 'AI error - keeping by default',
        confidence: 'low' as const,
      }));
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '[]';

    // Parse JSON from response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return prospects.map(p => ({
        prospect_id: p.id,
        action: 'keep' as const,
        reason: 'Could not parse AI response',
        confidence: 'low' as const,
      }));
    }

    const decisions = JSON.parse(jsonMatch[0]) as Array<{
      index: number;
      action: 'keep' | 'archive';
      reason: string;
    }>;

    return decisions.map(d => ({
      prospect_id: prospects[d.index - 1]?.id || '',
      action: d.action,
      reason: d.reason,
      confidence: 'medium' as const,
    })).filter(r => r.prospect_id);

  } catch (error) {
    console.error('AI analysis error:', error);
    return prospects.map(p => ({
      prospect_id: p.id,
      action: 'keep' as const,
      reason: 'AI error - keeping by default',
      confidence: 'low' as const,
    }));
  }
}

/**
 * Main cleanup function - runs after scraping
 */
export async function cleanupProspects(options: {
  dryRun?: boolean;
  limit?: number;
  stage?: string;
} = {}): Promise<{
  analyzed: number;
  archived: number;
  kept: number;
  results: CleanupResult[];
}> {
  const supabase = createServerClient();
  const { dryRun = false, limit = 100, stage = 'new' } = options;

  // Get prospects to analyze
  const { data: prospects, error } = await supabase
    .from('prospects')
    .select('id, name, city, country, source_job_title, chain_affiliation, property_type, tags, notes')
    .eq('stage', stage)
    .eq('archived', false)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !prospects) {
    console.error('Error fetching prospects:', error);
    return { analyzed: 0, archived: 0, kept: 0, results: [] };
  }

  const results: CleanupResult[] = [];
  const needsAiReview: ProspectForReview[] = [];

  // First pass: quick rule-based filtering
  for (const prospect of prospects) {
    const quickResult = quickFilter(prospect);
    if (quickResult) {
      results.push(quickResult);
    } else {
      needsAiReview.push(prospect);
    }
  }

  // Second pass: AI review for uncertain prospects
  if (needsAiReview.length > 0) {
    // Process in batches of 20 for AI
    for (let i = 0; i < needsAiReview.length; i += 20) {
      const batch = needsAiReview.slice(i, i + 20);
      const aiResults = await aiAnalyzeProspects(batch);
      results.push(...aiResults);
    }
  }

  // Apply actions (unless dry run)
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
    results,
  };
}

/**
 * Get cleanup preview without making changes
 */
export async function previewCleanup(limit = 50): Promise<{
  toArchive: Array<{ id: string; name: string; reason: string }>;
  toKeep: Array<{ id: string; name: string }>;
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
  };
}
