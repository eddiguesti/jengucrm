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
  Linkedin,
  Globe,
  UserPlus,
  Briefcase,
  Target,
  MessageSquare,
  Flame,
  Wrench,
  Filter,
  ChevronDown,
  ArrowUpDown,
  ChevronUp,
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

// Smart view type
type SmartView = 'all' | 'ready_to_contact' | 'awaiting_reply' | 'hot_leads' | 'needs_work';

// Source filter type
type SourceFilter = 'all' | 'sales_navigator' | 'google_maps' | 'manual' | 'job_board';

// Email status filter type
type EmailStatusFilter = 'all' | 'has_email' | 'no_email';

// Contact status filter type
type ContactStatusFilter = 'all' | 'not_contacted' | 'contacted' | 'replied';

// Sort column type
type SortColumn = 'readiness' | 'name' | 'city' | 'rating' | 'tier' | 'stage' | 'score' | 'created_at';
type SortDirection = 'asc' | 'desc';

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

  // New filter states
  const [smartView, setSmartView] = useState<SmartView>('all');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [emailStatusFilter, setEmailStatusFilter] = useState<EmailStatusFilter>('all');
  const [contactStatusFilter, setContactStatusFilter] = useState<ContactStatusFilter>('all');

  // Sorting state
  const [sortColumn, setSortColumn] = useState<SortColumn>('score');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const { theme } = useTheme();
  const isLight = theme === 'light';

  const fetchProspects = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (tierFilter) params.set('tier', tierFilter);
      if (searchQuery) params.set('search', searchQuery);
      if (smartView !== 'all') params.set('smart_view', smartView);
      if (sourceFilter !== 'all') params.set('source', sourceFilter);
      if (emailStatusFilter !== 'all') params.set('email_status', emailStatusFilter);
      if (contactStatusFilter !== 'all') params.set('contact_status', contactStatusFilter);

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

  // Clear other filters when smart view is selected
  const handleSmartViewChange = (view: SmartView) => {
    setSmartView(view);
    if (view !== 'all') {
      // Smart views are pre-built combinations, clear individual filters
      setSourceFilter('all');
      setEmailStatusFilter('all');
      setContactStatusFilter('all');
      setReadinessFilter('all');
    }
  };

  // Clear smart view when individual filters are used
  const handleFilterChange = (
    filterType: 'source' | 'email' | 'contact',
    value: string
  ) => {
    setSmartView('all'); // Clear smart view when using individual filters
    if (filterType === 'source') setSourceFilter(value as SourceFilter);
    if (filterType === 'email') setEmailStatusFilter(value as EmailStatusFilter);
    if (filterType === 'contact') setContactStatusFilter(value as ContactStatusFilter);
  };

  useEffect(() => {
    fetchProspects();
  }, [tierFilter, smartView, sourceFilter, emailStatusFilter, contactStatusFilter]);

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

  // Filter and sort prospects
  const filteredProspects = useMemo(() => {
    let filtered = prospects;

    // Apply readiness filter
    if (readinessFilter !== 'all') {
      filtered = filtered.filter((p) => {
        const { tier } = calculateReadiness(p);
        return tier === readinessFilter;
      });
    }

    // Apply sorting
    const sorted = [...filtered].sort((a, b) => {
      let aVal: number | string = 0;
      let bVal: number | string = 0;

      switch (sortColumn) {
        case 'readiness':
          aVal = calculateReadiness(a).total;
          bVal = calculateReadiness(b).total;
          break;
        case 'name':
          aVal = a.name?.toLowerCase() || '';
          bVal = b.name?.toLowerCase() || '';
          break;
        case 'city':
          aVal = a.city?.toLowerCase() || '';
          bVal = b.city?.toLowerCase() || '';
          break;
        case 'rating':
          aVal = a.google_rating || 0;
          bVal = b.google_rating || 0;
          break;
        case 'tier':
          const tierOrder = { hot: 3, warm: 2, cold: 1 };
          aVal = tierOrder[a.tier as keyof typeof tierOrder] || 0;
          bVal = tierOrder[b.tier as keyof typeof tierOrder] || 0;
          break;
        case 'stage':
          const stageOrder = { new: 1, researching: 2, outreach: 3, contacted: 4, engaged: 5, meeting: 6, proposal: 7, won: 8, lost: 9 };
          aVal = stageOrder[a.stage as keyof typeof stageOrder] || 0;
          bVal = stageOrder[b.stage as keyof typeof stageOrder] || 0;
          break;
        case 'score':
          aVal = a.score || 0;
          bVal = b.score || 0;
          break;
        case 'created_at':
          aVal = new Date(a.created_at || 0).getTime();
          bVal = new Date(b.created_at || 0).getTime();
          break;
      }

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDirection === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });

    return sorted;
  }, [prospects, readinessFilter, sortColumn, sortDirection]);

  // Handle column sort
  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('desc');
    }
  };

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

        {/* Smart Views - Quick Filter Presets */}
        <Card
          className={cn(
            "border",
            isLight
              ? "bg-white border-[#efe7dc] shadow-[var(--shadow-soft)]"
              : "bg-zinc-900 border-zinc-800"
          )}
        >
          <CardContent className="p-3 md:p-4">
            <div className="flex items-center gap-2 mb-3">
              <Target className={cn("h-4 w-4", isLight ? "text-slate-500" : "text-zinc-400")} />
              <span className={cn("text-xs font-medium", isLight ? "text-slate-600" : "text-zinc-400")}>
                Smart Views
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                { key: 'all' as const, label: 'All Prospects', icon: Globe, color: 'zinc' },
                { key: 'ready_to_contact' as const, label: 'Ready to Contact', icon: CheckCircle2, color: 'emerald' },
                { key: 'awaiting_reply' as const, label: 'Awaiting Reply', icon: MessageSquare, color: 'blue' },
                { key: 'hot_leads' as const, label: 'Hot Leads', icon: Flame, color: 'red' },
                { key: 'needs_work' as const, label: 'Needs Work', icon: Wrench, color: 'amber' },
              ].map((view) => {
                const Icon = view.icon;
                const isActive = smartView === view.key;
                const colorClasses = {
                  zinc: isActive ? 'bg-zinc-600 text-white' : isLight ? 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700',
                  emerald: isActive ? 'bg-emerald-600 text-white' : isLight ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30',
                  blue: isActive ? 'bg-blue-600 text-white' : isLight ? 'bg-blue-50 text-blue-700 hover:bg-blue-100' : 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30',
                  red: isActive ? 'bg-red-600 text-white' : isLight ? 'bg-red-50 text-red-700 hover:bg-red-100' : 'bg-red-500/20 text-red-400 hover:bg-red-500/30',
                  amber: isActive ? 'bg-amber-600 text-white' : isLight ? 'bg-amber-50 text-amber-700 hover:bg-amber-100' : 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30',
                };
                return (
                  <button
                    key={view.key}
                    onClick={() => handleSmartViewChange(view.key)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all",
                      colorClasses[view.color as keyof typeof colorClasses]
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{view.label}</span>
                    <span className="sm:hidden">{view.label.split(' ')[0]}</span>
                  </button>
                );
              })}
            </div>
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
            <div className="flex flex-col gap-3">
              {/* Row 1: Search + View Toggle + Refresh */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                {/* Search */}
                <div className="relative flex-1">
                  <Search
                    className={cn(
                      "absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2",
                      isLight ? "text-slate-400" : "text-zinc-500"
                    )}
                  />
                  <Input
                    placeholder="Search prospects, contacts..."
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

                {/* View Mode Toggle & Refresh */}
                <div className="flex items-center gap-2">
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
                  </Button>
                </div>
              </div>

              {/* Row 2: Filter Dropdowns */}
              <div className="flex flex-wrap items-center gap-2">
                <Filter className={cn("h-4 w-4", isLight ? "text-slate-400" : "text-zinc-500")} />

                {/* Source Filter */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className={cn(
                        "h-8 text-xs gap-1",
                        sourceFilter !== 'all'
                          ? "bg-blue-500/10 border-blue-500/30 text-blue-500"
                          : isLight ? "border-[#efe7dc] text-slate-600" : "border-zinc-700 text-zinc-400"
                      )}
                    >
                      {sourceFilter === 'sales_navigator' && <Linkedin className="h-3.5 w-3.5" />}
                      {sourceFilter === 'google_maps' && <Globe className="h-3.5 w-3.5" />}
                      {sourceFilter === 'manual' && <UserPlus className="h-3.5 w-3.5" />}
                      {sourceFilter === 'job_board' && <Briefcase className="h-3.5 w-3.5" />}
                      {sourceFilter === 'all' ? 'Source' : sourceFilter.replace('_', ' ')}
                      <ChevronDown className="h-3 w-3 opacity-50" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className={cn(isLight ? "bg-white border-[#efe7dc]" : "bg-zinc-900 border-zinc-800")}>
                    <DropdownMenuItem onClick={() => handleFilterChange('source', 'all')} className={cn(isLight ? "text-slate-700" : "text-zinc-300")}>
                      <Globe className="h-4 w-4 mr-2" /> All Sources
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleFilterChange('source', 'sales_navigator')} className={cn(isLight ? "text-slate-700" : "text-zinc-300")}>
                      <Linkedin className="h-4 w-4 mr-2 text-blue-500" /> Sales Navigator
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleFilterChange('source', 'google_maps')} className={cn(isLight ? "text-slate-700" : "text-zinc-300")}>
                      <Globe className="h-4 w-4 mr-2 text-emerald-500" /> Google Maps
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleFilterChange('source', 'manual')} className={cn(isLight ? "text-slate-700" : "text-zinc-300")}>
                      <UserPlus className="h-4 w-4 mr-2 text-purple-500" /> Manual Entry
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleFilterChange('source', 'job_board')} className={cn(isLight ? "text-slate-700" : "text-zinc-300")}>
                      <Briefcase className="h-4 w-4 mr-2 text-amber-500" /> Job Boards
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Email Status Filter */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className={cn(
                        "h-8 text-xs gap-1",
                        emailStatusFilter !== 'all'
                          ? emailStatusFilter === 'has_email' ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500" : "bg-amber-500/10 border-amber-500/30 text-amber-500"
                          : isLight ? "border-[#efe7dc] text-slate-600" : "border-zinc-700 text-zinc-400"
                      )}
                    >
                      <Mail className="h-3.5 w-3.5" />
                      {emailStatusFilter === 'all' ? 'Email' : emailStatusFilter === 'has_email' ? 'Has Email' : 'Needs Email'}
                      <ChevronDown className="h-3 w-3 opacity-50" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className={cn(isLight ? "bg-white border-[#efe7dc]" : "bg-zinc-900 border-zinc-800")}>
                    <DropdownMenuItem onClick={() => handleFilterChange('email', 'all')} className={cn(isLight ? "text-slate-700" : "text-zinc-300")}>
                      <Mail className="h-4 w-4 mr-2" /> All
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleFilterChange('email', 'has_email')} className={cn(isLight ? "text-slate-700" : "text-zinc-300")}>
                      <CheckCircle2 className="h-4 w-4 mr-2 text-emerald-500" /> Has Email
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleFilterChange('email', 'no_email')} className={cn(isLight ? "text-slate-700" : "text-zinc-300")}>
                      <AlertCircle className="h-4 w-4 mr-2 text-amber-500" /> Needs Email
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Contact Status Filter */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className={cn(
                        "h-8 text-xs gap-1",
                        contactStatusFilter !== 'all'
                          ? contactStatusFilter === 'replied' ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500" : "bg-blue-500/10 border-blue-500/30 text-blue-500"
                          : isLight ? "border-[#efe7dc] text-slate-600" : "border-zinc-700 text-zinc-400"
                      )}
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                      {contactStatusFilter === 'all' ? 'Contact Status' : contactStatusFilter === 'not_contacted' ? 'Not Contacted' : contactStatusFilter === 'contacted' ? 'Contacted' : 'Replied'}
                      <ChevronDown className="h-3 w-3 opacity-50" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className={cn(isLight ? "bg-white border-[#efe7dc]" : "bg-zinc-900 border-zinc-800")}>
                    <DropdownMenuItem onClick={() => handleFilterChange('contact', 'all')} className={cn(isLight ? "text-slate-700" : "text-zinc-300")}>
                      <MessageSquare className="h-4 w-4 mr-2" /> All
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleFilterChange('contact', 'not_contacted')} className={cn(isLight ? "text-slate-700" : "text-zinc-300")}>
                      <Clock className="h-4 w-4 mr-2 text-zinc-500" /> Not Contacted
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleFilterChange('contact', 'contacted')} className={cn(isLight ? "text-slate-700" : "text-zinc-300")}>
                      <Mail className="h-4 w-4 mr-2 text-blue-500" /> Contacted
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleFilterChange('contact', 'replied')} className={cn(isLight ? "text-slate-700" : "text-zinc-300")}>
                      <CheckCircle2 className="h-4 w-4 mr-2 text-emerald-500" /> Replied
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Tier Filters */}
                <div className="flex items-center gap-1 ml-auto">
                  {[
                    { key: null, label: 'All' },
                    { key: 'hot' as const, label: 'Hot', color: 'red' },
                    { key: 'warm' as const, label: 'Warm', color: 'amber' },
                    { key: 'cold' as const, label: 'Cold', color: 'zinc' },
                  ].map((tier) => (
                    <Button
                      key={tier.key || 'all'}
                      variant={tierFilter === tier.key ? 'secondary' : 'ghost'}
                      size="sm"
                      onClick={() => setTierFilter(tier.key)}
                      className={cn(
                        "h-7 px-2 text-xs",
                        tierFilter === tier.key
                          ? isLight ? "bg-slate-900 text-white" : ""
                          : tier.color === 'red' ? (isLight ? "text-red-500 hover:bg-red-50" : "text-red-400")
                          : tier.color === 'amber' ? (isLight ? "text-amber-500 hover:bg-amber-50" : "text-amber-400")
                          : tier.color === 'zinc' ? (isLight ? "text-slate-500 hover:bg-slate-50" : "text-zinc-400")
                          : (isLight ? "text-slate-600 hover:bg-slate-100" : "text-zinc-300")
                      )}
                    >
                      {tier.label}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Active Filters Summary */}
              {(sourceFilter !== 'all' || emailStatusFilter !== 'all' || contactStatusFilter !== 'all' || smartView !== 'all') && (
                <div className="flex items-center gap-2 pt-2 border-t border-zinc-800">
                  <span className={cn("text-xs", isLight ? "text-slate-500" : "text-zinc-500")}>Active:</span>
                  <div className="flex flex-wrap gap-1">
                    {smartView !== 'all' && (
                      <Badge className="bg-purple-500/20 text-purple-400 text-xs">
                        {smartView.replace(/_/g, ' ')}
                      </Badge>
                    )}
                    {sourceFilter !== 'all' && (
                      <Badge className="bg-blue-500/20 text-blue-400 text-xs">
                        {sourceFilter.replace(/_/g, ' ')}
                      </Badge>
                    )}
                    {emailStatusFilter !== 'all' && (
                      <Badge className={cn("text-xs", emailStatusFilter === 'has_email' ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400")}>
                        {emailStatusFilter.replace(/_/g, ' ')}
                      </Badge>
                    )}
                    {contactStatusFilter !== 'all' && (
                      <Badge className="bg-blue-500/20 text-blue-400 text-xs">
                        {contactStatusFilter.replace(/_/g, ' ')}
                      </Badge>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs text-zinc-500 hover:text-zinc-300"
                    onClick={() => {
                      setSmartView('all');
                      setSourceFilter('all');
                      setEmailStatusFilter('all');
                      setContactStatusFilter('all');
                      setTierFilter(null);
                    }}
                  >
                    Clear all
                  </Button>
                </div>
              )}
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
                  <TableHead
                    className={cn("w-12 text-xs cursor-pointer select-none hover:text-white transition-colors", isLight ? "text-slate-500 hover:text-slate-900" : "text-zinc-400")}
                    onClick={() => handleSort('readiness')}
                  >
                    <div className="flex items-center gap-1">
                      Ready
                      {sortColumn === 'readiness' ? (
                        <ChevronUp className={cn("h-3 w-3", sortDirection === 'desc' && "rotate-180")} />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-50" />
                      )}
                    </div>
                  </TableHead>
                  <TableHead
                    className={cn("text-xs cursor-pointer select-none hover:text-white transition-colors", isLight ? "text-slate-500 hover:text-slate-900" : "text-zinc-400")}
                    onClick={() => handleSort('name')}
                  >
                    <div className="flex items-center gap-1">
                      Property
                      {sortColumn === 'name' ? (
                        <ChevronUp className={cn("h-3 w-3", sortDirection === 'desc' && "rotate-180")} />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-50" />
                      )}
                    </div>
                  </TableHead>
                  <TableHead
                    className={cn("hidden md:table-cell text-xs cursor-pointer select-none hover:text-white transition-colors", isLight ? "text-slate-500 hover:text-slate-900" : "text-zinc-400")}
                    onClick={() => handleSort('city')}
                  >
                    <div className="flex items-center gap-1">
                      Location
                      {sortColumn === 'city' ? (
                        <ChevronUp className={cn("h-3 w-3", sortDirection === 'desc' && "rotate-180")} />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-50" />
                      )}
                    </div>
                  </TableHead>
                  <TableHead
                    className={cn("hidden lg:table-cell text-xs cursor-pointer select-none hover:text-white transition-colors", isLight ? "text-slate-500 hover:text-slate-900" : "text-zinc-400")}
                    onClick={() => handleSort('rating')}
                  >
                    <div className="flex items-center gap-1">
                      Rating
                      {sortColumn === 'rating' ? (
                        <ChevronUp className={cn("h-3 w-3", sortDirection === 'desc' && "rotate-180")} />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-50" />
                      )}
                    </div>
                  </TableHead>
                  <TableHead
                    className={cn("hidden sm:table-cell text-xs cursor-pointer select-none hover:text-white transition-colors", isLight ? "text-slate-500 hover:text-slate-900" : "text-zinc-400")}
                    onClick={() => handleSort('tier')}
                  >
                    <div className="flex items-center gap-1">
                      Tier
                      {sortColumn === 'tier' ? (
                        <ChevronUp className={cn("h-3 w-3", sortDirection === 'desc' && "rotate-180")} />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-50" />
                      )}
                    </div>
                  </TableHead>
                  <TableHead
                    className={cn("hidden lg:table-cell text-xs cursor-pointer select-none hover:text-white transition-colors", isLight ? "text-slate-500 hover:text-slate-900" : "text-zinc-400")}
                    onClick={() => handleSort('stage')}
                  >
                    <div className="flex items-center gap-1">
                      Stage
                      {sortColumn === 'stage' ? (
                        <ChevronUp className={cn("h-3 w-3", sortDirection === 'desc' && "rotate-180")} />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-50" />
                      )}
                    </div>
                  </TableHead>
                  <TableHead
                    className={cn("hidden md:table-cell text-xs cursor-pointer select-none hover:text-white transition-colors", isLight ? "text-slate-500 hover:text-slate-900" : "text-zinc-400")}
                    onClick={() => handleSort('score')}
                  >
                    <div className="flex items-center gap-1">
                      Score
                      {sortColumn === 'score' ? (
                        <ChevronUp className={cn("h-3 w-3", sortDirection === 'desc' && "rotate-180")} />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-50" />
                      )}
                    </div>
                  </TableHead>
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
