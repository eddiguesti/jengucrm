'use client';

import { useState, useEffect } from 'react';
import { Header } from '@/components/layout/header';
import { MobilePageHeader } from '@/components/layout/mobile-page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Mail,
  MessageSquare,
  TrendingUp,
  Loader2,
  Globe,
  Building,
  Users,
  Inbox,
  BarChart3,
  RefreshCw,
  ArrowUp,
  ArrowDown,
  Calendar,
  Zap,
  Target,
  Trophy,
  Play,
  Pause,
  Sparkles,
  PieChart,
} from 'lucide-react';
import { EnhancedFunnelCard } from '@/components/analytics/enhanced-funnel-card';
import { flags } from '@/lib/feature-flags';

// ===== TYPES =====
interface DetailedStats {
  prospects: {
    total: number;
    byTier: Record<string, number>;
    byStage: Record<string, number>;
    byLeadQuality: Record<string, number>;
    byCountry: Record<string, number>;
    byCity: Record<string, number>;
    byPropertyType: Record<string, number>;
    bySource: Record<string, number>;
    byWeek: Record<string, number>;
  };
  emails: {
    sent: {
      total: number;
      today: number;
      thisWeek: number;
      thisMonth: number;
      byInbox: Record<string, number>;
      byDay: Record<string, number>;
    };
    replies: {
      total: number;
      today: number;
      thisWeek: number;
      thisMonth: number;
      byDay: Record<string, number>;
    };
    replyRates: {
      total: number;
      thisWeek: number;
      thisMonth: number;
    };
  };
  funnel: {
    prospects: number;
    contacted: number;
    engaged: number;
    meeting: number;
    proposal: number;
    closed: number;
    contactRate: string;
    engageRate: string;
    meetingRate: string;
    closeRate: string;
  };
  inboxes: {
    count: number;
    dailyLimit: number;
    remainingCapacity: number;
    details: Array<{ email: string; sent: number; limit: number; remaining: number }>;
    totalSentByInbox: Record<string, number>;
    sentTodayByInbox: Record<string, number>;
  };
  scraping: Record<string, { runs: number; found: number; new: number }>;
  activity: Record<string, number>;
  generatedAt: string;
}

interface Campaign {
  id: string;
  name: string;
  description: string;
  strategy_key: string;
  active: boolean;
  daily_limit: number;
  emails_sent: number;
  emails_today: number;
  replies_received: number;
  meetings_booked: number;
  reply_rate: number;
  meeting_rate: number;
  created_at: string;
}

interface CampaignData {
  campaigns: Campaign[];
  summary: {
    total_campaigns: number;
    active_campaigns: number;
    total_emails_sent: number;
    total_replies: number;
    total_meetings: number;
    overall_reply_rate: number;
    overall_meeting_rate: number;
    leading_campaign: { name: string; reply_rate: number } | null;
  };
}

export default function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState('overview');

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Analytics"
        subtitle="Performance metrics and campaign insights"
      />

      <MobilePageHeader
        title="Analytics"
        subtitle="Campaign insights"
      />

      <div className="flex-1 px-4 pb-4 md:p-6 overflow-auto">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full max-w-md grid-cols-2 bg-zinc-900 border border-zinc-800">
            <TabsTrigger
              value="overview"
              className="data-[state=active]:bg-blue-600 data-[state=active]:text-white flex items-center gap-2"
            >
              <BarChart3 className="h-4 w-4" />
              <span className="hidden sm:inline">Overview</span>
              <span className="sm:hidden">Stats</span>
            </TabsTrigger>
            <TabsTrigger
              value="campaigns"
              className="data-[state=active]:bg-blue-600 data-[state=active]:text-white flex items-center gap-2"
            >
              <Zap className="h-4 w-4" />
              <span className="hidden sm:inline">Campaigns</span>
              <span className="sm:hidden">A/B</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-6">
            <StatsOverviewTab />
          </TabsContent>

          <TabsContent value="campaigns" className="mt-6">
            <CampaignsTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// ===== SHARED COMPONENTS =====
