'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ExternalLink } from 'lucide-react';
import type { Prospect } from '@/types';

interface SourceInfoCardProps {
  prospect: Prospect;
}

export function SourceInfoCard({ prospect }: SourceInfoCardProps) {
  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader>
        <CardTitle className="text-white text-base">Source</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-zinc-400">Found via</span>
          <span className="text-white capitalize">{prospect.source || 'unknown'}</span>
        </div>
        {prospect.source_job_title && (
          <div className="flex items-center justify-between">
            <span className="text-zinc-400">Job posting</span>
            <span className="text-white">{prospect.source_job_title}</span>
          </div>
        )}
        {prospect.source_url && (
          <a
            href={prospect.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-amber-400 hover:underline flex items-center gap-1"
          >
            View source <ExternalLink className="h-3 w-3" />
          </a>
        )}
        <div className="flex items-center justify-between">
          <span className="text-zinc-400">Added</span>
          <span className="text-white">
            {prospect.created_at ? new Date(prospect.created_at).toLocaleDateString() : '-'}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
