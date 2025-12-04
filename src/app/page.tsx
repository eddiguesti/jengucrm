'use client';

import { useState, useEffect, useMemo, memo } from 'react';
import { Header } from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Users,
  Flame,
  Mail,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  Loader2,
  Star,
  Search,
  Kanban,
  CheckCircle2,
  Zap,
  Clock,
  Play,
  Inbox,
  Calendar,
  Activity,
  Sparkles,
  MessageSquare,
  Target,
  Bot,
  Send,
  Reply,
  Trophy,
  Timer,
  AlertCircle,
  UserCheck,
  BarChart3,
} from 'lucide-react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import type { Prospect } from '@/types';
import { BatteryRing } from '@/components/ui/battery-indicator';
import { calculateReadiness, getReadinessSummary, getTierInfo } from '@/lib/readiness';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';

interface Stats {
  total: number;
  byTier: { hot: number; warm: number; cold: number };
  byStage: Record<string, number>;
  painLeads?: number;
  painSignals?: number;
  emails?: {
    sent: number;
    opened: number;
    replied: number;
  };
  automation?: {
    mysteryShopperQueue: number;
    mysteryShopperSent: number;
    outreachSent: number;
    repliesReceived: number;
    bouncedEmails: number;
  };
  queueByTier?: { hot: number; warm: number; cold: number };
  enrichment?: {
    withEmail: number;
    withGenericEmail: number;
    withPersonalEmail: number;
    withContactName: number;
    successRate: number;
  };
  trends?: {
    thisWeek: { sent: number; replies: number; meetings: number };
    lastWeek: { sent: number; replies: number; meetings: number };
    change: { sent: number; replies: number; meetings: number };
  };
  responseTime?: {
    avgMinutes: number;
    fastest: number;
    slowest: number;
    totalReplies: number;
  };
  lastCronRun?: {
    at: string;
    title: string;
    success: boolean;
  } | null;
  funnel?: {
    total: number;
    contacted: number;
    engaged: number;
    meeting: number;
    won: number;
    lost: number;
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

function getActivityIcon(type: string) {
  switch (type) {
    case 'email_sent':
      return <Mail className="h-3 w-3 text-blue-400" />;
    case 'email_opened':
      return <CheckCircle2 className="h-3 w-3 text-emerald-400" />;
    case 'reply':
      return <MessageSquare className="h-3 w-3 text-amber-400" />;
    case 'stage_change':
      return <ArrowRight className="h-3 w-3 text-purple-400" />;
    case 'meeting':
      return <Calendar className="h-3 w-3 text-emerald-400" />;
    default:
      return <Activity className="h-3 w-3 text-zinc-400" />;
  }
}

// Queue item component - memoized for performance
const QueueItem = memo(function QueueItem({
  icon: Icon,
  label,
  count,
  color,
  bgColor,
  href,
  action,
  isLight,
}: {
  icon: React.ElementType;
  label: string;
  count: number;
  color: string;
  bgColor: string;
  href: string;
  action: string;
  isLight: boolean;
}) {
  if (count === 0) return null;

  const surface = isLight
    ? 'bg-white/90 border-slate-200 text-slate-900'
    : `${bgColor} text-white`;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      whileHover={{ y: -2, scale: 1.01 }}
      transition={{ duration: 0.18, ease: [0.25, 0.1, 0.25, 1] }}
      className={cn(
        "flex items-center justify-between p-2 md:p-3 rounded-lg border shadow-[var(--shadow-soft)] backdrop-blur",
        surface
      )}
    >
      <div className="flex items-center gap-2 md:gap-3">
        <Icon className={cn("h-4 w-4 md:h-5 md:w-5", color)} />
        <div>
          <p className={cn("text-xs md:text-sm font-medium", isLight ? "text-slate-900" : "text-white")}>
            {count} prospect{count !== 1 ? 's' : ''} {label}
          </p>
        </div>
      </div>
      <Link href={href}>
        <Button
          size="sm"
          variant="ghost"
          className={cn(
            "h-6 md:h-7 text-[10px] md:text-xs px-2",
            color,
            isLight ? "text-slate-700 hover:bg-slate-100" : "text-white"
          )}
        >
          <span className="hidden sm:inline">{action}</span>
          <span className="sm:hidden">Go</span>
          <ArrowRight className="h-2.5 w-2.5 md:h-3 md:w-3 ml-1" />
        </Button>
      </Link>
    </motion.div>
  );
});

// Pipeline bar component - memoized for performance
const PipelineBar = memo(function PipelineBar({
  stage,
  count,
  total,
  color,
  isLight,
}: {
  stage: string;
  count: number;
  total: number;
  color: string;
  isLight: boolean;
}) {
  const percentage = total > 0 ? (count / total) * 100 : 0;

  return (
    <div className="flex items-center gap-2 md:gap-3">
      <span className={cn("text-[10px] md:text-xs w-16 md:w-20 capitalize truncate", isLight ? "text-slate-500" : "text-zinc-400")}>
        {stage}
      </span>
      <div
        className={cn(
          "flex-1 h-1.5 md:h-2 rounded-full overflow-hidden",
          isLight ? "bg-slate-200" : "bg-zinc-800"
        )}
      >
        <motion.div
          className={`h-full ${color} rounded-full`}
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
        />
      </div>
      <span className={cn("text-[10px] md:text-xs font-medium w-6 md:w-8 text-right", isLight ? "text-slate-700" : "text-zinc-300")}>
        {count}
      </span>
    </div>
  );
});

// Priority prospect row - memoized for performance
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
          "flex items-center gap-2 md:gap-3 p-2 md:p-3 rounded-lg transition-all group border",
          isLight
            ? "bg-white hover:bg-slate-50 border-slate-200 hover:border-slate-300 shadow-[var(--shadow-soft)]"
            : "bg-zinc-800/30 hover:bg-zinc-800/50 border-zinc-800 hover:border-zinc-700"
        )}
      >
        <BatteryRing percentage={readiness.total} size={32} strokeWidth={3} className="hidden sm:block" />
        <BatteryRing percentage={readiness.total} size={28} strokeWidth={2} className="sm:hidden" />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 md:gap-2">
            <span
              className={cn(
                "text-xs md:text-sm font-medium truncate transition-colors",
                isLight ? "text-slate-900 group-hover:text-sky-600" : "text-white group-hover:text-amber-400"
              )}
            >
              {prospect.name}
            </span>
            {prospect.tier === 'hot' && (
              <Badge
                className={cn(
                  "text-[9px] md:text-[10px] px-1 md:px-1.5 py-0",
                  isLight
                    ? "bg-red-50 text-red-500 border-red-100"
                    : "bg-red-500/20 text-red-400 border-red-500/30"
                )}
              >
                Hot
              </Badge>
            )}
          </div>
          <div
            className={cn(
              "flex items-center gap-1.5 md:gap-2 text-[10px] md:text-xs",
              isLight ? "text-slate-500" : "text-zinc-500"
            )}
          >
            <span className="truncate">{prospect.city}</span>
            {prospect.google_rating && (
              <>
                <span>·</span>
                <span className="flex items-center gap-0.5">
                  <Star className="h-2 w-2 md:h-2.5 md:w-2.5 fill-amber-400 text-amber-400" />
                  {prospect.google_rating}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="text-right hidden sm:block">
          <span className={cn("text-xs font-medium", isLight ? "text-slate-800" : tierInfo.color)}>
            {readiness.total}%
          </span>
          <p className={cn("text-[10px]", isLight ? "text-slate-500" : "text-zinc-500")}>{tierInfo.label}</p>
        </div>

        <Button
          size="sm"
          className={`
            h-6 md:h-7 text-[10px] md:text-xs px-2 opacity-0 group-hover:opacity-100 sm:transition-opacity
            ${readiness.tier === 'email_ready'
              ? 'bg-emerald-600 hover:bg-emerald-500'
              : 'bg-amber-600 hover:bg-amber-500'
            }
            sm:opacity-0 opacity-100
          `}
          onClick={(e) => {
            e.preventDefault();
            window.location.href = `/prospects/${prospect.id}?action=${readiness.nextAction.action}`;
          }}
        >
          {readiness.tier === 'email_ready' ? (
            <Sparkles className="h-2.5 w-2.5 md:h-3 md:w-3 sm:mr-1" />
          ) : (
            <Search className="h-2.5 w-2.5 md:h-3 md:w-3 sm:mr-1" />
          )}
          <span className="hidden sm:inline">{readiness.nextAction.label}</span>
        </Button>
      </Link>
    </motion.div>
  );
});

