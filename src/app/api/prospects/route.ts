import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { success, errors } from '@/lib/api-response';
import { parseBody, parseSearchParams, prospectFiltersSchema, createProspectSchema, ValidationError } from '@/lib/validation';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  const supabase = createServerClient();

  try {
    const filters = parseSearchParams(
      new URL(request.url).searchParams,
      prospectFiltersSchema
    );

    let query = supabase
      .from('prospects')
      .select('*', { count: 'exact' })
      .eq('archived', false)
      .order('score', { ascending: false })
      .range(filters.offset, filters.offset + filters.limit - 1);

    // Basic filters
    if (filters.tier) {
      query = query.eq('tier', filters.tier);
    }
    if (filters.stage) {
      query = query.eq('stage', filters.stage);
    }
    if (filters.search) {
      query = query.or(`name.ilike.%${filters.search}%,city.ilike.%${filters.search}%,contact_name.ilike.%${filters.search}%`);
    }
    if (filters.tags) {
      query = query.contains('tags', [filters.tags]);
    }

    // Source filter - handles different source naming conventions
    if (filters.source) {
      if (filters.source === 'sales_navigator') {
        query = query.or('source.eq.sales_navigator,source.eq.linkedin,tags.cs.{sales_navigator}');
      } else if (filters.source === 'google_maps') {
        query = query.or('source.eq.google_maps,source.eq.google,source.eq.scraper');
      } else if (filters.source === 'job_board') {
        query = query.or('source.eq.job_board,source.eq.hosco,source.eq.hcareers,source.eq.indeed');
      } else {
        query = query.eq('source', filters.source);
      }
    }

    // Email status filter
    if (filters.email_status === 'has_email') {
      query = query.not('email', 'is', null).neq('email', '');
    } else if (filters.email_status === 'no_email') {
      query = query.or('email.is.null,email.eq.');
    }

    // Contact status filter - check stage for contact history
    if (filters.contact_status === 'not_contacted') {
      query = query.in('stage', ['new', 'researching']);
    } else if (filters.contact_status === 'contacted') {
      query = query.in('stage', ['outreach', 'contacted']);
    } else if (filters.contact_status === 'replied') {
      query = query.in('stage', ['engaged', 'meeting', 'proposal', 'won']);
    }

    // Smart view filters (pre-built combinations)
    if (filters.smart_view === 'ready_to_contact') {
      // Has email + has research + not contacted yet
      query = query
        .not('email', 'is', null)
        .neq('email', '')
        .not('grok_research', 'is', null)
        .in('stage', ['new', 'researching']);
    } else if (filters.smart_view === 'awaiting_reply') {
      // Contacted but waiting for response
      query = query.in('stage', ['outreach', 'contacted']);
    } else if (filters.smart_view === 'hot_leads') {
      // Replied or showing engagement
      query = query.or('stage.in.(engaged,meeting,proposal),tier.eq.hot');
    } else if (filters.smart_view === 'needs_work') {
      // No email OR no research
      query = query.or('email.is.null,email.eq.,grok_research.is.null');
    }

    const { data, error, count } = await query;

    if (error) {
      logger.error({ error }, 'Failed to fetch prospects');
      return errors.internal('Failed to fetch prospects', error);
    }

    return success({
      prospects: data,
      total: count,
      limit: filters.limit,
      offset: filters.offset,
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return errors.badRequest(error.message);
    }
    logger.error({ error }, 'Unexpected error fetching prospects');
    return errors.internal('Failed to fetch prospects', error);
  }
}

export async function POST(request: NextRequest) {
  const supabase = createServerClient();

  try {
    const body = await parseBody(request, createProspectSchema);

    const { data, error } = await supabase
      .from('prospects')
      .insert({
        name: body.name,
        property_type: body.property_type,
        city: body.city,
        country: body.country,
        website: body.website,
        email: body.email,
        phone: body.phone,
        contact_name: body.contact_name,
        contact_title: body.contact_title,
        notes: body.notes,
        tags: body.tags,
        source: body.source || 'manual',
        stage: 'new',
        tier: 'cold',
        score: 0,
      })
      .select()
      .single();

    if (error) {
      logger.error({ error }, 'Failed to create prospect');
      return errors.badRequest('Failed to create prospect', error);
    }

    if (!data) {
      return errors.internal('Failed to create prospect');
    }

    // Log activity
    const { error: activityError } = await supabase.from('activities').insert({
      prospect_id: data.id,
      type: 'note',
      title: 'Prospect created',
      description: `Added via ${body.source || 'manual'} entry`,
    });

    if (activityError) {
      logger.warn({ error: activityError }, 'Failed to log prospect creation activity');
    }

    logger.info({ prospectId: data.id, name: data.name }, 'Prospect created');
    return success({ prospect: data }, 201);
  } catch (error) {
    if (error instanceof ValidationError) {
      return errors.badRequest(error.message);
    }
    logger.error({ error }, 'Unexpected error creating prospect');
    return errors.internal('Failed to create prospect', error);
  }
}
