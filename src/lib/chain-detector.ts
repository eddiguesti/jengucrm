/**
 * AI-powered hotel chain detection
 * Uses Grok/Claude to intelligently identify chain hotels vs independents
 */

import Anthropic from '@anthropic-ai/sdk';
import { config } from './config';

const anthropic = new Anthropic({
  apiKey: config.ai.apiKey,
  baseURL: config.ai.baseUrl,
});

export interface ChainCheckResult {
  isChain: boolean;
  confidence: number;
  reason: string;
}

/**
 * Check if a hotel name represents a major chain hotel
 */
export async function isChainHotel(name: string, website?: string): Promise<ChainCheckResult> {
  try {
    const response = await anthropic.messages.create({
      model: config.ai.model,
      max_tokens: 200,
      messages: [
        {
          role: 'user',
          content: `Analyze this hotel/hospitality business and determine if it's a major chain or corporate entity that would NOT respond to individual sales outreach (like Marriott, Hilton, IHG, Accor, Hyatt) vs an independent boutique hotel, small hotel group, or independent property that WOULD respond to sales outreach.

Hotel name: "${name}"
${website ? `Website: ${website}` : ''}

Respond in JSON format only:
{
  "isChain": true/false,
  "confidence": 0.0-1.0,
  "reason": "brief explanation"
}

Consider these as chains/corporates to EXCLUDE:
- Major chains: Marriott, Hilton, Hyatt, IHG, Accor, Wyndham, Radisson, Best Western, Choice Hotels
- All their sub-brands (Courtyard, Hampton Inn, Holiday Inn, Novotel, etc.)
- Large management companies (Aimbridge, MCR, Interstate, etc.)
- Corporate offices and headquarters
- Non-hotels (tech companies, hospitals, universities, etc.)

Consider these as GOOD targets to INCLUDE:
- Independent boutique hotels
- Small hotel groups (1-10 properties)
- Luxury independents
- Family-owned properties
- Local/regional operators`,
        },
      ],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      return {
        isChain: result.isChain === true,
        confidence: typeof result.confidence === 'number' ? result.confidence : 0.8,
        reason: result.reason || 'AI analysis',
      };
    }

    // Default to not a chain if parsing fails
    return { isChain: false, confidence: 0.5, reason: 'Could not parse AI response' };
  } catch (error) {
    console.error('Chain detection error:', error);
    // On error, use fallback pattern matching
    return fallbackChainCheck(name);
  }
}

/**
 * Batch check multiple hotels for efficiency
 */
export async function batchCheckChainHotels(
  hotels: Array<{ name: string; website?: string }>
): Promise<Map<string, ChainCheckResult>> {
  const results = new Map<string, ChainCheckResult>();

  if (hotels.length === 0) return results;

  try {
    const hotelList = hotels.map((h, i) => `${i + 1}. ${h.name}${h.website ? ` (${h.website})` : ''}`).join('\n');

    const response = await anthropic.messages.create({
      model: config.ai.model,
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: `Analyze these hotels and identify which are major chains/corporates that should be EXCLUDED from sales outreach.

${hotelList}

For each hotel, respond in JSON array format:
[
  {"index": 1, "isChain": true/false, "reason": "brief reason"},
  ...
]

EXCLUDE (isChain: true):
- Major chains and their brands (Marriott, Hilton, Hyatt, IHG, Accor, Wyndham, Radisson, etc.)
- Large management companies
- Corporate offices
- Non-hotels (tech, hospitals, etc.)

INCLUDE (isChain: false):
- Independent boutiques
- Small hotel groups
- Family-owned properties`,
        },
      ],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';

    // Parse JSON array from response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      for (const item of parsed) {
        const hotel = hotels[item.index - 1];
        if (hotel) {
          results.set(hotel.name, {
            isChain: item.isChain === true,
            confidence: 0.85,
            reason: item.reason || 'AI batch analysis',
          });
        }
      }
    }
  } catch (error) {
    console.error('Batch chain detection error:', error);
    // Fallback to individual pattern matching
    for (const hotel of hotels) {
      results.set(hotel.name, fallbackChainCheck(hotel.name));
    }
  }

  // Fill in any missing results with fallback
  for (const hotel of hotels) {
    if (!results.has(hotel.name)) {
      results.set(hotel.name, fallbackChainCheck(hotel.name));
    }
  }

  return results;
}

/**
 * Fallback pattern-based chain detection
 */
function fallbackChainCheck(name: string): ChainCheckResult {
  const nameLower = name.toLowerCase();

  const chainPatterns = [
    'marriott', 'hilton', 'hyatt', 'ihg', 'wyndham', 'accor', 'radisson',
    'best western', 'choice hotels', 'four seasons', 'ritz-carlton',
    'sheraton', 'westin', 'holiday inn', 'hampton inn', 'doubletree',
    'embassy suites', 'homewood suites', 'courtyard by', 'fairfield inn',
    'springhill suites', 'residence inn', 'towneplace suites',
    'crowne plaza', 'intercontinental', 'novotel', 'sofitel', 'pullman',
    'mercure', 'ibis', 'mgallery', 'swissotel', 'fairmont', 'raffles',
    'mandarin oriental', 'shangri-la', 'peninsula', 'langham',
    'park hyatt', 'andaz', 'hyatt regency', 'hyatt place',
    'extended stay', 'la quinta', 'days inn', 'super 8', 'ramada',
    'kimpton', 'aloft', 'moxy', 'w hotel', 'st. regis', 'le meridien',
    'trump international', 'mcr hotels', 'aimbridge', 'vail resorts',
    'hospital', 'university', 'government', 'jll', 'cvent',
  ];

  const isChain = chainPatterns.some(pattern => nameLower.includes(pattern));

  return {
    isChain,
    confidence: isChain ? 0.9 : 0.6,
    reason: isChain ? 'Matched known chain pattern' : 'No chain pattern detected',
  };
}

const chainDetector = { isChainHotel, batchCheckChainHotels };
export default chainDetector;
