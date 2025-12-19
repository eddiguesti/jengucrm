'use client';

import { useState, useEffect } from 'react';
import { Header } from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
  Search,
  Zap,
  Database,
  Activity,
} from 'lucide-react';

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

interface EnrichmentStats {
  pipeline: {
    total: number;
    needsWebsite: number;
    needsEmail: number;
    enriched: number;
    contacted: number;
  };
  coverage: {
    total: number;
    withWebsite: number;
    withEmail: number;
    websiteRate: number;
    emailRate: number;
  };
  apiUsage: {
    google: {
      configured: boolean;
      dailyLimit: number;
      usedToday: number;
      remaining: number;
      percentUsed: number;
    };
    brave: {
      configured: boolean;
      keysAvailable: number;
      monthlyLimit: number;
    };
  };
  today: {
    websitesFound: number;
    emailsFound: number;
    enrichmentRuns: number;
  };
  progress: {
    isRunning: boolean;
    type: string | null;
    processed: number;
    total: number;
    found: number;
    websitesFound: number;
    emailsFound: number;
    startedAt: string | null;
    lastUpdatedAt: string | null;
  };
  generatedAt: string;
}

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
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground mb-1">{title}</p>
            <p className="text-2xl font-bold">{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="p-2 rounded-lg bg-white/5">
              <Icon className="h-4 w-4 text-blue-400" />
            </div>
            {trend && trendValue && (
              <div className={`flex items-center gap-0.5 text-xs ${
                trend === 'up' ? 'text-green-400' : trend === 'down' ? 'text-red-400' : 'text-muted-foreground'
              }`}>
                {trend === 'up' ? <ArrowUp className="h-3 w-3" /> : trend === 'down' ? <ArrowDown className="h-3 w-3" /> : null}
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
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{value.toLocaleString()}</span>
      </div>
      <div className="h-2 bg-white/5 rounded-full overflow-hidden">
        <div
          className={`h-full ${colorClasses[color]} rounded-full transition-all duration-500`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
    </div>
  );
}

export default function StatsPage() {
  const [stats, setStats] = useState<DetailedStats | null>(null);
  const [enrichmentStats, setEnrichmentStats] = useState<EnrichmentStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchStats() {
    setLoading(true);
    setError(null);
    try {
      // Fetch both stats in parallel
      const [statsRes, enrichmentRes] = await Promise.all([
        fetch('/api/stats/detailed'),
        fetch('/api/enrichment-stats'),
      ]);

      if (!statsRes.ok) throw new Error('Failed to fetch stats');
      const data = await statsRes.json();
      setStats(data);

      if (enrichmentRes.ok) {
        const enrichmentData = await enrichmentRes.json();
        setEnrichmentStats(enrichmentData.data || enrichmentData);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchStats();

    // Auto-refresh enrichment stats every 30 seconds if enrichment is running
    const interval = setInterval(async () => {
      if (enrichmentStats?.progress?.isRunning) {
        try {
          const res = await fetch('/api/enrichment-stats');
          if (res.ok) {
            const data = await res.json();
            setEnrichmentStats(data.data || data);
          }
        } catch {
          // Ignore refresh errors
        }
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [enrichmentStats?.progress?.isRunning]);

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <Header title="Stats & Analytics" subtitle="Comprehensive performance metrics" />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="flex flex-col h-full">
        <Header title="Stats & Analytics" subtitle="Comprehensive performance metrics" />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-red-400 mb-4">{error || 'Failed to load stats'}</p>
            <button
              onClick={fetchStats}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Get sorted countries and cities
  const topCountries = Object.entries(stats.prospects.byCountry)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const topCities = Object.entries(stats.prospects.byCity)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);

  const propertyTypes = Object.entries(stats.prospects.byPropertyType)
    .sort((a, b) => b[1] - a[1]);

  const sources = Object.entries(stats.prospects.bySource)
    .sort((a, b) => b[1] - a[1]);

  const maxCountry = topCountries[0]?.[1] || 1;
  const maxCity = topCities[0]?.[1] || 1;

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Stats & Analytics"
        subtitle="Comprehensive performance metrics"
      />

      {/* Refresh button outside header */}
      <div className="px-6 pt-4 flex justify-end">
        <button
          onClick={fetchStats}
          className="flex items-center gap-2 px-3 py-1.5 text-xs bg-white/5 hover:bg-white/10 rounded-lg border border-white/10"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="flex-1 p-6 space-y-6 overflow-auto">
        {/* Email Performance Overview */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Conversion Funnel */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-purple-400" />
                Conversion Funnel
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                {[
                  { label: 'Prospects', value: stats.funnel.prospects, color: 'blue' },
                  { label: 'Contacted', value: stats.funnel.contacted, color: 'purple', rate: stats.funnel.contactRate },
                  { label: 'Engaged', value: stats.funnel.engaged, color: 'amber', rate: stats.funnel.engageRate },
                  { label: 'Meeting', value: stats.funnel.meeting, color: 'green', rate: stats.funnel.meetingRate },
                  { label: 'Closed', value: stats.funnel.closed, color: 'green', rate: stats.funnel.closeRate },
                ].map((stage) => (
                  <div key={stage.label} className="flex items-center gap-3">
                    <div className="w-20 text-xs text-muted-foreground">{stage.label}</div>
                    <div className="flex-1">
                      <ProgressBar
                        value={stage.value}
                        max={stats.funnel.prospects}
                        label=""
                        color={stage.color}
                      />
                    </div>
                    <div className="w-16 text-right">
                      <span className="text-sm font-medium">{stage.value}</span>
                      {stage.rate && (
                        <span className="text-xs text-muted-foreground ml-1">({stage.rate}%)</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Lead Quality Distribution */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-4 w-4 text-blue-400" />
                Lead Quality
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="text-center p-4 rounded-lg bg-red-500/10 border border-red-500/20">
                  <p className="text-2xl font-bold text-red-400">{stats.prospects.byLeadQuality.hot || 0}</p>
                  <p className="text-xs text-muted-foreground">Hot</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <p className="text-2xl font-bold text-amber-400">{stats.prospects.byLeadQuality.warm || 0}</p>
                  <p className="text-xs text-muted-foreground">Warm</p>
                </div>
                <div className="text-center p-4 rounded-lg bg-white/5 border border-white/10">
                  <p className="text-2xl font-bold text-muted-foreground">{stats.prospects.byLeadQuality.cold || 0}</p>
                  <p className="text-xs text-muted-foreground">Cold</p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs text-muted-foreground mb-2">By Stage</p>
                {Object.entries(stats.prospects.byStage)
                  .sort((a, b) => b[1] - a[1])
                  .map(([stage, count]) => (
                    <div key={stage} className="flex items-center justify-between text-sm">
                      <span className="capitalize text-muted-foreground">{stage.replace('_', ' ')}</span>
                      <Badge variant="outline">{count}</Badge>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Geographic Distribution */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* By Country */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-green-400" />
                By Country
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {topCountries.map(([country, count]) => (
                <ProgressBar
                  key={country}
                  value={count}
                  max={maxCountry}
                  label={country}
                  color="green"
                />
              ))}
              {topCountries.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No data yet</p>
              )}
            </CardContent>
          </Card>

          {/* By City */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building className="h-4 w-4 text-amber-400" />
                Top Cities
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[400px] overflow-y-auto">
              {topCities.map(([city, count]) => (
                <ProgressBar
                  key={city}
                  value={count}
                  max={maxCity}
                  label={city}
                  color="amber"
                />
              ))}
              {topCities.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No data yet</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Property Types & Sources */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Property Types */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building className="h-4 w-4 text-purple-400" />
                Property Types
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                {propertyTypes.map(([type, count]) => (
                  <div
                    key={type}
                    className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10"
                  >
                    <span className="text-sm capitalize">{type.replace('_', ' ')}</span>
                    <Badge>{count}</Badge>
                  </div>
                ))}
                {propertyTypes.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4 col-span-2">No data yet</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Lead Sources */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-blue-400" />
                Lead Sources
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {sources.map(([source, count]) => (
                <div key={source} className="flex items-center justify-between p-2 rounded-lg bg-white/5">
                  <span className="text-sm">{source}</span>
                  <Badge variant="outline">{count}</Badge>
                </div>
              ))}
              {sources.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No data yet</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Inbox Stats (Warmup Tracking) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Inbox className="h-4 w-4 text-blue-400" />
              Inbox Warmup Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3 mb-6">
              <div className="text-center p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <p className="text-2xl font-bold text-blue-400">{stats.inboxes.count}</p>
                <p className="text-xs text-muted-foreground">Active Inboxes</p>
              </div>
              <div className="text-center p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                <p className="text-2xl font-bold text-green-400">{stats.inboxes.remainingCapacity}</p>
                <p className="text-xs text-muted-foreground">Remaining Today</p>
              </div>
              <div className="text-center p-4 rounded-lg bg-white/5 border border-white/10">
                <p className="text-2xl font-bold">{stats.inboxes.dailyLimit}</p>
                <p className="text-xs text-muted-foreground">Daily Limit/Inbox</p>
              </div>
            </div>

            {stats.inboxes.details.length > 0 ? (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground mb-2">Per-Inbox Usage (Today)</p>
                {stats.inboxes.details.map((inbox) => (
                  <div key={inbox.email} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground font-mono">{inbox.email}</span>
                      <span className="font-medium">{inbox.sent} / {inbox.limit}</span>
                    </div>
                    <div className="h-2 bg-white/5 rounded-full overflow-hidden">
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
              <div className="text-center py-8">
                <p className="text-sm text-muted-foreground mb-2">No SMTP inboxes configured</p>
                <p className="text-xs text-muted-foreground">
                  Add SMTP_INBOX_1 environment variable to enable inbox rotation
                </p>
              </div>
            )}

            {/* Historical sends by inbox */}
            {Object.keys(stats.inboxes.totalSentByInbox).length > 0 && (
              <div className="mt-6 pt-6 border-t border-white/10">
                <p className="text-xs text-muted-foreground mb-3">Total Sent (All Time)</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {Object.entries(stats.inboxes.totalSentByInbox)
                    .sort((a, b) => b[1] - a[1])
                    .map(([email, count]) => (
                      <div key={email} className="flex items-center justify-between p-2 rounded-lg bg-white/5 text-xs">
                        <span className="font-mono truncate mr-2">{email.split('@')[0]}@...</span>
                        <Badge variant="outline">{count}</Badge>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Enrichment Pipeline Stats */}
        {enrichmentStats && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-4 w-4 text-purple-400" />
                Enrichment Pipeline
                {enrichmentStats.progress.isRunning && (
                  <Badge variant="outline" className="ml-auto bg-green-500/10 text-green-400 border-green-500/30">
                    <Activity className="h-3 w-3 mr-1 animate-pulse" />
                    Running
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* API Usage - Google Search */}
              <div>
                <p className="text-xs text-muted-foreground mb-3">API Usage (Today)</p>
                <div className="grid gap-4 md:grid-cols-2">
                  {/* Google API */}
                  <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Search className="h-4 w-4 text-blue-400" />
                        <span className="text-sm font-medium">Google Search</span>
                      </div>
                      <Badge
                        variant="outline"
                        className={
                          enrichmentStats.apiUsage.google.remaining > 50
                            ? 'text-green-400 border-green-500/30'
                            : enrichmentStats.apiUsage.google.remaining > 20
                            ? 'text-amber-400 border-amber-500/30'
                            : 'text-red-400 border-red-500/30'
                        }
                      >
                        {enrichmentStats.apiUsage.google.remaining} left
                      </Badge>
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Daily quota</span>
                        <span>{enrichmentStats.apiUsage.google.usedToday} / {enrichmentStats.apiUsage.google.dailyLimit}</span>
                      </div>
                      <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            enrichmentStats.apiUsage.google.percentUsed >= 100
                              ? 'bg-red-500'
                              : enrichmentStats.apiUsage.google.percentUsed > 80
                              ? 'bg-amber-500'
                              : 'bg-blue-500'
                          }`}
                          style={{ width: `${Math.min(enrichmentStats.apiUsage.google.percentUsed, 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Brave API */}
                  <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Zap className="h-4 w-4 text-orange-400" />
                        <span className="text-sm font-medium">Brave Search</span>
                      </div>
                      <Badge variant="outline" className="text-green-400 border-green-500/30">
                        {enrichmentStats.apiUsage.brave.keysAvailable} keys
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      <p>{enrichmentStats.apiUsage.brave.monthlyLimit.toLocaleString()} searches/month</p>
                      <p className="text-green-400 mt-1">FREE tier (2k/key)</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Pipeline Status */}
              <div>
                <p className="text-xs text-muted-foreground mb-3">Pipeline Status</p>
                <div className="grid gap-3 md:grid-cols-4">
                  <div className="text-center p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                    <p className="text-xl font-bold text-blue-400">{enrichmentStats.pipeline.needsWebsite.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">Need Website</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
                    <p className="text-xl font-bold text-purple-400">{enrichmentStats.pipeline.needsEmail.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">Need Email</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                    <p className="text-xl font-bold text-green-400">{enrichmentStats.pipeline.enriched.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">Enriched</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <p className="text-xl font-bold text-amber-400">{enrichmentStats.pipeline.contacted}</p>
                    <p className="text-xs text-muted-foreground">Contacted</p>
                  </div>
                </div>
              </div>

              {/* Coverage Rates */}
              <div>
                <p className="text-xs text-muted-foreground mb-3">Data Coverage</p>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Website Coverage</span>
                      <span className="font-medium">{enrichmentStats.coverage.websiteRate}%</span>
                    </div>
                    <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-purple-500 rounded-full transition-all duration-500"
                        style={{ width: `${enrichmentStats.coverage.websiteRate}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {enrichmentStats.coverage.withWebsite.toLocaleString()} / {enrichmentStats.coverage.total.toLocaleString()} prospects
                    </p>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Email Coverage</span>
                      <span className="font-medium">{enrichmentStats.coverage.emailRate}%</span>
                    </div>
                    <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-500 rounded-full transition-all duration-500"
                        style={{ width: `${enrichmentStats.coverage.emailRate}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {enrichmentStats.coverage.withEmail.toLocaleString()} / {enrichmentStats.coverage.total.toLocaleString()} prospects
                    </p>
                  </div>
                </div>
              </div>

              {/* Current Progress (if running) */}
              {enrichmentStats.progress.isRunning && (
                <div className="p-4 rounded-lg bg-green-500/5 border border-green-500/20">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-green-400">
                      {enrichmentStats.progress.type === 'auto' ? 'Auto Enrichment' :
                       enrichmentStats.progress.type === 'websites' ? 'Finding Websites' :
                       enrichmentStats.progress.type === 'emails' ? 'Finding Emails' : 'Enriching'}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {enrichmentStats.progress.processed} / {enrichmentStats.progress.total}
                    </span>
                  </div>
                  <div className="h-2 bg-white/5 rounded-full overflow-hidden mb-2">
                    <div
                      className="h-full bg-green-500 rounded-full transition-all duration-300"
                      style={{ width: `${enrichmentStats.progress.total > 0 ? (enrichmentStats.progress.processed / enrichmentStats.progress.total) * 100 : 0}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Found: {enrichmentStats.progress.websitesFound} websites, {enrichmentStats.progress.emailsFound} emails</span>
                    {enrichmentStats.progress.startedAt && (
                      <span>Started: {new Date(enrichmentStats.progress.startedAt).toLocaleTimeString()}</span>
                    )}
                  </div>
                </div>
              )}

              {/* Enrichment Info */}
              <div className="text-xs text-muted-foreground border-t border-white/10 pt-4">
                <p className="font-medium mb-1">Search Strategy (4-tier fallback):</p>
                <ol className="list-decimal list-inside space-y-0.5 text-muted-foreground/70">
                  <li>Grok Direct (FREE) - AI knows ~40% of hotels</li>
                  <li>DuckDuckGo + Grok (FREE) - catches ~50% more</li>
                  <li>Brave + Grok (6k/month) - different index</li>
                  <li>Google + Grok (100/day) - last resort, highest quality</li>
                </ol>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Scraper Performance */}
        {Object.keys(stats.scraping).length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Scraper Performance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="text-left py-2 px-3 text-muted-foreground font-medium">Source</th>
                      <th className="text-right py-2 px-3 text-muted-foreground font-medium">Runs</th>
                      <th className="text-right py-2 px-3 text-muted-foreground font-medium">Found</th>
                      <th className="text-right py-2 px-3 text-muted-foreground font-medium">New</th>
                      <th className="text-right py-2 px-3 text-muted-foreground font-medium">Avg/Run</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(stats.scraping)
                      .sort((a, b) => b[1].new - a[1].new)
                      .map(([source, data]) => (
                        <tr key={source} className="border-b border-white/5">
                          <td className="py-2 px-3">{source}</td>
                          <td className="text-right py-2 px-3">{data.runs}</td>
                          <td className="text-right py-2 px-3">{data.found.toLocaleString()}</td>
                          <td className="text-right py-2 px-3 text-green-400">{data.new.toLocaleString()}</td>
                          <td className="text-right py-2 px-3 text-muted-foreground">
                            {data.runs > 0 ? Math.round(data.new / data.runs) : 0}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Generated timestamp */}
        <p className="text-xs text-muted-foreground text-center">
          Last updated: {new Date(stats.generatedAt).toLocaleString()}
        </p>
      </div>
    </div>
  );
}
