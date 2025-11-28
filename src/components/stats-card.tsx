import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';

interface StatsCardProps {
  title: string;
  value: string | number;
  change?: string;
  changeType?: 'positive' | 'negative' | 'neutral';
  icon: LucideIcon;
  iconColor?: string;
}

export function StatsCard({
  title,
  value,
  change,
  changeType = 'neutral',
  icon: Icon,
  iconColor = 'text-zinc-400',
}: StatsCardProps) {
  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-zinc-400">{title}</p>
            <p className="text-3xl font-bold text-white mt-1">{value}</p>
            {change && (
              <p
                className={cn(
                  'text-sm mt-1',
                  changeType === 'positive' && 'text-emerald-500',
                  changeType === 'negative' && 'text-red-500',
                  changeType === 'neutral' && 'text-zinc-400'
                )}
              >
                {change}
              </p>
            )}
          </div>
          <div className={cn('h-12 w-12 rounded-lg bg-zinc-800 flex items-center justify-center', iconColor)}>
            <Icon className="h-6 w-6" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
