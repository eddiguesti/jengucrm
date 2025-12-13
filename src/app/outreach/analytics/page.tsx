'use client';

import { useState, useEffect, useCallback } from 'react';
import { Header } from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  TrendingUp,
  RefreshCw,
  Loader2,
  Mail,
  Send,
  MailOpen,
  Reply,
  AlertTriangle,
  Users,
  Target,
  Activity,
  Inbox,
  MailPlus,
  CheckCircle,
  XCircle,
  Flame,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/contexts/ThemeContext';

interface AnalyticsData {
  mailboxes: {
    total: number;
    active: number;
    warming: number;
    paused: number;
    averageHealth: number;
    totalCapacity: number;
    usedCapacity: number;
  };
  campaigns: {
    total: number;
    active: number;
    totalLeads: number;
    activeLeads: number;
  };
  emails: {
    totalSent: number;
    totalOpens: number;
    totalReplies: number;
    totalBounces: number;
    openRate: number;
    replyRate: number;
    bounceRate: number;
  };
  inbox: {
    total: number;
    unread: number;
    starred: number;
    positiveReplies: number;
    negativeReplies: number;
  };
}

export default function AnalyticsPage() {
  const { theme } = useTheme();
  const isLight = theme === 'light';

  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/outreach/analytics');
      const analytics = await res.json();
      setData(analytics);
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
      </div>
    );
  }

  // Use mock data if API not ready
  const analytics: AnalyticsData = data || {
    mailboxes: { total: 0, active: 0, warming: 0, paused: 0, averageHealth: 100, totalCapacity: 0, usedCapacity: 0 },
    campaigns: { total: 0, active: 0, totalLeads: 0, activeLeads: 0 },
    emails: { totalSent: 0, totalOpens: 0, totalReplies: 0, totalBounces: 0, openRate: 0, replyRate: 0, bounceRate: 0 },
    inbox: { total: 0, unread: 0, starred: 0, positiveReplies: 0, negativeReplies: 0 },
  };

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Performance"
        subtitle="Email outreach metrics and analytics"
        action={
          <Button size="sm" onClick={fetchAnalytics} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
            Refresh
          </Button>
        }
      />

      <div className="flex-1 p-4 md:p-6 overflow-auto space-y-6">
        {/* Overview Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard
            title="Total Sent"
            value={analytics.emails.totalSent.toLocaleString()}
            icon={Send}
            color="violet"
            isLight={isLight}
          />
          <MetricCard
            title="Open Rate"
            value={`${analytics.emails.openRate.toFixed(1)}%`}
            icon={MailOpen}
            color="blue"
            isLight={isLight}
            subValue={`${analytics.emails.totalOpens.toLocaleString()} opens`}
          />
          <MetricCard
            title="Reply Rate"
            value={`${analytics.emails.replyRate.toFixed(1)}%`}
            icon={Reply}
            color="emerald"
            isLight={isLight}
            subValue={`${analytics.emails.totalReplies.toLocaleString()} replies`}
          />
          <MetricCard
            title="Bounce Rate"
            value={`${analytics.emails.bounceRate.toFixed(1)}%`}
            icon={AlertTriangle}
            color="red"
            isLight={isLight}
            subValue={`${analytics.emails.totalBounces.toLocaleString()} bounces`}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Mailbox Health */}
          <Card className={cn(
            "border",
            isLight ? "bg-white border-slate-200" : "bg-zinc-900/50 border-zinc-800"
          )}>
            <CardHeader>
              <CardTitle className={cn(
                "flex items-center gap-2",
                isLight ? "text-slate-900" : "text-white"
              )}>
                <MailPlus className="h-5 w-5 text-violet-500" />
                Mailbox Health
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center">
                    <div className={cn(
                      "text-3xl font-bold",
                      isLight ? "text-slate-900" : "text-white"
                    )}>
                      {analytics.mailboxes.total}
                    </div>
                    <div className={cn(
                      "text-sm",
                      isLight ? "text-slate-500" : "text-zinc-500"
                    )}>
                      Total
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-emerald-500">
                      {analytics.mailboxes.active}
                    </div>
                    <div className={cn(
                      "text-sm",
                      isLight ? "text-slate-500" : "text-zinc-500"
                    )}>
                      Active
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-amber-500">
                      {analytics.mailboxes.warming}
                    </div>
                    <div className={cn(
                      "text-sm",
                      isLight ? "text-slate-500" : "text-zinc-500"
                    )}>
                      Warming
                    </div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between mb-2">
                    <span className={cn("text-sm", isLight ? "text-slate-600" : "text-zinc-400")}>
                      Average Health
                    </span>
                    <span className={cn(
                      "text-sm font-medium",
                      analytics.mailboxes.averageHealth >= 80
                        ? "text-emerald-500"
                        : analytics.mailboxes.averageHealth >= 50
                          ? "text-amber-500"
                          : "text-red-500"
                    )}>
                      {analytics.mailboxes.averageHealth}%
                    </span>
                  </div>
                  <div className={cn(
                    "h-2 rounded-full overflow-hidden",
                    isLight ? "bg-slate-100" : "bg-zinc-800"
                  )}>
                    <div
                      className={cn(
                        "h-full rounded-full",
                        analytics.mailboxes.averageHealth >= 80
                          ? "bg-emerald-500"
                          : analytics.mailboxes.averageHealth >= 50
                            ? "bg-amber-500"
                            : "bg-red-500"
                      )}
                      style={{ width: `${analytics.mailboxes.averageHealth}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between mb-2">
	                    <span className={cn("text-sm", isLight ? "text-slate-600" : "text-zinc-400")}>
	                      Today&apos;s Capacity Used
	                    </span>
                    <span className={cn("text-sm", isLight ? "text-slate-600" : "text-zinc-400")}>
                      {analytics.mailboxes.usedCapacity}/{analytics.mailboxes.totalCapacity}
                    </span>
                  </div>
                  <div className={cn(
                    "h-2 rounded-full overflow-hidden",
                    isLight ? "bg-slate-100" : "bg-zinc-800"
                  )}>
                    <div
                      className="h-full bg-violet-500 rounded-full"
                      style={{
                        width: `${analytics.mailboxes.totalCapacity > 0
                          ? (analytics.mailboxes.usedCapacity / analytics.mailboxes.totalCapacity) * 100
                          : 0}%`
                      }}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Campaign Performance */}
          <Card className={cn(
            "border",
            isLight ? "bg-white border-slate-200" : "bg-zinc-900/50 border-zinc-800"
          )}>
            <CardHeader>
              <CardTitle className={cn(
                "flex items-center gap-2",
                isLight ? "text-slate-900" : "text-white"
              )}>
                <Target className="h-5 w-5 text-violet-500" />
                Campaign Performance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className={cn(
                      "text-3xl font-bold",
                      isLight ? "text-slate-900" : "text-white"
                    )}>
                      {analytics.campaigns.total}
                    </div>
                    <div className={cn(
                      "text-sm",
                      isLight ? "text-slate-500" : "text-zinc-500"
                    )}>
                      Total Campaigns
                    </div>
                  </div>
                  <div>
                    <div className="text-3xl font-bold text-emerald-500">
                      {analytics.campaigns.active}
                    </div>
                    <div className={cn(
                      "text-sm",
                      isLight ? "text-slate-500" : "text-zinc-500"
                    )}>
                      Active
                    </div>
                  </div>
                </div>

                <div className={cn(
                  "pt-4 border-t",
                  isLight ? "border-slate-200" : "border-zinc-800"
                )}>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center gap-3">
                      <Users className={cn(
                        "h-5 w-5",
                        isLight ? "text-slate-400" : "text-zinc-500"
                      )} />
                      <div>
                        <div className={cn(
                          "text-lg font-semibold",
                          isLight ? "text-slate-900" : "text-white"
                        )}>
                          {analytics.campaigns.totalLeads.toLocaleString()}
                        </div>
                        <div className={cn(
                          "text-xs",
                          isLight ? "text-slate-500" : "text-zinc-500"
                        )}>
                          Total Leads
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Activity className={cn(
                        "h-5 w-5",
                        isLight ? "text-slate-400" : "text-zinc-500"
                      )} />
                      <div>
                        <div className={cn(
                          "text-lg font-semibold",
                          isLight ? "text-slate-900" : "text-white"
                        )}>
                          {analytics.campaigns.activeLeads.toLocaleString()}
                        </div>
                        <div className={cn(
                          "text-xs",
                          isLight ? "text-slate-500" : "text-zinc-500"
                        )}>
                          In Sequence
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Inbox Stats */}
        <Card className={cn(
          "border",
          isLight ? "bg-white border-slate-200" : "bg-zinc-900/50 border-zinc-800"
        )}>
          <CardHeader>
            <CardTitle className={cn(
              "flex items-center gap-2",
              isLight ? "text-slate-900" : "text-white"
            )}>
              <Inbox className="h-5 w-5 text-violet-500" />
              Inbox Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <InboxStat
                label="Total Items"
                value={analytics.inbox.total}
                icon={Mail}
                isLight={isLight}
              />
              <InboxStat
                label="Unread"
                value={analytics.inbox.unread}
                icon={MailOpen}
                color="blue"
                isLight={isLight}
              />
              <InboxStat
                label="Starred"
                value={analytics.inbox.starred}
                icon={Activity}
                color="amber"
                isLight={isLight}
              />
              <InboxStat
                label="Positive"
                value={analytics.inbox.positiveReplies}
                icon={CheckCircle}
                color="emerald"
                isLight={isLight}
              />
              <InboxStat
                label="Negative"
                value={analytics.inbox.negativeReplies}
                icon={XCircle}
                color="red"
                isLight={isLight}
              />
            </div>
          </CardContent>
        </Card>

        {/* Funnel Visualization */}
        <Card className={cn(
          "border",
          isLight ? "bg-white border-slate-200" : "bg-zinc-900/50 border-zinc-800"
        )}>
          <CardHeader>
            <CardTitle className={cn(
              "flex items-center gap-2",
              isLight ? "text-slate-900" : "text-white"
            )}>
              <TrendingUp className="h-5 w-5 text-violet-500" />
              Email Funnel
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-center gap-4 h-48">
              <FunnelBar
                label="Sent"
                value={analytics.emails.totalSent}
                percentage={100}
                color="violet"
                isLight={isLight}
              />
              <FunnelBar
                label="Opened"
                value={analytics.emails.totalOpens}
                percentage={analytics.emails.openRate}
                color="blue"
                isLight={isLight}
              />
              <FunnelBar
                label="Replied"
                value={analytics.emails.totalReplies}
                percentage={analytics.emails.replyRate}
                color="emerald"
                isLight={isLight}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MetricCard({
  title,
  value,
  icon: Icon,
  color,
  isLight,
  subValue,
}: {
  title: string;
  value: string;
  icon: React.ElementType;
  color: string;
  isLight: boolean;
  subValue?: string;
}) {
  const colorClasses: Record<string, string> = {
    violet: isLight ? 'text-violet-600 bg-violet-100' : 'text-violet-400 bg-violet-500/20',
    blue: isLight ? 'text-blue-600 bg-blue-100' : 'text-blue-400 bg-blue-500/20',
    emerald: isLight ? 'text-emerald-600 bg-emerald-100' : 'text-emerald-400 bg-emerald-500/20',
    red: isLight ? 'text-red-600 bg-red-100' : 'text-red-400 bg-red-500/20',
  };

  return (
    <Card className={cn(
      "border",
      isLight ? "bg-white border-slate-200" : "bg-zinc-900/50 border-zinc-800"
    )}>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={cn("p-2 rounded-lg", colorClasses[color])}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <p className={cn("text-xs", isLight ? "text-slate-500" : "text-zinc-500")}>
              {title}
            </p>
            <p className={cn(
              "text-xl font-bold",
              isLight ? "text-slate-900" : "text-white"
            )}>
              {value}
            </p>
            {subValue && (
              <p className={cn("text-xs", isLight ? "text-slate-400" : "text-zinc-600")}>
                {subValue}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function InboxStat({
  label,
  value,
  icon: Icon,
  color,
  isLight,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  color?: string;
  isLight: boolean;
}) {
  const colorClasses: Record<string, string> = {
    blue: isLight ? 'text-blue-600' : 'text-blue-400',
    amber: isLight ? 'text-amber-600' : 'text-amber-400',
    emerald: isLight ? 'text-emerald-600' : 'text-emerald-400',
    red: isLight ? 'text-red-600' : 'text-red-400',
  };

  return (
    <div className="text-center">
      <Icon className={cn(
        "h-6 w-6 mx-auto mb-2",
        color ? colorClasses[color] : (isLight ? "text-slate-400" : "text-zinc-500")
      )} />
      <div className={cn(
        "text-2xl font-bold",
        isLight ? "text-slate-900" : "text-white"
      )}>
        {value.toLocaleString()}
      </div>
      <div className={cn(
        "text-xs",
        isLight ? "text-slate-500" : "text-zinc-500"
      )}>
        {label}
      </div>
    </div>
  );
}

function FunnelBar({
  label,
  value,
  percentage,
  color,
  isLight,
}: {
  label: string;
  value: number;
  percentage: number;
  color: string;
  isLight: boolean;
}) {
  const colorClasses: Record<string, string> = {
    violet: 'bg-violet-500',
    blue: 'bg-blue-500',
    emerald: 'bg-emerald-500',
  };

  const height = Math.max(20, (percentage / 100) * 150);

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className={cn("w-20 rounded-t-lg transition-all", colorClasses[color])}
        style={{ height: `${height}px` }}
      />
      <div className="text-center">
        <div className={cn(
          "text-lg font-bold",
          isLight ? "text-slate-900" : "text-white"
        )}>
          {value.toLocaleString()}
        </div>
        <div className={cn(
          "text-xs",
          isLight ? "text-slate-500" : "text-zinc-500"
        )}>
          {label}
        </div>
        <div className={cn(
          "text-xs",
          isLight ? "text-slate-400" : "text-zinc-600"
        )}>
          {percentage.toFixed(1)}%
        </div>
      </div>
    </div>
  );
}
