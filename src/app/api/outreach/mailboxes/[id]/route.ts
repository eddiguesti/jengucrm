/**
 * Single Mailbox API
 * GET /api/outreach/mailboxes/[id] - Get mailbox details
 * PATCH /api/outreach/mailboxes/[id] - Update mailbox
 * DELETE /api/outreach/mailboxes/[id] - Delete mailbox
 */

import { NextRequest, NextResponse } from 'next/server';
import { mailboxRepository } from '@/repositories/mailbox.repository';
import type { Mailbox, MailboxStatus } from '@/types';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    const mailbox = await mailboxRepository.findById(id);
    if (!mailbox) {
      return NextResponse.json(
        { error: 'Mailbox not found' },
        { status: 404 }
      );
    }

    // Get daily stats
    const stats = await mailboxRepository.getDailyStats(id, 30);

    return NextResponse.json({
      mailbox: {
        ...mailbox,
        smtp_pass: '********',
        imap_pass: mailbox.imap_pass ? '********' : null,
      },
      dailyStats: stats,
    });
  } catch (error) {
    console.error('GET /api/outreach/mailboxes/[id] error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch mailbox' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();

    const mailbox = await mailboxRepository.findById(id);
    if (!mailbox) {
      return NextResponse.json(
        { error: 'Mailbox not found' },
        { status: 404 }
      );
    }

    // Build updates object
    const updates: Partial<Mailbox> = {};

    // Allowed fields to update
    const allowedFields = [
      'display_name',
      'smtp_host', 'smtp_port', 'smtp_user', 'smtp_secure',
      'imap_host', 'imap_port', 'imap_user', 'imap_secure',
      'warmup_enabled', 'warmup_target_per_day',
      'daily_limit', 'status'
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        (updates as Record<string, unknown>)[field] = body[field];
      }
    }

    // Handle password updates separately (only if provided and not masked)
    if (body.smtp_pass && body.smtp_pass !== '********') {
      updates.smtp_pass = body.smtp_pass;
    }
    if (body.imap_pass && body.imap_pass !== '********') {
      updates.imap_pass = body.imap_pass;
    }

    // Handle status changes with reason
    if (body.status && body.status !== mailbox.status) {
      if (body.status === 'paused' && body.pause_reason) {
        updates.last_error = body.pause_reason;
        updates.last_error_at = new Date().toISOString();
      } else if (body.status === 'active') {
        updates.last_error = null;
        updates.last_error_at = null;
      }
    }

    const updated = await mailboxRepository.update(id, updates);

    return NextResponse.json({
      mailbox: {
        ...updated,
        smtp_pass: '********',
        imap_pass: updated?.imap_pass ? '********' : null,
      },
      message: 'Mailbox updated successfully',
    });
  } catch (error) {
    console.error('PATCH /api/outreach/mailboxes/[id] error:', error);
    return NextResponse.json(
      { error: 'Failed to update mailbox' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    const mailbox = await mailboxRepository.findById(id);
    if (!mailbox) {
      return NextResponse.json(
        { error: 'Mailbox not found' },
        { status: 404 }
      );
    }

    await mailboxRepository.delete(id);

    return NextResponse.json({
      message: 'Mailbox deleted successfully',
    });
  } catch (error) {
    console.error('DELETE /api/outreach/mailboxes/[id] error:', error);
    return NextResponse.json(
      { error: 'Failed to delete mailbox' },
      { status: 500 }
    );
  }
}
