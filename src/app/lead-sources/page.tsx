'use client';

import { useState, useEffect } from 'react';
import { Header } from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Play,
  Square,
  CheckCircle,
  AlertCircle,
  Clock,
  Users,
  RefreshCw,
  Globe,
  Check,
  MapPin,
  MessageSquare,
  AlertTriangle,
  TrendingUp,
  Search,
  Star,
  Briefcase,
} from 'lucide-react';
import Link from 'next/link';
import { REVIEW_MINING_LOCATIONS, PAIN_KEYWORDS, ReviewPlatform } from '@/types';

// ===== TYPES =====
interface Scraper {
  id: string;
  name: string;
  baseUrl: string;
}

interface ScrapeRun {
  id: string;
  source: string;
  status: string;
  total_found: number;
  new_prospects: number;
  duplicates_skipped: number;
  errors: number;
  started_at: string;
  completed_at: string | null;
}

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

// ===== CONSTANTS =====
const locations = [
  'London, UK',
  'Paris, France',
  'Dubai, UAE',
  'New York, USA',
  'Miami, USA',
  'Barcelona, Spain',
  'Rome, Italy',
  'Singapore',
  'Hong Kong',
  'Maldives',
];

const jobTitles = [
  'General Manager',
  'Hotel Manager',
  'Director of Operations',
  'F&B Manager',
  'Revenue Manager',
  'Marketing Director',
  'Sales Director',
];

const availableScrapers: Scraper[] = [
  { id: 'hosco', name: 'Hosco', baseUrl: 'hosco.com' },
  { id: 'hcareers', name: 'Hcareers', baseUrl: 'hcareers.com' },
  { id: 'hotelcareer', name: 'Hotelcareer', baseUrl: 'hotelcareer.com' },
  { id: 'talentshotels', name: 'TalentsHotels', baseUrl: 'talentshotels.com' },
  { id: 'journaldespalaces', name: 'Journal des Palaces', baseUrl: 'journaldespalaces.com' },
  { id: 'hospitalityonline', name: 'HospitalityOnline', baseUrl: 'hospitalityonline.com' },
  { id: 'hoteljobs', name: 'HotelJobs', baseUrl: 'hoteljobs.com' },
  { id: 'ehotelier', name: 'eHotelier', baseUrl: 'ehotelier.com' },
  { id: 'indeed', name: 'Indeed (via ScraperAPI)', baseUrl: 'indeed.com' },
  { id: 'adzuna', name: 'Adzuna', baseUrl: 'adzuna.com' },
];

const recommendedScrapers = [
  'hosco', 'hcareers', 'hotelcareer', 'talentshotels', 'journaldespalaces',
  'hospitalityonline', 'hoteljobs', 'ehotelier', 'indeed', 'adzuna'
];

const platforms: { id: ReviewPlatform; name: string; icon: string; available: boolean }[] = [
  { id: 'tripadvisor', name: 'TripAdvisor', icon: '🦉', available: true },
  { id: 'google', name: 'Google Maps', icon: '📍', available: true },
  { id: 'booking', name: 'Booking.com', icon: '🏨', available: false },
];

