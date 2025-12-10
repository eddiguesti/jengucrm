/**
 * Bulk Email Verification Script
 *
 * Re-verifies ALL prospect emails using MillionVerifier and archives invalid ones.
 * Run with: npx tsx scripts/verify-all-emails.ts
 */

import { createServerClient } from '../src/lib/supabase';
import { millionVerifierVerify } from '../src/lib/email/finder/services';

const BATCH_SIZE = 50;
const DELAY_BETWEEN_CALLS_MS = 200; // Rate limit protection

interface VerificationResult {
  email: string;
  prospectId: string;
  prospectName: string;
  result: string;
  subresult?: string;
  action: 'keep' | 'archive';
  reason?: string;
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function verifyAllEmails() {
  const supabase = createServerClient();

  console.log('🔍 Starting bulk email verification...\n');

  // Get all prospects with emails that are not archived
  const { data: prospects, error } = await supabase
    .from('prospects')
    .select('id, name, email, stage, last_contacted_at')
    .not('email', 'is', null)
    .neq('email', '')
    .or('archived.is.null,archived.eq.false')
    .order('last_contacted_at', { ascending: true, nullsFirst: true });

  if (error) {
    console.error('❌ Failed to fetch prospects:', error);
    return;
  }

  console.log(`📊 Found ${prospects.length} prospects with emails to verify\n`);

  const results: VerificationResult[] = [];
  const toArchive: { id: string; reason: string }[] = [];

  let processed = 0;
  let invalid = 0;
  let catchAll = 0;
  let valid = 0;
  let errors = 0;

  for (const prospect of prospects) {
    processed++;
    const email = prospect.email.toLowerCase().trim();

    // Basic TLD check first
    const domain = email.split('@')[1];
    if (!domain || !domain.includes('.')) {
      console.log(`❌ [${processed}/${prospects.length}] ${email} - NO TLD`);
      toArchive.push({ id: prospect.id, reason: 'Invalid email: no TLD' });
      invalid++;
      continue;
    }

    try {
      const mvResult = await millionVerifierVerify(email);

      if (!mvResult) {
        console.log(`⚠️  [${processed}/${prospects.length}] ${email} - API ERROR (no result)`);
        errors++;
        continue;
      }

      const resultStr = `${mvResult.result}${mvResult.subresult ? '/' + mvResult.subresult : ''}`;

      if (mvResult.result === 'invalid') {
        console.log(`❌ [${processed}/${prospects.length}] ${email} - INVALID (${mvResult.subresult})`);
        toArchive.push({
          id: prospect.id,
          reason: `MillionVerifier: invalid - ${mvResult.subresult}`
        });
        invalid++;
      } else if (mvResult.result === 'catch_all' || mvResult.subresult === 'catch_all') {
        console.log(`⚠️  [${processed}/${prospects.length}] ${email} - CATCH-ALL`);
        toArchive.push({
          id: prospect.id,
          reason: 'MillionVerifier: catch-all domain (high bounce risk)'
        });
        catchAll++;
      } else if (mvResult.result === 'disposable') {
        console.log(`❌ [${processed}/${prospects.length}] ${email} - DISPOSABLE`);
        toArchive.push({
          id: prospect.id,
          reason: 'MillionVerifier: disposable email'
        });
        invalid++;
      } else if (mvResult.result === 'error') {
        console.log(`⚠️  [${processed}/${prospects.length}] ${email} - ERROR (${mvResult.subresult})`);
        errors++;
      } else {
        // ok or unknown - keep
        if (processed % 50 === 0) {
          console.log(`✅ [${processed}/${prospects.length}] ${email} - ${resultStr}`);
        }
        valid++;
      }

      results.push({
        email,
        prospectId: prospect.id,
        prospectName: prospect.name,
        result: mvResult.result,
        subresult: mvResult.subresult,
        action: ['invalid', 'catch_all', 'disposable'].includes(mvResult.result) ? 'archive' : 'keep',
        reason: mvResult.subresult
      });

    } catch (err) {
      console.log(`⚠️  [${processed}/${prospects.length}] ${email} - EXCEPTION: ${err}`);
      errors++;
    }

    // Rate limiting
    await sleep(DELAY_BETWEEN_CALLS_MS);

    // Progress update every 100
    if (processed % 100 === 0) {
      console.log(`\n📈 Progress: ${processed}/${prospects.length} (${Math.round(processed/prospects.length*100)}%)`);
      console.log(`   Valid: ${valid} | Invalid: ${invalid} | Catch-all: ${catchAll} | Errors: ${errors}\n`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 VERIFICATION COMPLETE');
  console.log('='.repeat(60));
  console.log(`Total processed: ${processed}`);
  console.log(`✅ Valid (ok/unknown): ${valid}`);
  console.log(`❌ Invalid: ${invalid}`);
  console.log(`⚠️  Catch-all: ${catchAll}`);
  console.log(`🔧 API errors: ${errors}`);
  console.log(`🗑️  To archive: ${toArchive.length}`);
  console.log('='.repeat(60) + '\n');

  // Archive invalid emails
  if (toArchive.length > 0) {
    console.log(`\n🗑️  Archiving ${toArchive.length} prospects with bad emails...`);

    let archived = 0;
    for (const item of toArchive) {
      const { error: archiveError } = await supabase
        .from('prospects')
        .update({
          archived: true,
          archived_at: new Date().toISOString(),
          archive_reason: item.reason
        })
        .eq('id', item.id);

      if (archiveError) {
        console.error(`Failed to archive ${item.id}:`, archiveError);
      } else {
        archived++;
      }
    }

    console.log(`✅ Archived ${archived}/${toArchive.length} prospects`);
  }

  // Summary of archived emails
  if (toArchive.length > 0) {
    console.log('\n📋 Archived emails:');
    for (const item of toArchive.slice(0, 20)) {
      const prospect = prospects.find(p => p.id === item.id);
      console.log(`   - ${prospect?.email}: ${item.reason}`);
    }
    if (toArchive.length > 20) {
      console.log(`   ... and ${toArchive.length - 20} more`);
    }
  }
}

verifyAllEmails().catch(console.error);
