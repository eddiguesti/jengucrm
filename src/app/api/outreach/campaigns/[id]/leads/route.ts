/**
 * Campaign Leads API
 * GET /api/outreach/campaigns/[id]/leads - Get campaign leads
 * POST /api/outreach/campaigns/[id]/leads - Add leads to campaign
 */

import { NextRequest, NextResponse } from 'next/server';
import { campaignLeadRepository } from '@/repositories/campaign-sequence.repository';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: campaignId } = await params;
    const { searchParams } = new URL(request.url);

    const status = searchParams.get('status') as 'active' | 'paused' | 'completed' | 'replied' | 'bounced' | 'unsubscribed' | undefined;
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const result = await campaignLeadRepository.findByCampaign(
      campaignId,
      status ? { status } : {},
      limit,
      offset
    );

    const stats = await campaignLeadRepository.getCampaignStats(campaignId);

    return NextResponse.json({
      leads: result.data,
      total: result.total,
      stats,
    });
  } catch (error) {
    console.error('GET /api/outreach/campaigns/[id]/leads error:', error);
    return NextResponse.json({ error: 'Failed to fetch leads' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: campaignId } = await params;
    const body = await request.json();

    if (!body.prospectIds || !Array.isArray(body.prospectIds) || body.prospectIds.length === 0) {
      return NextResponse.json({ error: 'prospectIds array is required' }, { status: 400 });
    }

    const added = await campaignLeadRepository.addLeads(
      campaignId,
      body.prospectIds,
      body.mailboxId
    );

    return NextResponse.json({
      success: true,
      added,
      message: `Added ${added} leads to campaign`,
    });
  } catch (error) {
    console.error('POST /api/outreach/campaigns/[id]/leads error:', error);
    return NextResponse.json({ error: 'Failed to add leads' }, { status: 500 });
  }
}
