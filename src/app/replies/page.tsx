'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Header } from '@/components/layout/header';
import { MobilePageHeader } from '@/components/layout/mobile-page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  MessageSquare,
  Mail,
  Loader2,
  RefreshCw,
  Search,
  Calendar,
  Building2,
  User,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
  X,
  Inbox,
} from 'lucide-react';
import Link from 'next/link';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';

interface Reply {
  id: string;
  prospect_id: string;
  subject: string;
  body: string;
  from_email: string;
  direction: 'inbound' | 'outbound';
  email_type: string;
  status: string;
  created_at: string;
  sent_at: string | null;
  prospects?: {
    id: string;
    name: string;
    company: string;
    city: string;
    country: string;
    stage: string;
    tier: string;
  };
}

type FilterType = 'all' | 'positive' | 'meeting' | 'objection' | 'not_interested';

function getReplyTypeBadge(emailType: string, isLight: boolean) {
  switch (emailType) {
    case 'positive_reply':
      return (
        <Badge className={cn(
          "text-[10px]",
          isLight ? "bg-emerald-50 text-emerald-600 border-emerald-200" : "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
        )}>
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Positive
        </Badge>
      );
    case 'meeting_request':
      return (
        <Badge className={cn(
          "text-[10px]",
          isLight ? "bg-purple-50 text-purple-600 border-purple-200" : "bg-purple-500/20 text-purple-400 border-purple-500/30"
        )}>
          <Calendar className="h-3 w-3 mr-1" />
          Meeting
        </Badge>
      );
    case 'objection':
      return (
        <Badge className={cn(
          "text-[10px]",
          isLight ? "bg-amber-50 text-amber-600 border-amber-200" : "bg-amber-500/20 text-amber-400 border-amber-500/30"
        )}>
          <Clock className="h-3 w-3 mr-1" />
          Objection
        </Badge>
      );
    case 'not_interested':
      return (
        <Badge className={cn(
          "text-[10px]",
          isLight ? "bg-red-50 text-red-600 border-red-200" : "bg-red-500/20 text-red-400 border-red-500/30"
        )}>
          <XCircle className="h-3 w-3 mr-1" />
          Not Interested
        </Badge>
      );
    default:
      return (
        <Badge className={cn(
          "text-[10px]",
          isLight ? "bg-blue-50 text-blue-600 border-blue-200" : "bg-blue-500/20 text-blue-400 border-blue-500/30"
        )}>
          <Mail className="h-3 w-3 mr-1" />
          Reply
        </Badge>
      );
  }
}

