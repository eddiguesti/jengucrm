import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

/**
 * Mystery Shopper Queue Management
 * POST: Add a prospect to the mystery shopper queue
 * GET: Get prospects currently in queue
 */

export async function POST(request: NextRequest) {
  const supabase = createServerClient();

  try {
    const body = await request.json();
    const { prospect_id } = body;

    if (!prospect_id) {
      return NextResponse.json({ error: 'prospect_id required' }, { status: 400 });
    }

    // Get prospect details
    const { data: prospect, error: prospectError } = await supabase
      .from('prospects')
      .select('id, name, email, tags, stage')
      .eq('id', prospect_id)
      .single();

    if (prospectError || !prospect) {
      return NextResponse.json({ error: 'Prospect not found' }, { status: 404 });
    }

    if (!prospect.email) {
      return NextResponse.json({ error: 'Prospect has no email address' }, { status: 400 });
    }

    // Check if already sent
    const tags = prospect.tags || [];
    if (tags.includes('mystery-inquiry-sent')) {
      return NextResponse.json({ error: 'Mystery shopper already sent to this prospect' }, { status: 400 });
    }

    // Check if already in queue
    if (tags.includes('mystery-shopper-queued')) {
      return NextResponse.json({ error: 'Prospect is already in the queue' }, { status: 400 });
    }

    // Add to queue by adding tag
    const newTags = [...tags, 'mystery-shopper-queued'];
    const { error: updateError } = await supabase
      .from('prospects')
      .update({ tags: newTags })
      .eq('id', prospect_id);

    if (updateError) {
      console.error('Failed to add to queue:', updateError);
      return NextResponse.json({ error: 'Failed to add to queue' }, { status: 500 });
    }

    // Log activity
    await supabase.from('activities').insert({
      type: 'mystery_shopper',
      title: 'Added to mystery shopper queue',
      description: `${prospect.name} manually added to mystery shopper queue`,
      prospect_id,
    });

    return NextResponse.json({
      success: true,
      message: `${prospect.name} added to mystery shopper queue`,
      prospect_id,
    });
  } catch (error) {
    console.error('Queue add error:', error);
    return NextResponse.json(
      { error: 'Failed to add to queue', details: String(error) },
      { status: 500 }
    );
  }
}

export async function GET() {
  const supabase = createServerClient();

  try {
    // Get prospects that are queued but not yet sent
    const { data: queued, error } = await supabase
      .from('prospects')
      .select('id, name, email, city, country, tier, tags')
      .contains('tags', ['mystery-shopper-queued'])
      .not('tags', 'cs', '{"mystery-inquiry-sent"}')
      .order('tier', { ascending: true }) // hot first
      .limit(50);

    if (error) {
      console.error('Failed to get queue:', error);
      return NextResponse.json({ error: 'Failed to get queue' }, { status: 500 });
    }

    // Count by tier
    const byTier = {
      hot: queued?.filter(p => p.tier === 'hot').length || 0,
      warm: queued?.filter(p => p.tier === 'warm').length || 0,
      cold: queued?.filter(p => p.tier === 'cold').length || 0,
    };

    return NextResponse.json({
      queue: queued || [],
      count: queued?.length || 0,
      byTier,
    });
  } catch (error) {
    console.error('Queue get error:', error);
    return NextResponse.json(
      { error: 'Failed to get queue', details: String(error) },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const supabase = createServerClient();

  try {
    const { searchParams } = new URL(request.url);
    const prospect_id = searchParams.get('prospect_id');

    if (!prospect_id) {
      return NextResponse.json({ error: 'prospect_id required' }, { status: 400 });
    }

    // Get current tags
    const { data: prospect, error: prospectError } = await supabase
      .from('prospects')
      .select('id, name, tags')
      .eq('id', prospect_id)
      .single();

    if (prospectError || !prospect) {
      return NextResponse.json({ error: 'Prospect not found' }, { status: 404 });
    }

    // Remove queue tag
    const tags = (prospect.tags || []).filter((t: string) => t !== 'mystery-shopper-queued');
    const { error: updateError } = await supabase
      .from('prospects')
      .update({ tags })
      .eq('id', prospect_id);

    if (updateError) {
      console.error('Failed to remove from queue:', updateError);
      return NextResponse.json({ error: 'Failed to remove from queue' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `${prospect.name} removed from queue`,
      prospect_id,
    });
  } catch (error) {
    console.error('Queue remove error:', error);
    return NextResponse.json(
      { error: 'Failed to remove from queue', details: String(error) },
      { status: 500 }
    );
  }
}
