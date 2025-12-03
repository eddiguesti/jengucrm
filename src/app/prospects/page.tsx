'use client';

import { useState, useEffect, useMemo } from 'react';
import { Header } from '@/components/layout/header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Search,
  MoreHorizontal,
  Mail,
  ExternalLink,
  Star,
  MapPin,
  Loader2,
  RefreshCw,
  LayoutGrid,
  List,
  Sparkles,
  User,
  Zap,
  CheckCircle2,
  Clock,
  AlertCircle,
  Archive,
} from 'lucide-react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import type { Prospect, ProspectTier } from '@/types';
import { AddProspectDialog } from '@/components/add-prospect-dialog';
import { ProspectCard } from '@/components/prospect-card';
import { BatteryIndicator, BatteryCompact } from '@/components/ui/battery-indicator';
import {
  calculateReadiness,
  getReadinessSummary,
  groupByReadiness,
  type ReadinessTier,
} from '@/lib/readiness';

// View mode type
type ViewMode = 'table' | 'cards' | 'grouped';

// Readiness filter type
type ReadinessFilter = ReadinessTier | 'all';

function getTierBadge(tier: string) {
  switch (tier) {
    case 'hot':
      return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Hot</Badge>;
    case 'warm':
      return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">Warm</Badge>;
    default:
      return <Badge className="bg-zinc-500/20 text-zinc-400 border-zinc-500/30">Cold</Badge>;
  }
}

function getStageBadge(stage: string) {
  const stageColors: Record<string, string> = {
    new: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    researching: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    outreach: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
    engaged: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    meeting: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    proposal: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    won: 'bg-green-500/20 text-green-400 border-green-500/30',
    lost: 'bg-red-500/20 text-red-400 border-red-500/30',
  };

  return (
    <Badge className={stageColors[stage] || stageColors.new}>
      {stage.charAt(0).toUpperCase() + stage.slice(1)}
    </Badge>
  );
}

