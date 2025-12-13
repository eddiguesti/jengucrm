'use client';

import { useState, useEffect, useMemo, memo } from 'react';
import { Header } from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  TrendingUp,
  TrendingDown,
  ArrowRight,
  Loader2,
  Star,
  Search,
  CheckCircle2,
  Zap,
  Clock,
  Inbox,
  Calendar,
  Sparkles,
  MessageSquare,
  Mail,
  Send,
  Reply,
} from 'lucide-react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import type { Prospect } from '@/types';
import { BatteryRing } from '@/components/ui/battery-indicator';
import { calculateReadiness, getReadinessSummary, getTierInfo } from '@/lib/readiness';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';
import { CountUp } from '@/components/animated-number';
import {
  springs,
  stagger,
  staggerContainerVariants,
  listItemVariants,
} from '@/lib/animations';
import { SkeletonStats, SkeletonList } from '@/components/ui/skeleton';

interface Stats {
  total: number;
  byTier: { hot: number; warm: number; cold: number };
  byStage: Record<string, number>;
  automation?: {
    repliesReceived: number;
    outreachSent: number;
  };
  trends?: {
    thisWeek: { sent: number; replies: number; meetings: number };
    lastWeek: { sent: number; replies: number; meetings: number };
    change: { sent: number; replies: number; meetings: number };
  };
}

interface ActivityItem {
  id: string;
  type: string;
  title: string;
  created_at: string;
  prospects?: { name: string };
}

function formatTimeAgo(dateString: string) {
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

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatDate() {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function getActivityIcon(type: string) {
  switch (type) {
    case 'email_sent':
      return <Send className="h-3.5 w-3.5 text-blue-500" />;
    case 'email_opened':
      return <Mail className="h-3.5 w-3.5 text-emerald-500" />;
    case 'reply':
      return <Reply className="h-3.5 w-3.5 text-amber-500" />;
    case 'stage_change':
      return <ArrowRight className="h-3.5 w-3.5 text-purple-500" />;
    case 'meeting':
      return <Calendar className="h-3.5 w-3.5 text-emerald-500" />;
    default:
      return <Mail className="h-3.5 w-3.5 text-zinc-400" />;
  }
}

// Focus item component - action-first design with premium animations
const FocusItem = memo(function FocusItem({
  icon: Icon,
  label,
  count,
  href,
  action,
  color,
  isLight,
  index = 0,
}: {
  icon: React.ElementType;
  label: string;
  count: number;
  href: string;
  action: string;
  color: 'emerald' | 'blue' | 'amber';
  isLight: boolean;
  index?: number;
}) {
  // Skip rendering if count is 0 (parent should handle conditional rendering)
  if (count === 0) return null;

  const colors = {
    emerald: {
      bg: isLight ? 'bg-emerald-50 border-emerald-200' : 'bg-emerald-500/10 border-emerald-500/20',
      icon: 'text-emerald-500',
      button: 'bg-emerald-500 hover:bg-emerald-600 text-white',
      glow: 'shadow-emerald-500/20',
    },
    blue: {
      bg: isLight ? 'bg-blue-50 border-blue-200' : 'bg-blue-500/10 border-blue-500/20',
      icon: 'text-blue-500',
      button: 'bg-blue-500 hover:bg-blue-600 text-white',
      glow: 'shadow-blue-500/20',
    },
    amber: {
      bg: isLight ? 'bg-amber-50 border-amber-200' : 'bg-amber-500/10 border-amber-500/20',
      icon: 'text-amber-500',
      button: 'bg-amber-500 hover:bg-amber-600 text-white',
      glow: 'shadow-amber-500/20',
    },
  };

  const c = colors[color];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.95 }}
      transition={{ ...springs.snappy, delay: index * 0.05 }}
      whileHover={{ scale: 1.01, y: -2 }}
      className={cn(
        'flex items-center justify-between p-4 rounded-xl border transition-shadow',
        c.bg,
        `hover:shadow-lg hover:${c.glow}`
      )}
    >
      <div className="flex items-center gap-3">
        <motion.div
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ delay: 0.1 + index * 0.05, ...springs.bouncy }}
        >
          <Icon className={cn('h-5 w-5', c.icon)} />
        </motion.div>
        <span className={cn('font-medium', isLight ? 'text-slate-900' : 'text-white')}>
          <CountUp end={count} duration={0.8} delay={0.2 + index * 0.05} /> {label}
        </span>
      </div>
      <Link href={href}>
        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
          <Button size="sm" className={cn('h-8', c.button)}>
            {action}
            <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
          </Button>
        </motion.div>
      </Link>
    </motion.div>
  );
});

