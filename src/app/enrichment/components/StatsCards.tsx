'use client';

import { cn } from '@/lib/utils';
import { useTheme } from '@/contexts/ThemeContext';
import { Database, Globe, Mail } from 'lucide-react';

interface StatsCardsProps {
  total: number;
  hasWebsite: number;
  hasEmail: number;
  loading?: boolean;
}

export function StatsCards({ total, hasWebsite, hasEmail, loading }: StatsCardsProps) {
  const { theme } = useTheme();
  const isLight = theme === 'light';

  const websiteCoverage = total > 0 ? Math.round((hasWebsite / total) * 100) : 0;
  const emailCoverage = total > 0 ? Math.round((hasEmail / total) * 100) : 0;

  const stats = [
    {
      icon: Database,
      label: 'Total Prospects',
      value: total.toLocaleString(),
      color: 'bg-slate-500',
      textColor: 'text-slate-600 dark:text-slate-400',
    },
    {
      icon: Globe,
      label: 'Have Website',
      value: hasWebsite.toLocaleString(),
      subtext: `${websiteCoverage}% coverage`,
      color: 'bg-blue-500',
      textColor: 'text-blue-600 dark:text-blue-400',
    },
    {
      icon: Mail,
      label: 'Have Email',
      value: hasEmail.toLocaleString(),
      subtext: `${emailCoverage}% coverage`,
      color: 'bg-emerald-500',
      textColor: 'text-emerald-600 dark:text-emerald-400',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className={cn(
            'rounded-xl p-5 border transition-all',
            isLight
              ? 'bg-white border-slate-200 hover:shadow-md'
              : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700',
            loading && 'animate-pulse'
          )}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className={cn('text-3xl font-bold tracking-tight', loading && 'text-muted-foreground')}>
                {loading ? '...' : stat.value}
              </p>
              <p className="text-sm text-muted-foreground mt-1">{stat.label}</p>
              {stat.subtext && (
                <p className={cn('text-xs mt-0.5', stat.textColor)}>{stat.subtext}</p>
              )}
            </div>
            <div className={cn('p-2.5 rounded-lg', stat.color)}>
              <stat.icon className="h-5 w-5 text-white" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
