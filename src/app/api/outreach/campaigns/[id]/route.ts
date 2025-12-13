/**
 * Campaign Detail API
 * GET /api/outreach/campaigns/[id] - Get campaign details with sequences
 * PATCH /api/outreach/campaigns/[id] - Update campaign
 * DELETE /api/outreach/campaigns/[id] - Delete campaign
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { campaignSequenceRepository, campaignLeadRepository } from '@/repositories/campaign-sequence.repository';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createServerClient();

    // Get campaign
    const { data: campaign, error } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    // Get sequences
    const sequences = await campaignSequenceRepository.findByCampaign(id);

    // Get lead stats
    const leadStats = await campaignLeadRepository.getCampaignStats(id);

    return NextResponse.json({
      campaign,
      sequences,
      leadStats,
    });
  } catch (error) {
    console.error('GET /api/outreach/campaigns/[id] error:', error);
    return NextResponse.json({ error: 'Failed to fetch campaign' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createServerClient();
    const body = await request.json();

    // Build update object - only include fields that were provided
    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;
    if (body.active !== undefined) updates.active = body.active;
    if (body.daily_limit !== undefined) updates.daily_limit = body.daily_limit;
    if (body.ab_testing_enabled !== undefined) updates.ab_testing_enabled = body.ab_testing_enabled;
    if (body.timezone !== undefined) updates.timezone = body.timezone;
    if (body.send_days !== undefined) updates.send_days = body.send_days;
    if (body.send_time_start !== undefined) updates.send_time_start = body.send_time_start;
    if (body.send_time_end !== undefined) updates.send_time_end = body.send_time_end;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No updates provided' }, { status: 400 });
    }

    const { data: campaign, error } = await supabase
      .from('campaigns')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Failed to update campaign:', error);
      return NextResponse.json({ error: 'Failed to update campaign' }, { status: 500 });
    }

    return NextResponse.json({ campaign });
  } catch (error) {
    console.error('PATCH /api/outreach/campaigns/[id] error:', error);
    return NextResponse.json({ error: 'Failed to update campaign' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createServerClient();

    // Delete sequences first (due to foreign key)
    await campaignSequenceRepository.deleteByCampaign(id);

    // Delete campaign (leads will cascade)
    const { error } = await supabase
      .from('campaigns')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Failed to delete campaign:', error);
      return NextResponse.json({ error: 'Failed to delete campaign' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE /api/outreach/campaigns/[id] error:', error);
    return NextResponse.json({ error: 'Failed to delete campaign' }, { status: 500 });
  }
}
