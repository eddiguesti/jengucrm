import { createServerClient } from '@/lib/supabase';
import { scrapeWebsite } from './website-scraper';
import { calculateScore, getTier } from './scoring';
import { WebsiteData, EnrichmentData } from './types';
import { findDecisionMakerEmail, findDecisionMaker } from './email-finder';

const XAI_API_KEY = process.env.XAI_API_KEY;

interface ProspectData {
  id: string;
  name: string;
  city?: string;
  country?: string;
  website?: string;
  source_job_title?: string;
}

/**
 * Generate AI research notes about a prospect using Grok
 */
async function generateResearchNotes(
  prospect: ProspectData,
  websiteData: WebsiteData,
  enrichmentData: EnrichmentData
): Promise<string> {
  if (!XAI_API_KEY) {
    return generateBasicNotes(prospect, websiteData);
  }

  try {
    const context = buildResearchContext(prospect, websiteData, enrichmentData);

    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${XAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'grok-4-latest',
        messages: [
          {
            role: 'system',
            content: `You are a sales research analyst for Jengu, a hospitality tech company.
Write brief, actionable research notes about hotel prospects. Focus on:
- Key decision makers found
- Why they might need hospitality tech (based on hiring signals)
- Any notable details about the property
- Suggested approach angle

Keep notes under 200 words. Be direct and useful for a sales team.`
          },
          {
            role: 'user',
            content: context
          }
        ],
        temperature: 0.5,
        max_tokens: 300,
      }),
    });

    if (!response.ok) {
      return generateBasicNotes(prospect, websiteData);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || generateBasicNotes(prospect, websiteData);
  } catch {
    return generateBasicNotes(prospect, websiteData);
  }
}

function buildResearchContext(
  prospect: ProspectData,
  websiteData: WebsiteData,
  enrichmentData: EnrichmentData
): string {
  const parts: string[] = [
    `Property: ${prospect.name}`,
    `Location: ${[prospect.city, prospect.country].filter(Boolean).join(', ') || 'Unknown'}`,
  ];

  if (prospect.source_job_title) {
    parts.push(`Hiring for: ${prospect.source_job_title}`);
  }

  if (enrichmentData.full_address) {
    parts.push(`Address: ${enrichmentData.full_address}`);
  }

  if (websiteData.propertyInfo.starRating) {
    parts.push(`Star Rating: ${websiteData.propertyInfo.starRating} stars`);
  }

  if (websiteData.propertyInfo.roomCount) {
    parts.push(`Rooms: ${websiteData.propertyInfo.roomCount}`);
  }

  if (websiteData.propertyInfo.chainBrand) {
    parts.push(`Chain: ${websiteData.propertyInfo.chainBrand}`);
  } else {
    parts.push(`Type: Independent property`);
  }

  if (websiteData.teamMembers.length > 0) {
    const teamList = websiteData.teamMembers
      .slice(0, 5)
      .map(m => `${m.name} (${m.title})`)
      .join(', ');
    parts.push(`Key People Found: ${teamList}`);
  }

  if (websiteData.emails.length > 0) {
    parts.push(`Emails Found: ${websiteData.emails.slice(0, 3).join(', ')}`);
  }

  if (websiteData.propertyInfo.amenities?.length) {
    parts.push(`Amenities: ${websiteData.propertyInfo.amenities.join(', ')}`);
  }

  if (websiteData.socialLinks.linkedin) {
    parts.push(`Has LinkedIn presence`);
  }

  return parts.join('\n');
}

