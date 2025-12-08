/**
 * Import Sales Navigator CSV files in batches
 */

import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.local' });

import fs from 'fs';
import path from 'path';

const SALES_NAV_DIR = '/Users/edd/Documents/Jengu/sales navigator';
const API_URL = 'http://localhost:3000/api/sales-navigator';
const BATCH_SIZE = 100;

interface Prospect {
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

function parseCSV(csvPath: string): Prospect[] {
  const csv = fs.readFileSync(csvPath, 'utf-8');
  const lines = csv.split(/\r?\n/).filter(l => l.trim());
  const headers = lines[0].split(',').map(h => h.trim());

  const prospects: Prospect[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (const char of lines[i]) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current);

    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => obj[h] = values[idx] || '');

    if (obj.profileUrl) {
      prospects.push(obj as unknown as Prospect);
    }
  }

  return prospects;
}

async function importBatch(prospects: Prospect[], filename: string, batchNum: number): Promise<{ imported: number; duplicates: number; errors: number }> {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prospects, filename: `${filename}_batch${batchNum}` }),
  });

  const data = await response.json();
  return {
    imported: data.imported || 0,
    duplicates: data.duplicates || 0,
    errors: data.errors || 0,
  };
}

async function importFile(filename: string): Promise<void> {
  const csvPath = path.join(SALES_NAV_DIR, filename);

  if (!fs.existsSync(csvPath)) {
    console.error('File not found: ' + csvPath);
    return;
  }

  console.log('\n=== Importing ' + filename + ' ===');
  const prospects = parseCSV(csvPath);
  console.log('Parsed ' + prospects.length + ' prospects');

  let totalImported = 0;
  let totalDuplicates = 0;
  let totalErrors = 0;

  const batches = Math.ceil(prospects.length / BATCH_SIZE);

  for (let i = 0; i < batches; i++) {
    const start = i * BATCH_SIZE;
    const end = Math.min(start + BATCH_SIZE, prospects.length);
    const batch = prospects.slice(start, end);

    console.log('  Batch ' + (i + 1) + '/' + batches + ' (' + start + '-' + end + ')...');

    try {
      const result = await importBatch(batch, filename, i + 1);
      totalImported += result.imported;
      totalDuplicates += result.duplicates;
      totalErrors += result.errors;
      console.log('    Done: Imported: ' + result.imported + ', Duplicates: ' + result.duplicates + ', Errors: ' + result.errors);
    } catch (error) {
      console.error('    Batch failed:', error);
      totalErrors += batch.length;
    }

    await new Promise(r => setTimeout(r, 500));
  }

  console.log('\n' + filename + ' complete: Imported ' + totalImported + ', Duplicates ' + totalDuplicates + ', Errors ' + totalErrors);
}

async function main() {
  const files = ['Greece.csv', 'Italy.csv', 'Portugal.csv'];

  console.log('Starting Sales Navigator import...');
  console.log('Files to import: ' + files.join(', '));

  for (const file of files) {
    await importFile(file);
  }

  console.log('\n=== All imports complete ===');
}

main().catch(console.error);
