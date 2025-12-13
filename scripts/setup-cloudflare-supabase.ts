/**
 * Setup Script: Connect Cloudflare Workers to Supabase Mailboxes
 *
 * This script:
 * 1. Verifies the mailboxes table exists in Supabase
 * 2. Imports existing mailboxes from env vars if the table is empty
 * 3. Shows commands to set Cloudflare secrets
 *
 * Run: npx tsx scripts/setup-cloudflare-supabase.ts
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

interface Mailbox {
  email: string;
  display_name: string;
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_pass: string;
  smtp_secure: boolean;
  imap_host: string;
  imap_port: number;
  imap_user: string;
  imap_pass: string;
  imap_secure: boolean;
  warmup_enabled: boolean;
  warmup_start_date: string;
  warmup_stage: number;
  warmup_target_per_day: number;
  daily_limit: number;
  status: string;
  health_score: number;
}

async function checkTable(): Promise<boolean> {
  console.log('Checking if mailboxes table exists...');

  const response = await fetch(
    `${supabaseUrl}/rest/v1/mailboxes?select=id&limit=1`,
    {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    if (error.includes('does not exist') || error.includes('not found') || response.status === 404) {
      return false;
    }
    console.error('Error checking table:', error);
    return false;
  }

  return true;
}

async function countMailboxes(): Promise<number> {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/mailboxes?select=id`,
    {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
      },
    }
  );

  if (!response.ok) return 0;
  const data = await response.json();
  return Array.isArray(data) ? data.length : 0;
}

async function importMailbox(mailbox: Mailbox): Promise<boolean> {
  const response = await fetch(`${supabaseUrl}/rest/v1/mailboxes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(mailbox),
  });

  return response.ok;
}

async function main() {
  console.log('='.repeat(60));
  console.log('  CLOUDFLARE <-> SUPABASE SETUP');
  console.log('='.repeat(60) + '\n');

  // Check prerequisites
  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials in .env.local');
    console.error('Required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  console.log(`Supabase URL: ${supabaseUrl}`);
  console.log('');

  // Step 1: Check if table exists
  const tableExists = await checkTable();

  if (!tableExists) {
    console.log('\n' + '─'.repeat(60));
    console.log('ACTION REQUIRED: Create the mailboxes table\n');
    console.log('The mailboxes table does not exist in Supabase.');
    console.log('Please run the migration SQL in your Supabase Dashboard:\n');
    console.log('1. Go to: https://supabase.com/dashboard/project/_/sql/new');
    console.log('2. Copy the contents of: supabase/migrations/20251212_outreach_mailboxes.sql');
    console.log('3. Run the SQL');
    console.log('4. Re-run this script');
    console.log('─'.repeat(60));
    process.exit(1);
  }

  console.log('✓ Mailboxes table exists');

  // Step 2: Check existing mailboxes
  const existingCount = await countMailboxes();
  console.log(`  Found ${existingCount} existing mailboxes`);

  // Step 3: Import from env vars if table is empty
  if (existingCount === 0) {
    console.log('\nNo mailboxes found. Importing from environment variables...\n');

    const mailboxesToImport: Mailbox[] = [];

    for (let i = 1; i <= 10; i++) {
      const envVar = process.env[`SMTP_INBOX_${i}`];
      if (!envVar) continue;

      const parts = envVar.split('|');
      if (parts.length >= 4) {
        const email = parts[0];
        const password = parts[1];
        const host = parts[2];
        const port = parseInt(parts[3]) || 465;
        const displayName = parts[4] || 'Edward Guest';

        mailboxesToImport.push({
          email,
          display_name: displayName,
          smtp_host: host,
          smtp_port: port,
          smtp_user: email,
          smtp_pass: password,
          smtp_secure: true,
          imap_host: host,
          imap_port: 993,
          imap_user: email,
          imap_pass: password,
          imap_secure: true,
          warmup_enabled: true,
          warmup_start_date: new Date().toISOString().split('T')[0],
          warmup_stage: 4, // These have been in use
          warmup_target_per_day: 20,
          daily_limit: 20,
          status: 'active',
          health_score: 100,
        });
      }
    }

    if (mailboxesToImport.length === 0) {
      console.log('No SMTP_INBOX_* environment variables found.');
      console.log('You can add mailboxes manually via the UI at /outreach/mailboxes');
    } else {
      console.log(`Found ${mailboxesToImport.length} mailboxes to import:\n`);

      for (const mailbox of mailboxesToImport) {
        console.log(`  📧 ${mailbox.email}...`);
        const success = await importMailbox(mailbox);
        console.log(`     ${success ? '✓ Imported' : '✗ Failed'}`);
      }
    }
  }

  // Step 4: Show Cloudflare setup commands
  console.log('\n' + '─'.repeat(60));
  console.log('CLOUDFLARE WORKER SETUP');
  console.log('─'.repeat(60) + '\n');

  console.log('Run these commands to connect Cloudflare Workers to Supabase:\n');

  console.log('cd cloudflare');
  console.log('');
  console.log(`wrangler secret put SUPABASE_URL`);
  console.log(`# Enter: ${supabaseUrl}`);
  console.log('');
  console.log(`wrangler secret put SUPABASE_SERVICE_ROLE_KEY`);
  console.log(`# Enter: ${supabaseKey.slice(0, 20)}... (your service role key)`);
  console.log('');
  console.log('# Then deploy:');
  console.log('npx wrangler deploy');

  console.log('\n' + '─'.repeat(60));
  console.log('HOW IT WORKS');
  console.log('─'.repeat(60) + '\n');

  console.log('1. UI (/outreach/mailboxes) -> Manages mailboxes in Supabase');
  console.log('2. Cloudflare Workers -> Reads mailboxes from Supabase');
  console.log('3. On send -> Updates sent_today in both places');
  console.log('4. On bounce -> Updates health_score, auto-pauses if needed');
  console.log('5. Daily reset -> Resets sent_today, advances warmup stage');

  console.log('\n✅ Setup complete! Visit http://localhost:3000/outreach/mailboxes\n');
}

main().catch(console.error);
