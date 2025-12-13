/**
 * Migrate ALL prospects from Supabase to Cloudflare D1
 *
 * Run with: npx tsx scripts/migrate-to-d1.ts
 */
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function migrateProspects() {
  console.log('Fetching ALL prospects from Supabase...');

  // Fetch all prospects in batches
  const allProspects: any[] = [];
  let offset = 0;
  const batchSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('prospects')
      .select('*')
      .range(offset, offset + batchSize - 1);

    if (error) {
      console.error('Error fetching prospects:', error);
      break;
    }

    if (!data || data.length === 0) break;

    allProspects.push(...data);
    console.log(`  Fetched ${allProspects.length} prospects...`);

    if (data.length < batchSize) break;
    offset += batchSize;
  }

  console.log(`\nTotal prospects: ${allProspects.length}`);

  if (allProspects.length === 0) {
    console.log('No prospects to migrate');
    return;
  }

  // Generate SQL insert statements
  const sqlStatements: string[] = [];

  for (const p of allProspects) {
    const escape = (s: string | null | undefined) => {
      if (s === null || s === undefined) return 'NULL';
      return `'${String(s).replace(/'/g, "''")}'`;
    };

    const id = p.id || crypto.randomUUID();
    const name = escape(p.name);
    const city = escape(p.city);
    const country = escape(p.country);
    const propertyType = escape(p.property_type);
    const contactName = escape(p.contact_name);
    const contactEmail = escape(p.contact_email || p.email);
    const contactTitle = escape(p.contact_title);
    const phone = escape(p.phone);
    const website = escape(p.website);
    const linkedinUrl = escape(p.linkedin_url);
    const instagramUrl = escape(p.instagram_url);
    const stage = escape(p.stage || 'new');
    const tier = escape(p.tier || 'cold');
    const score = p.score || 0;
    const leadSource = escape(p.lead_source || p.source || 'manual');
    const sourceUrl = escape(p.source_url);
    const sourceJobTitle = escape(p.source_job_title);
    const jobPainPoints = p.job_pain_points ? escape(JSON.stringify(p.job_pain_points)) : 'NULL';
    const researchNotes = escape(p.research_notes);
    const tags = p.tags ? escape(JSON.stringify(p.tags)) : 'NULL';
    const lastContactedAt = escape(p.last_contacted_at);
    const lastRepliedAt = escape(p.last_replied_at);
    const createdAt = escape(p.created_at || new Date().toISOString());
    const updatedAt = escape(p.updated_at || new Date().toISOString());
    const archived = p.archived ? 1 : 0;
    const emailVerified = p.email_verified ? 1 : 0;
    const emailBounced = p.email_bounced ? 1 : 0;

    sqlStatements.push(`INSERT OR REPLACE INTO prospects (
  id, name, city, country, property_type,
  contact_name, contact_email, contact_title, phone, website,
  linkedin_url, instagram_url,
  stage, tier, score,
  lead_source, source_url, source_job_title, job_pain_points,
  research_notes, tags,
  last_contacted_at, last_replied_at, created_at, updated_at,
  archived, email_verified, email_bounced
) VALUES (
  '${id}', ${name}, ${city}, ${country}, ${propertyType},
  ${contactName}, ${contactEmail}, ${contactTitle}, ${phone}, ${website},
  ${linkedinUrl}, ${instagramUrl},
  ${stage}, ${tier}, ${score},
  ${leadSource}, ${sourceUrl}, ${sourceJobTitle}, ${jobPainPoints},
  ${researchNotes}, ${tags},
  ${lastContactedAt}, ${lastRepliedAt}, ${createdAt}, ${updatedAt},
  ${archived}, ${emailVerified}, ${emailBounced}
);`);
  }

  // Write to file in batches
  const batchSizeForFile = 500;
  const totalBatches = Math.ceil(sqlStatements.length / batchSizeForFile);
  const migrationsDir = path.join(__dirname, '..', 'cloudflare', 'migrations');

  console.log(`\nWriting ${totalBatches} batch files to ${migrationsDir}...`);

  const batchFiles: string[] = [];
  for (let i = 0; i < totalBatches; i++) {
    const start = i * batchSizeForFile;
    const end = Math.min(start + batchSizeForFile, sqlStatements.length);
    const batch = sqlStatements.slice(start, end);

    const filename = path.join(migrationsDir, `seed_batch_${String(i + 1).padStart(3, '0')}.sql`);
    fs.writeFileSync(filename, batch.join('\n\n'));
    batchFiles.push(filename);
    console.log(`  Wrote batch ${i + 1}: ${path.basename(filename)} (${batch.length} records)`);
  }

  // Run migrations
  console.log('\nRunning D1 migrations...');

  for (let i = 0; i < batchFiles.length; i++) {
    const filename = `./migrations/${path.basename(batchFiles[i])}`;
    process.stdout.write(`  Executing batch ${i + 1}/${totalBatches}... `);

    try {
      execSync(`npx wrangler d1 execute jengu-crm --file=${filename} --remote`, {
        cwd: path.join(__dirname, '..', 'cloudflare'),
        stdio: 'pipe',
      });
      console.log('OK');
    } catch (error: any) {
      console.log('ERROR');
      console.error(`    ${error.message}`);
    }

    // Small delay between batches
    await new Promise(r => setTimeout(r, 500));
  }

  // Clean up batch files
  console.log('\nCleaning up batch files...');
  for (const file of batchFiles) {
    fs.unlinkSync(file);
  }

  console.log('\nMigration complete!');
}

migrateProspects().catch(console.error);
