/**
 * Inbox API
 * GET /api/outreach/inbox - List inbox items
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerClient();
    const { searchParams } = new URL(request.url);

    const unread = searchParams.get('unread') === 'true';
    const starred = searchParams.get('starred') === 'true';
    const archived = searchParams.get('archived') === 'true';
    const search = searchParams.get('search');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    let query = supabase
      .from('inbox_items')
      .select(`
        *,
        mailbox:mailboxes(id, email, display_name),
        prospect:prospects(id, name, company, city, country),
        campaign:campaigns(id, name)
      `, { count: 'exact' })
      .order('received_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (unread) {
      query = query.eq('is_read', false);
    }
    if (starred) {
      query = query.eq('is_starred', true);
    }
    if (archived) {
      query = query.eq('is_archived', true);
    } else {
      query = query.eq('is_archived', false);
    }
    if (search) {
      query = query.or(`subject.ilike.%${search}%,from_email.ilike.%${search}%,body_text.ilike.%${search}%`);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('Failed to fetch inbox:', error);
      return NextResponse.json({ error: 'Failed to fetch inbox' }, { status: 500 });
    }

    // Get unread count
    const { count: unreadCount } = await supabase
      .from('inbox_items')
      .select('*', { count: 'exact', head: true })
      .eq('is_read', false)
      .eq('is_archived', false);

    return NextResponse.json({
      items: data || [],
      total: count || 0,
      unreadCount: unreadCount || 0,
      limit,
      offset,
    });
  } catch (error) {
    console.error('GET /api/outreach/inbox error:', error);
    return NextResponse.json({ error: 'Failed to fetch inbox' }, { status: 500 });
  }
}
