/**
 * Import Sales Navigator CSV files into Supabase prospects
 *
 * CSV columns: profileUrl, name, firstname, lastname, company, email, emailStatus, jobTitle, searchQuery
 *
 * Usage: npx tsx scripts/import-sales-nav-csv.ts <csv-file> [--dry-run]
 */

import { supabase } from './lib/supabase';
import * as fs from 'fs';
import * as path from 'path';

interface SalesNavRow {
  profileUrl: string;
  name: string;
  firstname: string;
  lastname: string;
  company: string;
  email: string;
  emailStatus: string;
  jobTitle: string;
  searchQuery: string;
}

function parseCSV(content: string): SalesNavRow[] {
  const lines = content.split('\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));

  const rows: SalesNavRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Parse CSV with quoted fields
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());

    if (values.length >= headers.length) {
      rows.push({
        profileUrl: values[0] || '',
        name: values[1] || '',
        firstname: values[2] || '',
        lastname: values[3] || '',
        company: values[4] || '',
        email: values[5] || '',
        emailStatus: values[6] || '',
        jobTitle: values[7] || '',
        searchQuery: values[8] || ''
      });
    }
  }

  return rows;
}

function extractCountryFromQuery(searchQuery: string): string | null {
  // Extract country from LinkedIn search query
  const countryMatch = searchQuery.match(/text%3A([A-Za-z%20]+)%2CselectionType%3AINCLUDED\)\)\)/);
  if (countryMatch) {
    return decodeURIComponent(countryMatch[1].replace(/%20/g, ' '));
  }
  return null;
}

async function importCSV(filePath: string, dryRun: boolean) {
  const fileName = path.basename(filePath, '.csv');
  console.log(`\n=== Importing: ${fileName} ===\n`);

  // Extract country from filename
  const country = fileName
    .replace(/_/g, ' ')
    .replace(/GMs?\.cvs$/i, '')
    .replace(/\.cvs$/i, '')
    .trim();

  console.log(`Country: ${country}`);

  // Read and parse CSV
  const content = fs.readFileSync(filePath, 'utf-8');
  const rows = parseCSV(content);

  console.log(`Total rows: ${rows.length}`);

  // Filter valid rows
  const validRows = rows.filter(r => r.company && r.company.trim().length > 0);
  console.log(`Valid rows (with company): ${validRows.length}`);

  // Check for existing prospects to avoid duplicates
  const { data: existing } = await supabase
    .from('prospects')
    .select('name, linkedin_url')
    .eq('source', 'sales_navigator');

  const existingNames = new Set(existing?.map(p => p.name?.toLowerCase()) || []);
  const existingLinkedIn = new Set(existing?.map(p => p.linkedin_url) || []);

  let imported = 0;
  let skipped = 0;
  let duplicates = 0;

  for (const row of validRows) {
    // Skip duplicates
    const companyLower = row.company.toLowerCase();
    if (existingNames.has(companyLower) || existingLinkedIn.has(row.profileUrl)) {
      duplicates++;
      continue;
    }

    // Build prospect object
    const prospect = {
      id: crypto.randomUUID(),
      name: row.company,
      contact_name: `${row.firstname} ${row.lastname}`.trim() || null,
      contact_title: row.jobTitle || null,
      email: row.email && row.email.includes('@') ? row.email : null,
      linkedin_url: row.profileUrl || null,
      country: country,
      source: 'sales_navigator',
      source_job_title: row.jobTitle || null,
      stage: 'new',
      tier: 'cold',
      score: 0,
      archived: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    if (dryRun) {
      console.log(`[DRY] Would import: ${prospect.name} | ${prospect.contact_name} | ${prospect.country}`);
      imported++;
      continue;
    }

    const { error } = await supabase.from('prospects').insert(prospect);

    if (error) {
      console.error(`Failed: ${prospect.name} - ${error.message}`);
      skipped++;
    } else {
      imported++;
    }

    // Add to existing set to prevent duplicates within same import
    existingNames.add(companyLower);
  }

  console.log(`\n--- Results ---`);
  console.log(`Imported: ${imported}`);
  console.log(`Skipped (errors): ${skipped}`);
  console.log(`Duplicates: ${duplicates}`);

  return { imported, skipped, duplicates };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const importAll = args.includes('--all');
  const filePaths = args.filter(a => !a.startsWith('--'));

  if (filePaths.length === 0 && !importAll) {
    console.log('Usage: npx tsx scripts/import-sales-nav-csv.ts <csv-file> [--dry-run]');
    console.log('       npx tsx scripts/import-sales-nav-csv.ts --all [--dry-run]');
    process.exit(1);
  }

  // If --all, import all new CSV files
  if (importAll) {
    const salesNavFolder = '/Users/edd/Documents/Jengu/sales navigator';
    const newFiles = [
      'Croatia.csv',
      'Cyprus.csv',
      'Malta.csv',
      'Morocco.csv',
      'Turkey.csv',
      'UK_Brighton_Bristol_Edinburgh_Manchester_Newcastle.csv',
      'UK_London.csv'
    ];

    let totalImported = 0;
    let totalDuplicates = 0;

    for (const file of newFiles) {
      const fullPath = path.join(salesNavFolder, file);
      if (fs.existsSync(fullPath)) {
        const result = await importCSV(fullPath, dryRun);
        totalImported += result.imported;
        totalDuplicates += result.duplicates;
      } else {
        console.log(`File not found: ${file}`);
      }
    }

    console.log(`\n=== TOTAL ===`);
    console.log(`Imported: ${totalImported}`);
    console.log(`Duplicates skipped: ${totalDuplicates}`);
  } else {
    // Import single file
    for (const filePath of filePaths) {
      if (fs.existsSync(filePath)) {
        await importCSV(filePath, dryRun);
      } else {
        console.log(`File not found: ${filePath}`);
      }
    }
  }
}

main();
