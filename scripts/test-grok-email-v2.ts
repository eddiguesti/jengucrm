/**
 * V2: Psychology-driven cold email generation
 * Based on deep research: Cialdini, Alex Berman 3Cs, PAS framework, curiosity gap
 */

import 'dotenv/config';

const XAI_API_KEY = process.env.XAI_API_KEY;
if (!XAI_API_KEY) {
  console.error('ERROR: Missing XAI_API_KEY environment variable');
  process.exit(1);
}

const prospects = [
  {
    name: "Beach Enclave",
    city: "Long Bay",
    country: "Anguilla",
    contact_name: "André Cohen Ferreira",
    contact_title: "General Manager",
    email: "andre@beachenclave.com",
    website: "http://www.beachenclave.com/",
    // Researched facts for personalization:
    facts: "Luxury beachfront villas, won Caribbean's Leading Villa Resort 2023, known for personalized butler service, high-end clientele expecting perfection"
  },
  {
    name: "Grand Hôtel des Bains",
    city: "Locquirec",
    country: "France",
    contact_name: "Jean-Louis Barc",
    contact_title: "Directeur Général",
    email: "reception@grand-hotel-des-bains.com",
    website: "http://www.grand-hotel-des-bains.com",
    facts: "Historic 4-star hotel in Brittany, stunning ocean views, Thalasso spa, boutique feel, seasonal tourism peaks"
  },
  {
    name: "HOTEL U CAPU BIANCU",
    city: "Bonifacio",
    country: "France (Corsica)",
    contact_name: "Virginie Sayede",
    contact_title: "General Manager",
    email: "info@ucapubiancu.com",
    website: "https://www.ucapubiancu.com",
    facts: "5-star luxury hotel perched on cliffs of Bonifacio, private beach, exceptional views, Mediterranean cuisine, exclusive clientele"
  }
];

async function generateEmailWithGrok(prospect: any): Promise<string> {
  const masterPrompt = `You are a world-class cold email copywriter who has studied:
- Robert Cialdini's 7 Principles of Persuasion
- Alex Berman's 3C Framework (Compliment, Case Study, Call to Action)
- The PAS Framework (Problem, Agitate, Solution)
- Pattern interrupts and curiosity gaps
- Behavioral psychology triggers

Your goal: Write an email that gets a 20%+ reply rate.

## STRICT RULES (violating these = failure):
1. MAX 75 words total (short emails get 5.4% reply vs 2% for long)
2. MAX 6 sentences
3. MAX 12 words per sentence
4. NO spam words: "guarantee", "free", "100%", "opportunity", "amazing", "incredible"
5. NO generic openings: "I hope this finds you well", "I came across", "I was impressed"
6. NO salesy language or hype
7. ONE clear question as CTA (not a demand)
8. Sound like a real human texting a colleague, not a marketer

## PSYCHOLOGY TO APPLY:
- **Curiosity Gap**: Leave something unsaid that creates an itch
- **Pattern Interrupt**: First line must be unexpected, specific, not templated
- **Reciprocity**: Offer value/insight before asking
- **Social Proof**: Subtle mention of similar hotels (don't name-drop aggressively)
- **Liking**: Find genuine common ground or show you "get" their world
- **Loss Aversion**: What are they missing? (not what they'll gain)

## STRUCTURE (Alex Berman 3Cs + PAS hybrid):
1. **Line 1 - Observation/Compliment**: Something SPECIFIC you noticed. Not generic praise. An actual observation that proves you did research. This is the PATTERN INTERRUPT.
2. **Line 2-3 - Problem + Agitate**: Name a specific pain point. Make it real. (e.g., "Hard to know what guests really think until the TripAdvisor review hits")
3. **Line 4 - Credibility/Solution hint**: One sentence. Don't explain everything. Create curiosity.
4. **Line 5-6 - Soft CTA as question**: Interest-based, low commitment. (e.g., "Worth a quick look?" not "Book a call")

## WHAT MAKES 20% REPLY RATES:
- Feels like it was written just for THEM (not a template)
- Creates genuine curiosity ("I need to know more")
- Zero pressure (they feel in control)
- Shows you understand their specific world
- Brevity = respect for their time

## PROSPECT INFO:
Hotel: ${prospect.name}
Location: ${prospect.city}, ${prospect.country}
Contact: ${prospect.contact_name} (${prospect.contact_title})
Research: ${prospect.facts}

## OUTPUT:
Write ONLY the email body. No subject line. No signature. No "[Your Name]" placeholder.
Make it feel like it came from a real person named Ed who runs Jengu.

Jengu = AI that mystery shops hotels and gives GMs brutally honest feedback on the guest experience before it becomes a bad review.`;

  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${XAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'grok-2-latest',
      messages: [
        {
          role: 'system',
          content: 'You are a cold email expert. Your emails consistently achieve 15-25% reply rates. You write like a human, not a marketer. Every word earns its place. You never sound like a template.'
        },
        { role: 'user', content: masterPrompt }
      ],
      temperature: 0.8,  // Slightly higher for more creativity
      max_tokens: 300,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Grok API error: ${error}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

async function main() {
  console.log('═'.repeat(70));
  console.log('  COLD EMAIL V2: Psychology-Driven Generation');
  console.log('  Based on: Cialdini, Alex Berman 3Cs, PAS, Curiosity Gap');
  console.log('═'.repeat(70));

  for (const prospect of prospects) {
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`TO: ${prospect.contact_name} <${prospect.email}>`);
    console.log(`HOTEL: ${prospect.name} (${prospect.city}, ${prospect.country})`);
    console.log(`${'─'.repeat(70)}\n`);

    try {
      const emailBody = await generateEmailWithGrok(prospect);

      // Count words
      const wordCount = emailBody.split(/\s+/).length;

      console.log(emailBody);
      console.log(`\n[${wordCount} words]`);
    } catch (error) {
      console.error('Error:', error);
    }

    await new Promise(r => setTimeout(r, 1500));
  }

  console.log('\n' + '═'.repeat(70));
  console.log('  Generation complete');
  console.log('═'.repeat(70));
}

main().catch(console.error);
