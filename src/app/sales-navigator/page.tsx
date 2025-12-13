'use client';

import { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { Header } from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle,
  Clock,
  Users,
  RefreshCw,
  Mail,
  Search,
  Linkedin,
  Loader2,
  XCircle,
  Play,
  ArrowRight,
} from 'lucide-react';
import Link from 'next/link';

interface SalesNavProspect {
  profileUrl: string;
  name: string;
  firstname: string;
  lastname: string;
  company: string;
  email: string | null;
  emailStatus: string;
  jobTitle: string;
  searchQuery?: string;
}

interface ImportResult {
  total: number;
  imported: number;
  duplicates: number;
  errors: number;
  prospects: Array<{
    id: string;
    name: string;
    company: string;
    email: string | null;
    status: 'imported' | 'duplicate' | 'error';
  }>;
}

interface ImportLog {
  id: string;
  filename: string;
  total_records: number;
  imported: number;
  duplicates: number;
  errors: number;
  status: string;
  created_at: string;
}

interface EnrichmentJob {
  id: string;
  prospect_id: string;
  prospect_name: string;
  company: string;
  status: 'pending' | 'finding_website' | 'finding_email' | 'verifying' | 'researching' | 'ready' | 'failed';
  email_found: string | null;
  email_verified: boolean;
  research_done: boolean;
  error: string | null;
  created_at: string;
}

