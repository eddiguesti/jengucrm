import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import nodemailer from 'nodemailer';
import { researchHotel, HotelIntel } from '@/lib/hotel-research';
import { config } from '@/lib/config';
import { logger } from '@/lib/logger';

/**
 * Mystery Shopper Inquiry - AI-Powered
 *
 * Researches the hotel first, then generates a strategic personalized inquiry.
 * Adapts the approach based on hotel facilities, structure, and language.
 */

// Countries where we write in French
const FRENCH_COUNTRIES = ['france', 'belgium', 'switzerland', 'luxembourg', 'monaco'];

// Parse Gmail inbox configuration (email|password|displayName)
function getGmailConfig(inboxString: string) {
  const [email, password, senderName] = inboxString.split('|');
  return { email, password, senderName: senderName || email.split('@')[0] };
}

// Get all Gmail inboxes for mystery shopper rotation
function getGmailInboxes(): { email: string; password: string; senderName: string }[] {
  const inboxes: { email: string; password: string; senderName: string }[] = [];
  for (let i = 1; i <= 10; i++) {
    const config = process.env[`GMAIL_INBOX_${i}`];
    if (config) {
      inboxes.push(getGmailConfig(config));
    }
  }
  return inboxes;
}

// Track which Gmail inbox to use next
let gmailInboxIndex = 0;

/**
 * Generate a strategic mystery shopper email using AI
 */
