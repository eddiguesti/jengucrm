'use client';

import { useState, useEffect, useCallback } from 'react';
import { Header } from '@/components/layout/header';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useTheme } from '@/contexts/ThemeContext';
import { RefreshCw, Loader2 } from 'lucide-react';
import {
  StatsCards,
  PipelineViz,
  ActionCard,
  ProgressIndicator,
  AlertBanner,
  buildAlerts,
  ActivityFeed,
  EmptyState,
} from './components';

interface EnrichmentStats {
  total: number;
  needsWebsite: number;
  hasWebsite: number;
  needsEmail: number;
  hasEmail: number;
  fullyEnriched: number;
  contacted: number;
  byStage: Record<string, number>;
  last24h: number;
  stuckCount: number;
  hasContactName: number;
  hasStarRating: number;
  hasGoogleRating: number;
}

interface ActivityItem {
  id: string;
  name: string;
  location: string;
  action: 'website_found' | 'email_found' | 'fully_enriched';
  website?: string;
  email?: string;
  timestamp: string;
  isRecent: boolean;
}

interface EnrichmentStatus {
  stats: EnrichmentStats;
  pipeline: {
    waiting: number;
    hasWebsite: number;
    hasEmail: number;
    contacted: number;
  };
  coverage: {
    website: number;
    email: number;
    overall: number;
  };
  needsAttention: Array<{
    id: string;
    name: string;
    city: string | null;
    country: string | null;
    stage: string;
    website: string | null;
    email: string | null;
    contact_name: string | null;
    updated_at: string;
  }>;
  isRunning: boolean;
  progress: {
    processed: number;
    total: number;
    found: number;
    type: string;
  } | null;
  timestamp: string;
  error?: string;
}

export default function EnrichmentPage() {
  const { theme } = useTheme();
  const isLight = theme === 'light';

  const [status, setStatus] = useState<EnrichmentStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [activityLogs, setActivityLogs] = useState<ActivityItem[]>([]);
  const [hasEverEnriched, setHasEverEnriched] = useState(true);

  const fetchStatus = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    try {
      const response = await fetch('/api/enrichment/status');
      if (response.ok) {
        const data = await response.json();
        setStatus(data);
        // Check if this is first time (no enriched prospects)
        setHasEverEnriched(data.stats.hasWebsite > 0 || data.stats.hasEmail > 0);
      }
    } catch (err) {
      console.error('Failed to fetch enrichment status:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const fetchActivityLogs = useCallback(async () => {
    try {
      const response = await fetch('/api/enrichment/logs?limit=20');
      if (response.ok) {
        const data = await response.json();
        setActivityLogs(data.logs || []);
      }
    } catch (err) {
      console.error('Failed to fetch activity logs:', err);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchActivityLogs();

    // Auto-refresh every 30 seconds when not running
    const interval = setInterval(() => {
      if (!triggering) {
        fetchStatus();
        fetchActivityLogs();
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [fetchStatus, fetchActivityLogs, triggering]);

  const triggerEnrichment = async (type: 'auto' | 'websites' | 'emails') => {
    setTriggering(true);
    try {
      const response = await fetch('/api/enrichment/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      });

      if (response.ok) {
        // Status will update via SSE in ProgressIndicator
      }
    } catch (err) {
      console.error('Failed to trigger enrichment:', err);
    }
  };

  const handleEnrichmentComplete = useCallback(() => {
    setTriggering(false);
    // Refresh data after a short delay
    setTimeout(() => {
      fetchStatus();
      fetchActivityLogs();
    }, 1000);
  }, [fetchStatus, fetchActivityLogs]);

  const handleRefresh = () => {
    fetchStatus(true);
    fetchActivityLogs();
  };

  // Build alerts from current status
  const alerts = status ? buildAlerts({
    stuckCount: status.stats.stuckCount,
    needsWebsite: status.stats.needsWebsite,
    needsEmail: status.stats.needsEmail,
  }) : [];

  // Calculate needs enrichment count
  const needsEnrichment = status
    ? status.stats.needsWebsite + status.stats.needsEmail
    : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Header
        title="Enrichment"
        subtitle="Find websites and emails for your prospects"
        action={
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRefresh}
            disabled={refreshing}
            className={cn(
              'h-8 w-8 rounded-lg',
              isLight ? 'hover:bg-slate-100' : 'hover:bg-zinc-800'
            )}
          >
            <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
          </Button>
        }
      />

      <main className="flex-1 p-4 md:p-6 space-y-6 max-w-5xl mx-auto w-full">
        {/* First-time user experience */}
        {!hasEverEnriched && !triggering && (
          <EmptyState onStart={() => triggerEnrichment('auto')} isFirstTime />
        )}

        {/* Main content - show when has data or running */}
        {(hasEverEnriched || triggering) && (
          <>
            {/* Stats Cards */}
            <StatsCards
              total={status?.stats.total || 0}
              hasWebsite={status?.stats.hasWebsite || 0}
              hasEmail={status?.stats.hasEmail || 0}
              loading={!status}
            />

            {/* Pipeline Visualization */}
            <PipelineViz
              stats={{
                total: status?.stats.total || 0,
                needsWebsite: status?.stats.needsWebsite || 0,
                hasWebsite: status?.stats.hasWebsite || 0,
                hasEmail: status?.stats.hasEmail || 0,
                contacted: status?.stats.contacted || 0,
              }}
              loading={!status}
            />

            {/* Progress Indicator (shows when running) */}
            <ProgressIndicator
              isRunning={triggering}
              onComplete={handleEnrichmentComplete}
            />

            {/* Action Card (hide when running) */}
            {!triggering && (
              <ActionCard
                needsEnrichment={needsEnrichment}
                onStartEnrichment={triggerEnrichment}
                isRunning={triggering}
              />
            )}

            {/* Alerts */}
            {alerts.length > 0 && <AlertBanner alerts={alerts} />}

            {/* All caught up state */}
            {needsEnrichment === 0 && !triggering && hasEverEnriched && (
              <EmptyState onStart={() => triggerEnrichment('auto')} isFirstTime={false} />
            )}

            {/* Activity Feed */}
            {activityLogs.length > 0 && (
              <ActivityFeed items={activityLogs} loading={false} />
            )}
          </>
        )}

        {/* Last updated */}
        {status?.timestamp && (
          <p className="text-xs text-muted-foreground text-center pb-4">
            Last updated: {new Date(status.timestamp).toLocaleString()}
          </p>
        )}
      </main>
    </div>
  );
}
