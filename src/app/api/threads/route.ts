import { NextRequest } from 'next/server';
import { z } from 'zod';
import { createServerClient } from '@/lib/supabase';
import { success, errors } from '@/lib/api-response';
import { parseSearchParams, ValidationError } from '@/lib/validation';
import { logger } from '@/lib/logger';

const threadsQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(50),
  filter: z.enum(['all', 'needs_response', 'awaiting_reply', 'resolved']).default('all'),
  search: z.string().optional(),
});

export interface ThreadMessage {
  id: string;
  direction: 'inbound' | 'outbound';
  subject: string | null;
  body: string;
  from_email: string | null;
  to_email: string | null;
  email_type: string | null;
  status: string;
  sent_at: string | null;
  created_at: string;
  opened_at: string | null;
  replied_at: string | null;
}

export interface ConversationThread {
  prospect_id: string;
  prospect: {
    id: string;
    name: string;
    company: string | null;
    city: string | null;
    country: string | null;
    contact_name: string | null;
    contact_title: string | null;
    email: string | null;
    stage: string;
    tier: string;
  };
  messages: ThreadMessage[];
  last_activity: string;
  last_message_direction: 'inbound' | 'outbound';
  has_unread: boolean;
  needs_response: boolean;
  awaiting_reply: boolean;
  message_count: number;
  inbound_count: number;
  outbound_count: number;
}

export async function GET(request: NextRequest) {
  const supabase = createServerClient();

  try {
    const params = parseSearchParams(new URL(request.url).searchParams, threadsQuerySchema);

    // Fetch all emails with prospect info, ordered by created_at
    let query = supabase
      .from('emails')
      .select(`
        id,
        prospect_id,
        direction,
        subject,
        body,
        from_email,
        to_email,
        email_type,
        status,
        sent_at,
        created_at,
        opened_at,
        replied_at,
        prospects!inner(
          id,
          name,
          company,
          city,
          country,
          contact_name,
          contact_title,
          email,
          stage,
          tier
        )
      `)
      .order('created_at', { ascending: false });

    // Apply search filter
    if (params.search) {
      query = query.or(`subject.ilike.%${params.search}%,body.ilike.%${params.search}%,prospects.name.ilike.%${params.search}%,prospects.company.ilike.%${params.search}%`);
    }

    const { data: emails, error } = await query.limit(500);

    if (error) {
      logger.error({ error }, 'Failed to fetch emails for threads');
      return errors.internal('Failed to fetch threads', error);
    }

    // Group emails by prospect_id into threads
    const threadMap = new Map<string, ConversationThread>();

    for (const email of emails || []) {
      if (!email.prospect_id) continue;

      // Supabase returns prospects as object with !inner join
      const prospect = email.prospects as unknown as ConversationThread['prospect'];

      if (!threadMap.has(email.prospect_id)) {
        threadMap.set(email.prospect_id, {
          prospect_id: email.prospect_id,
          prospect,
          messages: [],
          last_activity: email.created_at,
          last_message_direction: email.direction,
          has_unread: false,
          needs_response: false,
          awaiting_reply: false,
          message_count: 0,
          inbound_count: 0,
          outbound_count: 0,
        });
      }

      const thread = threadMap.get(email.prospect_id)!;

      thread.messages.push({
        id: email.id,
        direction: email.direction,
        subject: email.subject,
        body: email.body,
        from_email: email.from_email,
        to_email: email.to_email,
        email_type: email.email_type,
        status: email.status,
        sent_at: email.sent_at,
        created_at: email.created_at,
        opened_at: email.opened_at,
        replied_at: email.replied_at,
      });

      thread.message_count++;
      if (email.direction === 'inbound') {
        thread.inbound_count++;
      } else {
        thread.outbound_count++;
      }

      // Update last activity if this email is more recent
      if (new Date(email.created_at) > new Date(thread.last_activity)) {
        thread.last_activity = email.created_at;
        thread.last_message_direction = email.direction;
      }
    }

    // Process each thread to determine status
    for (const thread of threadMap.values()) {
      // Sort messages chronologically (oldest first for display)
      thread.messages.sort((a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );

      // Determine if needs response: last message is inbound (they replied, we haven't responded)
      const lastMessage = thread.messages[thread.messages.length - 1];
      if (lastMessage) {
        thread.needs_response = lastMessage.direction === 'inbound';
        thread.awaiting_reply = lastMessage.direction === 'outbound';

        // Check if any inbound messages are unread (replied_at is null on our outbound after their inbound)
        const hasInboundAfterLastOutbound = thread.messages.some((msg, i) => {
          if (msg.direction !== 'inbound') return false;
          // Check if there's any outbound after this inbound
          const hasOutboundAfter = thread.messages.slice(i + 1).some(m => m.direction === 'outbound');
          return !hasOutboundAfter;
        });
        thread.has_unread = hasInboundAfterLastOutbound;
      }
    }

    // Convert to array and sort by last_activity
    let threads = Array.from(threadMap.values())
      .sort((a, b) => new Date(b.last_activity).getTime() - new Date(a.last_activity).getTime());

    // Apply filter
    if (params.filter === 'needs_response') {
      threads = threads.filter(t => t.needs_response);
    } else if (params.filter === 'awaiting_reply') {
      threads = threads.filter(t => t.awaiting_reply);
    } else if (params.filter === 'resolved') {
      // For now, resolved means prospect stage is 'won', 'lost', or 'meeting'
      threads = threads.filter(t =>
        ['won', 'lost', 'meeting'].includes(t.prospect.stage)
      );
    }

    // Apply limit
    threads = threads.slice(0, params.limit);

    // Calculate counts for UI
    const allThreads = Array.from(threadMap.values());
    const counts = {
      all: allThreads.length,
      needs_response: allThreads.filter(t => t.needs_response).length,
      awaiting_reply: allThreads.filter(t => t.awaiting_reply).length,
      resolved: allThreads.filter(t => ['won', 'lost', 'meeting'].includes(t.prospect.stage)).length,
    };

    return success({
      threads,
      counts,
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return errors.badRequest(error.message);
    }
    logger.error({ error }, 'Unexpected error fetching threads');
    return errors.internal('Failed to fetch threads', error);
  }
}