function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  trendValue,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
}) {
  return (
    <Card>
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] sm:text-xs text-muted-foreground mb-1">{title}</p>
            <p className="text-xl sm:text-2xl font-bold">{value}</p>
            {subtitle && <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">{subtitle}</p>}
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="p-1.5 sm:p-2 rounded-lg bg-white/5">
              <Icon className="h-3 w-3 sm:h-4 sm:w-4 text-blue-400" />
            </div>
            {trend && trendValue && (
              <div className={`flex items-center gap-0.5 text-[10px] sm:text-xs ${
                trend === 'up' ? 'text-green-400' : trend === 'down' ? 'text-red-400' : 'text-muted-foreground'
              }`}>
                {trend === 'up' ? <ArrowUp className="h-2 w-2 sm:h-3 sm:w-3" /> : trend === 'down' ? <ArrowDown className="h-2 w-2 sm:h-3 sm:w-3" /> : null}
                {trendValue}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ProgressBar({ value, max, label, color = 'blue' }: { value: number; max: number; label: string; color?: string }) {
  const percentage = max > 0 ? (value / max) * 100 : 0;
  const colorClasses: Record<string, string> = {
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    amber: 'bg-amber-500',
    red: 'bg-red-500',
    purple: 'bg-purple-500',
  };

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px] sm:text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{value.toLocaleString()}</span>
      </div>
      <div className="h-1.5 sm:h-2 bg-white/5 rounded-full overflow-hidden">
        <div
          className={`h-full ${colorClasses[color]} rounded-full transition-all duration-500`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
    </div>
  );
}

// ===== STATS OVERVIEW TAB =====
function StatsOverviewTab() {
  const [stats, setStats] = useState<DetailedStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchStats() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/stats/detailed');
      if (!res.ok) throw new Error('Failed to fetch stats');
      const data = await res.json();
      setStats(data);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="flex-1 flex items-center justify-center py-20">
        <div className="text-center">
          <p className="text-red-400 mb-4 text-sm">{error || 'Failed to load stats'}</p>
          <Button onClick={fetchStats} size="sm">Retry</Button>
        </div>
      </div>
    );
  }

  const topCountries = Object.entries(stats.prospects.byCountry)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const topCities = Object.entries(stats.prospects.byCity)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const propertyTypes = Object.entries(stats.prospects.byPropertyType)
    .sort((a, b) => b[1] - a[1]);

  const sources = Object.entries(stats.prospects.bySource)
    .sort((a, b) => b[1] - a[1]);

  const maxCountry = topCountries[0]?.[1] || 1;
  const maxCity = topCities[0]?.[1] || 1;

  return (
    <div className="space-y-6">
      {/* Refresh button */}
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={fetchStats}
          disabled={loading}
          className="text-xs"
        >
          <RefreshCw className={`h-3 w-3 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Email Performance Overview */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Emails Sent Today"
          value={stats.emails.sent.today}
          subtitle={`${stats.emails.sent.thisMonth} this month`}
          icon={Mail}
        />
        <StatCard
          title="Replies Today"
          value={stats.emails.replies.today}
          subtitle={`${stats.emails.replies.thisMonth} this month`}
          icon={MessageSquare}
        />
        <StatCard
          title="Reply Rate (Month)"
          value={`${stats.emails.replyRates.thisMonth}%`}
          subtitle={`${stats.emails.replyRates.total}% all time`}
          icon={TrendingUp}
          trend={stats.emails.replyRates.thisMonth > stats.emails.replyRates.total ? 'up' : 'down'}
          trendValue={`${Math.abs(stats.emails.replyRates.thisMonth - stats.emails.replyRates.total).toFixed(1)}%`}
        />
        <StatCard
          title="Total Prospects"
          value={stats.prospects.total.toLocaleString()}
          subtitle={`${stats.prospects.byTier.hot || 0} hot leads`}
          icon={Users}
        />
      </div>

      {/* Funnel + Lead Quality */}
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
        {/* Conversion Funnel - Enhanced or Standard */}
        {flags.SHOW_ENHANCED_FUNNEL ? (
          <EnhancedFunnelCard
            funnel={{
              total: stats.funnel.prospects,
              contacted: stats.funnel.contacted,
              engaged: stats.funnel.engaged,
              meeting: stats.funnel.meeting,
              won: stats.funnel.closed,
              lost: 0, // Not tracked in detailed stats
            }}
          />
        ) : (
          <Card>
            <CardHeader className="pb-2 sm:pb-3">
              <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
                <BarChart3 className="h-3 w-3 sm:h-4 sm:w-4 text-purple-400" />
                Conversion Funnel
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 sm:space-y-4">
              <div className="space-y-2 sm:space-y-3">
                {[
                  { label: 'Prospects', value: stats.funnel.prospects, color: 'blue' },
                  { label: 'Contacted', value: stats.funnel.contacted, color: 'purple', rate: stats.funnel.contactRate },
                  { label: 'Engaged', value: stats.funnel.engaged, color: 'amber', rate: stats.funnel.engageRate },
                  { label: 'Meeting', value: stats.funnel.meeting, color: 'green', rate: stats.funnel.meetingRate },
                  { label: 'Closed', value: stats.funnel.closed, color: 'green', rate: stats.funnel.closeRate },
                ].map((stage) => (
                  <div key={stage.label} className="flex items-center gap-2 sm:gap-3">
                    <div className="w-16 sm:w-20 text-[10px] sm:text-xs text-muted-foreground">{stage.label}</div>
                    <div className="flex-1">
                      <ProgressBar
                        value={stage.value}
                        max={stats.funnel.prospects}
                        label=""
                        color={stage.color}
                      />
                    </div>
                    <div className="w-14 sm:w-16 text-right">
                      <span className="text-xs sm:text-sm font-medium">{stage.value}</span>
                      {stage.rate && (
                        <span className="text-[10px] sm:text-xs text-muted-foreground ml-1">({stage.rate}%)</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Lead Quality Distribution */}
        <Card>
          <CardHeader className="pb-2 sm:pb-3">
            <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
              <Users className="h-3 w-3 sm:h-4 sm:w-4 text-blue-400" />
              Lead Quality
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-4 sm:mb-6">
              <div className="text-center p-2 sm:p-4 rounded-lg bg-red-500/10 border border-red-500/20">
                <p className="text-lg sm:text-2xl font-bold text-red-400">{stats.prospects.byLeadQuality.hot || 0}</p>
                <p className="text-[10px] sm:text-xs text-muted-foreground">Hot</p>
              </div>
              <div className="text-center p-2 sm:p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <p className="text-lg sm:text-2xl font-bold text-amber-400">{stats.prospects.byLeadQuality.warm || 0}</p>
                <p className="text-[10px] sm:text-xs text-muted-foreground">Warm</p>
              </div>
              <div className="text-center p-2 sm:p-4 rounded-lg bg-white/5 border border-white/10">
                <p className="text-lg sm:text-2xl font-bold text-muted-foreground">{stats.prospects.byLeadQuality.cold || 0}</p>
                <p className="text-[10px] sm:text-xs text-muted-foreground">Cold</p>
              </div>
            </div>

            <div className="space-y-1.5 sm:space-y-2">
              <p className="text-[10px] sm:text-xs text-muted-foreground mb-1.5 sm:mb-2">By Stage</p>
              {Object.entries(stats.prospects.byStage)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([stage, count]) => (
                  <div key={stage} className="flex items-center justify-between text-xs sm:text-sm">
                    <span className="capitalize text-muted-foreground">{stage.replace('_', ' ')}</span>
                    <Badge variant="outline" className="text-[10px] sm:text-xs">{count}</Badge>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Geographic Distribution */}
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2 sm:pb-3">
            <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
              <Globe className="h-3 w-3 sm:h-4 sm:w-4 text-green-400" />
              By Country
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 sm:space-y-2">
            {topCountries.length > 0 ? (
              topCountries.slice(0, 6).map(([country, count]) => (
                <ProgressBar
                  key={country}
                  value={count}
                  max={maxCountry}
                  label={country}
                  color="green"
                />
              ))
            ) : (
              <p className="text-xs sm:text-sm text-muted-foreground text-center py-4">No data yet</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 sm:pb-3">
            <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
              <Building className="h-3 w-3 sm:h-4 sm:w-4 text-amber-400" />
              Top Cities
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 sm:space-y-2 max-h-[300px] overflow-y-auto">
            {topCities.length > 0 ? (
              topCities.slice(0, 6).map(([city, count]) => (
                <ProgressBar
                  key={city}
                  value={count}
                  max={maxCity}
                  label={city}
                  color="amber"
                />
              ))
            ) : (
              <p className="text-xs sm:text-sm text-muted-foreground text-center py-4">No data yet</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Property Types & Sources */}
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2 sm:pb-3">
            <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
              <Building className="h-3 w-3 sm:h-4 sm:w-4 text-purple-400" />
              Property Types
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              {propertyTypes.length > 0 ? (
                propertyTypes.slice(0, 6).map(([type, count]) => (
                  <div
                    key={type}
                    className="flex items-center justify-between p-2 sm:p-3 rounded-lg bg-white/5 border border-white/10"
                  >
                    <span className="text-[10px] sm:text-sm capitalize truncate">{type.replace('_', ' ')}</span>
                    <Badge className="text-[10px] sm:text-xs">{count}</Badge>
                  </div>
                ))
              ) : (
                <p className="text-xs sm:text-sm text-muted-foreground text-center py-4 col-span-2">No data yet</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 sm:pb-3">
            <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
              <PieChart className="h-3 w-3 sm:h-4 sm:w-4 text-blue-400" />
              Lead Sources
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 sm:space-y-2">
            {sources.length > 0 ? (
              sources.slice(0, 5).map(([source, count]) => (
                <div key={source} className="flex items-center justify-between p-1.5 sm:p-2 rounded-lg bg-white/5">
                  <span className="text-[10px] sm:text-sm">{source}</span>
                  <Badge variant="outline" className="text-[10px] sm:text-xs">{count}</Badge>
                </div>
              ))
            ) : (
              <p className="text-xs sm:text-sm text-muted-foreground text-center py-4">No data yet</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Inbox Stats */}
      <Card>
        <CardHeader className="pb-2 sm:pb-3">
          <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
            <Inbox className="h-3 w-3 sm:h-4 sm:w-4 text-blue-400" />
            Inbox Warmup Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:gap-4 grid-cols-3 mb-4 sm:mb-6">
            <div className="text-center p-2 sm:p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <p className="text-lg sm:text-2xl font-bold text-blue-400">{stats.inboxes.count}</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground">Active Inboxes</p>
            </div>
            <div className="text-center p-2 sm:p-4 rounded-lg bg-green-500/10 border border-green-500/20">
              <p className="text-lg sm:text-2xl font-bold text-green-400">{stats.inboxes.remainingCapacity}</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground">Remaining Today</p>
            </div>
            <div className="text-center p-2 sm:p-4 rounded-lg bg-white/5 border border-white/10">
              <p className="text-lg sm:text-2xl font-bold">{stats.inboxes.dailyLimit}</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground">Daily Limit</p>
            </div>
          </div>

          {stats.inboxes.details.length > 0 ? (
            <div className="space-y-2 sm:space-y-3">
              <p className="text-[10px] sm:text-xs text-muted-foreground mb-1.5 sm:mb-2">Per-Inbox Usage (Today)</p>
              {stats.inboxes.details.map((inbox) => (
                <div key={inbox.email} className="space-y-1">
                  <div className="flex justify-between text-[10px] sm:text-xs">
                    <span className="text-muted-foreground font-mono truncate">{inbox.email}</span>
                    <span className="font-medium">{inbox.sent} / {inbox.limit}</span>
                  </div>
                  <div className="h-1.5 sm:h-2 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        inbox.sent >= inbox.limit ? 'bg-red-500' : inbox.sent > inbox.limit * 0.8 ? 'bg-amber-500' : 'bg-green-500'
                      }`}
                      style={{ width: `${Math.min((inbox.sent / inbox.limit) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 sm:py-8">
              <p className="text-xs sm:text-sm text-muted-foreground mb-2">No SMTP inboxes configured</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground">
                Add SMTP_INBOX_1 environment variable to enable inbox rotation
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Generated timestamp */}
      <p className="text-[10px] sm:text-xs text-muted-foreground text-center">
        Last updated: {new Date(stats.generatedAt).toLocaleString()}
      </p>
    </div>
  );
}

// ===== CAMPAIGNS TAB =====
function CampaignsTab() {
  const [data, setData] = useState<CampaignData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchCampaigns() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/campaigns');
      if (!res.ok) throw new Error('Failed to fetch campaigns');
      const result = await res.json();
      setData(result);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  async function toggleCampaign(id: string, active: boolean) {
    try {
      const res = await fetch('/api/campaigns', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, active }),
      });
      if (res.ok) {
        fetchCampaigns();
      }
    } catch (err) {
      console.error('Failed to toggle campaign:', err);
    }
  }

  useEffect(() => {
    fetchCampaigns();
  }, []);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex-1 flex items-center justify-center py-20">
        <div className="text-center">
          <p className="text-red-400 mb-4 text-sm">{error || 'Failed to load campaigns'}</p>
          <Button onClick={fetchCampaigns} size="sm">Retry</Button>
        </div>
      </div>
    );
  }

  const { campaigns, summary } = data;
  const leadingCampaignId = campaigns.reduce((best, current) =>
    current.reply_rate > (best?.reply_rate || 0) ? current : best
  , campaigns[0])?.id;

  return (
    <div className="space-y-6">
      {/* Refresh button */}
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={fetchCampaigns}
          disabled={loading}
          className="text-xs"
        >
          <RefreshCw className={`h-3 w-3 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Summary Stats */}
      <div className="grid gap-2 sm:gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        <MetricCard title="Total Sent" value={summary.total_emails_sent} icon={Mail} color="blue" />
        <MetricCard title="Total Replies" value={summary.total_replies} icon={MessageSquare} color="green" />
        <MetricCard title="Meetings" value={summary.total_meetings} icon={Calendar} color="purple" />
        <MetricCard title="Reply Rate" value={`${summary.overall_reply_rate}%`} icon={TrendingUp} color="amber" />
        <MetricCard title="Meeting Rate" value={`${summary.overall_meeting_rate}%`} icon={Target} color="red" />
      </div>

      {/* Leader Banner */}
      {summary.leading_campaign && summary.total_emails_sent > 10 && (
        <Card className="bg-gradient-to-r from-green-500/10 to-blue-500/10 border-green-500/30">
          <CardContent className="py-3 sm:py-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-0">
              <div className="flex items-center gap-2 sm:gap-3">
                <Trophy className="h-5 w-5 sm:h-6 sm:w-6 text-green-400 flex-shrink-0" />
                <div>
                  <p className="font-medium text-sm sm:text-base">Leading Campaign</p>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    <span className="text-green-400 font-medium">{summary.leading_campaign.name}</span> is performing best
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 text-green-400 pl-7 sm:pl-0">
                <ArrowUp className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="text-base sm:text-lg font-bold">{summary.leading_campaign.reply_rate}%</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Campaign Cards */}
      <div>
        <h2 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 flex items-center gap-2">
          <Zap className="h-4 w-4 sm:h-5 sm:w-5 text-amber-400" />
          Active Campaigns
        </h2>
        <div className="grid gap-4 sm:gap-6 md:grid-cols-2">
          {campaigns.map((campaign) => (
            <CampaignCard
              key={campaign.id}
              campaign={campaign}
              isLeading={campaign.id === leadingCampaignId && summary.total_emails_sent > 10}
              onToggle={toggleCampaign}
            />
          ))}
        </div>
      </div>

      {/* Strategy Comparison */}
      {campaigns.length >= 2 && summary.total_emails_sent > 0 && (
        <Card>
          <CardHeader className="pb-2 sm:pb-3">
            <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
              <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-blue-400" />
              Strategy Comparison
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 sm:space-y-4">
              {campaigns.map((campaign) => {
                const widthPercent = summary.total_emails_sent > 0
                  ? (campaign.emails_sent / summary.total_emails_sent) * 100
                  : 0;
                const isLeading = campaign.id === leadingCampaignId;

                return (
                  <div key={campaign.id} className="space-y-1.5 sm:space-y-2">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-xs sm:text-sm">{campaign.name}</span>
                        {isLeading && summary.total_emails_sent > 10 && (
                          <Badge variant="outline" className="text-green-400 border-green-400/50 text-[10px] sm:text-xs">
                            <Trophy className="h-2 w-2 sm:h-3 sm:w-3 mr-1" />
                            Leading
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 sm:gap-4 text-[10px] sm:text-sm">
                        <span className="text-muted-foreground">{campaign.emails_sent} sent</span>
                        <span className="text-blue-400">{campaign.replies_received} replies</span>
                        <span className={`font-bold ${isLeading ? 'text-green-400' : ''}`}>
                          {campaign.reply_rate}% rate
                        </span>
                      </div>
                    </div>
                    <div className="h-2 sm:h-3 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          isLeading ? 'bg-gradient-to-r from-green-500 to-green-400' : 'bg-blue-500'
                        }`}
                        style={{ width: `${widthPercent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Statistical Significance Note */}
      {summary.total_emails_sent < 100 && (
        <Card className="bg-amber-500/10 border-amber-500/30">
          <CardContent className="py-3 sm:py-4">
            <div className="flex items-start gap-2 sm:gap-3">
              <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-amber-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-amber-400 text-sm">Building Statistical Significance</p>
                <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                  You&apos;ve sent {summary.total_emails_sent} emails so far. We recommend at least 100+ emails per campaign
                  before drawing conclusions. Keep sending!
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function MetricCard({
  title,
  value,
  icon: Icon,
  color = 'blue',
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  color?: 'blue' | 'green' | 'purple' | 'amber' | 'red';
}) {
  const colorClasses = {
    blue: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    green: 'text-green-400 bg-green-500/10 border-green-500/20',
    purple: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
    amber: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    red: 'text-red-400 bg-red-500/10 border-red-500/20',
  };

  return (
    <div className={`p-2 sm:p-4 rounded-xl border ${colorClasses[color]}`}>
      <div className="flex items-center gap-2 sm:gap-3">
        <Icon className={`h-4 w-4 sm:h-5 sm:w-5 ${colorClasses[color].split(' ')[0]} flex-shrink-0`} />
        <div className="min-w-0">
          <p className="text-lg sm:text-2xl font-bold truncate">{value}</p>
          <p className="text-[10px] sm:text-xs text-muted-foreground truncate">{title}</p>
        </div>
      </div>
    </div>
  );
}

function CampaignCard({
  campaign,
  isLeading,
  onToggle,
}: {
  campaign: Campaign;
  isLeading: boolean;
  onToggle: (id: string, active: boolean) => void;
}) {
  const getStrategyIcon = (key: string) => {
    switch (key) {
      case 'authority_scarcity':
        return <Target className="h-3 w-3 sm:h-4 sm:w-4 text-purple-400" />;
      case 'curiosity_value':
        return <Sparkles className="h-3 w-3 sm:h-4 sm:w-4 text-amber-400" />;
      default:
        return <Zap className="h-3 w-3 sm:h-4 sm:w-4 text-blue-400" />;
    }
  };

  return (
    <Card className={`relative overflow-hidden ${isLeading ? 'ring-2 ring-green-500/50' : ''}`}>
      {isLeading && (
        <div className="absolute top-0 right-0 bg-green-500 text-white text-[10px] sm:text-xs px-2 sm:px-3 py-0.5 sm:py-1 rounded-bl-lg flex items-center gap-1">
          <Trophy className="h-2 w-2 sm:h-3 sm:w-3" />
          Leading
        </div>
      )}

      <CardHeader className="pb-2 sm:pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            {getStrategyIcon(campaign.strategy_key)}
            <CardTitle className="text-sm sm:text-lg">{campaign.name}</CardTitle>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onToggle(campaign.id, !campaign.active)}
            className={`text-xs ${campaign.active ? 'text-green-400 hover:text-green-300' : 'text-muted-foreground'}`}
          >
            {campaign.active ? (
              <>
                <Play className="h-3 w-3 sm:h-4 sm:w-4 mr-1 fill-current" />
                <span className="hidden sm:inline">Active</span>
              </>
            ) : (
              <>
                <Pause className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                <span className="hidden sm:inline">Paused</span>
              </>
            )}
          </Button>
        </div>
        <CardDescription className="text-[10px] sm:text-xs">{campaign.description}</CardDescription>
      </CardHeader>

      <CardContent>
        {/* Key Metrics */}
        <div className="grid grid-cols-4 gap-2 sm:gap-3 mb-3 sm:mb-4">
          <div className="text-center p-1.5 sm:p-3 rounded-lg bg-white/5">
            <p className="text-sm sm:text-xl font-bold">{campaign.emails_sent}</p>
            <p className="text-[9px] sm:text-xs text-muted-foreground">Sent</p>
          </div>
          <div className="text-center p-1.5 sm:p-3 rounded-lg bg-white/5">
            <p className="text-sm sm:text-xl font-bold text-blue-400">{campaign.replies_received}</p>
            <p className="text-[9px] sm:text-xs text-muted-foreground">Replies</p>
          </div>
          <div className="text-center p-1.5 sm:p-3 rounded-lg bg-white/5">
            <p className="text-sm sm:text-xl font-bold text-green-400">{campaign.meetings_booked}</p>
            <p className="text-[9px] sm:text-xs text-muted-foreground">Meetings</p>
          </div>
          <div className="text-center p-1.5 sm:p-3 rounded-lg bg-white/5">
            <p className="text-sm sm:text-xl font-bold text-amber-400">{campaign.reply_rate}%</p>
            <p className="text-[9px] sm:text-xs text-muted-foreground">Rate</p>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] sm:text-xs">
            <span className="text-muted-foreground">Reply Rate</span>
            <span className="font-medium">{campaign.reply_rate}%</span>
          </div>
          <div className="h-1.5 sm:h-2 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-green-500 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(campaign.reply_rate * 5, 100)}%` }}
            />
          </div>
        </div>

        {/* Today's Activity */}
        <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs text-muted-foreground">
            <Mail className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
            <span>{campaign.emails_today} / {campaign.daily_limit} today</span>
          </div>
          <Badge variant={campaign.active ? 'default' : 'secondary'} className="text-[9px] sm:text-xs">
            {campaign.strategy_key.replace('_', ' ')}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
