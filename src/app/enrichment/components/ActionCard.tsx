'use client';

import { cn } from '@/lib/utils';
import { useTheme } from '@/contexts/ThemeContext';
import { Button } from '@/components/ui/button';
import { Sparkles, Loader2, ChevronDown, Globe, Mail } from 'lucide-react';
import { useState } from 'react';

interface ActionCardProps {
  needsEnrichment: number;
  onStartEnrichment: (type: 'auto' | 'websites' | 'emails') => void;
  isRunning: boolean;
  disabled?: boolean;
}

export function ActionCard({
  needsEnrichment,
  onStartEnrichment,
  isRunning,
  disabled,
}: ActionCardProps) {
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <div
      className={cn(
        'rounded-xl p-6 border',
        isLight
          ? 'bg-gradient-to-br from-violet-50 to-blue-50 border-violet-200'
          : 'bg-gradient-to-br from-violet-900/20 to-blue-900/20 border-violet-800'
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h2 className="text-lg font-semibold mb-1">Ready to Enrich</h2>
          <p className="text-muted-foreground">
            {needsEnrichment > 0 ? (
              <>
                <span className="font-medium text-foreground">{needsEnrichment.toLocaleString()}</span>{' '}
                prospects are waiting to be enriched. Click the button to find their websites and emails automatically.
              </>
            ) : (
              'All prospects are fully enriched. New prospects will be enriched automatically.'
            )}
          </p>
        </div>

        <div className="flex-shrink-0">
          <Button
            onClick={() => onStartEnrichment('auto')}
            disabled={disabled || isRunning || needsEnrichment === 0}
            size="lg"
            className={cn(
              'h-12 px-6 font-medium',
              isLight
                ? 'bg-violet-600 hover:bg-violet-700 text-white'
                : 'bg-violet-600 hover:bg-violet-500 text-white'
            )}
          >
            {isRunning ? (
              <>
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                Running...
              </>
            ) : (
              <>
                <Sparkles className="h-5 w-5 mr-2" />
                Start Enrichment
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Advanced options (collapsible) */}
      <div className="mt-4">
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className={cn(
            'flex items-center gap-1 text-xs font-medium transition-colors',
            isLight ? 'text-slate-500 hover:text-slate-700' : 'text-zinc-500 hover:text-zinc-300'
          )}
        >
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showAdvanced && 'rotate-180')} />
          Advanced options
        </button>

        {showAdvanced && (
          <div className="mt-3 flex gap-2">
            <Button
              onClick={() => onStartEnrichment('websites')}
              disabled={disabled || isRunning}
              variant="outline"
              size="sm"
              className="h-8"
            >
              <Globe className="h-4 w-4 mr-1.5" />
              Websites Only
            </Button>
            <Button
              onClick={() => onStartEnrichment('emails')}
              disabled={disabled || isRunning}
              variant="outline"
              size="sm"
              className="h-8"
            >
              <Mail className="h-4 w-4 mr-1.5" />
              Emails Only
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
