/**
 * Test Grok email generation for specific prospects
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
    contact_name: "André Cohen Ferreira",
    contact_title: "General Manager",
    email: "andre@beachenclave.com",
    website: "http://www.beachenclave.com/"
  },
  {
    name: "Grand Hôtel des Bains",
    city: "Locquirec",
    country: "France",
    contact_name: "Jean-Louis Barc",
    contact_title: "Directeur Général",
    email: "reception@grand-hotel-des-bains.com",
    website: "http://www.grand-hotel-des-bains.com"
  },
  {
    name: "HOTEL U CAPU BIANCU",
    city: "Bonifacio",
    country: "France (Corsica)",
    contact_name: "Virginie Sayede",
    contact_title: "General Manager",
    email: "info@ucapubiancu.com",
    website: "https://www.ucapubiancu.com"
  }
];

async function generateEmailWithGrok(prospect: any): Promise<string> {
  const prompt = `You are writing a cold outreach email for Jengu, a company that provides AI-powered mystery shopping and guest experience analysis for hotels.

Write a personalized, professional cold email to the following hotel prospect:

Hotel: ${prospect.name}
Location: ${prospect.city || ''}, ${prospect.country || ''}
Contact Name: ${prospect.contact_name || 'Hotel Manager'}
Contact Title: ${prospect.contact_title || 'General Manager'}
Website: ${prospect.website || 'N/A'}

About Jengu:
- AI-powered mystery shopping that provides detailed, actionable feedback
- Analyzes the entire guest journey from booking to checkout
- Identifies service gaps and training opportunities
- Benchmarks against competitors
- More affordable and consistent than traditional mystery shopping

Write a compelling email that:
1. Opens with something specific about their hotel (use the location/name creatively)
2. Briefly explains Jengu's value proposition
3. Focuses on ONE key benefit relevant to them
4. Has a clear, low-commitment call-to-action
5. Is under 150 words
6. Sounds human and conversational, not salesy
7. Uses the contact's first name if available

Return ONLY the email body (no subject line needed).`;

  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${XAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'grok-2-latest',
      messages: [
        { role: 'system', content: 'You are an expert B2B email copywriter. Write concise, personalized emails.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 500,
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
  console.log('=== Grok Email Generation - Multiple Prospects ===\n');

  for (const prospect of prospects) {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`PROSPECT: ${prospect.name}`);
    console.log(`Location: ${prospect.city}, ${prospect.country}`);
    console.log(`Contact: ${prospect.contact_name} (${prospect.contact_title})`);
    console.log(`Email: ${prospect.email}`);
    console.log(`${'═'.repeat(60)}\n`);

    try {
      const emailBody = await generateEmailWithGrok(prospect);
      console.log('GENERATED EMAIL:');
      console.log('─'.repeat(60));
      console.log(emailBody);
      console.log('─'.repeat(60));
    } catch (error) {
      console.error('Error:', error);
    }

    // Small delay between API calls
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log('\n✓ Done generating emails');
}

main().catch(console.error);
