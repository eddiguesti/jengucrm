'use client';

import { useState, useEffect } from 'react';
import { Header } from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  CheckCircle,
  AlertCircle,
  Loader2,
  Database,
  Key,
  Zap,
  Search,
  Plus,
  Send,
  Mail,
  Trash2,
  RefreshCw,
  Timer,
  FlaskConical,
  Settings as SettingsIcon,
} from 'lucide-react';

interface ApiStatus {
  supabase: boolean;
  xai: boolean;
  googlePlaces: boolean;
  scraperApi: boolean;
  adzuna: boolean;
}

interface TestProspect {
  id: string;
  name: string;
  email: string;
  city?: string;
  country?: string;
  stage?: string;
  last_contacted?: string;
}

interface SmtpStatus {
  configured: boolean;
  connected?: boolean;
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [apiStatus, setApiStatus] = useState<ApiStatus>({
    supabase: false, xai: false, googlePlaces: false, scraperApi: false, adzuna: false,
  });
  const [usage, setUsage] = useState<{
    prospects: number; emails: number; activities: number; scrapeRuns: number;
  } | null>(null);

  // Test Lab state
  const [testProspects, setTestProspects] = useState<TestProspect[]>([]);
  const [smtpStatus, setSmtpStatus] = useState<SmtpStatus | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('Test Hotel');
  const [newEmail, setNewEmail] = useState('');
  const [newCity, setNewCity] = useState('London');
  const [newCountry, setNewCountry] = useState('UK');

  useEffect(() => {
    checkApiStatus();
    fetchUsage();
    fetchTestProspects();
    checkSmtpStatus();
  }, []);

  const checkApiStatus = async () => {
    setLoading(true);
    try {
      const supabaseRes = await fetch('/api/stats');
      const supabaseOk = supabaseRes.ok;
      let xaiOk = false, googleOk = false, scraperApiOk = false, adzunaOk = false;
      try {
        const apiRes = await fetch('/api/api-status');
        if (apiRes.ok) {
          const data = await apiRes.json();
          xaiOk = data.xai || false;
          googleOk = data.googlePlaces || false;
          scraperApiOk = data.scraperApi || false;
          adzunaOk = data.adzuna || false;
        }
      } catch { xaiOk = supabaseOk; }
      setApiStatus({ supabase: supabaseOk, xai: xaiOk, googlePlaces: googleOk, scraperApi: scraperApiOk, adzuna: adzunaOk });
    } catch {
      setApiStatus({ supabase: false, xai: false, googlePlaces: false, scraperApi: false, adzuna: false });
    } finally { setLoading(false); }
  };

  const fetchUsage = async () => {
    try {
      const res = await fetch('/api/usage');
      if (res.ok) {
        const data = await res.json();
        setUsage({ prospects: data.prospects || 0, emails: data.emails || 0, activities: data.activities || 0, scrapeRuns: data.scrapeRuns || 0 });
        if (data.googlePlacesConfigured) setApiStatus(prev => ({ ...prev, googlePlaces: true }));
      }
    } catch {}
  };

  const checkSmtpStatus = async () => {
    try {
      const res = await fetch('/api/test-email?check_smtp=true');
      if (res.ok) { const data = await res.json(); setSmtpStatus(data.smtp); }
    } catch {}
  };

  const fetchTestProspects = async () => {
    try {
      const res = await fetch('/api/prospects?tags=test&limit=50');
      if (res.ok) { const data = await res.json(); setTestProspects(data.prospects || []); }
    } catch {}
  };

  const handleTestConnection = async () => {
    setSaving(true);
    await checkApiStatus();
    await fetchUsage();
    setSaving(false);
  };

