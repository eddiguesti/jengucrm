/**
 * Import mailboxes via direct REST API
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

async function importMailboxes() {
  console.log('='.repeat(60));
  console.log('  IMPORTING MAILBOXES');
  console.log('='.repeat(60) + '\n');

  // Parse SMTP_INBOX_N format: email|password|host|port|name
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

  console.log(`Found ${mailboxesToImport.length} mailboxes to import\n`);

  for (const mailbox of mailboxesToImport) {
    console.log(`📧 Importing ${mailbox.email}...`);

    // Check if exists
    const checkResponse = await fetch(
      `${supabaseUrl}/rest/v1/mailboxes?email=eq.${encodeURIComponent(mailbox.email)}&select=id`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
      }
    );

    if (checkResponse.ok) {
      const existing = await checkResponse.json();
      if (existing.length > 0) {
        console.log(`   ⏭️  Already exists, skipping\n`);
        continue;
      }
    }

    // Insert
    const insertResponse = await fetch(`${supabaseUrl}/rest/v1/mailboxes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Prefer': 'return=representation',
      },
      body: JSON.stringify(mailbox),
    });

    if (insertResponse.ok) {
      const inserted = await insertResponse.json();
      console.log(`   ✅ Imported successfully (ID: ${inserted[0]?.id})\n`);
    } else {
      const error = await insertResponse.text();
      console.log(`   ❌ Error: ${error}\n`);
    }
  }

  // Verify
  console.log('\n' + '─'.repeat(60));
  console.log('VERIFICATION\n');

  const verifyResponse = await fetch(
    `${supabaseUrl}/rest/v1/mailboxes?select=email,status,health_score,daily_limit,warmup_stage&order=email`,
    {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
      },
    }
  );

  if (verifyResponse.ok) {
    const mailboxes = await verifyResponse.json();
    console.log(`Found ${mailboxes.length} mailboxes in database:\n`);
    for (const mb of mailboxes) {
      console.log(`  📧 ${mb.email}`);
      console.log(`     Status: ${mb.status} | Health: ${mb.health_score}% | Limit: ${mb.daily_limit}/day | Stage: ${mb.warmup_stage}/5\n`);
    }
  } else {
    console.log('❌ Could not verify - table may not exist');
    console.log('\nPlease run the migration SQL in Supabase Dashboard:');
    console.log('https://supabase.com/dashboard/project/_/sql/new\n');
  }

  console.log('─'.repeat(60));
  console.log('\n✅ Done! Visit http://localhost:3000/outreach/mailboxes\n');
}

importMailboxes().catch(console.error);
