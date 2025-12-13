'use client';

import { cn } from '@/lib/utils';
import { useTheme } from '@/contexts/ThemeContext';
import { AlertTriangle, Info, XCircle, Clock, ChevronRight } from 'lucide-react';
import Link from 'next/link';

interface Alert {
  type: 'info' | 'warning' | 'error';
  title: string;
  message: string;
  action?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  count?: number;
}

interface AlertBannerProps {
  alerts: Alert[];
}

export function AlertBanner({ alerts }: AlertBannerProps) {
  const { theme } = useTheme();
  const isLight = theme === 'light';

  if (alerts.length === 0) {
    return null;
  }

  const getAlertStyles = (type: Alert['type']) => {
    switch (type) {
      case 'error':
        return {
          bg: isLight ? 'bg-red-50 border-red-200' : 'bg-red-900/20 border-red-800',
          icon: isLight ? 'text-red-600' : 'text-red-400',
          title: isLight ? 'text-red-800' : 'text-red-300',
          text: isLight ? 'text-red-600' : 'text-red-400',
        };
      case 'warning':
        return {
          bg: isLight ? 'bg-amber-50 border-amber-200' : 'bg-amber-900/20 border-amber-800',
          icon: isLight ? 'text-amber-600' : 'text-amber-400',
          title: isLight ? 'text-amber-800' : 'text-amber-300',
          text: isLight ? 'text-amber-600' : 'text-amber-400',
        };
      case 'info':
      default:
        return {
          bg: isLight ? 'bg-blue-50 border-blue-200' : 'bg-blue-900/20 border-blue-800',
          icon: isLight ? 'text-blue-600' : 'text-blue-400',
          title: isLight ? 'text-blue-800' : 'text-blue-300',
          text: isLight ? 'text-blue-600' : 'text-blue-400',
        };
    }
  };

  const getIcon = (type: Alert['type']) => {
    switch (type) {
      case 'error':
        return XCircle;
      case 'warning':
        return AlertTriangle;
      case 'info':
      default:
        return Info;
    }
  };

  return (
    <div className="space-y-3">
      {alerts.map((alert, i) => {
        const styles = getAlertStyles(alert.type);
        const Icon = getIcon(alert.type);

        return (
          <div
            key={i}
            className={cn('rounded-xl p-4 border', styles.bg)}
          >
            <div className="flex items-start gap-3">
              <Icon className={cn('h-5 w-5 flex-shrink-0 mt-0.5', styles.icon)} />
              <div className="flex-1 min-w-0">
                <p className={cn('font-medium', styles.title)}>
                  {alert.title}
                  {alert.count !== undefined && (
                    <span className="ml-2 font-normal opacity-75">({alert.count})</span>
                  )}
                </p>
                <p className={cn('text-sm mt-0.5', styles.text)}>{alert.message}</p>
              </div>
              {alert.action && (
                alert.action.href ? (
                  <Link
                    href={alert.action.href}
                    className={cn(
                      'flex items-center gap-1 text-sm font-medium flex-shrink-0',
                      styles.icon,
                      'hover:underline'
                    )}
                  >
                    {alert.action.label}
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                ) : (
                  <button
                    onClick={alert.action.onClick}
                    className={cn(
                      'flex items-center gap-1 text-sm font-medium flex-shrink-0',
                      styles.icon,
                      'hover:underline'
                    )}
                  >
                    {alert.action.label}
                    <ChevronRight className="h-4 w-4" />
                  </button>
                )
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Helper to build common alerts from stats
export function buildAlerts(stats: {
  stuckCount?: number;
  needsWebsite?: number;
  needsEmail?: number;
}): Alert[] {
  const alerts: Alert[] = [];

  if (stats.stuckCount && stats.stuckCount > 100) {
    alerts.push({
      type: 'warning',
      title: 'Prospects stuck in "new" stage',
      message: `${stats.stuckCount} prospects have been waiting for over 7 days. They may need manual review or have unusual names.`,
      count: stats.stuckCount,
      action: {
        label: 'View list',
        href: '/prospects?stage=new&sort=created_at&order=asc',
      },
    });
  }

  return alerts;
}