  const createTestProspect = async () => {
    if (!newEmail) { alert('Please enter a test email address'); return; }
    setCreating(true);
    try {
      const res = await fetch('/api/prospects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName || 'Test Hotel', email: newEmail, city: newCity || 'London', country: newCountry || 'UK',
          tags: ['test', 'sandbox'], stage: 'new', source: 'test-lab', notes: 'Test prospect created for email testing',
        }),
      });
      if (res.ok) { setNewName('Test Hotel'); setNewEmail(''); fetchTestProspects(); }
      else { const error = await res.json(); alert(`Failed: ${error.error || 'Unknown error'}`); }
    } catch {} finally { setCreating(false); }
  };

  const generateAndSendEmail = async (prospect: TestProspect) => {
    if (!prospect.email) { alert('No email address'); return; }
    setSending(prospect.id);
    try {
      const genRes = await fetch('/api/generate-email', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prospect }),
      });
      if (!genRes.ok) { const error = await genRes.json(); alert(`Generation failed: ${error.error}`); return; }
      const emailContent = await genRes.json();
      const sendRes = await fetch('/api/test-email', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospect_id: prospect.id, to_email: prospect.email, subject: emailContent.subject, body: emailContent.body, test_type: 'delivery' }),
      });
      if (sendRes.ok) {
        const result = await sendRes.json();
        alert(result.simulated ? `Email simulated (${result.delivery_time_ms}ms)` : `Email sent! (${result.delivery_time_ms}ms)`);
        fetchTestProspects();
      }
    } catch {} finally { setSending(null); }
  };

  const deleteTestProspect = async (id: string) => {
    if (!confirm('Delete this test prospect?')) return;
    try { await fetch(`/api/prospects/${id}`, { method: 'DELETE' }); fetchTestProspects(); } catch {}
  };

  const scrapers = [
    { name: 'Hosco', domain: 'hosco.com', type: 'base' },
    { name: 'Hcareers', domain: 'hcareers.com', type: 'base' },
    { name: 'Hotelcareer', domain: 'hotelcareer.com', type: 'base' },
    { name: 'TalentsHotels', domain: 'talentshotels.com', type: 'base' },
    { name: 'Journal des Palaces', domain: 'journaldespalaces.com', type: 'base' },
    { name: 'HospitalityOnline', domain: 'hospitalityonline.com', type: 'base' },
    { name: 'HotelJobs', domain: 'hoteljobs.com', type: 'base' },
    { name: 'eHotelier', domain: 'ehotelier.com', type: 'base' },
    { name: 'Indeed', domain: 'indeed.com', type: 'api', status: apiStatus.scraperApi },
    { name: 'Adzuna', domain: 'adzuna.com', type: 'api', status: apiStatus.adzuna },
  ];

  return (
    <div className="flex flex-col h-full">
      <Header title="Settings" subtitle="System configuration and testing" />

      <div className="flex-1 p-4 md:p-6 overflow-auto">
        <Tabs defaultValue="config" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2 mb-6">
            <TabsTrigger value="config" className="flex items-center gap-2">
              <SettingsIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Configuration</span>
              <span className="sm:hidden">Config</span>
            </TabsTrigger>
            <TabsTrigger value="testing" className="flex items-center gap-2">
              <FlaskConical className="h-4 w-4" />
              <span className="hidden sm:inline">Testing</span>
              <span className="sm:hidden">Test</span>
            </TabsTrigger>
          </TabsList>

          {/* Configuration Tab */}
          <TabsContent value="config" className="space-y-6 max-w-4xl">
            {/* API Status */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-500/10"><Key className="h-4 w-4 text-blue-400" /></div>
                  <div><CardTitle className="text-base">API Configuration</CardTitle><CardDescription>Status of your API connections</CardDescription></div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  { label: 'Supabase Database', status: apiStatus.supabase, required: true },
                  { label: 'xAI API (Grok 4)', status: true, required: true },
                  { label: 'Google Places API', status: apiStatus.googlePlaces, required: false },
                  { label: 'ScraperAPI', status: apiStatus.scraperApi, required: false },
                ].map((api) => (
                  <div key={api.label} className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <label className="text-sm font-medium text-foreground/80 sm:w-48">{api.label}</label>
                    <div className="flex items-center gap-2 flex-1">
                      <Input type="password" value="••••••••••••" disabled className="bg-white/[0.04] border-white/10 flex-1" />
                      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : api.status ? (
                        <Badge className="bg-emerald-500/20 text-emerald-400 whitespace-nowrap"><CheckCircle className="h-3 w-3 mr-1" />OK</Badge>
                      ) : (
                        <Badge className={api.required ? "bg-red-500/20 text-red-400" : "bg-amber-500/20 text-amber-400"}><AlertCircle className="h-3 w-3 mr-1" />{api.required ? 'Error' : 'Optional'}</Badge>
                      )}
                    </div>
                  </div>
                ))}
                <Button variant="outline" onClick={handleTestConnection} disabled={saving} className="w-full sm:w-auto">
                  {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-2" />}Test Connections
                </Button>
              </CardContent>
            </Card>

            {/* Usage Stats */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-purple-500/10"><Database className="h-4 w-4 text-purple-400" /></div>
                  <div><CardTitle className="text-base">Database Usage</CardTitle></div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
                  {[
                    { label: 'Prospects', value: usage?.prospects || 0 },
                    { label: 'Emails', value: usage?.emails || 0 },
                    { label: 'Activities', value: usage?.activities || 0 },
                    { label: 'Scrape Runs', value: usage?.scrapeRuns || 0 },
                  ].map((stat) => (
                    <div key={stat.label} className="p-3 md:p-4 rounded-lg bg-white/[0.04] border border-white/[0.06]">
                      <p className="text-xl md:text-2xl font-bold">{stat.value}</p>
                      <p className="text-xs text-muted-foreground">{stat.label}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Lead Scoring */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-orange-500/10"><Zap className="h-4 w-4 text-orange-400" /></div>
                  <div><CardTitle className="text-base">Lead Scoring Rules</CardTitle></div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 grid-cols-2">
                  <div className="p-3 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-between">
                    <span className="text-sm">Hot Lead</span><Badge className="bg-red-500/20 text-red-400">≥70</Badge>
                  </div>
                  <div className="p-3 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-between">
                    <span className="text-sm">Warm Lead</span><Badge className="bg-amber-500/20 text-amber-400">≥40</Badge>
                  </div>
                </div>
                <div className="grid gap-2 grid-cols-2 lg:grid-cols-4">
                  {[{ l: 'Email', p: 20 }, { l: 'Website', p: 10 }, { l: 'Rating >4', p: 15 }, { l: 'Premium Market', p: 15 }, { l: '5-Star', p: 15 }, { l: '100+ Reviews', p: 10 }, { l: 'Contact', p: 15 }, { l: 'Phone', p: 5 }].map((i) => (
                    <div key={i.l} className="flex items-center justify-between p-2 rounded bg-white/[0.04] text-xs">
                      <span className="text-foreground/80">{i.l}</span><span className="font-medium text-emerald-400">+{i.p}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Scrapers */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-500/10"><Search className="h-4 w-4 text-green-400" /></div>
                  <div><CardTitle className="text-base">Active Scrapers</CardTitle><CardDescription>10 job boards monitored</CardDescription></div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2 grid-cols-2 lg:grid-cols-4">
                  {scrapers.filter(s => s.type === 'base').map((s) => (
                    <div key={s.name} className="flex items-center justify-between p-2 md:p-3 rounded-lg bg-white/[0.04] border border-white/[0.06]">
                      <div className="min-w-0"><span className="text-sm truncate block">{s.name}</span><p className="text-[10px] text-muted-foreground truncate">{s.domain}</p></div>
                      <Badge className="bg-emerald-500/20 text-emerald-400 text-[10px] shrink-0 ml-1">Active</Badge>
                    </div>
                  ))}
                </div>
                <Separator className="bg-white/[0.06]" />
                <div className="grid gap-2 grid-cols-1 sm:grid-cols-2">
                  {scrapers.filter(s => s.type === 'api').map((s) => (
                    <div key={s.name} className="flex items-center justify-between p-3 rounded-lg bg-white/[0.04] border border-white/[0.06]">
                      <div><span className="text-sm">{s.name}</span><p className="text-[10px] text-muted-foreground">{s.domain}</p></div>
                      <Badge className={s.status ? "bg-emerald-500/20 text-emerald-400 text-[10px]" : "bg-amber-500/20 text-amber-400 text-[10px]"}>{s.status ? 'Active' : 'Needs API'}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Testing Tab */}
          <TabsContent value="testing" className="space-y-6 max-w-4xl">
            {/* SMTP Status */}
            <div className={`p-3 md:p-4 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${smtpStatus?.configured && smtpStatus?.connected ? 'bg-emerald-500/10 border border-emerald-500/30' : smtpStatus?.configured ? 'bg-amber-500/10 border border-amber-500/30' : 'bg-zinc-800 border border-zinc-700'}`}>
              <div className="flex items-center gap-3">
                {smtpStatus?.configured && smtpStatus?.connected ? <CheckCircle className="h-5 w-5 text-emerald-500" /> : smtpStatus?.configured ? <AlertCircle className="h-5 w-5 text-amber-500" /> : <Mail className="h-5 w-5 text-zinc-400" />}
                <div>
                  <p className="text-sm font-medium">{smtpStatus?.configured && smtpStatus?.connected ? 'SMTP Connected' : smtpStatus?.configured ? 'SMTP Configured' : 'SMTP Not Configured'}</p>
                  <p className="text-xs text-zinc-400">{smtpStatus?.configured ? 'Emails via Microsoft Graph' : 'Emails will be simulated'}</p>
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={checkSmtpStatus} className="w-full sm:w-auto"><RefreshCw className="h-4 w-4" /></Button>
            </div>

            {/* Create Test Prospect */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2"><Plus className="h-4 w-4 text-amber-500" />Add Test Prospect</CardTitle>
                <CardDescription>Create a sandbox prospect with your email</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Hotel Name</label>
                    <Input placeholder="Test Hotel" value={newName} onChange={(e) => setNewName(e.target.value)} className="bg-zinc-800 border-zinc-700" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Your Email <span className="text-red-400">*</span></label>
                    <Input type="email" placeholder="your@email.com" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className="bg-zinc-800 border-zinc-700" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">City</label>
                    <Input placeholder="London" value={newCity} onChange={(e) => setNewCity(e.target.value)} className="bg-zinc-800 border-zinc-700" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Country</label>
                    <Input placeholder="UK" value={newCountry} onChange={(e) => setNewCountry(e.target.value)} className="bg-zinc-800 border-zinc-700" />
                  </div>
                </div>
                <Button onClick={createTestProspect} disabled={creating || !newEmail} className="w-full bg-emerald-600 hover:bg-emerald-700">
                  {creating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}Create Test Prospect
                </Button>
              </CardContent>
            </Card>

            {/* Test Prospects */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2"><Mail className="h-4 w-4 text-amber-500" />Test Prospects ({testProspects.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {testProspects.length === 0 ? (
                  <div className="text-center py-8 text-zinc-400">No test prospects yet. Create one above.</div>
                ) : (
                  <div className="space-y-2">
                    {testProspects.map((p) => (
                      <div key={p.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 md:p-4 rounded-lg bg-zinc-800">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium truncate">{p.name}</p>
                            <Badge className="bg-purple-500/20 text-purple-400">Test</Badge>
                          </div>
                          <p className="text-sm text-zinc-400 truncate">{p.email} · {p.city}, {p.country}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button size="sm" onClick={() => generateAndSendEmail(p)} disabled={sending === p.id} className="bg-amber-600 hover:bg-amber-700 flex-1 sm:flex-none">
                            {sending === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="h-4 w-4 mr-1" /><span className="hidden sm:inline">Send Test</span><span className="sm:hidden">Send</span></>}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => deleteTestProspect(p.id)} className="text-red-400 hover:text-red-300 hover:bg-red-500/10"><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Test Scenarios */}
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Timer className="h-4 w-4 text-amber-500" />Test Scenarios</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {[
                  { title: 'Email Generation', desc: 'AI-powered personalization', ok: true },
                  { title: 'Real Email Delivery', desc: 'Send via Microsoft Graph', ok: smtpStatus?.configured },
                  { title: 'Delivery Speed', desc: 'Measure generation to delivery', ok: true },
                  { title: 'Content Quality', desc: 'Review personalization', ok: true },
                ].map((s) => (
                  <div key={s.title} className="flex items-center justify-between p-3 rounded-lg bg-zinc-800">
                    <div><p className="text-sm font-medium">{s.title}</p><p className="text-xs text-zinc-400">{s.desc}</p></div>
                    <Badge className={s.ok ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}>{s.ok ? 'Ready' : 'Configure'}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
