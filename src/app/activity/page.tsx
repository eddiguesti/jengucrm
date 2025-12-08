'use client';

import { useState, useEffect } from 'react';
import { Header } from '@/components/layout/header';
import { MobilePageHeader } from '@/components/layout/mobile-page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Activity,
  Mail,
  Calendar,
  Loader2,
  RefreshCw,
  Search,
  MessageSquare,
  ArrowRight,
  CheckCircle2,
  Bot,
  User,
  Zap,
  Send,
  Clock,
  ExternalLink,
} from 'lucide-react';
import Link from 'next/link';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';

interface ActivityItem {
  id: string;
  type: string;
  title: string;
  description?: string;
  created_at: string;
  prospect_id?: string;
  prospects?: {
    id: string;
    name: string;
    company: string;
  };
}

function getActivityIcon(type: string) {
  switch (type) {
    case 'email_sent':
      return <Send className="h-4 w-4 text-blue-400" />;
    case 'email_opened':
      return <Mail className="h-4 w-4 text-cyan-400" />;
    case 'reply':
    case 'email_reply':
      return <MessageSquare className="h-4 w-4 text-amber-400" />;
    case 'stage_change':
      return <ArrowRight className="h-4 w-4 text-purple-400" />;
    case 'meeting':
    case 'meeting_request':
      return <Calendar className="h-4 w-4 text-emerald-400" />;
    case 'enrichment':
      return <Zap className="h-4 w-4 text-yellow-400" />;
    case 'mystery_shopper':
      return <Bot className="h-4 w-4 text-pink-400" />;
    case 'prospect_created':
      return <User className="h-4 w-4 text-green-400" />;
    case 'system':
      return <Bot className="h-4 w-4 text-zinc-400" />;
    default:
      return <Activity className="h-4 w-4 text-zinc-400" />;
  }
}

function getActivityColor(type: string, isLight: boolean) {
  switch (type) {
    case 'email_sent':
      return isLight ? 'bg-blue-50 border-blue-200' : 'bg-blue-500/10 border-blue-500/20';
    case 'email_opened':
      return isLight ? 'bg-cyan-50 border-cyan-200' : 'bg-cyan-500/10 border-cyan-500/20';
    case 'reply':
    case 'email_reply':
      return isLight ? 'bg-amber-50 border-amber-200' : 'bg-amber-500/10 border-amber-500/20';
    case 'stage_change':
      return isLight ? 'bg-purple-50 border-purple-200' : 'bg-purple-500/10 border-purple-500/20';
    case 'meeting':
    case 'meeting_request':
      return isLight ? 'bg-emerald-50 border-emerald-200' : 'bg-emerald-500/10 border-emerald-500/20';
    case 'enrichment':
      return isLight ? 'bg-yellow-50 border-yellow-200' : 'bg-yellow-500/10 border-yellow-500/20';
    case 'mystery_shopper':
      return isLight ? 'bg-pink-50 border-pink-200' : 'bg-pink-500/10 border-pink-500/20';
    case 'prospect_created':
      return isLight ? 'bg-green-50 border-green-200' : 'bg-green-500/10 border-green-500/20';
    default:
      return isLight ? 'bg-slate-50 border-slate-200' : 'bg-zinc-800 border-zinc-700';
  }
}

