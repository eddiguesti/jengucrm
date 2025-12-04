'use client';

import { useState, useEffect } from 'react';
import { Header } from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Mail,
  MessageSquare,
  Calendar,
  TrendingUp,
  Loader2,
  RefreshCw,
  Zap,
  Target,
  Trophy,
  Play,
  Pause,
  ArrowUp,
  Sparkles,
} from 'lucide-react';

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

function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color = 'blue',
}: {
  title: string;
  value: string | number;
  subtitle?: string;
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
    <div className={`p-4 rounded-xl border ${colorClasses[color]}`}>
      <div className="flex items-center gap-3">
        <Icon className={`h-5 w-5 ${colorClasses[color].split(' ')[0]}`} />
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-xs text-muted-foreground">{title}</p>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
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
        return <Target className="h-4 w-4 text-purple-400" />;
      case 'curiosity_value':
        return <Sparkles className="h-4 w-4 text-amber-400" />;
      default:
        return <Zap className="h-4 w-4 text-blue-400" />;
    }
  };

  return (
    <Card className={`relative overflow-hidden ${isLeading ? 'ring-2 ring-green-500/50' : ''}`}>
      {isLeading && (
        <div className="absolute top-0 right-0 bg-green-500 text-white text-xs px-3 py-1 rounded-bl-lg flex items-center gap-1">
          <Trophy className="h-3 w-3" />
          Leading
        </div>
      )}

      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            {getStrategyIcon(campaign.strategy_key)}
            <CardTitle className="text-lg">{campaign.name}</CardTitle>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onToggle(campaign.id, !campaign.active)}
            className={campaign.active ? 'text-green-400 hover:text-green-300' : 'text-muted-foreground'}
          >
            {campaign.active ? (
              <>
                <Play className="h-4 w-4 mr-1 fill-current" />
                Active
              </>
            ) : (
              <>
                <Pause className="h-4 w-4 mr-1" />
                Paused
              </>
            )}
          </Button>
        </div>
        <CardDescription className="text-xs">{campaign.description}</CardDescription>
      </CardHeader>

      <CardContent>
        {/* Key Metrics */}
        <div className="grid grid-cols-4 gap-3 mb-4">
          <div className="text-center p-3 rounded-lg bg-white/5">
            <p className="text-xl font-bold">{campaign.emails_sent}</p>
            <p className="text-xs text-muted-foreground">Sent</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-white/5">
            <p className="text-xl font-bold text-blue-400">{campaign.replies_received}</p>
            <p className="text-xs text-muted-foreground">Replies</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-white/5">
            <p className="text-xl font-bold text-green-400">{campaign.meetings_booked}</p>
            <p className="text-xs text-muted-foreground">Meetings</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-white/5">
            <p className="text-xl font-bold text-amber-400">{campaign.reply_rate}%</p>
            <p className="text-xs text-muted-foreground">Reply Rate</p>
          </div>
        </div>

        {/* Progress Bar - Reply Rate */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Reply Rate</span>
            <span className="font-medium">{campaign.reply_rate}%</span>
          </div>
          <div className="h-2 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-green-500 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(campaign.reply_rate * 5, 100)}%` }}
            />
          </div>
        </div>

        {/* Today's Activity */}
        <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Mail className="h-3 w-3" />
            <span>{campaign.emails_today} / {campaign.daily_limit} today</span>
          </div>
          <Badge variant={campaign.active ? 'default' : 'secondary'} className="text-xs">
            {campaign.strategy_key.replace('_', ' ')}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

export default function CampaignsPage() {
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
      <div className="flex flex-col h-full">
        <Header title="Campaigns" subtitle="A/B test different email strategies" />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col h-full">
        <Header title="Campaigns" subtitle="A/B test different email strategies" />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-red-400 mb-4">{error || 'Failed to load campaigns'}</p>
            <Button onClick={fetchCampaigns}>Retry</Button>
          </div>
        </div>
      </div>
    );
  }

  const { campaigns, summary } = data;
  const leadingCampaignId = campaigns.reduce((best, current) =>
    current.reply_rate > (best?.reply_rate || 0) ? current : best
  , campaigns[0])?.id;

  return (
    <div className="flex flex-col h-full">
      <Header title="Campaigns" subtitle="A/B test different email strategies" />

      {/* Refresh button */}
      <div className="px-6 pt-4 flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={fetchCampaigns}
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="flex-1 p-6 space-y-6 overflow-auto">
        {/* Summary Stats */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <MetricCard
            title="Total Sent"
            value={summary.total_emails_sent}
            icon={Mail}
            color="blue"
          />
          <MetricCard
            title="Total Replies"
            value={summary.total_replies}
            icon={MessageSquare}
            color="green"
          />
          <MetricCard
            title="Meetings Booked"
            value={summary.total_meetings}
            icon={Calendar}
            color="purple"
          />
          <MetricCard
            title="Reply Rate"
            value={`${summary.overall_reply_rate}%`}
            icon={TrendingUp}
            color="amber"
          />
          <MetricCard
            title="Meeting Rate"
            value={`${summary.overall_meeting_rate}%`}
            icon={Target}
            color="red"
          />
        </div>

        {/* Leader Banner */}
        {summary.leading_campaign && summary.total_emails_sent > 10 && (
          <Card className="bg-gradient-to-r from-green-500/10 to-blue-500/10 border-green-500/30">
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Trophy className="h-6 w-6 text-green-400" />
                  <div>
                    <p className="font-medium">Leading Campaign</p>
                    <p className="text-sm text-muted-foreground">
                      <span className="text-green-400 font-medium">{summary.leading_campaign.name}</span> is performing best with a {summary.leading_campaign.reply_rate}% reply rate
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-green-400">
                  <ArrowUp className="h-4 w-4" />
                  <span className="text-lg font-bold">{summary.leading_campaign.reply_rate}%</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Campaign Cards */}
        <div>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-400" />
            Active Campaigns
          </h2>
          <div className="grid gap-6 md:grid-cols-2">
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
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-blue-400" />
                Strategy Comparison
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {campaigns.map((campaign) => {
                  const widthPercent = summary.total_emails_sent > 0
                    ? (campaign.emails_sent / summary.total_emails_sent) * 100
                    : 0;
                  const isLeading = campaign.id === leadingCampaignId;

                  return (
                    <div key={campaign.id} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{campaign.name}</span>
                          {isLeading && summary.total_emails_sent > 10 && (
                            <Badge variant="outline" className="text-green-400 border-green-400/50">
                              <Trophy className="h-3 w-3 mr-1" />
                              Leading
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          <span className="text-muted-foreground">{campaign.emails_sent} sent</span>
                          <span className="text-blue-400">{campaign.replies_received} replies</span>
                          <span className={`font-bold ${isLeading ? 'text-green-400' : ''}`}>
                            {campaign.reply_rate}% rate
                          </span>
                        </div>
                      </div>
                      <div className="h-3 bg-white/5 rounded-full overflow-hidden">
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
            <CardContent className="py-4">
              <div className="flex items-start gap-3">
                <TrendingUp className="h-5 w-5 text-amber-400 mt-0.5" />
                <div>
                  <p className="font-medium text-amber-400">Building Statistical Significance</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    You&apos;ve sent {summary.total_emails_sent} emails so far. We recommend at least 100+ emails per campaign
                    before drawing conclusions about which strategy works best. Keep sending!
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
