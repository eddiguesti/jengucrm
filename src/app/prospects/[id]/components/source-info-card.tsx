'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, Linkedin, Globe, UserPlus, Briefcase, Database, Calendar } from 'lucide-react';
import type { Prospect } from '@/types';

interface SourceInfoCardProps {
  prospect: Prospect;
}

function getSourceBadge(source: string | null) {
  const sourceNorm = source?.toLowerCase() || '';

  if (sourceNorm.includes('sales_navigator') || sourceNorm.includes('linkedin')) {
    return {
      icon: Linkedin,
      label: 'Sales Navigator',
      className: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    };
  }
  if (sourceNorm.includes('google') || sourceNorm.includes('scraper') || sourceNorm === 'google_maps') {
    return {
      icon: Globe,
      label: 'Google Maps',
      className: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    };
  }
  if (sourceNorm.includes('manual')) {
    return {
      icon: UserPlus,
      label: 'Manual Entry',
      className: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    };
  }
  if (sourceNorm.includes('job') || sourceNorm.includes('hosco') || sourceNorm.includes('hcareers') || sourceNorm.includes('indeed')) {
    return {
      icon: Briefcase,
      label: 'Job Board',
      className: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    };
  }
  return {
    icon: Database,
    label: source || 'Unknown',
    className: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
  };
}

export function SourceInfoCard({ prospect }: SourceInfoCardProps) {
  const sourceBadge = getSourceBadge(prospect.source);
  const SourceIcon = sourceBadge.icon;

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-white text-base flex items-center gap-2">
          <Database className="h-4 w-4" />
          Source & Origin
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {/* Source Badge - Prominent */}
        <div className="flex items-center gap-2">
          <Badge className={`${sourceBadge.className} px-3 py-1.5 text-sm flex items-center gap-1.5`}>
            <SourceIcon className="h-4 w-4" />
            {sourceBadge.label}
          </Badge>
        </div>

        {/* Tags */}
        {prospect.tags && prospect.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {prospect.tags.map((tag, idx) => (
              <Badge key={idx} variant="outline" className="text-[10px] text-zinc-400 border-zinc-700">
                {tag}
              </Badge>
            ))}
          </div>
        )}

        {prospect.source_job_title && (
          <div className="p-2 rounded bg-zinc-800/50">
            <p className="text-zinc-500 text-xs mb-1">Job Posting</p>
            <p className="text-white font-medium">{prospect.source_job_title}</p>
          </div>
        )}

        {prospect.source_url && (
          <a
            href={prospect.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-amber-400 hover:underline flex items-center gap-1 text-sm"
          >
            View original source <ExternalLink className="h-3 w-3" />
          </a>
        )}

        {prospect.linkedin_url && (
          <a
            href={prospect.linkedin_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:underline flex items-center gap-1 text-sm"
          >
            <Linkedin className="h-3 w-3" /> LinkedIn Profile <ExternalLink className="h-3 w-3" />
          </a>
        )}

        <div className="flex items-center gap-2 text-zinc-500 pt-2 border-t border-zinc-800">
          <Calendar className="h-3 w-3" />
          <span className="text-xs">
            Added {prospect.created_at ? new Date(prospect.created_at).toLocaleDateString() : '-'}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
