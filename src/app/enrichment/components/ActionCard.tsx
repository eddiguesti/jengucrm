'use client';

import { cn } from '@/lib/utils';
import { useTheme } from '@/contexts/ThemeContext';
import { Button } from '@/components/ui/button';
import { Sparkles, Loader2 } from 'lucide-react';

interface ActionCardProps {
  needsEnrichment: number;
  onStartEnrichment: () => void;
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
            onClick={onStartEnrichment}
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
    </div>
  );
}
