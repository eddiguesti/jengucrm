'use client';

import { useState, useEffect, useCallback } from 'react';
import { Header } from '@/components/layout/header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Send,
  Loader2,
  Mail,
  MessageSquare,
  UserCheck,
  Clock,
  RefreshCw,
  ExternalLink,
  ChevronRight,
} from 'lucide-react';
import Link from 'next/link';
import { ResponseTimeCard } from '@/components/mystery-shopper/response-time-card';
import { flags } from '@/lib/feature-flags';

interface MysteryInquiry {
  id: string;
  prospect_id: string;
  prospect_name: string;
  prospect_email: string;
  sent_at: string;
  template: string;
  from_email: string;
  from_name: string;
  status: 'sent' | 'replied' | 'gm_extracted';
  reply_received_at?: string;
  reply_body?: string;
  extracted_gm_name?: string;
  extracted_gm_email?: string;
}

interface MysteryStats {
  total_sent: number;
  awaiting_reply: number;
  replied: number;
  gm_extracted: number;
}

interface ResponseTimeData {
  avgMinutes: number;
  fastest: number;
  slowest: number;
  totalReplies: number;
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'sent':
      return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">Sent</Badge>;
    case 'replied':
      return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">Replied</Badge>;
    case 'gm_extracted':
      return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">GM Found</Badge>;
    default:
      return <Badge className="bg-zinc-500/20 text-zinc-400 border-zinc-500/30">{status}</Badge>;
  }
}

