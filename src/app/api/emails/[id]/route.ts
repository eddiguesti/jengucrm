import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createServerClient();
  const { id } = await params;

  try {
    const body = await request.json();

    const { data, error } = await supabase
      .from('emails')
      .update(body)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Log activity if status changed to sent
    if (body.status === 'sent') {
      const { data: email } = await supabase
        .from('emails')
        .select('prospect_id, subject')
        .eq('id', id)
        .single();

      if (email) {
        await supabase.from('activities').insert({
          prospect_id: email.prospect_id,
          type: 'email_sent',
          title: 'Email sent',
          description: `Subject: ${email.subject}`,
        });
      }
    }

    return NextResponse.json({ email: data });
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

  const { error } = await supabase.from('emails').delete().eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
