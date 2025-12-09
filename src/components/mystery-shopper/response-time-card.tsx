'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Timer, TrendingUp, TrendingDown, Clock, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ResponseTimeCardProps {
  responseTime: {
    avgMinutes: number;
    fastest: number;
    slowest: number;
    totalReplies: number;
  };
  isLight?: boolean;
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours < 24) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

function getResponseQuality(avgMinutes: number): {
  label: string;
  color: string;
  bgColor: string;
} {
  if (avgMinutes <= 30) {
    return { label: 'Excellent', color: 'text-emerald-400', bgColor: 'bg-emerald-500/10' };
  }
  if (avgMinutes <= 120) {
    return { label: 'Good', color: 'text-green-400', bgColor: 'bg-green-500/10' };
  }
  if (avgMinutes <= 480) {
    return { label: 'Average', color: 'text-amber-400', bgColor: 'bg-amber-500/10' };
  }
  return { label: 'Slow', color: 'text-red-400', bgColor: 'bg-red-500/10' };
}

export function ResponseTimeCard({ responseTime, isLight = false }: ResponseTimeCardProps) {
  const hasData = responseTime.totalReplies > 0;
  const quality = hasData ? getResponseQuality(responseTime.avgMinutes) : null;

  return (
    <Card
      className={cn(
        'border',
        isLight ? 'bg-white border-slate-200' : 'bg-zinc-900 border-zinc-800'
      )}
    >
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Timer className="h-4 w-4 text-orange-400" />
          Hotel Response Times
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <div className={cn(
            'text-center py-6',
            isLight ? 'text-slate-500' : 'text-zinc-500'
          )}>
            <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No response data yet</p>
            <p className="text-xs mt-1">Response times will appear after hotels reply</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Average Response */}
            <div className={cn(
              'p-3 rounded-lg',
              quality?.bgColor,
              'border',
              isLight ? 'border-slate-200' : 'border-zinc-700'
            )}>
              <div className="flex items-center justify-between mb-1">
                <span className={cn('text-xs', isLight ? 'text-slate-500' : 'text-zinc-400')}>
                  Average Response
                </span>
                <span className={cn('text-xs font-medium', quality?.color)}>
                  {quality?.label}
                </span>
              </div>
              <p className={cn('text-2xl font-bold', quality?.color)}>
                {formatMinutes(responseTime.avgMinutes)}
              </p>
              <p className={cn('text-xs mt-1', isLight ? 'text-slate-500' : 'text-zinc-500')}>
                from {responseTime.totalReplies} hotel{responseTime.totalReplies !== 1 ? 's' : ''}
              </p>
            </div>

            {/* Min/Max */}
            <div className="grid grid-cols-2 gap-3">
              <div className={cn(
                'p-3 rounded-lg border',
                isLight ? 'bg-slate-50 border-slate-200' : 'bg-zinc-800 border-zinc-700'
              )}>
                <div className="flex items-center gap-1.5 mb-1">
                  <Zap className="h-3 w-3 text-emerald-400" />
                  <span className={cn('text-xs', isLight ? 'text-slate-500' : 'text-zinc-400')}>
                    Fastest
                  </span>
                </div>
                <p className={cn('text-lg font-semibold', isLight ? 'text-emerald-600' : 'text-emerald-400')}>
                  {formatMinutes(responseTime.fastest)}
                </p>
              </div>

              <div className={cn(
                'p-3 rounded-lg border',
                isLight ? 'bg-slate-50 border-slate-200' : 'bg-zinc-800 border-zinc-700'
              )}>
                <div className="flex items-center gap-1.5 mb-1">
                  <Clock className="h-3 w-3 text-red-400" />
                  <span className={cn('text-xs', isLight ? 'text-slate-500' : 'text-zinc-400')}>
                    Slowest
                  </span>
                </div>
                <p className={cn('text-lg font-semibold', isLight ? 'text-red-600' : 'text-red-400')}>
                  {formatMinutes(responseTime.slowest)}
                </p>
              </div>
            </div>

            <p className={cn(
              'text-[10px] text-center',
              isLight ? 'text-slate-400' : 'text-zinc-600'
            )}>
              Response times help qualify lead quality
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
