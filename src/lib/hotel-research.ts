/**
 * Hotel Research - AI-powered intel gathering before email outreach
 * Uses Grok's knowledge first, then web search as fallback
 */

import { config } from './config';
import { logger } from './logger';

export interface HotelIntel {
  // Property details
  propertyType: string; // boutique, resort, city hotel, etc.
  roomCount?: number;
  starRating?: number;

  // Facilities & services
  hasRestaurant: boolean;
  hasSpa: boolean;
  hasEventSpace: boolean; // function rooms, ballrooms
  hasWeddingVenue: boolean;
  hasMeetingRooms: boolean;
  hasPool: boolean;

  // Business structure
  isPartOfGroup: boolean;
  groupName?: string;
  numberOfProperties?: number;

  // Contact info
  generalEmail?: string;
  reservationsEmail?: string;
  gmName?: string;
  gmEmail?: string;
  directorName?: string;
  directorTitle?: string;

  // Strategic insights
  targetMarket: string; // business, leisure, weddings, etc.
  uniqueSellingPoints: string[];
  recentNews?: string;
  painPoints: string[];

  // Recommendations
  recommendedAngle: string;
  thingsToAvoid: string[];
  suggestedSubject: string;

  // Raw research
  researchSummary: string;
  confidence: number;
  source: 'knowledge' | 'web_search' | 'fallback';
}

const RESEARCH_PROMPT = `What do you know about this hotel? Use your knowledge to help with sales outreach.

Tell me:
1. What type of property is this? (boutique, resort, city hotel, country house, etc.)
2. Approximate room count if you know it
3. What facilities do they likely have? (restaurant, spa, event space, wedding venue, meeting rooms, pool)
4. Are they independent or part of a hotel group? If a group, which one?
5. Do you know the GM or any directors?
6. What is their target market? (business, weddings, leisure, luxury, etc.)
7. What makes them stand out?
8. Best angle for outreach and what to avoid

Be honest. If you dont know something say null. If youre guessing based on the name or type, thats fine but lower the confidence score.

Respond in JSON:
{
  "propertyType": "boutique hotel / resort / city hotel / etc",
  "roomCount": number or null,
  "starRating": number or null,
  "hasRestaurant": true/false,
  "hasSpa": true/false,
  "hasEventSpace": true/false,
  "hasWeddingVenue": true/false,
  "hasMeetingRooms": true/false,
  "hasPool": true/false,
  "isPartOfGroup": true/false,
  "groupName": "name or null",
  "numberOfProperties": number or null,
  "gmName": "name or null if you know it",
  "directorName": null,
  "directorTitle": null,
  "targetMarket": "primary target market",
  "uniqueSellingPoints": ["point 1", "point 2"],
  "painPoints": ["potential pain points"],
  "recommendedAngle": "best approach for outreach",
  "thingsToAvoid": ["what not to mention based on their profile"],
  "suggestedSubject": "suggested email subject",
  "researchSummary": "2-3 sentence summary",
  "confidence": 0.0-1.0
}`;

/**
 * Research a hotel before sending outreach
 * First uses Grok's knowledge, then web search if confidence is low
 */
export async function researchHotel(
  hotelName: string,
  location?: string,
  website?: string
): Promise<HotelIntel> {
  if (!config.ai.apiKey) {
    throw new Error('AI API key not configured');
  }

  try {
    // Step 1: Try Grok's built-in knowledge first
    logger.info({ hotelName }, 'Researching hotel using AI knowledge...');

    const knowledgeResult = await queryGrok(hotelName, location, website, false);

    if (knowledgeResult && knowledgeResult.confidence >= 0.5) {
      // Good confidence from knowledge, use it
      logger.info(
        { hotelName, confidence: knowledgeResult.confidence, source: 'knowledge' },
        'Hotel research completed from knowledge'
      );
      return { ...knowledgeResult, source: 'knowledge' };
    }

    // Step 2: Low confidence or missing key info - try web search
    logger.info({ hotelName }, 'Low confidence, trying web search...');

    const webResult = await queryGrok(hotelName, location, website, true);

    if (webResult && webResult.confidence > (knowledgeResult?.confidence || 0)) {
      logger.info(
        { hotelName, confidence: webResult.confidence, source: 'web_search' },
        'Hotel research completed from web search'
      );
      return { ...webResult, source: 'web_search' };
    }

    // Return knowledge result if we have it, otherwise default
    if (knowledgeResult) {
      return { ...knowledgeResult, source: 'knowledge' };
    }

    return getDefaultIntel(hotelName);
  } catch (error) {
    logger.error({ error, hotelName }, 'Hotel research failed');
    return getDefaultIntel(hotelName);
  }
}

