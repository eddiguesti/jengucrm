'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Header } from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Star,
  MapPin,
  Mail,
  Loader2,
  ArrowLeft,
  RefreshCw,
  Copy,
  Check,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import type { Prospect, Email, Activity, ProspectStage, PainSignal } from '@/types';
import {
  NextActionCard,
  HiringSignalCard,
  PainSignalsCard,
  ContactInfoCard,
  ScoreBreakdownCard,
  SourceInfoCard,
} from './components';

const STAGES: { value: ProspectStage; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'researching', label: 'Researching' },
  { value: 'outreach', label: 'Outreach' },
  { value: 'engaged', label: 'Engaged' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'proposal', label: 'Proposal' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
];

function getTierBadge(tier: string) {
  switch (tier) {
    case 'hot':
      return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Hot Lead</Badge>;
    case 'warm':
      return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">Warm Lead</Badge>;
    default:
      return <Badge className="bg-zinc-500/20 text-zinc-400 border-zinc-500/30">Cold Lead</Badge>;
  }
}

function formatTimeAgo(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) return `${diffMins} minutes ago`;
  if (diffHours < 24) return `${diffHours} hours ago`;
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString();
}

export default function ProspectDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [prospect, setProspect] = useState<Prospect | null>(null);
  const [emails, setEmails] = useState<Email[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [painSignals, setPainSignals] = useState<PainSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEnriching, setIsEnriching] = useState(false);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [noteContent, setNoteContent] = useState('');
  const [generatedEmail, setGeneratedEmail] = useState<{ subject: string; body: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchProspect = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/prospects/${id}`);
      if (!response.ok) throw new Error('Failed to fetch prospect');

      const data = await response.json();
      setProspect(data.prospect);
      setEmails(data.prospect.emails || []);
      setActivities(data.prospect.activities || []);
      setPainSignals(data.prospect.pain_signals || []);
      setNoteContent(data.prospect.notes || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load prospect');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) fetchProspect();
  }, [id]);

  const handleGenerateEmail = async () => {
    if (!prospect) return;
    setIsGenerating(true);
    setGeneratedEmail(null);

    try {
      const response = await fetch('/api/generate-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospect }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate email');
      }

      const data = await response.json();
      setGeneratedEmail({
        subject: data.email.subject,
        body: data.email.body,
      });

      fetchProspect();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to generate email');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleEnrich = async () => {
    if (!prospect) return;
    setIsEnriching(true);

    try {
      const response = await fetch('/api/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospect_id: prospect.id }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to enrich');
      }

      fetchProspect();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to enrich prospect');
    } finally {
      setIsEnriching(false);
    }
  };

  const handleStageChange = async (newStage: ProspectStage) => {
    if (!prospect) return;

    try {
      const response = await fetch(`/api/prospects/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: newStage }),
      });

      if (!response.ok) throw new Error('Failed to update stage');

      setProspect({ ...prospect, stage: newStage });
      fetchProspect();
    } catch {
      alert('Failed to update stage');
    }
  };

  const handleSaveNote = async () => {
    if (!prospect) return;
    setIsSavingNote(true);

    try {
      const response = await fetch(`/api/prospects/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: noteContent }),
      });

      if (!response.ok) throw new Error('Failed to save note');

      setProspect({ ...prospect, notes: noteContent });
    } catch {
      alert('Failed to save note');
    } finally {
      setIsSavingNote(false);
    }
  };

  const handleCopyEmail = () => {
    if (!generatedEmail) return;
    const text = `Subject: ${generatedEmail.subject}\n\n${generatedEmail.body}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <Header title="Loading..." subtitle="" />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
        </div>
      </div>
    );
  }

  if (error || !prospect) {
    return (
      <div className="flex flex-col h-full">
        <Header title="Error" subtitle="" />
        <div className="flex-1 flex items-center justify-center">
          <Card className="bg-red-500/10 border-red-500/30 p-6">
            <p className="text-red-400 mb-4">{error || 'Prospect not found'}</p>
            <Link href="/prospects">
              <Button variant="outline" className="border-red-500/30 text-red-400">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Prospects
              </Button>
            </Link>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <Header
        title={prospect.name}
        subtitle={`${prospect.city}${prospect.country ? `, ${prospect.country}` : ''}`}
      />

      <div className="flex-1 p-6 overflow-auto">
        <div className="mb-4">
          <Link href="/prospects" className="text-zinc-400 hover:text-white flex items-center gap-1 text-sm">
            <ArrowLeft className="h-4 w-4" />
            Back to Prospects
          </Link>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Overview Card */}
            <Card className="bg-zinc-900 border-zinc-800">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    <div className="h-16 w-16 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-2xl font-bold text-white">
                      {prospect.name.charAt(0)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-xl font-bold text-white">{prospect.name}</h2>
                        {getTierBadge(prospect.tier)}
                      </div>
                      <div className="flex items-center gap-4 mt-2 text-sm text-zinc-400">
                        <span className="flex items-center gap-1">
                          <MapPin className="h-4 w-4" />
                          {prospect.city}{prospect.country ? `, ${prospect.country}` : ''}
                        </span>
                        {prospect.google_rating && (
                          <span className="flex items-center gap-1">
                            <Star className="h-4 w-4 text-amber-400 fill-amber-400" />
                            {prospect.google_rating} ({prospect.google_review_count?.toLocaleString() || 0} reviews)
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-bold text-white">{prospect.score || 0}</div>
                    <div className="text-sm text-zinc-400">Lead Score</div>
                  </div>
                </div>

                <Separator className="my-6 bg-zinc-800" />

                <div className="flex items-center gap-4 mb-4">
                  <div className="flex-1">
                    <p className="text-sm text-zinc-500 mb-1">Pipeline Stage</p>
                    <Select value={prospect.stage} onValueChange={handleStageChange}>
                      <SelectTrigger className="bg-zinc-800 border-zinc-700">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-zinc-900 border-zinc-800">
                        {STAGES.map((stage) => (
                          <SelectItem key={stage.value} value={stage.value}>
                            {stage.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {!prospect.google_place_id && (
                    <Button
                      variant="outline"
                      className="border-zinc-700"
                      onClick={handleEnrich}
                      disabled={isEnriching}
                    >
                      {isEnriching ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4 mr-2" />
                      )}
                      Enrich Data
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-zinc-500">Property Type</p>
                    <p className="text-white capitalize">{prospect.property_type || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-zinc-500">Star Rating</p>
                    <p className="text-white">{prospect.star_rating ? `${prospect.star_rating} Stars` : '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-zinc-500">Rooms</p>
                    <p className="text-white">{prospect.estimated_rooms || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-zinc-500">Chain</p>
                    <p className="text-white">{prospect.chain_affiliation || 'Independent'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Tabs */}
            <Tabs defaultValue="emails" className="space-y-4">
              <TabsList className="bg-zinc-900 border border-zinc-800">
                <TabsTrigger value="emails">Emails ({emails.length})</TabsTrigger>
                <TabsTrigger value="activity">Activity ({activities.length})</TabsTrigger>
                <TabsTrigger value="notes">Notes</TabsTrigger>
              </TabsList>

              <TabsContent value="emails" className="space-y-4">
                <Card className="bg-zinc-900 border-zinc-800">
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-white">Email Outreach</CardTitle>
                    <Button
                      onClick={handleGenerateEmail}
                      disabled={isGenerating}
                      className="bg-amber-600 hover:bg-amber-700"
                    >
                      {isGenerating ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Sparkles className="h-4 w-4 mr-2" />
                      )}
                      {isGenerating ? 'Generating...' : 'Generate Email'}
                    </Button>
                  </CardHeader>
                  <CardContent>
                    {generatedEmail && (
                      <div className="mb-4 p-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-medium text-amber-400">Generated Email</h4>
                          <Button size="sm" variant="ghost" onClick={handleCopyEmail} className="text-amber-400">
                            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                          </Button>
                        </div>
                        <p className="text-sm font-medium text-white mb-2">Subject: {generatedEmail.subject}</p>
                        <pre className="text-sm text-zinc-300 whitespace-pre-wrap font-sans">{generatedEmail.body}</pre>
                      </div>
                    )}

                    {emails.length > 0 ? (
                      <div className="space-y-4">
                        {emails.map((email) => (
                          <div key={email.id} className="p-4 rounded-lg bg-zinc-800 border border-zinc-700">
                            <div className="flex items-center justify-between mb-2">
                              <h4 className="font-medium text-white">{email.subject}</h4>
                              <Badge className={
                                email.status === 'sent' ? 'bg-emerald-500/20 text-emerald-400' :
                                email.status === 'opened' ? 'bg-blue-500/20 text-blue-400' :
                                'bg-zinc-700 text-zinc-300'
                              }>
                                {email.status.charAt(0).toUpperCase() + email.status.slice(1)}
                              </Badge>
                            </div>
                            <p className="text-sm text-zinc-400 line-clamp-2">{email.body}</p>
                            <p className="text-xs text-zinc-500 mt-2">
                              {new Date(email.created_at).toLocaleDateString()}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-zinc-500">
                        <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>No emails yet. Generate one to get started!</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="activity">
                <Card className="bg-zinc-900 border-zinc-800">
                  <CardHeader>
                    <CardTitle className="text-white">Activity Timeline</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {activities.length > 0 ? (
                      <div className="space-y-4">
                        {activities.map((activity) => (
                          <div key={activity.id} className="flex items-start gap-3">
                            <div className="h-2 w-2 mt-2 rounded-full bg-amber-500" />
                            <div className="flex-1">
                              <p className="text-sm text-white">{activity.title}</p>
                              {activity.description && (
                                <p className="text-xs text-zinc-400">{activity.description}</p>
                              )}
                              <p className="text-xs text-zinc-500">{formatTimeAgo(activity.created_at)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-zinc-500">
                        <p>No activity yet</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="notes">
                <Card className="bg-zinc-900 border-zinc-800">
                  <CardHeader>
                    <CardTitle className="text-white">Notes</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Textarea
                      placeholder="Add notes about this prospect..."
                      className="bg-zinc-800 border-zinc-700 min-h-[150px]"
                      value={noteContent}
                      onChange={(e) => setNoteContent(e.target.value)}
                    />
                    <Button
                      onClick={handleSaveNote}
                      disabled={isSavingNote}
                      className="bg-amber-600 hover:bg-amber-700"
                    >
                      {isSavingNote ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                      Save Note
                    </Button>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <NextActionCard
              stage={prospect.stage}
              hasEmail={!!prospect.email}
              hasContact={!!prospect.contact_name}
              emailsSent={emails.length}
              hasGooglePlaceId={!!prospect.google_place_id}
              isGenerating={isGenerating}
              isEnriching={isEnriching}
              onGenerateEmail={handleGenerateEmail}
              onEnrich={handleEnrich}
            />

            {prospect.source_job_title && (
              <HiringSignalCard
                jobTitle={prospect.source_job_title}
                sourceUrl={prospect.source_url || undefined}
              />
            )}

            <PainSignalsCard painSignals={painSignals} />

            <ContactInfoCard prospect={prospect} />

            <ScoreBreakdownCard
              scoreBreakdown={prospect.score_breakdown || {}}
              totalScore={prospect.score || 0}
            />

            <SourceInfoCard prospect={prospect} />
          </div>
        </div>
      </div>
    </div>
  );
}
