'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function DebugCampaignsPage() {
  const [result, setResult] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const testConnection = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/outreach/campaigns');
      const data = await response.json();

      if (!response.ok) {
        setError(`API Error (${response.status}): ${data.error || 'Unknown error'}`);
        setResult(data);
      } else {
        setResult(data);
      }
    } catch (err) {
      setError(`Network Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  const createTestCampaign = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/outreach/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Test Campaign ' + Date.now(),
          description: 'A test campaign created from debug page',
          strategy_key: 'test_campaign_' + Date.now(),
          type: 'sequence',
          daily_limit: 50,
          sequences: [
            {
              step_number: 1,
              delay_days: 0,
              delay_hours: 0,
              variant_a_subject: 'Test Email Subject',
              variant_a_body: 'This is a test email body.',
            },
          ],
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(`API Error (${response.status}): ${data.error || 'Unknown error'}`);
        setResult(data);
      } else {
        setResult(data);
        alert('Campaign created successfully!');
      }
    } catch (err) {
      setError(`Network Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  const checkEnvVars = () => {
    const envVars = {
      hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      hasSupabaseAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    };
    setResult(envVars);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Campaign Debug Tool</h1>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Test API Connection</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Button onClick={testConnection} disabled={loading}>
                Test GET /api/outreach/campaigns
              </Button>
              <Button onClick={createTestCampaign} disabled={loading} variant="secondary">
                Create Test Campaign
              </Button>
              <Button onClick={checkEnvVars} disabled={loading} variant="outline">
                Check Env Vars
              </Button>
            </div>

            {loading && <div className="text-sm text-gray-500">Loading...</div>}

            {error && (
              <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-800 dark:text-red-200">
                <strong>Error:</strong> {error}
              </div>
            )}

            {result !== null && (
              <Card className="bg-gray-50">
                <CardContent className="pt-6">
                  <pre className="text-xs overflow-auto max-h-96">
                    {JSON.stringify(result, null, 2)}
                  </pre>
                </CardContent>
              </Card>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Troubleshooting Steps</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal list-inside space-y-2 text-sm">
              <li>Verify .env.local has NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY</li>
              <li>Check that Supabase database has the campaigns, campaign_sequences, and campaign_leads tables</li>
              <li>Run migrations in supabase/migrations/ if needed</li>
              <li>Verify RLS policies allow access to these tables</li>
              <li>Check browser console for additional errors</li>
            </ol>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
