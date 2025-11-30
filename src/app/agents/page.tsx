'use client';

import { useState, useEffect } from 'react';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { Mail, Users, MessageSquare, Calendar, TrendingUp, ArrowUpRight, Inbox } from 'lucide-react';

interface AgentStats {
  email: string;
  name: string;
  stats: {
    sent: {
      total: number;
      today: number;
      thisWeek: number;
      thisMonth: number;
    };
    replies: {
      total: number;
      thisWeek: number;
    };
    replyRate: number;
    assignedProspects: number;
    stageBreakdown: {
      contacted: number;
      engaged: number;
      meeting: number;
      proposal: number;
      closed: number;
      lost: number;
    };
    meetingRequests: number;
  };
}

interface AgentsData {
  agents: AgentStats[];
  totals: {
    sent: number;
    sentToday: number;
    replies: number;
    prospects: number;
    meetingRequests: number;
  };
}

function AgentCard({ agent }: { agent: AgentStats }) {
  const { email, name, stats } = agent;

  // Calculate conversion funnel
  const funnelStages = [
    { name: 'Contacted', count: stats.stageBreakdown.contacted, color: 'bg-blue-500' },
    { name: 'Engaged', count: stats.stageBreakdown.engaged, color: 'bg-cyan-500' },
    { name: 'Meeting', count: stats.stageBreakdown.meeting, color: 'bg-emerald-500' },
    { name: 'Proposal', count: stats.stageBreakdown.proposal, color: 'bg-amber-500' },
    { name: 'Closed', count: stats.stageBreakdown.closed, color: 'bg-green-500' },
  ];

  const maxFunnel = Math.max(...funnelStages.map(s => s.count), 1);

  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
      {/* Agent Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-blue-500/10 rounded-xl">
          <Inbox className="h-6 w-6 text-blue-400" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white">{email.split('@')[0]}</h3>
          <p className="text-xs text-zinc-500">{email}</p>
        </div>
      </div>

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-zinc-800/50 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <Mail className="h-4 w-4 text-blue-400" />
            <span className="text-xs text-zinc-400">Sent Today</span>
          </div>
          <p className="text-2xl font-bold text-white">{stats.sent.today}</p>
          <p className="text-xs text-zinc-500">{stats.sent.total} total</p>
        </div>

        <div className="bg-zinc-800/50 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <MessageSquare className="h-4 w-4 text-emerald-400" />
            <span className="text-xs text-zinc-400">Replies</span>
          </div>
          <p className="text-2xl font-bold text-white">{stats.replies.total}</p>
          <p className="text-xs text-zinc-500">{stats.replies.thisWeek} this week</p>
        </div>

        <div className="bg-zinc-800/50 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="h-4 w-4 text-amber-400" />
            <span className="text-xs text-zinc-400">Reply Rate</span>
          </div>
          <p className="text-2xl font-bold text-white">{stats.replyRate}%</p>
        </div>

        <div className="bg-zinc-800/50 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <Calendar className="h-4 w-4 text-purple-400" />
            <span className="text-xs text-zinc-400">Meetings</span>
          </div>
          <p className="text-2xl font-bold text-white">{stats.meetingRequests}</p>
        </div>
      </div>

      {/* Assigned Prospects */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-zinc-400">Assigned Prospects</span>
          <span className="text-lg font-semibold text-white">{stats.assignedProspects}</span>
        </div>
      </div>

      {/* Funnel Visualization */}
      <div>
        <h4 className="text-sm text-zinc-400 mb-3">Pipeline</h4>
        <div className="space-y-2">
          {funnelStages.map(stage => (
            <div key={stage.name} className="flex items-center gap-3">
              <span className="text-xs text-zinc-500 w-20">{stage.name}</span>
              <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className={`h-full ${stage.color} rounded-full transition-all duration-500`}
                  style={{ width: `${(stage.count / maxFunnel) * 100}%` }}
                />
              </div>
              <span className="text-xs text-zinc-400 w-6 text-right">{stage.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function AgentsPage() {
  const [data, setData] = useState<AgentsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/agents');
      if (!response.ok) throw new Error('Failed to fetch agent data');
      const json = await response.json();
      setData(json);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 ml-56">
        <Header title="Sales Agents" subtitle="Performance by inbox" />

        <div className="p-6">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
            </div>
          ) : error ? (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-red-400">
              {error}
            </div>
          ) : data ? (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-5 gap-4 mb-8">
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Inbox className="h-5 w-5 text-blue-400" />
                    <span className="text-sm text-zinc-400">Active Agents</span>
                  </div>
                  <p className="text-3xl font-bold text-white">{data.agents.length}</p>
                </div>

                <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Mail className="h-5 w-5 text-blue-400" />
                    <span className="text-sm text-zinc-400">Sent Today</span>
                  </div>
                  <p className="text-3xl font-bold text-white">{data.totals.sentToday}</p>
                </div>

                <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Mail className="h-5 w-5 text-emerald-400" />
                    <span className="text-sm text-zinc-400">Total Sent</span>
                  </div>
                  <p className="text-3xl font-bold text-white">{data.totals.sent}</p>
                </div>

                <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <MessageSquare className="h-5 w-5 text-amber-400" />
                    <span className="text-sm text-zinc-400">Total Replies</span>
                  </div>
                  <p className="text-3xl font-bold text-white">{data.totals.replies}</p>
                </div>

                <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Calendar className="h-5 w-5 text-purple-400" />
                    <span className="text-sm text-zinc-400">Meetings</span>
                  </div>
                  <p className="text-3xl font-bold text-white">{data.totals.meetingRequests}</p>
                </div>
              </div>

              {/* Agent Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {data.agents.map(agent => (
                  <AgentCard key={agent.email} agent={agent} />
                ))}
              </div>
            </>
          ) : null}
        </div>
      </main>
    </div>
  );
}
