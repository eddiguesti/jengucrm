/**
 * Enrich prospects with email finding + MillionVerifier validation
 *
 * Process:
 * 1. Get prospects with website + contact_name but no email
 * 2. Extract domain from website
 * 3. Generate email patterns (first.last@, first@, flast@, etc.)
 * 4. Verify each pattern with MillionVerifier
 * 5. Update prospect with first verified email
 *
 * Run: npx tsx scripts/enrich-with-millionverifier.ts [--dry-run] [--limit=10]
 */

import { supabase } from './lib/supabase';

const MILLIONVERIFIER_API_KEY = process.env.MILLIONVERIFIER_API_KEY;

if (!MILLIONVERIFIER_API_KEY) {
  console.error('MILLIONVERIFIER_API_KEY not set');
  process.exit(1);
}

interface MillionVerifierResult {
  email: string;
  result: 'ok' | 'catch_all' | 'unknown' | 'error' | 'disposable' | 'invalid';
  resultcode: number;
  subresult: string;
  free: boolean;
  role: boolean;
  credits: number;
}

async function verifyEmail(email: string): Promise<MillionVerifierResult | null> {
  try {
    const params = new URLSearchParams({
      api: MILLIONVERIFIER_API_KEY!,
      email,
      timeout: '10',
    });

    const response = await fetch(
      `https://api.millionverifier.com/api/v3/?${params}`,
      { method: 'GET' }
    );

    if (!response.ok) {
      console.error(`  MillionVerifier error: ${response.status}`);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error(`  MillionVerifier exception:`, error);
    return null;
  }
}

function extractDomain(website: string): string | null {
  try {
    const url = new URL(website.startsWith('http') ? website : `https://${website}`);
    return url.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function generateEmailPatterns(firstName: string, lastName: string, domain: string): string[] {
  const f = firstName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const l = lastName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const fi = f.charAt(0);
  const li = l.charAt(0);

  return [
    `${f}.${l}@${domain}`,         // john.smith@
    `${f}@${domain}`,              // john@
    `${f}${l}@${domain}`,          // johnsmith@
    `${fi}${l}@${domain}`,         // jsmith@
    `${f}${li}@${domain}`,         // johns@
    `${fi}.${l}@${domain}`,        // j.smith@
    `${l}.${f}@${domain}`,         // smith.john@
    `${l}@${domain}`,              // smith@
    `${f}_${l}@${domain}`,         // john_smith@
    `${f}-${l}@${domain}`,         // john-smith@
  ];
}

function parseContactName(name: string): { firstName: string; lastName: string } | null {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return null;

  // Handle cases like "John A. Smith" or "María García López"
  const firstName = parts[0];
  const lastName = parts[parts.length - 1];

  if (firstName.length < 2 || lastName.length < 2) return null;

  return { firstName, lastName };
}

async function enrichProspects(dryRun: boolean, limit: number) {
  console.log(`=== EMAIL ENRICHMENT ${dryRun ? '(DRY RUN)' : ''} ===\n`);

  // Get prospects ready to enrich
  const { data: prospects, error } = await supabase
    .from('prospects')
    .select('id, name, contact_name, website, email, stage')
    .eq('archived', false)
    .eq('stage', 'new')
    .is('email', null)
    .not('website', 'is', null)
    .not('contact_name', 'is', null)
    .limit(limit);

  if (error) {
    console.error('Error fetching prospects:', error);
    return;
  }

  if (!prospects || prospects.length === 0) {
    console.log('No prospects to enrich');
    return;
  }

  console.log(`Found ${prospects.length} prospects to process\n`);

  let enriched = 0;
  let failed = 0;
  let creditsUsed = 0;

  for (const prospect of prospects) {
    console.log(`\n--- ${prospect.name} ---`);
    console.log(`Contact: ${prospect.contact_name}`);
    console.log(`Website: ${prospect.website}`);

    // Parse contact name
    const parsed = parseContactName(prospect.contact_name);
    if (!parsed) {
      console.log(`  ✗ Could not parse contact name`);
      failed++;
      continue;
    }

    // Extract domain
    const domain = extractDomain(prospect.website);
    if (!domain) {
      console.log(`  ✗ Could not extract domain from website`);
      failed++;
      continue;
    }

    console.log(`  Domain: ${domain}`);
    console.log(`  Name: ${parsed.firstName} ${parsed.lastName}`);

    // Generate patterns
    const patterns = generateEmailPatterns(parsed.firstName, parsed.lastName, domain);
    console.log(`  Testing ${patterns.length} email patterns...`);

    let foundEmail: string | null = null;
    let foundResult: MillionVerifierResult | null = null;

    for (const email of patterns) {
      if (dryRun) {
        console.log(`    [DRY] Would test: ${email}`);
        continue;
      }

      const result = await verifyEmail(email);
      creditsUsed++;

      if (!result) {
        console.log(`    ${email} - API error`);
        continue;
      }

      console.log(`    ${email} - ${result.result}${result.role ? ' (role)' : ''}`);

      // Accept 'ok' or 'unknown' (but not catch_all for safety)
      if (result.result === 'ok' && !result.role) {
        foundEmail = email;
        foundResult = result;
        console.log(`  ✓ FOUND VALID EMAIL: ${email}`);
        break;
      }

      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 200));
    }

    if (dryRun) {
      console.log(`  [DRY] Would update prospect if valid email found`);
      continue;
    }

    if (foundEmail && foundResult) {
      // Update prospect
      const { error: updateError } = await supabase
        .from('prospects')
        .update({
          email: foundEmail,
          stage: 'enriched',
          tier: 'warm',
          notes: `Email verified with MillionVerifier (${foundResult.result}). Pattern: ${parsed.firstName}.${parsed.lastName}@${domain}`,
          updated_at: new Date().toISOString()
        })
        .eq('id', prospect.id);

      if (updateError) {
        console.log(`  ✗ Failed to update: ${updateError.message}`);
        failed++;
      } else {
        console.log(`  ✓ Updated prospect to enriched`);
        enriched++;
      }
    } else {
      console.log(`  ✗ No valid email found for any pattern`);
      failed++;
    }

    // Delay between prospects
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`Processed: ${prospects.length}`);
  console.log(`Enriched: ${enriched}`);
  console.log(`Failed: ${failed}`);
  console.log(`MillionVerifier credits used: ${creditsUsed}`);
}

// Parse args
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitArg = args.find(a => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1]) : 10;

enrichProspects(dryRun, limit);
