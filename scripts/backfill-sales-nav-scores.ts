/**
 * Backfill Sales Navigator prospects with job titles and updated scores
 * Reads from CSV files and updates existing database records
 */

import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { supabase } from './lib/supabase';

const SALES_NAV_DIR = '/Users/edd/Documents/Jengu/sales navigator';

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

/**
 * Check if a job title indicates a senior/decision-maker role
 */
function getSeniorityScore(jobTitle: string): number {
  if (!jobTitle) return 0;

  const title = jobTitle.toLowerCase();

  // C-level executives - highest priority
  if (/\b(ceo|coo|cfo|chief|president|owner|founder)\b/.test(title)) {
    return 40;
  }

  // General Managers / Directors - high priority
  if (/\b(general\s*manager|gm|director|managing\s*director)\b/.test(title)) {
    return 30;
  }

  // Senior managers - medium priority
  if (/\b(vp|vice\s*president|head\s*of|regional|area\s*manager)\b/.test(title)) {
    return 20;
  }

  // Other managers - lower priority
  if (/\b(manager|supervisor)\b/.test(title)) {
    return 10;
  }

  return 0;
}

/**
 * Check if email appears to be a personal/direct email vs generic
 */
function isPersonalEmail(email: string): boolean {
  if (!email) return false;

  const genericPrefixes = [
    'info@', 'contact@', 'reception@', 'reservation@', 'reservations@',
    'booking@', 'bookings@', 'sales@', 'hello@', 'enquiries@', 'enquiry@',
    'frontdesk@', 'front.desk@', 'guestservices@', 'guest.service@',
    'hotel@', 'mail@', 'admin@', 'office@', 'support@', 'marketing@',
    'team@', 'rsvp@', 'stay@', 'bienvenue@', 'welcome@'
  ];

  const lowerEmail = email.toLowerCase();
  return !genericPrefixes.some(prefix => lowerEmail.startsWith(prefix));
}

async function main() {
  console.log('='.repeat(60));
  console.log('Backfill Sales Navigator Job Titles & Scores');
  console.log('='.repeat(60));

  // Build a lookup map from CSV files: email -> jobTitle
  const csvJobTitles = new Map<string, string>();
  const csvLinkedInUrls = new Map<string, string>();

  // Read all CSV files
  const files = fs.readdirSync(SALES_NAV_DIR)
    .filter(f => f.endsWith('.csv'))
    .map(f => path.join(SALES_NAV_DIR, f));

  console.log('\nReading', files.length, 'CSV files...');

  for (const filePath of files) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const records: SalesNavRecord[] = parse(content, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
      });

      for (const r of records) {
        if (r.email && r.jobTitle) {
          csvJobTitles.set(r.email.toLowerCase(), r.jobTitle);
        }
        if (r.profileUrl && r.jobTitle) {
          csvLinkedInUrls.set(r.profileUrl, r.jobTitle);
        }
      }
    } catch (err) {
      console.error('Error reading', path.basename(filePath), err);
    }
  }

  console.log('Found', csvJobTitles.size, 'email->jobTitle mappings');
  console.log('Found', csvLinkedInUrls.size, 'linkedIn->jobTitle mappings');

  // Get all Sales Navigator prospects from DB
  const { data: prospects, error } = await supabase
    .from('prospects')
    .select('id, name, email, linkedin_url, source_job_title, score, tier, contact_name')
    .eq('source', 'sales_navigator');

  if (error) {
    console.error('Error fetching prospects:', error);
    return;
  }

  console.log('\nFound', prospects?.length || 0, 'Sales Navigator prospects in DB');

  let updated = 0;
  let skipped = 0;
  let noMatch = 0;

  const updates: Array<{
    id: string;
    name: string;
    oldScore: number;
    newScore: number;
    jobTitle: string;
    email: string | null;
  }> = [];

  for (const p of prospects || []) {
    // Try to find job title from CSV
    let jobTitle: string | null = null;

    // First try email match
    if (p.email) {
      jobTitle = csvJobTitles.get(p.email.toLowerCase()) || null;
    }

    // Then try LinkedIn URL match
    if (!jobTitle && p.linkedin_url) {
      jobTitle = csvLinkedInUrls.get(p.linkedin_url) || null;
    }

    if (!jobTitle) {
      noMatch++;
      continue;
    }

    // Calculate new score
    const baseScore = p.email ? 30 : 10;
    const seniorityBonus = getSeniorityScore(jobTitle);
    const personalEmailBonus = p.email && isPersonalEmail(p.email) ? 5 : 0;
    const newScore = Math.min(100, baseScore + seniorityBonus + personalEmailBonus);

    // Determine tier based on score
    const newTier = newScore >= 60 ? 'hot' : newScore >= 40 ? 'warm' : 'cold';

    // Skip if nothing changed
    if (p.source_job_title === jobTitle && p.score === newScore) {
      skipped++;
      continue;
    }

    // Update the prospect
    const { error: updateError } = await supabase
      .from('prospects')
      .update({
        source_job_title: jobTitle,
        contact_title: jobTitle,
        score: newScore,
        tier: newTier,
      })
      .eq('id', p.id);

    if (updateError) {
      console.error('Error updating', p.name, updateError);
    } else {
      updated++;
      updates.push({
        id: p.id,
        name: p.name,
        oldScore: p.score,
        newScore,
        jobTitle,
        email: p.email,
      });
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('RESULTS');
  console.log('='.repeat(60));
  console.log('Updated:', updated);
  console.log('Skipped (no change):', skipped);
  console.log('No CSV match:', noMatch);

  // Show prospects with high scores (eligible for auto-email)
  const highScoreUpdates = updates
    .filter(u => u.newScore >= 50 && u.email && isPersonalEmail(u.email))
    .sort((a, b) => b.newScore - a.newScore);

  if (highScoreUpdates.length > 0) {
    console.log('\n=== HIGH PRIORITY PROSPECTS (score >= 50, personal email) ===\n');
    for (const u of highScoreUpdates.slice(0, 30)) {
      console.log(`${u.newScore.toString().padEnd(3)} | ${u.jobTitle?.substring(0, 30).padEnd(32)} | ${u.email?.substring(0, 30).padEnd(32)} | ${u.name.substring(0, 20)}`);
    }
    console.log('\nTotal high-priority:', highScoreUpdates.length);
  }
}

main().catch(console.error);
