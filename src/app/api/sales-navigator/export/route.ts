import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  const escaped = s.replace(/"/g, '""');
  return /[",\n\r]/.test(escaped) ? `"${escaped}"` : escaped;
}

export async function GET(request: NextRequest) {
  const supabase = createServerClient();

  const onlyWithEmail = request.nextUrl.searchParams.get('onlyWithEmail') === 'true';
  const includeArchived = request.nextUrl.searchParams.get('includeArchived') === 'true';
  const limitRaw = request.nextUrl.searchParams.get('limit') || '2000';
  const limit = Math.min(Math.max(parseInt(limitRaw, 10) || 2000, 1), 5000);

  let query = supabase
    .from('prospects')
    .select('id, name, website, contact_name, contact_title, email, linkedin_url, source_job_title, city, country, created_at')
    .eq('source', 'sales_navigator')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (!includeArchived) {
    query = query.eq('archived', false);
  }

  if (onlyWithEmail) {
    query = query.not('email', 'is', null);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const prospectIds = (data || []).map((r) => r.id).filter(Boolean) as string[];
  const { data: queueRows } = prospectIds.length
    ? await supabase
        .from('sales_nav_enrichment_queue')
        .select('prospect_id, email_verified, status, updated_at')
        .in('prospect_id', prospectIds)
    : { data: [] as Array<{ prospect_id: string; email_verified: boolean; status: string; updated_at: string }> };

  const queueByProspectId = new Map<string, { email_verified: boolean; status: string; updated_at: string }>();
  for (const row of queueRows || []) {
    if (!row.prospect_id) continue;
    // Keep the latest
    const existing = queueByProspectId.get(row.prospect_id);
    if (!existing || (row.updated_at && row.updated_at > existing.updated_at)) {
      queueByProspectId.set(row.prospect_id, {
        email_verified: !!row.email_verified,
        status: row.status || '',
        updated_at: row.updated_at || '',
      });
    }
  }

  const headers = [
    'company',
    'website',
    'contact_name',
    'contact_title',
    'email',
    'email_verified',
    'enrichment_status',
    'linkedin_url',
    'job_title',
    'city',
    'country',
    'created_at',
  ] as const;

  const rows = (data || []).map((row) => ({
    company: row.name,
    website: row.website,
    contact_name: row.contact_name,
    contact_title: row.contact_title,
    email: row.email,
    email_verified: queueByProspectId.get(row.id)?.email_verified ?? '',
    enrichment_status: queueByProspectId.get(row.id)?.status ?? '',
    linkedin_url: row.linkedin_url,
    job_title: row.source_job_title,
    city: row.city,
    country: row.country,
    created_at: row.created_at,
  }));

  const csv = [
    headers.join(','),
    ...rows.map((r) => headers.map((h) => csvEscape(r[h])).join(',')),
  ].join('\n');

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="sales-navigator-enriched.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
