import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export async function GET() {
  try {
    const supabase = createServerClient();

    const { data: runs, error } = await supabase
      .from('review_scrape_logs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(20);

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json({ runs: [] });
    }

    return NextResponse.json({ runs: runs || [] });
  } catch (error) {
    console.error('Failed to fetch review mining runs:', error);
    return NextResponse.json({ runs: [] });
  }
}