// Stat card with trend and animated number
const StatCard = memo(function StatCard({
  label,
  value,
  trend,
  isLight,
  index = 0,
}: {
  label: string;
  value: number;
  trend?: number;
  isLight: boolean;
  index?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: index * 0.08, ...springs.snappy }}
      whileHover={{ scale: 1.03, y: -2 }}
      className={cn(
        'p-4 rounded-xl border text-center transition-shadow cursor-default',
        isLight
          ? 'bg-white border-slate-200 hover:shadow-lg hover:shadow-slate-200/50'
          : 'bg-zinc-900 border-zinc-800 hover:shadow-lg hover:shadow-black/30'
      )}
    >
      <p className={cn('text-2xl font-bold tabular-nums', isLight ? 'text-slate-900' : 'text-white')}>
        <CountUp end={value} duration={1.2} delay={0.3 + index * 0.1} />
      </p>
      <p className={cn('text-xs mt-1', isLight ? 'text-slate-500' : 'text-zinc-500')}>
        {label}
      </p>
      {trend !== undefined && trend !== 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.5 + index * 0.1, ...springs.bouncy }}
          className={cn(
            'flex items-center justify-center gap-1 text-xs mt-2 px-2 py-0.5 rounded-full mx-auto w-fit',
            trend > 0
              ? isLight
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-emerald-500/20 text-emerald-400'
              : isLight
                ? 'bg-red-100 text-red-700'
                : 'bg-red-500/20 text-red-400'
          )}
        >
          {trend > 0 ? (
            <TrendingUp className="h-3 w-3" />
          ) : (
            <TrendingDown className="h-3 w-3" />
          )}
          {Math.abs(trend)}%
        </motion.div>
      )}
    </motion.div>
  );
});

// Priority prospect row
const PriorityProspect = memo(function PriorityProspect({
  prospect,
  index,
  isLight,
}: {
  prospect: Prospect;
  index: number;
  isLight: boolean;
}) {
  const readiness = calculateReadiness(prospect);
  const tierInfo = getTierInfo(readiness.tier);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
    >
      <Link
        href={`/prospects/${prospect.id}`}
        className={cn(
          'flex items-center gap-3 p-3 rounded-xl transition-all group border',
          isLight
            ? 'bg-white hover:bg-slate-50 border-slate-200 hover:border-slate-300'
            : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-800 hover:border-zinc-700'
        )}
      >
        <BatteryRing percentage={readiness.total} size={36} strokeWidth={3} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'text-sm font-medium truncate transition-colors',
                isLight ? 'text-slate-900 group-hover:text-blue-600' : 'text-white group-hover:text-amber-400'
              )}
            >
              {prospect.name}
            </span>
            {prospect.tier === 'hot' && (
              <Badge
                className={cn(
                  'text-[10px] px-1.5 py-0',
                  isLight
                    ? 'bg-red-100 text-red-600 border-red-200'
                    : 'bg-red-500/20 text-red-400 border-red-500/30'
                )}
              >
                Hot
              </Badge>
            )}
          </div>
          <div
            className={cn(
              'flex items-center gap-2 text-xs',
              isLight ? 'text-slate-500' : 'text-zinc-500'
            )}
          >
            <span className="truncate">{prospect.city}</span>
            {prospect.google_rating && (
              <>
                <span>·</span>
                <span className="flex items-center gap-0.5">
                  <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                  {prospect.google_rating}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="text-right">
          <span className={cn('text-sm font-medium', tierInfo.color)}>
            {readiness.total}%
          </span>
          <p className={cn('text-[10px]', isLight ? 'text-slate-500' : 'text-zinc-500')}>
            Ready
          </p>
        </div>

        <Button
          size="sm"
          className={cn(
            'h-8 opacity-0 group-hover:opacity-100 transition-opacity',
            readiness.tier === 'email_ready'
              ? 'bg-emerald-500 hover:bg-emerald-600'
              : 'bg-amber-500 hover:bg-amber-600',
            'text-white'
          )}
          onClick={(e) => {
            e.preventDefault();
            window.location.href = `/prospects/${prospect.id}?action=${readiness.nextAction.action}`;
          }}
        >
          {readiness.tier === 'email_ready' ? (
            <Sparkles className="h-3.5 w-3.5 mr-1" />
          ) : (
            <Search className="h-3.5 w-3.5 mr-1" />
          )}
          {readiness.nextAction.label}
        </Button>
      </Link>
    </motion.div>
  );
});

