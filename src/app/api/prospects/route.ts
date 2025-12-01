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
      .order('score', { ascending: false })
      .range(filters.offset, filters.offset + filters.limit - 1);

    if (filters.tier) {
      query = query.eq('tier', filters.tier);
    }
    if (filters.stage) {
      query = query.eq('stage', filters.stage);
    }
    if (filters.search) {
      query = query.or(`name.ilike.%${filters.search}%,city.ilike.%${filters.search}%`);
    }
    if (filters.tags) {
      query = query.contains('tags', [filters.tags]);
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
