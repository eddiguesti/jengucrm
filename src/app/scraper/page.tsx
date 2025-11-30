'use client';

import { useState, useEffect } from 'react';
import { Header } from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
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
} from 'lucide-react';

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
  // 8 Base scrapers (no API keys needed)
  { id: 'hosco', name: 'Hosco', baseUrl: 'hosco.com' },
  { id: 'hcareers', name: 'Hcareers', baseUrl: 'hcareers.com' },
  { id: 'hotelcareer', name: 'Hotelcareer', baseUrl: 'hotelcareer.com' },
  { id: 'talentshotels', name: 'TalentsHotels', baseUrl: 'talentshotels.com' },
  { id: 'journaldespalaces', name: 'Journal des Palaces', baseUrl: 'journaldespalaces.com' },
  { id: 'hospitalityonline', name: 'HospitalityOnline', baseUrl: 'hospitalityonline.com' },
  { id: 'hoteljobs', name: 'HotelJobs', baseUrl: 'hoteljobs.com' },
  { id: 'ehotelier', name: 'eHotelier', baseUrl: 'ehotelier.com' },
  // 2 Optional scrapers (with API keys configured)
  { id: 'indeed', name: 'Indeed (via ScraperAPI)', baseUrl: 'indeed.com' },
  { id: 'adzuna', name: 'Adzuna', baseUrl: 'adzuna.com' },
];

// All 10 scrapers - recommended for full coverage
const recommendedScrapers = [
  'hosco', 'hcareers', 'hotelcareer', 'talentshotels', 'journaldespalaces',
  'hospitalityonline', 'hoteljobs', 'ehotelier', 'indeed', 'adzuna'
];

export default function ScraperPage() {
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
    <div className="flex flex-col h-full">
      <Header
        title="Scraper"
        subtitle="Find new prospects from hospitality job boards"
      />

      <div className="flex-1 p-6 space-y-6">
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Controls */}
          <div className="lg:col-span-2 space-y-6">
            {/* Scraper Selection */}
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <CardTitle className="text-white">Select Scrapers</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {availableScrapers.map((scraper) => {
                    const isSelected = selectedScrapers.includes(scraper.id);
                    return (
                      <button
                        key={scraper.id}
                        onClick={() => toggleScraper(scraper.id)}
                        disabled={isRunning}
                        className={`p-3 rounded-lg border transition-all text-left ${
                          isSelected
                            ? 'bg-amber-600/20 border-amber-500/50 text-white'
                            : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Globe className="h-4 w-4" />
                            <span className="font-medium">{scraper.name}</span>
                          </div>
                          {isSelected && <Check className="h-4 w-4 text-amber-500" />}
                        </div>
                        <p className="text-xs text-zinc-500 mt-1">{scraper.baseUrl}</p>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <p className="text-sm text-zinc-400">
                    {selectedScrapers.length} scraper{selectedScrapers.length !== 1 ? 's' : ''} selected
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-zinc-700"
                      onClick={() => setSelectedScrapers(availableScrapers.map(s => s.id))}
                      disabled={isRunning}
                    >
                      Select All
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-zinc-700"
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
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-lg bg-amber-600/20 flex items-center justify-center">
                      <RefreshCw className={`h-6 w-6 text-amber-500 ${isRunning ? 'animate-spin' : ''}`} />
                    </div>
                    <div>
                      <h3 className="font-medium text-white">
                        {isRunning ? 'Scraping in progress...' : 'Ready to run'}
                      </h3>
                      <p className="text-sm text-zinc-400">
                        {selectedScrapers.length} sources × {locations.length} locations × {jobTitles.length} job titles
                      </p>
                    </div>
                  </div>
                  <Button
                    onClick={handleRunScraper}
                    disabled={isRunning || selectedScrapers.length === 0}
                    className={isRunning ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700'}
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
                  <div className="mt-4 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle className="h-5 w-5 text-emerald-500" />
                      <span className="font-medium text-emerald-400">Scrape Complete!</span>
                    </div>
                    <div className="grid grid-cols-4 gap-4 text-sm">
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

                <Separator className="my-6 bg-zinc-800" />

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <h4 className="text-sm font-medium text-zinc-400 mb-3">Locations ({locations.length})</h4>
                    <div className="flex flex-wrap gap-2">
                      {locations.map((loc) => (
                        <Badge key={loc} variant="secondary" className="bg-zinc-800 text-zinc-300">
                          {loc}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-zinc-400 mb-3">Job Titles ({jobTitles.length})</h4>
                    <div className="flex flex-wrap gap-2">
                      {jobTitles.map((title) => (
                        <Badge key={title} variant="secondary" className="bg-zinc-800 text-zinc-300">
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
                <CardTitle className="text-white">Recent Runs</CardTitle>
                <Button variant="ghost" size="sm" onClick={fetchRecentRuns} className="text-zinc-400">
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent>
                {recentRuns.length === 0 ? (
                  <p className="text-zinc-500 text-center py-8">No scrape runs yet. Run your first scrape above!</p>
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
                            <p className="font-medium text-white">
                              {run.source.split(',').length} source{run.source.split(',').length > 1 ? 's' : ''}
                            </p>
                            <p className="text-xs text-zinc-500">
                              {run.source.split(',').slice(0, 3).join(', ')}
                              {run.source.split(',').length > 3 && '...'}
                            </p>
                            <p className="text-sm text-zinc-400">
                              {new Date(run.started_at).toLocaleString()}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-6 text-sm">
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
                          {run.errors > 0 && (
                            <div className="text-center">
                              <p className="font-medium text-red-400">{run.errors}</p>
                              <p className="text-zinc-500">Errors</p>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Stats Sidebar */}
          <div className="space-y-6">
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <CardTitle className="text-white text-base">Deduplication</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-zinc-400">
                  Properties are automatically deduplicated across all sources using:
                </p>
                <ul className="text-sm text-zinc-500 space-y-1">
                  <li>• Normalized property names</li>
                  <li>• City matching</li>
                  <li>• Existing database check</li>
                </ul>
                <p className="text-xs text-zinc-600 mt-2">
                  Same hotel from multiple job boards = 1 prospect
                </p>
              </CardContent>
            </Card>

            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <CardTitle className="text-white text-base">This Week</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-zinc-500" />
                    <span className="text-zinc-400">New Prospects</span>
                  </div>
                  <span className="font-medium text-white">
                    {recentRuns.reduce((sum, r) => sum + (r.new_prospects || 0), 0)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <RefreshCw className="h-4 w-4 text-zinc-500" />
                    <span className="text-zinc-400">Scrape Runs</span>
                  </div>
                  <span className="font-medium text-white">{recentRuns.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-zinc-500" />
                    <span className="text-zinc-400">Total Errors</span>
                  </div>
                  <span className="font-medium text-white">
                    {recentRuns.reduce((sum, r) => sum + (r.errors || 0), 0)}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <CardTitle className="text-white text-base">Schedule</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-zinc-800">
                  <Clock className="h-5 w-5 text-amber-500" />
                  <div>
                    <p className="text-sm font-medium text-white">Daily at 6:00 AM</p>
                    <p className="text-xs text-zinc-500">Configure in Settings</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
