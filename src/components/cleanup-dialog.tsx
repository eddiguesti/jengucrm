'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Loader2,
  Trash2,
  Clock,
  MailX,
  Brain,
  AlertTriangle,
  CheckCircle2,
  Archive,
} from 'lucide-react';

interface CleanupCandidate {
  id: string;
  name: string;
  city?: string;
  reason: string;
  description: string;
}

interface CleanupStats {
  unresponsive: number;
  stale: number;
  aiFiltered: number;
  total: number;
}

interface CleanupPreview {
  unresponsive: CleanupCandidate[];
  stale: CleanupCandidate[];
  aiFiltered: Array<{ id: string; name: string; reason: string }>;
  stats: CleanupStats;
  summary: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
}

export function CleanupDialog({ open, onOpenChange, onComplete }: Props) {
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<CleanupPreview | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ success: boolean; summary: string } | null>(null);

  // Cleanup options
  const [includeUnresponsive, setIncludeUnresponsive] = useState(true);
  const [includeStale, setIncludeStale] = useState(true);
  const [includeAi, setIncludeAi] = useState(false); // Off by default - more aggressive

  const fetchPreview = async () => {
    setLoading(true);
    setResult(null);
    try {
      const response = await fetch('/api/cleanup');
      if (!response.ok) throw new Error('Failed to fetch preview');
      const data = await response.json();
      setPreview(data);
    } catch (error) {
      console.error('Preview error:', error);
    } finally {
      setLoading(false);
    }
  };

  const runCleanup = async () => {
    setRunning(true);
    try {
      // Build mode based on selections
      const modes: string[] = [];
      if (includeUnresponsive) modes.push('unresponsive');
      if (includeStale) modes.push('stale');
      if (includeAi) modes.push('ai');

      // If all selected, use 'all' mode
      const mode = modes.length === 3 ? 'all' : modes.length === 0 ? 'none' : modes[0];

      if (mode === 'none') {
        setResult({ success: false, summary: 'No cleanup options selected' });
        setRunning(false);
        return;
      }

      // Run cleanup for each selected mode
      let totalArchived = 0;
      for (const m of modes) {
        const response = await fetch('/api/cleanup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: m, dryRun: false }),
        });
        if (!response.ok) throw new Error('Cleanup failed');
        const data = await response.json();
        totalArchived += data.stats?.total || 0;
      }

      setResult({
        success: true,
        summary: `Successfully archived ${totalArchived} prospects`,
      });

      // Refresh parent data
      onComplete();
    } catch (error) {
      setResult({
        success: false,
        summary: `Cleanup failed: ${error}`,
      });
    } finally {
      setRunning(false);
    }
  };

  // Fetch preview when dialog opens
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen && !preview) {
      fetchPreview();
    }
    if (!isOpen) {
      setPreview(null);
      setResult(null);
    }
    onOpenChange(isOpen);
  };

  const getSelectedCount = () => {
    if (!preview) return 0;
    let count = 0;
    if (includeUnresponsive) count += preview.stats.unresponsive;
    if (includeStale) count += preview.stats.stale;
    if (includeAi) count += preview.stats.aiFiltered;
    return count;
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="bg-zinc-900 border-zinc-800 max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Trash2 className="h-5 w-5 text-red-400" />
            Clean Up Prospects
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            Archive prospects that are no longer viable leads. This helps keep your pipeline clean.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
            <span className="ml-3 text-zinc-400">Analyzing prospects...</span>
          </div>
        ) : result ? (
          <div className="py-8 text-center">
            {result.success ? (
              <>
                <CheckCircle2 className="h-12 w-12 text-emerald-400 mx-auto mb-4" />
                <p className="text-lg font-medium text-white mb-2">Cleanup Complete</p>
                <p className="text-zinc-400">{result.summary}</p>
              </>
            ) : (
              <>
                <AlertTriangle className="h-12 w-12 text-red-400 mx-auto mb-4" />
                <p className="text-lg font-medium text-white mb-2">Cleanup Failed</p>
                <p className="text-zinc-400">{result.summary}</p>
              </>
            )}
          </div>
        ) : preview ? (
          <div className="flex-1 overflow-auto space-y-4">
            {/* Cleanup Options */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-zinc-300">Select what to clean:</h4>

              {/* Unresponsive */}
              <label className="flex items-start gap-3 p-3 rounded-lg bg-zinc-800/50 border border-zinc-700 cursor-pointer hover:bg-zinc-800 transition-colors">
                <Checkbox
                  checked={includeUnresponsive}
                  onCheckedChange={(checked) => setIncludeUnresponsive(!!checked)}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <MailX className="h-4 w-4 text-red-400" />
                    <span className="font-medium text-white">Unresponsive</span>
                    <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
                      {preview.stats.unresponsive}
                    </Badge>
                  </div>
                  <p className="text-xs text-zinc-400 mt-1">
                    Prospects with 5+ emails sent and no reply
                  </p>
                </div>
              </label>

              {/* Stale */}
              <label className="flex items-start gap-3 p-3 rounded-lg bg-zinc-800/50 border border-zinc-700 cursor-pointer hover:bg-zinc-800 transition-colors">
                <Checkbox
                  checked={includeStale}
                  onCheckedChange={(checked) => setIncludeStale(!!checked)}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-amber-400" />
                    <span className="font-medium text-white">Stale</span>
                    <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">
                      {preview.stats.stale}
                    </Badge>
                  </div>
                  <p className="text-xs text-zinc-400 mt-1">
                    No activity for 30+ days in early pipeline stages
                  </p>
                </div>
              </label>

              {/* AI Filtered */}
              <label className="flex items-start gap-3 p-3 rounded-lg bg-zinc-800/50 border border-zinc-700 cursor-pointer hover:bg-zinc-800 transition-colors">
                <Checkbox
                  checked={includeAi}
                  onCheckedChange={(checked) => setIncludeAi(!!checked)}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Brain className="h-4 w-4 text-purple-400" />
                    <span className="font-medium text-white">AI Filtered</span>
                    <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30">
                      {preview.stats.aiFiltered}
                    </Badge>
                  </div>
                  <p className="text-xs text-zinc-400 mt-1">
                    Wrong industry, big chains, irrelevant job roles
                  </p>
                </div>
              </label>
            </div>

            {/* Preview List */}
            {getSelectedCount() > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                  <Archive className="h-4 w-4" />
                  Preview ({getSelectedCount()} prospects will be archived)
                </h4>
                <div className="max-h-48 overflow-auto rounded-lg border border-zinc-700 bg-zinc-800/30">
                  {includeUnresponsive && preview.unresponsive.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 last:border-0"
                    >
                      <div className="min-w-0">
                        <p className="text-sm text-white truncate">{p.name}</p>
                        <p className="text-xs text-zinc-500">{p.city}</p>
                      </div>
                      <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[10px] flex-shrink-0">
                        No reply
                      </Badge>
                    </div>
                  ))}
                  {includeStale && preview.stale.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 last:border-0"
                    >
                      <div className="min-w-0">
                        <p className="text-sm text-white truncate">{p.name}</p>
                        <p className="text-xs text-zinc-500">{p.city}</p>
                      </div>
                      <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px] flex-shrink-0">
                        Stale
                      </Badge>
                    </div>
                  ))}
                  {includeAi && preview.aiFiltered.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 last:border-0"
                    >
                      <div className="min-w-0">
                        <p className="text-sm text-white truncate">{p.name}</p>
                        <p className="text-xs text-zinc-500 truncate">{p.reason}</p>
                      </div>
                      <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30 text-[10px] flex-shrink-0">
                        AI
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {getSelectedCount() === 0 && (
              <div className="text-center py-8 text-zinc-500">
                <Archive className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No prospects selected for cleanup</p>
              </div>
            )}
          </div>
        ) : null}

        <DialogFooter className="border-t border-zinc-800 pt-4">
          {result ? (
            <Button onClick={() => onOpenChange(false)} className="bg-zinc-700 hover:bg-zinc-600">
              Close
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="border-zinc-700"
              >
                Cancel
              </Button>
              <Button
                onClick={runCleanup}
                disabled={running || loading || getSelectedCount() === 0}
                className="bg-red-600 hover:bg-red-700"
              >
                {running ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Cleaning...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Archive {getSelectedCount()} Prospects
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
