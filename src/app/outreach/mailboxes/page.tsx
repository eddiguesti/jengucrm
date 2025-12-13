'use client';

import { useState, useEffect, useCallback } from 'react';
import { Header } from '@/components/layout/header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  MailPlus,
  Plus,
  RefreshCw,
  Loader2,
  MoreVertical,
  Play,
  Pause,
  Trash2,
  Settings,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Flame,
  TrendingUp,
  Mail,
  Send,
  Ban,
  Activity,
  Eye,
  TestTube,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useTheme } from '@/contexts/ThemeContext';
import type { Mailbox, MailboxStatus } from '@/types';

interface MailboxSummary {
  total: number;
  active: number;
  warming: number;
  paused: number;
  error: number;
  totalSent: number;
  totalBounces: number;
  totalReplies: number;
  averageHealthScore: number;
  totalDailyCapacity: number;
  remainingDailyCapacity: number;
}

interface MailboxesResponse {
  mailboxes: Mailbox[];
  total: number;
  summary: MailboxSummary;
}

export default function MailboxesPage() {
  const { theme } = useTheme();
  const isLight = theme === 'light';

  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [summary, setSummary] = useState<MailboxSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [addDialogOpen, setAddDialogOpen] = useState(false);

  const fetchMailboxes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/outreach/mailboxes');
      const data: MailboxesResponse = await res.json();
      setMailboxes(data.mailboxes || []);
      setSummary(data.summary || null);
    } catch (error) {
      console.error('Failed to fetch mailboxes:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMailboxes();
  }, [fetchMailboxes]);

  const handleStatusChange = async (id: string, status: MailboxStatus) => {
    try {
      await fetch(`/api/outreach/mailboxes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      fetchMailboxes();
    } catch (error) {
      console.error('Failed to update status:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this mailbox?')) return;

    try {
      await fetch(`/api/outreach/mailboxes/${id}`, { method: 'DELETE' });
      fetchMailboxes();
    } catch (error) {
      console.error('Failed to delete mailbox:', error);
    }
  };

  const handleTestConnection = async (id: string) => {
    try {
      const res = await fetch(`/api/outreach/mailboxes/${id}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'smtp' }),
      });
      const data = await res.json();
      alert(data.success ? 'Connection successful!' : `Connection failed: ${data.error}`);
      fetchMailboxes();
    } catch (error) {
      console.error('Failed to test connection:', error);
      alert('Failed to test connection');
    }
  };

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Mailboxes"
        subtitle="Manage email accounts and warmup"
        action={
          <Button onClick={() => setAddDialogOpen(true)} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Add Mailbox
          </Button>
        }
      />

      <div className="flex-1 p-4 md:p-6 overflow-auto">
        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
            <SummaryCard
              label="Total"
              value={summary.total}
              icon={MailPlus}
              color="zinc"
              isLight={isLight}
            />
            <SummaryCard
              label="Active"
              value={summary.active}
              icon={CheckCircle}
              color="emerald"
              isLight={isLight}
            />
            <SummaryCard
              label="Warming"
              value={summary.warming}
              icon={Flame}
              color="amber"
              isLight={isLight}
            />
            <SummaryCard
              label="Health Avg"
              value={`${summary.averageHealthScore}%`}
              icon={Activity}
              color="blue"
              isLight={isLight}
            />
            <SummaryCard
              label="Today's Capacity"
              value={`${summary.remainingDailyCapacity}/${summary.totalDailyCapacity}`}
              icon={Send}
              color="violet"
              isLight={isLight}
            />
            <SummaryCard
              label="Total Sent"
              value={summary.totalSent.toLocaleString()}
              icon={Mail}
              color="sky"
              isLight={isLight}
            />
          </div>
        )}

        {/* Mailbox List */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className={cn(
              "text-lg font-semibold",
              isLight ? "text-slate-900" : "text-white"
            )}>
              Email Accounts
            </h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchMailboxes}
              disabled={loading}
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            </Button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
            </div>
          ) : mailboxes.length === 0 ? (
            <Card className={cn(
              "border",
              isLight
                ? "bg-white border-slate-200"
                : "bg-zinc-900/50 border-zinc-800"
            )}>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <MailPlus className={cn(
                  "h-12 w-12 mb-4",
                  isLight ? "text-slate-400" : "text-zinc-600"
                )} />
                <h3 className={cn(
                  "text-lg font-medium mb-2",
                  isLight ? "text-slate-900" : "text-white"
                )}>
                  No mailboxes yet
                </h3>
                <p className={cn(
                  "text-sm mb-4",
                  isLight ? "text-slate-500" : "text-zinc-400"
                )}>
                  Add your first email account to start sending
                </p>
                <Button onClick={() => setAddDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Mailbox
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {mailboxes.map((mailbox) => (
                <MailboxCard
                  key={mailbox.id}
                  mailbox={mailbox}
                  isLight={isLight}
                  onStatusChange={handleStatusChange}
                  onDelete={handleDelete}
                  onTestConnection={handleTestConnection}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <AddMailboxDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onSuccess={fetchMailboxes}
        isLight={isLight}
      />
    </div>
  );
}

// Summary Card Component
function SummaryCard({
  label,
  value,
  icon: Icon,
  color,
  isLight,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
  isLight: boolean;
}) {
  const colorClasses: Record<string, string> = {
    zinc: isLight ? 'text-slate-600' : 'text-zinc-400',
    emerald: isLight ? 'text-emerald-600' : 'text-emerald-400',
    amber: isLight ? 'text-amber-600' : 'text-amber-400',
    blue: isLight ? 'text-blue-600' : 'text-blue-400',
    violet: isLight ? 'text-violet-600' : 'text-violet-400',
    sky: isLight ? 'text-sky-600' : 'text-sky-400',
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
            <p className={cn(
              "text-xs",
              isLight ? "text-slate-500" : "text-zinc-500"
            )}>
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

// Mailbox Card Component
function MailboxCard({
  mailbox,
  isLight,
  onStatusChange,
  onDelete,
  onTestConnection,
}: {
  mailbox: Mailbox;
  isLight: boolean;
  onStatusChange: (id: string, status: MailboxStatus) => void;
  onDelete: (id: string) => void;
  onTestConnection: (id: string) => void;
}) {
  const statusColors: Record<MailboxStatus, string> = {
    active: isLight ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    warming: isLight ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    paused: isLight ? 'bg-slate-100 text-slate-600 border-slate-200' : 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
    error: isLight ? 'bg-red-100 text-red-700 border-red-200' : 'bg-red-500/20 text-red-400 border-red-500/30',
  };

  const healthColor = mailbox.health_score >= 80
    ? (isLight ? 'text-emerald-600' : 'text-emerald-400')
    : mailbox.health_score >= 50
    ? (isLight ? 'text-amber-600' : 'text-amber-400')
    : (isLight ? 'text-red-600' : 'text-red-400');

  const warmupProgress = (mailbox.warmup_stage / 5) * 100;
  const sendProgress = mailbox.daily_limit > 0
    ? (mailbox.sent_today / mailbox.daily_limit) * 100
    : 0;

  return (
    <Card className={cn(
      "border overflow-hidden",
      isLight
        ? "bg-white border-slate-200 hover:border-violet-300"
        : "bg-zinc-900/50 border-zinc-800 hover:border-violet-500/50"
    )}>
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Mail className={cn(
                "h-4 w-4 flex-shrink-0",
                isLight ? "text-violet-500" : "text-violet-400"
              )} />
              <p className={cn(
                "text-sm font-medium truncate",
                isLight ? "text-slate-900" : "text-white"
              )}>
                {mailbox.email}
              </p>
            </div>
            {mailbox.display_name && (
              <p className={cn(
                "text-xs mt-0.5 truncate",
                isLight ? "text-slate-500" : "text-zinc-500"
              )}>
                {mailbox.display_name}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Badge className={cn("text-xs", statusColors[mailbox.status])}>
              {mailbox.status}
            </Badge>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link href={`/outreach/mailboxes/${mailbox.id}`}>
                    <Eye className="h-4 w-4 mr-2" />
                    View Details
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onTestConnection(mailbox.id)}>
                  <TestTube className="h-4 w-4 mr-2" />
                  Test Connection
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {mailbox.status === 'paused' ? (
                  <DropdownMenuItem onClick={() => onStatusChange(mailbox.id, 'active')}>
                    <Play className="h-4 w-4 mr-2" />
                    Resume
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onClick={() => onStatusChange(mailbox.id, 'paused')}>
                    <Pause className="h-4 w-4 mr-2" />
                    Pause
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-red-600"
                  onClick={() => onDelete(mailbox.id)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div>
            <p className={cn("text-xs", isLight ? "text-slate-500" : "text-zinc-500")}>
              Health
            </p>
            <p className={cn("text-sm font-semibold", healthColor)}>
              {mailbox.health_score}%
            </p>
          </div>
          <div>
            <p className={cn("text-xs", isLight ? "text-slate-500" : "text-zinc-500")}>
              Today
            </p>
            <p className={cn(
              "text-sm font-semibold",
              isLight ? "text-slate-900" : "text-white"
            )}>
              {mailbox.sent_today}/{mailbox.daily_limit}
            </p>
          </div>
          <div>
            <p className={cn("text-xs", isLight ? "text-slate-500" : "text-zinc-500")}>
              Total
            </p>
            <p className={cn(
              "text-sm font-semibold",
              isLight ? "text-slate-900" : "text-white"
            )}>
              {mailbox.total_sent.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Warmup Progress */}
        {mailbox.warmup_enabled && mailbox.status === 'warming' && (
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1">
              <span className={cn(
                "text-xs flex items-center gap-1",
                isLight ? "text-slate-500" : "text-zinc-500"
              )}>
                <Flame className="h-3 w-3 text-amber-500" />
                Warmup Stage {mailbox.warmup_stage}/5
              </span>
              <span className={cn(
                "text-xs",
                isLight ? "text-slate-500" : "text-zinc-500"
              )}>
                {warmupProgress.toFixed(0)}%
              </span>
            </div>
            <div className={cn(
              "h-1.5 rounded-full overflow-hidden",
              isLight ? "bg-slate-100" : "bg-zinc-800"
            )}>
              <div
                className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full transition-all"
                style={{ width: `${warmupProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Send Progress */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className={cn(
              "text-xs",
              isLight ? "text-slate-500" : "text-zinc-500"
            )}>
              Daily Progress
            </span>
            <span className={cn(
              "text-xs",
              isLight ? "text-slate-500" : "text-zinc-500"
            )}>
              {sendProgress.toFixed(0)}%
            </span>
          </div>
          <div className={cn(
            "h-1.5 rounded-full overflow-hidden",
            isLight ? "bg-slate-100" : "bg-zinc-800"
          )}>
            <div
              className={cn(
                "h-full rounded-full transition-all",
                sendProgress >= 100
                  ? "bg-emerald-500"
                  : sendProgress >= 75
                  ? "bg-violet-500"
                  : "bg-blue-500"
              )}
              style={{ width: `${Math.min(sendProgress, 100)}%` }}
            />
          </div>
        </div>

        {/* Error Message */}
        {mailbox.last_error && (
          <div className={cn(
            "mt-3 p-2 rounded-lg text-xs",
            isLight
              ? "bg-red-50 text-red-600 border border-red-200"
              : "bg-red-500/10 text-red-400 border border-red-500/20"
          )}>
            <AlertTriangle className="h-3 w-3 inline mr-1" />
            {mailbox.last_error}
          </div>
        )}

        {/* Verification Status */}
        <div className="flex items-center gap-3 mt-3 pt-3 border-t border-zinc-800">
          <div className="flex items-center gap-1">
            {mailbox.smtp_verified ? (
              <CheckCircle className="h-3 w-3 text-emerald-500" />
            ) : (
              <XCircle className="h-3 w-3 text-zinc-500" />
            )}
            <span className={cn(
              "text-xs",
              isLight ? "text-slate-500" : "text-zinc-500"
            )}>
              SMTP
            </span>
          </div>
          <div className="flex items-center gap-1">
            {mailbox.imap_verified ? (
              <CheckCircle className="h-3 w-3 text-emerald-500" />
            ) : (
              <XCircle className="h-3 w-3 text-zinc-500" />
            )}
            <span className={cn(
              "text-xs",
              isLight ? "text-slate-500" : "text-zinc-500"
            )}>
              IMAP
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Add Mailbox Dialog
function AddMailboxDialog({
  open,
  onOpenChange,
  onSuccess,
  isLight,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  isLight: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    display_name: '',
    smtp_host: '',
    smtp_port: '465',
    smtp_user: '',
    smtp_pass: '',
    imap_host: '',
    imap_port: '993',
    imap_user: '',
    imap_pass: '',
    warmup_enabled: true,
    warmup_target_per_day: '40',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch('/api/outreach/mailboxes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          smtp_port: parseInt(formData.smtp_port),
          imap_port: parseInt(formData.imap_port),
          warmup_target_per_day: parseInt(formData.warmup_target_per_day),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create mailbox');
      }

      onSuccess();
      onOpenChange(false);
      setFormData({
        email: '',
        display_name: '',
        smtp_host: '',
        smtp_port: '465',
        smtp_user: '',
        smtp_pass: '',
        imap_host: '',
        imap_port: '993',
        imap_user: '',
        imap_pass: '',
        warmup_enabled: true,
        warmup_target_per_day: '40',
      });
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to create mailbox');
    } finally {
      setLoading(false);
    }
  };

  const inputClassName = cn(
    "mt-1",
    isLight
      ? "bg-white border-slate-200"
      : "bg-zinc-900 border-zinc-700"
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(
        "max-w-2xl max-h-[90vh] overflow-y-auto",
        isLight
          ? "bg-white border-slate-200"
          : "bg-zinc-900 border-zinc-800"
      )}>
        <DialogHeader>
          <DialogTitle className={isLight ? "text-slate-900" : "text-white"}>
            Add Email Account
          </DialogTitle>
          <DialogDescription>
            Add a new email account for sending outreach emails
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Info */}
          <div className="space-y-4">
            <h3 className={cn(
              "text-sm font-semibold",
              isLight ? "text-slate-900" : "text-white"
            )}>
              Account Info
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="email">Email Address *</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  placeholder="you@example.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className={inputClassName}
                />
              </div>
              <div>
                <Label htmlFor="display_name">Display Name</Label>
                <Input
                  id="display_name"
                  placeholder="John Doe"
                  value={formData.display_name}
                  onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                  className={inputClassName}
                />
              </div>
            </div>
          </div>

          {/* SMTP Settings */}
          <div className="space-y-4">
            <h3 className={cn(
              "text-sm font-semibold",
              isLight ? "text-slate-900" : "text-white"
            )}>
              SMTP Settings (Sending)
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="smtp_host">SMTP Host *</Label>
                <Input
                  id="smtp_host"
                  required
                  placeholder="smtp.example.com"
                  value={formData.smtp_host}
                  onChange={(e) => setFormData({ ...formData, smtp_host: e.target.value })}
                  className={inputClassName}
                />
              </div>
              <div>
                <Label htmlFor="smtp_port">SMTP Port</Label>
                <Input
                  id="smtp_port"
                  type="number"
                  placeholder="465"
                  value={formData.smtp_port}
                  onChange={(e) => setFormData({ ...formData, smtp_port: e.target.value })}
                  className={inputClassName}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="smtp_user">SMTP Username *</Label>
                <Input
                  id="smtp_user"
                  required
                  placeholder="you@example.com"
                  value={formData.smtp_user}
                  onChange={(e) => setFormData({ ...formData, smtp_user: e.target.value })}
                  className={inputClassName}
                />
              </div>
              <div>
                <Label htmlFor="smtp_pass">SMTP Password *</Label>
                <Input
                  id="smtp_pass"
                  type="password"
                  required
                  placeholder="••••••••"
                  value={formData.smtp_pass}
                  onChange={(e) => setFormData({ ...formData, smtp_pass: e.target.value })}
                  className={inputClassName}
                />
              </div>
            </div>
          </div>

          {/* IMAP Settings */}
          <div className="space-y-4">
            <h3 className={cn(
              "text-sm font-semibold",
              isLight ? "text-slate-900" : "text-white"
            )}>
              IMAP Settings (Receiving - Optional)
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="imap_host">IMAP Host</Label>
                <Input
                  id="imap_host"
                  placeholder="imap.example.com"
                  value={formData.imap_host}
                  onChange={(e) => setFormData({ ...formData, imap_host: e.target.value })}
                  className={inputClassName}
                />
              </div>
              <div>
                <Label htmlFor="imap_port">IMAP Port</Label>
                <Input
                  id="imap_port"
                  type="number"
                  placeholder="993"
                  value={formData.imap_port}
                  onChange={(e) => setFormData({ ...formData, imap_port: e.target.value })}
                  className={inputClassName}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="imap_user">IMAP Username</Label>
                <Input
                  id="imap_user"
                  placeholder="you@example.com"
                  value={formData.imap_user}
                  onChange={(e) => setFormData({ ...formData, imap_user: e.target.value })}
                  className={inputClassName}
                />
              </div>
              <div>
                <Label htmlFor="imap_pass">IMAP Password</Label>
                <Input
                  id="imap_pass"
                  type="password"
                  placeholder="••••••••"
                  value={formData.imap_pass}
                  onChange={(e) => setFormData({ ...formData, imap_pass: e.target.value })}
                  className={inputClassName}
                />
              </div>
            </div>
          </div>

          {/* Warmup Settings */}
          <div className="space-y-4">
            <h3 className={cn(
              "text-sm font-semibold",
              isLight ? "text-slate-900" : "text-white"
            )}>
              Warmup Settings
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="warmup_target">Target Emails/Day</Label>
                <Input
                  id="warmup_target"
                  type="number"
                  placeholder="40"
                  value={formData.warmup_target_per_day}
                  onChange={(e) => setFormData({ ...formData, warmup_target_per_day: e.target.value })}
                  className={inputClassName}
                />
                <p className={cn(
                  "text-xs mt-1",
                  isLight ? "text-slate-500" : "text-zinc-500"
                )}>
                  Max daily emails after warmup (5 weeks)
                </p>
              </div>
              <div className="flex items-center gap-2 pt-6">
                <input
                  type="checkbox"
                  id="warmup_enabled"
                  checked={formData.warmup_enabled}
                  onChange={(e) => setFormData({ ...formData, warmup_enabled: e.target.checked })}
                  className="rounded"
                />
                <Label htmlFor="warmup_enabled" className="cursor-pointer">
                  Enable warmup (recommended)
                </Label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Mailbox
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
