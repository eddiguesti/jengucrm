import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  const supabase = createServerClient();
  const { searchParams } = new URL(request.url);

  const tier = searchParams.get('tier');
  const stage = searchParams.get('stage');
  const search = searchParams.get('search');
  const limit = parseInt(searchParams.get('limit') || '50');
  const offset = parseInt(searchParams.get('offset') || '0');

  let query = supabase
    .from('prospects')
    .select('*', { count: 'exact' })
    .order('score', { ascending: false })
    .range(offset, offset + limit - 1);

  if (tier) {
    query = query.eq('tier', tier);
  }
  if (stage) {
    query = query.eq('stage', stage);
  }
  if (search) {
    query = query.or(`name.ilike.%${search}%,city.ilike.%${search}%`);
  }

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    prospects: data,
    total: count,
    limit,
    offset,
  });
}

export async function POST(request: NextRequest) {
  const supabase = createServerClient();

  try {
    const body = await request.json();

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
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Log activity
    await supabase.from('activities').insert({
      prospect_id: data.id,
      type: 'note',
      title: 'Prospect created',
      description: `Added via ${body.source || 'manual'} entry`,
    });

    return NextResponse.json({ prospect: data }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to create prospect', details: String(error) },
      { status: 500 }
    );
  }
}
