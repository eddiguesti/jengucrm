import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

// GET: Fetch notifications
export async function GET(request: NextRequest) {
  const supabase = createServerClient();
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') || '20');
  const unreadOnly = searchParams.get('unread') === 'true';

  let query = supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (unreadOnly) {
    query = query.eq('read', false);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    notifications: data || [],
    unread_count: (data || []).filter(n => !n.read).length,
  });
}

// POST: Mark all notifications as read
export async function POST(request: NextRequest) {
  const supabase = createServerClient();

  try {
    const body = await request.json().catch(() => ({}));

    if (body.action === 'mark_all_read') {
      const { error } = await supabase
        .from('notifications')
        .update({ read: true, read_at: new Date().toISOString() })
        .eq('read', false);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, message: 'All notifications marked as read' });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to process request', details: String(err) },
      { status: 500 }
    );
  }
}
