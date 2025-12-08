'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Header } from '@/components/layout/header';
import { Mail, MessageSquare, Calendar, TrendingUp, Inbox, Loader2, ExternalLink } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';
import Link from 'next/link';

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

const cardVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.25, 0.1, 0.25, 1] as const } },
};

function AgentCard({ agent }: { agent: AgentStats }) {
  const { email, stats } = agent;
  const { theme } = useTheme();
  const isLight = theme === 'light';

  // Calculate conversion funnel
  const funnelStages = [
    { name: 'Contacted', count: stats.stageBreakdown.contacted, gradient: 'linear-gradient(90deg, #7dd3fc, #60a5fa)' },
    { name: 'Engaged', count: stats.stageBreakdown.engaged, gradient: 'linear-gradient(90deg, #34d399, #22c55e)' },
    { name: 'Meeting', count: stats.stageBreakdown.meeting, gradient: 'linear-gradient(90deg, #a855f7, #6366f1)' },
    { name: 'Proposal', count: stats.stageBreakdown.proposal, gradient: 'linear-gradient(90deg, #fbbf24, #f59e0b)' },
    { name: 'Closed', count: stats.stageBreakdown.closed, gradient: 'linear-gradient(90deg, #22d3ee, #06b6d4)' },
  ];

  const maxFunnel = Math.max(...funnelStages.map(s => s.count), 1);

  return (
    <motion.div
      variants={cardVariants}
      className={cn(
        "gradient-border relative overflow-hidden rounded-2xl p-5 md:p-6 backdrop-blur-xl shadow-2xl hover-lift transition-colors",
        isLight ? "bg-white text-slate-900 border border-slate-100" : "bg-[#0d1427]/90 text-white"
      )}
    >
      {!isLight && (
        <div className="pointer-events-none absolute inset-0 opacity-60 mix-blend-screen">
          <div className="absolute -left-12 -top-12 h-32 w-32 rounded-full bg-primary/20 blur-3xl" />
          <div className="absolute -right-10 bottom-0 h-32 w-32 rounded-full bg-amber-400/10 blur-3xl" />
        </div>
      )}

      {/* Agent Header */}
      <div className="relative flex items-center gap-3 md:gap-4 mb-5 md:mb-6">
        <div
          className={cn(
            "p-2.5 md:p-3 rounded-xl shadow-inner",
            isLight ? "bg-sky-100" : "bg-primary/15"
          )}
        >
          <Inbox className="h-5 w-5 md:h-6 md:w-6 text-primary" />
        </div>
        <div className="min-w-0">
          <h3
            className={cn(
              "text-sm md:text-lg font-semibold truncate tracking-tight",
              isLight ? "text-slate-900" : "text-white"
            )}
          >
            {email.split('@')[0]}
          </h3>
          <p
            className={cn(
              "text-[11px] md:text-xs truncate",
              isLight ? "text-slate-500" : "text-zinc-400"
            )}
          >
            {email}
          </p>
        </div>
      </div>

      {/* Quick Stats Grid - Clickable */}
      <div className="grid grid-cols-2 gap-2 md:gap-4 mb-4 md:mb-6">
        <Link
          href={`/emails?from=${encodeURIComponent(email)}`}
          className={cn(
            "rounded-lg p-3 md:p-4 border transition-all hover:scale-[1.02] cursor-pointer group",
            isLight ? "bg-slate-50 border-slate-100 hover:border-sky-200 hover:bg-sky-50/50" : "bg-white/[0.03] border-white/[0.06] hover:border-sky-500/30 hover:bg-sky-500/5"
          )}
        >
          <div className="flex items-center gap-1 md:gap-2 mb-1">
            <Mail className={cn("h-3 w-3 md:h-4 md:w-4", isLight ? "text-sky-500" : "text-primary")} />
            <span className={cn("text-[10px] md:text-xs", isLight ? "text-slate-500" : "text-zinc-400")}>
              Sent Today
            </span>
            <ExternalLink className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100 transition-opacity ml-auto text-sky-500" />
          </div>
          <p
            className={cn(
              "text-xl md:text-2xl font-semibold tracking-tight",
              isLight ? "text-slate-900" : "text-white"
            )}
          >
            {stats.sent.today}
          </p>
          <p className={cn("text-[10px] md:text-xs", isLight ? "text-slate-500" : "text-zinc-500")}>
            {stats.sent.total} total
          </p>
        </Link>

        <Link
          href={`/replies?from=${encodeURIComponent(email)}`}
          className={cn(
            "rounded-lg p-3 md:p-4 border transition-all hover:scale-[1.02] cursor-pointer group",
            isLight ? "bg-slate-50 border-slate-100 hover:border-emerald-200 hover:bg-emerald-50/50" : "bg-white/[0.03] border-white/[0.06] hover:border-emerald-500/30 hover:bg-emerald-500/5"
          )}
        >
          <div className="flex items-center gap-1 md:gap-2 mb-1">
            <MessageSquare className="h-3 w-3 md:h-4 md:w-4 text-emerald-400" />
            <span className={cn("text-[10px] md:text-xs", isLight ? "text-slate-500" : "text-zinc-400")}>
              Replies
            </span>
            <ExternalLink className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100 transition-opacity ml-auto text-emerald-500" />
          </div>
          <p
            className={cn(
              "text-xl md:text-2xl font-semibold tracking-tight",
              isLight ? "text-slate-900" : "text-white"
            )}
          >
            {stats.replies.total}
          </p>
          <p className={cn("text-[10px] md:text-xs", isLight ? "text-slate-500" : "text-zinc-500")}>
            {stats.replies.thisWeek} this week
          </p>
        </Link>

        <div
          className={cn(
            "rounded-lg p-3 md:p-4 border",
            isLight ? "bg-slate-50 border-slate-100" : "bg-white/[0.03] border-white/[0.06]"
          )}
        >
          <div className="flex items-center gap-1 md:gap-2 mb-1">
            <TrendingUp className="h-3 w-3 md:h-4 md:w-4 text-amber-400" />
            <span className={cn("text-[10px] md:text-xs", isLight ? "text-slate-500" : "text-zinc-400")}>
              Reply Rate
            </span>
          </div>
          <p
            className={cn(
              "text-xl md:text-2xl font-semibold tracking-tight",
              isLight ? "text-slate-900" : "text-white"
            )}
          >
            {stats.replyRate}%
          </p>
        </div>

        <Link
          href={`/notifications?type=meeting_request`}
          className={cn(
            "rounded-lg p-3 md:p-4 border transition-all hover:scale-[1.02] cursor-pointer group",
            isLight ? "bg-slate-50 border-slate-100 hover:border-purple-200 hover:bg-purple-50/50" : "bg-white/[0.03] border-white/[0.06] hover:border-purple-500/30 hover:bg-purple-500/5"
          )}
        >
          <div className="flex items-center gap-1 md:gap-2 mb-1">
            <Calendar className="h-3 w-3 md:h-4 md:w-4 text-purple-400" />
            <span className={cn("text-[10px] md:text-xs", isLight ? "text-slate-500" : "text-zinc-400")}>
              Meetings
            </span>
            <ExternalLink className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100 transition-opacity ml-auto text-purple-500" />
          </div>
          <p
            className={cn(
              "text-xl md:text-2xl font-semibold tracking-tight",
              isLight ? "text-slate-900" : "text-white"
            )}
          >
            {stats.meetingRequests}
          </p>
        </Link>
      </div>

      {/* Assigned Prospects */}
      <div className="mb-3 md:mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className={cn("text-xs md:text-sm", isLight ? "text-slate-500" : "text-zinc-400")}>
            Assigned Prospects
          </span>
          <span
            className={cn(
              "text-base md:text-lg font-semibold tracking-tight",
              isLight ? "text-slate-900" : "text-white"
            )}
          >
            {stats.assignedProspects}
          </span>
        </div>
      </div>

      {/* Funnel Visualization */}
      <div>
        <h4 className="text-xs md:text-sm text-zinc-400 mb-2 md:mb-3">Pipeline</h4>
          <div className="space-y-1.5 md:space-y-2">
          {funnelStages.map(stage => (
            <div key={stage.name} className="flex items-center gap-2 md:gap-3">
              <span className={cn("text-[10px] md:text-xs w-16 md:w-20", isLight ? "text-slate-500" : "text-zinc-500")}>
                {stage.name}
              </span>
              <div
                className={cn(
                  "flex-1 h-1.5 md:h-2 rounded-full overflow-hidden",
                  isLight ? "bg-slate-100" : "bg-white/[0.04]"
                )}
              >
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${(stage.count / maxFunnel) * 100}%`,
                    background: stage.gradient,
                  }}
                  aria-label={`${stage.name} ${stage.count}`}
                  aria-valuemin={0}
                  aria-valuemax={maxFunnel}
                  aria-valuenow={stage.count}
                  role="progressbar"
                />
              </div>
              <span className={cn("text-[10px] md:text-xs w-5 md:w-6 text-right", isLight ? "text-slate-600" : "text-zinc-400")}>
                {stage.count}
              </span>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

export default function AgentsPage() {
  const [data, setData] = useState<AgentsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { theme } = useTheme();
  const isLight = theme === 'light';

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
    <div
      className={cn(
        "flex flex-col h-full transition-colors",
        isLight
          ? "bg-gradient-to-br from-slate-50 via-white to-slate-100 text-slate-900"
          : "bg-gradient-to-br from-[#080c18] via-[#070b13] to-[#05070f]"
      )}
    >
      <Header title="Sales Agents" subtitle="Performance by inbox" />

      <div className="relative flex-1 overflow-auto p-4 md:p-8">
        <div className="pointer-events-none absolute inset-0 opacity-40">
          <div className={cn("absolute inset-6 rounded-3xl blur-3xl", isLight ? "bg-gradient-to-br from-sky-200/30 via-indigo-200/20 to-amber-200/20" : "aurora")} />
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          </div>
        ) : error ? (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 md:p-4 text-red-400 text-sm">
            {error}
          </div>
        ) : data ? (
          <>
            {/* Hero/overview */}
            <div className="mb-8">
              <div className="aurora relative overflow-hidden rounded-3xl border border-white/[0.06] p-6 md:p-8 shadow-2xl">
                <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm uppercase tracking-[0.18em] text-white/60">Pipeline Pulse</p>
                    <h2 className="mt-2 text-2xl md:text-3xl font-semibold text-white tracking-tight">
                      Keep every sales inbox on tempo
                    </h2>
                    <p className="mt-2 text-sm text-white/70 max-w-2xl">
                      Faster follow-ups, cleaner handoffs, and a responsive UI built for revenue teams.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                    <div className="rounded-2xl bg-white/5 px-4 py-3 border border-white/10 shadow-lg">
                      <p className="text-xs text-white/60">Agents</p>
                      <p className="text-2xl font-semibold text-white tracking-tight">
                        {data.agents.length}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-white/5 px-4 py-3 border border-white/10 shadow-lg">
                      <p className="text-xs text-white/60">Today&apos;s sends</p>
                      <p className="text-2xl font-semibold text-white tracking-tight">
                        {data.totals.sentToday}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-white/5 px-4 py-3 border border-white/10 shadow-lg">
                      <p className="text-xs text-white/60">Meetings</p>
                      <p className="text-2xl font-semibold text-white tracking-tight">
                        {data.totals.meetingRequests}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Summary Cards */}
            <motion.div
              initial="hidden"
              animate="show"
              variants={{
                hidden: { opacity: 0, y: 12 },
                show: { opacity: 1, y: 0, transition: { staggerChildren: 0.08 } },
              }}
              className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4 mb-6 md:mb-8"
            >
              {[
                { label: 'Agents', value: data.agents.length, icon: <Inbox className="h-4 w-4 md:h-5 md:w-5" />, color: 'from-primary/70 to-primary/40' },
                { label: 'Today', value: data.totals.sentToday, icon: <Mail className="h-4 w-4 md:h-5 md:w-5" />, color: 'from-sky-400/80 to-indigo-500/60' },
                { label: 'Total Sent', value: data.totals.sent, icon: <Mail className="h-4 w-4 md:h-5 md:w-5" />, color: 'from-emerald-400/70 to-teal-500/50' },
                { label: 'Replies', value: data.totals.replies, icon: <MessageSquare className="h-4 w-4 md:h-5 md:w-5" />, color: 'from-amber-400/70 to-orange-500/60' },
                { label: 'Meetings', value: data.totals.meetingRequests, icon: <Calendar className="h-4 w-4 md:h-5 md:w-5" />, color: 'from-purple-400/70 to-indigo-500/60' },
              ].map((item, idx) => (
                <motion.div
                  key={item.label}
                  variants={cardVariants}
                  transition={{ delay: idx * 0.04 }}
                  className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.03] to-white/[0.02] p-4 shadow-xl"
                >
                  <div className={`absolute inset-0 opacity-70 bg-gradient-to-br ${item.color}`} />
                  <div className="relative z-10 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] md:text-xs uppercase tracking-[0.18em] text-white/60">
                        {item.label}
                      </p>
                      <p className="mt-1 text-xl md:text-3xl font-semibold text-white tracking-tight">
                        {item.value}
                      </p>
                    </div>
                    <div className="rounded-xl bg-black/50 p-2.5 text-white/80 backdrop-blur">
                      {item.icon}
                    </div>
                  </div>
                </motion.div>
              ))}
            </motion.div>

            {/* Agent Cards Grid */}
            <motion.div
              initial="hidden"
              animate="show"
              variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08 } } }}
              className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-6"
            >
              {data.agents.map((agent, index) => (
                <AgentCard key={`${agent.email}-${index}`} agent={agent} />
              ))}
            </motion.div>

            {data.agents.length === 0 && (
              <div className="text-center py-12 text-zinc-500">
                <Inbox className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-sm md:text-base">No sales agents configured yet</p>
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
