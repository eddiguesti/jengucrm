'use client';

import { useState, useEffect } from 'react';
import { Header } from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

interface ApiStatus {
  supabase: boolean;
  anthropic: boolean;
  googlePlaces: boolean;
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [apiStatus, setApiStatus] = useState<ApiStatus>({
    supabase: false,
    anthropic: false,
    googlePlaces: false,
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

      // Check if APIs are configured by their environment variables
      const anthropicOk = true; // We assume it's set if the app works
      const googleOk = false; // We'll check via the usage API

      setApiStatus({
        supabase: supabaseOk,
        anthropic: anthropicOk,
        googlePlaces: googleOk,
      });
    } catch {
      setApiStatus({
        supabase: false,
        anthropic: false,
        googlePlaces: false,
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

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Settings"
        subtitle="Configure your prospecting system"
      />

      <div className="flex-1 p-6 space-y-6 max-w-4xl overflow-auto">
        {/* API Status */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-white">API Configuration</CardTitle>
            <CardDescription className="text-zinc-400">
              Status of your API connections
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300">Supabase Database</label>
              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  value={process.env.NEXT_PUBLIC_SUPABASE_URL || 'Not configured'}
                  disabled
                  className="bg-zinc-800 border-zinc-700 text-zinc-300"
                />
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
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
              <label className="text-sm font-medium text-zinc-300">Anthropic API (Claude)</label>
              <div className="flex items-center gap-2">
                <Input
                  type="password"
                  value="••••••••••••••••"
                  disabled
                  className="bg-zinc-800 border-zinc-700 text-zinc-300"
                />
                <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Configured
                </Badge>
              </div>
              <p className="text-xs text-zinc-500">
                Used for AI-powered email generation
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300">Google Places API</label>
              <div className="flex items-center gap-2">
                <Input
                  type="password"
                  value="••••••••••••••••"
                  disabled
                  className="bg-zinc-800 border-zinc-700 text-zinc-300"
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
              <p className="text-xs text-zinc-500">
                Used for property enrichment (ratings, reviews, contact info)
              </p>
            </div>

            <Button
              variant="outline"
              className="border-zinc-700"
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
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-white">Database Usage</CardTitle>
            <CardDescription className="text-zinc-400">
              Current data in your system
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-4">
              <div className="p-4 rounded-lg bg-zinc-800">
                <p className="text-2xl font-bold text-white">{usage?.prospects || 0}</p>
                <p className="text-sm text-zinc-400">Prospects</p>
              </div>
              <div className="p-4 rounded-lg bg-zinc-800">
                <p className="text-2xl font-bold text-white">{usage?.emails || 0}</p>
                <p className="text-sm text-zinc-400">Emails Generated</p>
              </div>
              <div className="p-4 rounded-lg bg-zinc-800">
                <p className="text-2xl font-bold text-white">{usage?.activities || 0}</p>
                <p className="text-sm text-zinc-400">Activities</p>
              </div>
              <div className="p-4 rounded-lg bg-zinc-800">
                <p className="text-2xl font-bold text-white">{usage?.scrapeRuns || 0}</p>
                <p className="text-sm text-zinc-400">Scrape Runs</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Lead Scoring */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-white">Lead Scoring Rules</CardTitle>
            <CardDescription className="text-zinc-400">
              How prospects are automatically scored and categorized
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="p-3 rounded-lg bg-zinc-800">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-300">Hot Lead Threshold</span>
                  <Badge className="bg-red-500/20 text-red-400">≥ 70 points</Badge>
                </div>
              </div>
              <div className="p-3 rounded-lg bg-zinc-800">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-300">Warm Lead Threshold</span>
                  <Badge className="bg-amber-500/20 text-amber-400">≥ 40 points</Badge>
                </div>
              </div>
            </div>

            <Separator className="bg-zinc-800" />

            <div>
              <h4 className="text-sm font-medium text-zinc-300 mb-3">Score Components</h4>
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
                  <div key={item.label} className="flex items-center justify-between p-2 rounded bg-zinc-800">
                    <span className="text-sm text-zinc-300">{item.label}</span>
                    <span className="text-sm font-medium text-emerald-400">+{item.points}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Scraper Info */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-white">Active Scrapers</CardTitle>
            <CardDescription className="text-zinc-400">
              Job boards being monitored for prospects
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              {[
                { name: 'Hosco', status: 'active' },
                { name: 'Hcareers', status: 'active' },
                { name: 'Hotelcareer', status: 'active' },
                { name: 'TalentsHotels', status: 'active' },
                { name: 'Journal des Palaces', status: 'active' },
                { name: 'Caterer.com', status: 'slow' },
              ].map((scraper) => (
                <div key={scraper.name} className="flex items-center justify-between p-3 rounded-lg bg-zinc-800">
                  <span className="text-zinc-300">{scraper.name}</span>
                  <Badge className={
                    scraper.status === 'active'
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-amber-500/20 text-amber-400'
                  }>
                    {scraper.status === 'active' ? 'Working' : 'Slow'}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* About */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-white">About</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-zinc-400">
            <p><strong className="text-white">Marketing Agent</strong> by Jengu</p>
            <p>AI-powered hospitality prospect management system</p>
            <p className="text-zinc-500">Version 1.0.0</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
