'use client';

import { cn } from '@/lib/utils';
import { useTheme } from '@/contexts/ThemeContext';
import { CheckCircle2, Circle, Mail, Globe, Send, Users } from 'lucide-react';
import { Fragment } from 'react';

interface PipelineVizProps {
  stats: {
    total: number;
    needsWebsite: number;
    hasWebsite: number;
    hasEmail: number;
    contacted: number;
  };
  loading?: boolean;
}

export function PipelineViz({ stats, loading }: PipelineVizProps) {
  const { theme } = useTheme();
  const isLight = theme === 'light';

  const totalProspects = stats.total || 1;
  const overallProgress = Math.round(((stats.hasEmail || 0) / totalProspects) * 100);

  const stages = [
    {
      key: 'new',
      label: 'Need Website',
      count: stats.needsWebsite || 0,
      icon: Circle,
      color: 'slate',
      bgColor: isLight ? 'bg-slate-100' : 'bg-slate-800',
      textColor: isLight ? 'text-slate-600' : 'text-slate-400',
      iconColor: 'text-slate-500',
    },
    {
      key: 'hasWebsite',
      label: 'Have Website',
      count: (stats.hasWebsite || 0) - (stats.hasEmail || 0),
      icon: Globe,
      color: 'blue',
      bgColor: isLight ? 'bg-blue-100' : 'bg-blue-900/30',
      textColor: isLight ? 'text-blue-700' : 'text-blue-400',
      iconColor: 'text-blue-500',
    },
    {
      key: 'hasEmail',
      label: 'Have Email',
      count: (stats.hasEmail || 0) - (stats.contacted || 0),
      icon: Mail,
      color: 'emerald',
      bgColor: isLight ? 'bg-emerald-100' : 'bg-emerald-900/30',
      textColor: isLight ? 'text-emerald-700' : 'text-emerald-400',
      iconColor: 'text-emerald-500',
    },
    {
      key: 'contacted',
      label: 'Contacted',
      count: stats.contacted || 0,
      icon: Send,
      color: 'violet',
      bgColor: isLight ? 'bg-violet-100' : 'bg-violet-900/30',
      textColor: isLight ? 'text-violet-700' : 'text-violet-400',
      iconColor: 'text-violet-500',
    },
  ];

  return (
    <div
      className={cn(
        'rounded-xl p-6 border',
        isLight ? 'bg-white border-slate-200' : 'bg-zinc-900 border-zinc-800'
      )}
    >
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold">Enrichment Pipeline</h2>
          <p className="text-sm text-muted-foreground">Track your prospects through the enrichment process</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold">{overallProgress}%</p>
          <p className="text-xs text-muted-foreground">email coverage</p>
        </div>
      </div>

      {/* Pipeline stages */}
      <div className="flex items-center justify-between gap-2 mb-6">
        {stages.map((stage, i) => (
          <Fragment key={stage.key}>
            <div className="flex-1 text-center">
              <div
                className={cn(
                  'w-14 h-14 rounded-full mx-auto flex items-center justify-center mb-2 transition-all',
                  stage.bgColor,
                  stage.count > 0 && 'ring-2 ring-offset-2',
                  stage.count > 0 && stage.color === 'slate' && 'ring-slate-300',
                  stage.count > 0 && stage.color === 'blue' && 'ring-blue-300',
                  stage.count > 0 && stage.color === 'emerald' && 'ring-emerald-300',
                  stage.count > 0 && stage.color === 'violet' && 'ring-violet-300',
                  isLight ? 'ring-offset-white' : 'ring-offset-zinc-900'
                )}
              >
                <stage.icon className={cn('h-6 w-6', stage.iconColor)} />
              </div>
              <p className="text-xs font-medium text-muted-foreground">{stage.label}</p>
              <p className={cn('text-lg font-bold', stage.textColor)}>
                {loading ? '...' : stage.count.toLocaleString()}
              </p>
            </div>
            {i < stages.length - 1 && (
              <div className={cn('flex-shrink-0 w-8 h-0.5', isLight ? 'bg-slate-200' : 'bg-zinc-700')} />
            )}
          </Fragment>
        ))}
      </div>

      {/* Overall progress bar */}
      <div>
        <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
          <span>Progress to email ready</span>
          <span>{stats.hasEmail?.toLocaleString() || 0} / {stats.total?.toLocaleString() || 0}</span>
        </div>
        <div className={cn('h-3 rounded-full overflow-hidden', isLight ? 'bg-slate-100' : 'bg-zinc-800')}>
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-500 via-emerald-500 to-violet-500 transition-all duration-500"
            style={{ width: `${Math.min(overallProgress, 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
