/**
 * V4: Using ACTUAL Jengu value prop from website + existing campaign strategies
 *
 * JENGU = AI automation for hotels (NOT mystery shopping!)
 * - AI Guest Communication: emails, WhatsApp, live chat (80% automated)
 * - Voice & Booking Bots: 24/7 answering
 * - 40+ hours saved weekly
 * - Up to 30% booking increase
 * - 1-minute response vs industry 15-20 min average
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
    contact_name: "André",
    contact_title: "General Manager",
    propertyType: "Luxury Villas",
    facts: "Ultra-luxury beachfront villas, $2000+/night, butler service, celebrity clientele, high expectations for instant service"
  },
  {
    name: "Grand Hôtel des Bains",
    city: "Locquirec",
    country: "France",
    contact_name: "Jean-Louis",
    contact_title: "Directeur Général",
    propertyType: "Boutique Hotel",
    facts: "Historic 4-star Brittany hotel, Thalasso spa, seasonal peaks, small team stretched thin in summer"
  },
  {
    name: "HOTEL U CAPU BIANCU",
    city: "Bonifacio",
    country: "Corsica",
    contact_name: "Virginie",
    contact_title: "General Manager",
    propertyType: "5-star Luxury",
    facts: "Cliffside 5-star, €500+/night, private beach, exclusive clientele expects instant responses at all hours"
  }
];

// Strategy A: Direct & Confident (from campaign-strategies.ts)
async function generateStrategyA(prospect: any): Promise<string> {
  const prompt = `You are Edd from Jengu. Write a SHORT, CONFIDENT cold email.

=== WHAT JENGU ACTUALLY DOES ===
AI automation for hotels:
- AI handles guest emails, WhatsApp, live chat instantly (under 1 minute)
- 24/7 voice and booking bots
- 80% of inquiries automated
- Hotels save 40+ hours/week
- Up to 30% more bookings (faster response = win the booking)
- NOT mystery shopping - we're about SPEED and AUTOMATION

=== TARGET ===
Property: ${prospect.name} (${prospect.propertyType})
Contact: ${prospect.contact_name} (${prospect.contact_title})
Location: ${prospect.city}, ${prospect.country}
Intel: ${prospect.facts}

=== STRATEGY: DIRECT & CONFIDENT ===
Use the 3Ps:

1. **PRAISE** (1 sentence - specific to them):
Reference something specific about their property type or location.

2. **PICTURE + LOSS** (2 sentences - make them feel the cost):
"But here's the thing - when a guest messages 3 hotels and you reply in 2 hours but someone else replies in 1 minute... that booking's gone."
Adapt this to their specific situation (luxury guests expect instant, seasonal peaks mean overwhelm, etc.)

3. **PUSH + FREEDOM** (1 sentence):
"Worth 15 mins? Totally fine if timing's off."

=== RULES ===
- 70-90 words MAXIMUM
- Subject: lowercase, 3-4 words, curiosity gap (e.g., "${prospect.city} + 1 minute")
- NO "I hope this finds you well", NO hype words
- Sound like expert qualifying THEM
- Use "here's the thing", "honestly", "the reality is"
- End with escape hatch ("totally fine if timing's off")

Output JSON only: {"subject": "...", "body": "..."}`;

  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${XAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'grok-2-latest',
      messages: [
        { role: 'system', content: 'You write cold emails like a confident expert, not a marketer. Short, punchy, no fluff.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.8,
      max_tokens: 300,
    }),
  });

  if (!response.ok) throw new Error(await response.text());
  const data = await response.json();
  return data.choices[0].message.content;
}

// Strategy B: Pattern Interrupt + Vulnerability
async function generateStrategyB(prospect: any): Promise<string> {
  const prompt = `You are Edd from Jengu. Write a PATTERN-INTERRUPT cold email with vulnerability.

=== WHAT JENGU ACTUALLY DOES ===
AI automation for hotels:
- AI handles guest emails, WhatsApp, live chat instantly (under 1 minute)
- 24/7 voice and booking bots
- 80% of inquiries automated
- Hotels save 40+ hours/week
- Up to 30% more bookings (faster response = win the booking)

=== TARGET ===
Property: ${prospect.name} (${prospect.propertyType})
Contact: ${prospect.contact_name} (${prospect.contact_title})
Location: ${prospect.city}, ${prospect.country}
Intel: ${prospect.facts}

=== STRATEGY: PATTERN INTERRUPT + VULNERABILITY ===

1. **VULNERABILITY OPENER** (disarms instantly):
- "I'll be honest - I have no idea if this is even relevant to you."
- "This might be completely off-base, but..."

2. **LABELING + LOSS** (make them feel seen, then hit the pain):
- "But you seem like the kind of property that actually cares about response times."
- Then: "When a guest messages 3 hotels and someone else replies in 1 minute while you're still asleep... that booking's gone."
Adapt to their specific situation.

3. **FUTURE PACE + NEGATIVE REVERSE**:
- "Imagine every inquiry getting a perfect reply in under 1 minute, 24/7."
- "This isn't for everyone - most properties are fine being reactive. But if you've wondered how much slips away overnight..."

=== RULES ===
- 70-90 words MAX
- Subject: 2-4 words, pattern interrupt, lowercase (e.g., "probably ignore this", "weird ask")
- Sound slightly uncertain (builds trust)
- Use "I'll be honest", "This might be..."
- End with soft CTA: "worth a reply?" or "curious if this lands?"
- NO hype, NO excitement

Output JSON only: {"subject": "...", "body": "..."}`;

  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${XAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'grok-2-latest',
      messages: [
        { role: 'system', content: 'You write vulnerable, honest cold emails. No marketing speak. Slightly uncertain tone builds trust.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.85,
      max_tokens: 300,
    }),
  });

  if (!response.ok) throw new Error(await response.text());
  const data = await response.json();
  return data.choices[0].message.content;
}

function parseEmail(response: string): { subject: string; body: string } | null {
  const match = response.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

async function main() {
  console.log('\n' + '═'.repeat(70));
  console.log('  JENGU COLD EMAILS - CORRECT VALUE PROP');
  console.log('  AI Automation = Faster Response = More Bookings');
  console.log('═'.repeat(70));

  for (const prospect of prospects) {
    console.log(`\n${'━'.repeat(70)}`);
    console.log(`TO: ${prospect.contact_name} @ ${prospect.name} (${prospect.city})`);
    console.log('━'.repeat(70));

    // Strategy A
    console.log('\n📧 STRATEGY A: Direct & Confident');
    console.log('─'.repeat(50));
    try {
      const emailA = await generateStrategyA(prospect);
      const parsedA = parseEmail(emailA);
      if (parsedA) {
        console.log(`Subject: ${parsedA.subject}`);
        console.log(`\n${parsedA.body}`);
        console.log(`\n[${parsedA.body.split(/\s+/).length} words]`);
      }
    } catch (e) {
      console.error('Error:', e);
    }

    await new Promise(r => setTimeout(r, 1500));

    // Strategy B
    console.log('\n📧 STRATEGY B: Pattern Interrupt + Vulnerable');
    console.log('─'.repeat(50));
    try {
      const emailB = await generateStrategyB(prospect);
      const parsedB = parseEmail(emailB);
      if (parsedB) {
        console.log(`Subject: ${parsedB.subject}`);
        console.log(`\n${parsedB.body}`);
        console.log(`\n[${parsedB.body.split(/\s+/).length} words]`);
      }
    } catch (e) {
      console.error('Error:', e);
    }

    await new Promise(r => setTimeout(r, 1500));
  }

  console.log('\n' + '═'.repeat(70));
  console.log('  ✅ Emails generated with CORRECT Jengu value proposition');
  console.log('═'.repeat(70) + '\n');
}

main();
