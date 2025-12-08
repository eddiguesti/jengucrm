/**
 * V3: Maximum pattern interrupt, ultra-human, curiosity-driven
 */

const XAI_API_KEY = process.env.XAI_API_KEY;
if (!XAI_API_KEY) {
  console.error('XAI_API_KEY environment variable is required');
  process.exit(1);
}

const prospects = [
  {
    name: "Beach Enclave",
    city: "Long Bay",
    country: "Anguilla",
    contact_name: "André",
    contact_title: "General Manager",
    facts: "Won Caribbean's Leading Villa Resort 2023, butler service, ultra-luxury villas, $2000+/night, celebrity clientele"
  },
  {
    name: "Grand Hôtel des Bains",
    city: "Locquirec",
    country: "France",
    contact_name: "Jean-Louis",
    contact_title: "Directeur Général",
    facts: "Historic 4-star Brittany hotel, Thalasso spa, ocean views, seasonal peaks in summer, family-run feel"
  },
  {
    name: "HOTEL U CAPU BIANCU",
    city: "Bonifacio",
    country: "Corsica",
    contact_name: "Virginie",
    contact_title: "General Manager",
    facts: "5-star cliffside luxury, private beach, Mediterranean cuisine, exclusive, €500+/night"
  }
];

async function generateEmailWithGrok(prospect: any): Promise<string> {
  const prompt = `You're writing a cold email for Ed from Jengu (AI mystery shopping for hotels).

RECIPIENT:
${prospect.contact_name}, ${prospect.contact_title} at ${prospect.name} (${prospect.city}, ${prospect.country})
Research: ${prospect.facts}

THE BRUTAL RULES:
- 50 words MAX. Not 51. Fifty.
- Sound like you're texting a friend who happens to run a hotel
- First sentence MUST make them think "wait, what?" (pattern interrupt)
- NO: "I hope", "I came across", "I was impressed", "reaching out", "touching base"
- NO: "opportunity", "solution", "leverage", "synergy", "partnership"
- Pain point: They don't know what guests REALLY think until it's a 1-star review
- Jengu = AI that acts like a guest and tells you the brutal truth privately
- End with ONE curious question (not "would you be open to a call")

PSYCHOLOGICAL TRIGGERS TO USE:
1. **Curiosity gap** - Say something that makes them NEED to know more
2. **Loss aversion** - What are they missing/losing by NOT knowing?
3. **Social proof** - Hint that smart competitors already do this
4. **Specificity** - One specific detail > ten generic claims

TONE: Like a text from a smart friend who just discovered something cool

EXAMPLES OF GOOD OPENING LINES:
- "Quick question about your Thalasso spa..."
- "Weird thing I noticed about luxury resorts in Corsica..."
- "Do you ever wonder what guests don't tell you?"

EXAMPLES OF BAD OPENING LINES (DO NOT USE):
- "I hope this email finds you well"
- "I came across your hotel and was impressed"
- "I wanted to reach out about an exciting opportunity"

OUTPUT: Just the email. No subject line. No sign-off. No "Ed" or "[Your Name]".`;

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
          content: 'You write emails that sound nothing like marketing. You sound like a real human. Your emails get 20%+ reply rates because they feel genuine and create real curiosity. You hate corporate-speak.'
        },
        { role: 'user', content: prompt }
      ],
      temperature: 0.9,
      max_tokens: 200,
    }),
  });

  if (!response.ok) {
    throw new Error(`Grok API error: ${await response.text()}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

async function main() {
  console.log('\n🔥 V3: ULTRA-HUMAN COLD EMAILS 🔥\n');

  for (const prospect of prospects) {
    console.log('─'.repeat(60));
    console.log(`TO: ${prospect.contact_name} @ ${prospect.name}`);
    console.log('─'.repeat(60) + '\n');

    try {
      const email = await generateEmailWithGrok(prospect);
      const words = email.split(/\s+/).length;
      console.log(email);
      console.log(`\n[${words} words]\n`);
    } catch (e) {
      console.error('Error:', e);
    }

    await new Promise(r => setTimeout(r, 1500));
  }
}

main();
