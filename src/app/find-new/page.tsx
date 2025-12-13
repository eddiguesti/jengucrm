'use client';

import { useState } from 'react';
import { Header } from '@/components/layout/header';
import { cn } from '@/lib/utils';
import { useTheme } from '@/contexts/ThemeContext';
import {
  Linkedin,
  Sparkles,
  Mail,
  Briefcase,
  ChevronRight,
} from 'lucide-react';
import Link from 'next/link';

const tools = [
  {
    id: 'sales-navigator',
    name: 'Sales Navigator',
    description: 'Import LinkedIn prospects from CSV exports',
    icon: Linkedin,
    href: '/sales-navigator',
    color: 'blue',
    features: ['CSV Import', 'Auto-deduplication', 'Enrichment queue'],
  },
  {
    id: 'enrichment',
    name: 'Enrichment',
    description: 'Find websites and emails for prospects',
    icon: Sparkles,
    href: '/enrichment',
    color: 'violet',
    features: ['Website finder', 'Email discovery', 'Verification'],
  },
  {
    id: 'mystery-shopper',
    name: 'Mystery Shopper',
    description: 'Find GM contacts via inquiry emails',
    icon: Mail,
    href: '/mystery-shopper',
    color: 'amber',
    features: ['Auto inquiries', 'Reply tracking', 'Contact extraction'],
  },
  {
    id: 'lead-sources',
    name: 'Lead Sources',
    description: 'Scrape job boards and mine reviews',
    icon: Briefcase,
    href: '/lead-sources',
    color: 'emerald',
    features: ['Job board scraping', 'Review mining', 'Pain signal detection'],
  },
];

export default function FindNewPage() {
  const { theme } = useTheme();
  const isLight = theme === 'light';

  const getColorClasses = (color: string) => {
    const colors: Record<string, { bg: string; border: string; icon: string; hover: string }> = {
      blue: {
        bg: isLight ? 'bg-blue-50' : 'bg-blue-500/10',
        border: isLight ? 'border-blue-200' : 'border-blue-500/20',
        icon: 'text-blue-500',
        hover: isLight ? 'hover:border-blue-300 hover:bg-blue-100' : 'hover:border-blue-500/40 hover:bg-blue-500/20',
      },
      violet: {
        bg: isLight ? 'bg-violet-50' : 'bg-violet-500/10',
        border: isLight ? 'border-violet-200' : 'border-violet-500/20',
        icon: 'text-violet-500',
        hover: isLight ? 'hover:border-violet-300 hover:bg-violet-100' : 'hover:border-violet-500/40 hover:bg-violet-500/20',
      },
      amber: {
        bg: isLight ? 'bg-amber-50' : 'bg-amber-500/10',
        border: isLight ? 'border-amber-200' : 'border-amber-500/20',
        icon: 'text-amber-500',
        hover: isLight ? 'hover:border-amber-300 hover:bg-amber-100' : 'hover:border-amber-500/40 hover:bg-amber-500/20',
      },
      emerald: {
        bg: isLight ? 'bg-emerald-50' : 'bg-emerald-500/10',
        border: isLight ? 'border-emerald-200' : 'border-emerald-500/20',
        icon: 'text-emerald-500',
        hover: isLight ? 'hover:border-emerald-300 hover:bg-emerald-100' : 'hover:border-emerald-500/40 hover:bg-emerald-500/20',
      },
    };
    return colors[color] || colors.emerald;
  };

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Find New Prospects"
        subtitle="Import, scrape, and discover new leads"
      />

      <main className="flex-1 p-4 md:p-6 overflow-auto">
        {/* Tool Cards Grid */}
        <div className="grid gap-4 md:grid-cols-2">
          {tools.map((tool) => {
            const colors = getColorClasses(tool.color);
            return (
              <Link
                key={tool.id}
                href={tool.href}
                className={cn(
                  'group relative rounded-xl border p-5 transition-all duration-200',
                  colors.bg,
                  colors.border,
                  colors.hover
                )}
              >
                <div className="flex items-start gap-4">
                  <div
                    className={cn(
                      'flex h-12 w-12 items-center justify-center rounded-xl',
                      isLight ? 'bg-white shadow-sm' : 'bg-white/10'
                    )}
                  >
                    <tool.icon className={cn('h-6 w-6', colors.icon)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h3
                        className={cn(
                          'font-semibold',
                          isLight ? 'text-slate-900' : 'text-white'
                        )}
                      >
                        {tool.name}
                      </h3>
                      <ChevronRight
                        className={cn(
                          'h-5 w-5 transition-transform group-hover:translate-x-1',
                          isLight ? 'text-slate-400' : 'text-white/40'
                        )}
                      />
                    </div>
                    <p
                      className={cn(
                        'mt-1 text-sm',
                        isLight ? 'text-slate-600' : 'text-white/60'
                      )}
                    >
                      {tool.description}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {tool.features.map((feature) => (
                        <span
                          key={feature}
                          className={cn(
                            'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                            isLight
                              ? 'bg-white/80 text-slate-600'
                              : 'bg-white/10 text-white/70'
                          )}
                        >
                          {feature}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        {/* Quick Tips */}
        <div
          className={cn(
            'mt-6 rounded-xl border p-5',
            isLight ? 'bg-white border-slate-200' : 'bg-zinc-900 border-zinc-800'
          )}
        >
          <h3
            className={cn(
              'text-sm font-semibold mb-3',
              isLight ? 'text-slate-900' : 'text-white'
            )}
          >
            Quick Tips
          </h3>
          <ul
            className={cn(
              'space-y-2 text-sm',
              isLight ? 'text-slate-600' : 'text-white/60'
            )}
          >
            <li className="flex items-start gap-2">
              <span className="text-emerald-500 font-bold">1.</span>
              <span>
                Start with <strong>Sales Navigator</strong> to import your LinkedIn saved leads
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-500 font-bold">2.</span>
              <span>
                Run <strong>Enrichment</strong> to find websites and verified emails
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-500 font-bold">3.</span>
              <span>
                Use <strong>Mystery Shopper</strong> for prospects with only generic emails
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-emerald-500 font-bold">4.</span>
              <span>
                Automate with <strong>Lead Sources</strong> to continuously find new prospects
              </span>
            </li>
          </ul>
        </div>
      </main>
    </div>
  );
}