export default function MysteryShopperPage() {
  const [inquiries, setInquiries] = useState<MysteryInquiry[]>([]);
  const [stats, setStats] = useState<MysteryStats>({ total_sent: 0, awaiting_reply: 0, replied: 0, gm_extracted: 0 });
  const [responseTime, setResponseTime] = useState<ResponseTimeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedInquiry, setSelectedInquiry] = useState<MysteryInquiry | null>(null);
  const [sendingBatch, setSendingBatch] = useState(false);
  const [checkingReplies, setCheckingReplies] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [mysteryRes, statsRes] = await Promise.all([
        fetch('/api/mystery-shopper'),
        flags.SHOW_RESPONSE_TIMES ? fetch('/api/stats') : Promise.resolve(null),
      ]);

      if (mysteryRes.ok) {
        const data = await mysteryRes.json();
        setInquiries(data.inquiries || []);
        setStats(data.stats || { total_sent: 0, awaiting_reply: 0, replied: 0, gm_extracted: 0 });
        if (data.inquiries?.length > 0 && !selectedInquiry) {
          setSelectedInquiry(data.inquiries[0]);
        }
      }

      if (statsRes?.ok) {
        const statsData = await statsRes.json();
        const rtData = statsData.data?.responseTime || statsData.responseTime;
        if (rtData) {
          setResponseTime(rtData);
        }
      }
    } catch (error) {
      console.error('Failed to fetch mystery shopper data:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedInquiry]);

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSendBatch = async () => {
    setSendingBatch(true);
    try {
      const response = await fetch('/api/mystery-inquiry', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 5 }),
      });
      const result = await response.json();
      alert(`Sent ${result.sent || 0} mystery inquiries`);
      fetchData();
    } catch (error) {
      console.error('Failed to send batch:', error);
      alert('Failed to send batch');
    } finally {
      setSendingBatch(false);
    }
  };

  const handleCheckReplies = async () => {
    setCheckingReplies(true);
    try {
      const response = await fetch('/api/check-replies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ check_gmail: true }),
      });
      const result = await response.json();
      alert(`Found ${result.gmail_replies || 0} Gmail replies`);
      fetchData();
    } catch (error) {
      console.error('Failed to check replies:', error);
      alert('Failed to check replies');
    } finally {
      setCheckingReplies(false);
    }
  };

  const sentInquiries = inquiries.filter((i) => i.status === 'sent');
  const repliedInquiries = inquiries.filter((i) => i.status === 'replied' || i.status === 'gm_extracted');

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Mystery Shopper"
        subtitle="Find GM contacts via inquiry emails"
        action={{
          label: 'Refresh',
          onClick: fetchData,
        }}
      />

      <div className="flex-1 p-4 md:p-6 overflow-auto">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/20">
                  <Send className="h-4 w-4 text-blue-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{stats.total_sent}</p>
                  <p className="text-xs text-zinc-400">Total Sent</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-500/20">
                  <Clock className="h-4 w-4 text-amber-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{stats.awaiting_reply}</p>
                  <p className="text-xs text-zinc-400">Awaiting Reply</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-500/20">
                  <MessageSquare className="h-4 w-4 text-purple-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{stats.replied}</p>
                  <p className="text-xs text-zinc-400">Replied</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-500/20">
                  <UserCheck className="h-4 w-4 text-emerald-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{stats.gm_extracted}</p>
                  <p className="text-xs text-zinc-400">GM Found</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Response Time Analytics */}
        {flags.SHOW_RESPONSE_TIMES && responseTime && (
          <div className="mb-6">
            <ResponseTimeCard responseTime={responseTime} />
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-3 mb-6">
          <Button
            onClick={handleSendBatch}
            disabled={sendingBatch}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {sendingBatch ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Send Batch (5)
          </Button>
          <Button
            onClick={handleCheckReplies}
            disabled={checkingReplies}
            variant="outline"
            className="border-zinc-700"
          >
            {checkingReplies ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Check for Replies
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
          </div>
        ) : inquiries.length === 0 ? (
          <Card className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-6 md:p-12 text-center">
              <Mail className="h-10 w-10 md:h-12 md:w-12 mx-auto mb-4 text-zinc-500" />
              <p className="text-zinc-400 mb-4 text-sm md:text-base">No mystery shopper inquiries sent yet</p>
              <p className="text-xs md:text-sm text-zinc-500 mb-6">
                Click &quot;Send Batch&quot; to send mystery inquiries to prospects with generic emails (info@, reservations@, etc.)
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col lg:grid lg:grid-cols-5 gap-4 md:gap-6">
            {/* Inquiry List */}
            <div className="lg:col-span-2">
              <Card className="bg-zinc-900 border-zinc-800">
                <CardHeader className="pb-3 p-3 md:p-6 md:pb-3">
                  <Tabs defaultValue="sent" className="w-full">
                    <TabsList className="bg-zinc-800 w-full">
                      <TabsTrigger value="sent" className="flex-1 text-xs md:text-sm">
                        Sent ({sentInquiries.length})
                      </TabsTrigger>
                      <TabsTrigger value="replied" className="flex-1 text-xs md:text-sm">
                        Replied ({repliedInquiries.length})
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="sent" className="mt-3 md:mt-4">
                      <div className="space-y-2 max-h-64 lg:max-h-[calc(100vh-450px)] overflow-auto">
                        {sentInquiries.length === 0 ? (
                          <p className="text-xs md:text-sm text-zinc-500 text-center py-4">No pending inquiries</p>
                        ) : (
                          sentInquiries.map((inquiry) => (
                            <div
                              key={inquiry.id}
                              onClick={() => setSelectedInquiry(inquiry)}
                              className={`p-2 md:p-3 rounded-lg cursor-pointer transition-colors ${
                                selectedInquiry?.id === inquiry.id
                                  ? 'bg-zinc-800 border border-blue-500/50'
                                  : 'bg-zinc-800/50 hover:bg-zinc-800 border border-transparent'
                              }`}
                            >
                              <div className="flex items-center justify-between mb-1 gap-2">
                                <span className="font-medium text-white text-xs md:text-sm truncate">
                                  {inquiry.prospect_name}
                                </span>
                                {getStatusBadge(inquiry.status)}
                              </div>
                              <p className="text-xs md:text-sm text-zinc-400 truncate">{inquiry.template}</p>
                              <p className="text-[10px] md:text-xs text-zinc-500 mt-1">
                                Sent {new Date(inquiry.sent_at).toLocaleDateString()} via {inquiry.from_name}
                              </p>
                            </div>
                          ))
                        )}
                      </div>
                    </TabsContent>

                    <TabsContent value="replied" className="mt-3 md:mt-4">
                      <div className="space-y-2 max-h-64 lg:max-h-[calc(100vh-450px)] overflow-auto">
                        {repliedInquiries.length === 0 ? (
                          <p className="text-xs md:text-sm text-zinc-500 text-center py-4">No replies yet</p>
                        ) : (
                          repliedInquiries.map((inquiry) => (
                            <div
                              key={inquiry.id}
                              onClick={() => setSelectedInquiry(inquiry)}
                              className={`p-2 md:p-3 rounded-lg cursor-pointer transition-colors ${
                                selectedInquiry?.id === inquiry.id
                                  ? 'bg-zinc-800 border border-emerald-500/50'
                                  : 'bg-zinc-800/50 hover:bg-zinc-800 border border-transparent'
                              }`}
                            >
                              <div className="flex items-center justify-between mb-1 gap-2">
                                <span className="font-medium text-white text-xs md:text-sm truncate">
                                  {inquiry.prospect_name}
                                </span>
                                {getStatusBadge(inquiry.status)}
                              </div>
                              {inquiry.extracted_gm_name && (
                                <p className="text-xs text-emerald-400 truncate">
                                  GM: {inquiry.extracted_gm_name}
                                </p>
                              )}
                              <p className="text-[10px] md:text-xs text-zinc-500 mt-1">
                                Replied {inquiry.reply_received_at ? new Date(inquiry.reply_received_at).toLocaleDateString() : 'Unknown'}
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

            {/* Detail View */}
            <div className="lg:col-span-3">
              {selectedInquiry ? (
                <Card className="bg-zinc-900 border-zinc-800">
                  <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 md:p-6">
                    <div className="min-w-0">
                      <Link href={`/prospects/${selectedInquiry.prospect_id}`}>
                        <CardTitle className="text-white hover:text-amber-400 transition-colors text-sm md:text-base truncate flex items-center gap-2">
                          {selectedInquiry.prospect_name}
                          <ExternalLink className="h-3 w-3" />
                        </CardTitle>
                      </Link>
                      <p className="text-xs md:text-sm text-zinc-400">
                        {selectedInquiry.prospect_email}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {getStatusBadge(selectedInquiry.status)}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4 p-3 md:p-6 pt-0 md:pt-0">
                    {/* Sent Info */}
                    <div className="p-3 md:p-4 rounded-lg bg-zinc-800 border border-zinc-700">
                      <div className="flex items-center gap-2 mb-2 text-blue-400">
                        <Send className="h-4 w-4" />
                        <span className="text-sm font-medium">Inquiry Sent</span>
                      </div>
                      <div className="space-y-1 text-xs md:text-sm">
                        <p><span className="text-zinc-500">Template:</span> <span className="text-zinc-300">{selectedInquiry.template}</span></p>
                        <p><span className="text-zinc-500">From:</span> <span className="text-zinc-300">{selectedInquiry.from_name} ({selectedInquiry.from_email})</span></p>
                        <p><span className="text-zinc-500">Sent:</span> <span className="text-zinc-300">{new Date(selectedInquiry.sent_at).toLocaleString()}</span></p>
                      </div>
                    </div>

                    {/* Reply Info */}
                    {(selectedInquiry.status === 'replied' || selectedInquiry.status === 'gm_extracted') && (
                      <div className="p-3 md:p-4 rounded-lg bg-zinc-800 border border-zinc-700">
                        <div className="flex items-center gap-2 mb-2 text-amber-400">
                          <MessageSquare className="h-4 w-4" />
                          <span className="text-sm font-medium">Reply Received</span>
                        </div>
                        {selectedInquiry.reply_received_at && (
                          <p className="text-xs text-zinc-500 mb-2">
                            {new Date(selectedInquiry.reply_received_at).toLocaleString()}
                          </p>
                        )}
                        {selectedInquiry.reply_body && (
                          <pre className="text-xs md:text-sm text-zinc-300 whitespace-pre-wrap font-sans bg-zinc-900 p-3 rounded max-h-48 overflow-auto">
                            {selectedInquiry.reply_body}
                          </pre>
                        )}
                      </div>
                    )}

                    {/* Extracted GM */}
                    {selectedInquiry.status === 'gm_extracted' && (selectedInquiry.extracted_gm_name || selectedInquiry.extracted_gm_email) && (
                      <div className="p-3 md:p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                        <div className="flex items-center gap-2 mb-2 text-emerald-400">
                          <UserCheck className="h-4 w-4" />
                          <span className="text-sm font-medium">GM Contact Extracted</span>
                        </div>
                        <div className="space-y-1 text-xs md:text-sm">
                          {selectedInquiry.extracted_gm_name && (
                            <p><span className="text-zinc-500">Name:</span> <span className="text-emerald-300">{selectedInquiry.extracted_gm_name}</span></p>
                          )}
                          {selectedInquiry.extracted_gm_email && (
                            <p><span className="text-zinc-500">Email:</span> <span className="text-emerald-300">{selectedInquiry.extracted_gm_email}</span></p>
                          )}
                        </div>
                        <Link href={`/prospects/${selectedInquiry.prospect_id}`}>
                          <Button size="sm" className="mt-3 bg-emerald-600 hover:bg-emerald-700">
                            View Prospect <ChevronRight className="h-4 w-4 ml-1" />
                          </Button>
                        </Link>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <Card className="bg-zinc-900 border-zinc-800 h-48 lg:h-full flex items-center justify-center">
                  <p className="text-zinc-500 text-sm">Select an inquiry to view details</p>
                </Card>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
