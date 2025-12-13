/**
 * Mailboxes API
 * GET /api/outreach/mailboxes - List mailboxes with filters
 * POST /api/outreach/mailboxes - Create a new mailbox
 */

import { NextRequest, NextResponse } from 'next/server';
import { mailboxRepository } from '@/repositories/mailbox.repository';
import type { CreateMailboxInput, MailboxStatus } from '@/types';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const status = searchParams.get('status') as MailboxStatus | null;
    const warmup = searchParams.get('warmup');
    const search = searchParams.get('search');
    const minHealth = searchParams.get('minHealth');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    const filters = {
      ...(status && { status }),
      ...(warmup && { warmup_enabled: warmup === 'true' }),
      ...(search && { search }),
      ...(minHealth && { minHealthScore: parseInt(minHealth) }),
    };

    const [result, summary] = await Promise.all([
      mailboxRepository.findWithFilters(filters, limit, offset),
      mailboxRepository.getSummaryStats(),
    ]);

    // Mask passwords in response
    const mailboxes = result.data.map(m => ({
      ...m,
      smtp_pass: '********',
      imap_pass: m.imap_pass ? '********' : null,
    }));

    return NextResponse.json({
      mailboxes,
      total: result.total,
      limit: result.limit,
      offset: result.offset,
      summary,
    });
  } catch (error) {
    console.error('GET /api/outreach/mailboxes error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch mailboxes' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as CreateMailboxInput;

    // Validate required fields
    if (!body.email || !body.smtp_host || !body.smtp_user || !body.smtp_pass) {
      return NextResponse.json(
        { error: 'Missing required fields: email, smtp_host, smtp_user, smtp_pass' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(body.email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Check for duplicate email
    const existing = await mailboxRepository.findByEmail(body.email);
    if (existing) {
      return NextResponse.json(
        { error: 'A mailbox with this email already exists' },
        { status: 409 }
      );
    }

    const mailbox = await mailboxRepository.createMailbox(body);

    return NextResponse.json({
      mailbox: {
        ...mailbox,
        smtp_pass: '********',
        imap_pass: mailbox.imap_pass ? '********' : null,
      },
      message: 'Mailbox created successfully',
    }, { status: 201 });
  } catch (error) {
    console.error('POST /api/outreach/mailboxes error:', error);
    return NextResponse.json(
      { error: 'Failed to create mailbox' },
      { status: 500 }
    );
  }
}
