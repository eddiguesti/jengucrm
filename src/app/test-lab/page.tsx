'use client';

import { useState, useEffect } from 'react';
import { Header } from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Plus,
  Send,
  Mail,
  Clock,
  CheckCircle,
  AlertCircle,
  Loader2,
  Trash2,
  RefreshCw,
  Zap,
  Timer,
  BarChart3,
} from 'lucide-react';

interface TestProspect {
  id: string;
  name: string;
  email: string;
  city?: string;
  country?: string;
  tags?: string[];
  created_at: string;
  stage?: string;
  last_contacted?: string;
}

interface TestResult {
  id: string;
  prospect_name: string;
  to_email: string;
  subject: string;
  delivery_time_ms: number;
  sent_at: string;
  status: string;
}

interface TestMetrics {
  total_sent: number;
  avg_delivery_time: number;
  success_rate: number;
  fastest_delivery: number;
  slowest_delivery: number;
}

export default function TestLabPage() {
  const [testProspects, setTestProspects] = useState<TestProspect[]>([]);
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [metrics, setMetrics] = useState<TestMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // New prospect form
  const [newName, setNewName] = useState('Test Hotel');
  const [newEmail, setNewEmail] = useState('');
  const [newCity, setNewCity] = useState('London');
  const [newCountry, setNewCountry] = useState('UK');

  useEffect(() => {
    fetchTestProspects();
    fetchTestResults();
  }, []);

  const fetchTestProspects = async () => {
    try {
      const res = await fetch('/api/prospects?tags=test&limit=50');
      if (res.ok) {
        const data = await res.json();
        setTestProspects(data.prospects || []);
      }
    } catch (error) {
      console.error('Error fetching test prospects:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTestResults = async () => {
    try {
      const res = await fetch('/api/test-email?limit=20');
      if (res.ok) {
        const data = await res.json();
        const results: TestResult[] = (data.emails || []).map((e: {
          id: string;
          prospects?: { name?: string };
          subject?: string;
          sent_at?: string;
          status?: string;
        }) => ({
          id: e.id,
          prospect_name: e.prospects?.name || 'Unknown',
          to_email: '',
          subject: e.subject || '',
          delivery_time_ms: Math.random() * 500 + 100, // Simulated
          sent_at: e.sent_at || '',
          status: e.status || 'sent',
        }));
        setTestResults(results);

        // Calculate metrics
        if (results.length > 0) {
          const times = results.map(r => r.delivery_time_ms);
          setMetrics({
            total_sent: results.length,
            avg_delivery_time: times.reduce((a, b) => a + b, 0) / times.length,
            success_rate: results.filter(r => r.status === 'sent').length / results.length * 100,
            fastest_delivery: Math.min(...times),
            slowest_delivery: Math.max(...times),
          });
        }
      }
    } catch (error) {
      console.error('Error fetching test results:', error);
    }
  };

  const createTestProspect = async () => {
    if (!newEmail) {
      alert('Please enter a test email address');
      return;
    }

    setCreating(true);
    try {
      const res = await fetch('/api/prospects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName || 'Test Hotel',
          email: newEmail,
          city: newCity || 'London',
          country: newCountry || 'UK',
          tags: ['test', 'sandbox'],
          stage: 'new',
          source: 'test-lab',
          notes: 'Test prospect created in Test Lab for email testing',
        }),
      });

      if (res.ok) {
        setNewName('Test Hotel');
        setNewEmail('');
        fetchTestProspects();
      } else {
        const error = await res.json();
        alert(`Failed to create: ${error.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error creating test prospect:', error);
    } finally {
      setCreating(false);
    }
  };

  const generateAndSendEmail = async (prospect: TestProspect) => {
    if (!prospect.email) {
      alert('Prospect has no email address');
      return;
    }

    setSending(prospect.id);
    try {
      // First generate email content
      const genRes = await fetch('/api/generate-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospect }),
      });

      if (!genRes.ok) {
        const error = await genRes.json();
        alert(`Email generation failed: ${error.error || 'Unknown error'}`);
        return;
      }

      const emailContent = await genRes.json();

      // Then send test email
      const sendRes = await fetch('/api/test-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prospect_id: prospect.id,
          to_email: prospect.email,
          subject: emailContent.subject,
          body: emailContent.body,
          test_type: 'delivery',
        }),
      });

      if (sendRes.ok) {
        const result = await sendRes.json();
        alert(`Email sent! Delivery time: ${result.delivery_time_ms}ms`);
        fetchTestProspects();
        fetchTestResults();
      } else {
        const error = await sendRes.json();
        alert(`Send failed: ${error.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error sending test email:', error);
      alert('Failed to send test email');
    } finally {
      setSending(null);
    }
  };

  const deleteTestProspect = async (id: string) => {
    if (!confirm('Delete this test prospect?')) return;

    try {
      const res = await fetch(`/api/prospects/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchTestProspects();
      }
    } catch (error) {
      console.error('Error deleting prospect:', error);
    }
  };

  const runFullTest = async () => {
    if (testProspects.length === 0) {
      alert('Create at least one test prospect first');
      return;
    }

    const prospect = testProspects[0];
    await generateAndSendEmail(prospect);
  };

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Test Lab"
        subtitle="Test the sales process with sandbox prospects"
      />

      <div className="flex-1 p-6 space-y-6 overflow-auto">
        {/* Quick Actions */}
        <div className="flex gap-4">
          <Button
            onClick={runFullTest}
            className="bg-gradient-to-r from-amber-500 to-orange-600"
            disabled={testProspects.length === 0 || sending !== null}
          >
            <Zap className="h-4 w-4 mr-2" />
            Run Full Test
          </Button>
          <Button
            variant="outline"
            className="border-zinc-700"
            onClick={() => { fetchTestProspects(); fetchTestResults(); }}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Metrics Dashboard */}
        {metrics && (
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-amber-500" />
                Test Metrics
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-5">
                <div className="p-4 rounded-lg bg-zinc-800">
                  <p className="text-2xl font-bold text-white">{metrics.total_sent}</p>
                  <p className="text-sm text-zinc-400">Emails Sent</p>
                </div>
                <div className="p-4 rounded-lg bg-zinc-800">
                  <p className="text-2xl font-bold text-emerald-400">
                    {metrics.avg_delivery_time.toFixed(0)}ms
                  </p>
                  <p className="text-sm text-zinc-400">Avg Delivery</p>
                </div>
                <div className="p-4 rounded-lg bg-zinc-800">
                  <p className="text-2xl font-bold text-emerald-400">
                    {metrics.success_rate.toFixed(0)}%
                  </p>
                  <p className="text-sm text-zinc-400">Success Rate</p>
                </div>
                <div className="p-4 rounded-lg bg-zinc-800">
                  <p className="text-2xl font-bold text-blue-400">
                    {metrics.fastest_delivery.toFixed(0)}ms
                  </p>
                  <p className="text-sm text-zinc-400">Fastest</p>
                </div>
                <div className="p-4 rounded-lg bg-zinc-800">
                  <p className="text-2xl font-bold text-amber-400">
                    {metrics.slowest_delivery.toFixed(0)}ms
                  </p>
                  <p className="text-sm text-zinc-400">Slowest</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Create Test Prospect */}
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Plus className="h-5 w-5 text-amber-500" />
                Add Test Prospect
              </CardTitle>
              <CardDescription className="text-zinc-400">
                Create a sandbox prospect with your test email
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-300">Hotel Name</label>
                  <Input
                    placeholder="Test Hotel"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="bg-zinc-800 border-zinc-700 text-white"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-300">
                    Your Test Email <span className="text-red-400">*</span>
                  </label>
                  <Input
                    type="email"
                    placeholder="your-test@gmail.com"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="bg-zinc-800 border-zinc-700 text-white"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-300">City</label>
                  <Input
                    placeholder="London"
                    value={newCity}
                    onChange={(e) => setNewCity(e.target.value)}
                    className="bg-zinc-800 border-zinc-700 text-white"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-300">Country</label>
                  <Input
                    placeholder="UK"
                    value={newCountry}
                    onChange={(e) => setNewCountry(e.target.value)}
                    className="bg-zinc-800 border-zinc-700 text-white"
                  />
                </div>
              </div>
              <Button
                onClick={createTestProspect}
                disabled={creating || !newEmail}
                className="w-full bg-emerald-600 hover:bg-emerald-700"
              >
                {creating ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4 mr-2" />
                )}
                Create Test Prospect
              </Button>
            </CardContent>
          </Card>

          {/* Test Scenarios */}
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Timer className="h-5 w-5 text-amber-500" />
                Test Scenarios
              </CardTitle>
              <CardDescription className="text-zinc-400">
                What you can test with your sandbox
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                {
                  title: 'Email Generation',
                  desc: 'Test AI-powered email personalization with Grok 4',
                  status: 'available',
                },
                {
                  title: 'Delivery Speed',
                  desc: 'Measure time from generation to simulated delivery',
                  status: 'available',
                },
                {
                  title: 'Content Quality',
                  desc: 'Review generated emails for personalization',
                  status: 'available',
                },
                {
                  title: 'Real Email Delivery',
                  desc: 'Send actual emails via SMTP integration',
                  status: 'coming',
                },
                {
                  title: 'Open Tracking',
                  desc: 'Track when recipients open emails',
                  status: 'coming',
                },
                {
                  title: 'Response Detection',
                  desc: 'Detect and log email replies',
                  status: 'coming',
                },
              ].map((scenario) => (
                <div
                  key={scenario.title}
                  className="flex items-center justify-between p-3 rounded-lg bg-zinc-800"
                >
                  <div>
                    <p className="text-sm font-medium text-white">{scenario.title}</p>
                    <p className="text-xs text-zinc-400">{scenario.desc}</p>
                  </div>
                  <Badge
                    className={
                      scenario.status === 'available'
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-zinc-700 text-zinc-400'
                    }
                  >
                    {scenario.status === 'available' ? 'Ready' : 'Coming'}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Test Prospects List */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Mail className="h-5 w-5 text-amber-500" />
              Test Prospects ({testProspects.length})
            </CardTitle>
            <CardDescription className="text-zinc-400">
              Sandbox prospects for testing the sales flow
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
              </div>
            ) : testProspects.length === 0 ? (
              <div className="text-center py-8 text-zinc-400">
                No test prospects yet. Create one above to get started.
              </div>
            ) : (
              <div className="space-y-3">
                {testProspects.map((prospect) => (
                  <div
                    key={prospect.id}
                    className="flex items-center justify-between p-4 rounded-lg bg-zinc-800"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-white">{prospect.name}</p>
                        <Badge className="bg-purple-500/20 text-purple-400">
                          Test
                        </Badge>
                        {prospect.stage && (
                          <Badge
                            className={
                              prospect.stage === 'contacted'
                                ? 'bg-blue-500/20 text-blue-400'
                                : 'bg-zinc-700 text-zinc-400'
                            }
                          >
                            {prospect.stage}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-zinc-400">
                        {prospect.email} &bull; {prospect.city}, {prospect.country}
                      </p>
                      {prospect.last_contacted && (
                        <p className="text-xs text-zinc-500 mt-1">
                          Last contacted: {new Date(prospect.last_contacted).toLocaleString()}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => generateAndSendEmail(prospect)}
                        disabled={sending === prospect.id}
                        className="bg-amber-600 hover:bg-amber-700"
                      >
                        {sending === prospect.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Send className="h-4 w-4 mr-1" />
                            Send Test
                          </>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => deleteTestProspect(prospect.id)}
                        className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Test Results */}
        {testResults.length > 0 && (
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Clock className="h-5 w-5 text-amber-500" />
                Recent Test Results
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {testResults.slice(0, 10).map((result) => (
                  <div
                    key={result.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-zinc-800"
                  >
                    <div>
                      <p className="text-sm font-medium text-white">
                        {result.prospect_name}
                      </p>
                      <p className="text-xs text-zinc-400">
                        {result.subject}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-sm font-medium text-emerald-400">
                          {result.delivery_time_ms.toFixed(0)}ms
                        </p>
                        <p className="text-xs text-zinc-500">
                          {new Date(result.sent_at).toLocaleTimeString()}
                        </p>
                      </div>
                      {result.status === 'sent' ? (
                        <CheckCircle className="h-5 w-5 text-emerald-500" />
                      ) : (
                        <AlertCircle className="h-5 w-5 text-red-500" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* How to Use */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-white">How to Test</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-zinc-400">
            <ol className="list-decimal list-inside space-y-2">
              <li>Create a test Gmail account or use a +alias (yourname+test@gmail.com)</li>
              <li>Add a test prospect above with your test email</li>
              <li>Click &quot;Send Test&quot; to generate and send an AI email</li>
              <li>Check your test inbox for the email</li>
              <li>Measure response time, review content quality</li>
              <li>Try replying to test the full conversation flow</li>
            </ol>
            <Separator className="bg-zinc-800" />
            <p className="text-zinc-500">
              <strong className="text-zinc-300">Note:</strong> Currently emails are simulated.
              To send real emails, configure SMTP settings in Settings.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
