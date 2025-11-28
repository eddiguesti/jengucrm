'use client';

import { useState, useEffect } from 'react';
import { Header } from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Send,
  Copy,
  CheckCircle,
  Mail,
  Sparkles,
  Loader2,
} from 'lucide-react';
import Link from 'next/link';

interface EmailWithProspect {
  id: string;
  prospect_id: string;
  subject: string;
  body: string;
  status: string;
  sent_at?: string;
  created_at: string;
  prospects?: {
    name: string;
    city: string;
    country?: string;
  };
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'draft':
      return <Badge className="bg-zinc-500/20 text-zinc-400 border-zinc-500/30">Draft</Badge>;
    case 'sent':
      return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Sent</Badge>;
    case 'opened':
      return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">Opened</Badge>;
    case 'replied':
      return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">Replied</Badge>;
    default:
      return <Badge className="bg-zinc-500/20 text-zinc-400 border-zinc-500/30">{status}</Badge>;
  }
}

export default function EmailsPage() {
  const [emails, setEmails] = useState<EmailWithProspect[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEmail, setSelectedEmail] = useState<EmailWithProspect | null>(null);
  const [copied, setCopied] = useState(false);
  const [marking, setMarking] = useState(false);

  const fetchEmails = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/emails');
      if (!response.ok) throw new Error('Failed to fetch');
      const data = await response.json();
      setEmails(data.emails || []);
      if (data.emails?.length > 0 && !selectedEmail) {
        setSelectedEmail(data.emails[0]);
      }
    } catch (error) {
      console.error('Failed to fetch emails:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmails();
  }, []);

  const draftEmails = emails.filter((e) => e.status === 'draft');
  const sentEmails = emails.filter((e) => e.status !== 'draft');

  const handleCopyEmail = () => {
    if (!selectedEmail) return;
    const emailText = `Subject: ${selectedEmail.subject}\n\n${selectedEmail.body}`;
    navigator.clipboard.writeText(emailText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleMarkSent = async () => {
    if (!selectedEmail) return;
    setMarking(true);
    try {
      const response = await fetch(`/api/emails/${selectedEmail.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'sent', sent_at: new Date().toISOString() }),
      });
      if (!response.ok) throw new Error('Failed to update');
      fetchEmails();
    } catch {
      alert('Failed to mark as sent');
    } finally {
      setMarking(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Emails"
        subtitle={`${emails.length} emails generated`}
        action={{
          label: 'Refresh',
          onClick: fetchEmails,
        }}
      />

      <div className="flex-1 p-6 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
          </div>
        ) : emails.length === 0 ? (
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-12 text-center">
              <Mail className="h-12 w-12 mx-auto mb-4 text-zinc-500" />
              <p className="text-zinc-400 mb-4">No emails generated yet</p>
              <p className="text-sm text-zinc-500 mb-6">
                Go to a prospect&apos;s page and click &quot;Generate Email&quot; to create personalized outreach emails.
              </p>
              <Link href="/prospects">
                <Button className="bg-amber-500 hover:bg-amber-600 text-black">
                  View Prospects
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 lg:grid-cols-5 h-full">
            {/* Email List */}
            <div className="lg:col-span-2">
              <Card className="bg-zinc-900 border-zinc-800 h-full">
                <CardHeader className="pb-3">
                  <Tabs defaultValue="drafts" className="w-full">
                    <TabsList className="bg-zinc-800 w-full">
                      <TabsTrigger value="drafts" className="flex-1">
                        Drafts ({draftEmails.length})
                      </TabsTrigger>
                      <TabsTrigger value="sent" className="flex-1">
                        Sent ({sentEmails.length})
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="drafts" className="mt-4">
                      <div className="space-y-2 max-h-[calc(100vh-300px)] overflow-auto">
                        {draftEmails.length === 0 ? (
                          <p className="text-sm text-zinc-500 text-center py-4">No draft emails</p>
                        ) : (
                          draftEmails.map((email) => (
                            <div
                              key={email.id}
                              onClick={() => setSelectedEmail(email)}
                              className={`p-3 rounded-lg cursor-pointer transition-colors ${
                                selectedEmail?.id === email.id
                                  ? 'bg-zinc-800 border border-amber-500/50'
                                  : 'bg-zinc-800/50 hover:bg-zinc-800 border border-transparent'
                              }`}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-medium text-white text-sm">
                                  {email.prospects?.name || 'Unknown'}
                                </span>
                                {getStatusBadge(email.status)}
                              </div>
                              <p className="text-sm text-zinc-400 truncate">{email.subject}</p>
                              <p className="text-xs text-zinc-500 mt-1">
                                {new Date(email.created_at).toLocaleDateString()}
                              </p>
                            </div>
                          ))
                        )}
                      </div>
                    </TabsContent>

                    <TabsContent value="sent" className="mt-4">
                      <div className="space-y-2 max-h-[calc(100vh-300px)] overflow-auto">
                        {sentEmails.length === 0 ? (
                          <p className="text-sm text-zinc-500 text-center py-4">No sent emails</p>
                        ) : (
                          sentEmails.map((email) => (
                            <div
                              key={email.id}
                              onClick={() => setSelectedEmail(email)}
                              className={`p-3 rounded-lg cursor-pointer transition-colors ${
                                selectedEmail?.id === email.id
                                  ? 'bg-zinc-800 border border-amber-500/50'
                                  : 'bg-zinc-800/50 hover:bg-zinc-800 border border-transparent'
                              }`}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-medium text-white text-sm">
                                  {email.prospects?.name || 'Unknown'}
                                </span>
                                {getStatusBadge(email.status)}
                              </div>
                              <p className="text-sm text-zinc-400 truncate">{email.subject}</p>
                              <p className="text-xs text-zinc-500 mt-1">
                                Sent {new Date(email.sent_at || email.created_at).toLocaleDateString()}
                              </p>
                            </div>
                          ))
                        )}
                      </div>
                    </TabsContent>
                  </Tabs>
                </CardHeader>
              </Card>
            </div>

            {/* Email Preview */}
            <div className="lg:col-span-3">
              {selectedEmail ? (
                <Card className="bg-zinc-900 border-zinc-800 h-full flex flex-col">
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <Link href={`/prospects/${selectedEmail.prospect_id}`}>
                        <CardTitle className="text-white hover:text-amber-400 transition-colors">
                          {selectedEmail.prospects?.name || 'Unknown'}
                        </CardTitle>
                      </Link>
                      <p className="text-sm text-zinc-400">
                        {selectedEmail.prospects?.city}
                        {selectedEmail.prospects?.country ? `, ${selectedEmail.prospects.country}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {selectedEmail.status === 'draft' && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-zinc-700"
                            onClick={handleCopyEmail}
                          >
                            {copied ? <CheckCircle className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                            {copied ? 'Copied!' : 'Copy'}
                          </Button>
                          <Button
                            size="sm"
                            className="bg-amber-600 hover:bg-amber-700"
                            onClick={handleMarkSent}
                            disabled={marking}
                          >
                            {marking ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Send className="h-4 w-4 mr-2" />
                            )}
                            Mark Sent
                          </Button>
                        </>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 space-y-4 overflow-auto">
                    <div className="p-4 rounded-lg bg-zinc-800 border border-zinc-700">
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-zinc-500 w-16">Subject:</span>
                          <span className="text-white font-medium">{selectedEmail.subject}</span>
                        </div>
                      </div>
                    </div>

                    <div className="p-4 rounded-lg bg-zinc-800 border border-zinc-700 flex-1">
                      <pre className="text-zinc-300 text-sm whitespace-pre-wrap font-sans">
                        {selectedEmail.body}
                      </pre>
                    </div>

                    {selectedEmail.status === 'draft' && (
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                        <Sparkles className="h-4 w-4 text-amber-500" />
                        <p className="text-sm text-amber-400">
                          AI-generated email. Review and personalize before sending.
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <Card className="bg-zinc-900 border-zinc-800 h-full flex items-center justify-center">
                  <p className="text-zinc-500">Select an email to preview</p>
                </Card>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
