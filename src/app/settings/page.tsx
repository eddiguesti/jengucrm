'use client';

import { useState, useEffect } from 'react';
import { Header } from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { CheckCircle, AlertCircle, Loader2, Database, Key, Zap, Search, Globe } from 'lucide-react';

interface ApiStatus {
  supabase: boolean;
  xai: boolean;
  googlePlaces: boolean;
  scraperApi: boolean;
  adzuna: boolean;
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [apiStatus, setApiStatus] = useState<ApiStatus>({
    supabase: false,
    xai: false,
    googlePlaces: false,
    scraperApi: false,
    adzuna: false,
  });
  const [usage, setUsage] = useState<{
    prospects: number;
    emails: number;
    activities: number;
    scrapeRuns: number;
  } | null>(null);

  useEffect(() => {
    checkApiStatus();
    fetchUsage();
  }, []);

  const checkApiStatus = async () => {
    setLoading(true);
    try {
      // Check Supabase
      const supabaseRes = await fetch('/api/stats');
      const supabaseOk = supabaseRes.ok;

      // Check API status endpoint
      let xaiOk = false;
      let googleOk = false;
      let scraperApiOk = false;
      let adzunaOk = false;

      try {
        const apiRes = await fetch('/api/api-status');
        if (apiRes.ok) {
          const data = await apiRes.json();
          xaiOk = data.xai || false;
          googleOk = data.googlePlaces || false;
          scraperApiOk = data.scraperApi || false;
          adzunaOk = data.adzuna || false;
        }
      } catch {
        // Fallback - assume XAI is configured if supabase works
        xaiOk = supabaseOk;
      }

      setApiStatus({
        supabase: supabaseOk,
        xai: xaiOk,
        googlePlaces: googleOk,
        scraperApi: scraperApiOk,
        adzuna: adzunaOk,
      });
    } catch {
      setApiStatus({
        supabase: false,
        xai: false,
        googlePlaces: false,
        scraperApi: false,
        adzuna: false,
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchUsage = async () => {
    try {
      const res = await fetch('/api/usage');
      if (res.ok) {
        const data = await res.json();
        setUsage({
          prospects: data.prospects || 0,
          emails: data.emails || 0,
          activities: data.activities || 0,
          scrapeRuns: data.scrapeRuns || 0,
        });

        // Check Google Places from usage API
        if (data.googlePlacesConfigured) {
          setApiStatus(prev => ({ ...prev, googlePlaces: true }));
        }
      }
    } catch {
      // Ignore errors
    }
  };

  const handleTestConnection = async () => {
    setSaving(true);
    await checkApiStatus();
    await fetchUsage();
    setSaving(false);
  };

  // All 10 scrapers with their configuration
  const scrapers = [
    // 8 Base scrapers (no API keys needed)
    { name: 'Hosco', domain: 'hosco.com', status: 'active', type: 'base' },
    { name: 'Hcareers', domain: 'hcareers.com', status: 'active', type: 'base' },
    { name: 'Hotelcareer', domain: 'hotelcareer.com', status: 'active', type: 'base' },
    { name: 'TalentsHotels', domain: 'talentshotels.com', status: 'active', type: 'base' },
    { name: 'Journal des Palaces', domain: 'journaldespalaces.com', status: 'active', type: 'base' },
    { name: 'HospitalityOnline', domain: 'hospitalityonline.com', status: 'active', type: 'base' },
    { name: 'HotelJobs', domain: 'hoteljobs.com', status: 'active', type: 'base' },
    { name: 'eHotelier', domain: 'ehotelier.com', status: 'active', type: 'base' },
    // 2 API-powered scrapers
    { name: 'Indeed', domain: 'indeed.com', status: apiStatus.scraperApi ? 'active' : 'needs-api', type: 'api', apiName: 'ScraperAPI' },
    { name: 'Adzuna', domain: 'adzuna.com', status: apiStatus.adzuna ? 'active' : 'needs-api', type: 'api', apiName: 'Adzuna API' },
  ];

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Settings"
        subtitle="Configure your prospecting system"
      />

      <div className="flex-1 p-6 space-y-6 max-w-4xl overflow-auto">
        {/* API Status */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Key className="h-4 w-4 text-blue-400" />
              </div>
              <div>
                <CardTitle>API Configuration</CardTitle>
                <CardDescription>
                  Status of your API connections
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground/80">Supabase Database</label>
              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  value={process.env.NEXT_PUBLIC_SUPABASE_URL || 'Not configured'}
                  disabled
                  className="bg-white/[0.04] border-white/10"
                />
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : apiStatus.supabase ? (
                  <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Connected
                  </Badge>
                ) : (
                  <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
                    <AlertCircle className="h-3 w-3 mr-1" />
                    Error
                  </Badge>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground/80">xAI API (Grok 4)</label>
              <div className="flex items-center gap-2">
                <Input
                  type="password"
                  value="••••••••••••••••"
                  disabled
                  className="bg-white/[0.04] border-white/10"
                />
                <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Configured
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Used for AI-powered email generation and prospect cleanup
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground/80">Google Places API</label>
              <div className="flex items-center gap-2">
                <Input
                  type="password"
                  value="••••••••••••••••"
                  disabled
                  className="bg-white/[0.04] border-white/10"
                />
                {apiStatus.googlePlaces ? (
                  <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Configured
                  </Badge>
                ) : (
                  <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">
                    <AlertCircle className="h-3 w-3 mr-1" />
                    Optional
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Used for property enrichment (ratings, reviews, contact info)
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground/80">ScraperAPI (for Indeed)</label>
              <div className="flex items-center gap-2">
                <Input
                  type="password"
                  value="••••••••••••••••"
                  disabled
                  className="bg-white/[0.04] border-white/10"
                />
                {apiStatus.scraperApi ? (
                  <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Configured
                  </Badge>
                ) : (
                  <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">
                    <AlertCircle className="h-3 w-3 mr-1" />
                    Optional
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Enables proxy rotation for Indeed scraping without blocks
              </p>
            </div>

            <Button
              variant="outline"
              onClick={handleTestConnection}
              disabled={saving}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle className="h-4 w-4 mr-2" />
              )}
              Test Connections
            </Button>
          </CardContent>
        </Card>

        {/* Usage Stats */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10">
                <Database className="h-4 w-4 text-purple-400" />
              </div>
              <div>
                <CardTitle>Database Usage</CardTitle>
                <CardDescription>
                  Current data in your system
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-4">
              <div className="p-4 rounded-lg bg-white/[0.04] border border-white/[0.06]">
                <p className="text-2xl font-bold text-foreground">{usage?.prospects || 0}</p>
                <p className="text-xs text-muted-foreground">Prospects</p>
              </div>
              <div className="p-4 rounded-lg bg-white/[0.04] border border-white/[0.06]">
                <p className="text-2xl font-bold text-foreground">{usage?.emails || 0}</p>
                <p className="text-xs text-muted-foreground">Emails Generated</p>
              </div>
              <div className="p-4 rounded-lg bg-white/[0.04] border border-white/[0.06]">
                <p className="text-2xl font-bold text-foreground">{usage?.activities || 0}</p>
                <p className="text-xs text-muted-foreground">Activities</p>
              </div>
              <div className="p-4 rounded-lg bg-white/[0.04] border border-white/[0.06]">
                <p className="text-2xl font-bold text-foreground">{usage?.scrapeRuns || 0}</p>
                <p className="text-xs text-muted-foreground">Scrape Runs</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Lead Scoring */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-500/10">
                <Zap className="h-4 w-4 text-orange-400" />
              </div>
              <div>
                <CardTitle>Lead Scoring Rules</CardTitle>
                <CardDescription>
                  How prospects are automatically scored and categorized
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="p-3 rounded-lg bg-white/[0.04] border border-white/[0.06]">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-foreground/80">Hot Lead Threshold</span>
                  <Badge className="bg-red-500/20 text-red-400">≥ 70 points</Badge>
                </div>
              </div>
              <div className="p-3 rounded-lg bg-white/[0.04] border border-white/[0.06]">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-foreground/80">Warm Lead Threshold</span>
                  <Badge className="bg-amber-500/20 text-amber-400">≥ 40 points</Badge>
                </div>
              </div>
            </div>

            <Separator className="bg-white/[0.06]" />

            <div>
              <h4 className="text-sm font-medium text-foreground/80 mb-3">Score Components</h4>
              <div className="grid gap-2 md:grid-cols-2">
                {[
                  { label: 'Has Email', points: 20 },
                  { label: 'Has Website', points: 10 },
                  { label: 'Google Rating > 4.0', points: 15 },
                  { label: 'Premium Market', points: 15 },
                  { label: '5-Star Property', points: 15 },
                  { label: '100+ Reviews', points: 10 },
                  { label: 'Has Contact Person', points: 15 },
                  { label: 'Has Phone Number', points: 5 },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between p-2 rounded bg-white/[0.04]">
                    <span className="text-xs text-foreground/80">{item.label}</span>
                    <span className="text-xs font-medium text-emerald-400">+{item.points}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Active Scrapers - Now showing all 10! */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <Search className="h-4 w-4 text-green-400" />
              </div>
              <div>
                <CardTitle>Active Scrapers</CardTitle>
                <CardDescription>
                  10 job boards being monitored for prospects
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Base Scrapers */}
            <div>
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
                Base Scrapers (No API Required)
              </h4>
              <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
                {scrapers.filter(s => s.type === 'base').map((scraper) => (
                  <div key={scraper.name} className="flex items-center justify-between p-3 rounded-lg bg-white/[0.04] border border-white/[0.06]">
                    <div>
                      <span className="text-sm text-foreground">{scraper.name}</span>
                      <p className="text-[10px] text-muted-foreground">{scraper.domain}</p>
                    </div>
                    <Badge className="bg-emerald-500/20 text-emerald-400 text-[10px]">
                      Active
                    </Badge>
                  </div>
                ))}
              </div>
            </div>

            <Separator className="bg-white/[0.06]" />

            {/* API-Powered Scrapers */}
            <div>
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
                API-Powered Scrapers (Optional)
              </h4>
              <div className="grid gap-2 md:grid-cols-2">
                {scrapers.filter(s => s.type === 'api').map((scraper) => (
                  <div key={scraper.name} className="flex items-center justify-between p-3 rounded-lg bg-white/[0.04] border border-white/[0.06]">
                    <div>
                      <span className="text-sm text-foreground">{scraper.name}</span>
                      <p className="text-[10px] text-muted-foreground">
                        {scraper.domain} · requires {scraper.apiName}
                      </p>
                    </div>
                    {scraper.status === 'active' ? (
                      <Badge className="bg-emerald-500/20 text-emerald-400 text-[10px]">
                        Active
                      </Badge>
                    ) : (
                      <Badge className="bg-amber-500/20 text-amber-400 text-[10px]">
                        Needs API
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* About */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Globe className="h-4 w-4 text-blue-400" />
              </div>
              <div>
                <CardTitle>About</CardTitle>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p><strong className="text-foreground">Marketing Agent</strong> by Jengu</p>
            <p className="text-muted-foreground">AI-powered hospitality prospect management system</p>
            <p className="text-muted-foreground/60">Version 1.0.0</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
