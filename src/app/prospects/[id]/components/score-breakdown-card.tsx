'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

interface ScoreBreakdownCardProps {
  scoreBreakdown: Record<string, number>;
  totalScore: number;
}

export function ScoreBreakdownCard({ scoreBreakdown, totalScore }: ScoreBreakdownCardProps) {
  if (!scoreBreakdown || Object.keys(scoreBreakdown).length === 0) return null;

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader>
        <CardTitle className="text-white text-base">Score Breakdown</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {Object.entries(scoreBreakdown).map(([key, value]) => (
            <div key={key} className="flex items-center justify-between text-sm">
              <span className="text-zinc-400">
                {key.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
              </span>
              <span className="text-emerald-400">+{value as number}</span>
            </div>
          ))}
          <Separator className="bg-zinc-800 my-2" />
          <div className="flex items-center justify-between font-medium">
            <span className="text-white">Total Score</span>
            <span className="text-white">{totalScore}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
