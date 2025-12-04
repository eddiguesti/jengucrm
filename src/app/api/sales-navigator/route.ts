import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { success, errors } from '@/lib/api-response';
import { logger } from '@/lib/logger';

interface SalesNavProspect {
  profileUrl: string;
  name: string;
  firstname: string;
  lastname: string;
  company: string;
  email: string | null;
  emailStatus: string;
  jobTitle: string;
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
        const fullName = prospect.name || `${prospect.firstname} ${prospect.lastname}`.trim();
        const company = prospect.company;

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
            tags: ['sales_navigator', 'linkedin'],
            notes: `Imported from Sales Navigator\nJob Title: ${prospect.jobTitle || 'N/A'}`,
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