/**
 * Query Grok for hotel intel
 */
async function queryGrok(
  hotelName: string,
  location?: string,
  website?: string,
  useWebSearch: boolean = false
): Promise<HotelIntel | null> {
  try {
    const requestBody: Record<string, unknown> = {
      model: 'grok-4-latest',
      messages: [
        {
          role: 'system',
          content: `You are a hotel industry expert with deep knowledge of hotels worldwide. ${
            useWebSearch
              ? 'Search the web for current information about this hotel.'
              : 'Use your knowledge to provide intel on hotels for sales outreach.'
          }

Be honest about what you know vs what you're guessing. If you recognize the hotel, share what you know. If you don't, make reasonable inferences from the name and location.

Respond ONLY in valid JSON format.`,
        },
        {
          role: 'user',
          content: `Hotel: ${hotelName}
${location ? `Location: ${location}` : ''}
${website ? `Website: ${website}` : ''}

${RESEARCH_PROMPT}`,
        },
      ],
      temperature: 0.3,
    };

    // Add web search if requested
    if (useWebSearch) {
      requestBody.search = { mode: 'auto' };
    }

    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.ai.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.text();
      logger.warn({ error, status: response.status, useWebSearch }, 'Grok API error');
      return null;
    }

    const data = await response.json();
    const responseText = data.choices?.[0]?.message?.content || '';

    // Parse JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.warn({ hotelName, useWebSearch }, 'Could not parse research response');
      return null;
    }

    const intel = JSON.parse(jsonMatch[0]) as HotelIntel;
    return intel;
  } catch (error) {
    logger.error({ error, hotelName, useWebSearch }, 'Grok query failed');
    return null;
  }
}

/**
 * Find email addresses for a hotel using web search
 */
export async function findHotelEmails(
  hotelName: string,
  website?: string,
  location?: string
): Promise<{
  generalEmail?: string;
  reservationsEmail?: string;
  contactEmails: Array<{ email: string; name?: string; title?: string }>;
}> {
  if (!config.ai.apiKey) {
    return { contactEmails: [] };
  }

  try {
    // Use AbortController for 25 second timeout (Vercel has 60s limit)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.ai.apiKey}`,
      },
      body: JSON.stringify({
        model: 'grok-3-fast',
        messages: [
          {
            role: 'system',
            content: `You find email addresses for hotels. Search the web for contact information. Only return emails you actually find - never guess or fabricate emails.`,
          },
          {
            role: 'user',
            content: `Find email addresses for: ${hotelName}
${website ? `Website: ${website}` : ''}
${location ? `Location: ${location}` : ''}

Search for:
1. General contact email (info@, contact@, hello@)
2. Reservations email
3. Any specific contact emails with names/titles (GM, Director, etc.)

Return JSON:
{
  "generalEmail": "email or null",
  "reservationsEmail": "email or null",
  "contactEmails": [
    {"email": "email", "name": "person name", "title": "their title"}
  ]
}

Only include emails you actually found. Do not guess.`,
          },
        ],
        temperature: 0.1,
        search: { mode: 'auto' },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return { contactEmails: [] };
    }

    const data = await response.json();
    const responseText = data.choices?.[0]?.message?.content || '';

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { contactEmails: [] };
    }

    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    logger.error({ error, hotelName }, 'Email finder failed');
    return { contactEmails: [] };
  }
}

/**
 * Default intel when research fails
 */
function getDefaultIntel(hotelName: string): HotelIntel {
  return {
    propertyType: 'hotel',
    hasRestaurant: false,
    hasSpa: false,
    hasEventSpace: false,
    hasWeddingVenue: false,
    hasMeetingRooms: false,
    hasPool: false,
    isPartOfGroup: false,
    targetMarket: 'general',
    uniqueSellingPoints: [],
    painPoints: [],
    recommendedAngle: 'Focus on guest communication and inquiry handling',
    thingsToAvoid: [],
    suggestedSubject: `Quick question about ${hotelName}`,
    researchSummary: 'Limited research available - use generic approach',
    confidence: 0.2,
    source: 'fallback',
  };
}

const hotelResearch = { researchHotel, findHotelEmails };
export default hotelResearch;