function generateBasicNotes(prospect: ProspectData, websiteData: WebsiteData): string {
  const notes: string[] = [];

  if (prospect.source_job_title) {
    notes.push(`Found via job posting for ${prospect.source_job_title} - indicates active hiring/growth.`);
  }

  if (websiteData.teamMembers.length > 0) {
    const gm = websiteData.teamMembers.find(m =>
      m.title.toLowerCase().includes('general manager') ||
      m.title.toLowerCase().includes('director')
    );
    if (gm) {
      notes.push(`Key contact: ${gm.name} (${gm.title})`);
    }
  }

  if (websiteData.propertyInfo.chainBrand) {
    notes.push(`Part of ${websiteData.propertyInfo.chainBrand} chain - may need corporate approval.`);
  } else {
    notes.push(`Independent property - faster decision making likely.`);
  }

  if (websiteData.propertyInfo.starRating && websiteData.propertyInfo.starRating >= 4) {
    notes.push(`Luxury ${websiteData.propertyInfo.starRating}-star property - quality focused.`);
  }

  if (websiteData.propertyInfo.amenities?.includes('spa')) {
    notes.push(`Has spa - complex operations, good fit for automation.`);
  }

  return notes.join('\n') || 'New lead - research needed.';
}

/**
 * Auto-enrich a single prospect with all available data
 */
