'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Briefcase, ExternalLink } from 'lucide-react';

interface HiringSignalCardProps {
  jobTitle: string;
  sourceUrl?: string;
}

export function HiringSignalCard({ jobTitle, sourceUrl }: HiringSignalCardProps) {
  return (
    <Card className="bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border-emerald-500/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-white text-base flex items-center gap-2">
          <Briefcase className="h-4 w-4 text-emerald-500" />
          Hiring Signal
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <p className="text-xs text-zinc-500 uppercase tracking-wide">Position</p>
          <p className="text-white font-medium">{jobTitle}</p>
        </div>
        <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
          <p className="text-sm text-emerald-300">
            This property is actively hiring, indicating growth and potential need for your services.
          </p>
        </div>
        {sourceUrl && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-emerald-400 hover:underline flex items-center gap-1"
          >
            View Job Posting <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </CardContent>
    </Card>
  );
}
