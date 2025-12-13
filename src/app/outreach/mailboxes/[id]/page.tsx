'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  ArrowLeft,
  Mail,
  Loader2,
  CheckCircle,
  XCircle,
  Flame,
  Activity,
  Send,
  AlertTriangle,
  Play,
  Pause,
  TestTube,
  Save,
  TrendingUp,
  TrendingDown,
  Calendar,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useTheme } from '@/contexts/ThemeContext';
import type { Mailbox, MailboxDailyStats, MailboxStatus } from '@/types';

interface MailboxDetailResponse {
  mailbox: Mailbox;
  dailyStats: MailboxDailyStats[];
}

export default function MailboxDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { theme } = useTheme();
  const isLight = theme === 'light';

  const [mailbox, setMailbox] = useState<Mailbox | null>(null);
  const [dailyStats, setDailyStats] = useState<MailboxDailyStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState<Partial<Mailbox>>({});

  const fetchMailbox = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/outreach/mailboxes/${id}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data: MailboxDetailResponse = await res.json();
      setMailbox(data.mailbox);
      setDailyStats(data.dailyStats || []);
      setFormData(data.mailbox);
    } catch (error) {
      console.error('Failed to fetch mailbox:', error);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchMailbox();
  }, [fetchMailbox]);

  const handleStatusChange = async (status: MailboxStatus) => {
    try {
      await fetch(`/api/outreach/mailboxes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      fetchMailbox();
    } catch (error) {
      console.error('Failed to update status:', error);
    }
  };

  const handleTestConnection = async (type: 'smtp' | 'imap') => {
    setTesting(true);
    try {
      const res = await fetch(`/api/outreach/mailboxes/${id}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      });
      const data = await res.json();
      alert(data.success ? `${type.toUpperCase()} connection successful!` : `Connection failed: ${data.error || data.message}`);
      fetchMailbox();
    } catch (error) {
      console.error('Failed to test connection:', error);
      alert('Failed to test connection');
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/outreach/mailboxes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (!res.ok) throw new Error('Failed to save');
      await fetchMailbox();
      setEditMode(false);
    } catch (error) {
      console.error('Failed to save:', error);
      alert('Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
      </div>
    );
  }

  if (!mailbox) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <p className={isLight ? "text-slate-600" : "text-zinc-400"}>Mailbox not found</p>
        <Link href="/outreach/mailboxes">
          <Button variant="ghost" className="mt-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Mailboxes
          </Button>
        </Link>
      </div>
    );
  }

  const statusColors: Record<MailboxStatus, string> = {
    active: isLight ? 'bg-emerald-100 text-emerald-700' : 'bg-emerald-500/20 text-emerald-400',
    warming: isLight ? 'bg-amber-100 text-amber-700' : 'bg-amber-500/20 text-amber-400',
    paused: isLight ? 'bg-slate-100 text-slate-600' : 'bg-zinc-500/20 text-zinc-400',
    error: isLight ? 'bg-red-100 text-red-700' : 'bg-red-500/20 text-red-400',
  };

  const healthColor = mailbox.health_score >= 80
    ? (isLight ? 'text-emerald-600' : 'text-emerald-400')
    : mailbox.health_score >= 50
    ? (isLight ? 'text-amber-600' : 'text-amber-400')
    : (isLight ? 'text-red-600' : 'text-red-400');

  return (
    <div className="flex flex-col h-full">
      <Header
        title={mailbox.email}
        subtitle={mailbox.display_name || 'Email Account Details'}
        action={
          <div className="flex items-center gap-2">
            {mailbox.status === 'paused' ? (
              <Button size="sm" onClick={() => handleStatusChange('active')}>
                <Play className="h-4 w-4 mr-2" />
                Resume
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => handleStatusChange('paused')}>
                <Pause className="h-4 w-4 mr-2" />
                Pause
              </Button>
            )}
          </div>
        }
      />

      <div className="flex-1 p-4 md:p-6 overflow-auto">
        {/* Back Link */}
        <Link href="/outreach/mailboxes" className={cn(
          "inline-flex items-center gap-1 text-sm mb-4 hover:underline",
          isLight ? "text-slate-600" : "text-zinc-400"
        )}>
          <ArrowLeft className="h-4 w-4" />
          Back to Mailboxes
        </Link>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Status & Health */}
            <Card className={cn(
              "border",
              isLight ? "bg-white border-slate-200" : "bg-zinc-900/50 border-zinc-800"
            )}>
              <CardHeader>
                <CardTitle className={cn(
                  "text-lg",
                  isLight ? "text-slate-900" : "text-white"
                )}>
                  Status & Health
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className={cn("text-xs mb-1", isLight ? "text-slate-500" : "text-zinc-500")}>
                      Status
                    </p>
                    <Badge className={statusColors[mailbox.status]}>
                      {mailbox.status}
                    </Badge>
                  </div>
                  <div>
                    <p className={cn("text-xs mb-1", isLight ? "text-slate-500" : "text-zinc-500")}>
                      Health Score
                    </p>
                    <p className={cn("text-2xl font-bold", healthColor)}>
                      {mailbox.health_score}%
                    </p>
                  </div>
                  <div>
                    <p className={cn("text-xs mb-1", isLight ? "text-slate-500" : "text-zinc-500")}>
                      Warmup Stage
                    </p>
                    <div className="flex items-center gap-1">
                      <Flame className="h-4 w-4 text-amber-500" />
                      <span className={cn(
                        "text-lg font-semibold",
                        isLight ? "text-slate-900" : "text-white"
                      )}>
                        {mailbox.warmup_stage}/5
                      </span>
                    </div>
                  </div>
                  <div>
                    <p className={cn("text-xs mb-1", isLight ? "text-slate-500" : "text-zinc-500")}>
                      Daily Limit
                    </p>
                    <p className={cn(
                      "text-lg font-semibold",
                      isLight ? "text-slate-900" : "text-white"
                    )}>
                      {mailbox.daily_limit} emails
                    </p>
                  </div>
                </div>

                {/* Progress Bars */}
                <div className="mt-6 space-y-4">
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className={cn("text-sm", isLight ? "text-slate-600" : "text-zinc-400")}>
                        Warmup Progress
                      </span>
                      <span className={cn("text-sm", isLight ? "text-slate-600" : "text-zinc-400")}>
                        {((mailbox.warmup_stage / 5) * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className={cn(
                      "h-2 rounded-full overflow-hidden",
                      isLight ? "bg-slate-100" : "bg-zinc-800"
                    )}>
                      <div
                        className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full"
                        style={{ width: `${(mailbox.warmup_stage / 5) * 100}%` }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between mb-1">
	                      <span className={cn("text-sm", isLight ? "text-slate-600" : "text-zinc-400")}>
	                        Today&apos;s Sends
	                      </span>
                      <span className={cn("text-sm", isLight ? "text-slate-600" : "text-zinc-400")}>
                        {mailbox.sent_today}/{mailbox.daily_limit}
                      </span>
                    </div>
                    <div className={cn(
                      "h-2 rounded-full overflow-hidden",
                      isLight ? "bg-slate-100" : "bg-zinc-800"
                    )}>
                      <div
                        className="h-full bg-gradient-to-r from-violet-500 to-purple-500 rounded-full"
                        style={{ width: `${Math.min((mailbox.sent_today / mailbox.daily_limit) * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Error */}
                {mailbox.last_error && (
                  <div className={cn(
                    "mt-4 p-3 rounded-lg",
                    isLight
                      ? "bg-red-50 border border-red-200"
                      : "bg-red-500/10 border border-red-500/20"
                  )}>
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className={cn(
                          "text-sm font-medium",
                          isLight ? "text-red-700" : "text-red-400"
                        )}>
                          Last Error
                        </p>
                        <p className={cn(
                          "text-sm mt-1",
                          isLight ? "text-red-600" : "text-red-400/80"
                        )}>
                          {mailbox.last_error}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Statistics */}
            <Card className={cn(
              "border",
              isLight ? "bg-white border-slate-200" : "bg-zinc-900/50 border-zinc-800"
            )}>
              <CardHeader>
                <CardTitle className={cn(
                  "text-lg",
                  isLight ? "text-slate-900" : "text-white"
                )}>
                  Lifetime Statistics
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  <StatItem
                    label="Total Sent"
                    value={mailbox.total_sent.toLocaleString()}
                    icon={Send}
                    color="violet"
                    isLight={isLight}
                  />
                  <StatItem
                    label="Total Opens"
                    value={mailbox.total_opens.toLocaleString()}
                    icon={Mail}
                    color="blue"
                    isLight={isLight}
                    rate={mailbox.open_rate}
                  />
                  <StatItem
                    label="Total Replies"
                    value={mailbox.total_replies.toLocaleString()}
                    icon={TrendingUp}
                    color="emerald"
                    isLight={isLight}
                    rate={mailbox.reply_rate}
                  />
                  <StatItem
                    label="Total Bounces"
                    value={mailbox.total_bounces.toLocaleString()}
                    icon={TrendingDown}
                    color="red"
                    isLight={isLight}
                    rate={mailbox.bounce_rate}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Daily Stats Chart (Simplified) */}
            {dailyStats.length > 0 && (
              <Card className={cn(
                "border",
                isLight ? "bg-white border-slate-200" : "bg-zinc-900/50 border-zinc-800"
              )}>
                <CardHeader>
                  <CardTitle className={cn(
                    "text-lg",
                    isLight ? "text-slate-900" : "text-white"
                  )}>
                    Recent Activity (Last 30 Days)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {dailyStats.slice(0, 14).map((stat) => (
                      <div
                        key={stat.id}
                        className={cn(
                          "flex items-center justify-between p-2 rounded",
                          isLight ? "hover:bg-slate-50" : "hover:bg-zinc-800/50"
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <Calendar className={cn(
                            "h-4 w-4",
                            isLight ? "text-slate-400" : "text-zinc-500"
                          )} />
                          <span className={cn(
                            "text-sm",
                            isLight ? "text-slate-600" : "text-zinc-400"
                          )}>
                            {new Date(stat.date).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          <span className={isLight ? "text-slate-600" : "text-zinc-400"}>
                            {stat.sent} sent
                          </span>
                          <span className="text-emerald-500">
                            {stat.replies} replies
                          </span>
                          <span className="text-red-500">
                            {stat.bounces} bounces
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Connection Status */}
            <Card className={cn(
              "border",
              isLight ? "bg-white border-slate-200" : "bg-zinc-900/50 border-zinc-800"
            )}>
              <CardHeader>
                <CardTitle className={cn(
                  "text-lg",
                  isLight ? "text-slate-900" : "text-white"
                )}>
                  Connection Status
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {mailbox.smtp_verified ? (
                      <CheckCircle className="h-5 w-5 text-emerald-500" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-500" />
                    )}
                    <span className={isLight ? "text-slate-700" : "text-zinc-300"}>
                      SMTP
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleTestConnection('smtp')}
                    disabled={testing}
                  >
                    {testing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <TestTube className="h-4 w-4" />
                    )}
                  </Button>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {mailbox.imap_verified ? (
                      <CheckCircle className="h-5 w-5 text-emerald-500" />
                    ) : mailbox.imap_host ? (
                      <XCircle className="h-5 w-5 text-red-500" />
                    ) : (
                      <XCircle className="h-5 w-5 text-zinc-500" />
                    )}
                    <span className={isLight ? "text-slate-700" : "text-zinc-300"}>
                      IMAP
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleTestConnection('imap')}
                    disabled={testing || !mailbox.imap_host}
                  >
                    {testing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <TestTube className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Settings */}
            <Card className={cn(
              "border",
              isLight ? "bg-white border-slate-200" : "bg-zinc-900/50 border-zinc-800"
            )}>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className={cn(
                  "text-lg",
                  isLight ? "text-slate-900" : "text-white"
                )}>
                  Settings
                </CardTitle>
                {!editMode ? (
                  <Button size="sm" variant="ghost" onClick={() => setEditMode(true)}>
                    Edit
                  </Button>
                ) : (
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setEditMode(false)}>
                      Cancel
                    </Button>
                    <Button size="sm" onClick={handleSave} disabled={saving}>
                      {saving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Display Name</Label>
                  <Input
                    value={formData.display_name || ''}
                    onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                    disabled={!editMode}
                    className={cn(
                      "mt-1",
                      isLight ? "bg-white" : "bg-zinc-800"
                    )}
                  />
                </div>

                <div>
                  <Label>Daily Limit</Label>
                  <Input
                    type="number"
                    value={formData.daily_limit || mailbox.daily_limit}
                    onChange={(e) => setFormData({ ...formData, daily_limit: parseInt(e.target.value) })}
                    disabled={!editMode}
                    className={cn(
                      "mt-1",
                      isLight ? "bg-white" : "bg-zinc-800"
                    )}
                  />
                </div>

                <div>
                  <Label>Target Emails/Day</Label>
                  <Input
                    type="number"
                    value={formData.warmup_target_per_day || mailbox.warmup_target_per_day}
                    onChange={(e) => setFormData({ ...formData, warmup_target_per_day: parseInt(e.target.value) })}
                    disabled={!editMode}
                    className={cn(
                      "mt-1",
                      isLight ? "bg-white" : "bg-zinc-800"
                    )}
                  />
                  <p className={cn(
                    "text-xs mt-1",
                    isLight ? "text-slate-500" : "text-zinc-500"
                  )}>
                    Maximum after warmup completes
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="warmup"
                    checked={formData.warmup_enabled ?? mailbox.warmup_enabled}
                    onChange={(e) => setFormData({ ...formData, warmup_enabled: e.target.checked })}
                    disabled={!editMode}
                    className="rounded"
                  />
                  <Label htmlFor="warmup" className="cursor-pointer">
                    Warmup Enabled
                  </Label>
                </div>
              </CardContent>
            </Card>

            {/* Info */}
            <Card className={cn(
              "border",
              isLight ? "bg-white border-slate-200" : "bg-zinc-900/50 border-zinc-800"
            )}>
              <CardHeader>
                <CardTitle className={cn(
                  "text-lg",
                  isLight ? "text-slate-900" : "text-white"
                )}>
                  Account Info
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className={isLight ? "text-slate-500" : "text-zinc-500"}>
                    Created
                  </span>
                  <span className={isLight ? "text-slate-700" : "text-zinc-300"}>
                    {new Date(mailbox.created_at).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className={isLight ? "text-slate-500" : "text-zinc-500"}>
                    Warmup Started
                  </span>
                  <span className={isLight ? "text-slate-700" : "text-zinc-300"}>
                    {new Date(mailbox.warmup_start_date).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className={isLight ? "text-slate-500" : "text-zinc-500"}>
                    Last Used
                  </span>
                  <span className={isLight ? "text-slate-700" : "text-zinc-300"}>
                    {mailbox.last_used_at
                      ? new Date(mailbox.last_used_at).toLocaleString()
                      : 'Never'
                    }
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className={isLight ? "text-slate-500" : "text-zinc-500"}>
                    SMTP Host
                  </span>
                  <span className={isLight ? "text-slate-700" : "text-zinc-300"}>
                    {mailbox.smtp_host}:{mailbox.smtp_port}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatItem({
  label,
  value,
  icon: Icon,
  color,
  rate,
  isLight,
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  color: string;
  rate?: number;
  isLight: boolean;
}) {
  const colorClasses: Record<string, string> = {
    violet: isLight ? 'text-violet-600' : 'text-violet-400',
    blue: isLight ? 'text-blue-600' : 'text-blue-400',
    emerald: isLight ? 'text-emerald-600' : 'text-emerald-400',
    red: isLight ? 'text-red-600' : 'text-red-400',
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <Icon className={cn("h-4 w-4", colorClasses[color])} />
        <span className={cn("text-xs", isLight ? "text-slate-500" : "text-zinc-500")}>
          {label}
        </span>
      </div>
      <p className={cn(
        "text-2xl font-bold",
        isLight ? "text-slate-900" : "text-white"
      )}>
        {value}
      </p>
      {rate !== undefined && (
        <p className={cn("text-xs", colorClasses[color])}>
          {rate.toFixed(1)}%
        </p>
      )}
    </div>
  );
}
