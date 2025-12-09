'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity, CheckCircle2, AlertTriangle, XCircle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SystemHealthCardProps {
  lastCronRun: {
    at: string;
    title: string;
    success: boolean;
  } | null;
  isLight?: boolean;
}

function getTimeSinceRun(dateString: string): { minutes: number; text: string } {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);

  if (diffMins < 60) return { minutes: diffMins, text: `${diffMins}m ago` };
  if (diffHours < 24) return { minutes: diffMins, text: `${diffHours}h ago` };
  return { minutes: diffMins, text: `${Math.floor(diffMs / 86400000)}d ago` };
}

function getHealthStatus(lastCronRun: SystemHealthCardProps['lastCronRun']) {
  if (!lastCronRun) {
    return {
      status: 'unknown',
      label: 'No Data',
      description: 'Automation has not run yet',
      icon: Clock,
      color: 'text-zinc-400',
      bgColor: 'bg-zinc-500/10 border-zinc-500/20',
    };
  }

  const { minutes } = getTimeSinceRun(lastCronRun.at);

  if (!lastCronRun.success) {
    return {
      status: 'error',
      label: 'Error',
      description: 'Last automation run failed',
      icon: XCircle,
      color: 'text-red-400',
      bgColor: 'bg-red-500/10 border-red-500/20',
    };
  }

  // Stale if > 2 hours since last run
  if (minutes > 120) {
    return {
      status: 'stale',
      label: 'Stale',
      description: 'Automation may be delayed',
      icon: AlertTriangle,
      color: 'text-amber-400',
      bgColor: 'bg-amber-500/10 border-amber-500/20',
    };
  }

  return {
    status: 'healthy',
    label: 'Healthy',
    description: 'Automation running normally',
    icon: CheckCircle2,
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10 border-emerald-500/20',
  };
}

export function SystemHealthCard({ lastCronRun, isLight = false }: SystemHealthCardProps) {
  const health = getHealthStatus(lastCronRun);
  const Icon = health.icon;
  const timeAgo = lastCronRun ? getTimeSinceRun(lastCronRun.at).text : null;

  return (
    <Card
      className={cn(
        'relative overflow-hidden border',
        isLight
          ? 'bg-white border-slate-200 shadow-sm'
          : 'bg-zinc-900 border-zinc-800'
      )}
    >
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-blue-400" />
            System Health
          </span>
          <Badge
            className={cn(
              'text-[10px] font-medium',
              health.bgColor,
              health.color
            )}
          >
            {health.label}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div
          className={cn(
            'flex items-center gap-3 p-3 rounded-lg border',
            health.bgColor
          )}
        >
          <Icon className={cn('h-5 w-5', health.color)} />
          <div className="flex-1 min-w-0">
            <p className={cn('text-sm font-medium', isLight ? 'text-slate-900' : 'text-white')}>
              {health.description}
            </p>
            {lastCronRun && (
              <p className={cn('text-xs', isLight ? 'text-slate-500' : 'text-zinc-500')}>
                Last run: {timeAgo}
              </p>
            )}
          </div>
        </div>

        {lastCronRun && (
          <div className={cn('text-xs', isLight ? 'text-slate-500' : 'text-zinc-500')}>
            <p className="truncate">{lastCronRun.title}</p>
            <p className="mt-1">
              {new Date(lastCronRun.at).toLocaleString()}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