function formatDate(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function RepliesPageContent() {
  const [replies, setReplies] = useState<Reply[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set());
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const searchParams = useSearchParams();
  const agentFilter = searchParams.get('from'); // Agent email from URL

  const fetchReplies = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('direction', 'inbound');
      params.set('limit', '100');
      // Filter by agent email (replies are sent TO the agent)
      if (agentFilter) {
        params.set('to', agentFilter);
      }
      const response = await fetch(`/api/emails?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        // Handle both { data: { emails } } and { emails } response formats
        setReplies(data.data?.emails || data.emails || []);
      }
    } catch (error) {
      console.error('Failed to fetch replies:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReplies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentFilter]);

  const clearFilter = () => {
    window.history.pushState({}, '', '/replies');
    window.location.reload();
  };

  const toggleExpand = (id: string) => {
    setExpandedReplies(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  // Filter replies
  const filteredReplies = replies.filter(reply => {
    // Search filter
    const matchesSearch = searchQuery === '' ||
      reply.subject?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      reply.body?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      reply.prospects?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      reply.prospects?.company?.toLowerCase().includes(searchQuery.toLowerCase());

    // Type filter
    let matchesFilter = true;
    if (filter === 'positive') matchesFilter = reply.email_type === 'positive_reply';
    if (filter === 'meeting') matchesFilter = reply.email_type === 'meeting_request';
    if (filter === 'objection') matchesFilter = reply.email_type === 'objection';
    if (filter === 'not_interested') matchesFilter = reply.email_type === 'not_interested';

    return matchesSearch && matchesFilter;
  });

  // Count by type
  const counts = {
    all: replies.length,
    positive: replies.filter(r => r.email_type === 'positive_reply').length,
    meeting: replies.filter(r => r.email_type === 'meeting_request').length,
    objection: replies.filter(r => r.email_type === 'objection').length,
    not_interested: replies.filter(r => r.email_type === 'not_interested').length,
  };

  return (
    <div className={cn(
      "flex flex-col h-full transition-colors",
      isLight
        ? "bg-gradient-to-br from-[#fef9f3] via-white to-[#f6f2eb]"
        : "bg-background"
    )}>
      <Header
        title="Replies"
        subtitle={agentFilter ? `From agent: ${agentFilter.split('@')[0]}` : `${replies.length} replies received`}
        action={{
          label: 'Refresh',
          onClick: fetchReplies,
        }}
      />

      <MobilePageHeader
        title="Replies"
        subtitle={agentFilter ? `Agent: ${agentFilter.split('@')[0]}` : `${replies.length} replies`}
        action={{
          icon: <RefreshCw className="h-4 w-4" />,
          label: 'Refresh',
          onClick: fetchReplies,
        }}
      />

      {/* Agent filter indicator */}
      {agentFilter && (
        <div className="px-4 md:px-6 py-2">
          <div className={cn(
            "flex items-center gap-2 p-2 rounded-lg",
            isLight ? "bg-emerald-50 border border-emerald-200" : "bg-emerald-500/10 border border-emerald-500/20"
          )}>
            <Inbox className={cn("h-4 w-4", isLight ? "text-emerald-600" : "text-emerald-400")} />
            <span className={cn("text-sm", isLight ? "text-emerald-700" : "text-emerald-400")}>
              Showing replies to agent: {agentFilter}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilter}
              className={cn(
                "ml-auto h-6 px-2",
                isLight ? "text-emerald-600 hover:text-emerald-800" : "text-emerald-400 hover:text-emerald-300"
              )}
            >
              <X className="h-3 w-3 mr-1" />
              Clear
            </Button>
          </div>
        </div>
      )}

      <div className="flex-1 px-4 pb-4 md:p-6 overflow-auto">
        {/* Filters */}
        <div className="mb-4 md:mb-6 space-y-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search replies..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={cn(
                "pl-9",
                isLight ? "bg-white border-slate-200" : "bg-zinc-900 border-zinc-800"
              )}
            />
          </div>

          {/* Filter Buttons */}
          <div className="flex flex-wrap gap-2">
            {[
              { key: 'all', label: 'All', icon: Mail },
              { key: 'positive', label: 'Positive', icon: CheckCircle2 },
              { key: 'meeting', label: 'Meeting', icon: Calendar },
              { key: 'objection', label: 'Objection', icon: Clock },
              { key: 'not_interested', label: 'Not Interested', icon: XCircle },
            ].map(({ key, label, icon: Icon }) => (
              <Button
                key={key}
                variant={filter === key ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter(key as FilterType)}
                className={cn(
                  "h-8 text-xs",
                  filter === key
                    ? isLight ? "bg-sky-500 text-white" : "bg-blue-600 text-white"
                    : isLight ? "border-slate-200" : "border-zinc-700"
                )}
              >
                <Icon className="h-3 w-3 mr-1.5" />
                {label}
                <span className={cn(
                  "ml-1.5 px-1.5 py-0.5 rounded text-[10px]",
                  filter === key
                    ? "bg-white/20"
                    : isLight ? "bg-slate-100" : "bg-zinc-800"
                )}>
                  {counts[key as FilterType]}
                </span>
              </Button>
            ))}
          </div>
        </div>

        {/* Replies List */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          </div>
        ) : filteredReplies.length === 0 ? (
          <Card className={cn(
            isLight ? "bg-white border-slate-200" : "bg-zinc-900 border-zinc-800"
          )}>
            <CardContent className="p-8 md:p-12 text-center">
              <MessageSquare className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground mb-2">No replies found</p>
              <p className="text-sm text-muted-foreground/70">
                {searchQuery || filter !== 'all'
                  ? 'Try adjusting your filters'
                  : 'Replies will appear here when prospects respond to your emails'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredReplies.map((reply) => {
              const isExpanded = expandedReplies.has(reply.id);

              return (
                <Card
                  key={reply.id}
                  className={cn(
                    "overflow-hidden transition-all",
                    isLight
                      ? "bg-white border-slate-200 hover:border-slate-300"
                      : "bg-zinc-900 border-zinc-800 hover:border-zinc-700"
                  )}
                >
                  <CardContent className="p-0">
                    {/* Header - Always Visible */}
                    <div
                      className={cn(
                        "p-4 cursor-pointer",
                        isLight ? "hover:bg-slate-50" : "hover:bg-zinc-800/50"
                      )}
                      onClick={() => toggleExpand(reply.id)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            {getReplyTypeBadge(reply.email_type, isLight)}
                            <span className="text-xs text-muted-foreground">
                              {formatDate(reply.created_at)}
                            </span>
                          </div>

                          <Link
                            href={`/prospects/${reply.prospect_id}`}
                            onClick={(e) => e.stopPropagation()}
                            className={cn(
                              "font-medium hover:underline",
                              isLight ? "text-slate-900" : "text-white"
                            )}
                          >
                            {reply.prospects?.name || 'Unknown'}
                          </Link>

                          {reply.prospects?.company && (
                            <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-0.5">
                              <Building2 className="h-3 w-3" />
                              <span>{reply.prospects.company}</span>
                              {reply.prospects.city && (
                                <>
                                  <span>·</span>
                                  <span>{reply.prospects.city}</span>
                                </>
                              )}
                            </div>
                          )}

                          <p className={cn(
                            "text-sm mt-2 line-clamp-2",
                            isLight ? "text-slate-600" : "text-zinc-400"
                          )}>
                            {reply.subject}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <Link
                            href={`/prospects/${reply.prospect_id}`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 text-xs"
                            >
                              <ExternalLink className="h-3 w-3 mr-1" />
                              View
                            </Button>
                          </Link>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                          >
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* Expanded Content */}
                    {isExpanded && (
                      <div className={cn(
                        "px-4 pb-4 border-t",
                        isLight ? "border-slate-100 bg-slate-50" : "border-zinc-800 bg-zinc-900/50"
                      )}>
                        <div className="pt-4">
                          <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
                            <User className="h-3 w-3" />
                            <span>From: {reply.from_email}</span>
                          </div>
                          <div className={cn(
                            "p-4 rounded-lg text-sm whitespace-pre-wrap",
                            isLight ? "bg-white border border-slate-200" : "bg-zinc-800 border border-zinc-700"
                          )}>
                            {reply.body}
                          </div>

                          <div className="flex items-center gap-2 mt-4">
                            <Link href={`/prospects/${reply.prospect_id}`}>
                              <Button
                                size="sm"
                                className={cn(
                                  "h-8 text-xs",
                                  isLight ? "bg-sky-500 hover:bg-sky-600" : "bg-blue-600 hover:bg-blue-700"
                                )}
                              >
                                <Sparkles className="h-3 w-3 mr-1.5" />
                                View Full Thread
                              </Button>
                            </Link>
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function RepliesPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col h-full bg-background">
        <Header title="Replies" subtitle="Loading..." />
        <div className="flex items-center justify-center h-full">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        </div>
      </div>
    }>
      <RepliesPageContent />
    </Suspense>
  );
}