export default function DashboardPage() {
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
        setStats(statsData);
      }

      if (prospectsRes.ok) {
        const prospectsData = await prospectsRes.json();
        setProspects(prospectsData.prospects || []);
      }

      if (activityRes.ok) {
        const activityData = await activityRes.json();
        setRecentActivity(activityData.activities || []);
      }

      // Check if all requests failed
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

  // Calculate readiness summary
  const readinessSummary = useMemo(() => {
    return getReadinessSummary(prospects);
  }, [prospects]);

  // Get priority prospects (email ready first, then hot leads)
  const priorityProspects = useMemo(() => {
    return [...prospects]
      .map((p) => ({ ...p, readiness: calculateReadiness(p) }))
      .filter((p) => p.readiness.tier === 'email_ready' || p.tier === 'hot')
      .sort((a, b) => {
        // Email ready first
        if (a.readiness.tier === 'email_ready' && b.readiness.tier !== 'email_ready') return -1;
        if (b.readiness.tier === 'email_ready' && a.readiness.tier !== 'email_ready') return 1;
        // Then by score
        return (b.score || 0) - (a.score || 0);
      })
      .slice(0, 5);
  }, [prospects]);

  return (
    <div
      className={cn(
        "flex flex-col h-full transition-colors",
        isLight
          ? "bg-gradient-to-br from-[#fef9f3] via-white to-[#f6f2eb]"
          : "bg-background"
      )}
    >
      <Header
        title="Command Center"
        subtitle={`${prospects.length} prospects in pipeline`}
      />

      <div className="flex-1 p-4 md:p-6 space-y-4 md:space-y-6 overflow-auto">
        {/* Error State */}
        {error && (
          <Card className={cn(isLight ? "bg-red-50 border-red-200" : "bg-red-500/10 border-red-500/30")}>
            <CardContent className="p-4 flex items-center justify-between">
              <p className={cn("text-sm", isLight ? "text-red-600" : "text-red-400")}>{error}</p>
              <Button
                variant="outline"
                size="sm"
                className={cn("ml-4", isLight ? "border-red-200 text-red-600 hover:bg-red-50" : "border-red-500/30 text-red-400")}
                onClick={fetchData}
              >
                Retry
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Your Queue - Action Items */}
        <Card
          className={cn(
            "relative overflow-hidden border",
            isLight
              ? "bg-gradient-to-br from-white via-[#f9f5ee] to-white border-[#efe7dc] shadow-[var(--shadow-strong)]"
              : "bg-gradient-to-br from-zinc-900 to-zinc-900/50 border-white/10"
          )}
        >
          <CardHeader className="pb-2 md:pb-3">
            <CardTitle className="flex items-center gap-2 text-sm md:text-base">
              <Target className="h-3 w-3 md:h-4 md:w-4 text-amber-400" />
              Your Queue
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
              </div>
            ) : (
              <AnimatePresence>
                <QueueItem
                  key="queue-email-ready"
                  icon={CheckCircle2}
                  label="ready to email"
                  count={readinessSummary.emailReady}
                  color="text-emerald-400"
                  bgColor="bg-emerald-500/10 border-emerald-500/20"
                  href="/prospects?readiness=email_ready"
                  action="Send Emails"
                  isLight={isLight}
                />
                <QueueItem
                  key="queue-almost-ready"
                  icon={Zap}
                  label="almost ready"
                  count={readinessSummary.almostReady}
                  color="text-blue-400"
                  bgColor="bg-blue-500/10 border-blue-500/20"
                  href="/prospects?readiness=almost_ready"
                  action="Quick Enrich"
                  isLight={isLight}
                />
                <QueueItem
                  key="queue-needs-enrichment"
                  icon={Clock}
                  label="need enrichment"
                  count={readinessSummary.needsEnrichment}
                  color="text-amber-400"
                  bgColor="bg-amber-500/10 border-amber-500/20"
                  href="/prospects?readiness=needs_enrichment"
                  action="Enrich All"
                  isLight={isLight}
                />
                {readinessSummary.emailReady === 0 &&
                  readinessSummary.almostReady === 0 &&
                  readinessSummary.needsEnrichment === 0 && (
                    <div className="text-center py-4 text-zinc-500 text-xs md:text-sm">
                      No action items. <Link href="/lead-sources" className="text-blue-400 hover:underline">Run scraper</Link> to find prospects.
                    </div>
                  )}
              </AnimatePresence>
            )}
          </CardContent>
        </Card>

        {/* Automation Status */}
        <Card
          className={cn(
            "relative overflow-hidden border",
            isLight
              ? "bg-gradient-to-br from-white via-[#f5f0e6] to-white border-[#efe7dc] shadow-[var(--shadow-strong)]"
              : "bg-gradient-to-br from-zinc-900 to-zinc-900/50 border-white/10"
          )}
        >
          <CardHeader className="pb-2 md:pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-sm md:text-base">
                <Bot className="h-3 w-3 md:h-4 md:w-4 text-cyan-400" />
                Automation Status
              </CardTitle>
              {stats?.lastCronRun && (
                <div className={cn("flex items-center gap-1.5 text-[9px] md:text-[10px]", isLight ? "text-slate-500" : "text-zinc-500")}>
                  <div className={cn("w-1.5 h-1.5 rounded-full", stats.lastCronRun.success ? "bg-emerald-400" : "bg-red-400")} />
                  Last run: {formatTimeAgo(stats.lastCronRun.at)}
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
              </div>
            ) : (
              <>
                {/* Main Stats Row */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
                  <div
                    className={cn(
                      "p-2 md:p-3 rounded-lg border",
                      isLight ? "bg-white border-slate-200" : "bg-white/[0.03] border-white/[0.08]"
                    )}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <Clock className="h-3 w-3 text-amber-400" />
                      <span className={cn("text-[10px] md:text-xs", isLight ? "text-slate-500" : "text-zinc-400")}>
                        Shopper Queue
                      </span>
                    </div>
                    <p className={cn("text-lg md:text-xl font-bold", isLight ? "text-amber-600" : "text-amber-400")}>
                      {stats?.automation?.mysteryShopperQueue || 0}
                    </p>
                    {stats?.queueByTier && (stats.queueByTier.hot > 0 || stats.queueByTier.warm > 0) && (
                      <p className={cn("text-[9px] md:text-[10px]", isLight ? "text-slate-400" : "text-zinc-500")}>
                        {stats.queueByTier.hot > 0 && <span className="text-red-400">{stats.queueByTier.hot} hot</span>}
                        {stats.queueByTier.hot > 0 && stats.queueByTier.warm > 0 && " · "}
                        {stats.queueByTier.warm > 0 && <span className="text-amber-400">{stats.queueByTier.warm} warm</span>}
                      </p>
                    )}
                  </div>
                  <div
                    className={cn(
                      "p-2 md:p-3 rounded-lg border",
                      isLight ? "bg-white border-slate-200" : "bg-white/[0.03] border-white/[0.08]"
                    )}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <Mail className="h-3 w-3 text-purple-400" />
                      <span className={cn("text-[10px] md:text-xs", isLight ? "text-slate-500" : "text-zinc-400")}>
                        Shopper Sent
                      </span>
                    </div>
                    <p className={cn("text-lg md:text-xl font-bold", isLight ? "text-purple-600" : "text-purple-400")}>
                      {stats?.automation?.mysteryShopperSent || 0}
                    </p>
                    <p className={cn("text-[9px] md:text-[10px]", isLight ? "text-slate-400" : "text-zinc-500")}>
                      inquiries sent
                    </p>
                  </div>
                  <div
                    className={cn(
                      "p-2 md:p-3 rounded-lg border",
                      isLight ? "bg-white border-slate-200" : "bg-white/[0.03] border-white/[0.08]"
                    )}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <Send className="h-3 w-3 text-blue-400" />
                      <span className={cn("text-[10px] md:text-xs", isLight ? "text-slate-500" : "text-zinc-400")}>
                        Outreach Sent
                      </span>
                    </div>
                    <p className={cn("text-lg md:text-xl font-bold", isLight ? "text-blue-600" : "text-blue-400")}>
                      {stats?.automation?.outreachSent || 0}
                    </p>
                    <p className={cn("text-[9px] md:text-[10px]", isLight ? "text-slate-400" : "text-zinc-500")}>
                      sales emails
                    </p>
                  </div>
                  <div
                    className={cn(
                      "p-2 md:p-3 rounded-lg border",
                      isLight ? "bg-white border-slate-200" : "bg-white/[0.03] border-white/[0.08]"
                    )}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <Reply className="h-3 w-3 text-emerald-400" />
                      <span className={cn("text-[10px] md:text-xs", isLight ? "text-slate-500" : "text-zinc-400")}>
                        Replies
                      </span>
                    </div>
                    <p className={cn("text-lg md:text-xl font-bold", isLight ? "text-emerald-600" : "text-emerald-400")}>
                      {stats?.automation?.repliesReceived || 0}
                    </p>
                    <p className={cn("text-[9px] md:text-[10px]", isLight ? "text-slate-400" : "text-zinc-500")}>
                      received
                    </p>
                  </div>
                </div>

                {/* Weekly Trends & Funnel Row */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-3">
                  {/* Weekly Trends */}
                  <div
                    className={cn(
                      "p-2 md:p-3 rounded-lg border",
                      isLight ? "bg-white border-slate-200" : "bg-white/[0.03] border-white/[0.08]"
                    )}
                  >
                    <div className="flex items-center gap-1.5 mb-2">
                      <BarChart3 className="h-3 w-3 text-cyan-400" />
                      <span className={cn("text-[10px] md:text-xs font-medium", isLight ? "text-slate-700" : "text-zinc-300")}>
                        This Week
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-center">
                        <p className={cn("text-sm md:text-base font-bold", isLight ? "text-slate-800" : "text-white")}>
                          {stats?.trends?.thisWeek.sent || 0}
                        </p>
                        <p className={cn("text-[9px]", isLight ? "text-slate-400" : "text-zinc-500")}>sent</p>
                      </div>
                      <div className="text-center">
                        <p className={cn("text-sm md:text-base font-bold", isLight ? "text-slate-800" : "text-white")}>
                          {stats?.trends?.thisWeek.replies || 0}
                        </p>
                        <p className={cn("text-[9px]", isLight ? "text-slate-400" : "text-zinc-500")}>replies</p>
                      </div>
                      <div className="text-center">
                        <p className={cn("text-sm md:text-base font-bold", isLight ? "text-slate-800" : "text-white")}>
                          {stats?.trends?.thisWeek.meetings || 0}
                        </p>
                        <p className={cn("text-[9px]", isLight ? "text-slate-400" : "text-zinc-500")}>meetings</p>
                      </div>
                      {(stats?.trends?.change.sent !== 0) && (
                        <div className={cn(
                          "flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded",
                          (stats?.trends?.change.sent || 0) > 0
                            ? (isLight ? "bg-emerald-50 text-emerald-600" : "bg-emerald-500/20 text-emerald-400")
                            : (isLight ? "bg-red-50 text-red-600" : "bg-red-500/20 text-red-400")
                        )}>
                          {(stats?.trends?.change.sent || 0) > 0 ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
                          {Math.abs(stats?.trends?.change.sent || 0)}%
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Conversion Funnel */}
                  <div
                    className={cn(
                      "p-2 md:p-3 rounded-lg border",
                      isLight ? "bg-white border-slate-200" : "bg-white/[0.03] border-white/[0.08]"
                    )}
                  >
                    <div className="flex items-center gap-1.5 mb-2">
                      <Trophy className="h-3 w-3 text-amber-400" />
                      <span className={cn("text-[10px] md:text-xs font-medium", isLight ? "text-slate-700" : "text-zinc-300")}>
                        Conversion Funnel
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-1">
                      <div className="text-center flex-1">
                        <p className={cn("text-xs md:text-sm font-bold", isLight ? "text-blue-600" : "text-blue-400")}>
                          {stats?.funnel?.contacted || 0}
                        </p>
                        <p className={cn("text-[8px] md:text-[9px]", isLight ? "text-slate-400" : "text-zinc-500")}>contacted</p>
                      </div>
                      <ArrowRight className={cn("h-2.5 w-2.5", isLight ? "text-slate-300" : "text-zinc-600")} />
                      <div className="text-center flex-1">
                        <p className={cn("text-xs md:text-sm font-bold", isLight ? "text-purple-600" : "text-purple-400")}>
                          {stats?.funnel?.engaged || 0}
                        </p>
                        <p className={cn("text-[8px] md:text-[9px]", isLight ? "text-slate-400" : "text-zinc-500")}>engaged</p>
                      </div>
                      <ArrowRight className={cn("h-2.5 w-2.5", isLight ? "text-slate-300" : "text-zinc-600")} />
                      <div className="text-center flex-1">
                        <p className={cn("text-xs md:text-sm font-bold", isLight ? "text-amber-600" : "text-amber-400")}>
                          {stats?.funnel?.meeting || 0}
                        </p>
                        <p className={cn("text-[8px] md:text-[9px]", isLight ? "text-slate-400" : "text-zinc-500")}>meeting</p>
                      </div>
                      <ArrowRight className={cn("h-2.5 w-2.5", isLight ? "text-slate-300" : "text-zinc-600")} />
                      <div className="text-center flex-1">
                        <p className={cn("text-xs md:text-sm font-bold", isLight ? "text-emerald-600" : "text-emerald-400")}>
                          {stats?.funnel?.won || 0}
                        </p>
                        <p className={cn("text-[8px] md:text-[9px]", isLight ? "text-slate-400" : "text-zinc-500")}>won</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Enrichment & Response Time Row */}
                <div className="grid grid-cols-2 gap-2 md:gap-3">
                  {/* Enrichment Success */}
                  <div
                    className={cn(
                      "p-2 md:p-3 rounded-lg border",
                      isLight ? "bg-white border-slate-200" : "bg-white/[0.03] border-white/[0.08]"
                    )}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <UserCheck className="h-3 w-3 text-cyan-400" />
                      <span className={cn("text-[10px] md:text-xs", isLight ? "text-slate-500" : "text-zinc-400")}>
                        Email Quality
                      </span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <p className={cn("text-lg md:text-xl font-bold", isLight ? "text-cyan-600" : "text-cyan-400")}>
                        {stats?.enrichment?.successRate || 0}%
                      </p>
                      <span className={cn("text-[9px]", isLight ? "text-slate-400" : "text-zinc-500")}>personal</span>
                    </div>
                    <p className={cn("text-[9px] md:text-[10px]", isLight ? "text-slate-400" : "text-zinc-500")}>
                      {stats?.enrichment?.withPersonalEmail || 0} GM · {stats?.enrichment?.withGenericEmail || 0} generic
                    </p>
                  </div>

                  {/* Response Time */}
                  <div
                    className={cn(
                      "p-2 md:p-3 rounded-lg border",
                      isLight ? "bg-white border-slate-200" : "bg-white/[0.03] border-white/[0.08]"
                    )}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <Timer className="h-3 w-3 text-orange-400" />
                      <span className={cn("text-[10px] md:text-xs", isLight ? "text-slate-500" : "text-zinc-400")}>
                        Avg Response
                      </span>
                    </div>
                    {(stats?.responseTime?.totalReplies || 0) > 0 ? (
                      <>
                        <p className={cn("text-lg md:text-xl font-bold", isLight ? "text-orange-600" : "text-orange-400")}>
                          {stats?.responseTime?.avgMinutes || 0}m
                        </p>
                        <p className={cn("text-[9px] md:text-[10px]", isLight ? "text-slate-400" : "text-zinc-500")}>
                          from {stats?.responseTime?.totalReplies} replies
                        </p>
                      </>
                    ) : (
                      <>
                        <p className={cn("text-lg md:text-xl font-bold", isLight ? "text-slate-400" : "text-zinc-600")}>
                          --
                        </p>
                        <p className={cn("text-[9px] md:text-[10px]", isLight ? "text-slate-400" : "text-zinc-500")}>
                          no replies yet
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Two Column Layout */}
        <div className="grid gap-4 md:gap-6 lg:grid-cols-2">
          {/* Pipeline Health */}
        <Card
          className={cn(
            isLight ? "bg-gradient-to-br from-white via-[#f8f3ea] to-white border-[#efe7dc]" : ""
          )}
        >
            <CardHeader className="flex flex-row items-center justify-between pb-2 md:pb-3">
              <CardTitle className="flex items-center gap-2 text-sm md:text-base">
                <Kanban className="h-3 w-3 md:h-4 md:w-4 text-purple-400" />
                Pipeline Health
              </CardTitle>
              <Link href="/pipeline">
                <Button variant="ghost" size="sm" className="h-6 md:h-7 text-[10px] md:text-xs px-2">
                  View <ArrowRight className="h-2.5 w-2.5 md:h-3 md:w-3 ml-1" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="space-y-2 md:space-y-3">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
                </div>
              ) : (
                <>
                  <PipelineBar stage="new" count={stats?.byStage?.new || 0} total={prospects.length} color="bg-blue-500" isLight={isLight} />
                  <PipelineBar stage="researching" count={stats?.byStage?.researching || 0} total={prospects.length} color="bg-purple-500" isLight={isLight} />
                  <PipelineBar stage="outreach" count={stats?.byStage?.outreach || 0} total={prospects.length} color="bg-cyan-500" isLight={isLight} />
                  <PipelineBar stage="engaged" count={stats?.byStage?.engaged || 0} total={prospects.length} color="bg-emerald-500" isLight={isLight} />
                  <PipelineBar stage="meeting" count={stats?.byStage?.meeting || 0} total={prospects.length} color="bg-amber-500" isLight={isLight} />
                  <PipelineBar stage="won" count={stats?.byStage?.won || 0} total={prospects.length} color="bg-green-500" isLight={isLight} />
                </>
              )}
            </CardContent>
          </Card>

          {/* Stats Grid */}
          <Card
            className={cn(
              isLight ? "bg-gradient-to-br from-white via-[#f7f2e8] to-white border-[#efe7dc]" : ""
            )}
          >
            <CardHeader className="pb-2 md:pb-3">
              <CardTitle className="flex items-center gap-2 text-sm md:text-base">
                <TrendingUp className="h-3 w-3 md:h-4 md:w-4 text-emerald-400" />
                Key Metrics
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2 md:gap-3">
                <div
                  className={cn(
                    "p-2 md:p-3 rounded-lg border",
                    isLight ? "bg-white border-slate-200" : "bg-white/[0.03] border-white/[0.08]"
                  )}
                >
                  <div className="flex items-center gap-1.5 md:gap-2 mb-1">
                    <Users className="h-3 w-3 md:h-4 md:w-4 text-blue-400" />
                    <span className={cn("text-[10px] md:text-xs", isLight ? "text-slate-500" : "text-zinc-400")}>
                      Total
                    </span>
                  </div>
                  <p className={cn("text-xl md:text-2xl font-bold", isLight ? "text-slate-900" : "text-white")}>
                    {loading ? '-' : stats?.total || 0}
                  </p>
                </div>
                <div
                  className={cn(
                    "p-2 md:p-3 rounded-lg border",
                    isLight ? "bg-white border-slate-200" : "bg-white/[0.03] border-white/[0.08]"
                  )}
                >
                  <div className="flex items-center gap-1.5 md:gap-2 mb-1">
                    <Flame className="h-3 w-3 md:h-4 md:w-4 text-red-400" />
                    <span className={cn("text-[10px] md:text-xs", isLight ? "text-slate-500" : "text-zinc-400")}>
                      Hot Leads
                    </span>
                  </div>
                  <p className={cn("text-xl md:text-2xl font-bold", isLight ? "text-red-500" : "text-red-400")}>
                    {loading ? '-' : stats?.byTier?.hot || 0}
                  </p>
                </div>
                <div
                  className={cn(
                    "p-2 md:p-3 rounded-lg border",
                    isLight ? "bg-white border-slate-200" : "bg-white/[0.03] border-white/[0.08]"
                  )}
                >
                  <div className="flex items-center gap-1.5 md:gap-2 mb-1">
                    <CheckCircle2 className="h-3 w-3 md:h-4 md:w-4 text-emerald-400" />
                    <span className={cn("text-[10px] md:text-xs", isLight ? "text-slate-500" : "text-zinc-400")}>
                      Email Ready
                    </span>
                  </div>
                  <p className={cn("text-xl md:text-2xl font-bold", isLight ? "text-emerald-500" : "text-emerald-400")}>
                    {loading ? '-' : readinessSummary.emailReady}
                  </p>
                </div>
                <div
                  className={cn(
                    "p-2 md:p-3 rounded-lg border",
                    isLight ? "bg-white border-slate-200" : "bg-white/[0.03] border-white/[0.08]"
                  )}
                >
                  <div className="flex items-center gap-1.5 md:gap-2 mb-1">
                    <Clock className="h-3 w-3 md:h-4 md:w-4 text-amber-400" />
                    <span className={cn("text-[10px] md:text-xs", isLight ? "text-slate-500" : "text-zinc-400")}>
                      Avg Readiness
                    </span>
                  </div>
                  <p className={cn("text-xl md:text-2xl font-bold", isLight ? "text-amber-500" : "text-amber-400")}>
                    {loading ? '-' : `${readinessSummary.averageReadiness}%`}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Priority Prospects */}
        <Card
          className={cn(isLight ? "bg-white border-slate-200" : "")}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2 md:pb-3">
            <CardTitle className="flex items-center gap-2 text-sm md:text-base">
              <Sparkles className="h-3 w-3 md:h-4 md:w-4 text-amber-400" />
              Priority Prospects
            </CardTitle>
            <Link href="/prospects">
              <Button variant="ghost" size="sm" className="h-6 md:h-7 text-[10px] md:text-xs px-2">
                View All <ArrowRight className="h-2.5 w-2.5 md:h-3 md:w-3 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
              </div>
            ) : priorityProspects.length > 0 ? (
              <div className="space-y-2">
                {priorityProspects.map((prospect, index) => (
                  <PriorityProspect key={prospect.id} prospect={prospect} index={index} isLight={isLight} />
                ))}
              </div>
            ) : (
              <div className="text-center py-6 md:py-8">
                <p className={cn("text-xs md:text-sm mb-3", isLight ? "text-slate-500" : "text-zinc-400")}>
                  No priority prospects yet
                </p>
                <Link href="/lead-sources">
                  <Button className="bg-amber-500 hover:bg-amber-600 text-black text-xs md:text-sm">
                    <Search className="h-3 w-3 md:h-4 md:w-4 mr-2" />
                    Run Scraper
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Bottom Row */}
        <div className="grid gap-4 md:gap-6 lg:grid-cols-2">
          {/* Recent Activity */}
          <Card className={cn(isLight ? "bg-gradient-to-br from-white via-[#f8f3ea] to-white border-[#efe7dc]" : "")}>
            <CardHeader className="pb-2 md:pb-3">
              <CardTitle className="flex items-center gap-2 text-sm md:text-base">
                <Activity className="h-3 w-3 md:h-4 md:w-4 text-blue-400" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
                </div>
              ) : recentActivity.length > 0 ? (
                <div className="space-y-2 md:space-y-3">
                  {recentActivity.slice(0, 6).map((activity, index) => (
                    <motion.div
                      key={activity.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.03 }}
                      className="flex items-start gap-2 md:gap-3"
                    >
                      <div
                        className={cn(
                          "p-1 md:p-1.5 rounded-md mt-0.5",
                          isLight ? "bg-slate-100" : "bg-zinc-800"
                        )}
                      >
                        {getActivityIcon(activity.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={cn("text-xs md:text-sm truncate", isLight ? "text-slate-800" : "text-zinc-300")}>
                          {activity.title}
                          {activity.prospects?.name && (
                            <span className={cn("font-medium", isLight ? "text-slate-900" : "text-white")}> - {activity.prospects.name}</span>
                          )}
                        </p>
                        <p className={cn("text-[10px] md:text-[11px]", isLight ? "text-slate-500" : "text-zinc-500")}>
                          {formatTimeAgo(activity.created_at)}
                        </p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 md:py-8">
                  <p className={cn("text-xs md:text-sm", isLight ? "text-slate-500" : "text-zinc-400")}>No recent activity</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card className={cn(isLight ? "bg-gradient-to-br from-white via-[#f9f5ee] to-white border-[#efe7dc]" : "")}>
            <CardHeader className="pb-2 md:pb-3">
              <CardTitle className="flex items-center gap-2 text-sm md:text-base">
                <Play className="h-3 w-3 md:h-4 md:w-4 text-emerald-400" />
                Quick Actions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2 md:gap-3">
                <Link
                  href="/lead-sources"
                  className={cn(
                    "group p-3 md:p-4 rounded-lg border transition-all",
                    isLight
                      ? "bg-white hover:bg-slate-50 border-slate-200 hover:border-slate-300 shadow-[var(--shadow-soft)]"
                      : "bg-zinc-800/30 hover:bg-zinc-800/50 border-zinc-800 hover:border-zinc-700"
                  )}
                >
                  <div className="flex items-center gap-1.5 md:gap-2 mb-1">
                    <Search className="h-3 w-3 md:h-4 md:w-4 text-blue-400" />
                    <span className={cn("text-xs md:text-sm font-medium", isLight ? "text-slate-900" : "text-white")}>
                      Find Leads
                    </span>
                  </div>
                  <p className={cn("text-[10px] md:text-xs", isLight ? "text-slate-500" : "text-zinc-500")}>Scrape & mine</p>
                </Link>
                <Link
                  href="/emails"
                  className={cn(
                    "group p-3 md:p-4 rounded-lg border transition-all",
                    isLight
                      ? "bg-white hover:bg-slate-50 border-slate-200 hover:border-slate-300 shadow-[var(--shadow-soft)]"
                      : "bg-zinc-800/30 hover:bg-zinc-800/50 border-zinc-800 hover:border-zinc-700"
                  )}
                >
                  <div className="flex items-center gap-1.5 md:gap-2 mb-1">
                    <Inbox className="h-3 w-3 md:h-4 md:w-4 text-emerald-400" />
                    <span className={cn("text-xs md:text-sm font-medium", isLight ? "text-slate-900" : "text-white")}>
                      Email Inbox
                    </span>
                  </div>
                  <p className={cn("text-[10px] md:text-xs", isLight ? "text-slate-500" : "text-zinc-500")}>Manage emails</p>
                </Link>
                <Link
                  href="/analytics"
                  className={cn(
                    "group p-3 md:p-4 rounded-lg border transition-all",
                    isLight
                      ? "bg-white hover:bg-slate-50 border-slate-200 hover:border-slate-300 shadow-[var(--shadow-soft)]"
                      : "bg-zinc-800/30 hover:bg-zinc-800/50 border-zinc-800 hover:border-zinc-700"
                  )}
                >
                  <div className="flex items-center gap-1.5 md:gap-2 mb-1">
                    <TrendingUp className="h-3 w-3 md:h-4 md:w-4 text-purple-400" />
                    <span className={cn("text-xs md:text-sm font-medium", isLight ? "text-slate-900" : "text-white")}>
                      Analytics
                    </span>
                  </div>
                  <p className={cn("text-[10px] md:text-xs", isLight ? "text-slate-500" : "text-zinc-500")}>Stats & campaigns</p>
                </Link>
                <Link
                  href="/pipeline"
                  className={cn(
                    "group p-3 md:p-4 rounded-lg border transition-all",
                    isLight
                      ? "bg-white hover:bg-slate-50 border-slate-200 hover:border-slate-300 shadow-[var(--shadow-soft)]"
                      : "bg-zinc-800/30 hover:bg-zinc-800/50 border-zinc-800 hover:border-zinc-700"
                  )}
                >
                  <div className="flex items-center gap-1.5 md:gap-2 mb-1">
                    <Kanban className="h-3 w-3 md:h-4 md:w-4 text-orange-400" />
                    <span className={cn("text-xs md:text-sm font-medium", isLight ? "text-slate-900" : "text-white")}>
                      Pipeline
                    </span>
                  </div>
                  <p className={cn("text-[10px] md:text-xs", isLight ? "text-slate-500" : "text-zinc-500")}>Kanban board</p>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