async function generateMysteryEmail(
  hotelName: string,
  senderName: string,
  intel: HotelIntel | null,
  language: 'french' | 'english'
): Promise<{ subject: string; body: string; scenario: string }> {
  if (!config.ai.apiKey) {
    // Fallback to simple template if no AI
    return getFallbackEmail(hotelName, senderName, language);
  }

  // Determine best scenario based on intel
  let scenarioHint = 'wedding inquiry';
  const thingsToAvoid: string[] = [];

  if (intel) {
    if (!intel.hasWeddingVenue && !intel.hasEventSpace) {
      scenarioHint = 'weekend getaway or anniversary celebration';
      thingsToAvoid.push('weddings', 'events', 'conferences');
    } else if (intel.hasWeddingVenue) {
      scenarioHint = 'wedding venue visit';
    } else if (intel.hasEventSpace && intel.hasMeetingRooms) {
      scenarioHint = 'small corporate retreat or team offsite';
    } else if (intel.hasSpa) {
      scenarioHint = 'wellness retreat or spa weekend';
    } else if (intel.hasRestaurant) {
      scenarioHint = 'culinary weekend or special dinner';
    }

    if (intel.isPartOfGroup && intel.numberOfProperties && intel.numberOfProperties > 3) {
      thingsToAvoid.push('asking about other properties in the group');
    }
  }

  const langInstructions = language === 'french'
    ? `Write in casual French. Use "tu" not "vous". Sign off with just the name, no "Best" or similar.`
    : `Write in casual British English. Sign off with just the name.`;

  try {
    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.ai.apiKey}`,
      },
      body: JSON.stringify({
        model: 'grok-4-latest',
        messages: [
          {
            role: 'system',
            content: `You write mystery shopper emails to hotels. You pretend to be a real person making an inquiry to test their response time. Your goal is to get a reply and ideally get the GM or manager's direct contact.

CRITICAL RULES:
1. Write like a real person texting a friend. Not corporate at all.
2. NEVER use dashes, hyphens, bullet points, or special characters
3. NEVER use emojis
4. Keep it short. 60 to 80 words maximum.
5. Sound natural and warm
6. Include specific details to seem genuine (dates, guest numbers, reason)
7. Ask for the GM or manager's email directly in a natural way
8. ${langInstructions}

Your email should feel like it was written quickly by someone genuinely interested, not crafted by a marketer.`,
          },
          {
            role: 'user',
            content: `Write a mystery shopper inquiry email to ${hotelName}.

SENDER NAME: ${senderName}
SCENARIO TO USE: ${scenarioHint}
${thingsToAvoid.length > 0 ? `DO NOT MENTION: ${thingsToAvoid.join(', ')}` : ''}

${intel ? `RESEARCH ABOUT THIS HOTEL:
Property type: ${intel.propertyType || 'unknown'}
Has restaurant: ${intel.hasRestaurant}
Has spa: ${intel.hasSpa}
Has event space: ${intel.hasEventSpace}
Has wedding venue: ${intel.hasWeddingVenue}
Part of group: ${intel.isPartOfGroup}${intel.groupName ? ` (${intel.groupName})` : ''}
Target market: ${intel.targetMarket || 'general'}
${intel.uniqueSellingPoints?.length ? `Unique points: ${intel.uniqueSellingPoints.join(', ')}` : ''}` : 'No research available, use generic approach.'}

Generate JSON:
{
  "subject": "short casual subject 5 to 7 words no special characters",
  "body": "the email body ending with just the sender name",
  "scenario": "what scenario you used"
}`,
          },
        ],
        temperature: 0.8,
      }),
    });

    if (!response.ok) {
      logger.warn({ status: response.status }, 'AI email generation failed, using fallback');
      return getFallbackEmail(hotelName, senderName, language);
    }

    const data = await response.json();
    const responseText = data.choices?.[0]?.message?.content || '';

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return getFallbackEmail(hotelName, senderName, language);
    }

    const result = JSON.parse(jsonMatch[0]);
    return {
      subject: result.subject || `Quick question about ${hotelName}`,
      body: result.body || getFallbackEmail(hotelName, senderName, language).body,
      scenario: result.scenario || scenarioHint,
    };
  } catch (error) {
    logger.error({ error }, 'AI mystery email generation failed');
    return getFallbackEmail(hotelName, senderName, language);
  }
}

/**
 * Fallback simple template when AI is unavailable
 */
function getFallbackEmail(
  hotelName: string,
  senderName: string,
  language: 'french' | 'english'
): { subject: string; body: string; scenario: string } {
  if (language === 'french') {
    return {
      subject: `Question sur ${hotelName}`,
      body: `Bonjour,

Je cherche un endroit sympa pour un weekend en famille le mois prochain. ${hotelName} a l'air parfait d'apres les photos.

On serait environ 8 personnes, 2 nuits. Est ce que tu pourrais me donner le mail du directeur pour qu'on discute directement des options?

Merci beaucoup!

${senderName}`,
      scenario: 'family weekend',
    };
  }

  return {
    subject: `Quick question about ${hotelName}`,
    body: `Hi there,

Looking for somewhere nice for a family weekend next month and ${hotelName} looks perfect from what I've seen online.

We'd be about 8 people for 2 nights. Could you share the manager or GMs email so I can discuss options directly?

Thanks so much!

${senderName}`,
    scenario: 'family weekend',
  };
}

export async function POST(request: NextRequest) {
  const supabase = createServerClient();

  try {
    const body = await request.json();
    const { prospect_id, skip_research = false } = body;

    if (!prospect_id) {
      return NextResponse.json({ error: 'prospect_id required' }, { status: 400 });
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

    // Must have an email to send to
    if (!prospect.email) {
      return NextResponse.json({
        error: 'No email address for this prospect',
        suggestion: 'Enrich the prospect first to find an email',
      }, { status: 400 });
    }

    // Check if prospect has only generic email
    const hasOnlyGenericEmail = prospect.email && (
      prospect.email.startsWith('info@') ||
      prospect.email.startsWith('reservations@') ||
      prospect.email.startsWith('reception@') ||
      prospect.email.startsWith('frontdesk@') ||
      prospect.email.startsWith('hello@') ||
      prospect.email.startsWith('contact@') ||
      prospect.email.startsWith('enquiries@')
    );

    // If already has non-generic email with contact name, skip
    if (!hasOnlyGenericEmail && prospect.contact_name) {
      return NextResponse.json({
        skipped: true,
        reason: 'Already has decision-maker contact',
        contact_name: prospect.contact_name,
        email: prospect.email,
      });
    }

    // Get Gmail inboxes
    const gmailInboxes = getGmailInboxes();
    if (gmailInboxes.length === 0) {
      return NextResponse.json({ error: 'No Gmail accounts configured for mystery shopper' }, { status: 500 });
    }

    // Round-robin through Gmail accounts
    const gmailConfig = gmailInboxes[gmailInboxIndex % gmailInboxes.length];
    gmailInboxIndex++;

    // Determine language
    const country = (prospect.country || '').toLowerCase();
    const language = FRENCH_COUNTRIES.some(c => country.includes(c)) ? 'french' : 'english';

    // Research the hotel (unless skipped)
    let intel: HotelIntel | null = null;
    if (!skip_research) {
      try {
        const location = [prospect.city, prospect.country].filter(Boolean).join(', ');
        intel = await researchHotel(prospect.name, location, prospect.website || undefined);
        logger.info({ prospect: prospect.name, confidence: intel.confidence }, 'Hotel researched for mystery shopper');
      } catch (err) {
        logger.warn({ prospect: prospect.name, error: err }, 'Research failed, using fallback');
      }
    }

    // Generate strategic email
    const emailData = await generateMysteryEmail(
      prospect.name,
      gmailConfig.senderName,
      intel,
      language
    );

    // Create Gmail transporter
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: gmailConfig.email,
        pass: gmailConfig.password,
      },
    });

    // Send email
    const sentResult = await transporter.sendMail({
      from: `"${gmailConfig.senderName}" <${gmailConfig.email}>`,
      to: prospect.email,
      subject: emailData.subject,
      text: emailData.body,
    });

    // Save to emails table (required for reply matching!)
    await supabase.from('emails').insert({
      prospect_id,
      subject: emailData.subject,
      body: emailData.body,
      to_email: prospect.email,
      from_email: gmailConfig.email,
      message_id: sentResult.messageId,
      email_type: 'mystery_shopper',
      direction: 'outbound',
      status: 'sent',
      sent_at: new Date().toISOString(),
    });

    // Log activity
    await supabase.from('activities').insert({
      prospect_id,
      type: 'mystery_shopper',
      title: 'Mystery Shopper Inquiry Sent',
      description: `Sent AI-generated inquiry from ${gmailConfig.senderName} (${gmailConfig.email}) to ${prospect.email}. Scenario: ${emailData.scenario}. Language: ${language}`,
    });

    // Update prospect with research data if we found GM/Director
    const updates: Record<string, unknown> = {};
    const tags = prospect.tags || [];

    if (intel?.gmName && !prospect.contact_name) {
      updates.contact_name = intel.gmName;
      updates.contact_title = 'General Manager';
    } else if (intel?.directorName && !prospect.contact_name) {
      updates.contact_name = intel.directorName;
      updates.contact_title = intel.directorTitle || 'Director';
    }

    if (intel?.generalEmail && !prospect.email?.includes('@')) {
      updates.email = intel.generalEmail;
    }

    if (!tags.includes('mystery-inquiry-sent')) {
      tags.push('mystery-inquiry-sent');
      updates.tags = tags;
    }

    if (Object.keys(updates).length > 0) {
      await supabase.from('prospects').update(updates).eq('id', prospect_id);
    }

    return NextResponse.json({
      success: true,
      sent_to: prospect.email,
      subject: emailData.subject,
      scenario: emailData.scenario,
      language,
      research: intel ? {
        gmName: intel.gmName,
        hasEventSpace: intel.hasEventSpace,
        hasWeddingVenue: intel.hasWeddingVenue,
        confidence: intel.confidence,
      } : null,
      message: 'AI-generated mystery inquiry sent',
    });
  } catch (error) {
    console.error('Mystery inquiry error:', error);
    return NextResponse.json(
      { error: 'Failed to send inquiry', details: String(error) },
      { status: 500 }
    );
  }
}

/**
 * Batch send mystery inquiries with AI research
 */
export async function PUT(request: NextRequest) {
  const supabase = createServerClient();

  try {
    const body = await request.json();
    const limit = body.limit || 5;
    const baseDelayMs = body.delay_ms || 10000; // Default 10 second delay (longer for AI calls)
    const randomize = body.randomize !== false; // Default true for natural sending
    const skipResearch = body.skip_research || false;

    // Find prospects with generic emails that haven't received inquiry
    const { data: prospects, error } = await supabase
      .from('prospects')
      .select('id, name, email, tags, city, country, website')
      .not('email', 'is', null)
      .limit(500);

    if (error) throw error;

    // Filter to only those with generic emails and no mystery inquiry sent
    const genericPrefixes = [
      'info@', 'reservations@', 'reservation@', 'reception@', 'frontdesk@',
      'hello@', 'contact@', 'enquiries@', 'enquiry@', 'booking@', 'bookings@',
      'stay@', 'guest@', 'guests@', 'sales@', 'events@', 'weddings@',
      'groups@', 'meetings@', 'concierge@', 'hotel@', 'resort@'
    ];

    // Priority 1: Manually queued prospects
    const queuedProspects = (prospects || []).filter(p => {
      if (!p.email) return false;
      const tags = p.tags || [];
      const isQueued = tags.includes('mystery-shopper-queued');
      const alreadySent = tags.includes('mystery-inquiry-sent');
      return isQueued && !alreadySent;
    });

    // Priority 2: Auto-select generic email prospects
    const genericProspects = (prospects || []).filter(p => {
      if (!p.email) return false;
      const emailLower = p.email.toLowerCase();
      const isGenericEmail = genericPrefixes.some(prefix => emailLower.startsWith(prefix));
      const tags = p.tags || [];
      const alreadySent = tags.includes('mystery-inquiry-sent');
      const isQueued = tags.includes('mystery-shopper-queued');
      return isGenericEmail && !alreadySent && !isQueued; // Don't double-count queued
    });

    // Combine: queued first, then generic to fill remaining slots
    const eligibleProspects = [...queuedProspects, ...genericProspects].slice(0, limit);

    const results: {
      id: string;
      name: string;
      success: boolean;
      error?: string;
      from?: string;
      scenario?: string;
      language?: string;
    }[] = [];

    const gmailInboxes = getGmailInboxes();
    if (gmailInboxes.length === 0) {
      return NextResponse.json({ error: 'No Gmail accounts configured' }, { status: 500 });
    }

    console.log(`[Mystery AI Batch] Starting batch send of ${eligibleProspects.length} emails...`);

    for (let i = 0; i < eligibleProspects.length; i++) {
      const prospect = eligibleProspects[i];

      try {
        const gmailConfig = gmailInboxes[i % gmailInboxes.length];

        // Determine language
        const country = (prospect.country || '').toLowerCase();
        const language = FRENCH_COUNTRIES.some(c => country.includes(c)) ? 'french' : 'english';

        // Research the hotel
        let intel: HotelIntel | null = null;
        if (!skipResearch) {
          try {
            const location = [prospect.city, prospect.country].filter(Boolean).join(', ');
            intel = await researchHotel(prospect.name, location, prospect.website || undefined);
          } catch {
            // Continue without research
          }
        }

        // Generate email
        const emailData = await generateMysteryEmail(
          prospect.name,
          gmailConfig.senderName,
          intel,
          language
        );

        // Send
        const transporter = nodemailer.createTransport({
          host: 'smtp.gmail.com',
          port: 465,
          secure: true,
          auth: {
            user: gmailConfig.email,
            pass: gmailConfig.password,
          },
        });

        const sentResult = await transporter.sendMail({
          from: `"${gmailConfig.senderName}" <${gmailConfig.email}>`,
          to: prospect.email,
          subject: emailData.subject,
          text: emailData.body,
        });

        // Save to emails table (required for reply matching!)
        await supabase.from('emails').insert({
          prospect_id: prospect.id,
          subject: emailData.subject,
          body: emailData.body,
          to_email: prospect.email,
          from_email: gmailConfig.email,
          message_id: sentResult.messageId,
          email_type: 'mystery_shopper',
          direction: 'outbound',
          status: 'sent',
          sent_at: new Date().toISOString(),
        });

        // Log activity
        await supabase.from('activities').insert({
          prospect_id: prospect.id,
          type: 'mystery_shopper',
          title: 'Mystery Shopper Inquiry Sent',
          description: `AI-generated inquiry from ${gmailConfig.senderName}. Scenario: ${emailData.scenario}. Language: ${language}`,
        });

        // Tag prospect - add sent tag and remove queue tag
        let tags = prospect.tags || [];
        if (!tags.includes('mystery-inquiry-sent')) {
          tags.push('mystery-inquiry-sent');
        }
        // Remove queued tag since it's been sent
        tags = tags.filter((t: string) => t !== 'mystery-shopper-queued');
        await supabase.from('prospects').update({ tags }).eq('id', prospect.id);

        results.push({
          id: prospect.id,
          name: prospect.name,
          success: true,
          from: gmailConfig.email,
          scenario: emailData.scenario,
          language,
        });

        console.log(`[Mystery AI Batch] ${i + 1}/${eligibleProspects.length} - Sent to ${prospect.email} (${emailData.scenario})`);

        // Delay between sends
        if (i < eligibleProspects.length - 1) {
          const delayMs = randomize ? baseDelayMs * (0.7 + Math.random() * 0.6) : baseDelayMs;
          console.log(`[Mystery AI Batch] Waiting ${Math.round(delayMs / 1000)}s...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      } catch (e) {
        console.error(`[Mystery AI Batch] Failed for ${prospect.email}:`, e);
        results.push({ id: prospect.id, name: prospect.name, success: false, error: String(e) });
      }
    }

    console.log(`[Mystery AI Batch] Complete. Sent: ${results.filter(r => r.success).length}, Failed: ${results.filter(r => !r.success).length}`);

    return NextResponse.json({
      sent: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      eligible_total: eligibleProspects.length,
      results,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Batch mystery inquiry failed', details: String(error) },
      { status: 500 }
    );
  }
}
