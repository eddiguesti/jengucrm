import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createServerClient();
  const { id } = await params;

  // Try to include pain_signals if the table exists and has proper relationship
  let data;
  let error;

  const result = await supabase
    .from('prospects')
    .select('*, emails(*), activities(*), pain_signals(*)')
    .eq('id', id)
    .single();

  // Check if the error is related to pain_signals table/relationship not existing
  const isPainSignalsError = result.error?.message?.includes('pain_signals') ||
                             result.error?.message?.includes('relationship');

  if (isPainSignalsError) {
    // Table/relationship doesn't exist yet, query without it
    const fallback = await supabase
      .from('prospects')
      .select('*, emails(*), activities(*)')
      .eq('id', id)
      .single();
    data = fallback.data ? { ...fallback.data, pain_signals: [] } : null;
    error = fallback.error;
  } else {
    data = result.data;
    error = result.error;
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  return NextResponse.json({ prospect: data });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createServerClient();
  const { id } = await params;

  try {
    const body = await request.json();

    // Track stage changes
    if (body.stage) {
      const { data: current } = await supabase
        .from('prospects')
        .select('stage')
        .eq('id', id)
        .single();

      if (current && current.stage !== body.stage) {
        await supabase.from('activities').insert({
          prospect_id: id,
          type: 'stage_change',
          title: `Stage changed to ${body.stage}`,
          metadata: { from: current.stage, to: body.stage },
        });
      }
    }

    const { data, error } = await supabase
      .from('prospects')
      .update(body)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ prospect: data });
  } catch (error) {
    return NextResponse.json(
      { error: 'Update failed', details: String(error) },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createServerClient();
  const { id } = await params;

  const { error } = await supabase.from('prospects').delete().eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
