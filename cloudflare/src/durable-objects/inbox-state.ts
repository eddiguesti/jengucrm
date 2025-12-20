/**
 * InboxState Durable Object
 *
 * Manages inbox pool health and round-robin selection.
 * Tracks connection health, automatic failover, and recovery.
 *
 * IMPROVEMENT: Added health checks, automatic recovery, weighted selection
 * based on performance, and circuit breaker pattern.
 */

import { InboxConfig } from '../types';

interface InboxHealth {
  config: InboxConfig;
  healthy: boolean;
  consecutiveFailures: number;
  lastFailure: number | null;
  lastSuccess: number | null;
  lastError: string | null;
  circuitState: 'closed' | 'open' | 'half-open';
  circuitOpenedAt: number | null;
  totalSent: number;
  totalBounced: number;
  avgLatencyMs: number;
  latencySamples: number[];
}

// Circuit breaker settings
const FAILURE_THRESHOLD = 3; // Opens circuit after 3 consecutive failures
const CIRCUIT_RESET_MS = 5 * 60 * 1000; // 5 minutes before trying again
const LATENCY_SAMPLE_SIZE = 10;

export class InboxState implements DurableObject {
  private state: DurableObjectState;
  private inboxes: Map<string, InboxHealth> = new Map();
  private roundRobinIndex = 0;
  private initialized = false;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  private async initialize() {
    if (this.initialized) return;

    const stored = await this.state.storage.get<{
      inboxes: Record<string, InboxHealth>;
      rrIndex: number;
    }>('data');

    if (stored) {
      this.inboxes = new Map(Object.entries(stored.inboxes));
      this.roundRobinIndex = stored.rrIndex;
    }

    this.initialized = true;
  }