export default function LeadSourcesPage() {
  const [activeTab, setActiveTab] = useState('job-scraper');

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Lead Sources"
        subtitle="Find new prospects from job boards and reviews"
      />

      <div className="flex-1 p-4 md:p-6 overflow-auto">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full max-w-md grid-cols-2 bg-zinc-900 border border-zinc-800">
            <TabsTrigger
              value="job-scraper"
              className="data-[state=active]:bg-amber-600 data-[state=active]:text-white flex items-center gap-2"
            >
              <Briefcase className="h-4 w-4" />
              <span className="hidden sm:inline">Job Scraper</span>
              <span className="sm:hidden">Jobs</span>
            </TabsTrigger>
            <TabsTrigger
              value="review-mining"
              className="data-[state=active]:bg-amber-600 data-[state=active]:text-white flex items-center gap-2"
            >
              <Star className="h-4 w-4" />
              <span className="hidden sm:inline">Review Mining</span>
              <span className="sm:hidden">Reviews</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="job-scraper" className="mt-6">
            <JobScraperTab />
          </TabsContent>

          <TabsContent value="review-mining" className="mt-6">
            <ReviewMiningTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// ===== JOB SCRAPER TAB =====
function JobScraperTab() {
  const [isRunning, setIsRunning] = useState(false);
  const [selectedScrapers, setSelectedScrapers] = useState<string[]>(recommendedScrapers);
  const [recentRuns, setRecentRuns] = useState<ScrapeRun[]>([]);
  const [lastResult, setLastResult] = useState<{
    total_found: number;
    new_saved: number;
    duplicates_skipped: number;
    errors: number;
  } | null>(null);

  useEffect(() => {
    fetchRecentRuns();
  }, []);

  const fetchRecentRuns = async () => {
    try {
      const res = await fetch('/api/scrape');
      const data = await res.json();
      if (data.runs) {
        setRecentRuns(data.runs);
      }
    } catch (error) {
      console.error('Failed to fetch runs:', error);
    }
  };

  const toggleScraper = (scraperId: string) => {
    setSelectedScrapers(prev =>
      prev.includes(scraperId)
        ? prev.filter(id => id !== scraperId)
        : [...prev, scraperId]
    );
  };

  const handleRunScraper = async () => {
    if (selectedScrapers.length === 0) {
      alert('Please select at least one scraper');
      return;
    }

    setIsRunning(true);
    setLastResult(null);

    try {
      const res = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scrapers: selectedScrapers,
          locations,
          job_titles: jobTitles,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setLastResult({
          total_found: data.total_found,
          new_saved: data.new_saved,
          duplicates_skipped: data.duplicates_skipped,
          errors: data.errors,
        });
        fetchRecentRuns();
      } else {
        alert(`Scrape failed: ${data.error}`);
      }
    } catch (error) {
      alert(`Scrape failed: ${error}`);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Main Controls */}
      <div className="lg:col-span-2 space-y-6">
        {/* Scraper Selection */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-white text-base sm:text-lg">Select Scrapers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:gap-3 grid-cols-2 md:grid-cols-3">
              {availableScrapers.map((scraper) => {
                const isSelected = selectedScrapers.includes(scraper.id);
                return (
                  <button
                    key={scraper.id}
                    onClick={() => toggleScraper(scraper.id)}
                    disabled={isRunning}
                    className={`p-2 sm:p-3 rounded-lg border transition-all text-left ${
                      isSelected
                        ? 'bg-amber-600/20 border-amber-500/50 text-white'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                        <Globe className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                        <span className="font-medium text-xs sm:text-sm truncate">{scraper.name}</span>
                      </div>
                      {isSelected && <Check className="h-3 w-3 sm:h-4 sm:w-4 text-amber-500 flex-shrink-0" />}
                    </div>
                    <p className="text-[10px] sm:text-xs text-zinc-500 mt-1 truncate">{scraper.baseUrl}</p>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <p className="text-xs sm:text-sm text-zinc-400">
                {selectedScrapers.length} scraper{selectedScrapers.length !== 1 ? 's' : ''} selected
              </p>
              <div className="flex gap-2 w-full sm:w-auto">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-zinc-700 flex-1 sm:flex-none text-xs"
                  onClick={() => setSelectedScrapers(availableScrapers.map(s => s.id))}
                  disabled={isRunning}
                >
                  Select All
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-zinc-700 flex-1 sm:flex-none text-xs"
                  onClick={() => setSelectedScrapers([])}
                  disabled={isRunning}
                >
                  Clear
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Run Controls */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-lg bg-amber-600/20 flex items-center justify-center flex-shrink-0">
                  <RefreshCw className={`h-5 w-5 sm:h-6 sm:w-6 text-amber-500 ${isRunning ? 'animate-spin' : ''}`} />
                </div>
                <div>
                  <h3 className="font-medium text-white text-sm sm:text-base">
                    {isRunning ? 'Scraping in progress...' : 'Ready to run'}
                  </h3>
                  <p className="text-xs sm:text-sm text-zinc-400">
                    {selectedScrapers.length} sources × {locations.length} locations
                  </p>
                </div>
              </div>
              <Button
                onClick={handleRunScraper}
                disabled={isRunning || selectedScrapers.length === 0}
                className={`w-full sm:w-auto ${isRunning ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700'}`}
                size="lg"
              >
                {isRunning ? (
                  <>
                    <Square className="h-4 w-4 mr-2" />
                    Running...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    Run Scrapers
                  </>
                )}
              </Button>
            </div>

            {lastResult && (
              <div className="mt-4 p-3 sm:p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-500" />
                  <span className="font-medium text-emerald-400 text-sm sm:text-base">Scrape Complete!</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 text-xs sm:text-sm">
                  <div>
                    <p className="text-zinc-400">Found</p>
                    <p className="font-medium text-white">{lastResult.total_found}</p>
                  </div>
                  <div>
                    <p className="text-zinc-400">New Saved</p>
                    <p className="font-medium text-emerald-400">+{lastResult.new_saved}</p>
                  </div>
                  <div>
                    <p className="text-zinc-400">Duplicates</p>
                    <p className="font-medium text-zinc-400">{lastResult.duplicates_skipped}</p>
                  </div>
                  <div>
                    <p className="text-zinc-400">Errors</p>
                    <p className="font-medium text-red-400">{lastResult.errors}</p>
                  </div>
                </div>
              </div>
            )}

            <Separator className="my-4 sm:my-6 bg-zinc-800" />

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <h4 className="text-xs sm:text-sm font-medium text-zinc-400 mb-2 sm:mb-3">Locations ({locations.length})</h4>
                <div className="flex flex-wrap gap-1.5 sm:gap-2">
                  {locations.map((loc) => (
                    <Badge key={loc} variant="secondary" className="bg-zinc-800 text-zinc-300 text-[10px] sm:text-xs">
                      {loc}
                    </Badge>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="text-xs sm:text-sm font-medium text-zinc-400 mb-2 sm:mb-3">Job Titles ({jobTitles.length})</h4>
                <div className="flex flex-wrap gap-1.5 sm:gap-2">
                  {jobTitles.map((title) => (
                    <Badge key={title} variant="secondary" className="bg-zinc-800 text-zinc-300 text-[10px] sm:text-xs">
                      {title}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Recent Runs */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-white text-base sm:text-lg">Recent Runs</CardTitle>
            <Button variant="ghost" size="sm" onClick={fetchRecentRuns} className="text-zinc-400">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            {recentRuns.length === 0 ? (
              <p className="text-zinc-500 text-center py-8 text-sm">No scrape runs yet. Run your first scrape above!</p>
            ) : (
              <div className="space-y-3 sm:space-y-4">
                {recentRuns.map((run) => (
                  <div
                    key={run.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 rounded-lg bg-zinc-800 gap-3"
                  >
                    <div className="flex items-center gap-3 sm:gap-4">
                      {run.status === 'completed' ? (
                        <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-500 flex-shrink-0" />
                      ) : run.status === 'running' ? (
                        <RefreshCw className="h-4 w-4 sm:h-5 sm:w-5 text-amber-500 animate-spin flex-shrink-0" />
                      ) : (
                        <AlertCircle className="h-4 w-4 sm:h-5 sm:w-5 text-red-500 flex-shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="font-medium text-white text-sm">
                          {run.source.split(',').length} source{run.source.split(',').length > 1 ? 's' : ''}
                        </p>
                        <p className="text-xs text-zinc-400">
                          {new Date(run.started_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 sm:gap-6 text-xs sm:text-sm pl-7 sm:pl-0">
                      <div className="text-center">
                        <p className="font-medium text-white">{run.total_found}</p>
                        <p className="text-zinc-500">Found</p>
                      </div>
                      <div className="text-center">
                        <p className="font-medium text-emerald-400">+{run.new_prospects}</p>
                        <p className="text-zinc-500">New</p>
                      </div>
                      <div className="text-center">
                        <p className="font-medium text-zinc-400">{run.duplicates_skipped || 0}</p>
                        <p className="text-zinc-500">Dupes</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Stats Sidebar */}
      <div className="space-y-4 sm:space-y-6">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-white text-sm sm:text-base">Deduplication</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 sm:space-y-3">
            <p className="text-xs sm:text-sm text-zinc-400">
              Properties are automatically deduplicated using:
            </p>
            <ul className="text-xs sm:text-sm text-zinc-500 space-y-1">
              <li>• Normalized property names</li>
              <li>• City matching</li>
              <li>• Database check</li>
            </ul>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-white text-sm sm:text-base">This Week</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 sm:space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-3 w-3 sm:h-4 sm:w-4 text-zinc-500" />
                <span className="text-zinc-400 text-xs sm:text-sm">New Prospects</span>
              </div>
              <span className="font-medium text-white text-sm">
                {recentRuns.reduce((sum, r) => sum + (r.new_prospects || 0), 0)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <RefreshCw className="h-3 w-3 sm:h-4 sm:w-4 text-zinc-500" />
                <span className="text-zinc-400 text-xs sm:text-sm">Scrape Runs</span>
              </div>
              <span className="font-medium text-white text-sm">{recentRuns.length}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-white text-sm sm:text-base">Schedule</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg bg-zinc-800">
              <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-amber-500 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-medium text-white">Daily at 6:00 AM</p>
                <p className="text-[10px] sm:text-xs text-zinc-500">Configure in Settings</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ===== REVIEW MINING TAB =====
function ReviewMiningTab() {
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
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Main Controls */}
      <div className="lg:col-span-2 space-y-6">
        {/* Platform Selection */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2 text-base sm:text-lg">
              <Search className="h-4 w-4 sm:h-5 sm:w-5 text-amber-500" />
              Select Platform
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 sm:gap-3 grid-cols-3">
              {platforms.map((platform) => (
                <button
                  key={platform.id}
                  onClick={() => platform.available && setSelectedPlatform(platform.id)}
                  disabled={isRunning || !platform.available}
                  className={`p-3 sm:p-4 rounded-lg border transition-all text-left ${
                    selectedPlatform === platform.id
                      ? 'bg-amber-600/20 border-amber-500/50'
                      : platform.available
                      ? 'bg-zinc-800 border-zinc-700 hover:border-zinc-600'
                      : 'bg-zinc-800/50 border-zinc-800 cursor-not-allowed'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xl sm:text-2xl">{platform.icon}</span>
                    {!platform.available && (
                      <Badge variant="secondary" className="bg-zinc-700 text-zinc-400 text-[9px] sm:text-[10px]">
                        Soon
                      </Badge>
                    )}
                  </div>
                  <p className={`font-medium mt-2 text-xs sm:text-sm ${platform.available ? 'text-white' : 'text-zinc-500'}`}>
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
            <CardTitle className="text-white flex items-center gap-2 text-base sm:text-lg">
              <MapPin className="h-4 w-4 sm:h-5 sm:w-5 text-amber-500" />
              Select Locations
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 sm:space-y-4">
            <div className="flex flex-wrap gap-1.5 sm:gap-2">
              {regions.map((region) => (
                <button
                  key={region}
                  onClick={() => setSelectedRegion(region)}
                  className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-xs sm:text-sm transition-all ${
                    selectedRegion === region
                      ? 'bg-amber-600 text-white'
                      : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                  }`}
                >
                  {region}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-1.5 sm:gap-2">
              {(REVIEW_MINING_LOCATIONS[selectedRegion as keyof typeof REVIEW_MINING_LOCATIONS] || []).map((location) => {
                const isSelected = selectedLocations.includes(location);
                return (
                  <button
                    key={location}
                    onClick={() => toggleLocation(location)}
                    disabled={isRunning}
                    className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs sm:text-sm transition-all ${
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

            <p className="text-xs sm:text-sm text-zinc-500">
              {selectedLocations.length} location{selectedLocations.length !== 1 ? 's' : ''} selected
            </p>
          </CardContent>
        </Card>

        {/* Run Controls */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-lg bg-amber-600/20 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className={`h-5 w-5 sm:h-6 sm:w-6 text-amber-500 ${isRunning ? 'animate-pulse' : ''}`} />
                </div>
                <div>
                  <h3 className="font-medium text-white text-sm sm:text-base">
                    {isRunning ? 'Mining reviews...' : 'Ready to mine'}
                  </h3>
                  <p className="text-xs sm:text-sm text-zinc-400">
                    Scanning {selectedPlatform} in {selectedLocations.length} location{selectedLocations.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <Button
                onClick={handleRunMining}
                disabled={isRunning || selectedLocations.length === 0}
                className="bg-amber-600 hover:bg-amber-700 w-full sm:w-auto"
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
              <div className="mt-4 p-3 sm:p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-500" />
                  <span className="font-medium text-emerald-400 text-sm sm:text-base">Mining Complete!</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 sm:gap-4 text-xs sm:text-sm">
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
                  <div className="col-span-2 sm:col-span-1">
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
            <CardTitle className="text-white text-base sm:text-lg">Recent Mining Runs</CardTitle>
            <Button variant="ghost" size="sm" onClick={fetchRecentRuns} className="text-zinc-400">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            {recentRuns.length === 0 ? (
              <p className="text-zinc-500 text-center py-8 text-sm">
                No mining runs yet. Start your first review mining above!
              </p>
            ) : (
              <div className="space-y-3 sm:space-y-4">
                {recentRuns.map((run) => (
                  <div
                    key={run.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 rounded-lg bg-zinc-800 gap-3"
                  >
                    <div className="flex items-center gap-3 sm:gap-4">
                      {run.status === 'completed' ? (
                        <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-500 flex-shrink-0" />
                      ) : run.status === 'running' ? (
                        <RefreshCw className="h-4 w-4 sm:h-5 sm:w-5 text-amber-500 animate-spin flex-shrink-0" />
                      ) : (
                        <AlertCircle className="h-4 w-4 sm:h-5 sm:w-5 text-red-500 flex-shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="font-medium text-white flex items-center gap-2 text-sm">
                          <span className="capitalize">{run.platform}</span>
                          <Badge variant="secondary" className="bg-zinc-700 text-[10px]">
                            {run.location}
                          </Badge>
                        </p>
                        <p className="text-xs text-zinc-400">
                          {new Date(run.started_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 sm:gap-6 text-xs sm:text-sm pl-7 sm:pl-0">
                      <div className="text-center">
                        <p className="font-medium text-white">{run.properties_scanned}</p>
                        <p className="text-zinc-500">Hotels</p>
                      </div>
                      <div className="text-center">
                        <p className="font-medium text-amber-400">{run.pain_signals_found}</p>
                        <p className="text-zinc-500">Pain</p>
                      </div>
                      <div className="text-center">
                        <p className="font-medium text-emerald-400">+{run.new_leads_created}</p>
                        <p className="text-zinc-500">Leads</p>
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
      <div className="space-y-4 sm:space-y-6">
        {/* Pain Leads Summary */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-white text-sm sm:text-base flex items-center gap-2">
              <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4 text-amber-500" />
              Pain Leads
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 sm:space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <div className="p-2 sm:p-3 rounded-lg bg-zinc-800">
                <p className="text-xl sm:text-2xl font-bold text-white">{summary?.total_pain_leads || 0}</p>
                <p className="text-[10px] sm:text-xs text-zinc-400">Total Leads</p>
              </div>
              <div className="p-2 sm:p-3 rounded-lg bg-zinc-800">
                <p className="text-xl sm:text-2xl font-bold text-amber-400">{summary?.total_pain_signals || 0}</p>
                <p className="text-[10px] sm:text-xs text-zinc-400">Pain Signals</p>
              </div>
            </div>

            {summary?.recent_leads && summary.recent_leads.length > 0 && (
              <>
                <Separator className="bg-zinc-800" />
                <div>
                  <p className="text-xs sm:text-sm font-medium text-zinc-400 mb-2">Recent Pain Leads</p>
                  <div className="space-y-2">
                    {summary.recent_leads.slice(0, 5).map((lead) => (
                      <Link
                        key={lead.id}
                        href={`/prospects/${lead.id}`}
                        className="block p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs sm:text-sm font-medium text-white truncate">{lead.name}</p>
                            <p className="text-[10px] sm:text-xs text-zinc-500">{lead.city}</p>
                          </div>
                          <Badge className="bg-amber-600/20 text-amber-400 text-[10px] flex-shrink-0">
                            {lead.pain_signal_count}
                          </Badge>
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
            <CardTitle className="text-white text-sm sm:text-base flex items-center gap-2">
              <MessageSquare className="h-3 w-3 sm:h-4 sm:w-4 text-amber-500" />
              Pain Keywords
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 sm:space-y-3">
            {Object.entries(PAIN_KEYWORDS).map(([category, keywords]) => (
              <div key={category}>
                <p className="text-[10px] sm:text-xs font-medium text-zinc-400 mb-1 capitalize">{category}</p>
                <div className="flex flex-wrap gap-1">
                  {keywords.slice(0, 3).map((keyword) => (
                    <Badge
                      key={keyword}
                      variant="secondary"
                      className="bg-red-900/30 text-red-400 text-[9px] sm:text-[10px]"
                    >
                      {keyword}
                    </Badge>
                  ))}
                  {keywords.length > 3 && (
                    <Badge variant="secondary" className="bg-zinc-800 text-zinc-500 text-[9px] sm:text-[10px]">
                      +{keywords.length - 3}
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
            <CardTitle className="text-white text-sm sm:text-base">How It Works</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 sm:space-y-3 text-xs sm:text-sm text-zinc-400">
            <div className="flex items-start gap-2">
              <div className="h-4 w-4 sm:h-5 sm:w-5 rounded-full bg-amber-600/20 text-amber-500 flex items-center justify-center text-[10px] sm:text-xs flex-shrink-0">
                1
              </div>
              <p>Search luxury hotels in target locations</p>
            </div>
            <div className="flex items-start gap-2">
              <div className="h-4 w-4 sm:h-5 sm:w-5 rounded-full bg-amber-600/20 text-amber-500 flex items-center justify-center text-[10px] sm:text-xs flex-shrink-0">
                2
              </div>
              <p>Scan 1-3 star reviews for complaints</p>
            </div>
            <div className="flex items-start gap-2">
              <div className="h-4 w-4 sm:h-5 sm:w-5 rounded-full bg-amber-600/20 text-amber-500 flex items-center justify-center text-[10px] sm:text-xs flex-shrink-0">
                3
              </div>
              <p>Create leads with pain signal evidence</p>
            </div>
            <div className="flex items-start gap-2">
              <div className="h-4 w-4 sm:h-5 sm:w-5 rounded-full bg-amber-600/20 text-amber-500 flex items-center justify-center text-[10px] sm:text-xs flex-shrink-0">
                4
              </div>
              <p>Generate targeted outreach</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