export async function autoEnrichProspect(prospectId: string): Promise<{
  success: boolean;
  enriched: boolean;
  error?: string;
}> {
  const supabase = createServerClient();

  try {
    // Get prospect
    const { data: prospect, error: fetchError } = await supabase
      .from('prospects')
      .select('*')
      .eq('id', prospectId)
      .single();

    if (fetchError || !prospect) {
      return { success: false, enriched: false, error: 'Prospect not found' };
    }

    // Skip if already enriched
    if (prospect.stage !== 'new') {
      return { success: true, enriched: false };
    }

    // Scrape website
    let websiteData: WebsiteData = {
      emails: [],
      phones: [],
      socialLinks: {},
      propertyInfo: {},
      teamMembers: []
    };

    const enrichmentData: EnrichmentData = {};
    const websiteUrl = prospect.website;
    if (websiteUrl) {
      websiteData = await scrapeWebsite(websiteUrl);
    }

    // Find best phone
    let phone = prospect.phone;
    if (!phone && websiteData.phones.length > 0) {
      phone = websiteData.phones[0];
    }

    // Filter team members (remove fake names and HTML artifacts)
    const fakeNamePatterns = /fallback|placeholder|cookie|consent|privacy|test|demo|sample|john doe|jane doe|btn|button|click|submit|form|input|select|toggle|menu|nav|header|footer|modal|popup|website|facebook|twitter|instagram|linkedin|youtube|using fb|js$/i;
    const validTeamMembers = websiteData.teamMembers.filter(m => {
      const name = m.name.trim();
      const words = name.split(/\s+/);
      // Must have at least 2 words (first and last name)
      if (words.length < 2) return false;
      // Filter out fake patterns
      if (fakeNamePatterns.test(name)) return false;
      // Each word should be at least 2 characters
      if (words.some(w => w.length < 2)) return false;
      // Name shouldn't be too long (likely HTML content)
      if (name.length > 40) return false;
      // Should look like a real name (starts with capital letters)
      if (!words.every(w => /^[A-Z]/.test(w))) return false;
      return true;
    });

    // Use 7-step email finder process to find decision-maker email
    const emailFinderResult = await findDecisionMakerEmail(
      prospect.name,
      websiteUrl,
      validTeamMembers,
      websiteData.emails
    );

    // Get best email from email finder
    const email = prospect.email || emailFinderResult.validatedEmail;

    // Get primary contact from email finder (uses priority-based role matching)
    const primaryContact = emailFinderResult.contactName
      ? { name: emailFinderResult.contactName, title: emailFinderResult.contactRole }
      : findDecisionMaker(validTeamMembers);

    // Generate AI research notes
    const notes = await generateResearchNotes(prospect, websiteData, enrichmentData);

    // Build update data
    const updateData: Record<string, unknown> = {
      ...enrichmentData,
      stage: 'researching',
    };

    if (email) updateData.email = email;
    if (phone) updateData.phone = phone;

    if (primaryContact) {
      updateData.contact_name = primaryContact.name;
      updateData.contact_title = primaryContact.title;
    }

    if (websiteData.socialLinks.linkedin) updateData.linkedin_url = websiteData.socialLinks.linkedin;
    if (websiteData.socialLinks.instagram) updateData.instagram_handle = websiteData.socialLinks.instagram;
    if (websiteData.propertyInfo.starRating) updateData.star_rating = websiteData.propertyInfo.starRating;
    if (websiteData.propertyInfo.roomCount) updateData.estimated_rooms = parseInt(websiteData.propertyInfo.roomCount);
    if (websiteData.propertyInfo.chainBrand) updateData.chain_affiliation = websiteData.propertyInfo.chainBrand;

    // Add notes
    updateData.notes = notes;

    // Add tags
    const tags: string[] = [];
    if (websiteData.propertyInfo.chainBrand) tags.push('chain');
    else tags.push('independent');
    if (websiteData.propertyInfo.starRating && websiteData.propertyInfo.starRating >= 4) tags.push('luxury');
    if (websiteData.propertyInfo.amenities?.includes('spa')) tags.push('spa');
    if (primaryContact) tags.push('has-contact');

    // Check if we have a decision-maker email (not just generic info@)
    // If not, tag for contact discovery
    const hasDecisionMakerEmail =
      emailFinderResult.confidenceScore === 'high' ||
      (emailFinderResult.contactName && emailFinderResult.validatedEmail &&
       !emailFinderResult.validatedEmail.startsWith('info@') &&
       !emailFinderResult.validatedEmail.startsWith('reservations@') &&
       !emailFinderResult.validatedEmail.startsWith('reception@') &&
       !emailFinderResult.validatedEmail.startsWith('frontdesk@'));

    if (!hasDecisionMakerEmail) {
      tags.push('needs-contact-discovery');
    }

    if (tags.length) updateData.tags = tags;

    // Update prospect
    const { data: updated, error: updateError } = await supabase
      .from('prospects')
      .update(updateData)
      .eq('id', prospectId)
      .select()
      .single();

    if (updateError) {
      return { success: false, enriched: false, error: updateError.message };
    }

    // Calculate and update score
    const score = calculateScore(updated);
    const tier = getTier(score.total);

    await supabase
      .from('prospects')
      .update({
        score: score.total,
        score_breakdown: score.breakdown,
        tier,
      })
      .eq('id', prospectId);

    // Log activity with email finder details
    const emailConfidence = emailFinderResult.confidenceScore;
    const emailSource = emailFinderResult.emailPatternSource;

    await supabase.from('activities').insert({
      prospect_id: prospectId,
      type: 'note',
      title: 'Auto-enriched with AI research',
      description: `Found: ${[
        email && `Email (${emailConfidence} confidence, ${emailSource})`,
        phone && 'Phone',
        primaryContact && `Contact: ${primaryContact.name} (${primaryContact.title})`,
        websiteData.socialLinks.linkedin && 'LinkedIn',
      ].filter(Boolean).join(', ') || 'Basic info'}${emailFinderResult.fallbackMethod ? `\n\nFallback: ${emailFinderResult.fallbackMethod}` : ''}`,
    });

    return { success: true, enriched: true };
  } catch (error) {
    return { success: false, enriched: false, error: String(error) };
  }
}

/**
 * Auto-enrich multiple prospects (batch)
 */
export async function autoEnrichBatch(
  prospectIds: string[],
  maxConcurrent = 3
): Promise<{ enriched: number; failed: number }> {
  let enriched = 0;
  let failed = 0;

  // Process in batches to avoid rate limits
  for (let i = 0; i < prospectIds.length; i += maxConcurrent) {
    const batch = prospectIds.slice(i, i + maxConcurrent);

    const results = await Promise.all(
      batch.map(id => autoEnrichProspect(id))
    );

    for (const result of results) {
      if (result.success && result.enriched) enriched++;
      else if (!result.success) failed++;
    }

    // Small delay between batches
    if (i + maxConcurrent < prospectIds.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  return { enriched, failed };
}
