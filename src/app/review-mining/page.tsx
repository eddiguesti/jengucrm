'use client';

import { useState, useEffect } from 'react';
import { Header } from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Play,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  MapPin,
  MessageSquare,
  AlertTriangle,
  TrendingUp,
  Search,
} from 'lucide-react';
import Link from 'next/link';
import { REVIEW_MINING_LOCATIONS, PAIN_KEYWORDS, ReviewPlatform } from '@/types';

interface ReviewScrapeLog {
  id: string;
  platform: ReviewPlatform;
  location: string;
  properties_scanned: number;
  reviews_scanned: number;
  pain_signals_found: number;
  new_leads_created: number;
  errors: number;
  status: string;
  started_at: string;
  completed_at: string | null;
}

interface PainLeadSummary {
  total_pain_leads: number;
  total_pain_signals: number;
  by_platform: Record<string, number>;
  recent_leads: {
    id: string;
    name: string;
    city: string;
    pain_signal_count: number;
    score: number;
  }[];
}

const platforms: { id: ReviewPlatform; name: string; icon: string; available: boolean }[] = [
  { id: 'tripadvisor', name: 'TripAdvisor', icon: '🦉', available: true },
  { id: 'google', name: 'Google Maps', icon: '📍', available: true },
  { id: 'booking', name: 'Booking.com', icon: '🏨', available: false },
];

