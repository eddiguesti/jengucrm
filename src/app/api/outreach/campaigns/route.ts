/**
 * Campaigns API (Sequence-based campaigns)
 * GET /api/outreach/campaigns - List campaigns with stats
 * POST /api/outreach/campaigns - Create a new campaign
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { campaignSequenceRepository, campaignLeadRepository } from '@/repositories/campaign-sequence.repository';

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerClient();
    const { searchParams } = new URL(request.url);

    const type = searchParams.get('type'); // 'sequence' or 'legacy' or null for all
    const active = searchParams.get('active');

    let query = supabase
      .from('campaigns')
      .select('*')
      .order('created_at', { ascending: false });

    if (type) {
      query = query.eq('type', type);
    }
    if (active !== null) {
      query = query.eq('active', active === 'true');
    }

    const { data: campaigns, error } = await query;

    if (error) {
      console.error('Failed to fetch campaigns:', error);
      return NextResponse.json({ error: 'Failed to fetch campaigns' }, { status: 500 });
    }

    // Enhance with sequence counts and lead stats
    const enhancedCampaigns = await Promise.all(
      (campaigns || []).map(async (campaign) => {
        const [sequences, stats] = await Promise.all([
          campaignSequenceRepository.findByCampaign(campaign.id),
          campaignLeadRepository.getCampaignStats(campaign.id),
        ]);

        return {
          ...campaign,
          sequence_count: sequences.length,
          sequences: sequences.slice(0, 3), // First 3 for preview
          lead_stats: stats,
        };
      })
    );

    // Summary stats
    const summary = {
      total: enhancedCampaigns.length,
      active: enhancedCampaigns.filter(c => c.active).length,
      sequence: enhancedCampaigns.filter(c => c.type === 'sequence').length,
      legacy: enhancedCampaigns.filter(c => c.type === 'legacy' || !c.type).length,
      totalLeads: enhancedCampaigns.reduce((sum, c) => sum + (c.lead_stats?.total || 0), 0),
      activeLeads: enhancedCampaigns.reduce((sum, c) => sum + (c.lead_stats?.active || 0), 0),
    };

    return NextResponse.json({
      campaigns: enhancedCampaigns,
      summary,
    });
  } catch (error) {
    console.error('GET /api/outreach/campaigns error:', error);
    return NextResponse.json({ error: 'Failed to fetch campaigns' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerClient();
    const body = await request.json();

    // Validate required fields
    if (!body.name) {
      return NextResponse.json(
        { error: 'Campaign name is required' },
        { status: 400 }
      );
    }

    // Create the campaign (only include columns that exist in the schema)
    const { data: campaign, error } = await supabase
      .from('campaigns')
      .insert({
        name: body.name,
        description: body.description || null,
        strategy_key: body.strategy_key || `sequence_${Date.now()}`,
        active: false, // Start inactive
        send_days: body.send_days || ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
        send_time_start: body.send_time_start || 9,
        send_time_end: body.send_time_end || 17,
        daily_limit: body.daily_limit || 50,
      })
      .select()
      .single();

    if (error) {
      console.error('Failed to create campaign:', error);
      return NextResponse.json({ error: 'Failed to create campaign' }, { status: 500 });
    }

    // If sequences provided, create them
    if (body.sequences && Array.isArray(body.sequences)) {
      for (const seq of body.sequences) {
        await campaignSequenceRepository.createStep({
          campaign_id: campaign.id,
          step_number: seq.step_number,
          delay_days: seq.delay_days || 0,
          delay_hours: seq.delay_hours || 0,
          variant_a_subject: seq.variant_a_subject || seq.subject,
          variant_a_body: seq.variant_a_body || seq.body,
          variant_b_subject: seq.variant_b_subject,
          variant_b_body: seq.variant_b_body,
          variant_split: seq.variant_split || 50,
          use_ai_generation: seq.use_ai_generation || false,
          ai_prompt_context: seq.ai_prompt_context,
        });
      }
    }

    return NextResponse.json({
      campaign,
      message: 'Campaign created successfully',
    }, { status: 201 });
  } catch (error) {
    console.error('POST /api/outreach/campaigns error:', error);
    return NextResponse.json({ error: 'Failed to create campaign' }, { status: 500 });
  }
}
