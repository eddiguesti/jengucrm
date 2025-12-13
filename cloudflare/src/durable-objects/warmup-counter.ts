/**
 * WarmupCounter Durable Object
 *
 * Manages email warmup limits per inbox with conservative ramp-up schedule.
 * Ensures deliverability by gradually increasing sending volume.
 *
 * IMPROVEMENT: Added per-inbox tracking, reputation scoring, and automatic
 * throttling when bounces detected.
 */

import { WarmupStatus } from '../types';

interface InboxWarmupState {
  id: string;
  email: string;
  provider: 'azure' | 'smtp';
  createdAt: number;
  warmupDay: number;
  sentToday: number;
  sentTotal: number;
  bouncesToday: number;
  bouncesTotal: number;
  lastSendDate: string;
  reputationScore: number; // 0-100, affects daily limit
  paused: boolean;
  pauseReason: string | null;
}

// Conservative warmup schedule for new inboxes
const WARMUP_SCHEDULE = [
  { maxDay: 7, baseLimit: 5 },    // Week 1: 5 emails/day
  { maxDay: 14, baseLimit: 10 },  // Week 2: 10 emails/day
  { maxDay: 21, baseLimit: 15 },  // Week 3: 15 emails/day
  { maxDay: 28, baseLimit: 18 },  // Week 4: 18 emails/day
  { maxDay: Infinity, baseLimit: 20 }, // Week 5+: 20 emails/day (max)
];

// Reputation thresholds
const BOUNCE_RATE_THRESHOLD = 0.05; // 5% bounce rate triggers throttle
const REPUTATION_RECOVERY_PER_DAY = 5; // Points recovered per clean day

export class WarmupCounter implements DurableObject {
  private state: DurableObjectState;
  private inboxes: Map<string, InboxWarmupState> = new Map();
  private initialized = false;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  private async initialize() {
    if (this.initialized) return;

    const stored = await this.state.storage.get<Record<string, InboxWarmupState>>('inboxes');
    if (stored) {
      this.inboxes = new Map(Object.entries(stored));
    }
    this.initialized = true;
  }

