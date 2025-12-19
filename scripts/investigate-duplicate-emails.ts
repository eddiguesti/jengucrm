import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error('ERROR: Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function investigateDuplicates() {
  console.log('🔍 Investigating duplicate emails...\n');

  // Find all duplicates
  const { data: duplicates, error } = await supabase.rpc('find_duplicate_emails', {});

  if (error) {
    // If RPC doesn't exist, query directly
    const { data: emails, error: emailError } = await supabase
      .from('emails')
      .select('id, prospect_id, direction, sent_at, created_at, subject, from_email, to_email')
      .not('prospect_id', 'is', null)
      .order('prospect_id, direction, sent_at');

    if (emailError) {
      console.error('Error fetching emails:', emailError);
      return;
    }

    // Find duplicates manually
    const dupeGroups = new Map<string, typeof emails>();

    for (const email of emails || []) {
      const key = `${email.prospect_id}|${email.direction}|${email.sent_at}`;
      if (!dupeGroups.has(key)) {
        dupeGroups.set(key, []);
      }
      dupeGroups.get(key)!.push(email);
    }

    const actualDupes = Array.from(dupeGroups.entries())
      .filter(([_, emails]) => emails.length > 1);

    console.log(`📊 Total duplicate groups: ${actualDupes.length}\n`);

    if (actualDupes.length === 0) {
      console.log('✅ No duplicates found!');
      return;
    }

    // Analyze each duplicate group
    for (const [key, dupeEmails] of actualDupes) {
      const [prospectId, direction, sentAt] = key.split('|');

      console.log(`\n${'='.repeat(80)}`);
      console.log(`🔴 Duplicate Group: ${direction} email at ${sentAt}`);
      console.log(`   Prospect ID: ${prospectId}`);
      console.log(`   Count: ${dupeEmails.length} duplicates\n`);

      // Show details of each duplicate
      dupeEmails.forEach((email, idx) => {
        console.log(`   Duplicate #${idx + 1}:`);
        console.log(`   - ID: ${email.id}`);
        console.log(`   - Created: ${email.created_at}`);
        console.log(`   - Subject: ${email.subject || '(no subject)'}`);
        console.log(`   - From: ${email.from_email}`);
        console.log(`   - To: ${email.to_email}`);
        console.log();
      });

      // Determine which one to keep
      const sorted = [...dupeEmails].sort((a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );

      console.log(`   ✅ Would keep (oldest): ${sorted[0].id} (created ${sorted[0].created_at})`);
      console.log(`   ❌ Would delete: ${sorted.slice(1).map(e => e.id).join(', ')}`);
    }

    console.log('\n' + '='.repeat(80));
    console.log(`\n📈 Summary:`);
    console.log(`   Total emails: ${emails?.length || 0}`);
    console.log(`   Duplicate groups: ${actualDupes.length}`);
    console.log(`   Emails to delete: ${actualDupes.reduce((sum, [_, emails]) => sum + emails.length - 1, 0)}`);

    // Analyze patterns
    console.log(`\n🔍 Pattern Analysis:`);
    const directionCounts = actualDupes.reduce((acc, [_, emails]) => {
      const dir = emails[0].direction;
      acc[dir] = (acc[dir] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    Object.entries(directionCounts).forEach(([dir, count]) => {
      console.log(`   ${dir}: ${count} duplicate groups`);
    });

    // Check if they're identical or different content
    const hasDifferentContent = actualDupes.some(([_, emails]) => {
      const subjects = new Set(emails.map(e => e.subject));
      return subjects.size > 1;
    });

    if (hasDifferentContent) {
      console.log(`\n⚠️  WARNING: Some duplicates have DIFFERENT content (subject lines differ)`);
      console.log(`   This suggests they might be separate emails that happened to be sent at the exact same time.`);
    } else {
      console.log(`\n✅ All duplicates appear to be true duplicates (same content)`);
    }
  }
}

investigateDuplicates().catch(console.error);
