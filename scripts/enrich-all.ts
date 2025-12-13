/**
 * Full enrichment pipeline - runs everything in sequence
 *
 * 1. Find websites using DDG + Grok (batches of 200)
 * 2. Find emails using MillionVerifier (batches of 50)
 *
 * Run: npx tsx scripts/enrich-all.ts
 */

import { execSync } from 'child_process';

async function runCommand(cmd: string, description: string): Promise<void> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Starting: ${description}`);
  console.log(`${'='.repeat(60)}\n`);

  try {
    execSync(cmd, {
      stdio: 'inherit',
      cwd: process.cwd(),
      env: process.env
    });
  } catch (error) {
    console.error(`Error in ${description}:`, error);
  }
}

async function main() {
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║           FULL ENRICHMENT PIPELINE                       ║');
  console.log('║  Step 1: Find websites (DDG + Grok)                      ║');
  console.log('║  Step 2: Find emails (MillionVerifier)                   ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('\n');

  // Run in batches until no more prospects to process
  let round = 1;
  const maxRounds = 20; // Safety limit

  while (round <= maxRounds) {
    console.log(`\n\n>>> ROUND ${round} <<<\n`);

    // Step 1: Find websites (500 at a time)
    await runCommand(
      'npx tsx scripts/find-websites-grok.ts --limit=500',
      `Round ${round} - Finding websites (500 prospects)`
    );

    // Step 2: Find emails (100 at a time)
    await runCommand(
      'npx tsx scripts/enrich-with-millionverifier.ts --limit=100',
      `Round ${round} - Finding emails (100 prospects)`
    );

    round++;

    // Small delay between rounds
    await new Promise(r => setTimeout(r, 5000));
  }

  console.log('\n\nEnrichment pipeline complete!');
}

main().catch(console.error);