export default function SalesNavigatorPage() {
  const [activeTab, setActiveTab] = useState('import');

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Sales Navigator Import"
        subtitle="Import LinkedIn prospects and enrich with email & research"
      />

      <div className="flex-1 p-4 md:p-6 overflow-auto">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full max-w-lg grid-cols-3 bg-zinc-900 border border-zinc-800">
            <TabsTrigger
              value="import"
              className="data-[state=active]:bg-amber-600 data-[state=active]:text-white flex items-center gap-2"
            >
              <Upload className="h-4 w-4" />
              <span className="hidden sm:inline">Import CSV</span>
              <span className="sm:hidden">Import</span>
            </TabsTrigger>
            <TabsTrigger
              value="enrichment"
              className="data-[state=active]:bg-amber-600 data-[state=active]:text-white flex items-center gap-2"
            >
              <Search className="h-4 w-4" />
              <span className="hidden sm:inline">Enrichment</span>
              <span className="sm:hidden">Enrich</span>
            </TabsTrigger>
            <TabsTrigger
              value="history"
              className="data-[state=active]:bg-amber-600 data-[state=active]:text-white flex items-center gap-2"
            >
              <Clock className="h-4 w-4" />
              <span className="hidden sm:inline">History</span>
              <span className="sm:hidden">Logs</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="import" className="mt-6">
            <ImportTab />
          </TabsContent>

          <TabsContent value="enrichment" className="mt-6">
            <EnrichmentTab />
          </TabsContent>

          <TabsContent value="history" className="mt-6">
            <HistoryTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function ImportTab() {
  const [parsing, setParsing] = useState(false);
  const [parsedData, setParsedData] = useState<SalesNavProspect[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const parseCSV = (text: string): SalesNavProspect[] => {
    const lines = text.split(/\r?\n/).filter(line => line.trim());
    if (lines.length < 2) return [];

    const parseLine = (line: string): string[] => {
      const values: string[] = [];
      let current = '';
      let inQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"') {
          // Handle escaped quotes ("")
          if (inQuotes && line[i + 1] === '"') {
            current += '"';
            i++;
            continue;
          }

          inQuotes = !inQuotes;
          continue;
        }

        if (char === ',' && !inQuotes) {
          values.push(current.trim());
          current = '';
          continue;
        }

        current += char;
      }

      values.push(current.trim());
      return values.map(v => v.replace(/^\uFEFF/, '').replace(/^"|"$/g, '').trim());
    };

    // Parse header
    const header = parseLine(lines[0]).map(h => h.trim().replace(/^"|"$/g, ''));

    // Find column indices
    const cols = {
      profileUrl: header.findIndex(h => h.toLowerCase().includes('profileurl') || h.toLowerCase().includes('profile')),
      name: header.findIndex(h => h.toLowerCase() === 'name'),
      firstname: header.findIndex(h => h.toLowerCase().includes('firstname') || h.toLowerCase() === 'first'),
      lastname: header.findIndex(h => h.toLowerCase().includes('lastname') || h.toLowerCase() === 'last'),
      company: header.findIndex(h => h.toLowerCase() === 'company'),
      email: header.findIndex(h => h.toLowerCase() === 'email'),
      emailStatus: header.findIndex(h => h.toLowerCase().includes('emailstatus') || h.toLowerCase().includes('status')),
      jobTitle: header.findIndex(h => h.toLowerCase().includes('jobtitle') || h.toLowerCase().includes('title')),
    };

    const prospects: SalesNavProspect[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = parseLine(lines[i]);

      const getValue = (idx: number) => (idx >= 0 && idx < values.length ? values[idx] : '');

      const email = getValue(cols.email);
      const emailStatus = getValue(cols.emailStatus);
      const emailLooksValid = email.includes('@') && email.includes('.');
      const status = emailStatus.toLowerCase();
      const shouldUseEmail =
        emailLooksValid &&
        (status.includes('found') || status.includes('verified') || status.includes('available') || status === '');

      prospects.push({
        profileUrl: getValue(cols.profileUrl),
        name: getValue(cols.name),
        firstname: getValue(cols.firstname),
        lastname: getValue(cols.lastname),
        company: getValue(cols.company),
        email: shouldUseEmail ? email : null,
        emailStatus: emailStatus,
        jobTitle: getValue(cols.jobTitle),
      });
    }

    return prospects.filter(p => p.name || (p.firstname && p.lastname));
  };

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setFileName(file.name);
    setParsing(true);
    setImportResult(null);

    try {
      const text = await file.text();
      const parsed = parseCSV(text);
      setParsedData(parsed);
    } catch (error) {
      console.error('Failed to parse CSV:', error);
      alert('Failed to parse CSV file');
    } finally {
      setParsing(false);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.ms-excel': ['.csv'],
    },
    maxFiles: 1,
  });

  const handleImport = async () => {
    if (parsedData.length === 0) return;

    setImporting(true);
    try {
      const res = await fetch('/api/sales-navigator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prospects: parsedData,
          filename: fileName,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setImportResult(data.result);
        setParsedData([]);
      } else {
        alert(`Import failed: ${data.error}`);
      }
    } catch (error) {
      alert(`Import failed: ${error}`);
    } finally {
      setImporting(false);
    }
  };

  const hasEmails = parsedData.filter(p => p.email).length;
  const needsEmails = parsedData.filter(p => !p.email).length;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-6">
        {/* Upload Zone */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-amber-500" />
              Upload Sales Navigator Export
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                isDragActive
                  ? 'border-amber-500 bg-amber-500/10'
                  : 'border-zinc-700 hover:border-zinc-600'
              }`}
            >
              <input {...getInputProps()} />
              {parsing ? (
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="h-12 w-12 text-amber-500 animate-spin" />
                  <p className="text-zinc-400">Parsing CSV...</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <Upload className={`h-12 w-12 ${isDragActive ? 'text-amber-500' : 'text-zinc-500'}`} />
                  <div>
                    <p className="text-white font-medium">
                      {isDragActive ? 'Drop the CSV file here' : 'Drag & drop your CSV file'}
                    </p>
                    <p className="text-zinc-400 text-sm mt-1">
                      or click to browse (Sales Navigator export format)
                    </p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Preview */}
        {parsedData.length > 0 && (
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-white">
                Preview ({parsedData.length} prospects)
              </CardTitle>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-zinc-700"
                  onClick={() => {
                    setParsedData([]);
                    setFileName(null);
                  }}
                >
                  Clear
                </Button>
                <Button
                  onClick={handleImport}
                  disabled={importing}
                  className="bg-amber-600 hover:bg-amber-700"
                >
                  {importing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <ArrowRight className="h-4 w-4 mr-2" />
                      Import All
                    </>
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-4 flex gap-4">
                <div className="p-3 rounded-lg bg-zinc-800">
                  <p className="text-2xl font-bold text-white">{parsedData.length}</p>
                  <p className="text-xs text-zinc-400">Total</p>
                </div>
                <div className="p-3 rounded-lg bg-emerald-600/20">
                  <p className="text-2xl font-bold text-emerald-400">{hasEmails}</p>
                  <p className="text-xs text-zinc-400">Has Email</p>
                </div>
                <div className="p-3 rounded-lg bg-amber-600/20">
                  <p className="text-2xl font-bold text-amber-400">{needsEmails}</p>
                  <p className="text-xs text-zinc-400">Needs Email</p>
                </div>
              </div>

              <div className="max-h-80 overflow-auto space-y-2">
                {parsedData.slice(0, 20).map((prospect, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-3 rounded-lg bg-zinc-800"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-9 w-9 rounded-full bg-blue-600/20 flex items-center justify-center flex-shrink-0">
                        <Linkedin className="h-4 w-4 text-blue-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-white truncate">
                          {prospect.name || `${prospect.firstname} ${prospect.lastname}`}
                        </p>
                        <p className="text-xs text-zinc-400 truncate">
                          {prospect.jobTitle} at {prospect.company}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {prospect.email ? (
                        <Badge className="bg-emerald-600/20 text-emerald-400">
                          <Mail className="h-3 w-3 mr-1" />
                          Has Email
                        </Badge>
                      ) : (
                        <Badge className="bg-amber-600/20 text-amber-400">
                          <Search className="h-3 w-3 mr-1" />
                          Find Email
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
                {parsedData.length > 20 && (
                  <p className="text-center text-zinc-500 text-sm py-2">
                    ... and {parsedData.length - 20} more
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Import Result */}
        {importResult && (
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <CheckCircle className="h-8 w-8 text-emerald-500" />
                <div>
                  <h3 className="font-semibold text-white text-lg">Import Complete!</h3>
                  <p className="text-zinc-400 text-sm">{fileName}</p>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-4 mb-4">
                <div className="p-3 rounded-lg bg-zinc-800 text-center">
                  <p className="text-2xl font-bold text-white">{importResult.total}</p>
                  <p className="text-xs text-zinc-400">Total</p>
                </div>
                <div className="p-3 rounded-lg bg-emerald-600/20 text-center">
                  <p className="text-2xl font-bold text-emerald-400">{importResult.imported}</p>
                  <p className="text-xs text-zinc-400">Imported</p>
                </div>
                <div className="p-3 rounded-lg bg-zinc-800 text-center">
                  <p className="text-2xl font-bold text-zinc-400">{importResult.duplicates}</p>
                  <p className="text-xs text-zinc-400">Duplicates</p>
                </div>
                <div className="p-3 rounded-lg bg-red-600/20 text-center">
                  <p className="text-2xl font-bold text-red-400">{importResult.errors}</p>
                  <p className="text-xs text-zinc-400">Errors</p>
                </div>
              </div>

              <div className="flex gap-3">
                <Link href="/prospects" className="flex-1">
                  <Button className="w-full bg-amber-600 hover:bg-amber-700">
                    <Users className="h-4 w-4 mr-2" />
                    View Prospects
                  </Button>
                </Link>
                <Button
                  variant="outline"
                  className="border-zinc-700"
                  onClick={() => setImportResult(null)}
                >
                  Import More
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Sidebar */}
      <div className="space-y-6">
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-white text-sm flex items-center gap-2">
              <Linkedin className="h-4 w-4 text-blue-500" />
              Sales Navigator Export
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-zinc-400">
            <p>Export your leads from Sales Navigator:</p>
            <ol className="space-y-2 list-decimal list-inside">
              <li>Go to your saved leads list</li>
              <li>Click Export to CSV</li>
              <li>Upload the file here</li>
            </ol>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-white text-sm">Expected Columns</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {['profileUrl', 'name', 'firstname', 'lastname', 'company', 'email', 'emailStatus', 'jobTitle'].map(col => (
              <Badge key={col} variant="secondary" className="bg-zinc-800 text-zinc-300 mr-1">
                {col}
              </Badge>
            ))}
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-white text-sm">After Import</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-zinc-400">
            <div className="flex items-start gap-2">
              <div className="h-5 w-5 rounded-full bg-amber-600/20 text-amber-500 flex items-center justify-center text-xs flex-shrink-0">
                1
              </div>
              <p>Find emails for contacts without them</p>
            </div>
            <div className="flex items-start gap-2">
              <div className="h-5 w-5 rounded-full bg-amber-600/20 text-amber-500 flex items-center justify-center text-xs flex-shrink-0">
                2
              </div>
              <p>Verify emails before sending</p>
            </div>
            <div className="flex items-start gap-2">
              <div className="h-5 w-5 rounded-full bg-amber-600/20 text-amber-500 flex items-center justify-center text-xs flex-shrink-0">
                3
              </div>
              <p>AI research on each prospect</p>
            </div>
            <div className="flex items-start gap-2">
              <div className="h-5 w-5 rounded-full bg-amber-600/20 text-amber-500 flex items-center justify-center text-xs flex-shrink-0">
                4
              </div>
              <p>Generate personalized emails</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function EnrichmentTab() {
  const [jobs, setJobs] = useState<EnrichmentJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  const fetchJobs = async () => {
    try {
      const res = await fetch('/api/sales-navigator/enrichment');
      const data = await res.json();
      if (data.jobs) {
        setJobs(data.jobs);
      }
    } catch (error) {
      console.error('Failed to fetch jobs:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
    const interval = setInterval(fetchJobs, 5000);
    return () => clearInterval(interval);
  }, []);

  const startEnrichment = async () => {
    setProcessing(true);
    try {
      const res = await fetch('/api/sales-navigator/enrichment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', limit: 10, includeResearch: false }),
      });
      const data = await res.json();
      if (data.success) {
        fetchJobs();
      } else {
        alert(`Failed: ${data.error}`);
      }
    } catch (error) {
      alert(`Failed: ${error}`);
    } finally {
      setProcessing(false);
    }
  };

  const pendingCount = jobs.filter(j => j.status === 'pending').length;
  const processingCount = jobs.filter(j => ['finding_website', 'finding_email', 'verifying', 'researching'].includes(j.status)).length;
  const readyCount = jobs.filter(j => j.status === 'ready').length;
  const failedCount = jobs.filter(j => j.status === 'failed').length;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-6">
        {/* Controls */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-lg bg-amber-600/20 flex items-center justify-center">
                  <Search className={`h-6 w-6 text-amber-500 ${processing ? 'animate-pulse' : ''}`} />
                </div>
                <div>
                  <h3 className="font-medium text-white">
                    {processing ? 'Enriching prospects...' : 'Enrichment Queue'}
                  </h3>
                  <p className="text-sm text-zinc-400">
                    {pendingCount} pending, {processingCount} processing, {readyCount} ready
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button asChild variant="outline" className="border-zinc-700">
                  <a href="/api/sales-navigator/export?onlyWithEmail=true">
                    <FileSpreadsheet className="h-4 w-4 mr-2" />
                    Download CSV
                  </a>
                </Button>
                <Button
                  onClick={startEnrichment}
                  disabled={processing || pendingCount === 0}
                  className="bg-amber-600 hover:bg-amber-700"
                >
                  {processing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 mr-2" />
                      Start Enrichment
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Job List */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-white">Enrichment Jobs</CardTitle>
            <Button variant="ghost" size="sm" onClick={fetchJobs} className="text-zinc-400">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 text-zinc-500 animate-spin" />
              </div>
            ) : jobs.length === 0 ? (
              <p className="text-zinc-500 text-center py-8">
                No enrichment jobs yet. Import prospects from Sales Navigator first.
              </p>
            ) : (
              <div className="space-y-3 max-h-96 overflow-auto">
                {jobs.map((job) => (
                  <div
                    key={job.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-zinc-800"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {job.status === 'ready' ? (
                        <CheckCircle className="h-5 w-5 text-emerald-500 flex-shrink-0" />
                      ) : job.status === 'failed' ? (
                        <XCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
                      ) : job.status === 'pending' ? (
                        <Clock className="h-5 w-5 text-zinc-500 flex-shrink-0" />
                      ) : (
                        <Loader2 className="h-5 w-5 text-amber-500 animate-spin flex-shrink-0" />
                      )}
	                      <div className="min-w-0">
	                        <p className="font-medium text-white truncate">{job.prospect_name}</p>
	                        <p className="text-xs text-zinc-400 truncate">{job.company}</p>
	                        {job.error && (
	                          <p
	                            className={`text-xs truncate ${job.status === 'failed' ? 'text-red-400' : 'text-amber-400'}`}
	                            title={job.error}
	                          >
	                            {job.error}
	                          </p>
	                        )}
	                      </div>
	                    </div>
                    <div className="flex items-center gap-2">
                      {job.email_found && (
                        <Badge className={job.email_verified ? 'bg-emerald-600/20 text-emerald-400' : 'bg-amber-600/20 text-amber-400'}>
                          <Mail className="h-3 w-3 mr-1" />
                          {job.email_verified ? 'Verified' : 'Found'}
                        </Badge>
                      )}
                      {job.research_done && (
                        <Badge className="bg-blue-600/20 text-blue-400">
                          <Search className="h-3 w-3 mr-1" />
                          Researched
                        </Badge>
                      )}
                      <Badge
                        className={
                          job.status === 'ready'
                            ? 'bg-emerald-600/20 text-emerald-400'
                            : job.status === 'failed'
                            ? 'bg-red-600/20 text-red-400'
                            : job.status === 'pending'
                            ? 'bg-zinc-700 text-zinc-400'
                            : 'bg-amber-600/20 text-amber-400'
                        }
                      >
                        {job.status}
                      </Badge>
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
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-white text-sm">Queue Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-zinc-500" />
                <span className="text-zinc-400 text-sm">Pending</span>
              </div>
              <span className="font-medium text-white">{pendingCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 text-amber-500" />
                <span className="text-zinc-400 text-sm">Processing</span>
              </div>
              <span className="font-medium text-amber-400">{processingCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-emerald-500" />
                <span className="text-zinc-400 text-sm">Ready</span>
              </div>
              <span className="font-medium text-emerald-400">{readyCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <XCircle className="h-4 w-4 text-red-500" />
                <span className="text-zinc-400 text-sm">Failed</span>
              </div>
              <span className="font-medium text-red-400">{failedCount}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-white text-sm">Enrichment Steps</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-zinc-400">
            <div className="flex items-start gap-2">
              <Search className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-white">Find Website</p>
                <p className="text-xs">DuckDuckGo + Brave + Grok selection</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <Mail className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-white">Find Email</p>
                <p className="text-xs">Scrape official site, then Grok fallback</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-white">Verify Email</p>
                <p className="text-xs">MillionVerifier (or MX fallback)</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function HistoryTab() {
  const [logs, setLogs] = useState<ImportLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const res = await fetch('/api/sales-navigator/history');
        const data = await res.json();
        if (data.logs) {
          setLogs(data.logs);
        }
      } catch (error) {
        console.error('Failed to fetch logs:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchLogs();
  }, []);

  return (
    <Card className="bg-zinc-900 border-zinc-800">
      <CardHeader>
        <CardTitle className="text-white">Import History</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 text-zinc-500 animate-spin" />
          </div>
        ) : logs.length === 0 ? (
          <p className="text-zinc-500 text-center py-8">No imports yet</p>
        ) : (
          <div className="space-y-3">
            {logs.map((log) => (
              <div
                key={log.id}
                className="flex items-center justify-between p-4 rounded-lg bg-zinc-800"
              >
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-lg bg-blue-600/20 flex items-center justify-center">
                    <FileSpreadsheet className="h-5 w-5 text-blue-400" />
                  </div>
                  <div>
                    <p className="font-medium text-white">{log.filename}</p>
                    <p className="text-xs text-zinc-400">
                      {new Date(log.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-6 text-sm">
                  <div className="text-center">
                    <p className="font-medium text-white">{log.total_records}</p>
                    <p className="text-zinc-500">Total</p>
                  </div>
                  <div className="text-center">
                    <p className="font-medium text-emerald-400">+{log.imported}</p>
                    <p className="text-zinc-500">New</p>
                  </div>
                  <div className="text-center">
                    <p className="font-medium text-zinc-400">{log.duplicates}</p>
                    <p className="text-zinc-500">Dupes</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
