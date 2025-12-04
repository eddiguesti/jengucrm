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
  Archive,
  Bell,
  MessageSquare,
  Send,
  Inbox,
  Calendar,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import type { Prospect, Email, Activity as BaseActivity, ProspectStage, PainSignal, EmailThread } from '@/types';

// Extended Activity type with linked email
interface Activity extends BaseActivity {
  linked_email?: Email;
}
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

function groupEmailsIntoThreads(emails: Email[]): EmailThread[] {
  const threadMap = new Map<string, Email[]>();

  // Group by thread_id or create individual threads
  emails.forEach(email => {
    const threadKey = email.thread_id || email.id;
    if (!threadMap.has(threadKey)) {
      threadMap.set(threadKey, []);
    }
    threadMap.get(threadKey)!.push(email);
  });

  // Convert to threads and sort by last activity
  const threads: EmailThread[] = Array.from(threadMap.entries()).map(([threadId, threadEmails]) => {
    // Sort emails in thread by date (oldest first)
    threadEmails.sort((a, b) =>
      new Date(a.sent_at || a.created_at).getTime() - new Date(b.sent_at || b.created_at).getTime()
    );

    const lastEmail = threadEmails[threadEmails.length - 1];
    const hasReply = threadEmails.some(e => e.direction === 'inbound');
    const hasMeetingRequest = threadEmails.some(e => e.email_type === 'meeting_request');

    return {
      thread_id: threadId,
      emails: threadEmails,
      lastActivity: lastEmail.sent_at || lastEmail.created_at,
      hasReply,
      hasMeetingRequest,
    };
  });

  // Sort threads by last activity (newest first)
  threads.sort((a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime());

  return threads;
}

function getEmailTypeLabel(type: string | null): { label: string; className: string } {
  switch (type) {
    case 'meeting_request':
      return { label: 'Meeting Request', className: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' };
    case 'positive_reply':
      return { label: 'Positive', className: 'bg-blue-500/20 text-blue-400 border-blue-500/30' };
    case 'not_interested':
      return { label: 'Not Interested', className: 'bg-red-500/20 text-red-400 border-red-500/30' };
    case 'mystery_shopper':
      return { label: 'Mystery Shopper', className: 'bg-purple-500/20 text-purple-400 border-purple-500/30' };
    case 'outreach':
      return { label: 'Outreach', className: 'bg-amber-500/20 text-amber-400 border-amber-500/30' };
    case 'follow_up':
      return { label: 'Follow Up', className: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30' };
    default:
      return { label: 'Email', className: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30' };
  }
}

function getArchiveReasonLabel(reason: string | null): string {
  switch (reason) {
    case 'not_interested': return 'Not Interested';
    case 'competitor': return 'Using Competitor';
    case 'budget': return 'Budget Issues';
    case 'timing': return 'Bad Timing';
    case 'wrong_contact': return 'Wrong Contact';
    default: return reason || 'Archived';
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

      <div className="flex-1 p-4 md:p-6 overflow-auto">
        <div className="mb-3 md:mb-4">
          <Link href="/prospects" className="text-zinc-400 hover:text-white flex items-center gap-1 text-xs md:text-sm">
            <ArrowLeft className="h-3 w-3 md:h-4 md:w-4" />
            Back to Prospects
          </Link>
        </div>

        {/* Archived Banner */}
        {prospect.archived && (
          <div className="mb-4 md:mb-6 p-3 md:p-4 rounded-lg bg-red-500/10 border border-red-500/30 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-3 flex-1">
              <div className="p-2 rounded-full bg-red-500/20">
                <Archive className="h-4 w-4 md:h-5 md:w-5 text-red-400" />
              </div>
              <div>
                <p className="text-red-400 font-medium text-sm md:text-base">This prospect has been archived</p>
                <p className="text-xs md:text-sm text-zinc-400">
                  Reason: {getArchiveReasonLabel(prospect.archive_reason)}
                  {prospect.archived_at && (
                    <span className="ml-2">
                      ({new Date(prospect.archived_at).toLocaleDateString()})
                    </span>
                  )}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs w-full sm:w-auto"
              onClick={async () => {
                try {
                  const response = await fetch(`/api/prospects/${id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ archived: false, archive_reason: null }),
                  });
                  if (response.ok) fetchProspect();
                } catch {}
              }}
            >
              <XCircle className="h-3 w-3 md:h-4 md:w-4 mr-1" />
              Unarchive
            </Button>
          </div>
        )}

        <div className="grid gap-4 md:gap-6 lg:grid-cols-3">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-4 md:space-y-6">
            {/* Overview Card */}
            <Card className="bg-zinc-900 border-zinc-800">
              <CardContent className="p-4 md:p-6">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="flex items-center gap-3 md:gap-4">
                    <div className="h-12 w-12 md:h-16 md:w-16 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-xl md:text-2xl font-bold text-white flex-shrink-0">
                      {prospect.name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base md:text-xl font-bold text-white truncate">{prospect.name}</h2>
                        {getTierBadge(prospect.tier)}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 md:gap-4 mt-1 md:mt-2 text-xs md:text-sm text-zinc-400">
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3 md:h-4 md:w-4" />
                          {prospect.city}{prospect.country ? `, ${prospect.country}` : ''}
                        </span>
                        {prospect.google_rating && (
                          <span className="flex items-center gap-1">
                            <Star className="h-3 w-3 md:h-4 md:w-4 text-amber-400 fill-amber-400" />
                            {prospect.google_rating} <span className="hidden sm:inline">({prospect.google_review_count?.toLocaleString() || 0} reviews)</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-left sm:text-right flex-shrink-0">
                    <div className="text-2xl md:text-3xl font-bold text-white">{prospect.score || 0}</div>
                    <div className="text-xs md:text-sm text-zinc-400">Lead Score</div>
                  </div>
                </div>

                <Separator className="my-4 md:my-6 bg-zinc-800" />

                <div className="flex flex-col sm:flex-row sm:items-center gap-3 md:gap-4 mb-4">
                  <div className="flex-1">
                    <p className="text-xs md:text-sm text-zinc-500 mb-1">Pipeline Stage</p>
                    <Select value={prospect.stage} onValueChange={handleStageChange}>
                      <SelectTrigger className="bg-zinc-800 border-zinc-700 text-sm">
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
                      className="border-zinc-700 text-xs md:text-sm w-full sm:w-auto"
                      onClick={handleEnrich}
                      disabled={isEnriching}
                    >
                      {isEnriching ? (
                        <Loader2 className="h-3 w-3 md:h-4 md:w-4 mr-2 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3 w-3 md:h-4 md:w-4 mr-2" />
                      )}
                      Enrich Data
                    </Button>
                  )}
                  {!prospect.archived && (
                    <Button
                      variant="outline"
                      className="border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs md:text-sm w-full sm:w-auto"
                      onClick={async () => {
                        try {
                          const response = await fetch(`/api/prospects/${id}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ archived: true, archive_reason: 'manual' }),
                          });
                          if (response.ok) fetchProspect();
                        } catch {}
                      }}
                    >
                      <Archive className="h-3 w-3 md:h-4 md:w-4 mr-2" />
                      Archive
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
                  <div>
                    <p className="text-xs md:text-sm text-zinc-500">Property Type</p>
                    <p className="text-white text-sm md:text-base capitalize">{prospect.property_type || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs md:text-sm text-zinc-500">Star Rating</p>
                    <p className="text-white text-sm md:text-base">{prospect.star_rating ? `${prospect.star_rating} Stars` : '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs md:text-sm text-zinc-500">Rooms</p>
                    <p className="text-white text-sm md:text-base">{prospect.estimated_rooms || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs md:text-sm text-zinc-500">Chain</p>
                    <p className="text-white text-sm md:text-base">{prospect.chain_affiliation || 'Independent'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Tabs */}
            <Tabs defaultValue="emails" className="space-y-3 md:space-y-4">
              <TabsList className="bg-zinc-900 border border-zinc-800 w-full sm:w-auto flex-wrap">
                <TabsTrigger value="emails" className="text-xs md:text-sm flex-1 sm:flex-none">Emails ({emails.length})</TabsTrigger>
                <TabsTrigger value="activity" className="text-xs md:text-sm flex-1 sm:flex-none">Activity ({activities.length})</TabsTrigger>
                <TabsTrigger value="research" className="text-xs md:text-sm flex-1 sm:flex-none">Research</TabsTrigger>
                <TabsTrigger value="notes" className="text-xs md:text-sm flex-1 sm:flex-none">Notes</TabsTrigger>
              </TabsList>

              <TabsContent value="emails" className="space-y-3 md:space-y-4">
                <Card className="bg-zinc-900 border-zinc-800">
                  <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 md:p-6">
                    <CardTitle className="text-white flex items-center gap-2 text-sm md:text-base">
                      <MessageSquare className="h-4 w-4 md:h-5 md:w-5" />
                      Email Conversations
                    </CardTitle>
                    <Button
                      onClick={handleGenerateEmail}
                      disabled={isGenerating}
                      className="bg-amber-600 hover:bg-amber-700 text-xs md:text-sm w-full sm:w-auto"
                    >
                      {isGenerating ? (
                        <Loader2 className="h-3 w-3 md:h-4 md:w-4 mr-2 animate-spin" />
                      ) : (
                        <Sparkles className="h-3 w-3 md:h-4 md:w-4 mr-2" />
                      )}
                      {isGenerating ? 'Generating...' : 'Generate Email'}
                    </Button>
                  </CardHeader>
                  <CardContent className="p-4 md:p-6 pt-0 md:pt-0">
                    {generatedEmail && (
                      <div className="mb-3 md:mb-4 p-3 md:p-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-medium text-amber-400 text-sm md:text-base">Generated Email</h4>
                          <Button size="sm" variant="ghost" onClick={handleCopyEmail} className="text-amber-400">
                            {copied ? <Check className="h-3 w-3 md:h-4 md:w-4" /> : <Copy className="h-3 w-3 md:h-4 md:w-4" />}
                          </Button>
                        </div>
                        <p className="text-xs md:text-sm font-medium text-white mb-2">Subject: {generatedEmail.subject}</p>
                        <pre className="text-xs md:text-sm text-zinc-300 whitespace-pre-wrap font-sans">{generatedEmail.body}</pre>
                      </div>
                    )}

                    {emails.length > 0 ? (
                      <div className="space-y-4 md:space-y-6">
                        {groupEmailsIntoThreads(emails).map((thread) => (
                          <div key={thread.thread_id} className="rounded-lg border border-zinc-700 overflow-hidden">
                            {/* Thread Header */}
                            <div className="bg-zinc-800/50 px-3 md:px-4 py-2 md:py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-700">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs md:text-sm font-medium text-white truncate">
                                  {thread.emails[0].subject}
                                </span>
                                {thread.hasReply && (
                                  <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px] md:text-xs">
                                    <Inbox className="h-2.5 w-2.5 md:h-3 md:w-3 mr-1" />
                                    Reply
                                  </Badge>
                                )}
                                {thread.hasMeetingRequest && (
                                  <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-[10px] md:text-xs">
                                    <Calendar className="h-2.5 w-2.5 md:h-3 md:w-3 mr-1" />
                                    Meeting
                                  </Badge>
                                )}
                              </div>
                              <span className="text-[10px] md:text-xs text-zinc-500">
                                {thread.emails.length} message{thread.emails.length !== 1 ? 's' : ''}
                              </span>
                            </div>

                            {/* Thread Messages */}
                            <div className="divide-y divide-zinc-800">
                              {thread.emails.map((email, idx) => {
                                const isInbound = email.direction === 'inbound';
                                const typeLabel = getEmailTypeLabel(email.email_type);

                                return (
                                  <div
                                    key={email.id}
                                    className={`p-3 md:p-4 ${isInbound ? 'bg-zinc-800/30' : 'bg-zinc-900'}`}
                                  >
                                    <div className="flex items-start gap-2 md:gap-3">
                                      {/* Direction Icon */}
                                      <div className={`mt-1 p-1 md:p-1.5 rounded-full ${isInbound ? 'bg-emerald-500/20' : 'bg-amber-500/20'}`}>
                                        {isInbound ? (
                                          <Inbox className="h-2.5 w-2.5 md:h-3 md:w-3 text-emerald-400" />
                                        ) : (
                                          <Send className="h-2.5 w-2.5 md:h-3 md:w-3 text-amber-400" />
                                        )}
                                      </div>

                                      <div className="flex-1 min-w-0">
                                        {/* Email Header */}
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 md:gap-2 mb-2">
                                          <div className="flex items-center gap-1 md:gap-2 text-xs md:text-sm min-w-0">
                                            <span className={`flex-shrink-0 ${isInbound ? 'text-emerald-400 font-medium' : 'text-amber-400 font-medium'}`}>
                                              {isInbound ? 'From:' : 'To:'}
                                            </span>
                                            <span className="text-zinc-300 truncate">
                                              {isInbound ? email.from_email : email.to_email}
                                            </span>
                                          </div>
                                          <div className="flex items-center gap-2 flex-shrink-0">
                                            <Badge className={`${typeLabel.className} text-[10px] md:text-xs`}>
                                              {typeLabel.label}
                                            </Badge>
                                            <span className="text-[10px] md:text-xs text-zinc-500 hidden sm:inline">
                                              {new Date(email.sent_at || email.created_at).toLocaleString()}
                                            </span>
                                          </div>
                                        </div>

                                        {/* Show subject only if different from thread subject */}
                                        {idx > 0 && email.subject !== thread.emails[0].subject && (
                                          <p className="text-xs md:text-sm text-zinc-400 mb-2">
                                            Re: {email.subject}
                                          </p>
                                        )}

                                        {/* Email Body */}
                                        <div className="text-xs md:text-sm text-zinc-300 whitespace-pre-wrap">
                                          {email.body}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-6 md:py-8 text-zinc-500">
                        <Mail className="h-10 w-10 md:h-12 md:w-12 mx-auto mb-4 opacity-50" />
                        <p className="text-sm md:text-base">No emails yet. Generate one to get started!</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="activity">
                <Card className="bg-zinc-900 border-zinc-800">
                  <CardHeader className="p-4 md:p-6">
                    <CardTitle className="text-white text-sm md:text-base">Activity Timeline</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 md:p-6 pt-0 md:pt-0">
                    {activities.length > 0 ? (
                      <div className="space-y-4 md:space-y-6">
                        {activities.map((activity) => {
                          const isMysteryShopperActivity = activity.type === 'mystery_shopper' ||
                            activity.title?.toLowerCase().includes('mystery shopper');
                          const isEmailActivity = activity.type === 'email_sent' ||
                            activity.title?.toLowerCase().includes('email') ||
                            activity.title?.toLowerCase().includes('outreach');
                          const hasLinkedEmail = activity.linked_email;

                          // Find email in emails array by matching activity title/time if no linked_email
                          const matchingEmail = !hasLinkedEmail && isEmailActivity
                            ? emails.find(e =>
                                Math.abs(new Date(e.sent_at || e.created_at).getTime() - new Date(activity.created_at).getTime()) < 60000
                              )
                            : null;

                          const emailToShow = hasLinkedEmail ? activity.linked_email : matchingEmail;

                          // Determine activity color
                          const dotColor = isMysteryShopperActivity ? 'bg-purple-500' :
                            isEmailActivity ? 'bg-amber-500' :
                            activity.type === 'stage_change' ? 'bg-blue-500' :
                            'bg-zinc-500';

                          // Determine badge
                          const badgeConfig = isMysteryShopperActivity
                            ? { label: 'Mystery Shopper', className: 'bg-purple-500/20 text-purple-400 border-purple-500/30' }
                            : isEmailActivity
                            ? { label: 'Email', className: 'bg-amber-500/20 text-amber-400 border-amber-500/30' }
                            : null;

                          return (
                            <div key={activity.id} className="border-l-2 border-zinc-700 pl-4">
                              {/* Activity Header */}
                              <div className="flex items-start gap-2 mb-2">
                                <div className={`h-3 w-3 mt-0.5 rounded-full flex-shrink-0 -ml-[22px] ${dotColor}`} />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className="text-sm text-white font-medium">{activity.title}</p>
                                    {badgeConfig && (
                                      <Badge className={`${badgeConfig.className} text-[10px]`}>
                                        {badgeConfig.label}
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="text-[10px] text-zinc-500">
                                    {new Date(activity.created_at).toLocaleString()}
                                  </p>
                                </div>
                              </div>

                              {/* Brief Description (if no email to show) */}
                              {activity.description && !emailToShow && (
                                <p className="text-xs text-zinc-400 whitespace-pre-wrap mb-2 ml-2">
                                  {activity.description}
                                </p>
                              )}

                              {/* Full Email Content */}
                              {emailToShow && (
                                <div className="mt-3 rounded-lg border border-zinc-700 overflow-hidden">
                                  {/* Email Header */}
                                  <div className={`px-3 py-2 border-b border-zinc-700 ${
                                    isMysteryShopperActivity ? 'bg-purple-500/10' :
                                    emailToShow.direction === 'inbound' ? 'bg-emerald-500/10' :
                                    'bg-amber-500/10'
                                  }`}>
                                    <div className="flex items-center gap-2 mb-2">
                                      {emailToShow.direction === 'inbound' ? (
                                        <Badge className="bg-emerald-500/20 text-emerald-400 text-[10px]">
                                          <Inbox className="h-3 w-3 mr-1" /> Received
                                        </Badge>
                                      ) : (
                                        <Badge className={`text-[10px] ${
                                          isMysteryShopperActivity
                                            ? 'bg-purple-500/20 text-purple-400'
                                            : 'bg-amber-500/20 text-amber-400'
                                        }`}>
                                          <Send className="h-3 w-3 mr-1" /> Sent
                                        </Badge>
                                      )}
                                      {emailToShow.email_type && (
                                        <Badge className="bg-zinc-500/20 text-zinc-400 text-[10px]">
                                          {emailToShow.email_type.replace(/_/g, ' ')}
                                        </Badge>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2 text-xs mb-1">
                                      <span className="text-zinc-500">From:</span>
                                      <span className="text-zinc-300">{emailToShow.from_email || 'N/A'}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-xs mb-1">
                                      <span className="text-zinc-500">To:</span>
                                      <span className="text-zinc-300">{emailToShow.to_email || 'N/A'}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-xs">
                                      <span className="text-zinc-500">Subject:</span>
                                      <span className="text-white font-medium">{emailToShow.subject}</span>
                                    </div>
                                    {emailToShow.sent_at && (
                                      <div className="flex items-center gap-2 text-xs mt-1">
                                        <span className="text-zinc-500">Date:</span>
                                        <span className="text-zinc-400">
                                          {new Date(emailToShow.sent_at).toLocaleString()}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                  {/* Email Body */}
                                  <div className="p-3 bg-zinc-900 max-h-64 overflow-auto">
                                    <pre className="text-xs text-zinc-300 whitespace-pre-wrap font-sans">
                                      {emailToShow.body}
                                    </pre>
                                  </div>
                                </div>
                              )}

                              {/* Link to view in Emails tab if email found but description also exists */}
                              {emailToShow && activity.description && (
                                <p className="text-[10px] text-zinc-500 mt-2 ml-2">
                                  {activity.description}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-6 md:py-8 text-zinc-500">
                        <p className="text-sm">No activity yet</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="research" className="space-y-4">
                {/* AI Analysis */}
                {prospect.ai_analysis && (
                  <Card className="bg-zinc-900 border-zinc-800">
                    <CardHeader className="p-4 md:p-6">
                      <CardTitle className="text-white text-sm md:text-base flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-purple-400" />
                        AI Analysis
                        {prospect.ai_grade && (
                          <Badge className={
                            prospect.ai_grade === 'A' ? 'bg-emerald-500/20 text-emerald-400' :
                            prospect.ai_grade === 'B' ? 'bg-blue-500/20 text-blue-400' :
                            prospect.ai_grade === 'C' ? 'bg-amber-500/20 text-amber-400' :
                            'bg-red-500/20 text-red-400'
                          }>
                            Grade {prospect.ai_grade}
                          </Badge>
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 md:p-6 pt-0 md:pt-0">
                      <pre className="text-xs md:text-sm text-zinc-300 whitespace-pre-wrap bg-zinc-800/50 p-4 rounded-lg overflow-auto max-h-96">
                        {typeof prospect.ai_analysis === 'string'
                          ? prospect.ai_analysis
                          : JSON.stringify(prospect.ai_analysis, null, 2)}
                      </pre>
                    </CardContent>
                  </Card>
                )}

                {/* Job Pain Points */}
                {prospect.job_pain_points && (
                  <Card className="bg-zinc-900 border-zinc-800">
                    <CardHeader className="p-4 md:p-6">
                      <CardTitle className="text-white text-sm md:text-base flex items-center gap-2">
                        <Bell className="h-4 w-4 text-amber-400" />
                        Job Pain Points Analysis
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 md:p-6 pt-0 md:pt-0 space-y-4">
                      {prospect.job_pain_points.summary && (
                        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                          <p className="text-sm text-amber-200">{prospect.job_pain_points.summary}</p>
                        </div>
                      )}

                      {prospect.job_pain_points.pain_points && prospect.job_pain_points.pain_points.length > 0 && (
                        <div>
                          <p className="text-xs text-zinc-500 mb-2">Pain Points Identified</p>
                          <ul className="space-y-1">
                            {prospect.job_pain_points.pain_points.map((point, idx) => (
                              <li key={idx} className="text-sm text-zinc-300 flex items-start gap-2">
                                <span className="text-red-400">•</span> {point}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {prospect.job_pain_points.responsibilities && prospect.job_pain_points.responsibilities.length > 0 && (
                        <div>
                          <p className="text-xs text-zinc-500 mb-2">Key Responsibilities</p>
                          <ul className="space-y-1">
                            {prospect.job_pain_points.responsibilities.map((resp, idx) => (
                              <li key={idx} className="text-sm text-zinc-300 flex items-start gap-2">
                                <span className="text-blue-400">•</span> {resp}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {prospect.job_pain_points.communication_tasks && prospect.job_pain_points.communication_tasks.length > 0 && (
                        <div>
                          <p className="text-xs text-zinc-500 mb-2">Communication Tasks</p>
                          <ul className="space-y-1">
                            {prospect.job_pain_points.communication_tasks.map((task, idx) => (
                              <li key={idx} className="text-sm text-zinc-300 flex items-start gap-2">
                                <span className="text-emerald-400">•</span> {task}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Source Job Description */}
                {prospect.source_job_description && (
                  <Card className="bg-zinc-900 border-zinc-800">
                    <CardHeader className="p-4 md:p-6">
                      <CardTitle className="text-white text-sm md:text-base">
                        Original Job Posting
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 md:p-6 pt-0 md:pt-0">
                      <pre className="text-xs md:text-sm text-zinc-300 whitespace-pre-wrap bg-zinc-800/50 p-4 rounded-lg overflow-auto max-h-96">
                        {prospect.source_job_description}
                      </pre>
                    </CardContent>
                  </Card>
                )}

                {/* No Research Yet */}
                {!prospect.ai_analysis && !prospect.job_pain_points && !prospect.source_job_description && (
                  <Card className="bg-zinc-900 border-zinc-800">
                    <CardContent className="p-8 text-center">
                      <Sparkles className="h-12 w-12 mx-auto mb-4 text-zinc-600" />
                      <p className="text-zinc-500 mb-4">No research data available yet.</p>
                      <Button
                        onClick={handleEnrich}
                        disabled={isEnriching}
                        className="bg-purple-600 hover:bg-purple-700"
                      >
                        {isEnriching ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Sparkles className="h-4 w-4 mr-2" />
                        )}
                        Run AI Research
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="notes">
                <Card className="bg-zinc-900 border-zinc-800">
                  <CardHeader className="p-4 md:p-6">
                    <CardTitle className="text-white text-sm md:text-base">Notes</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 md:p-6 pt-0 md:pt-0 space-y-3 md:space-y-4">
                    <Textarea
                      placeholder="Add notes about this prospect..."
                      className="bg-zinc-800 border-zinc-700 min-h-[120px] md:min-h-[150px] text-sm"
                      value={noteContent}
                      onChange={(e) => setNoteContent(e.target.value)}
                    />
                    <Button
                      onClick={handleSaveNote}
                      disabled={isSavingNote}
                      className="bg-amber-600 hover:bg-amber-700 text-sm w-full sm:w-auto"
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
          <div className="space-y-4 md:space-y-6">
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
