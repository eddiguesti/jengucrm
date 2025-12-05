import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { success, errors } from '@/lib/api-response';
import { logger } from '@/lib/logger';

/**
 * Clean and format a person's name properly
 * - Capitalizes first letter of each word
 * - Handles hyphenated names (Jean-Pierre)
 * - Handles prefixes like O', Mc, Mac
 */
function formatName(name: string): string {
  if (!name) return '';

  return name
    .trim()
    .toLowerCase()
    .split(' ')
    .map(word => {
      // Handle hyphenated names
      if (word.includes('-')) {
        return word.split('-').map(part => capitalizeWord(part)).join('-');
      }
      return capitalizeWord(word);
    })
    .join(' ');
}

function capitalizeWord(word: string): string {
  if (!word) return '';

  // Handle O' prefix (O'Brien)
  if (word.startsWith("o'") && word.length > 2) {
    return "O'" + word.charAt(2).toUpperCase() + word.slice(3);
  }

  // Handle Mc prefix (McDonald)
  if (word.startsWith('mc') && word.length > 2) {
    return 'Mc' + word.charAt(2).toUpperCase() + word.slice(3);
  }

  // Handle Mac prefix (MacArthur) - be careful not to match "macy" etc
  if (word.startsWith('mac') && word.length > 4 && /^mac[a-z]/.test(word)) {
    return 'Mac' + word.charAt(3).toUpperCase() + word.slice(4);
  }

  return word.charAt(0).toUpperCase() + word.slice(1);
}

/**
 * Clean company/hotel name
 * - Remove common redundant suffixes
 * - Proper capitalization
 */
function formatCompanyName(name: string): string {
  if (!name) return '';

  let cleaned = name.trim();

  // Remove common suffixes that don't add value
  const redundantSuffixes = [
    /\s*-\s*LinkedIn$/i,
    /\s*\|\s*LinkedIn$/i,
    /\s*Ltd\.?$/i,
    /\s*LLC$/i,
    /\s*Inc\.?$/i,
    /\s*GmbH$/i,
    /\s*SAS$/i,
    /\s*SARL$/i,
  ];

  for (const suffix of redundantSuffixes) {
    cleaned = cleaned.replace(suffix, '');
  }

  return cleaned.trim();
}

interface SalesNavProspect {
  profileUrl: string;
  name: string;
  firstname: string;
  lastname: string;
  company: string;
  email: string | null;
  emailStatus: string;
  jobTitle: string;
  country?: string;
}

/**
 * POST /api/sales-navigator
 * Import prospects from Sales Navigator CSV
 */
export async function POST(request: NextRequest) {
  const supabase = createServerClient();

  try {
    const { prospects, filename } = await request.json() as {
      prospects: SalesNavProspect[];
      filename: string;
    };

    if (!prospects || prospects.length === 0) {
      return errors.badRequest('No prospects provided');
    }

    logger.info({ count: prospects.length, filename }, 'Starting Sales Navigator import');

    let imported = 0;
    let duplicates = 0;
    let errorCount = 0;
    const importedProspects: Array<{
      id: string;
      name: string;
      company: string;
      email: string | null;
      status: 'imported' | 'duplicate' | 'error';
    }> = [];

    for (const prospect of prospects) {
      try {
        // Format names properly
        const rawName = prospect.name || `${prospect.firstname} ${prospect.lastname}`.trim();
        const fullName = formatName(rawName);
        const company = formatCompanyName(prospect.company);

        if (!fullName || !company) {
          errorCount++;
          continue;
        }

        // Check for duplicates by LinkedIn profile URL or name+company
        const { data: existing } = await supabase
          .from('prospects')
          .select('id')
          .or(`linkedin_url.eq.${prospect.profileUrl},and(name.ilike.%${fullName}%,company.ilike.%${company}%)`)
          .limit(1);

        if (existing && existing.length > 0) {
          duplicates++;
          importedProspects.push({
            id: existing[0].id,
            name: fullName,
            company,
            email: prospect.email,
            status: 'duplicate',
          });
          continue;
        }

        // Create prospect
        const tags = ['sales_navigator', 'linkedin'];
        if (prospect.country) {
          tags.push(prospect.country.toLowerCase().replace(/\s+/g, '-'));
        }

        const { data: newProspect, error: insertError } = await supabase
          .from('prospects')
          .insert({
            name: company, // Property name is the company
            contact_name: fullName,
            contact_title: prospect.jobTitle || null,
            email: prospect.email || null,
            linkedin_url: prospect.profileUrl || null,
            source: 'sales_navigator',
            stage: 'new',
            tier: 'cold',
            score: prospect.email ? 30 : 10, // Higher score if has email
            property_type: 'hotel', // Default to hotel
            country: prospect.country || null,
            tags,
            notes: `Imported from Sales Navigator\nJob Title: ${prospect.jobTitle || 'N/A'}${prospect.country ? `\nCountry: ${prospect.country}` : ''}`,
          })
          .select()
          .single();

        if (insertError) {
          logger.error({ error: insertError, prospect: fullName }, 'Failed to insert prospect');
          errorCount++;
          continue;
        }

        if (newProspect) {
          imported++;
          importedProspects.push({
            id: newProspect.id,
            name: fullName,
            company,
            email: prospect.email,
            status: 'imported',
          });

          // Create enrichment job if no email
          if (!prospect.email) {
            await supabase.from('sales_nav_enrichment_queue').insert({
              prospect_id: newProspect.id,
              prospect_name: fullName,
              company: company,
              firstname: prospect.firstname,
              lastname: prospect.lastname,
              linkedin_url: prospect.profileUrl,
              status: 'pending',
            });
          }

          // Log activity
          await supabase.from('activities').insert({
            prospect_id: newProspect.id,
            type: 'note',
            title: 'Imported from Sales Navigator',
            description: `Contact: ${fullName} (${prospect.jobTitle || 'Unknown title'})`,
          });
        }
      } catch (err) {
        logger.error({ error: err, prospect: prospect.name }, 'Error processing prospect');
        errorCount++;
      }
    }

    // Log import
    await supabase.from('sales_nav_import_logs').insert({
      filename: filename || 'unknown.csv',
      total_records: prospects.length,
      imported,
      duplicates,
      errors: errorCount,
      status: 'completed',
    });

    logger.info(
      { total: prospects.length, imported, duplicates, errors: errorCount },
      'Sales Navigator import completed'
    );

    return success({
      success: true,
      result: {
        total: prospects.length,
        imported,
        duplicates,
        errors: errorCount,
        prospects: importedProspects,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Sales Navigator import failed');
    return errors.internal('Import failed', error);
  }
}

/**
 * GET /api/sales-navigator
 * Get import stats
 */
export async function GET() {
  const supabase = createServerClient();

  try {
    // Get recent imports
    const { data: imports } = await supabase
      .from('sales_nav_import_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    // Get enrichment queue stats
    const { data: queue } = await supabase
      .from('sales_nav_enrichment_queue')
      .select('status');

    const stats = {
      pending: queue?.filter(q => q.status === 'pending').length || 0,
      processing: queue?.filter(q => ['finding_email', 'verifying', 'researching'].includes(q.status)).length || 0,
      ready: queue?.filter(q => q.status === 'ready').length || 0,
      failed: queue?.filter(q => q.status === 'failed').length || 0,
    };

    return success({
      imports: imports || [],
      queueStats: stats,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get sales navigator stats');
    return errors.internal('Failed to get stats', error);
  }
}