// Activity timeline item
const ActivityTimelineItem = memo(function ActivityTimelineItem({
  activity,
  index,
  isLight,
}: {
  activity: ActivityItem;
  index: number;
  isLight: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.03 }}
      className="flex items-start gap-3"
    >
      <div className="relative">
        <div
          className={cn(
            'w-8 h-8 rounded-full flex items-center justify-center',
            isLight ? 'bg-slate-100' : 'bg-zinc-800'
          )}
        >
          {getActivityIcon(activity.type)}
        </div>
        {index < 5 && (
          <div
            className={cn(
              'absolute left-1/2 top-8 w-px h-6 -translate-x-1/2',
              isLight ? 'bg-slate-200' : 'bg-zinc-700'
            )}
          />
        )}
      </div>
      <div className="flex-1 min-w-0 pt-1">
        <p className={cn('text-sm', isLight ? 'text-slate-900' : 'text-white')}>
          {activity.title}
        </p>
        {activity.prospects?.name && (
          <p className={cn('text-xs font-medium', isLight ? 'text-slate-600' : 'text-zinc-400')}>
            {activity.prospects.name}
          </p>
        )}
        <p className={cn('text-xs mt-0.5', isLight ? 'text-slate-400' : 'text-zinc-500')}>
          {formatTimeAgo(activity.created_at)}
        </p>
      </div>
    </motion.div>
  );
});

