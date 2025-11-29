import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { checkRateLimit, incrementUsage } from '@/lib/rate-limiter';
import {
  WebsiteData,
  enrichWithGooglePlaces,
  scrapeWebsite,
  extractDomain,
  calculateScore,
  getTier,
} from '@/lib/enrichment';

export async function POST(request: NextRequest) {
  const supabase = createServerClient();

  try {
    const body = await request.json();
    const { prospect_id } = body;

    if (!prospect_id) {
      return NextResponse.json({ error: 'prospect_id required' }, { status: 400 });
    }

    // Check rate limit for Google Places API
    const rateLimit = checkRateLimit('google_places');
    if (!rateLimit.allowed) {
      return NextResponse.json({
        error: 'Daily Google Places API limit reached',
        remaining: rateLimit.remaining,
        limit: rateLimit.limit,
        message: 'Free tier limit reached. Try again tomorrow to stay within budget.',
      }, { status: 429 });
    }

    // Get prospect
    const { data: prospect, error: fetchError } = await supabase
      .from('prospects')
      .select('*')
      .eq('id', prospect_id)
      .single();

    if (fetchError || !prospect) {
      return NextResponse.json({ error: 'Prospect not found' }, { status: 404 });
    }

    // Enrich with Google Places
    const enrichmentData = await enrichWithGooglePlaces(
      prospect.name,
      prospect.city || '',
      prospect.country || ''
    );

    // Track API usage
    incrementUsage('google_places');

    // Scrape website for contacts and social links
    let websiteData: WebsiteData = { emails: [], phones: [], socialLinks: {}, propertyInfo: {}, teamMembers: [] };
    const websiteUrl = enrichmentData.website || prospect.website;

    if (websiteUrl) {
      websiteData = await scrapeWebsite(websiteUrl);
    }

    // Determine best email - prioritized list already sorted
    let email = prospect.email;
    if (!email && websiteData.emails.length > 0) {
      email = websiteData.emails[0];
    }
    if (!email && websiteUrl) {
      const domain = extractDomain(websiteUrl);
      if (domain) {
        email = `info@${domain}`;
      }
    }

    // Determine best phone
    let phone = prospect.phone;
    if (!phone && websiteData.phones.length > 0) {
      phone = websiteData.phones[0];
    }

    // Get contact person if found (filter out fake/placeholder names)
    const fakeNamePatterns = /fallback|placeholder|cookie|consent|privacy|test|demo|sample|john doe|jane doe|btn|button|click|submit|form|input|select|toggle|menu|nav|header|footer|modal|popup/i;
    const validTeamMembers = websiteData.teamMembers.filter(m => {
      const words = m.name.trim().split(/\s+/);
      if (words.length < 2) return false;
      if (fakeNamePatterns.test(m.name)) return false;
      if (words.some(w => w.length < 2)) return false;
      return true;
    });
    const primaryContact = validTeamMembers.find(m =>
      m.title.match(/general manager|gm|director|owner|managing/i)
    ) || validTeamMembers[0];

    // Update prospect with all scraped data
    const updateData: Record<string, unknown> = {
      ...enrichmentData,
      stage: 'researching',
    };

    // Contact info
    if (email) updateData.email = email;
    if (phone) updateData.phone = phone;

    // Contact person
    if (primaryContact) {
      updateData.contact_name = primaryContact.name;
      updateData.contact_title = primaryContact.title;
    }

    // Social links
    if (websiteData.socialLinks.linkedin) updateData.linkedin_url = websiteData.socialLinks.linkedin;
    if (websiteData.socialLinks.instagram) updateData.instagram_handle = websiteData.socialLinks.instagram;

    // Property info from scrape
    if (websiteData.propertyInfo.starRating) updateData.star_rating = websiteData.propertyInfo.starRating;
    if (websiteData.propertyInfo.roomCount) updateData.estimated_rooms = parseInt(websiteData.propertyInfo.roomCount);
    if (websiteData.propertyInfo.chainBrand) updateData.chain_affiliation = websiteData.propertyInfo.chainBrand;

    // Store extra scraped data in notes/tags
    const scrapedNotes: string[] = [];
    if (websiteData.propertyInfo.amenities?.length) {
      scrapedNotes.push(`Amenities: ${websiteData.propertyInfo.amenities.join(', ')}`);
    }
    if (websiteData.teamMembers.length > 1) {
      scrapedNotes.push(`Team: ${websiteData.teamMembers.map(m => `${m.name} (${m.title})`).slice(0, 3).join(', ')}`);
    }
    if (websiteData.socialLinks.tripadvisor) {
      scrapedNotes.push(`TripAdvisor: ${websiteData.socialLinks.tripadvisor}`);
    }
    if (scrapedNotes.length && !prospect.notes) {
      updateData.notes = scrapedNotes.join('\n');
    }

    // Add tags based on scraped info
    const tags: string[] = prospect.tags || [];
    if (websiteData.propertyInfo.chainBrand && !tags.includes('chain')) tags.push('chain');
    if (!websiteData.propertyInfo.chainBrand && !tags.includes('independent')) tags.push('independent');
    if (websiteData.propertyInfo.starRating && websiteData.propertyInfo.starRating >= 4 && !tags.includes('luxury')) tags.push('luxury');
    if (websiteData.propertyInfo.amenities?.includes('spa') && !tags.includes('spa')) tags.push('spa');
    if (websiteData.propertyInfo.amenities?.includes('michelin') && !tags.includes('fine-dining')) tags.push('fine-dining');
    if (primaryContact && !tags.includes('has-contact')) tags.push('has-contact');
    if (tags.length) updateData.tags = tags;

    const { data: updated, error: updateError } = await supabase
      .from('prospects')
      .update(updateData)
      .eq('id', prospect_id)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    // Log activity with detailed scraped data summary
    const scrapedItems = [
      enrichmentData.website && 'Website',
      email && `Email (${email.startsWith('info@') ? 'generated' : 'found'})`,
      phone && 'Phone',
      primaryContact && `Contact: ${primaryContact.name}`,
      websiteData.propertyInfo.starRating && `${websiteData.propertyInfo.starRating}-star`,
      websiteData.propertyInfo.chainBrand && `Chain: ${websiteData.propertyInfo.chainBrand}`,
      websiteData.socialLinks.linkedin && 'LinkedIn',
      websiteData.socialLinks.instagram && 'Instagram',
      websiteData.socialLinks.tripadvisor && 'TripAdvisor',
    ].filter(Boolean);

    await supabase.from('activities').insert({
      prospect_id,
      type: 'note',
      title: 'Enriched with Google Places + Deep Website Scrape',
      description: `Found: ${scrapedItems.join(', ') || 'Basic info only'}. Scraped ${websiteData.teamMembers.length} team members, ${websiteData.emails.length} emails.`,
    });

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
      .eq('id', prospect_id);

    return NextResponse.json({
      success: true,
      prospect: updated,
      score: score.total,
      tier,
    });
  } catch (error) {
    console.error('Enrichment error:', error);
    return NextResponse.json(
      { error: 'Enrichment failed', details: String(error) },
      { status: 500 }
    );
  }
}

// Batch enrich endpoint
export async function PUT(request: NextRequest) {
  const supabase = createServerClient();

  try {
    const body = await request.json();
    const limit = body.limit || 10;

    // Get prospects that need enrichment
    const { data: prospects, error } = await supabase
      .from('prospects')
      .select('id')
      .eq('stage', 'new')
      .is('google_place_id', null)
      .limit(limit);

    if (error) throw error;

    const results = [];
    for (const prospect of prospects || []) {
      try {
        const response = await fetch(`${request.nextUrl.origin}/api/enrich`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prospect_id: prospect.id }),
        });

        const result = await response.json();
        results.push({ id: prospect.id, success: result.success });
      } catch (e) {
        results.push({ id: prospect.id, success: false, error: String(e) });
      }
    }

    return NextResponse.json({
      enriched: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Batch enrichment failed', details: String(error) },
      { status: 500 }
    );
  }
}
