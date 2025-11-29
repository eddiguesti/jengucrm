'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Star, ExternalLink } from 'lucide-react';
import type { PainSignal } from '@/types';

interface PainSignalsCardProps {
  painSignals: PainSignal[];
}

export function PainSignalsCard({ painSignals }: PainSignalsCardProps) {
  if (painSignals.length === 0) return null;

  return (
    <Card className="bg-gradient-to-br from-red-500/10 to-orange-500/5 border-red-500/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-white text-base flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-red-500" />
          Pain Signals ({painSignals.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
          <p className="text-sm text-red-300">
            Guests are complaining about communication issues - they need help!
          </p>
        </div>
        <div className="space-y-3 max-h-[300px] overflow-y-auto">
          {painSignals.slice(0, 5).map((signal) => (
            <div key={signal.id} className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700">
              <div className="flex items-center justify-between mb-2">
                <Badge className="bg-red-500/20 text-red-400 text-xs">
                  &quot;{signal.keyword_matched}&quot;
                </Badge>
                {signal.review_rating && (
                  <span className="flex items-center gap-1 text-xs">
                    <Star className="h-3 w-3 text-amber-400 fill-amber-400" />
                    {signal.review_rating}/5
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-300 line-clamp-3">
                &quot;{signal.review_snippet}&quot;
              </p>
              <div className="flex items-center justify-between mt-2 text-xs text-zinc-500">
                <span>{signal.reviewer_name || 'Anonymous'}</span>
                {signal.review_date && (
                  <span>{new Date(signal.review_date).toLocaleDateString()}</span>
                )}
              </div>
              {signal.review_url && (
                <a
                  href={signal.review_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-amber-400 hover:underline flex items-center gap-1 mt-1"
                >
                  View review <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          ))}
        </div>
        {painSignals.length > 5 && (
          <p className="text-xs text-zinc-500 text-center">
            +{painSignals.length - 5} more pain signals
          </p>
        )}
      </CardContent>
    </Card>
  );
}
