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
  Globe,
  Mail,
  Phone,
  ExternalLink,
  Sparkles,
  Loader2,
  ArrowLeft,
  RefreshCw,
  Copy,
  Check,
  Briefcase,
  Calendar,
  Target,
  CheckCircle,
  AlertTriangle,
} from 'lucide-react';
import Link from 'next/link';
import type { Prospect, Email, Activity, ProspectStage, PainSignal } from '@/types';

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

function getNextAction(stage: string, hasEmail: boolean, hasContact: boolean, emailsSent: number): {
  action: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  icon: 'mail' | 'phone' | 'calendar' | 'target' | 'check';
} {
  switch (stage) {
    case 'new':
      if (!hasEmail && !hasContact) {
        return {
          action: 'Enrich Data',
          description: 'Get contact details via Google Places enrichment',
          priority: 'high',
          icon: 'target',
        };
      }
      return {
        action: 'Research Property',
        description: 'Review website, social media, and recent news',
        priority: 'medium',
        icon: 'target',
      };
    case 'researching':
      return {
        action: 'Generate Outreach Email',
        description: 'Create personalized email based on hiring signal',
        priority: 'high',
        icon: 'mail',
      };
    case 'outreach':
      if (emailsSent === 0) {
        return {
          action: 'Send First Email',
          description: 'Generate and send initial outreach email',
          priority: 'high',
          icon: 'mail',
        };
      }
      return {
        action: 'Follow Up',
        description: 'Send follow-up email or try phone call',
        priority: 'medium',
        icon: 'phone',
      };
    case 'engaged':
      return {
        action: 'Schedule Meeting',
        description: 'Book a discovery call or demo',
        priority: 'high',
        icon: 'calendar',
      };
    case 'meeting':
      return {
        action: 'Prepare Proposal',
        description: 'Create customized proposal after meeting',
        priority: 'high',
        icon: 'target',
      };
    case 'proposal':
      return {
        action: 'Follow Up on Proposal',
        description: 'Check in on decision timeline',
        priority: 'high',
        icon: 'phone',
      };
    case 'won':
      return {
        action: 'Onboarding',
        description: 'Begin customer onboarding process',
        priority: 'medium',
        icon: 'check',
      };
    case 'lost':
      return {
        action: 'Nurture',
        description: 'Add to nurture sequence for future opportunities',
        priority: 'low',
        icon: 'mail',
      };
    default:
      return {
        action: 'Review',
        description: 'Review prospect details',
        priority: 'medium',
        icon: 'target',
      };
  }
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

      // Refresh to get the saved email
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

      // Refresh prospect data
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
      fetchProspect(); // Refresh to get new activity
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
                    {/* Newly Generated Email */}
                    {generatedEmail && (
                      <div className="mb-4 p-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-medium text-amber-400">Generated Email</h4>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={handleCopyEmail}
                            className="text-amber-400"
                          >
                            {copied ? (
                              <Check className="h-4 w-4" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                        <p className="text-sm font-medium text-white mb-2">Subject: {generatedEmail.subject}</p>
                        <pre className="text-sm text-zinc-300 whitespace-pre-wrap font-sans">{generatedEmail.body}</pre>
                      </div>
                    )}

                    {/* Existing Emails */}
                    {emails.length > 0 ? (
                      <div className="space-y-4">
                        {emails.map((email) => (
                          <div
                            key={email.id}
                            className="p-4 rounded-lg bg-zinc-800 border border-zinc-700"
                          >
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
                      {isSavingNote ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : null}
                      Save Note
                    </Button>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Next Action - Most Important for Sales Agents */}
            {(() => {
              const nextAction = getNextAction(
                prospect.stage,
                !!prospect.email,
                !!prospect.contact_name,
                emails.length
              );
              const ActionIcon = {
                mail: Mail,
                phone: Phone,
                calendar: Calendar,
                target: Target,
                check: CheckCircle,
              }[nextAction.icon];
              const priorityColors = {
                high: 'bg-red-500/20 border-red-500/50 text-red-400',
                medium: 'bg-amber-500/20 border-amber-500/50 text-amber-400',
                low: 'bg-zinc-500/20 border-zinc-500/50 text-zinc-400',
              };
              return (
                <Card className={`border-2 ${priorityColors[nextAction.priority].split(' ')[1]}`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-white text-base flex items-center gap-2">
                        <Target className="h-4 w-4 text-amber-500" />
                        Next Action
                      </CardTitle>
                      <Badge className={priorityColors[nextAction.priority]}>
                        {nextAction.priority.charAt(0).toUpperCase() + nextAction.priority.slice(1)} Priority
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-start gap-3">
                      <div className="h-10 w-10 rounded-lg bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                        <ActionIcon className="h-5 w-5 text-amber-500" />
                      </div>
                      <div>
                        <p className="font-medium text-white">{nextAction.action}</p>
                        <p className="text-sm text-zinc-400">{nextAction.description}</p>
                      </div>
                    </div>
                    {nextAction.icon === 'mail' && prospect.stage !== 'won' && prospect.stage !== 'lost' && (
                      <Button
                        onClick={handleGenerateEmail}
                        disabled={isGenerating}
                        className="w-full mt-4 bg-amber-600 hover:bg-amber-700"
                        size="sm"
                      >
                        {isGenerating ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Sparkles className="h-4 w-4 mr-2" />
                        )}
                        Generate Email Now
                      </Button>
                    )}
                    {nextAction.icon === 'target' && !prospect.google_place_id && (
                      <Button
                        onClick={handleEnrich}
                        disabled={isEnriching}
                        className="w-full mt-4 bg-amber-600 hover:bg-amber-700"
                        size="sm"
                      >
                        {isEnriching ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4 mr-2" />
                        )}
                        Enrich Now
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })()}

            {/* Hiring Signal - Job Description */}
            {prospect.source_job_title && (
              <Card className="bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border-emerald-500/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-white text-base flex items-center gap-2">
                    <Briefcase className="h-4 w-4 text-emerald-500" />
                    Hiring Signal
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="text-xs text-zinc-500 uppercase tracking-wide">Position</p>
                    <p className="text-white font-medium">{prospect.source_job_title}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                    <p className="text-sm text-emerald-300">
                      This property is actively hiring, indicating growth and potential need for your services.
                    </p>
                  </div>
                  {prospect.source_url && (
                    <a
                      href={prospect.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-emerald-400 hover:underline flex items-center gap-1"
                    >
                      View Job Posting <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Pain Signals - For Review Mining Leads */}
            {painSignals.length > 0 && (
              <Card className="bg-gradient-to-br from-red-500/10 to-orange-500/5 border-red-500/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-white text-base flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-500" />
                    Pain Signals ({painSignals.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                    <p className="text-sm text-red-300">
                      Guests are complaining about communication issues - they need help!
                    </p>
                  </div>
                  <div className="space-y-3 max-h-[300px] overflow-y-auto">
                    {painSignals.slice(0, 5).map((signal) => (
                      <div key={signal.id} className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700">
                        <div className="flex items-center justify-between mb-2">
                          <Badge className="bg-red-500/20 text-red-400 text-xs">
                            &quot;{signal.keyword_matched}&quot;
                          </Badge>
                          {signal.review_rating && (
                            <span className="flex items-center gap-1 text-xs">
                              <Star className="h-3 w-3 text-amber-400 fill-amber-400" />
                              {signal.review_rating}/5
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-zinc-300 line-clamp-3">
                          &quot;{signal.review_snippet}&quot;
                        </p>
                        <div className="flex items-center justify-between mt-2 text-xs text-zinc-500">
                          <span>{signal.reviewer_name || 'Anonymous'}</span>
                          {signal.review_date && (
                            <span>{new Date(signal.review_date).toLocaleDateString()}</span>
                          )}
                        </div>
                        {signal.review_url && (
                          <a
                            href={signal.review_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-amber-400 hover:underline flex items-center gap-1 mt-1"
                          >
                            View review <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                  {painSignals.length > 5 && (
                    <p className="text-xs text-zinc-500 text-center">
                      +{painSignals.length - 5} more pain signals
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Contact Info */}
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <CardTitle className="text-white text-base">Contact Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {prospect.contact_name && (
                  <div>
                    <p className="text-sm text-zinc-500">Contact</p>
                    <p className="text-white">{prospect.contact_name}</p>
                    {prospect.contact_title && (
                      <p className="text-sm text-zinc-400">{prospect.contact_title}</p>
                    )}
                  </div>
                )}

                {prospect.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-zinc-500" />
                    <a href={`mailto:${prospect.email}`} className="text-amber-400 hover:underline text-sm">
                      {prospect.email}
                    </a>
                  </div>
                )}

                {prospect.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-zinc-500" />
                    <span className="text-zinc-300 text-sm">{prospect.phone}</span>
                  </div>
                )}

                {prospect.website && (
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-zinc-500" />
                    <a
                      href={prospect.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-amber-400 hover:underline text-sm flex items-center gap-1"
                    >
                      Website <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}

                {prospect.full_address && (
                  <div className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-zinc-500 mt-0.5" />
                    <span className="text-zinc-300 text-sm">{prospect.full_address}</span>
                  </div>
                )}

                {!prospect.email && !prospect.phone && !prospect.website && !prospect.contact_name && (
                  <p className="text-zinc-500 text-sm">No contact information available. Try enriching the data.</p>
                )}
              </CardContent>
            </Card>

            {/* Score Breakdown */}
            {prospect.score_breakdown && Object.keys(prospect.score_breakdown).length > 0 && (
              <Card className="bg-zinc-900 border-zinc-800">
                <CardHeader>
                  <CardTitle className="text-white text-base">Score Breakdown</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {Object.entries(prospect.score_breakdown).map(([key, value]) => (
                      <div key={key} className="flex items-center justify-between text-sm">
                        <span className="text-zinc-400">
                          {key.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                        </span>
                        <span className="text-emerald-400">+{value as number}</span>
                      </div>
                    ))}
                    <Separator className="bg-zinc-800 my-2" />
                    <div className="flex items-center justify-between font-medium">
                      <span className="text-white">Total Score</span>
                      <span className="text-white">{prospect.score || 0}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Source Info */}
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader>
                <CardTitle className="text-white text-base">Source</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Found via</span>
                  <span className="text-white capitalize">{prospect.source || 'unknown'}</span>
                </div>
                {prospect.source_job_title && (
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400">Job posting</span>
                    <span className="text-white">{prospect.source_job_title}</span>
                  </div>
                )}
                {prospect.source_url && (
                  <a
                    href={prospect.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-amber-400 hover:underline flex items-center gap-1"
                  >
                    View source <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Added</span>
                  <span className="text-white">
                    {prospect.created_at ? new Date(prospect.created_at).toLocaleDateString() : '-'}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