  async fetch(request: Request): Promise<Response> {
    await this.initialize();

    const url = new URL(request.url);

    try {
      switch (url.pathname) {
        case '/next-inbox':
          return this.handleGetNextInbox();

        case '/register':
          return this.handleRegister(request);

        case '/mark-success':
          return this.handleMarkSuccess(request);

        case '/mark-failure':
          return this.handleMarkFailure(request);

        case '/mark-bounce':
          return this.handleMarkBounce(request);

        case '/health-check':
          return this.handleHealthCheck();

        case '/status':
          return this.handleStatus();

        case '/reset-circuit':
          return this.handleResetCircuit(request);

        case '/clear':
          return this.handleClear();

        case '/remove':
          return this.handleRemove(request);

        default:
          return new Response('Not Found', { status: 404 });
      }
    } catch (error) {
      console.error('InboxState error:', error);
      return new Response(JSON.stringify({ error: String(error) }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  private async handleGetNextInbox(): Promise<Response> {
    // Update circuit breaker states
    this.updateCircuitStates();

    // Get available inboxes (healthy or half-open for retry)
    const available = [...this.inboxes.values()].filter(
      (inbox) =>
        inbox.healthy &&
        (inbox.circuitState === 'closed' || inbox.circuitState === 'half-open')
    );

    if (available.length === 0) {
      // Try any half-open circuits as last resort
      const halfOpen = [...this.inboxes.values()].filter(
        (inbox) => inbox.circuitState === 'half-open'
      );

      if (halfOpen.length > 0) {
        const selected = halfOpen[0];
        return Response.json({
          ...selected.config,
          warning: 'Using half-open circuit - monitoring for failures',
        });
      }

      return Response.json(
        { error: 'No healthy inboxes available' },
        { status: 503 }
      );
    }

    // Weighted selection: prefer inboxes with lower latency and higher success rate
    const weighted = available.map((inbox) => ({
      inbox,
      weight: this.calculateWeight(inbox),
    }));

    // Sort by weight (higher = better)
    weighted.sort((a, b) => b.weight - a.weight);

    // Round-robin within top performers (top 50%)
    const topPerformers = weighted.slice(0, Math.max(1, Math.ceil(weighted.length / 2)));
    const selectedIndex = this.roundRobinIndex % topPerformers.length;
    const selected = topPerformers[selectedIndex].inbox;

    this.roundRobinIndex++;
    await this.persist();

    return Response.json({
      ...selected.config,
      circuitState: selected.circuitState,
      avgLatencyMs: selected.avgLatencyMs,
    });
  }

  private async handleRegister(request: Request): Promise<Response> {
    const config = await request.json<InboxConfig>();

    if (this.inboxes.has(config.id)) {
      // Update existing config
      const existing = this.inboxes.get(config.id)!;
      existing.config = config;
      await this.persist();
      return Response.json({ success: true, updated: true });
    }

    const health: InboxHealth = {
      config,
      healthy: true,
      consecutiveFailures: 0,
      lastFailure: null,
      lastSuccess: null,
      lastError: null,
      circuitState: 'closed',
      circuitOpenedAt: null,
      totalSent: 0,
      totalBounced: 0,
      avgLatencyMs: 0,
      latencySamples: [],
    };

    this.inboxes.set(config.id, health);
    await this.persist();

    return Response.json({ success: true, created: true });
  }

  private async handleMarkSuccess(request: Request): Promise<Response> {
    const { inboxId, latencyMs } = await request.json<{
      inboxId: string;
      latencyMs: number;
    }>();

    const inbox = this.inboxes.get(inboxId);
    if (!inbox) {
      return Response.json({ error: 'Inbox not found' }, { status: 404 });
    }

    inbox.consecutiveFailures = 0;
    inbox.lastSuccess = Date.now();
    inbox.healthy = true;
    inbox.totalSent++;

    // Update latency tracking
    inbox.latencySamples.push(latencyMs);
    if (inbox.latencySamples.length > LATENCY_SAMPLE_SIZE) {
      inbox.latencySamples.shift();
    }
    inbox.avgLatencyMs = Math.round(
      inbox.latencySamples.reduce((a, b) => a + b, 0) / inbox.latencySamples.length
    );

    // Close circuit if it was half-open
    if (inbox.circuitState === 'half-open') {
      inbox.circuitState = 'closed';
      inbox.circuitOpenedAt = null;
    }

    await this.persist();

    return Response.json({
      success: true,
      circuitState: inbox.circuitState,
      avgLatencyMs: inbox.avgLatencyMs,
    });
  }

  private async handleMarkFailure(request: Request): Promise<Response> {
    const { inboxId, error } = await request.json<{
      inboxId: string;
      error: string;
    }>();

    const inbox = this.inboxes.get(inboxId);
    if (!inbox) {
      return Response.json({ error: 'Inbox not found' }, { status: 404 });
    }

    inbox.consecutiveFailures++;
    inbox.lastFailure = Date.now();
    inbox.lastError = error;

    // Open circuit if too many failures
    if (inbox.consecutiveFailures >= FAILURE_THRESHOLD) {
      inbox.circuitState = 'open';
      inbox.circuitOpenedAt = Date.now();
      inbox.healthy = false;
    }

    await this.persist();

    return Response.json({
      circuitState: inbox.circuitState,
      consecutiveFailures: inbox.consecutiveFailures,
      willRetryAt: inbox.circuitOpenedAt
        ? inbox.circuitOpenedAt + CIRCUIT_RESET_MS
        : null,
    });
  }

  private async handleMarkBounce(request: Request): Promise<Response> {
    const { inboxId } = await request.json<{ inboxId: string }>();

    const inbox = this.inboxes.get(inboxId);
    if (!inbox) {
      return Response.json({ error: 'Inbox not found' }, { status: 404 });
    }

    inbox.totalBounced++;

    await this.persist();

    return Response.json({
      totalBounced: inbox.totalBounced,
      bounceRate:
        inbox.totalSent > 0
          ? (inbox.totalBounced / inbox.totalSent) * 100
          : 0,
    });
  }

  private handleHealthCheck(): Response {
    this.updateCircuitStates();

    const healthyCount = [...this.inboxes.values()].filter(
      (i) => i.healthy && i.circuitState === 'closed'
    ).length;

    const halfOpenCount = [...this.inboxes.values()].filter(
      (i) => i.circuitState === 'half-open'
    ).length;

    const openCount = [...this.inboxes.values()].filter(
      (i) => i.circuitState === 'open'
    ).length;

    return Response.json({
      status: healthyCount > 0 ? 'healthy' : halfOpenCount > 0 ? 'degraded' : 'unhealthy',
      total: this.inboxes.size,
      healthy: healthyCount,
      halfOpen: halfOpenCount,
      open: openCount,
    });
  }

  private handleStatus(): Response {
    this.updateCircuitStates();

    const statuses = [...this.inboxes.values()].map((inbox) => ({
      id: inbox.config.id,
      email: inbox.config.email,
      provider: inbox.config.provider,
      healthy: inbox.healthy,
      circuitState: inbox.circuitState,
      consecutiveFailures: inbox.consecutiveFailures,
      lastError: inbox.lastError,
      lastSuccess: inbox.lastSuccess,
      totalSent: inbox.totalSent,
      totalBounced: inbox.totalBounced,
      avgLatencyMs: inbox.avgLatencyMs,
      bounceRate:
        inbox.totalSent > 0
          ? ((inbox.totalBounced / inbox.totalSent) * 100).toFixed(2) + '%'
          : '0%',
    }));

    return Response.json({ inboxes: statuses });
  }

  private async handleResetCircuit(request: Request): Promise<Response> {
    const { inboxId } = await request.json<{ inboxId: string }>();

    const inbox = this.inboxes.get(inboxId);
    if (!inbox) {
      return Response.json({ error: 'Inbox not found' }, { status: 404 });
    }

    inbox.circuitState = 'closed';
    inbox.circuitOpenedAt = null;
    inbox.consecutiveFailures = 0;
    inbox.healthy = true;
    inbox.lastError = null;

    await this.persist();

    return Response.json({ success: true });
  }

  private updateCircuitStates(): void {
    const now = Date.now();

    for (const inbox of this.inboxes.values()) {
      // Transition open circuits to half-open after timeout
      if (
        inbox.circuitState === 'open' &&
        inbox.circuitOpenedAt &&
        now - inbox.circuitOpenedAt >= CIRCUIT_RESET_MS
      ) {
        inbox.circuitState = 'half-open';
      }
    }
  }

  private calculateWeight(inbox: InboxHealth): number {
    let weight = 100;

    // Penalize high latency (0-50 points reduction)
    if (inbox.avgLatencyMs > 0) {
      const latencyPenalty = Math.min(50, inbox.avgLatencyMs / 100);
      weight -= latencyPenalty;
    }

    // Penalize bounces (0-30 points reduction)
    if (inbox.totalSent > 0) {
      const bounceRate = inbox.totalBounced / inbox.totalSent;
      weight -= bounceRate * 30;
    }

    // Bonus for recent success
    if (inbox.lastSuccess && Date.now() - inbox.lastSuccess < 5 * 60 * 1000) {
      weight += 10;
    }

    // Penalize half-open circuits
    if (inbox.circuitState === 'half-open') {
      weight -= 20;
    }

    return Math.max(0, weight);
  }

  private async persist(): Promise<void> {
    await this.state.storage.put('data', {
      inboxes: Object.fromEntries(this.inboxes),
      rrIndex: this.roundRobinIndex,
    });
  }

  private async handleClear(): Promise<Response> {
    const count = this.inboxes.size;
    this.inboxes.clear();
    this.roundRobinIndex = 0;
    await this.persist();
    return Response.json({ success: true, cleared: count });
  }

  private async handleRemove(request: Request): Promise<Response> {
    const { inboxId } = await request.json<{ inboxId: string }>();

    if (!this.inboxes.has(inboxId)) {
      return Response.json({ error: 'Inbox not found' }, { status: 404 });
    }

    this.inboxes.delete(inboxId);
    await this.persist();
    return Response.json({ success: true, removed: inboxId });
  }
}
