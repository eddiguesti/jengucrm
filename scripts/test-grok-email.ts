/**
 * Test Grok email generation for a Sales Navigator prospect
 */

import { supabase } from './lib/supabase';

const XAI_API_KEY = process.env.XAI_API_KEY;
if (!XAI_API_KEY) {
  console.error('ERROR: Missing XAI_API_KEY environment variable');
  process.exit(1);
}

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
  console.log('=== Testing Grok Email Generation ===\n');

  // Get a Sales Navigator prospect with email and website
  const { data: prospects, error } = await supabase
    .from('prospects')
    .select('*')
    .eq('source', 'sales_navigator')
    .not('email', 'is', null)
    .not('website', 'is', null)
    .limit(5);

  if (error || !prospects || prospects.length === 0) {
    console.log('No prospects with email and website found');
    console.log('Error:', error);
    return;
  }

  // Pick a random prospect
  const prospect = prospects[Math.floor(Math.random() * prospects.length)];

  console.log('Selected Prospect:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Hotel:    ${prospect.name}`);
  console.log(`  Location: ${prospect.city || 'N/A'}, ${prospect.country || 'N/A'}`);
  console.log(`  Contact:  ${prospect.contact_name || 'N/A'} (${prospect.contact_title || 'N/A'})`);
  console.log(`  Email:    ${prospect.email}`);
  console.log(`  Website:  ${prospect.website}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('Generating email with Grok...\n');

  try {
    const emailBody = await generateEmailWithGrok(prospect);

    console.log('Generated Email:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(emailBody);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('✓ Email generated successfully');
  } catch (error) {
    console.error('Error generating email:', error);
  }
}

main().catch(console.error);