export default function CommandCenterPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { theme } = useTheme();
  const isLight = theme === 'light';

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, prospectsRes, activityRes] = await Promise.all([
        fetch('/api/stats'),
        fetch('/api/prospects?limit=50'),
        fetch('/api/activities'),
      ]);

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData.data || statsData);
      }

      if (prospectsRes.ok) {
        const prospectsData = await prospectsRes.json();
        setProspects(prospectsData.prospects || []);
      }

      if (activityRes.ok) {
        const activityData = await activityRes.json();
        setRecentActivity(activityData.activities || []);
      }

      if (!statsRes.ok && !prospectsRes.ok && !activityRes.ok) {
        setError('Failed to load dashboard data');
      }
    } catch (err) {
      console.error('Failed to fetch dashboard data:', err);
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const readinessSummary = useMemo(() => {
    return getReadinessSummary(prospects);
  }, [prospects]);

  const priorityProspects = useMemo(() => {
    return [...prospects]
      .map((p) => ({ ...p, readiness: calculateReadiness(p) }))
      .filter((p) => p.readiness.tier === 'email_ready' || p.tier === 'hot')
      .sort((a, b) => {
        if (a.readiness.tier === 'email_ready' && b.readiness.tier !== 'email_ready') return -1;
        if (b.readiness.tier === 'email_ready' && a.readiness.tier !== 'email_ready') return 1;
        return (b.score || 0) - (a.score || 0);
      })
      .slice(0, 5);
  }, [prospects]);

  // Count replies needing response (simplified - use actual data when available)
  const repliesNeedingResponse = stats?.automation?.repliesReceived || 0;

  return (
    <div
      className={cn(
        'flex flex-col h-full',
        isLight
          ? 'bg-gradient-to-br from-[#fef9f3] via-white to-[#f6f2eb]'
          : 'bg-background'
      )}
    >
      <Header title="Command Center" subtitle={formatDate()} />

      <div className="flex-1 px-4 pb-4 md:p-6 space-y-6 overflow-auto">
        {/* Error State */}
        {error && (
          <Card className={cn(isLight ? 'bg-red-50 border-red-200' : 'bg-red-500/10 border-red-500/30')}>
            <CardContent className="p-4 flex items-center justify-between">
              <p className={cn('text-sm', isLight ? 'text-red-600' : 'text-red-400')}>{error}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchData}
                className={cn(isLight ? 'border-red-200 text-red-600' : 'border-red-500/30 text-red-400')}
              >
                Retry
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Greeting Banner */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            'rounded-2xl p-6 border',
            isLight
              ? 'bg-gradient-to-br from-white via-slate-50 to-white border-slate-200'
              : 'bg-gradient-to-br from-zinc-900 to-zinc-800 border-zinc-700'
          )}
        >
          <h1 className={cn('text-2xl font-bold', isLight ? 'text-slate-900' : 'text-white')}>
            {getGreeting()}, Edd
          </h1>
          <p className={cn('text-sm mt-1', isLight ? 'text-slate-500' : 'text-zinc-400')}>
            {prospects.length} prospects in your pipeline
          </p>
        </motion.div>

        {/* Today's Focus */}
        <Card
          className={cn(
            'border',
            isLight
              ? 'bg-white border-slate-200'
              : 'bg-zinc-900 border-zinc-800'
          )}
        >
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-amber-500" />
              Today&apos;s Focus
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
              </div>
            ) : (
              <AnimatePresence mode="popLayout">
                {readinessSummary.emailReady > 0 && (
                  <FocusItem
                    key="email-ready"
                    icon={CheckCircle2}
                    label="prospects ready to email"
                    count={readinessSummary.emailReady}
                    href="/prospects?readiness=email_ready"
                    action="Send Now"
                    color="emerald"
                    isLight={isLight}
                    index={0}
                  />
                )}
                {repliesNeedingResponse > 0 && (
                  <FocusItem
                    key="replies-needed"
                    icon={MessageSquare}
                    label="replies need response"
                    count={repliesNeedingResponse}
                    href="/outreach/inbox"
                    action="View"
                    color="amber"
                    isLight={isLight}
                    index={1}
                  />
                )}
                {readinessSummary.almostReady > 0 && (
                  <FocusItem
                    key="almost-ready"
                    icon={Zap}
                    label="prospects almost ready"
                    count={readinessSummary.almostReady}
                    href="/prospects?readiness=almost_ready"
                    action="Enrich"
                    color="blue"
                    isLight={isLight}
                    index={2}
                  />
                )}
                {readinessSummary.emailReady === 0 &&
                  repliesNeedingResponse === 0 &&
                  readinessSummary.almostReady === 0 && (
                    <div
                      className={cn(
                        'text-center py-8 rounded-xl border',
                        isLight ? 'bg-slate-50 border-slate-200' : 'bg-zinc-800 border-zinc-700'
                      )}
                    >
                      <p className={cn('text-sm mb-3', isLight ? 'text-slate-500' : 'text-zinc-400')}>
                        No action items for today
                      </p>
                      <Link href="/find-new">
                        <Button size="sm" className="bg-blue-500 hover:bg-blue-600 text-white">
                          <Search className="h-4 w-4 mr-2" />
                          Find new prospects
                        </Button>
                      </Link>
                    </div>
                  )}
              </AnimatePresence>
            )}
          </CardContent>
        </Card>

        {/* This Week Stats */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className={cn('text-sm font-semibold', isLight ? 'text-slate-900' : 'text-white')}>
              This Week
            </h2>
            <span className={cn('text-xs', isLight ? 'text-slate-500' : 'text-zinc-500')}>
              vs last week
            </span>
          </div>
          {loading ? (
            <SkeletonStats count={4} />
          ) : (
            <div className="grid grid-cols-4 gap-3">
              <StatCard
                label="Sent"
                value={stats?.trends?.thisWeek.sent || 0}
                trend={stats?.trends?.change.sent}
                isLight={isLight}
                index={0}
              />
              <StatCard
                label="Opens"
                value={stats?.trends?.thisWeek.replies || 0}
                trend={stats?.trends?.change.replies}
                isLight={isLight}
                index={1}
              />
              <StatCard
                label="Replies"
                value={stats?.automation?.repliesReceived || 0}
                isLight={isLight}
                index={2}
              />
              <StatCard
                label="Meetings"
                value={stats?.trends?.thisWeek.meetings || 0}
                trend={stats?.trends?.change.meetings}
                isLight={isLight}
                index={3}
              />
            </div>
          )}
        </motion.div>

        {/* Two Column Layout */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Priority Prospects */}
          <Card
            className={cn(
              'border',
              isLight ? 'bg-white border-slate-200' : 'bg-zinc-900 border-zinc-800'
            )}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="h-4 w-4 text-blue-500" />
                Priority Prospects
              </CardTitle>
              <Link href="/prospects">
                <Button variant="ghost" size="sm" className="h-7 text-xs">
                  View all
                  <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                </div>
              ) : priorityProspects.length > 0 ? (
                <div className="space-y-2">
                  {priorityProspects.map((prospect, index) => (
                    <PriorityProspect key={prospect.id} prospect={prospect} index={index} isLight={isLight} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className={cn('text-sm mb-3', isLight ? 'text-slate-500' : 'text-zinc-400')}>
                    No priority prospects yet
                  </p>
                  <Link href="/find-new">
                    <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-white">
                      <Search className="h-4 w-4 mr-2" />
                      Find Prospects
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card
            className={cn(
              'border',
              isLight ? 'bg-white border-slate-200' : 'bg-zinc-900 border-zinc-800'
            )}
          >
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Inbox className="h-4 w-4 text-emerald-500" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
                </div>
              ) : recentActivity.length > 0 ? (
                <div className="space-y-4">
                  {recentActivity.slice(0, 6).map((activity, index) => (
                    <ActivityTimelineItem
                      key={activity.id}
                      activity={activity}
                      index={index}
                      isLight={isLight}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className={cn('text-sm', isLight ? 'text-slate-500' : 'text-zinc-400')}>
                    No recent activity
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