export default function ReviewMiningPage() {
  const [isRunning, setIsRunning] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<ReviewPlatform>('tripadvisor');
  const [selectedRegion, setSelectedRegion] = useState<string>('Indian Ocean');
  const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
  const [recentRuns, setRecentRuns] = useState<ReviewScrapeLog[]>([]);
  const [summary, setSummary] = useState<PainLeadSummary | null>(null);
  const [lastResult, setLastResult] = useState<{
    properties_scanned: number;
    reviews_scanned: number;
    pain_signals_found: number;
    new_leads: number;
    errors: number;
  } | null>(null);

  useEffect(() => {
    fetchRecentRuns();
    fetchSummary();
  }, []);

  useEffect(() => {
    // Auto-select all locations in the region
    const regionLocations = REVIEW_MINING_LOCATIONS[selectedRegion as keyof typeof REVIEW_MINING_LOCATIONS];
    if (regionLocations) {
      setSelectedLocations([...regionLocations]);
    }
  }, [selectedRegion]);

  const fetchRecentRuns = async () => {
    try {
      const res = await fetch('/api/review-mining/runs');
      if (res.ok) {
        const data = await res.json();
        setRecentRuns(data.runs || []);
      }
    } catch (error) {
      console.error('Failed to fetch runs:', error);
    }
  };

  const fetchSummary = async () => {
    try {
      const res = await fetch('/api/review-mining/summary');
      if (res.ok) {
        const data = await res.json();
        setSummary(data);
      }
    } catch (error) {
      console.error('Failed to fetch summary:', error);
    }
  };

  const toggleLocation = (location: string) => {
    setSelectedLocations(prev =>
      prev.includes(location)
        ? prev.filter(l => l !== location)
        : [...prev, location]
    );
  };

  const handleRunMining = async () => {
    if (selectedLocations.length === 0) {
      alert('Please select at least one location');
      return;
    }

    setIsRunning(true);
    setLastResult(null);

    try {
      const res = await fetch('/api/review-mining/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: selectedPlatform,
          locations: selectedLocations,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setLastResult({
          properties_scanned: data.properties_scanned,
          reviews_scanned: data.reviews_scanned,
          pain_signals_found: data.pain_signals_found,
          new_leads: data.new_leads,
          errors: data.errors,
        });
        fetchRecentRuns();
        fetchSummary();
      } else {
        alert(`Mining failed: ${data.error}`);
      }
    } catch (error) {
      alert(`Mining failed: ${error}`);
    } finally {
      setIsRunning(false);
    }
  };

  const regions = Object.keys(REVIEW_MINING_LOCATIONS);

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Review Mining"
        subtitle="Find hotels with communication pain points from guest reviews"
      />

      <div className="flex-1 p-6 space-y-6 overflow-auto">
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Controls */}
          <div className="lg:col-span-2 space-y-6">
            {/* Platform Selection */}
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Search className="h-5 w-5 text-amber-500" />
                  Select Platform
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 md:grid-cols-3">
                  {platforms.map((platform) => (
                    <button
                      key={platform.id}
                      onClick={() => platform.available && setSelectedPlatform(platform.id)}
                      disabled={isRunning || !platform.available}
                      className={`p-4 rounded-lg border transition-all text-left ${
                        selectedPlatform === platform.id
                          ? 'bg-amber-600/20 border-amber-500/50'
                          : platform.available
                          ? 'bg-zinc-800 border-zinc-700 hover:border-zinc-600'
                          : 'bg-zinc-800/50 border-zinc-800 cursor-not-allowed'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-2xl">{platform.icon}</span>
                        {!platform.available && (
                          <Badge variant="secondary" className="bg-zinc-700 text-zinc-400">
                            Coming Soon
                          </Badge>
                        )}
                      </div>
                      <p className={`font-medium mt-2 ${platform.available ? 'text-white' : 'text-zinc-500'}`}>
                        {platform.name}
                      </p>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Region & Location Selection */}
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-amber-500" />
                  Select Locations
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Region Tabs */}
                <div className="flex flex-wrap gap-2">
                  {regions.map((region) => (
                    <button
                      key={region}
                      onClick={() => setSelectedRegion(region)}
                      className={`px-3 py-1.5 rounded-full text-sm transition-all ${
                        selectedRegion === region
                          ? 'bg-amber-600 text-white'
                          : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                      }`}
                    >
                      {region}
                    </button>
                  ))}
                </div>

                {/* Locations in Region */}
                <div className="flex flex-wrap gap-2">
                  {(REVIEW_MINING_LOCATIONS[selectedRegion as keyof typeof REVIEW_MINING_LOCATIONS] || []).map((location) => {
                    const isSelected = selectedLocations.includes(location);
                    return (
                      <button
                        key={location}
                        onClick={() => toggleLocation(location)}
                        disabled={isRunning}
                        className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                          isSelected
                            ? 'bg-emerald-600/30 border border-emerald-500/50 text-emerald-400'
                            : 'bg-zinc-800 border border-zinc-700 text-zinc-400 hover:border-zinc-600'
                        }`}
                      >
                        {location}
                      </button>
                    );
                  })}
                </div>

                <p className="text-sm text-zinc-500">
                  {selectedLocations.length} location{selectedLocations.length !== 1 ? 's' : ''} selected
                </p>
              </CardContent>
            </Card>

            {/* Run Controls */}
            <Card className="bg-zinc-900 border-zinc-800">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-lg bg-amber-600/20 flex items-center justify-center">
                      <AlertTriangle className={`h-6 w-6 text-amber-500 ${isRunning ? 'animate-pulse' : ''}`} />
                    </div>
                    <div>
                      <h3 className="font-medium text-white">
                        {isRunning ? 'Mining reviews...' : 'Ready to mine'}
                      </h3>
                      <p className="text-sm text-zinc-400">
                        Scanning {selectedPlatform} for pain signals in {selectedLocations.length} location{selectedLocations.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                  <Button
                    onClick={handleRunMining}
                    disabled={isRunning || selectedLocations.length === 0}
                    className="bg-amber-600 hover:bg-amber-700"
                    size="lg"
                  >
                    {isRunning ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Mining...
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4 mr-2" />
                        Start Mining
                      </>
                    )}
                  </Button>
                </div>

                {lastResult && (
                  <div className="mt-4 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle className="h-5 w-5 text-emerald-500" />
                      <span className="font-medium text-emerald-400">Mining Complete!</span>
                    </div>
                    <div className="grid grid-cols-5 gap-4 text-sm">
                      <div>
                        <p className="text-zinc-400">Properties</p>
                        <p className="font-medium text-white">{lastResult.properties_scanned}</p>
                      </div>
                      <div>
                        <p className="text-zinc-400">Reviews</p>
                        <p className="font-medium text-white">{lastResult.reviews_scanned}</p>
                      </div>
                      <div>
                        <p className="text-zinc-400">Pain Signals</p>
                        <p className="font-medium text-amber-400">{lastResult.pain_signals_found}</p>
                      </div>
                      <div>
                        <p className="text-zinc-400">New Leads</p>
                        <p className="font-medium text-emerald-400">+{lastResult.new_leads}</p>
                      </div>
                      <div>
                        <p className="text-zinc-400">Errors</p>
                        <p className="font-medium text-red-400">{lastResult.errors}</p>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Recent Runs */}
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-white">Recent Mining Runs</CardTitle>
                <Button variant="ghost" size="sm" onClick={fetchRecentRuns} className="text-zinc-400">
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent>
                {recentRuns.length === 0 ? (
                  <p className="text-zinc-500 text-center py-8">
                    No mining runs yet. Start your first review mining above!
                  </p>
                ) : (
                  <div className="space-y-4">
                    {recentRuns.map((run) => (
                      <div
                        key={run.id}
                        className="flex items-center justify-between p-4 rounded-lg bg-zinc-800"
                      >
                        <div className="flex items-center gap-4">
                          {run.status === 'completed' ? (
                            <CheckCircle className="h-5 w-5 text-emerald-500" />
                          ) : run.status === 'running' ? (
                            <RefreshCw className="h-5 w-5 text-amber-500 animate-spin" />
                          ) : (
                            <AlertCircle className="h-5 w-5 text-red-500" />
                          )}
                          <div>
                            <p className="font-medium text-white flex items-center gap-2">
                              <span className="capitalize">{run.platform}</span>
                              <Badge variant="secondary" className="bg-zinc-700">
                                {run.location}
                              </Badge>
                            </p>
                            <p className="text-sm text-zinc-400">
                              {new Date(run.started_at).toLocaleString()}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-6 text-sm">
                          <div className="text-center">
                            <p className="font-medium text-white">{run.properties_scanned}</p>
                            <p className="text-zinc-500">Hotels</p>
                          </div>
                          <div className="text-center">
                            <p className="font-medium text-white">{run.reviews_scanned}</p>
                            <p className="text-zinc-500">Reviews</p>
                          </div>
                          <div className="text-center">
                            <p className="font-medium text-amber-400">{run.pain_signals_found}</p>
                            <p className="text-zinc-500">Pain Signals</p>
                          </div>
                          <div className="text-center">
                            <p className="font-medium text-emerald-400">+{run.new_leads_created}</p>
                            <p className="text-zinc-500">New Leads</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Pain Leads Summary */}
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <CardTitle className="text-white text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-amber-500" />
                  Pain Leads
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 rounded-lg bg-zinc-800">
                    <p className="text-2xl font-bold text-white">{summary?.total_pain_leads || 0}</p>
                    <p className="text-xs text-zinc-400">Total Leads</p>
                  </div>
                  <div className="p-3 rounded-lg bg-zinc-800">
                    <p className="text-2xl font-bold text-amber-400">{summary?.total_pain_signals || 0}</p>
                    <p className="text-xs text-zinc-400">Pain Signals</p>
                  </div>
                </div>

                {summary?.recent_leads && summary.recent_leads.length > 0 && (
                  <>
                    <Separator className="bg-zinc-800" />
                    <div>
                      <p className="text-sm font-medium text-zinc-400 mb-2">Recent Pain Leads</p>
                      <div className="space-y-2">
                        {summary.recent_leads.slice(0, 5).map((lead) => (
                          <Link
                            key={lead.id}
                            href={`/prospects/${lead.id}`}
                            className="block p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors"
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-sm font-medium text-white line-clamp-1">{lead.name}</p>
                                <p className="text-xs text-zinc-500">{lead.city}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge className="bg-amber-600/20 text-amber-400">
                                  {lead.pain_signal_count} signals
                                </Badge>
                              </div>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Pain Keywords */}
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <CardTitle className="text-white text-base flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-amber-500" />
                  Pain Keywords
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {Object.entries(PAIN_KEYWORDS).map(([category, keywords]) => (
                  <div key={category}>
                    <p className="text-xs font-medium text-zinc-400 mb-1 capitalize">{category}</p>
                    <div className="flex flex-wrap gap-1">
                      {keywords.slice(0, 4).map((keyword) => (
                        <Badge
                          key={keyword}
                          variant="secondary"
                          className="bg-red-900/30 text-red-400 text-xs"
                        >
                          {keyword}
                        </Badge>
                      ))}
                      {keywords.length > 4 && (
                        <Badge variant="secondary" className="bg-zinc-800 text-zinc-500 text-xs">
                          +{keywords.length - 4} more
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* How It Works */}
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <CardTitle className="text-white text-base">How It Works</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-zinc-400">
                <div className="flex items-start gap-2">
                  <div className="h-5 w-5 rounded-full bg-amber-600/20 text-amber-500 flex items-center justify-center text-xs flex-shrink-0">
                    1
                  </div>
                  <p>Search luxury hotels in target locations</p>
                </div>
                <div className="flex items-start gap-2">
                  <div className="h-5 w-5 rounded-full bg-amber-600/20 text-amber-500 flex items-center justify-center text-xs flex-shrink-0">
                    2
                  </div>
                  <p>Scan 1-3 star reviews for communication complaints</p>
                </div>
                <div className="flex items-start gap-2">
                  <div className="h-5 w-5 rounded-full bg-amber-600/20 text-amber-500 flex items-center justify-center text-xs flex-shrink-0">
                    3
                  </div>
                  <p>Create leads with pain signal evidence</p>
                </div>
                <div className="flex items-start gap-2">
                  <div className="h-5 w-5 rounded-full bg-amber-600/20 text-amber-500 flex items-center justify-center text-xs flex-shrink-0">
                    4
                  </div>
                  <p>Generate targeted outreach referencing their issues</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
