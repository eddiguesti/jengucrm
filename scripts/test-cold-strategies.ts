/**
 * Test the NEW pure cold email strategies (no job board context)
 * Using research-backed psychology: 50-70 words, Alex Berman 3Cs, Cialdini, etc.
 */

const XAI_API_KEY = process.env.XAI_API_KEY;
if (!XAI_API_KEY) {
  console.error('XAI_API_KEY environment variable is required');
  process.exit(1);
}

// Sample prospects from Sales Navigator
const prospects = [
  {
    name: "Beach Enclave",
    city: "Long Bay",
    country: "Anguilla",
    contactName: "André",
    propertyType: "Luxury Villas",
  },
  {
    name: "Grand Hôtel des Bains",
    city: "Locquirec",
    country: "France",
    contactName: "Jean-Louis",
    propertyType: "Boutique Hotel",
  },
  {
    name: "HOTEL U CAPU BIANCU",
    city: "Bonifacio",
    country: "Corsica",
    contactName: "Virginie",
    propertyType: "5-star Luxury",
  }
];

// Strategy C: Cold Direct - human, vulnerable, with forward request
function generateColdDirectPrompt(prospect: any): string {
  return `You are Edd from Jengu. Write a HUMAN, slightly awkward cold email.

=== TONE ===
- Vulnerable, slightly uncertain
- NOT salesy or polished
- Like texting a friend of a friend
- Self-aware that cold emails are annoying

=== KEY ELEMENTS TO INCLUDE ===

1. VULNERABLE OPENER + FORWARD REQUEST:
"This might be a weird one - not even sure if you're the right person. If not, would you mind forwarding to whoever handles operations? Would genuinely appreciate it."

2. WHAT WE DO (keep vague but clear):
"We implement different types of AI systems for hotels - stuff that genuinely saves time and money without feeling robotic."

3. THE HOOK (curiosity, not specifics):
"Most hotels are surprised what's actually possible now."

4. QUALIFYING CTA (flip the dynamic - WE are qualifying THEM):
"Would love a quick chat to see if you'd be a good fit for us. Totally fine if it's not for you - just let me know either way?"

=== TARGET ===
Property: ${prospect.name}
${prospect.contactName ? `Contact: ${prospect.contactName}` : ''}
Location: ${prospect.city}${prospect.country ? `, ${prospect.country}` : ''}
Type: ${prospect.propertyType || 'hotel'}

=== STRUCTURE ===

**SUBJECT (2-4 words, lowercase, casual):**
- "quick question"
- "probably wrong person"
- "weird ask"

**GREETING:**
${prospect.contactName ? `"Hey ${prospect.contactName.split(' ')[0]},"` : `"Hey,"`}

**BODY (80-100 words, 2-3 short paragraphs):**

Paragraph 1: Vulnerable opener + forward request

Paragraph 2: What we do (vague - AI systems, saves time and money) + curiosity hook (surprised what's possible)

Paragraph 3: Qualifying CTA - we want to see if THEY are right for US

=== STRICT RULES ===
- Sound like a human, not a marketer
- Self-aware, slightly awkward
- NO corporate speak
- NO "I hope this finds you well"
- NO hype words
- Keep what we do VAGUE - just "AI systems that save time and money"
- Flip the dynamic: WE are seeing if they're right for us
- Include forward request (increases replies)

Output ONLY valid JSON:
{"subject": "lowercase subject here", "body": "email body here"}`;
}

