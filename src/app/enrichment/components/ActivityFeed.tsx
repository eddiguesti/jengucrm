'use client';

import { cn } from '@/lib/utils';
import { useTheme } from '@/contexts/ThemeContext';
import { CheckCircle2, Globe, Mail, ExternalLink, ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

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

interface ActivityFeedProps {
  items: ActivityItem[];
  loading?: boolean;
}

export function ActivityFeed({ items, loading }: ActivityFeedProps) {
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const [expanded, setExpanded] = useState(false);

  const displayItems = expanded ? items : items.slice(0, 5);

  const getActionIcon = (action: ActivityItem['action']) => {
    switch (action) {
      case 'fully_enriched':
        return { Icon: CheckCircle2, color: 'text-emerald-500' };
      case 'email_found':
        return { Icon: Mail, color: 'text-blue-500' };
      case 'website_found':
        return { Icon: Globe, color: 'text-violet-500' };
      default:
        return { Icon: CheckCircle2, color: 'text-slate-500' };
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  if (items.length === 0 && !loading) {
    return null;
  }

  return (
    <div
      className={cn(
        'rounded-xl border overflow-hidden',
        isLight ? 'bg-white border-slate-200' : 'bg-zinc-900 border-zinc-800'
      )}
    >
      {/* Header */}
      <div className={cn('px-4 py-3 border-b', isLight ? 'border-slate-200' : 'border-zinc-800')}>
        <h3 className="font-medium">Recent Activity</h3>
        <p className="text-xs text-muted-foreground">Enrichments from the last 24 hours</p>
      </div>

      {/* Items */}
      <div className="divide-y divide-inherit">
        {loading ? (
          <div className="p-4 text-center text-muted-foreground text-sm">Loading...</div>
        ) : (
          displayItems.map((item) => {
            const { Icon, color } = getActionIcon(item.action);
            return (
              <div
                key={item.id}
                className={cn(
                  'p-3 flex items-center gap-3 hover:bg-accent/50 transition-colors',
                  item.isRecent && (isLight ? 'bg-violet-50/50' : 'bg-violet-900/10')
                )}
              >
                {/* Icon */}
                <div className={cn('p-1.5 rounded-lg', isLight ? 'bg-slate-100' : 'bg-zinc-800')}>
                  <Icon className={cn('h-4 w-4', color)} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/prospects/${item.id}`}
                      className="font-medium text-sm truncate hover:underline"
                    >
                      {item.name}
                    </Link>
                    {item.isRecent && (
                      <span
                        className={cn(
                          'text-[10px] px-1.5 py-0.5 rounded-full',
                          isLight ? 'bg-violet-100 text-violet-700' : 'bg-violet-900/50 text-violet-300'
                        )}
                      >
                        New
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{item.location}</p>
                </div>

                {/* Data badges */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {item.website && (
                    <a
                      href={item.website.startsWith('http') ? item.website : `https://${item.website}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        'inline-flex items-center gap-1 text-xs px-2 py-1 rounded',
                        isLight ? 'bg-violet-100 text-violet-700 hover:bg-violet-200' : 'bg-violet-900/30 text-violet-400 hover:bg-violet-900/50'
                      )}
                    >
                      <Globe className="h-3 w-3" />
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {item.email && (
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 text-xs px-2 py-1 rounded',
                        isLight ? 'bg-blue-100 text-blue-700' : 'bg-blue-900/30 text-blue-400'
                      )}
                    >
                      <Mail className="h-3 w-3" />
                      <span className="max-w-[80px] truncate">{item.email.split('@')[0]}</span>
                    </span>
                  )}
                </div>

                {/* Timestamp */}
                <span className="text-xs text-muted-foreground flex-shrink-0 w-16 text-right">
                  {formatTime(item.timestamp)}
                </span>
              </div>
            );
          })
        )}
      </div>

      {/* Show more button */}
      {items.length > 5 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className={cn(
            'w-full px-4 py-2 text-xs font-medium flex items-center justify-center gap-1 border-t transition-colors',
            isLight ? 'border-slate-200 hover:bg-slate-50 text-slate-600' : 'border-zinc-800 hover:bg-zinc-800 text-zinc-400'
          )}
        >
          {expanded ? 'Show less' : `Show ${items.length - 5} more`}
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-180')} />
        </button>
      )}
    </div>
  );
}
