'use client';

import { useState, useEffect, useCallback, memo } from 'react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Inbox,
  RefreshCw,
  Loader2,
  Mail,
  Send,
  Archive,
  Clock,
  Search,
  ChevronRight,
  User,
  Building2,
  MapPin,
  Calendar,
  Reply,
  MailOpen,
  CheckCircle2,
  XCircle,
  MessageSquare,
  ArrowLeft,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/contexts/ThemeContext';
import Link from 'next/link';

// Thread types from API
interface ThreadMessage {
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

interface ConversationThread {
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

type FilterType = 'all' | 'needs_response' | 'awaiting_reply' | 'resolved';

// Memoized thread list item
const ThreadListItem = memo(function ThreadListItem({
  thread,
  isSelected,
  isLight,
  onSelect,
}: {
  thread: ConversationThread;
  isSelected: boolean;
  isLight: boolean;
  onSelect: () => void;
}) {
  const lastMessage = thread.messages[thread.messages.length - 1];

  return (
    <div
      onClick={onSelect}
      className={cn(
        'p-4 cursor-pointer transition-all border-b',
        isSelected
          ? isLight
            ? 'bg-violet-50 border-l-2 border-l-violet-500 border-b-slate-200'
            : 'bg-violet-500/10 border-l-2 border-l-violet-500 border-b-zinc-800'
          : isLight
            ? 'hover:bg-slate-50 border-b-slate-100'
            : 'hover:bg-zinc-800/50 border-b-zinc-800/50',
        thread.has_unread && !isSelected && (isLight ? 'bg-blue-50/50' : 'bg-blue-500/5')
      )}
    >
      <div className="flex items-start gap-3">
        {/* Unread indicator */}
        <div className={cn(
          'w-2 h-2 rounded-full mt-2 flex-shrink-0',
          thread.has_unread || thread.needs_response
            ? thread.needs_response
              ? 'bg-amber-500'
              : 'bg-blue-500'
            : 'bg-transparent'
        )} />

        <div className="flex-1 min-w-0">
          {/* Header row */}
          <div className="flex items-center justify-between mb-1">
            <span className={cn(
              'font-medium truncate',
              thread.has_unread && 'font-semibold',
              isLight ? 'text-slate-900' : 'text-white'
            )}>
              {thread.prospect.name}
            </span>
            <span className={cn(
              'text-xs flex-shrink-0 ml-2',
              isLight ? 'text-slate-400' : 'text-zinc-500'
            )}>
              {formatRelativeTime(thread.last_activity)}
            </span>
          </div>

          {/* Contact info */}
          {thread.prospect.contact_name && (
            <p className={cn(
              'text-xs truncate mb-1',
              isLight ? 'text-slate-500' : 'text-zinc-500'
            )}>
              {thread.prospect.contact_name}
              {thread.prospect.contact_title && `, ${thread.prospect.contact_title}`}
            </p>
          )}

          {/* Last message preview */}
          <p className={cn(
            'text-sm truncate',
            isLight ? 'text-slate-600' : 'text-zinc-400'
          )}>
            {lastMessage?.direction === 'outbound' && (
              <span className={isLight ? 'text-slate-400' : 'text-zinc-500'}>You: </span>
            )}
            {lastMessage?.subject || lastMessage?.body?.slice(0, 60) || '(No content)'}
          </p>

          {/* Status badges */}
          <div className="flex items-center gap-2 mt-2">
            {thread.needs_response && (
              <Badge className={cn(
                'text-[10px] px-1.5 py-0.5',
                isLight
                  ? 'bg-amber-50 text-amber-600 border-amber-200'
                  : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
              )}>
                Needs response
              </Badge>
            )}
            {thread.awaiting_reply && !thread.needs_response && (
              <Badge className={cn(
                'text-[10px] px-1.5 py-0.5',
                isLight
                  ? 'bg-blue-50 text-blue-600 border-blue-200'
                  : 'bg-blue-500/20 text-blue-400 border-blue-500/30'
              )}>
                Awaiting reply
              </Badge>
            )}
            <span className={cn(
              'text-[10px]',
              isLight ? 'text-slate-400' : 'text-zinc-600'
            )}>
              {thread.message_count} {thread.message_count === 1 ? 'message' : 'messages'}
            </span>
          </div>
        </div>

        <ChevronRight className={cn(
          'h-4 w-4 flex-shrink-0 mt-1',
          isLight ? 'text-slate-300' : 'text-zinc-600'
        )} />
      </div>
    </div>
  );
});

// Memoized message bubble
const MessageBubble = memo(function MessageBubble({
  message,
  isLight,
  prospect,
}: {
  message: ThreadMessage;
  isLight: boolean;
  prospect: ConversationThread['prospect'];
}) {
  const isOutbound = message.direction === 'outbound';

  return (
    <div className={cn(
      'flex',
      isOutbound ? 'justify-end' : 'justify-start'
    )}>
      <div className={cn(
        'max-w-[80%] rounded-2xl px-4 py-3',
        isOutbound
          ? isLight
            ? 'bg-violet-500 text-white'
            : 'bg-violet-600 text-white'
          : isLight
            ? 'bg-white border border-slate-200 text-slate-900'
            : 'bg-zinc-800 border border-zinc-700 text-white'
      )}>
        {/* Header */}
        <div className={cn(
          'flex items-center justify-between gap-4 mb-2 text-xs',
          isOutbound
            ? 'text-white/70'
            : isLight ? 'text-slate-500' : 'text-zinc-500'
        )}>
          <span className="font-medium">
            {isOutbound ? 'You' : prospect.contact_name || prospect.name}
          </span>
          <span>
            {formatMessageTime(message.created_at)}
          </span>
        </div>

        {/* Subject (if different from previous) */}
        {message.subject && (
          <p className={cn(
            'text-sm font-medium mb-2',
            isOutbound ? 'text-white/90' : isLight ? 'text-slate-700' : 'text-zinc-300'
          )}>
            {message.subject}
          </p>
        )}

        {/* Body */}
        <div className={cn(
          'text-sm whitespace-pre-wrap',
          isOutbound ? 'text-white' : ''
        )}>
          {message.body}
        </div>

        {/* Status indicators */}
        {isOutbound && (
          <div className={cn(
            'flex items-center gap-2 mt-2 text-xs',
            'text-white/60'
          )}>
            {message.opened_at && (
              <span className="flex items-center gap-1">
                <MailOpen className="h-3 w-3" />
                Opened
              </span>
            )}
            {message.replied_at && (
              <span className="flex items-center gap-1">
                <Reply className="h-3 w-3" />
                Replied
              </span>
            )}
            {!message.opened_at && !message.replied_at && message.status === 'sent' && (
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Sent
              </span>
            )}
          </div>
        )}

        {/* Email type badge for inbound */}
        {!isOutbound && message.email_type && (
          <div className="mt-2">
            {getEmailTypeBadge(message.email_type, isLight)}
          </div>
        )}
      </div>
    </div>
  );
});

function getEmailTypeBadge(emailType: string, isLight: boolean) {
  const badges: Record<string, { label: string; color: string }> = {
    positive_reply: { label: 'Positive', color: 'emerald' },
    meeting_request: { label: 'Meeting Request', color: 'purple' },
    objection: { label: 'Objection', color: 'amber' },
    not_interested: { label: 'Not Interested', color: 'red' },
  };

  const badge = badges[emailType];
  if (!badge) return null;

  const colors: Record<string, string> = {
    emerald: isLight ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    purple: isLight ? 'bg-purple-50 text-purple-600 border-purple-200' : 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    amber: isLight ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    red: isLight ? 'bg-red-50 text-red-600 border-red-200' : 'bg-red-500/20 text-red-400 border-red-500/30',
  };

  return (
    <Badge className={cn('text-[10px]', colors[badge.color])}>
      {badge.label}
    </Badge>
  );
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatMessageTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  if (isToday) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function UnifiedInboxPage() {
  const { theme } = useTheme();
  const isLight = theme === 'light';

  const [threads, setThreads] = useState<ConversationThread[]>([]);
  const [counts, setCounts] = useState({ all: 0, needs_response: 0, awaiting_reply: 0, resolved: 0 });
  const [loading, setLoading] = useState(true);
  const [selectedThread, setSelectedThread] = useState<ConversationThread | null>(null);
  const [filter, setFilter] = useState<FilterType>('all');
  const [search, setSearch] = useState('');

  // Reply composer state
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);

  const fetchThreads = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('filter', filter);
      if (search) params.set('search', search);

      const res = await fetch(`/api/threads?${params}`);
      const data = await res.json();
      setThreads(data.threads || []);
      setCounts(data.counts || { all: 0, needs_response: 0, awaiting_reply: 0, resolved: 0 });

      // Auto-select first thread if none selected
      if (!selectedThread && data.threads?.length > 0) {
        setSelectedThread(data.threads[0]);
      }
    } catch (error) {
      console.error('Failed to fetch threads:', error);
    } finally {
      setLoading(false);
    }
  }, [filter, search]);

  useEffect(() => {
    fetchThreads();
  }, [fetchThreads]);

  const handleSendReply = async () => {
    if (!selectedThread || !replyText.trim()) return;

    setSending(true);
    try {
      // TODO: Implement reply sending via API
      // For now, just clear and show success
      setReplyText('');
      alert('Reply sending will be implemented with the email service integration');
    } catch (error) {
      console.error('Failed to send reply:', error);
    } finally {
      setSending(false);
    }
  };

  const filterButtons: { key: FilterType; label: string; icon: React.ElementType }[] = [
    { key: 'all', label: 'All', icon: Inbox },
    { key: 'needs_response', label: 'Needs Response', icon: MessageSquare },
    { key: 'awaiting_reply', label: 'Awaiting Reply', icon: Clock },
  ];

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Inbox"
        subtitle={`${counts.needs_response} need response`}
        action={
          <Button size="sm" onClick={fetchThreads} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4 mr-2', loading && 'animate-spin')} />
            Refresh
          </Button>
        }
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel: Thread List */}
        <div className={cn(
          'w-full md:w-[380px] border-r flex flex-col',
          isLight ? 'border-slate-200 bg-white' : 'border-zinc-800 bg-zinc-900/50',
          selectedThread && 'hidden md:flex'
        )}>
          {/* Search & Filter */}
          <div className={cn(
            'p-4 border-b space-y-3',
            isLight ? 'border-slate-200' : 'border-zinc-800'
          )}>
            {/* Search */}
            <div className="relative">
              <Search className={cn(
                'absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4',
                isLight ? 'text-slate-400' : 'text-zinc-500'
              )} />
              <Input
                placeholder="Search conversations..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={cn(
                  'pl-9',
                  isLight ? 'bg-slate-50 border-slate-200' : 'bg-zinc-800 border-zinc-700'
                )}
              />
            </div>

            {/* Filter buttons */}
            <div className="flex gap-2">
              {filterButtons.map(({ key, label, icon: Icon }) => (
                <Button
                  key={key}
                  variant={filter === key ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFilter(key)}
                  className={cn(
                    'flex-1 text-xs h-8',
                    filter === key
                      ? isLight ? 'bg-violet-500 hover:bg-violet-600' : 'bg-violet-600 hover:bg-violet-700'
                      : isLight ? 'border-slate-200' : 'border-zinc-700'
                  )}
                >
                  <Icon className="h-3 w-3 mr-1.5" />
                  {label}
                  <span className={cn(
                    'ml-1.5 px-1.5 rounded text-[10px]',
                    filter === key
                      ? 'bg-white/20'
                      : isLight ? 'bg-slate-100' : 'bg-zinc-800'
                  )}>
                    {counts[key]}
                  </span>
                </Button>
              ))}
            </div>
          </div>

          {/* Thread List */}
          <ScrollArea className="flex-1">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
              </div>
            ) : threads.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4">
                <Inbox className={cn(
                  'h-10 w-10 mb-3',
                  isLight ? 'text-slate-300' : 'text-zinc-700'
                )} />
                <p className={cn(
                  'text-sm text-center',
                  isLight ? 'text-slate-500' : 'text-zinc-500'
                )}>
                  {filter !== 'all' ? 'No conversations match this filter' : 'No conversations yet'}
                </p>
              </div>
            ) : (
              <div>
                {threads.map((thread) => (
                  <ThreadListItem
                    key={thread.prospect_id}
                    thread={thread}
                    isSelected={selectedThread?.prospect_id === thread.prospect_id}
                    isLight={isLight}
                    onSelect={() => setSelectedThread(thread)}
                  />
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Right Panel: Thread Detail */}
        <div className={cn(
          'flex-1 flex flex-col',
          isLight ? 'bg-slate-50' : 'bg-zinc-950',
          !selectedThread && 'hidden md:flex'
        )}>
          {selectedThread ? (
            <>
              {/* Thread Header */}
              <div className={cn(
                'p-4 border-b flex items-center gap-4',
                isLight ? 'border-slate-200 bg-white' : 'border-zinc-800 bg-zinc-900'
              )}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedThread(null)}
                  className="md:hidden"
                >
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  Back
                </Button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className={cn(
                      'font-semibold truncate',
                      isLight ? 'text-slate-900' : 'text-white'
                    )}>
                      {selectedThread.prospect.name}
                    </h2>
                    <Badge className={cn(
                      'text-[10px]',
                      selectedThread.prospect.tier === 'hot'
                        ? 'bg-red-500/20 text-red-400'
                        : selectedThread.prospect.tier === 'warm'
                          ? 'bg-amber-500/20 text-amber-400'
                          : 'bg-blue-500/20 text-blue-400'
                    )}>
                      {selectedThread.prospect.tier}
                    </Badge>
                  </div>
                  <div className={cn(
                    'flex items-center gap-3 text-xs mt-1',
                    isLight ? 'text-slate-500' : 'text-zinc-500'
                  )}>
                    {selectedThread.prospect.contact_name && (
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {selectedThread.prospect.contact_name}
                      </span>
                    )}
                    {selectedThread.prospect.city && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {selectedThread.prospect.city}
                      </span>
                    )}
                  </div>
                </div>

                <Link href={`/prospects/${selectedThread.prospect_id}`}>
                  <Button variant="outline" size="sm" className={cn(
                    isLight ? 'border-slate-200' : 'border-zinc-700'
                  )}>
                    View Profile
                  </Button>
                </Link>
              </div>

              {/* Messages */}
              <ScrollArea className="flex-1 p-4">
                <div className="max-w-3xl mx-auto space-y-4">
                  {/* Thread info */}
                  <div className={cn(
                    'text-center text-xs py-2',
                    isLight ? 'text-slate-400' : 'text-zinc-600'
                  )}>
                    Conversation started {new Date(selectedThread.messages[0]?.created_at).toLocaleDateString([], {
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </div>

                  {/* Messages */}
                  {selectedThread.messages.map((message) => (
                    <MessageBubble
                      key={message.id}
                      message={message}
                      isLight={isLight}
                      prospect={selectedThread.prospect}
                    />
                  ))}
                </div>
              </ScrollArea>

              {/* Reply Composer */}
              <div className={cn(
                'p-4 border-t',
                isLight ? 'border-slate-200 bg-white' : 'border-zinc-800 bg-zinc-900'
              )}>
                <div className="max-w-3xl mx-auto">
                  <div className={cn(
                    'rounded-xl border overflow-hidden',
                    isLight ? 'border-slate-200 bg-slate-50' : 'border-zinc-700 bg-zinc-800'
                  )}>
                    <Textarea
                      placeholder="Write your reply..."
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      rows={3}
                      className={cn(
                        'border-0 resize-none focus-visible:ring-0',
                        isLight ? 'bg-slate-50' : 'bg-zinc-800'
                      )}
                    />
                    <div className={cn(
                      'flex items-center justify-between px-3 py-2 border-t',
                      isLight ? 'border-slate-200' : 'border-zinc-700'
                    )}>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs"
                          disabled
                        >
                          <Sparkles className="h-3 w-3 mr-1.5" />
                          AI Suggest
                        </Button>
                      </div>
                      <Button
                        size="sm"
                        onClick={handleSendReply}
                        disabled={!replyText.trim() || sending}
                        className={cn(
                          'h-8',
                          isLight ? 'bg-violet-500 hover:bg-violet-600' : 'bg-violet-600 hover:bg-violet-700'
                        )}
                      >
                        {sending ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4 mr-2" />
                        )}
                        Send Reply
                      </Button>
                    </div>
                  </div>
                  <p className={cn(
                    'text-xs mt-2 text-center',
                    isLight ? 'text-slate-400' : 'text-zinc-600'
                  )}>
                    Replying to {selectedThread.prospect.email || selectedThread.prospect.name}
                  </p>
                </div>
              </div>
            </>
          ) : (
            // Empty state
            <div className="flex-1 flex flex-col items-center justify-center">
              <Mail className={cn(
                'h-16 w-16 mb-4',
                isLight ? 'text-slate-200' : 'text-zinc-800'
              )} />
              <p className={cn(
                'text-lg font-medium',
                isLight ? 'text-slate-400' : 'text-zinc-600'
              )}>
                Select a conversation
              </p>
              <p className={cn(
                'text-sm mt-1',
                isLight ? 'text-slate-400' : 'text-zinc-600'
              )}>
                Choose a thread from the list to view the conversation
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