// Readiness summary card component
function ReadinessSummary({
  summary,
  activeFilter,
  onFilterChange,
  isLight,
}: {
  summary: ReturnType<typeof getReadinessSummary>;
  activeFilter: ReadinessFilter;
  onFilterChange: (filter: ReadinessFilter) => void;
  isLight: boolean;
}) {
  const items = [
    {
      key: 'email_ready' as const,
      label: 'Email Ready',
      shortLabel: 'Ready',
      count: summary.emailReady,
      icon: CheckCircle2,
      color: 'text-emerald-400',
      bgColor: 'bg-emerald-500/10 border-emerald-500/20',
      activeColor: 'bg-emerald-500/20 border-emerald-500/40',
    },
    {
      key: 'almost_ready' as const,
      label: 'Almost Ready',
      shortLabel: 'Almost',
      count: summary.almostReady,
      icon: Zap,
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/10 border-blue-500/20',
      activeColor: 'bg-blue-500/20 border-blue-500/40',
    },
    {
      key: 'needs_enrichment' as const,
      label: 'Needs Enrichment',
      shortLabel: 'Enrich',
      count: summary.needsEnrichment,
      icon: Clock,
      color: 'text-amber-400',
      bgColor: 'bg-amber-500/10 border-amber-500/20',
      activeColor: 'bg-amber-500/20 border-amber-500/40',
    },
    {
      key: 'needs_research' as const,
      label: 'Needs Research',
      shortLabel: 'Research',
      count: summary.needsResearch,
      icon: AlertCircle,
      color: 'text-orange-400',
      bgColor: 'bg-orange-500/10 border-orange-500/20',
      activeColor: 'bg-orange-500/20 border-orange-500/40',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-3">
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = activeFilter === item.key;
        return (
          <button
            key={item.key}
            onClick={() => onFilterChange(isActive ? 'all' : item.key)}
            className={`
              flex items-center gap-2 md:gap-3 p-2 md:p-3 rounded-xl border transition-all duration-200 shadow-[var(--shadow-soft)] backdrop-blur
              ${isActive ? item.activeColor : item.bgColor}
              ${isLight ? 'bg-white text-slate-900 border-[#efe7dc]' : ''}
              hover:translate-y-[-2px] active:scale-[0.99]
            `}
          >
            <Icon className={`h-4 w-4 md:h-5 md:w-5 ${item.color} flex-shrink-0`} />
            <div className="text-left min-w-0">
              <p className={`text-lg md:text-xl font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{item.count}</p>
              <p className={`text-[10px] md:text-xs ${isLight ? 'text-slate-600' : item.color} truncate`}>
                <span className="hidden sm:inline">{item.label}</span>
                <span className="sm:hidden">{item.shortLabel}</span>
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export default function ProspectsPage() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [tierFilter, setTierFilter] = useState<ProspectTier | null>(null);
  const [readinessFilter, setReadinessFilter] = useState<ReadinessFilter>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const { theme } = useTheme();
  const isLight = theme === 'light';

  const fetchProspects = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (tierFilter) params.set('tier', tierFilter);
      if (searchQuery) params.set('search', searchQuery);

      const response = await fetch(`/api/prospects?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch prospects');

      const data = await response.json();
      setProspects(data.data?.prospects || data.prospects || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load prospects');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProspects();
  }, [tierFilter]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchProspects();
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Calculate readiness summary
  const readinessSummary = useMemo(() => {
    return getReadinessSummary(prospects);
  }, [prospects]);

  // Filter prospects by readiness
  const filteredProspects = useMemo(() => {
    if (readinessFilter === 'all') return prospects;

    return prospects.filter((p) => {
      const { tier } = calculateReadiness(p);
      return tier === readinessFilter;
    });
  }, [prospects, readinessFilter]);

  // Group prospects by readiness for grouped view
  const groupedProspects = useMemo(() => {
    return groupByReadiness(filteredProspects);
  }, [filteredProspects]);

  // Handle action from prospect card
  const handleProspectAction = async (action: string, prospectId: string) => {
    switch (action) {
      case 'generate_email':
        window.location.href = `/prospects/${prospectId}?action=generate`;
        break;
      case 'find_contact':
      case 'enrich':
        // TODO: Trigger enrichment API
        window.location.href = `/prospects/${prospectId}?action=enrich`;
        break;
      case 'research':
      case 'view':
      default:
        window.location.href = `/prospects/${prospectId}`;
        break;
    }
  };

  // Archive a prospect
  const handleArchive = async (prospectId: string) => {
    try {
      const response = await fetch(`/api/prospects/${prospectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: true, archive_reason: 'manual' }),
      });
      if (response.ok) {
        // Remove from local list
        setProspects(prev => prev.filter(p => p.id !== prospectId));
      }
    } catch (err) {
      console.error('Failed to archive prospect:', err);
    }
  };

  return (
    <div
      className={cn(
        "flex flex-col h-full transition-colors",
        isLight ? "bg-gradient-to-br from-[#fef9f3] via-white to-[#f6f2eb]" : ""
      )}
    >
      <Header
        title="Prospects"
        subtitle={`${prospects.length} total prospects`}
        action={{
          label: 'Add Prospect',
          onClick: () => setShowAddDialog(true),
        }}
      />

      <div className="flex-1 p-4 md:p-6 space-y-3 md:space-y-4 overflow-auto">
        {/* Readiness Summary */}
        <Card
          className={cn(
            "border",
            isLight
              ? "bg-gradient-to-br from-white via-[#f9f5ee] to-white border-[#efe7dc] shadow-[var(--shadow-strong)]"
              : "bg-zinc-900 border-zinc-800"
          )}
        >
          <CardContent className="p-3 md:p-4">
            <ReadinessSummary
              summary={readinessSummary}
              activeFilter={readinessFilter}
              onFilterChange={setReadinessFilter}
              isLight={isLight}
            />
          </CardContent>
        </Card>

        {/* Filters & View Toggle */}
        <Card
          className={cn(
            isLight
              ? "bg-white border-[#efe7dc] shadow-[var(--shadow-soft)]"
              : "bg-zinc-900 border-zinc-800"
          )}
        >
          <CardContent className="p-3 md:p-4">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
              {/* Search */}
              <div className="relative flex-1">
                <Search
                  className={cn(
                    "absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2",
                    isLight ? "text-slate-400" : "text-zinc-500"
                  )}
                />
                <Input
                  placeholder="Search prospects..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={cn(
                    "pl-9 h-9 text-sm",
                    isLight
                      ? "bg-white border-[#efe7dc] text-slate-900 placeholder:text-slate-400"
                      : "bg-zinc-800 border-zinc-700"
                  )}
                />
              </div>

              {/* Tier Filters - scrollable on mobile */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                <Button
                  variant={tierFilter === null ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setTierFilter(null)}
                  className={cn(
                    "h-8 px-2.5 text-xs flex-shrink-0",
                    tierFilter === null
                      ? isLight
                        ? "bg-slate-900 text-white hover:bg-slate-800"
                        : ""
                      : isLight
                        ? "text-slate-600 hover:bg-slate-100"
                        : "text-zinc-300"
                  )}
                >
                  All
                </Button>
                <Button
                  variant={tierFilter === 'hot' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setTierFilter('hot')}
                  className={cn(
                    "h-8 px-2.5 text-xs flex-shrink-0",
                    isLight ? "text-red-500 hover:bg-red-50" : "text-red-400"
                  )}
                >
                  Hot
                </Button>
                <Button
                  variant={tierFilter === 'warm' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setTierFilter('warm')}
                  className={cn(
                    "h-8 px-2.5 text-xs flex-shrink-0",
                    isLight ? "text-amber-500 hover:bg-amber-50" : "text-amber-400"
                  )}
                >
                  Warm
                </Button>
                <Button
                  variant={tierFilter === 'cold' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setTierFilter('cold')}
                  className={cn(
                    "h-8 px-2.5 text-xs flex-shrink-0",
                    isLight ? "text-slate-500 hover:bg-slate-50" : "text-zinc-400"
                  )}
                >
                  Cold
                </Button>
              </div>

              {/* View Mode Toggle & Refresh */}
              <div className="flex items-center gap-2 sm:gap-3">
                <div
                  className={cn(
                    "flex items-center gap-1 rounded-md p-0.5",
                    isLight ? "border border-[#efe7dc] bg-white" : "border border-zinc-700"
                  )}
                >
                  <Button
                    variant={viewMode === 'table' ? 'secondary' : 'ghost'}
                    size="sm"
                    className={cn(
                      "h-7 px-2",
                      isLight && viewMode !== 'table' ? "text-slate-600 hover:bg-slate-100" : ""
                    )}
                    onClick={() => setViewMode('table')}
                  >
                    <List className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={viewMode === 'cards' ? 'secondary' : 'ghost'}
                    size="sm"
                    className={cn(
                      "h-7 px-2",
                      isLight && viewMode !== 'cards' ? "text-slate-600 hover:bg-slate-100" : ""
                    )}
                    onClick={() => setViewMode('cards')}
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </Button>
                </div>

                {/* Refresh */}
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    "h-8 px-2.5",
                    isLight ? "border-[#efe7dc] text-slate-700 hover:bg-slate-50" : "border-zinc-700"
                  )}
                  onClick={fetchProspects}
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                  <span className="hidden sm:inline ml-2">Refresh</span>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className={cn("h-8 w-8 animate-spin", isLight ? "text-slate-500" : "text-amber-500")} />
          </div>
        )}

        {/* Error State */}
        {error && (
          <Card className={cn(isLight ? "bg-red-50 border-red-200" : "bg-red-500/10 border-red-500/30")}>
            <CardContent className="p-4">
              <p className={cn(isLight ? "text-red-600" : "text-red-400")}>{error}</p>
              <Button
                variant="outline"
                size="sm"
                className={cn("mt-2", isLight ? "border-red-200 text-red-600 hover:bg-red-50" : "border-red-500/30 text-red-400")}
                onClick={fetchProspects}
              >
                Retry
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Empty State */}
        {!loading && !error && filteredProspects.length === 0 && (
          <Card className={cn(isLight ? "bg-white border-[#efe7dc] shadow-[var(--shadow-soft)]" : "bg-zinc-900 border-zinc-800")}>
            <CardContent className="p-8 md:p-12 text-center">
              <div
                className={cn(
                  "w-12 h-12 md:w-16 md:h-16 mx-auto mb-4 rounded-full flex items-center justify-center",
                  isLight ? "bg-slate-100" : "bg-zinc-800"
                )}
              >
                <Search className={cn("h-6 w-6 md:h-8 md:w-8", isLight ? "text-slate-400" : "text-zinc-500")} />
              </div>
              <p className={cn("mb-4 text-sm md:text-base", isLight ? "text-slate-600" : "text-zinc-400")}>
                {readinessFilter !== 'all'
                  ? `No prospects in "${readinessFilter.replace('_', ' ')}" status`
                  : 'No prospects found'}
              </p>
              {readinessFilter !== 'all' ? (
                <Button
                  variant="outline"
                  onClick={() => setReadinessFilter('all')}
                  className={cn("text-sm", isLight ? "border-[#efe7dc] text-slate-700 hover:bg-slate-50" : "border-zinc-700")}
                >
                  Show All Prospects
                </Button>
              ) : (
                <Link href="/lead-sources">
                  <Button className="bg-amber-500 hover:bg-amber-600 text-black text-sm">
                    Run Scraper to Find Prospects
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>
        )}

        {/* Card View */}
        {!loading && !error && filteredProspects.length > 0 && viewMode === 'cards' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="grid gap-3 md:gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            {filteredProspects.map((prospect, index) => (
              <motion.div
                key={prospect.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03 }}
              >
                <ProspectCard
                  prospect={prospect}
                  onAction={handleProspectAction}
                />
              </motion.div>
            ))}
          </motion.div>
        )}

        {/* Table View */}
        {!loading && !error && filteredProspects.length > 0 && viewMode === 'table' && (
          <Card
            className={cn(
              "overflow-x-auto",
              isLight
                ? "bg-white border-[#efe7dc] shadow-[var(--shadow-soft)]"
                : "bg-zinc-900 border-zinc-800"
            )}
          >
            <Table>
              <TableHeader>
                <TableRow className={cn(isLight ? "border-[#efe7dc] hover:bg-transparent" : "border-zinc-800 hover:bg-transparent")}>
                  <TableHead className={cn("w-12 text-xs", isLight ? "text-slate-500" : "text-zinc-400")}>Ready</TableHead>
                  <TableHead className={cn("text-xs", isLight ? "text-slate-500" : "text-zinc-400")}>Property</TableHead>
                  <TableHead className={cn("hidden md:table-cell text-xs", isLight ? "text-slate-500" : "text-zinc-400")}>Location</TableHead>
                  <TableHead className={cn("hidden lg:table-cell text-xs", isLight ? "text-slate-500" : "text-zinc-400")}>Rating</TableHead>
                  <TableHead className={cn("hidden sm:table-cell text-xs", isLight ? "text-slate-500" : "text-zinc-400")}>Tier</TableHead>
                  <TableHead className={cn("hidden lg:table-cell text-xs", isLight ? "text-slate-500" : "text-zinc-400")}>Stage</TableHead>
                  <TableHead className={cn("hidden md:table-cell text-xs", isLight ? "text-slate-500" : "text-zinc-400")}>Score</TableHead>
                  <TableHead className={cn("text-right text-xs", isLight ? "text-slate-500" : "text-zinc-400")}>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <AnimatePresence>
                  {filteredProspects.map((prospect, index) => {
                    const readiness = calculateReadiness(prospect);
                    return (
                      <motion.tr
                        key={prospect.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.02 }}
                        className={cn(
                          "group",
                          isLight
                            ? "border-[#efe7dc] hover:bg-slate-50"
                            : "border-zinc-800 hover:bg-zinc-800/50"
                        )}
                      >
                        <TableCell className="py-2">
                          <BatteryCompact percentage={readiness.total} />
                        </TableCell>
                        <TableCell className="py-2">
                          <Link
                            href={`/prospects/${prospect.id}`}
                            className="flex items-center gap-2 md:gap-3 group/link"
                          >
                            <div
                              className={cn(
                                "h-8 w-8 md:h-10 md:w-10 rounded-lg flex items-center justify-center text-xs md:text-sm font-medium flex-shrink-0",
                                isLight ? "bg-slate-100 text-slate-800" : "bg-zinc-700 text-white"
                              )}
                            >
                              {prospect.name.charAt(0)}
                            </div>
                            <div className="min-w-0">
                              <p
                                className={cn(
                                  "font-medium transition-colors text-xs md:text-sm truncate max-w-[120px] sm:max-w-[200px] md:max-w-none",
                                  isLight
                                    ? "text-slate-900 group-hover/link:text-blue-700"
                                    : "text-white group-hover/link:text-amber-400"
                                )}
                              >
                                {prospect.name}
                              </p>
                              {prospect.source_job_title ? (
                                <p className={cn("text-[10px] md:text-sm truncate", isLight ? "text-emerald-600" : "text-emerald-400")}>
                                  {prospect.source_job_title}
                                </p>
                              ) : (
                                <p className={cn("text-[10px] md:text-sm truncate", isLight ? "text-slate-500" : "text-zinc-500")}>
                                  {prospect.source}
                                </p>
                              )}
                            </div>
                          </Link>
                        </TableCell>
                        <TableCell className="hidden md:table-cell py-2">
                          <div className={cn("flex items-center gap-1 text-xs md:text-sm", isLight ? "text-slate-700" : "text-zinc-300")}>
                            <MapPin className={cn("h-3 w-3", isLight ? "text-slate-400" : "text-zinc-500")} />
                            {prospect.city}{prospect.country ? `, ${prospect.country}` : ''}
                          </div>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell py-2">
                          {prospect.google_rating ? (
                            <div className="flex items-center gap-1 text-sm">
                              <Star className="h-3 w-3 text-amber-400 fill-amber-400" />
                              <span className={cn(isLight ? "text-slate-900" : "text-white")}>{prospect.google_rating}</span>
                              <span className={cn("text-xs", isLight ? "text-slate-500" : "text-zinc-500")}>
                                ({prospect.google_review_count?.toLocaleString() || 0})
                              </span>
                            </div>
                          ) : (
                            <span className={cn(isLight ? "text-slate-400" : "text-zinc-500")}>-</span>
                          )}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell py-2">{getTierBadge(prospect.tier)}</TableCell>
                        <TableCell className="hidden lg:table-cell py-2">{getStageBadge(prospect.stage)}</TableCell>
                        <TableCell className="hidden md:table-cell py-2">
                          <span className={cn("font-medium text-sm", isLight ? "text-slate-900" : "text-white")}>
                            {prospect.score || 0}
                          </span>
                        </TableCell>
                        <TableCell className="text-right py-2">
                          <div className="flex items-center justify-end gap-1 md:gap-2">
                            {/* Quick Action Button - hidden on mobile, appears on hover on desktop */}
                            <Button
                              size="sm"
                              className={`
                                h-6 md:h-7 text-[10px] md:text-xs px-2 hidden sm:flex opacity-0 group-hover:opacity-100 transition-opacity
                                ${readiness.tier === 'email_ready'
                                  ? 'bg-emerald-600 hover:bg-emerald-500'
                                  : readiness.tier === 'almost_ready'
                                    ? 'bg-blue-600 hover:bg-blue-500'
                                    : 'bg-amber-600 hover:bg-amber-500'
                                }
                              `}
                              onClick={() => handleProspectAction(readiness.nextAction.action, prospect.id)}
                            >
                              {readiness.tier === 'email_ready' && <Sparkles className="h-3 w-3 mr-1" />}
                              {readiness.tier === 'almost_ready' && <User className="h-3 w-3 mr-1" />}
                              <span className="hidden md:inline">{readiness.nextAction.label}</span>
                              <span className="md:hidden">Go</span>
                            </Button>

                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7 md:h-8 md:w-8">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent
                                align="end"
                                className={cn(
                                  isLight ? "bg-white border-[#efe7dc] shadow-[var(--shadow-soft)]" : "bg-zinc-900 border-zinc-800"
                                )}
                              >
                                <DropdownMenuItem
                                  className={cn(
                                    "cursor-pointer text-sm",
                                    isLight ? "text-slate-800 focus:bg-slate-50" : "text-zinc-300 focus:bg-zinc-800"
                                  )}
                                  onClick={() => window.location.href = `/prospects/${prospect.id}`}
                                >
                                  <Mail className="h-4 w-4 mr-2" />
                                  View & Generate Email
                                </DropdownMenuItem>
                                {prospect.website && (
                                  <DropdownMenuItem
                                    className={cn(
                                      "cursor-pointer text-sm",
                                      isLight ? "text-slate-800 focus:bg-slate-50" : "text-zinc-300 focus:bg-zinc-800"
                                    )}
                                    onClick={() => window.open(prospect.website!, '_blank')}
                                  >
                                    <ExternalLink className="h-4 w-4 mr-2" />
                                    Visit Website
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem
                                  className={cn(
                                    "cursor-pointer text-sm",
                                    isLight ? "text-red-600 focus:bg-red-50" : "text-red-400 focus:bg-red-500/10"
                                  )}
                                  onClick={() => handleArchive(prospect.id)}
                                >
                                  <Archive className="h-4 w-4 mr-2" />
                                  Archive
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              </TableBody>
            </Table>
          </Card>
        )}

        {/* Results Count */}
        {!loading && !error && filteredProspects.length > 0 && (
          <div className={cn("text-xs md:text-sm text-center", isLight ? "text-slate-600" : "text-zinc-500")}>
            Showing {filteredProspects.length} of {prospects.length} prospects
            {readinessFilter !== 'all' && (
              <span className="ml-1 md:ml-2">
                (filtered by {readinessFilter.replace('_', ' ')})
              </span>
            )}
          </div>
        )}
      </div>

      <AddProspectDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onSuccess={fetchProspects}
      />
    </div>
  );
}
