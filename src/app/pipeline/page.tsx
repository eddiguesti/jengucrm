'use client';

import { useState, useEffect } from 'react';
import { Header } from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Star, Loader2 } from 'lucide-react';
import Link from 'next/link';
import type { Prospect, ProspectStage } from '@/types';

const stages: { id: ProspectStage; name: string; color: string }[] = [
  { id: 'new', name: 'New', color: 'bg-blue-500' },
  { id: 'researching', name: 'Researching', color: 'bg-purple-500' },
  { id: 'outreach', name: 'Outreach', color: 'bg-cyan-500' },
  { id: 'engaged', name: 'Engaged', color: 'bg-emerald-500' },
  { id: 'meeting', name: 'Meeting', color: 'bg-amber-500' },
  { id: 'proposal', name: 'Proposal', color: 'bg-orange-500' },
  { id: 'won', name: 'Won', color: 'bg-green-500' },
  { id: 'lost', name: 'Lost', color: 'bg-red-500' },
];

function getTierDot(tier: string) {
  switch (tier) {
    case 'hot':
      return 'bg-red-500';
    case 'warm':
      return 'bg-amber-500';
    default:
      return 'bg-zinc-500';
  }
}

export default function PipelinePage() {
  const [prospectsByStage, setProspectsByStage] = useState<Record<string, Prospect[]>>({});
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  const fetchProspects = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/prospects?limit=500');
      if (!response.ok) throw new Error('Failed to fetch');

      const data = await response.json();
      const prospects: Prospect[] = data.prospects || [];

      // Group by stage
      const grouped: Record<string, Prospect[]> = {};
      for (const stage of stages) {
        grouped[stage.id] = prospects.filter((p) => p.stage === stage.id);
      }

      setProspectsByStage(grouped);
    } catch (error) {
      console.error('Failed to fetch prospects:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProspects();
  }, []);

  const handleDragStart = (e: React.DragEvent, prospectId: string) => {
    e.dataTransfer.setData('prospectId', prospectId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent, newStage: ProspectStage) => {
    e.preventDefault();
    const prospectId = e.dataTransfer.getData('prospectId');
    if (!prospectId) return;

    setUpdating(prospectId);

    try {
      const response = await fetch(`/api/prospects/${prospectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: newStage }),
      });

      if (!response.ok) throw new Error('Failed to update');

      // Refresh data
      await fetchProspects();
    } catch (error) {
      console.error('Failed to update stage:', error);
    } finally {
      setUpdating(null);
    }
  };

  const totalProspects = Object.values(prospectsByStage).reduce(
    (sum, arr) => sum + arr.length,
    0
  );

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Pipeline"
        subtitle={`${totalProspects} prospects • Drag cards to change stage`}
        action={{
          label: 'Refresh',
          onClick: fetchProspects,
        }}
      />

      <div className="flex-1 p-3 md:p-6 overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
          </div>
        ) : (
          <div className="flex gap-3 md:gap-4 h-full min-w-max">
            {stages.map((stage) => {
              const prospects = prospectsByStage[stage.id] || [];

              return (
                <div
                  key={stage.id}
                  className="w-64 md:w-72 flex-shrink-0"
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, stage.id)}
                >
                  <Card className="bg-zinc-900 border-zinc-800 h-full flex flex-col">
                    <CardHeader className="pb-2 md:pb-3 p-3 md:p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={`h-2 w-2 rounded-full ${stage.color}`} />
                          <CardTitle className="text-white text-xs md:text-sm font-medium">
                            {stage.name}
                          </CardTitle>
                        </div>
                        <Badge variant="secondary" className="bg-zinc-800 text-zinc-400 text-[10px] md:text-xs">
                          {prospects.length}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="flex-1 pt-0 p-3 md:p-4">
                      <ScrollArea className="h-[calc(100vh-200px)] md:h-[calc(100vh-220px)]">
                        <div className="space-y-2 md:space-y-3 pr-3 md:pr-4">
                          {prospects.map((prospect) => (
                            <div
                              key={prospect.id}
                              draggable
                              onDragStart={(e) => handleDragStart(e, prospect.id)}
                              className={`cursor-grab active:cursor-grabbing ${
                                updating === prospect.id ? 'opacity-50' : ''
                              }`}
                            >
                              <Link href={`/prospects/${prospect.id}`}>
                                <div className="p-2 md:p-3 rounded-lg bg-zinc-800 border border-zinc-700 hover:border-zinc-600 transition-colors">
                                  <div className="flex items-start justify-between mb-1.5 md:mb-2">
                                    <div className="flex items-center gap-1.5 md:gap-2 min-w-0">
                                      <div
                                        className={`h-2 w-2 rounded-full flex-shrink-0 ${getTierDot(
                                          prospect.tier
                                        )}`}
                                      />
                                      <h4 className="font-medium text-white text-xs md:text-sm line-clamp-1">
                                        {prospect.name}
                                      </h4>
                                    </div>
                                    <span className="text-[10px] md:text-xs font-medium text-zinc-400 flex-shrink-0">
                                      {prospect.score || 0}
                                    </span>
                                  </div>
                                  {prospect.source_job_title && (
                                    <p className="text-[10px] md:text-xs text-emerald-400 mb-1 line-clamp-1">
                                      {prospect.source_job_title}
                                    </p>
                                  )}
                                  <div className="flex items-center justify-between text-[10px] md:text-xs text-zinc-400">
                                    <span className="truncate">{prospect.city}{prospect.country ? `, ${prospect.country}` : ''}</span>
                                    {prospect.google_rating && (
                                      <span className="flex items-center gap-1 flex-shrink-0">
                                        <Star className="h-2.5 w-2.5 md:h-3 md:w-3 text-amber-400 fill-amber-400" />
                                        {prospect.google_rating}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </Link>
                            </div>
                          ))}

                          {prospects.length === 0 && (
                            <div className="py-6 md:py-8 text-center text-zinc-500 text-xs md:text-sm">
                              No prospects in this stage
                            </div>
                          )}
                        </div>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