function formatDate(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function formatFullDate(dateString: string) {
  const date = new Date(dateString);
  return date.toLocaleString();
}

// Group activities by date
function groupByDate(activities: ActivityItem[]) {
  const groups: { [key: string]: ActivityItem[] } = {};

  activities.forEach(activity => {
    const date = new Date(activity.created_at);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    let key: string;
    if (date.toDateString() === today.toDateString()) {
      key = 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      key = 'Yesterday';
    } else {
      key = date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    }

    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(activity);
  });

  return groups;
}

export default function ActivityPage() {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<string>('all');
  const { theme } = useTheme();
  const isLight = theme === 'light';

  const fetchActivities = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/activities?limit=200');
      if (response.ok) {
        const data = await response.json();
        setActivities(data.activities || []);
      }
    } catch (error) {
      console.error('Failed to fetch activities:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActivities();
  }, []);

  // Filter activities
  const filteredActivities = activities.filter(activity => {
    const matchesSearch = searchQuery === '' ||
      activity.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      activity.prospects?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      activity.prospects?.company?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesFilter = filter === 'all' || activity.type === filter;

    return matchesSearch && matchesFilter;
  });

  const groupedActivities = groupByDate(filteredActivities);

  // Activity type counts
  const typeCounts = activities.reduce((acc, a) => {
    acc[a.type] = (acc[a.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const filterOptions = [
    { key: 'all', label: 'All', icon: Activity },
    { key: 'email_sent', label: 'Sent', icon: Send },
    { key: 'reply', label: 'Replies', icon: MessageSquare },
    { key: 'meeting_request', label: 'Meetings', icon: Calendar },
    { key: 'stage_change', label: 'Stage Changes', icon: ArrowRight },
    { key: 'system', label: 'System', icon: Bot },
  ];

  return (
    <div className={cn(
      "flex flex-col h-full transition-colors",
      isLight
        ? "bg-gradient-to-br from-[#fef9f3] via-white to-[#f6f2eb]"
        : "bg-background"
    )}>
      <Header
        title="Activity Log"
        subtitle={`${activities.length} events`}
        action={{
          label: 'Refresh',
          onClick: fetchActivities,
        }}
      />

      <MobilePageHeader
        title="Activity"
        subtitle={`${activities.length} events`}
        action={{
          icon: <RefreshCw className="h-4 w-4" />,
          label: 'Refresh',
          onClick: fetchActivities,
        }}
      />

      <div className="flex-1 px-4 pb-4 md:p-6 overflow-auto">
        {/* Filters */}
        <div className="mb-4 md:mb-6 space-y-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search activity..."
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
            {filterOptions.map(({ key, label, icon: Icon }) => (
              <Button
                key={key}
                variant={filter === key ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter(key)}
                className={cn(
                  "h-8 text-xs",
                  filter === key
                    ? isLight ? "bg-sky-500 text-white" : "bg-blue-600 text-white"
                    : isLight ? "border-slate-200" : "border-zinc-700"
                )}
              >
                <Icon className="h-3 w-3 mr-1.5" />
                {label}
                {key !== 'all' && typeCounts[key] && (
                  <span className={cn(
                    "ml-1.5 px-1.5 py-0.5 rounded text-[10px]",
                    filter === key
                      ? "bg-white/20"
                      : isLight ? "bg-slate-100" : "bg-zinc-800"
                  )}>
                    {typeCounts[key]}
                  </span>
                )}
              </Button>
            ))}
          </div>
        </div>

        {/* Activity Timeline */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          </div>
        ) : filteredActivities.length === 0 ? (
          <Card className={cn(
            isLight ? "bg-white border-slate-200" : "bg-zinc-900 border-zinc-800"
          )}>
            <CardContent className="p-8 md:p-12 text-center">
              <Activity className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground mb-2">No activity found</p>
              <p className="text-sm text-muted-foreground/70">
                {searchQuery || filter !== 'all'
                  ? 'Try adjusting your filters'
                  : 'Activity will appear here as you use the system'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedActivities).map(([date, items]) => (
              <div key={date}>
                <h3 className={cn(
                  "text-sm font-medium mb-3 flex items-center gap-2",
                  isLight ? "text-slate-500" : "text-zinc-400"
                )}>
                  <Clock className="h-4 w-4" />
                  {date}
                </h3>
                <div className="space-y-2">
                  {items.map((activity) => (
                    <Card
                      key={activity.id}
                      className={cn(
                        "overflow-hidden transition-all border",
                        getActivityColor(activity.type, isLight),
                        isLight ? "hover:shadow-md" : ""
                      )}
                    >
                      <CardContent className="p-3 md:p-4">
                        <div className="flex items-start gap-3">
                          <div className={cn(
                            "p-2 rounded-lg",
                            isLight ? "bg-white shadow-sm" : "bg-zinc-900"
                          )}>
                            {getActivityIcon(activity.type)}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <p className={cn(
                                "text-sm font-medium",
                                isLight ? "text-slate-900" : "text-white"
                              )}>
                                {activity.title}
                              </p>
                            </div>

                            {activity.description && (
                              <p className="text-xs text-muted-foreground line-clamp-2 mb-1">
                                {activity.description}
                              </p>
                            )}

                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>{formatFullDate(activity.created_at)}</span>
                              {activity.prospects && (
                                <>
                                  <span>·</span>
                                  <span>{activity.prospects.name}</span>
                                </>
                              )}
                            </div>
                          </div>

                          {activity.prospect_id && (
                            <Link href={`/prospects/${activity.prospect_id}`}>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                title="View prospect"
                              >
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                            </Link>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