// Strategy D: Cold Pattern Interrupt - direct but human
function generateColdPatternInterruptPrompt(prospect: any): string {
  return `You are Edd from Jengu. Write a HUMAN, direct but self-aware cold email.

=== TONE ===
- Direct but not aggressive
- Self-aware, slightly self-deprecating
- NOT polished or corporate
- Acknowledges this is a cold email

=== KEY ELEMENTS TO INCLUDE ===

1. HONEST OPENER:
"I'll keep this short - I know you probably get a ton of these."

2. WHAT WE DO (keep vague but clear):
"We implement different types of AI systems for hotels - the kind that actually saves time and money without feeling robotic or annoying guests."

3. CURIOSITY HOOK:
"Most hotels are surprised what's actually possible now - and what they're leaving on the table."

4. QUALIFYING CTA (flip the dynamic - WE are qualifying THEM):
"Would love a quick chat to see if you'd be a good fit for us. Totally fine if it's not for you - just let me know either way?"

=== TARGET ===
Property: ${prospect.name}
${prospect.contactName ? `Contact: ${prospect.contactName}` : ''}
Location: ${prospect.city}${prospect.country ? `, ${prospect.country}` : ''}
Type: ${prospect.propertyType || 'hotel'}

=== STRUCTURE ===

**SUBJECT (2-4 words, lowercase, direct):**
- "quick one"
- "ai for hotels"
- "quick question"

**GREETING:**
${prospect.contactName ? `"Hey ${prospect.contactName.split(' ')[0]},"` : `"Hey,"`}

**BODY (80-100 words, 2-3 short paragraphs):**

Paragraph 1: Honest opener acknowledging this is a cold email

Paragraph 2: What we do (vague - AI systems, saves time and money) + curiosity hook

Paragraph 3: Qualifying CTA - we want to see if THEY are right for US

=== STRICT RULES ===
- Sound human and direct
- Self-aware but not apologetic
- NO corporate jargon
- NO "I hope this finds you well"
- NO hype words
- Keep what we do VAGUE - just "AI systems that save time and money"
- Flip the dynamic: WE are seeing if they're right for us
- End with low-pressure qualifying CTA

Output ONLY valid JSON:
{"subject": "lowercase subject here", "body": "email body here"}`;
}

async function callGrok(prompt: string, systemPrompt: string): Promise<string> {
  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${XAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'grok-2-latest',
      messages: [
        { role: 'system', content: systemPrompt },
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
  console.log('  PURE COLD EMAIL STRATEGIES - RESEARCH-BACKED');
  console.log('  50-70 words | Alex Berman 3Cs | Cialdini | Chris Voss');
  console.log('═'.repeat(70));

  for (const prospect of prospects) {
    console.log(`\n${'━'.repeat(70)}`);
    console.log(`TO: ${prospect.contactName} @ ${prospect.name} (${prospect.city})`);
    console.log('━'.repeat(70));

    // Strategy C: Cold Direct
    console.log('\n📧 STRATEGY C: Cold Direct & Confident');
    console.log('─'.repeat(50));
    try {
      const prompt = generateColdDirectPrompt(prospect);
      const response = await callGrok(prompt, 'You write cold emails like an expert. Short, punchy, no fluff. Sound human.');
      const parsed = parseEmail(response);
      if (parsed) {
        console.log(`Subject: ${parsed.subject}`);
        console.log(`\n${parsed.body}`);
        const wordCount = parsed.body.split(/\s+/).length;
        console.log(`\n[${wordCount} words]`);
      }
    } catch (e) {
      console.error('Error:', e);
    }

    await new Promise(r => setTimeout(r, 1500));

    // Strategy D: Cold Pattern Interrupt
    console.log('\n📧 STRATEGY D: Cold Pattern Interrupt');
    console.log('─'.repeat(50));
    try {
      const prompt = generateColdPatternInterruptPrompt(prospect);
      const response = await callGrok(prompt, 'You write vulnerable, honest cold emails. Slightly uncertain tone builds trust.');
      const parsed = parseEmail(response);
      if (parsed) {
        console.log(`Subject: ${parsed.subject}`);
        console.log(`\n${parsed.body}`);
        const wordCount = parsed.body.split(/\s+/).length;
        console.log(`\n[${wordCount} words]`);
      }
    } catch (e) {
      console.error('Error:', e);
    }

    await new Promise(r => setTimeout(r, 1500));
  }

  console.log('\n' + '═'.repeat(70));
  console.log('  ✅ Pure cold email strategies tested');
  console.log('═'.repeat(70) + '\n');
}

main();