  async fetch(request: Request): Promise<Response> {
    await this.initialize();

    const url = new URL(request.url);

    try {
      switch (url.pathname) {
        case '/can-send':
          return this.handleCanSend(request);

        case '/increment':
          return this.handleIncrement(request);

        case '/record-bounce':
          return this.handleBounce(request);

        case '/register-inbox':
          return this.handleRegisterInbox(request);

        case '/pause-inbox':
          return this.handlePauseInbox(request);

        case '/resume-inbox':
          return this.handleResumeInbox(request);

        case '/status':
          return this.handleStatus();

        case '/daily-reset':
          return this.handleDailyReset();

        default:
          return new Response('Not Found', { status: 404 });
      }
    } catch (error) {
      console.error('WarmupCounter error:', error);
      return new Response(JSON.stringify({ error: String(error) }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  private async handleCanSend(request: Request): Promise<Response> {
    const { inboxId } = await request.json<{ inboxId: string }>();

    const inbox = this.inboxes.get(inboxId);
    if (!inbox) {
      return Response.json({ error: 'Inbox not registered', allowed: false }, { status: 404 });
    }

    // Check if paused
    if (inbox.paused) {
      return Response.json({
        allowed: false,
        reason: inbox.pauseReason || 'Inbox paused',
        sent: inbox.sentToday,
        limit: 0,
        warmupDay: inbox.warmupDay,
        retryAfter: this.getSecondsUntilMidnight(),
      });
    }

    // Reset daily counts if new day
    this.resetIfNewDay(inbox);

    // Calculate dynamic limit based on warmup + reputation
    const limit = this.calculateDailyLimit(inbox);

    const canSend = inbox.sentToday < limit;

    return Response.json({
      allowed: canSend,
      sent: inbox.sentToday,
      limit,
      warmupDay: inbox.warmupDay,
      reputationScore: inbox.reputationScore,
      retryAfter: canSend ? 0 : this.getSecondsUntilMidnight(),
    } satisfies WarmupStatus & { reputationScore: number });
  }

  private async handleIncrement(request: Request): Promise<Response> {
    const { inboxId } = await request.json<{ inboxId: string }>();

    const inbox = this.inboxes.get(inboxId);
    if (!inbox) {
      return Response.json({ error: 'Inbox not registered' }, { status: 404 });
    }

    this.resetIfNewDay(inbox);

    inbox.sentToday++;
    inbox.sentTotal++;

    // Update warmup day based on creation date
    inbox.warmupDay = this.calculateWarmupDay(inbox.createdAt);

    await this.persist();

    return Response.json({
      sent: inbox.sentToday,
      limit: this.calculateDailyLimit(inbox),
      warmupDay: inbox.warmupDay,
      total: inbox.sentTotal,
    });
  }

  private async handleBounce(request: Request): Promise<Response> {
    const { inboxId } = await request.json<{ inboxId: string; email?: string }>();

    const inbox = this.inboxes.get(inboxId);
    if (!inbox) {
      return Response.json({ error: 'Inbox not registered' }, { status: 404 });
    }

    inbox.bouncesToday++;
    inbox.bouncesTotal++;

    // Calculate bounce rate
    const bounceRate = inbox.sentToday > 0 ? inbox.bouncesToday / inbox.sentToday : 0;

    // Decrease reputation based on bounce
    inbox.reputationScore = Math.max(0, inbox.reputationScore - 10);

    // Auto-pause if bounce rate too high
    if (bounceRate > BOUNCE_RATE_THRESHOLD && inbox.sentToday >= 5) {
      inbox.paused = true;
      inbox.pauseReason = `High bounce rate: ${(bounceRate * 100).toFixed(1)}%`;
    }

    await this.persist();

    return Response.json({
      bounceRate,
      reputationScore: inbox.reputationScore,
      paused: inbox.paused,
      pauseReason: inbox.pauseReason,
    });
  }

  private async handleRegisterInbox(request: Request): Promise<Response> {
    const { id, email, provider } = await request.json<{
      id: string;
      email: string;
      provider: 'azure' | 'smtp';
    }>();

    if (this.inboxes.has(id)) {
      return Response.json({ error: 'Inbox already registered' }, { status: 400 });
    }

    const inbox: InboxWarmupState = {
      id,
      email,
      provider,
      createdAt: Date.now(),
      warmupDay: 1,
      sentToday: 0,
      sentTotal: 0,
      bouncesToday: 0,
      bouncesTotal: 0,
      lastSendDate: new Date().toISOString().split('T')[0],
      reputationScore: 100, // Start at full reputation
      paused: false,
      pauseReason: null,
    };

    this.inboxes.set(id, inbox);
    await this.persist();

    return Response.json({ success: true, inbox });
  }

  private async handlePauseInbox(request: Request): Promise<Response> {
    const { inboxId, reason } = await request.json<{ inboxId: string; reason: string }>();

    const inbox = this.inboxes.get(inboxId);
    if (!inbox) {
      return Response.json({ error: 'Inbox not registered' }, { status: 404 });
    }

    inbox.paused = true;
    inbox.pauseReason = reason;
    await this.persist();

    return Response.json({ success: true });
  }

  private async handleResumeInbox(request: Request): Promise<Response> {
    const { inboxId } = await request.json<{ inboxId: string }>();

    const inbox = this.inboxes.get(inboxId);
    if (!inbox) {
      return Response.json({ error: 'Inbox not registered' }, { status: 404 });
    }

    inbox.paused = false;
    inbox.pauseReason = null;
    await this.persist();

    return Response.json({ success: true });
  }

  private handleStatus(): Response {
    const inboxStatuses = [...this.inboxes.values()].map((inbox) => ({
      id: inbox.id,
      email: inbox.email,
      provider: inbox.provider,
      warmupDay: inbox.warmupDay,
      sentToday: inbox.sentToday,
      limit: this.calculateDailyLimit(inbox),
      sentTotal: inbox.sentTotal,
      bouncesToday: inbox.bouncesToday,
      reputationScore: inbox.reputationScore,
      paused: inbox.paused,
      pauseReason: inbox.pauseReason,
    }));

    const totalSentToday = inboxStatuses.reduce((sum, i) => sum + i.sentToday, 0);
    const totalLimit = inboxStatuses.reduce((sum, i) => sum + i.limit, 0);
    const activeInboxes = inboxStatuses.filter((i) => !i.paused).length;

    return Response.json({
      inboxes: inboxStatuses,
      summary: {
        totalInboxes: this.inboxes.size,
        activeInboxes,
        totalSentToday,
        totalLimit,
        remaining: totalLimit - totalSentToday,
      },
    });
  }

  private async handleDailyReset(): Promise<Response> {
    const today = new Date().toISOString().split('T')[0];

    for (const inbox of this.inboxes.values()) {
      if (inbox.lastSendDate !== today) {
        inbox.sentToday = 0;
        inbox.bouncesToday = 0;
        inbox.lastSendDate = today;
        inbox.warmupDay = this.calculateWarmupDay(inbox.createdAt);

        // Recover reputation if no bounces yesterday
        if (inbox.reputationScore < 100) {
          inbox.reputationScore = Math.min(100, inbox.reputationScore + REPUTATION_RECOVERY_PER_DAY);
        }
      }
    }

    await this.persist();

    return Response.json({ success: true, date: today });
  }

  private resetIfNewDay(inbox: InboxWarmupState): void {
    const today = new Date().toISOString().split('T')[0];

    if (inbox.lastSendDate !== today) {
      // Recover reputation if no bounces yesterday
      if (inbox.bouncesToday === 0 && inbox.reputationScore < 100) {
        inbox.reputationScore = Math.min(100, inbox.reputationScore + REPUTATION_RECOVERY_PER_DAY);
      }

      inbox.sentToday = 0;
      inbox.bouncesToday = 0;
      inbox.lastSendDate = today;
      inbox.warmupDay = this.calculateWarmupDay(inbox.createdAt);
    }
  }

  private calculateWarmupDay(createdAt: number): number {
    const msPerDay = 24 * 60 * 60 * 1000;
    return Math.floor((Date.now() - createdAt) / msPerDay) + 1;
  }

  private calculateDailyLimit(inbox: InboxWarmupState): number {
    // Get base limit from warmup schedule
    let baseLimit = WARMUP_SCHEDULE[WARMUP_SCHEDULE.length - 1].baseLimit;

    for (const tier of WARMUP_SCHEDULE) {
      if (inbox.warmupDay <= tier.maxDay) {
        baseLimit = tier.baseLimit;
        break;
      }
    }

    // Apply reputation modifier (0-100% of base limit)
    const reputationMultiplier = inbox.reputationScore / 100;

    return Math.floor(baseLimit * reputationMultiplier);
  }

  private getSecondsUntilMidnight(): number {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setUTCHours(24, 0, 0, 0);
    return Math.floor((midnight.getTime() - now.getTime()) / 1000);
  }

  private async persist(): Promise<void> {
    await this.state.storage.put('inboxes', Object.fromEntries(this.inboxes));
  }
}
