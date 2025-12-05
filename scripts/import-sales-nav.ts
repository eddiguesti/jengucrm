/**
 * Import Sales Navigator CSV files into the database
 * Usage: npx tsx scripts/import-sales-nav.ts
 */

import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';

const SALES_NAV_DIR = '/Users/edd/Documents/Jengu/sales navigator';
const API_URL = 'http://localhost:3000/api/sales-navigator';

interface SalesNavRecord {
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

async function importCsvFile(filePath: string): Promise<{ imported: number; duplicates: number; errors: number }> {
  const filename = path.basename(filePath);
  console.log(`\nImporting: ${filename}`);

  // Read and parse CSV
  const content = fs.readFileSync(filePath, 'utf-8');
  const records: SalesNavRecord[] = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  console.log(`  Found ${records.length} records`);

  if (records.length === 0) {
    return { imported: 0, duplicates: 0, errors: 0 };
  }

  // Extract country from filename for tagging
  // Handles: "Anguilla.csv", "Barbados_GMs.cvs.csv", "France.cvs.csv"
  const countryMatch = filename.match(/^(.+?)(?:_GMs)?(?:\.cvs)?\.csv$/i);
  let country = countryMatch ? countryMatch[1].replace(/_/g, ' ') : 'Unknown';

  // Fix common typos/variations
  if (country.toLowerCase() === 'bahams') country = 'Bahamas';
  if (country.toLowerCase() === 'st lucia') country = 'Saint Lucia';

  console.log(`  Country detected: ${country}`);

  // Transform records for API
  const prospects = records.map(r => ({
    profileUrl: r.profileUrl,
    name: r.name,
    firstname: r.firstname,
    lastname: r.lastname,
    company: r.company,
    email: r.email || null,
    emailStatus: r.emailStatus,
    jobTitle: r.jobTitle,
    country, // Add country from filename
  }));

  // Send to API
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prospects, filename }),
    });

    const data = await response.json();

    if (data.success && data.result) {
      console.log(`  Imported: ${data.result.imported}, Duplicates: ${data.result.duplicates}, Errors: ${data.result.errors}`);
      return {
        imported: data.result.imported,
        duplicates: data.result.duplicates,
        errors: data.result.errors,
      };
    } else {
      console.error(`  ERROR: ${data.error || 'Unknown error'}`);
      return { imported: 0, duplicates: 0, errors: records.length };
    }
  } catch (err) {
    console.error(`  ERROR: ${err}`);
    return { imported: 0, duplicates: 0, errors: records.length };
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('Sales Navigator CSV Import');
  console.log('='.repeat(60));

  // Find all CSV files
  const files = fs.readdirSync(SALES_NAV_DIR)
    .filter(f => f.endsWith('.csv'))
    .map(f => path.join(SALES_NAV_DIR, f));

  console.log(`Found ${files.length} CSV files to import`);

  const totals = { imported: 0, duplicates: 0, errors: 0 };

  for (const file of files) {
    const result = await importCsvFile(file);
    totals.imported += result.imported;
    totals.duplicates += result.duplicates;
    totals.errors += result.errors;
  }

  console.log('\n' + '='.repeat(60));
  console.log('IMPORT COMPLETE');
  console.log('='.repeat(60));
  console.log(`Total Imported:   ${totals.imported}`);
  console.log(`Total Duplicates: ${totals.duplicates}`);
  console.log(`Total Errors:     ${totals.errors}`);
  console.log('='.repeat(60));

  // List .numbers files that need manual export
  const numbersFiles = fs.readdirSync(SALES_NAV_DIR)
    .filter(f => f.endsWith('.numbers') && !files.some(csv => csv.includes(f.replace('.numbers', ''))));

  if (numbersFiles.length > 0) {
    console.log('\n.numbers files without CSV (need manual export):');
    numbersFiles.forEach(f => console.log(`  - ${f}`));
  }
}

main().catch(console.error);
