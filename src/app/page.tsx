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
  AlertTriangle,
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
      return <Badge className="bg-zinc-500/20 text-zinc-400 border-zinc-500/30">Cold</Badge>;
  }
}

function formatTimeAgo(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) return `${diffMins} minutes ago`;
  if (diffHours < 24) return `${diffHours} hours ago`;
  if (diffDays < 7) return `${diffDays} days ago`;
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
            iconColor="text-blue-500"
          />
          <StatsCard
            title="Hot Leads"
            value={loading ? '-' : stats?.byTier.hot || 0}
            change={loading ? '' : 'High priority'}
            changeType="positive"
            icon={Flame}
            iconColor="text-red-500"
          />
          <StatsCard
            title="Warm Leads"
            value={loading ? '-' : stats?.byTier.warm || 0}
            change={loading ? '' : 'Following up'}
            changeType="neutral"
            icon={Mail}
            iconColor="text-amber-500"
          />
          <StatsCard
            title="In Pipeline"
            value={loading ? '-' : (stats?.byStage.outreach || 0) + (stats?.byStage.engaged || 0) + (stats?.byStage.meeting || 0) + (stats?.byStage.proposal || 0)}
            change={loading ? '' : 'Active opportunities'}
            changeType="positive"
            icon={TrendingUp}
            iconColor="text-emerald-500"
          />
        </div>

        {/* Content Grid */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Top Prospects */}
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-white">Top Prospects</CardTitle>
              <Link
                href="/prospects"
                className="text-sm text-amber-500 hover:text-amber-400 flex items-center gap-1"
              >
                View all <ArrowRight className="h-4 w-4" />
              </Link>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
                </div>
              ) : topProspects.length > 0 ? (
                <div className="space-y-4">
                  {topProspects.map((prospect) => (
                    <Link
                      key={prospect.id}
                      href={`/prospects/${prospect.id}`}
                      className="flex items-center justify-between p-3 rounded-lg bg-zinc-800/50 hover:bg-zinc-800 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-zinc-700 flex items-center justify-center text-sm font-medium">
                          {prospect.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-medium text-white">{prospect.name}</p>
                          <p className="text-sm text-zinc-400">{prospect.city}{prospect.country ? `, ${prospect.country}` : ''}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {getTierBadge(prospect.tier)}
                        <span className="text-sm font-medium text-zinc-400">
                          {prospect.score || 0}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-zinc-500">
                  <p className="mb-4">No prospects yet</p>
                  <Link
                    href="/scraper"
                    className="text-amber-500 hover:text-amber-400"
                  >
                    Run the scraper to find prospects
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Activity */}
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-white">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
                </div>
              ) : recentActivity.length > 0 ? (
                <div className="space-y-4">
                  {recentActivity.slice(0, 5).map((activity) => (
                    <div key={activity.id} className="flex items-start gap-3">
                      <div className="h-2 w-2 mt-2 rounded-full bg-amber-500" />
                      <div className="flex-1">
                        <p className="text-sm text-white">
                          {activity.title}
                          {activity.prospects?.name && (
                            <span className="font-medium"> - {activity.prospects.name}</span>
                          )}
                        </p>
                        <p className="text-xs text-zinc-500">{formatTimeAgo(activity.created_at)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-zinc-500">
                  <p>No recent activity</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-white">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Link
                href="/scraper"
                className="p-4 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors"
              >
                <h3 className="font-medium text-white">Run Job Scraper</h3>
                <p className="text-sm text-zinc-400 mt-1">
                  Find hotels hiring on job boards
                </p>
              </Link>
              <Link
                href="/review-mining"
                className="p-4 rounded-lg bg-gradient-to-r from-red-500/10 to-orange-500/10 border border-red-500/20 hover:from-red-500/20 hover:to-orange-500/20 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                  <h3 className="font-medium text-white">Review Mining</h3>
                </div>
                <p className="text-sm text-zinc-400 mt-1">
                  Find hotels with communication issues
                </p>
              </Link>
              <Link
                href="/prospects?tier=hot"
                className="p-4 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors"
              >
                <h3 className="font-medium text-white">Review Hot Leads</h3>
                <p className="text-sm text-zinc-400 mt-1">
                  {stats?.byTier.hot || 0} leads ready for outreach
                </p>
              </Link>
              <Link
                href="/pipeline"
                className="p-4 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors"
              >
                <h3 className="font-medium text-white">View Pipeline</h3>
                <p className="text-sm text-zinc-400 mt-1">
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
