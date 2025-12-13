'use client';

import { useState, useEffect, useCallback } from 'react';
import { Header } from '@/components/layout/header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Target,
  Plus,
  RefreshCw,
  Loader2,
  MoreVertical,
  Play,
  Pause,
  Trash2,
  Users,
  Mail,
  Reply,
  TrendingUp,
  Eye,
  Copy,
  Settings,
  Layers,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useTheme } from '@/contexts/ThemeContext';
import type { CampaignSequence } from '@/types';

interface CampaignWithStats {
  id: string;
  name: string;
  description: string | null;
  strategy_key: string;
  type: 'legacy' | 'sequence';
  active: boolean;
  daily_limit: number;
  emails_sent: number;
  replies_received: number;
  open_rate: number;
  reply_rate: number;
  sequence_count: number;
  sequences: CampaignSequence[];
  lead_stats: {
    total: number;
    active: number;
    completed: number;
    replied: number;
    bounced: number;
  };
  created_at: string;
}

interface CampaignSummary {
  total: number;
  active: number;
  sequence: number;
  legacy: number;
  totalLeads: number;
  activeLeads: number;
}

export default function CampaignsPage() {
  const { theme } = useTheme();
  const isLight = theme === 'light';

  const [campaigns, setCampaigns] = useState<CampaignWithStats[]>([]);
  const [summary, setSummary] = useState<CampaignSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/outreach/campaigns');
      const data = await res.json();
      setCampaigns(data.campaigns || []);
      setSummary(data.summary || null);
    } catch (error) {
      console.error('Failed to fetch campaigns:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  const handleToggleActive = async (id: string, currentActive: boolean) => {
    try {
      await fetch(`/api/outreach/campaigns/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !currentActive }),
      });
      fetchCampaigns();
    } catch (error) {
      console.error('Failed to toggle campaign:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this campaign? This will also remove all leads from it.')) return;

    try {
      await fetch(`/api/outreach/campaigns/${id}`, { method: 'DELETE' });
      fetchCampaigns();
    } catch (error) {
      console.error('Failed to delete campaign:', error);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Campaigns"
        subtitle="Create and manage email sequences"
        action={
          <Link href="/outreach/campaigns/new">
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              New Campaign
            </Button>
          </Link>
        }
      />

      <div className="flex-1 p-4 md:p-6 overflow-auto">
        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <SummaryCard
              label="Total Campaigns"
              value={summary.total}
              icon={Target}
              color="violet"
              isLight={isLight}
            />
            <SummaryCard
              label="Active"
              value={summary.active}
              icon={Play}
              color="emerald"
              isLight={isLight}
            />
            <SummaryCard
              label="Total Leads"
              value={summary.totalLeads}
              icon={Users}
              color="blue"
              isLight={isLight}
            />
            <SummaryCard
              label="Active Leads"
              value={summary.activeLeads}
              icon={TrendingUp}
              color="amber"
              isLight={isLight}
            />
          </div>
        )}

        {/* Campaigns List */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className={cn(
              "text-lg font-semibold",
              isLight ? "text-slate-900" : "text-white"
            )}>
              All Campaigns
            </h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchCampaigns}
              disabled={loading}
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            </Button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
            </div>
          ) : campaigns.length === 0 ? (
            <Card className={cn(
              "border",
              isLight
                ? "bg-white border-slate-200"
                : "bg-zinc-900/50 border-zinc-800"
            )}>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Target className={cn(
                  "h-12 w-12 mb-4",
                  isLight ? "text-slate-400" : "text-zinc-600"
                )} />
                <h3 className={cn(
                  "text-lg font-medium mb-2",
                  isLight ? "text-slate-900" : "text-white"
                )}>
                  No campaigns yet
                </h3>
                <p className={cn(
                  "text-sm mb-4 text-center",
                  isLight ? "text-slate-500" : "text-zinc-400"
                )}>
                  Create your first email sequence campaign
                </p>
                <Link href="/outreach/campaigns/new">
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Campaign
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {campaigns.map((campaign) => (
                <CampaignCard
                  key={campaign.id}
                  campaign={campaign}
                  isLight={isLight}
                  onToggleActive={handleToggleActive}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  color,
  isLight,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  color: string;
  isLight: boolean;
}) {
  const colorClasses: Record<string, string> = {
    violet: isLight ? 'text-violet-600' : 'text-violet-400',
    emerald: isLight ? 'text-emerald-600' : 'text-emerald-400',
    blue: isLight ? 'text-blue-600' : 'text-blue-400',
    amber: isLight ? 'text-amber-600' : 'text-amber-400',
  };

  return (
    <Card className={cn(
      "border",
      isLight
        ? "bg-white border-slate-200"
        : "bg-zinc-900/50 border-zinc-800"
    )}>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <Icon className={cn("h-5 w-5", colorClasses[color])} />
          <div>
            <p className={cn("text-xs", isLight ? "text-slate-500" : "text-zinc-500")}>
              {label}
            </p>
            <p className={cn(
              "text-lg font-semibold",
              isLight ? "text-slate-900" : "text-white"
            )}>
              {value}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CampaignCard({
  campaign,
  isLight,
  onToggleActive,
  onDelete,
}: {
  campaign: CampaignWithStats;
  isLight: boolean;
  onToggleActive: (id: string, active: boolean) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <Card className={cn(
      "border overflow-hidden",
      isLight
        ? "bg-white border-slate-200 hover:border-violet-300"
        : "bg-zinc-900/50 border-zinc-800 hover:border-violet-500/50"
    )}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          {/* Left: Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Target className={cn(
                "h-4 w-4 flex-shrink-0",
                isLight ? "text-violet-500" : "text-violet-400"
              )} />
              <Link
                href={`/outreach/campaigns/${campaign.id}`}
                className={cn(
                  "font-medium hover:underline truncate",
                  isLight ? "text-slate-900" : "text-white"
                )}
              >
                {campaign.name}
              </Link>
              <Badge className={cn(
                "text-xs",
                campaign.active
                  ? isLight
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-emerald-500/20 text-emerald-400"
                  : isLight
                    ? "bg-slate-100 text-slate-600"
                    : "bg-zinc-500/20 text-zinc-400"
              )}>
                {campaign.active ? 'Active' : 'Paused'}
              </Badge>
              {campaign.type === 'sequence' && (
                <Badge className={cn(
                  "text-xs",
                  isLight
                    ? "bg-violet-100 text-violet-700"
                    : "bg-violet-500/20 text-violet-400"
                )}>
                  <Layers className="h-3 w-3 mr-1" />
                  {campaign.sequence_count} steps
                </Badge>
              )}
            </div>

            {campaign.description && (
              <p className={cn(
                "text-sm mb-3 line-clamp-1",
                isLight ? "text-slate-500" : "text-zinc-400"
              )}>
                {campaign.description}
              </p>
            )}

            {/* Stats Row */}
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1">
                <Users className={cn(
                  "h-4 w-4",
                  isLight ? "text-slate-400" : "text-zinc-500"
                )} />
                <span className={isLight ? "text-slate-600" : "text-zinc-400"}>
                  {campaign.lead_stats.total} leads
                </span>
                {campaign.lead_stats.active > 0 && (
                  <span className="text-emerald-500">
                    ({campaign.lead_stats.active} active)
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1">
                <Mail className={cn(
                  "h-4 w-4",
                  isLight ? "text-slate-400" : "text-zinc-500"
                )} />
                <span className={isLight ? "text-slate-600" : "text-zinc-400"}>
                  {campaign.emails_sent.toLocaleString()} sent
                </span>
              </div>

              <div className="flex items-center gap-1">
                <Reply className={cn(
                  "h-4 w-4",
                  isLight ? "text-slate-400" : "text-zinc-500"
                )} />
                <span className={isLight ? "text-slate-600" : "text-zinc-400"}>
                  {campaign.replies_received} replies
                </span>
                {campaign.reply_rate > 0 && (
                  <span className="text-emerald-500">
                    ({campaign.reply_rate.toFixed(1)}%)
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2 ml-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onToggleActive(campaign.id, campaign.active)}
            >
              {campaign.active ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4" />
              )}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link href={`/outreach/campaigns/${campaign.id}`}>
                    <Eye className="h-4 w-4 mr-2" />
                    View Details
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href={`/outreach/campaigns/${campaign.id}?tab=leads`}>
                    <Users className="h-4 w-4 mr-2" />
                    Manage Leads
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href={`/outreach/campaigns/${campaign.id}?tab=settings`}>
                    <Settings className="h-4 w-4 mr-2" />
                    Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <Copy className="h-4 w-4 mr-2" />
                  Duplicate
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-red-600"
                  onClick={() => onDelete(campaign.id)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Sequence Preview */}
        {campaign.sequences && campaign.sequences.length > 0 && (
          <div className={cn(
            "mt-4 pt-4 border-t",
            isLight ? "border-slate-100" : "border-zinc-800"
          )}>
            <div className="flex items-center gap-2 overflow-x-auto pb-2">
              {campaign.sequences.map((seq, i) => (
                <div
                  key={seq.id}
                  className={cn(
                    "flex-shrink-0 px-3 py-2 rounded-lg text-xs",
                    isLight
                      ? "bg-slate-50 border border-slate-200"
                      : "bg-zinc-800 border border-zinc-700"
                  )}
                >
                  <div className={cn(
                    "font-medium mb-1",
                    isLight ? "text-slate-700" : "text-zinc-300"
                  )}>
                    Step {seq.step_number}
                  </div>
                  <div className={cn(
                    "truncate max-w-[150px]",
                    isLight ? "text-slate-500" : "text-zinc-500"
                  )}>
                    {seq.variant_a_subject}
                  </div>
                  {i < campaign.sequences.length - 1 && (
                    <div className={cn(
                      "mt-1",
                      isLight ? "text-slate-400" : "text-zinc-600"
                    )}>
                      Wait {seq.delay_days}d {seq.delay_hours}h →
                    </div>
                  )}
                </div>
              ))}
              {campaign.sequence_count > campaign.sequences.length && (
                <div className={cn(
                  "text-xs",
                  isLight ? "text-slate-400" : "text-zinc-500"
                )}>
                  +{campaign.sequence_count - campaign.sequences.length} more
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
