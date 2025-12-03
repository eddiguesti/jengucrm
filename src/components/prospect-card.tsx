'use client';

import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { BatteryIndicator, BatteryRing } from '@/components/ui/battery-indicator';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  calculateReadiness,
  getTierInfo,
  groupByReadiness,
  type ReadinessBreakdown,
  type ProspectData,
} from '@/lib/readiness';
import {
  MapPin,
  Star,
  Mail,
  User,
  Globe,
  Building2,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Sparkles,
  Search,
  ArrowRight,
} from 'lucide-react';
import Link from 'next/link';

interface ProspectCardProps {
  prospect: ProspectData & {
    id: string;
    name: string;
    city?: string | null;
    country?: string | null;
  };
  variant?: 'default' | 'compact' | 'expanded';
  showActions?: boolean;
  onAction?: (action: string, prospectId: string) => void;
  className?: string;
}

/**
 * Premium prospect card with battery indicator
 */
export function ProspectCard({
  prospect,
  variant = 'default',
  showActions = true,
  onAction,
  className,
}: ProspectCardProps) {
  const readiness = calculateReadiness(prospect);
  const tierInfo = getTierInfo(readiness.tier);

  // Lead tier badge colors
  const leadTierColors = {
    hot: 'bg-red-500/20 text-red-400 border-red-500/30',
    warm: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    cold: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
  };

  const handleAction = () => {
    if (onAction) {
      onAction(readiness.nextAction.action, prospect.id);
    }
  };

  if (variant === 'compact') {
    return (
      <CompactProspectCard
        prospect={prospect}
        readiness={readiness}
        tierInfo={tierInfo}
        leadTierColors={leadTierColors}
        showActions={showActions}
        onAction={handleAction}
        className={className}
      />
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
    >
      <Card
        className={cn(
          'group relative overflow-hidden transition-all duration-300',
          'hover:border-zinc-700 hover:shadow-lg hover:shadow-black/20',
          'hover:-translate-y-0.5',
          readiness.tier === 'email_ready' && 'border-emerald-500/20 hover:border-emerald-500/40',
          className
        )}
      >
        {/* Top accent line */}
        <div
          className={cn(
            'absolute top-0 left-0 right-0 h-0.5 transition-opacity duration-300',
            readiness.tier === 'email_ready' && 'bg-gradient-to-r from-emerald-500 to-emerald-400',
            readiness.tier === 'almost_ready' && 'bg-gradient-to-r from-blue-500 to-blue-400',
            readiness.tier === 'needs_enrichment' && 'bg-gradient-to-r from-amber-500 to-amber-400',
            readiness.tier === 'needs_research' && 'bg-gradient-to-r from-orange-500 to-orange-400',
            readiness.tier === 'new_lead' && 'bg-zinc-600',
            'opacity-0 group-hover:opacity-100'
          )}
        />

        <CardContent className="p-4">
          <div className="flex items-start gap-4">
            {/* Battery Ring */}
            <div className="flex-shrink-0">
              <BatteryRing
                percentage={readiness.total}
                size={48}
                strokeWidth={4}
                showPercentage
              />
            </div>

            {/* Main Content */}
            <div className="flex-1 min-w-0">
              {/* Header Row */}
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <Link
                    href={`/prospects/${prospect.id}`}
                    className="group/link flex items-center gap-1.5"
                  >
                    <h3 className="font-semibold text-sm truncate group-hover/link:text-blue-400 transition-colors">
                      {prospect.name}
                    </h3>
                    <ExternalLink className="h-3 w-3 opacity-0 group-hover/link:opacity-100 transition-opacity text-blue-400" />
                  </Link>

                  {/* Location & Rating */}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                    {(prospect.city || prospect.country) && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {[prospect.city, prospect.country].filter(Boolean).join(', ')}
                      </span>
                    )}
                    {prospect.google_rating && (
                      <span className="flex items-center gap-1">
                        <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                        {prospect.google_rating}
                        {prospect.google_review_count && (
                          <span className="text-zinc-500">
                            ({prospect.google_review_count})
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                </div>

                {/* Badges */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {prospect.tier && (
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-[10px] px-1.5 py-0 h-5 capitalize border',
                        leadTierColors[prospect.tier as keyof typeof leadTierColors]
                      )}
                    >
                      {prospect.tier}
                    </Badge>
                  )}
                  {prospect.score && (
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1.5 py-0 h-5 bg-zinc-800 border-zinc-700"
                    >
                      {prospect.score}
                    </Badge>
                  )}
                </div>
              </div>

              {/* Data Indicators */}
              <div className="flex items-center gap-3 text-xs mb-3">
                <DataIndicator
                  icon={Mail}
                  label="Email"
                  status={prospect.email ? 'complete' : 'missing'}
                  detail={prospect.email_confidence}
                />
                <DataIndicator
                  icon={User}
                  label="Contact"
                  status={prospect.contact_name ? 'complete' : 'missing'}
                />
                <DataIndicator
                  icon={Globe}
                  label="Website"
                  status={prospect.website ? 'complete' : 'missing'}
                />
                <DataIndicator
                  icon={Building2}
                  label="Enriched"
                  status={prospect.google_place_id ? 'complete' : 'missing'}
                />
              </div>

              {/* Missing Data Warning */}
              {readiness.missingFields.length > 0 && readiness.tier !== 'email_ready' && (
                <div className="flex items-start gap-1.5 text-[11px] text-amber-400/80 mb-3">
                  <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                  <span>Missing: {readiness.missingFields.slice(0, 3).join(', ')}</span>
                </div>
              )}

              {/* Action Row */}
              {showActions && (
                <div className="flex items-center justify-between">
                  <div className={cn('text-[11px]', tierInfo.color)}>
                    {tierInfo.description}
                  </div>
                  <ActionButton
                    nextAction={readiness.nextAction}
                    prospectId={prospect.id}
                    onAction={onAction}
                  />
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

/**
 * Compact variant for dense lists
 */
function CompactProspectCard({
  prospect,
  readiness,
  tierInfo,
  leadTierColors,
  showActions,
  onAction,
  className,
}: {
  prospect: ProspectData & { id: string; name: string; city?: string | null; country?: string | null };
  readiness: ReadinessBreakdown;
  tierInfo: ReturnType<typeof getTierInfo>;
  leadTierColors: Record<string, string>;
  showActions: boolean;
  onAction: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'group flex items-center gap-3 p-3 rounded-lg border border-zinc-800',
        'bg-zinc-900/50 hover:bg-zinc-800/50 hover:border-zinc-700',
        'transition-all duration-200 cursor-pointer',
        className
      )}
    >
      {/* Battery */}
      <BatteryIndicator
        percentage={readiness.total}
        size="sm"
        showPercentage={false}
        animated={false}
      />

      {/* Name & Location */}
      <div className="flex-1 min-w-0">
        <Link href={`/prospects/${prospect.id}`} className="hover:text-blue-400 transition-colors">
          <span className="text-sm font-medium truncate block">{prospect.name}</span>
        </Link>
        <span className="text-xs text-muted-foreground">
          {[prospect.city, prospect.country].filter(Boolean).join(', ') || 'No location'}
        </span>
      </div>

      {/* Rating */}
      {prospect.google_rating && (
        <div className="flex items-center gap-1 text-xs text-amber-400">
          <Star className="h-3 w-3 fill-current" />
          {prospect.google_rating}
        </div>
      )}

      {/* Tier Badge */}
      {prospect.tier && (
        <Badge
          variant="outline"
          className={cn(
            'text-[10px] px-1.5 py-0 h-5 capitalize border',
            leadTierColors[prospect.tier as keyof typeof leadTierColors]
          )}
        >
          {prospect.tier}
        </Badge>
      )}

      {/* Readiness Percentage */}
      <span className={cn('text-xs font-medium tabular-nums w-8', tierInfo.color)}>
        {readiness.total}%
      </span>

      {/* Action */}
      {showActions && (
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => {
            e.preventDefault();
            onAction();
          }}
        >
          {readiness.nextAction.label}
          <ArrowRight className="h-3 w-3 ml-1" />
        </Button>
      )}
    </div>
  );
}

/**
 * Data indicator chip
 */
function DataIndicator({
  icon: Icon,
  label,
  status,
  detail,
}: {
  icon: React.ElementType;
  label: string;
  status: 'complete' | 'missing' | 'partial';
  detail?: string | null;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-1',
        status === 'complete' ? 'text-emerald-400' : 'text-zinc-500'
      )}
    >
      {status === 'complete' ? (
        <CheckCircle2 className="h-3 w-3" />
      ) : (
        <Icon className="h-3 w-3" />
      )}
      <span className={status === 'missing' ? 'line-through opacity-50' : ''}>
        {label}
      </span>
      {detail === 'high' && (
        <span className="text-[9px] text-emerald-400 uppercase font-medium">verified</span>
      )}
    </div>
  );
}

/**
 * Smart action button based on next action
 */
function ActionButton({
  nextAction,
  prospectId,
  onAction,
}: {
  nextAction: ReadinessBreakdown['nextAction'];
  prospectId: string;
  onAction?: (action: string, prospectId: string) => void;
}) {
  const getButtonStyle = () => {
    switch (nextAction.action) {
      case 'generate_email':
        return 'bg-emerald-600 hover:bg-emerald-500 text-white';
      case 'find_contact':
        return 'bg-blue-600 hover:bg-blue-500 text-white';
      case 'enrich':
        return 'bg-amber-600 hover:bg-amber-500 text-white';
      default:
        return 'bg-zinc-700 hover:bg-zinc-600 text-white';
    }
  };

  const getIcon = () => {
    switch (nextAction.action) {
      case 'generate_email':
        return <Sparkles className="h-3 w-3" />;
      case 'find_contact':
        return <User className="h-3 w-3" />;
      case 'enrich':
        return <Search className="h-3 w-3" />;
      default:
        return <ArrowRight className="h-3 w-3" />;
    }
  };

  const handleClick = () => {
    if (onAction) {
      onAction(nextAction.action, prospectId);
    }
  };

  return (
    <Button
      size="sm"
      className={cn('h-7 text-xs gap-1.5 shadow-sm', getButtonStyle())}
      onClick={handleClick}
    >
      {getIcon()}
      {nextAction.label}
    </Button>
  );
}

/**
 * Prospect list grouped by readiness
 */
export function ProspectListGrouped({
  prospects,
  onAction,
}: {
  prospects: (ProspectData & { id: string; name: string; city?: string | null; country?: string | null })[];
  onAction?: (action: string, prospectId: string) => void;
}) {
  const groups = groupByReadiness(prospects);

  const tierOrder: Array<{ key: string; label: string; color: string }> = [
    { key: 'email_ready', label: 'Email Ready', color: 'text-emerald-400' },
    { key: 'almost_ready', label: 'Almost Ready', color: 'text-blue-400' },
    { key: 'needs_enrichment', label: 'Needs Enrichment', color: 'text-amber-400' },
    { key: 'needs_research', label: 'Needs Research', color: 'text-orange-400' },
    { key: 'new_lead', label: 'New Leads', color: 'text-zinc-400' },
  ];

  return (
    <div className="space-y-6">
      {tierOrder.map(({ key, label, color }) => {
        const groupProspects = groups[key as keyof typeof groups];
        if (!groupProspects || groupProspects.length === 0) return null;

        return (
          <div key={key}>
            <div className="flex items-center gap-2 mb-3">
              <h3 className={cn('text-sm font-medium', color)}>{label}</h3>
              <Badge variant="outline" className="text-[10px] h-5">
                {groupProspects.length}
              </Badge>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {groupProspects.map((prospect: typeof prospects[0]) => (
                <ProspectCard
                  key={prospect.id}
                  prospect={prospect}
                  onAction={onAction}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
