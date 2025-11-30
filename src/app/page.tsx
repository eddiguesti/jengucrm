'use client';

import { useState, useEffect } from 'react';
import { Header } from '@/components/layout/header';
import { StatsCard } from '@/components/stats-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Users,
  Flame,
  Mail,
  TrendingUp,
  ArrowRight,
  Loader2,
  Star,
  Search,
  Kanban,
} from 'lucide-react';
import Link from 'next/link';
import type { Prospect } from '@/types';

interface Stats {
  total: number;
  byTier: { hot: number; warm: number; cold: number };
  byStage: Record<string, number>;
  painLeads?: number;
  painSignals?: number;
}

interface Activity {
  id: string;
  type: string;
  title: string;
  created_at: string;
  prospects?: { name: string };
}

function getTierBadge(tier: string) {
  switch (tier) {
    case 'hot':
      return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Hot</Badge>;
    case 'warm':
      return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">Warm</Badge>;
    default:
      return <Badge className="bg-white/10 text-white/60 border-white/20">Cold</Badge>;
  }
}

function formatTimeAgo(dateString: string) {
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

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [topProspects, setTopProspects] = useState<Prospect[]>([]);
  const [recentActivity, setRecentActivity] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        // Fetch stats
        const statsRes = await fetch('/api/stats');
        if (statsRes.ok) {
          const statsData = await statsRes.json();
          setStats(statsData);
        }

        // Fetch top prospects
        const prospectsRes = await fetch('/api/prospects?limit=5');
        if (prospectsRes.ok) {
          const prospectsData = await prospectsRes.json();
          setTopProspects(prospectsData.prospects || []);
        }

        // Fetch recent activity
        const activityRes = await fetch('/api/activities');
        if (activityRes.ok) {
          const activityData = await activityRes.json();
          setRecentActivity(activityData.activities || []);
        }
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Dashboard"
        subtitle="Welcome back! Here's your pipeline overview."
      />

      <div className="flex-1 p-6 space-y-6 overflow-auto">
        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatsCard
            title="Total Prospects"
            value={loading ? '-' : stats?.total || 0}
            change={loading ? '' : `${stats?.byTier.hot || 0} hot leads`}
            changeType="neutral"
            icon={Users}
            iconColor="text-blue-400"
          />
          <StatsCard
            title="Hot Leads"
            value={loading ? '-' : stats?.byTier.hot || 0}
            change={loading ? '' : 'High priority'}
            changeType="positive"
            icon={Flame}
            iconColor="text-red-400"
          />
          <StatsCard
            title="Warm Leads"
            value={loading ? '-' : stats?.byTier.warm || 0}
            change={loading ? '' : 'Following up'}
            changeType="neutral"
            icon={Mail}
            iconColor="text-amber-400"
          />
          <StatsCard
            title="In Pipeline"
            value={loading ? '-' : (stats?.byStage.outreach || 0) + (stats?.byStage.engaged || 0) + (stats?.byStage.meeting || 0) + (stats?.byStage.proposal || 0)}
            change={loading ? '' : 'Active opportunities'}
            changeType="positive"
            icon={TrendingUp}
            iconColor="text-emerald-400"
          />
        </div>

        {/* Content Grid */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Top Prospects */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Top Prospects</CardTitle>
              <Link
                href="/prospects"
                className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 macos-transition"
              >
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
                </div>
              ) : topProspects.length > 0 ? (
                <div className="space-y-2">
                  {topProspects.map((prospect) => (
                    <Link
                      key={prospect.id}
                      href={`/prospects/${prospect.id}`}
                      className="flex items-center justify-between p-3 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] border border-transparent hover:border-white/[0.08] macos-transition"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-white/10 flex items-center justify-center text-xs font-medium text-white/80">
                          {prospect.name.charAt(0)}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">{prospect.name}</p>
                          <p className="text-xs text-muted-foreground">{prospect.city}{prospect.country ? `, ${prospect.country}` : ''}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {getTierBadge(prospect.tier)}
                        <span className="text-xs font-medium text-muted-foreground">
                          {prospect.score || 0}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-sm text-muted-foreground mb-3">No prospects yet</p>
                  <Link
                    href="/scraper"
                    className="text-xs text-blue-400 hover:text-blue-300 macos-transition"
                  >
                    Run the scraper to find prospects
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
                </div>
              ) : recentActivity.length > 0 ? (
                <div className="space-y-3">
                  {recentActivity.slice(0, 5).map((activity) => (
                    <div key={activity.id} className="flex items-start gap-3">
                      <div className="h-1.5 w-1.5 mt-2 rounded-full bg-blue-400" />
                      <div className="flex-1">
                        <p className="text-sm text-foreground/90">
                          {activity.title}
                          {activity.prospects?.name && (
                            <span className="font-medium text-foreground"> - {activity.prospects.name}</span>
                          )}
                        </p>
                        <p className="text-[11px] text-muted-foreground">{formatTimeAgo(activity.created_at)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-sm text-muted-foreground">No recent activity</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <Link
                href="/scraper"
                className="group p-4 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] hover:border-white/[0.12] macos-transition"
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 rounded-lg bg-blue-500/10">
                    <Search className="h-3.5 w-3.5 text-blue-400" />
                  </div>
                  <h3 className="text-sm font-medium text-foreground">Run Job Scraper</h3>
                </div>
                <p className="text-xs text-muted-foreground">
                  Find hotels hiring on 10 job boards
                </p>
              </Link>
              <Link
                href="/review-mining"
                className="group p-4 rounded-xl bg-gradient-to-br from-orange-500/5 to-red-500/5 border border-orange-500/10 hover:border-orange-500/20 macos-transition"
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 rounded-lg bg-orange-500/10">
                    <Star className="h-3.5 w-3.5 text-orange-400" />
                  </div>
                  <h3 className="text-sm font-medium text-foreground">Review Mining</h3>
                </div>
                <p className="text-xs text-muted-foreground">
                  Find hotels with communication issues
                </p>
              </Link>
              <Link
                href="/prospects?tier=hot"
                className="group p-4 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] hover:border-white/[0.12] macos-transition"
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 rounded-lg bg-red-500/10">
                    <Flame className="h-3.5 w-3.5 text-red-400" />
                  </div>
                  <h3 className="text-sm font-medium text-foreground">Review Hot Leads</h3>
                </div>
                <p className="text-xs text-muted-foreground">
                  {stats?.byTier.hot || 0} leads ready for outreach
                </p>
              </Link>
              <Link
                href="/pipeline"
                className="group p-4 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] hover:border-white/[0.12] macos-transition"
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 rounded-lg bg-purple-500/10">
                    <Kanban className="h-3.5 w-3.5 text-purple-400" />
                  </div>
                  <h3 className="text-sm font-medium text-foreground">View Pipeline</h3>
                </div>
                <p className="text-xs text-muted-foreground">
                  Track your sales pipeline
                </p>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
