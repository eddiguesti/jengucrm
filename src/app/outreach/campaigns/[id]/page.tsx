'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Header } from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  ArrowLeft,
  Play,
  Pause,
  Settings,
  Users,
  Layers,
  Mail,
  Reply,
  TrendingUp,
  Plus,
  Trash2,
  Save,
  Loader2,
  RefreshCw,
  UserPlus,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/contexts/ThemeContext';
import type { CampaignSequence, CampaignLead } from '@/types';

interface CampaignDetail {
  id: string;
  name: string;
  description: string | null;
  strategy_key: string;
  type: 'legacy' | 'sequence';
  active: boolean;
  daily_limit: number;
  emails_sent: number;
  replies_received: number;
  ab_testing_enabled: boolean;
  created_at: string;
  updated_at: string;
}

type TabType = 'sequences' | 'leads' | 'settings';

export default function CampaignDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { theme } = useTheme();
  const isLight = theme === 'light';

  const campaignId = params.id as string;
  const initialTab = (searchParams.get('tab') as TabType) || 'sequences';

  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [sequences, setSequences] = useState<CampaignSequence[]>([]);
  const [leads, setLeads] = useState<CampaignLead[]>([]);
  const [leadStats, setLeadStats] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const [saving, setSaving] = useState(false);

  const fetchCampaign = useCallback(async () => {
    try {
      const res = await fetch(`/api/outreach/campaigns/${campaignId}`);
      const data = await res.json();
      setCampaign(data.campaign);
      setSequences(data.sequences || []);
    } catch (error) {
      console.error('Failed to fetch campaign:', error);
    }
  }, [campaignId]);

  const fetchLeads = useCallback(async () => {
    try {
      const res = await fetch(`/api/outreach/campaigns/${campaignId}/leads`);
      const data = await res.json();
      setLeads(data.leads || []);
      setLeadStats(data.stats || {});
    } catch (error) {
      console.error('Failed to fetch leads:', error);
    }
  }, [campaignId]);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchCampaign(), fetchLeads()]);
      setLoading(false);
    };
    loadData();
  }, [fetchCampaign, fetchLeads]);

  const handleToggleActive = async () => {
    if (!campaign) return;
    try {
      await fetch(`/api/outreach/campaigns/${campaignId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !campaign.active }),
      });
      fetchCampaign();
    } catch (error) {
      console.error('Failed to toggle campaign:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="flex flex-col h-full items-center justify-center">
        <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
        <p>Campaign not found</p>
        <Button variant="outline" className="mt-4" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Go Back
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <Header
        title={campaign.name}
        subtitle={campaign.description || 'Email sequence campaign'}
        action={
          <div className="flex items-center gap-2">
            <Button
              variant={campaign.active ? 'outline' : 'default'}
              size="sm"
              onClick={handleToggleActive}
            >
              {campaign.active ? (
                <>
                  <Pause className="h-4 w-4 mr-2" />
                  Pause
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Activate
                </>
              )}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => router.back()}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </div>
        }
      />

      <div className="flex-1 p-4 md:p-6 overflow-auto">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Status Badge */}
          <div className="flex items-center gap-4">
            <Badge
              className={cn(
                'text-sm',
                campaign.active
                  ? isLight
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-emerald-500/20 text-emerald-400'
                  : isLight
                    ? 'bg-slate-100 text-slate-600'
                    : 'bg-zinc-500/20 text-zinc-400'
              )}
            >
              {campaign.active ? 'Active' : 'Paused'}
            </Badge>
            <Badge
              className={cn(
                'text-sm',
                isLight
                  ? 'bg-violet-100 text-violet-700'
                  : 'bg-violet-500/20 text-violet-400'
              )}
            >
              <Layers className="h-3 w-3 mr-1" />
              {sequences.length} steps
            </Badge>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              icon={Users}
              label="Total Leads"
              value={leadStats.total || 0}
              color="blue"
              isLight={isLight}
            />
            <StatCard
              icon={TrendingUp}
              label="Active"
              value={leadStats.active || 0}
              color="emerald"
              isLight={isLight}
            />
            <StatCard
              icon={Mail}
              label="Emails Sent"
              value={campaign.emails_sent}
              color="violet"
              isLight={isLight}
            />
            <StatCard
              icon={Reply}
              label="Replies"
              value={campaign.replies_received}
              color="amber"
              isLight={isLight}
            />
          </div>

          {/* Tabs */}
          <div className="flex gap-2 border-b pb-2">
            <TabButton
              active={activeTab === 'sequences'}
              onClick={() => setActiveTab('sequences')}
              icon={Layers}
              label="Sequences"
              isLight={isLight}
            />
            <TabButton
              active={activeTab === 'leads'}
              onClick={() => setActiveTab('leads')}
              icon={Users}
              label="Leads"
              count={leadStats.total || 0}
              isLight={isLight}
            />
            <TabButton
              active={activeTab === 'settings'}
              onClick={() => setActiveTab('settings')}
              icon={Settings}
              label="Settings"
              isLight={isLight}
            />
          </div>

          {/* Tab Content */}
          {activeTab === 'sequences' && (
            <SequencesTab
              sequences={sequences}
              campaignId={campaignId}
              isLight={isLight}
              onRefresh={fetchCampaign}
            />
          )}

          {activeTab === 'leads' && (
            <LeadsTab
              leads={leads}
              stats={leadStats}
              campaignId={campaignId}
              isLight={isLight}
              onRefresh={fetchLeads}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsTab
              campaign={campaign}
              isLight={isLight}
              onSave={fetchCampaign}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// Stat Card Component
function StatCard({
  icon: Icon,
  label,
  value,
  color,
  isLight,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
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
    <Card
      className={cn(
        'border',
        isLight ? 'bg-white border-slate-200' : 'bg-zinc-900/50 border-zinc-800'
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <Icon className={cn('h-5 w-5', colorClasses[color])} />
          <div>
            <p className={cn('text-xs', isLight ? 'text-slate-500' : 'text-zinc-500')}>
              {label}
            </p>
            <p
              className={cn(
                'text-lg font-semibold',
                isLight ? 'text-slate-900' : 'text-white'
              )}
            >
              {value.toLocaleString()}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Tab Button Component
function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
  count,
  isLight,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  label: string;
  count?: number;
  isLight: boolean;
}) {
  return (
    <Button
      variant={active ? 'default' : 'ghost'}
      size="sm"
      onClick={onClick}
      className={cn(
        'gap-2',
        active && (isLight ? 'bg-violet-600' : 'bg-violet-500')
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
      {count !== undefined && (
        <span
          className={cn(
            'text-xs px-1.5 py-0.5 rounded-full',
            active
              ? 'bg-white/20'
              : isLight
                ? 'bg-slate-100'
                : 'bg-zinc-800'
          )}
        >
          {count}
        </span>
      )}
    </Button>
  );
}

// Sequences Tab Component
function SequencesTab({
  sequences,
  campaignId,
  isLight,
  onRefresh,
}: {
  sequences: CampaignSequence[];
  campaignId: string;
  isLight: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className={cn('font-medium', isLight ? 'text-slate-900' : 'text-white')}>
          Email Sequence ({sequences.length} steps)
        </h3>
        <Button variant="outline" size="sm" onClick={onRefresh}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {sequences.length === 0 ? (
        <Card
          className={cn(
            'border',
            isLight ? 'bg-white border-slate-200' : 'bg-zinc-900/50 border-zinc-800'
          )}
        >
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Layers
              className={cn('h-12 w-12 mb-4', isLight ? 'text-slate-400' : 'text-zinc-600')}
            />
            <p className={isLight ? 'text-slate-500' : 'text-zinc-400'}>
              No sequence steps yet
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {sequences.map((step, index) => (
            <Card
              key={step.id}
              className={cn(
                'border',
                isLight
                  ? 'bg-white border-slate-200'
                  : 'bg-zinc-900/50 border-zinc-800'
              )}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base">Step {step.step_number}</CardTitle>
                    {index > 0 && (
                      <span
                        className={cn(
                          'flex items-center gap-1 text-xs px-2 py-1 rounded',
                          isLight
                            ? 'bg-slate-100 text-slate-600'
                            : 'bg-zinc-800 text-zinc-400'
                        )}
                      >
                        <Clock className="h-3 w-3" />
                        Wait {step.delay_days}d {step.delay_hours}h
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className={isLight ? 'text-slate-500' : 'text-zinc-500'}>
                      Sent: {step.sent_count || 0}
                    </span>
                    <span className={isLight ? 'text-slate-500' : 'text-zinc-500'}>
                      Opens: {step.open_count || 0}
                    </span>
                    <span className={isLight ? 'text-slate-500' : 'text-zinc-500'}>
                      Replies: {step.reply_count || 0}
                    </span>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div>
                    <span
                      className={cn(
                        'text-xs font-medium',
                        isLight ? 'text-slate-500' : 'text-zinc-500'
                      )}
                    >
                      Subject:
                    </span>
                    <p
                      className={cn(
                        'font-medium',
                        isLight ? 'text-slate-900' : 'text-white'
                      )}
                    >
                      {step.variant_a_subject}
                    </p>
                  </div>
                  <div>
                    <span
                      className={cn(
                        'text-xs font-medium',
                        isLight ? 'text-slate-500' : 'text-zinc-500'
                      )}
                    >
                      Body:
                    </span>
                    <p
                      className={cn(
                        'text-sm whitespace-pre-wrap line-clamp-3',
                        isLight ? 'text-slate-600' : 'text-zinc-400'
                      )}
                    >
                      {step.variant_a_body}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// Leads Tab Component
function LeadsTab({
  leads,
  stats,
  campaignId,
  isLight,
  onRefresh,
}: {
  leads: CampaignLead[];
  stats: Record<string, number>;
  campaignId: string;
  isLight: boolean;
  onRefresh: () => void;
}) {
  const statusColors: Record<string, string> = {
    active: isLight ? 'bg-emerald-100 text-emerald-700' : 'bg-emerald-500/20 text-emerald-400',
    completed: isLight ? 'bg-blue-100 text-blue-700' : 'bg-blue-500/20 text-blue-400',
    replied: isLight ? 'bg-violet-100 text-violet-700' : 'bg-violet-500/20 text-violet-400',
    bounced: isLight ? 'bg-red-100 text-red-700' : 'bg-red-500/20 text-red-400',
    paused: isLight ? 'bg-amber-100 text-amber-700' : 'bg-amber-500/20 text-amber-400',
    unsubscribed: isLight ? 'bg-slate-100 text-slate-600' : 'bg-zinc-500/20 text-zinc-400',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className={cn('font-medium', isLight ? 'text-slate-900' : 'text-white')}>
          Campaign Leads ({stats.total || 0})
        </h3>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <UserPlus className="h-4 w-4 mr-2" />
            Add Leads
          </Button>
          <Button variant="ghost" size="sm" onClick={onRefresh}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Status Summary */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(stats).map(([status, count]) => (
          <Badge key={status} className={statusColors[status] || statusColors.active}>
            {status}: {count}
          </Badge>
        ))}
      </div>

      {leads.length === 0 ? (
        <Card
          className={cn(
            'border',
            isLight ? 'bg-white border-slate-200' : 'bg-zinc-900/50 border-zinc-800'
          )}
        >
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users
              className={cn('h-12 w-12 mb-4', isLight ? 'text-slate-400' : 'text-zinc-600')}
            />
            <p className={isLight ? 'text-slate-500' : 'text-zinc-400'}>
              No leads assigned yet
            </p>
            <Button variant="outline" className="mt-4">
              <UserPlus className="h-4 w-4 mr-2" />
              Add Leads
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {leads.map((lead) => (
            <Card
              key={lead.id}
              className={cn(
                'border',
                isLight
                  ? 'bg-white border-slate-200'
                  : 'bg-zinc-900/50 border-zinc-800'
              )}
            >
              <CardContent className="p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium',
                      isLight ? 'bg-violet-100 text-violet-700' : 'bg-violet-500/20 text-violet-400'
                    )}
                  >
                    {(lead as any).prospect?.name?.charAt(0) || 'P'}
                  </div>
                  <div>
                    <p className={cn('font-medium', isLight ? 'text-slate-900' : 'text-white')}>
                      {(lead as any).prospect?.name || 'Unknown'}
                    </p>
                    <p className={cn('text-xs', isLight ? 'text-slate-500' : 'text-zinc-500')}>
                      Step {lead.current_step} • {lead.emails_sent || 0} emails sent
                    </p>
                  </div>
                </div>
                <Badge className={statusColors[lead.status] || statusColors.active}>
                  {lead.status}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// Settings Tab Component
function SettingsTab({
  campaign,
  isLight,
  onSave,
}: {
  campaign: CampaignDetail;
  isLight: boolean;
  onSave: () => void;
}) {
  const [name, setName] = useState(campaign.name);
  const [description, setDescription] = useState(campaign.description || '');
  const [dailyLimit, setDailyLimit] = useState(campaign.daily_limit);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch(`/api/outreach/campaigns/${campaign.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, daily_limit: dailyLimit }),
      });
      onSave();
    } catch (error) {
      console.error('Failed to save settings:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card
        className={cn(
          'border',
          isLight ? 'bg-white border-slate-200' : 'bg-zinc-900/50 border-zinc-800'
        )}
      >
        <CardHeader>
          <CardTitle className="text-lg">Campaign Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Campaign Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label>Daily Send Limit</Label>
            <Input
              type="number"
              min={1}
              max={500}
              value={dailyLimit}
              onChange={(e) => setDailyLimit(parseInt(e.target.value) || 50)}
            />
          </div>
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card
        className={cn(
          'border border-red-200',
          isLight ? 'bg-red-50' : 'bg-red-900/10 border-red-900/50'
        )}
      >
        <CardHeader>
          <CardTitle className="text-lg text-red-600">Danger Zone</CardTitle>
        </CardHeader>
        <CardContent>
          <p className={cn('text-sm mb-4', isLight ? 'text-slate-600' : 'text-zinc-400')}>
            Deleting this campaign will remove all leads and sequence data.
          </p>
          <Button variant="destructive" size="sm">
            <Trash2 className="h-4 w-4 mr-2" />
            Delete Campaign
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
