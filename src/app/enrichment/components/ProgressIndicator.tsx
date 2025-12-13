'use client';

import { cn } from '@/lib/utils';
import { useTheme } from '@/contexts/ThemeContext';
import { Loader2, Globe, Mail, CheckCircle2 } from 'lucide-react';
import { useEffect, useState, useCallback } from 'react';

interface ProgressIndicatorProps {
  isRunning: boolean;
  onComplete?: () => void;
}

interface Progress {
  isRunning: boolean;
  type: 'websites' | 'emails' | 'auto' | null;
  processed: number;
  total: number;
  found: number;
  startedAt: string | null;
  lastUpdatedAt: string | null;
}

export function ProgressIndicator({ isRunning, onComplete }: ProgressIndicatorProps) {
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const [progress, setProgress] = useState<Progress | null>(null);
  const [connected, setConnected] = useState(false);

  const startSSE = useCallback(() => {
    const eventSource = new EventSource('/api/enrichment/stream');

    eventSource.onopen = () => {
      setConnected(true);
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setProgress(data);

        // If enrichment just finished, notify parent
        if (!data.isRunning && data.processed > 0) {
          onComplete?.();
        }
      } catch (e) {
        console.error('SSE parse error:', e);
      }
    };

    eventSource.onerror = () => {
      setConnected(false);
      eventSource.close();
    };

    return eventSource;
  }, [onComplete]);

  useEffect(() => {
    if (!isRunning) {
      setProgress(null);
      return;
    }

    const eventSource = startSSE();
    return () => eventSource.close();
  }, [isRunning, startSSE]);

  if (!isRunning && !progress?.isRunning) {
    return null;
  }

  const current = progress?.processed || 0;
  const total = progress?.total || 100;
  const found = progress?.found || 0;
  const percentage = total > 0 ? Math.round((current / total) * 100) : 0;

  const getPhaseLabel = () => {
    if (progress?.type === 'websites') return 'Finding websites';
    if (progress?.type === 'emails') return 'Finding emails';
    if (progress?.type === 'auto') return current > 50 ? 'Finding emails' : 'Finding websites';
    return 'Processing';
  };

  const getPhaseIcon = () => {
    if (progress?.type === 'emails' || (progress?.type === 'auto' && current > 50)) {
      return Mail;
    }
    return Globe;
  };

  const PhaseIcon = getPhaseIcon();

  // Show completion state briefly
  if (progress && !progress.isRunning && current > 0) {
    return (
      <div
        className={cn(
          'rounded-xl p-4 border animate-in fade-in slide-in-from-top-2',
          isLight
            ? 'bg-emerald-50 border-emerald-200'
            : 'bg-emerald-900/20 border-emerald-800'
        )}
      >
        <div className="flex items-center gap-3">
          <CheckCircle2 className={cn('h-5 w-5', isLight ? 'text-emerald-600' : 'text-emerald-400')} />
          <div>
            <p className={cn('font-medium', isLight ? 'text-emerald-800' : 'text-emerald-300')}>
              Enrichment complete
            </p>
            <p className={cn('text-sm', isLight ? 'text-emerald-600' : 'text-emerald-400')}>
              Processed {current} prospects, found {found} {progress?.type === 'emails' ? 'emails' : 'websites'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'rounded-xl p-4 border animate-in fade-in slide-in-from-top-2',
        isLight
          ? 'bg-violet-50 border-violet-200'
          : 'bg-violet-900/20 border-violet-800'
      )}
    >
      <div className="flex items-center gap-3 mb-3">
        <div className={cn('p-2 rounded-lg', isLight ? 'bg-violet-100' : 'bg-violet-900/50')}>
          <Loader2 className={cn('h-5 w-5 animate-spin', isLight ? 'text-violet-600' : 'text-violet-400')} />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <PhaseIcon className={cn('h-4 w-4', isLight ? 'text-violet-600' : 'text-violet-400')} />
            <p className={cn('font-medium', isLight ? 'text-violet-800' : 'text-violet-300')}>
              {getPhaseLabel()}...
            </p>
          </div>
          <p className={cn('text-sm', isLight ? 'text-violet-600' : 'text-violet-400')}>
            {current} of {total} prospects processed
            {found > 0 && ` (${found} found)`}
          </p>
        </div>
        <div className="text-right">
          <p className={cn('text-2xl font-bold', isLight ? 'text-violet-700' : 'text-violet-300')}>
            {percentage}%
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div className={cn('h-2 rounded-full overflow-hidden', isLight ? 'bg-violet-100' : 'bg-violet-900/50')}>
        <div
          className="h-full rounded-full bg-gradient-to-r from-violet-500 to-blue-500 transition-all duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>

      {/* Connection indicator */}
      <div className="flex items-center gap-1.5 mt-2">
        <div className={cn('h-1.5 w-1.5 rounded-full', connected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400')} />
        <span className="text-xs text-muted-foreground">
          {connected ? 'Live updates' : 'Connecting...'}
        </span>
      </div>
    </div>
  );
}
