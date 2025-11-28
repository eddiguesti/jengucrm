'use client';

import { useState, useEffect } from 'react';
import { Header } from '@/components/layout/header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
} from 'lucide-react';
import Link from 'next/link';
import type { Prospect, ProspectTier } from '@/types';
import { AddProspectDialog } from '@/components/add-prospect-dialog';

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

export default function ProspectsPage() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [tierFilter, setTierFilter] = useState<ProspectTier | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);

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
      setProspects(data.prospects || []);
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

  const filteredProspects = prospects;

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Prospects"
        subtitle={`${prospects.length} total prospects`}
        action={{
          label: 'Add Prospect',
          onClick: () => setShowAddDialog(true),
        }}
      />

      <div className="flex-1 p-6 space-y-4">
        {/* Filters */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                <Input
                  placeholder="Search prospects..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-zinc-800 border-zinc-700 pl-9"
                />
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant={tierFilter === null ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setTierFilter(null)}
                  className="text-zinc-300"
                >
                  All
                </Button>
                <Button
                  variant={tierFilter === 'hot' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setTierFilter('hot')}
                  className="text-red-400"
                >
                  Hot
                </Button>
                <Button
                  variant={tierFilter === 'warm' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setTierFilter('warm')}
                  className="text-amber-400"
                >
                  Warm
                </Button>
                <Button
                  variant={tierFilter === 'cold' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setTierFilter('cold')}
                  className="text-zinc-400"
                >
                  Cold
                </Button>
              </div>

              <Button
                variant="outline"
                size="sm"
                className="border-zinc-700"
                onClick={fetchProspects}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
          </div>
        )}

        {/* Error State */}
        {error && (
          <Card className="bg-red-500/10 border-red-500/30">
            <CardContent className="p-4">
              <p className="text-red-400">{error}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2 border-red-500/30 text-red-400"
                onClick={fetchProspects}
              >
                Retry
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Empty State */}
        {!loading && !error && filteredProspects.length === 0 && (
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-12 text-center">
              <p className="text-zinc-400 mb-4">No prospects found</p>
              <Link href="/scraper">
                <Button className="bg-amber-500 hover:bg-amber-600 text-black">
                  Run Scraper to Find Prospects
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {/* Table */}
        {!loading && !error && filteredProspects.length > 0 && (
          <Card className="bg-zinc-900 border-zinc-800">
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-800 hover:bg-transparent">
                  <TableHead className="text-zinc-400">Property</TableHead>
                  <TableHead className="text-zinc-400">Location</TableHead>
                  <TableHead className="text-zinc-400">Rating</TableHead>
                  <TableHead className="text-zinc-400">Tier</TableHead>
                  <TableHead className="text-zinc-400">Stage</TableHead>
                  <TableHead className="text-zinc-400">Score</TableHead>
                  <TableHead className="text-zinc-400 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProspects.map((prospect) => (
                  <TableRow
                    key={prospect.id}
                    className="border-zinc-800 hover:bg-zinc-800/50"
                  >
                    <TableCell>
                      <Link
                        href={`/prospects/${prospect.id}`}
                        className="flex items-center gap-3 group"
                      >
                        <div className="h-10 w-10 rounded-lg bg-zinc-700 flex items-center justify-center text-sm font-medium">
                          {prospect.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-medium text-white group-hover:text-amber-400 transition-colors">
                            {prospect.name}
                          </p>
                          {prospect.source_job_title ? (
                            <p className="text-sm text-emerald-400">{prospect.source_job_title}</p>
                          ) : (
                            <p className="text-sm text-zinc-500">{prospect.source}</p>
                          )}
                        </div>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-zinc-300">
                        <MapPin className="h-3 w-3 text-zinc-500" />
                        {prospect.city}{prospect.country ? `, ${prospect.country}` : ''}
                      </div>
                    </TableCell>
                    <TableCell>
                      {prospect.google_rating ? (
                        <div className="flex items-center gap-1">
                          <Star className="h-3 w-3 text-amber-400 fill-amber-400" />
                          <span className="text-white">{prospect.google_rating}</span>
                          <span className="text-zinc-500 text-sm">
                            ({prospect.google_review_count?.toLocaleString() || 0})
                          </span>
                        </div>
                      ) : (
                        <span className="text-zinc-500">-</span>
                      )}
                    </TableCell>
                    <TableCell>{getTierBadge(prospect.tier)}</TableCell>
                    <TableCell>{getStageBadge(prospect.stage)}</TableCell>
                    <TableCell>
                      <span className="font-medium text-white">{prospect.score || 0}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-zinc-900 border-zinc-800">
                          <DropdownMenuItem
                            className="text-zinc-300 focus:bg-zinc-800 cursor-pointer"
                            onClick={() => window.location.href = `/prospects/${prospect.id}`}
                          >
                            <Mail className="h-4 w-4 mr-2" />
                            View & Generate Email
                          </DropdownMenuItem>
                          {prospect.website && (
                            <DropdownMenuItem
                              className="text-zinc-300 focus:bg-zinc-800 cursor-pointer"
                              onClick={() => window.open(prospect.website!, '_blank')}
                            >
                              <ExternalLink className="h-4 w-4 mr-2" />
                              Visit Website
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
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
