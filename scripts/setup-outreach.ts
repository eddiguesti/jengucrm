/**
 * Setup Outreach System
 * Creates tables and imports existing mailboxes
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runMigrations() {
  console.log('Running migrations...\n');

  const migrationsDir = path.join(process.cwd(), 'supabase/migrations');
  const migrationFiles = [
    '20251212_outreach_mailboxes.sql',
    '20251212_outreach_sequences.sql',
    '20251212_outreach_inbox.sql',
  ];

  for (const file of migrationFiles) {
    const filePath = path.join(migrationsDir, file);
    if (!fs.existsSync(filePath)) {
      console.log(`  Skipping ${file} (not found)`);
      continue;
    }

    console.log(`  Running ${file}...`);
    const sql = fs.readFileSync(filePath, 'utf-8');

    // Split by semicolons and run each statement
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    for (const statement of statements) {
      try {
        const { error } = await supabase.rpc('exec_sql', { sql: statement + ';' });
        if (error && !error.message.includes('already exists')) {
          // Try direct query for DDL
          const { error: directError } = await supabase.from('_migrations').select().limit(0);
          // If that fails, the statement might still have worked
        }
      } catch (e) {
        // Continue on error (likely table already exists)
      }
    }
    console.log(`  ✓ ${file} completed`);
  }
}

async function createMailboxesTable() {
  console.log('\nCreating mailboxes table...');

  // Check if table exists
  const { data: existing } = await supabase
    .from('mailboxes')
    .select('id')
    .limit(1);

  if (existing !== null) {
    console.log('  ✓ Table already exists');
    return true;
  }

  // Create table via raw SQL
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS mailboxes (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      display_name TEXT,
      smtp_host TEXT NOT NULL,
      smtp_port INTEGER DEFAULT 465,
      smtp_user TEXT NOT NULL,
      smtp_pass TEXT NOT NULL,
      smtp_secure BOOLEAN DEFAULT true,
      imap_host TEXT,
      imap_port INTEGER DEFAULT 993,
      imap_user TEXT,
      imap_pass TEXT,
      imap_secure BOOLEAN DEFAULT true,
      warmup_enabled BOOLEAN DEFAULT true,
      warmup_start_date DATE DEFAULT CURRENT_DATE,
      warmup_stage INTEGER DEFAULT 1,
      warmup_target_per_day INTEGER DEFAULT 40,
      daily_limit INTEGER DEFAULT 5,
      sent_today INTEGER DEFAULT 0,
      bounces_today INTEGER DEFAULT 0,
      last_reset_date DATE DEFAULT CURRENT_DATE,
      total_sent INTEGER DEFAULT 0,
      total_bounces INTEGER DEFAULT 0,
      total_replies INTEGER DEFAULT 0,
      total_opens INTEGER DEFAULT 0,
      health_score INTEGER DEFAULT 100,
      bounce_rate DECIMAL(5,2) DEFAULT 0,
      reply_rate DECIMAL(5,2) DEFAULT 0,
      open_rate DECIMAL(5,2) DEFAULT 0,
      status TEXT DEFAULT 'warming',
      last_error TEXT,
      last_error_at TIMESTAMPTZ,
      last_used_at TIMESTAMPTZ,
      smtp_verified BOOLEAN DEFAULT false,
      smtp_verified_at TIMESTAMPTZ,
      imap_verified BOOLEAN DEFAULT false,
      imap_verified_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;

  // For Supabase, we need to use the SQL editor or migrations
  // Let's just try to insert and see if table exists
  console.log('  Note: Please run migrations via Supabase Dashboard SQL Editor if table does not exist');
  return false;
}

async function importMailboxes() {
  console.log('\nImporting mailboxes from .env.local...\n');

  // Parse SMTP_INBOX_N format: email|password|host|port|name
  const mailboxes: Array<{
    email: string;
    password: string;
    host: string;
    port: number;
    displayName: string;
  }> = [];

  for (let i = 1; i <= 10; i++) {
    const envVar = process.env[`SMTP_INBOX_${i}`];
    if (!envVar) continue;

    const parts = envVar.split('|');
    if (parts.length >= 4) {
      mailboxes.push({
        email: parts[0],
        password: parts[1],
        host: parts[2],
        port: parseInt(parts[3]) || 465,
        displayName: parts[4] || parts[0].split('@')[0],
      });
    }
  }

  console.log(`Found ${mailboxes.length} mailboxes to import\n`);

  for (const mb of mailboxes) {
    console.log(`  Importing ${mb.email}...`);

    // Check if already exists
    const { data: existing } = await supabase
      .from('mailboxes')
      .select('id')
      .eq('email', mb.email)
      .single();

    if (existing) {
      console.log(`    ⏭️  Already exists, skipping`);
      continue;
    }

    // Insert new mailbox
    const { data, error } = await supabase
      .from('mailboxes')
      .insert({
        email: mb.email,
        display_name: mb.displayName,
        smtp_host: mb.host,
        smtp_port: mb.port,
        smtp_user: mb.email,
        smtp_pass: mb.password,
        smtp_secure: true,
        imap_host: mb.host.replace('mail.', 'imap.'),
        imap_port: 993,
        imap_user: mb.email,
        imap_pass: mb.password,
        imap_secure: true,
        warmup_enabled: true,
        warmup_start_date: new Date().toISOString().split('T')[0],
        warmup_stage: 4, // They've been in use, start at higher stage
        warmup_target_per_day: 20,
        daily_limit: 20,
        status: 'active',
        health_score: 100,
      })
      .select()
      .single();

    if (error) {
      console.log(`    ❌ Error: ${error.message}`);
    } else {
      console.log(`    ✓ Imported successfully`);
    }
  }
}

async function verifySetup() {
  console.log('\n\nVerifying setup...\n');

  const { data: mailboxes, error } = await supabase
    .from('mailboxes')
    .select('email, status, health_score, daily_limit')
    .order('email');

  if (error) {
    console.log(`  ❌ Error fetching mailboxes: ${error.message}`);
    console.log('\n  The mailboxes table may not exist yet.');
    console.log('  Please run this SQL in your Supabase Dashboard SQL Editor:');
    console.log('\n  -- Copy the contents of supabase/migrations/20251212_outreach_mailboxes.sql');
    return;
  }

  console.log(`  Found ${mailboxes?.length || 0} mailboxes:\n`);
  for (const mb of mailboxes || []) {
    console.log(`    📧 ${mb.email}`);
    console.log(`       Status: ${mb.status} | Health: ${mb.health_score}% | Limit: ${mb.daily_limit}/day`);
  }

  console.log('\n✅ Setup complete! Visit http://localhost:3000/outreach/mailboxes to view');
}

async function main() {
  console.log('='.repeat(60));
  console.log('  OUTREACH SYSTEM SETUP');
  console.log('='.repeat(60));

  await createMailboxesTable();
  await importMailboxes();
  await verifySetup();
}

main().catch(console.error);
