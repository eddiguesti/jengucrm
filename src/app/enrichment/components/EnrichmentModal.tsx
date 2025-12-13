'use client';

import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/contexts/ThemeContext';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Sparkles,
  Globe,
  Mail,
  CheckCircle2,
  Loader2,
  AlertCircle,
} from 'lucide-react';

interface EnrichmentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  needsWebsite: number;
  needsEmail: number;
}

interface Progress {
  isRunning: boolean;
  type: 'websites' | 'emails' | 'auto' | null;
  processed: number;
  total: number;
  found: number;
  websitesFound: number;
  emailsFound: number;
  startedAt: string | null;
  lastUpdatedAt: string | null;
}

type ModalState = 'configure' | 'running' | 'complete' | 'error';

const BATCH_OPTIONS = [
  { value: 25, label: '25 prospects', description: '~2 minutes' },
  { value: 50, label: '50 prospects', description: '~4 minutes' },
  { value: 100, label: '100 prospects', description: '~8 minutes' },
  { value: 200, label: '200 prospects', description: '~15 minutes' },
];

export function EnrichmentModal({
  open,
  onOpenChange,
  needsWebsite,
  needsEmail,
}: EnrichmentModalProps) {
  const { theme } = useTheme();
  const isLight = theme === 'light';

  const [state, setState] = useState<ModalState>('configure');
  const [batchSize, setBatchSize] = useState(50);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [results, setResults] = useState<{
    websitesFound: number;
    emailsFound: number;
    processed: number;
    duration: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setState('configure');
      setProgress(null);
      setResults(null);
      setError(null);
    }
  }, [open]);

  // SSE connection for progress tracking
  const startProgressTracking = useCallback(() => {
    const eventSource = new EventSource('/api/enrichment/stream');

    eventSource.onmessage = (event) => {
      try {
        const data: Progress = JSON.parse(event.data);
        setProgress(data);

        // Check if complete
        if (!data.isRunning && data.processed > 0 && state === 'running') {
          const startTime = data.startedAt ? new Date(data.startedAt) : new Date();
          const endTime = data.lastUpdatedAt ? new Date(data.lastUpdatedAt) : new Date();
          const durationMs = endTime.getTime() - startTime.getTime();
          const minutes = Math.floor(durationMs / 60000);
          const seconds = Math.floor((durationMs % 60000) / 1000);

          setResults({
            websitesFound: data.websitesFound || 0,
            emailsFound: data.emailsFound || 0,
            processed: data.processed,
            duration: minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`,
          });
          setState('complete');
          eventSource.close();
        }
      } catch (e) {
        console.error('SSE parse error:', e);
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
      if (state === 'running') {
        setError('Lost connection to enrichment service');
        setState('error');
      }
    };

    return eventSource;
  }, [state]);

  const startEnrichment = async () => {
    setState('running');
    setError(null);

    try {
      const response = await fetch('/api/enrichment/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'auto', limit: batchSize }),
      });

      if (!response.ok) {
        throw new Error('Failed to start enrichment');
      }

      // Start tracking progress
      const eventSource = startProgressTracking();

      // Cleanup on unmount
      return () => eventSource.close();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setState('error');
    }
  };

  const handleClose = () => {
    if (state !== 'running') {
      onOpenChange(false);
    }
  };

  const totalNeeds = needsWebsite + needsEmail;
  const effectiveBatch = Math.min(batchSize, totalNeeds);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className={cn(
          'sm:max-w-md',
          isLight ? 'bg-white' : 'bg-zinc-900'
        )}
        showCloseButton={state !== 'running'}
      >
        {/* Configure State */}
        {state === 'configure' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className={cn('h-5 w-5', isLight ? 'text-violet-600' : 'text-violet-400')} />
                Start Enrichment
              </DialogTitle>
              <DialogDescription>
                Choose how many prospects to enrich in this batch
              </DialogDescription>
            </DialogHeader>

            {/* Current needs summary */}
            <div className={cn('rounded-lg p-3 space-y-2', isLight ? 'bg-slate-50' : 'bg-zinc-800')}>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-blue-500" />
                  Need websites
                </span>
                <span className="font-medium">{needsWebsite.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-emerald-500" />
                  Need emails
                </span>
                <span className="font-medium">{needsEmail.toLocaleString()}</span>
              </div>
            </div>

            {/* Batch size selector */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Batch size</label>
              <div className="grid grid-cols-2 gap-2">
                {BATCH_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setBatchSize(option.value)}
                    disabled={option.value > totalNeeds}
                    className={cn(
                      'p-3 rounded-lg border text-left transition-all',
                      batchSize === option.value
                        ? isLight
                          ? 'border-violet-500 bg-violet-50 ring-2 ring-violet-500/20'
                          : 'border-violet-500 bg-violet-900/30 ring-2 ring-violet-500/20'
                        : isLight
                          ? 'border-slate-200 hover:border-slate-300 bg-white'
                          : 'border-zinc-700 hover:border-zinc-600 bg-zinc-800',
                      option.value > totalNeeds && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    <p className="font-medium text-sm">{option.label}</p>
                    <p className="text-xs text-muted-foreground">{option.description}</p>
                  </button>
                ))}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={startEnrichment}
                disabled={effectiveBatch === 0}
                className={cn(
                  isLight
                    ? 'bg-violet-600 hover:bg-violet-700 text-white'
                    : 'bg-violet-600 hover:bg-violet-500 text-white'
                )}
              >
                <Sparkles className="h-4 w-4 mr-2" />
                Enrich {effectiveBatch} Prospects
              </Button>
            </DialogFooter>
          </>
        )}

        {/* Running State */}
        {state === 'running' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Loader2 className={cn('h-5 w-5 animate-spin', isLight ? 'text-violet-600' : 'text-violet-400')} />
                Enriching Prospects
              </DialogTitle>
              <DialogDescription>
                Please wait while we find websites and emails...
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Phase indicator */}
              <div className={cn('rounded-lg p-4', isLight ? 'bg-slate-50' : 'bg-zinc-800')}>
                <div className="flex items-center gap-3 mb-3">
                  {progress?.type === 'emails' ? (
                    <Mail className={cn('h-5 w-5', isLight ? 'text-emerald-600' : 'text-emerald-400')} />
                  ) : (
                    <Globe className={cn('h-5 w-5', isLight ? 'text-blue-600' : 'text-blue-400')} />
                  )}
                  <div className="flex-1">
                    <p className="font-medium">
                      {progress?.type === 'emails' ? 'Finding emails' : 'Finding websites'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {progress?.processed || 0} of {progress?.total || batchSize} processed
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={cn('text-2xl font-bold', isLight ? 'text-violet-700' : 'text-violet-300')}>
                      {progress?.total ? Math.round(((progress?.processed || 0) / progress.total) * 100) : 0}%
                    </p>
                  </div>
                </div>

                {/* Progress bar */}
                <div className={cn('h-2 rounded-full overflow-hidden', isLight ? 'bg-slate-200' : 'bg-zinc-700')}>
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-violet-500 to-blue-500 transition-all duration-300"
                    style={{
                      width: `${progress?.total ? ((progress?.processed || 0) / progress.total) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>

              {/* Live stats */}
              {progress && (progress.websitesFound > 0 || progress.emailsFound > 0) && (
                <div className={cn('rounded-lg p-3', isLight ? 'bg-emerald-50' : 'bg-emerald-900/20')}>
                  <div className="flex items-center justify-center gap-4">
                    {progress.websitesFound > 0 && (
                      <span className={cn('flex items-center gap-1.5 text-sm', isLight ? 'text-emerald-700' : 'text-emerald-400')}>
                        <Globe className="h-4 w-4" />
                        {progress.websitesFound} websites
                      </span>
                    )}
                    {progress.emailsFound > 0 && (
                      <span className={cn('flex items-center gap-1.5 text-sm', isLight ? 'text-emerald-700' : 'text-emerald-400')}>
                        <Mail className="h-4 w-4" />
                        {progress.emailsFound} emails
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <p className="text-xs text-muted-foreground">
                Do not close this window while enrichment is running
              </p>
            </DialogFooter>
          </>
        )}

        {/* Complete State */}
        {state === 'complete' && results && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className={cn('h-5 w-5', isLight ? 'text-emerald-600' : 'text-emerald-400')} />
                Enrichment Complete
              </DialogTitle>
              <DialogDescription>
                Successfully processed {results.processed} prospects in {results.duration}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-4">
              {/* Results summary */}
              <div className={cn('rounded-lg p-4', isLight ? 'bg-emerald-50' : 'bg-emerald-900/20')}>
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center">
                    <div className={cn('inline-flex items-center justify-center w-12 h-12 rounded-full mb-2', isLight ? 'bg-blue-100' : 'bg-blue-900/30')}>
                      <Globe className={cn('h-6 w-6', isLight ? 'text-blue-600' : 'text-blue-400')} />
                    </div>
                    <p className={cn('text-2xl font-bold', isLight ? 'text-blue-700' : 'text-blue-300')}>
                      {results.websitesFound}
                    </p>
                    <p className="text-xs text-muted-foreground">Websites Found</p>
                  </div>
                  <div className="text-center">
                    <div className={cn('inline-flex items-center justify-center w-12 h-12 rounded-full mb-2', isLight ? 'bg-emerald-100' : 'bg-emerald-900/30')}>
                      <Mail className={cn('h-6 w-6', isLight ? 'text-emerald-600' : 'text-emerald-400')} />
                    </div>
                    <p className={cn('text-2xl font-bold', isLight ? 'text-emerald-700' : 'text-emerald-300')}>
                      {results.emailsFound}
                    </p>
                    <p className="text-xs text-muted-foreground">Emails Found</p>
                  </div>
                </div>
              </div>

              {/* Remaining needs */}
              <div className={cn('rounded-lg p-3 text-sm', isLight ? 'bg-slate-50' : 'bg-zinc-800')}>
                <p className="text-muted-foreground">
                  Remaining: {Math.max(0, needsWebsite - results.processed).toLocaleString()} need websites,{' '}
                  {needsEmail.toLocaleString()} need emails
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                Close
              </Button>
              <Button
                onClick={() => {
                  setState('configure');
                  setResults(null);
                }}
                className={cn(
                  isLight
                    ? 'bg-violet-600 hover:bg-violet-700 text-white'
                    : 'bg-violet-600 hover:bg-violet-500 text-white'
                )}
              >
                Run Another Batch
              </Button>
            </DialogFooter>
          </>
        )}

        {/* Error State */}
        {state === 'error' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-red-500" />
                Enrichment Failed
              </DialogTitle>
              <DialogDescription>
                {error || 'An unexpected error occurred'}
              </DialogDescription>
            </DialogHeader>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                Close
              </Button>
              <Button
                onClick={() => {
                  setState('configure');
                  setError(null);
                }}
              >
                Try Again
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
