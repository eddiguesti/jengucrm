'use client';

import { cn } from '@/lib/utils';
import { useTheme } from '@/contexts/ThemeContext';
import { Button } from '@/components/ui/button';
import { Sparkles, Globe, Mail, CheckCircle2, ArrowRight } from 'lucide-react';

interface EmptyStateProps {
  onStart: () => void;
  isFirstTime?: boolean;
}

export function EmptyState({ onStart, isFirstTime = false }: EmptyStateProps) {
  const { theme } = useTheme();
  const isLight = theme === 'light';

  if (isFirstTime) {
    return (
      <div className={cn('rounded-xl p-8 border text-center', isLight ? 'bg-white border-slate-200' : 'bg-zinc-900 border-zinc-800')}>
        <div className={cn('w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center', isLight ? 'bg-violet-100' : 'bg-violet-900/30')}>
          <Sparkles className={cn('h-8 w-8', isLight ? 'text-violet-600' : 'text-violet-400')} />
        </div>

        <h2 className="text-xl font-semibold mb-2">Welcome to Enrichment</h2>
        <p className="text-muted-foreground max-w-md mx-auto mb-6">
          Enrichment automatically finds official websites and decision-maker emails for your hotel prospects. Here&apos;s how it works:
        </p>

        {/* How it works */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8 max-w-2xl mx-auto">
          <div className={cn('p-4 rounded-lg', isLight ? 'bg-slate-50' : 'bg-zinc-800')}>
            <Globe className={cn('h-6 w-6 mx-auto mb-2', isLight ? 'text-blue-600' : 'text-blue-400')} />
            <p className="font-medium text-sm">Find Websites</p>
            <p className="text-xs text-muted-foreground mt-1">
              We search the web for each hotel&apos;s official website
            </p>
          </div>
          <div className={cn('p-4 rounded-lg', isLight ? 'bg-slate-50' : 'bg-zinc-800')}>
            <Mail className={cn('h-6 w-6 mx-auto mb-2', isLight ? 'text-emerald-600' : 'text-emerald-400')} />
            <p className="font-medium text-sm">Find Emails</p>
            <p className="text-xs text-muted-foreground mt-1">
              We find and verify decision-maker email addresses
            </p>
          </div>
          <div className={cn('p-4 rounded-lg', isLight ? 'bg-slate-50' : 'bg-zinc-800')}>
            <CheckCircle2 className={cn('h-6 w-6 mx-auto mb-2', isLight ? 'text-violet-600' : 'text-violet-400')} />
            <p className="font-medium text-sm">Ready to Contact</p>
            <p className="text-xs text-muted-foreground mt-1">
              Enriched prospects are ready for outreach campaigns
            </p>
          </div>
        </div>

        <Button
          onClick={onStart}
          size="lg"
          className={cn(
            'h-12 px-8',
            isLight
              ? 'bg-violet-600 hover:bg-violet-700 text-white'
              : 'bg-violet-600 hover:bg-violet-500 text-white'
          )}
        >
          <Sparkles className="h-5 w-5 mr-2" />
          Start Your First Enrichment
          <ArrowRight className="h-5 w-5 ml-2" />
        </Button>
      </div>
    );
  }

  // All enriched state
  return (
    <div className={cn('rounded-xl p-8 border text-center', isLight ? 'bg-emerald-50 border-emerald-200' : 'bg-emerald-900/20 border-emerald-800')}>
      <div className={cn('w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center', isLight ? 'bg-emerald-100' : 'bg-emerald-900/30')}>
        <CheckCircle2 className={cn('h-8 w-8', isLight ? 'text-emerald-600' : 'text-emerald-400')} />
      </div>

      <h2 className={cn('text-xl font-semibold mb-2', isLight ? 'text-emerald-800' : 'text-emerald-300')}>
        All Caught Up!
      </h2>
      <p className={cn('max-w-md mx-auto', isLight ? 'text-emerald-700' : 'text-emerald-400')}>
        All your prospects are fully enriched. New prospects will be automatically enriched as they come in.
      </p>
    </div>
  );
}
