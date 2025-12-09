'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowDown, TrendingDown, Users, Mail, MessageSquare, Calendar, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FunnelData {
  total: number;
  contacted: number;
  engaged: number;
  meeting: number;
  won: number;
  lost: number;
}

interface EnhancedFunnelCardProps {
  funnel: FunnelData;
  isLight?: boolean;
}

interface FunnelStage {
  key: keyof FunnelData;
  label: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
}

const stages: FunnelStage[] = [
  { key: 'total', label: 'Total Prospects', icon: Users, color: 'text-blue-400', bgColor: 'bg-blue-500' },
  { key: 'contacted', label: 'Contacted', icon: Mail, color: 'text-purple-400', bgColor: 'bg-purple-500' },
  { key: 'engaged', label: 'Engaged', icon: MessageSquare, color: 'text-amber-400', bgColor: 'bg-amber-500' },
  { key: 'meeting', label: 'Meeting', icon: Calendar, color: 'text-cyan-400', bgColor: 'bg-cyan-500' },
  { key: 'won', label: 'Won', icon: Trophy, color: 'text-emerald-400', bgColor: 'bg-emerald-500' },
];

function calculateConversionRate(from: number, to: number): number {
  if (from === 0) return 0;
  return Math.round((to / from) * 100);
}

function calculateDropOff(from: number, to: number): number {
  if (from === 0) return 0;
  return Math.round(((from - to) / from) * 100);
}

export function EnhancedFunnelCard({ funnel, isLight = false }: EnhancedFunnelCardProps) {
  const maxValue = funnel.total || 1;

  return (
    <Card className={cn(
      'border',
      isLight ? 'bg-white border-slate-200' : 'bg-zinc-900 border-zinc-800'
    )}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm md:text-base">
          <TrendingDown className="h-4 w-4 text-purple-400" />
          Conversion Funnel
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {stages.map((stage, index) => {
          const value = funnel[stage.key] || 0;
          const widthPercent = maxValue > 0 ? (value / maxValue) * 100 : 0;
          const Icon = stage.icon;

          // Calculate conversion from previous stage
          const prevStage = index > 0 ? stages[index - 1] : null;
          const prevValue = prevStage ? funnel[prevStage.key] || 0 : value;
          const conversionRate = index > 0 ? calculateConversionRate(prevValue, value) : 100;
          const dropOff = index > 0 ? calculateDropOff(prevValue, value) : 0;

          return (
            <div key={stage.key}>
              {/* Drop-off indicator between stages */}
              {index > 0 && dropOff > 0 && (
                <div className="flex items-center justify-center py-1">
                  <div className={cn(
                    'flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full',
                    isLight ? 'bg-red-50 text-red-600' : 'bg-red-500/10 text-red-400'
                  )}>
                    <ArrowDown className="h-2.5 w-2.5" />
                    {dropOff}% drop-off
                  </div>
                </div>
              )}

              {/* Funnel bar */}
              <div className="flex items-center gap-3">
                <div className={cn(
                  'p-1.5 rounded-lg',
                  isLight ? 'bg-slate-100' : 'bg-zinc-800'
                )}>
                  <Icon className={cn('h-4 w-4', stage.color)} />
                </div>

                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className={cn(
                      'text-xs font-medium',
                      isLight ? 'text-slate-700' : 'text-zinc-300'
                    )}>
                      {stage.label}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        'text-sm font-bold',
                        stage.color
                      )}>
                        {value.toLocaleString()}
                      </span>
                      {index > 0 && (
                        <span className={cn(
                          'text-[10px] px-1.5 py-0.5 rounded',
                          conversionRate >= 50
                            ? (isLight ? 'bg-emerald-50 text-emerald-600' : 'bg-emerald-500/10 text-emerald-400')
                            : conversionRate >= 20
                              ? (isLight ? 'bg-amber-50 text-amber-600' : 'bg-amber-500/10 text-amber-400')
                              : (isLight ? 'bg-red-50 text-red-600' : 'bg-red-500/10 text-red-400')
                        )}>
                          {conversionRate}%
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Visual bar with funnel shape */}
                  <div className={cn(
                    'h-3 rounded-full overflow-hidden',
                    isLight ? 'bg-slate-100' : 'bg-zinc-800'
                  )}>
                    <div
                      className={cn(
                        'h-full rounded-full transition-all duration-500',
                        stage.bgColor
                      )}
                      style={{ width: `${Math.max(widthPercent, 2)}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {/* Summary stats */}
        <div className={cn(
          'mt-4 pt-4 border-t grid grid-cols-3 gap-4',
          isLight ? 'border-slate-200' : 'border-zinc-800'
        )}>
          <div className="text-center">
            <p className={cn(
              'text-lg font-bold',
              isLight ? 'text-slate-900' : 'text-white'
            )}>
              {calculateConversionRate(funnel.total, funnel.contacted)}%
            </p>
            <p className={cn(
              'text-[10px]',
              isLight ? 'text-slate-500' : 'text-zinc-500'
            )}>
              Contact Rate
            </p>
          </div>
          <div className="text-center">
            <p className={cn(
              'text-lg font-bold',
              isLight ? 'text-slate-900' : 'text-white'
            )}>
              {calculateConversionRate(funnel.contacted, funnel.meeting)}%
            </p>
            <p className={cn(
              'text-[10px]',
              isLight ? 'text-slate-500' : 'text-zinc-500'
            )}>
              Meeting Rate
            </p>
          </div>
          <div className="text-center">
            <p className={cn(
              'text-lg font-bold text-emerald-400'
            )}>
              {calculateConversionRate(funnel.total, funnel.won)}%
            </p>
            <p className={cn(
              'text-[10px]',
              isLight ? 'text-slate-500' : 'text-zinc-500'
            )}>
              Win Rate
            </p>
          </div>
        </div>

        {/* Lost prospects indicator */}
        {funnel.lost > 0 && (
          <div className={cn(
            'mt-3 p-2 rounded-lg text-center',
            isLight ? 'bg-slate-50' : 'bg-zinc-800'
          )}>
            <p className={cn(
              'text-xs',
              isLight ? 'text-slate-500' : 'text-zinc-400'
            )}>
              <span className={cn(
                'font-medium',
                isLight ? 'text-red-600' : 'text-red-400'
              )}>{funnel.lost}</span> prospects marked as lost
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
