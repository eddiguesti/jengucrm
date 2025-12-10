/**
 * RateLimiter Durable Object
 *
 * Token bucket rate limiter for AI APIs and external services.
 * Prevents hitting rate limits and manages quota across workers.
 *
 * IMPROVEMENT: Added per-provider tracking, cost estimation,
 * burst handling, and automatic backoff.
 */

interface ProviderLimits {
  tokensPerMinute: number;
  requestsPerMinute: number;
  tokensPerDay: number;
  costPerToken: number; // USD per 1M tokens
}

interface ProviderState {
  name: string;
  limits: ProviderLimits;
  tokensUsedThisMinute: number;
  requestsThisMinute: number;
  tokensUsedToday: number;
  costToday: number;
  lastMinuteReset: number;
  lastDayReset: string;
  backoffUntil: number | null;
  consecutiveRateLimits: number;
}

// Default provider limits
const DEFAULT_LIMITS: Record<string, ProviderLimits> = {
  grok: {
    tokensPerMinute: 100000,
    requestsPerMinute: 60,
    tokensPerDay: 1000000,
    costPerToken: 5, // $5 per 1M input tokens (estimated)
  },
  claude: {
    tokensPerMinute: 80000,
    requestsPerMinute: 50,
    tokensPerDay: 500000,
    costPerToken: 15, // $15 per 1M input tokens
  },
  openai: {
    tokensPerMinute: 90000,
    requestsPerMinute: 60,
    tokensPerDay: 1000000,
    costPerToken: 10, // $10 per 1M input tokens (GPT-4)
  },
  hunter: {
    tokensPerMinute: 100, // requests, not tokens
    requestsPerMinute: 100,
    tokensPerDay: 500,
    costPerToken: 0,
  },
  apollo: {
    tokensPerMinute: 100,
    requestsPerMinute: 100,
    tokensPerDay: 1000,
    costPerToken: 0,
  },
  millionverifier: {
    tokensPerMinute: 100,
    requestsPerMinute: 100,
    tokensPerDay: 10000,
    costPerToken: 0,
  },
};

// Daily budget cap (USD)
const DAILY_BUDGET_CAP = 10;

export class RateLimiter implements DurableObject {
  private state: DurableObjectState;
  private providers: Map<string, ProviderState> = new Map();
  private initialized = false;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  private async initialize() {
    if (this.initialized) return;

    const stored = await this.state.storage.get<Record<string, ProviderState>>('providers');
    if (stored) {
      this.providers = new Map(Object.entries(stored));
    }

    // Initialize default providers if not present
    for (const [name, limits] of Object.entries(DEFAULT_LIMITS)) {
      if (!this.providers.has(name)) {
        this.providers.set(name, {
          name,
          limits,
          tokensUsedThisMinute: 0,
          requestsThisMinute: 0,
          tokensUsedToday: 0,
          costToday: 0,
          lastMinuteReset: Date.now(),
          lastDayReset: new Date().toISOString().split('T')[0],
          backoffUntil: null,
          consecutiveRateLimits: 0,
        });
      }
    }

    this.initialized = true;
  }

  async fetch(request: Request): Promise<Response> {
    await this.initialize();

    const url = new URL(request.url);

    try {
      switch (url.pathname) {
        case '/check':
          return this.handleCheck(request);

        case '/consume':
          return this.handleConsume(request);

        case '/rate-limited':
          return this.handleRateLimited(request);

        case '/status':
          return this.handleStatus();

        case '/reset':
          return this.handleReset(request);

        case '/set-limits':
          return this.handleSetLimits(request);

        default:
          return new Response('Not Found', { status: 404 });
      }
    } catch (error) {
      console.error('RateLimiter error:', error);
      return new Response(JSON.stringify({ error: String(error) }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  private async handleCheck(request: Request): Promise<Response> {
    const { provider, tokens = 1000 } = await request.json<{
      provider: string;
      tokens?: number;
    }>();

    const state = this.providers.get(provider);
    if (!state) {
      return Response.json({ error: 'Unknown provider' }, { status: 404 });
    }

    this.resetIfNeeded(state);

    // Check backoff
    if (state.backoffUntil && Date.now() < state.backoffUntil) {
      return Response.json({
        allowed: false,
        reason: 'backoff',
        retryAfter: Math.ceil((state.backoffUntil - Date.now()) / 1000),
      });
    }

    // Check minute limits
    if (state.tokensUsedThisMinute + tokens > state.limits.tokensPerMinute) {
      return Response.json({
        allowed: false,
        reason: 'minute_token_limit',
        retryAfter: Math.ceil((60000 - (Date.now() - state.lastMinuteReset)) / 1000),
      });
    }

    if (state.requestsThisMinute >= state.limits.requestsPerMinute) {
      return Response.json({
        allowed: false,
        reason: 'minute_request_limit',
        retryAfter: Math.ceil((60000 - (Date.now() - state.lastMinuteReset)) / 1000),
      });
    }

    // Check daily limits
    if (state.tokensUsedToday + tokens > state.limits.tokensPerDay) {
      return Response.json({
        allowed: false,
        reason: 'daily_token_limit',
        retryAfter: this.getSecondsUntilMidnight(),
      });
    }

    // Check budget
    const estimatedCost = (tokens / 1000000) * state.limits.costPerToken;
    const totalCostToday = [...this.providers.values()].reduce(
      (sum, p) => sum + p.costToday,
      0
    );

    if (totalCostToday + estimatedCost > DAILY_BUDGET_CAP) {
      return Response.json({
        allowed: false,
        reason: 'daily_budget_limit',
        retryAfter: this.getSecondsUntilMidnight(),
        costToday: totalCostToday,
        budget: DAILY_BUDGET_CAP,
      });
    }

    return Response.json({
      allowed: true,
      tokensRemaining: state.limits.tokensPerMinute - state.tokensUsedThisMinute,
      requestsRemaining: state.limits.requestsPerMinute - state.requestsThisMinute,
      dailyTokensRemaining: state.limits.tokensPerDay - state.tokensUsedToday,
      budgetRemaining: DAILY_BUDGET_CAP - totalCostToday,
    });
  }

  private async handleConsume(request: Request): Promise<Response> {
    const { provider, tokens, cost } = await request.json<{
      provider: string;
      tokens: number;
      cost?: number;
    }>();

    const state = this.providers.get(provider);
    if (!state) {
      return Response.json({ error: 'Unknown provider' }, { status: 404 });
    }

    this.resetIfNeeded(state);

    state.tokensUsedThisMinute += tokens;
    state.requestsThisMinute++;
    state.tokensUsedToday += tokens;

    // Calculate cost
    const actualCost = cost ?? (tokens / 1000000) * state.limits.costPerToken;
    state.costToday += actualCost;

    // Reset consecutive rate limits on success
    state.consecutiveRateLimits = 0;
    state.backoffUntil = null;

    await this.persist();

    return Response.json({
      tokensUsed: state.tokensUsedThisMinute,
      requestsUsed: state.requestsThisMinute,
      dailyTokensUsed: state.tokensUsedToday,
      costToday: state.costToday,
    });
  }

  private async handleRateLimited(request: Request): Promise<Response> {
    const { provider, retryAfter } = await request.json<{
      provider: string;
      retryAfter?: number;
    }>();

    const state = this.providers.get(provider);
    if (!state) {
      return Response.json({ error: 'Unknown provider' }, { status: 404 });
    }

    state.consecutiveRateLimits++;

    // Exponential backoff: 30s, 60s, 120s, 240s, 300s max
    const backoffSeconds = Math.min(
      30 * Math.pow(2, state.consecutiveRateLimits - 1),
      300
    );

    state.backoffUntil = Date.now() + (retryAfter ?? backoffSeconds) * 1000;

    await this.persist();

    return Response.json({
      backoffUntil: state.backoffUntil,
      consecutiveRateLimits: state.consecutiveRateLimits,
      backoffSeconds: retryAfter ?? backoffSeconds,
    });
  }

  private handleStatus(): Response {
    const statuses = [...this.providers.values()].map((state) => {
      this.resetIfNeeded(state);

      return {
        provider: state.name,
        tokensUsedThisMinute: state.tokensUsedThisMinute,
        tokensPerMinute: state.limits.tokensPerMinute,
        requestsThisMinute: state.requestsThisMinute,
        requestsPerMinute: state.limits.requestsPerMinute,
        tokensUsedToday: state.tokensUsedToday,
        tokensPerDay: state.limits.tokensPerDay,
        costToday: state.costToday.toFixed(4),
        backoffUntil: state.backoffUntil,
        consecutiveRateLimits: state.consecutiveRateLimits,
        minuteUtilization: `${((state.tokensUsedThisMinute / state.limits.tokensPerMinute) * 100).toFixed(1)}%`,
        dailyUtilization: `${((state.tokensUsedToday / state.limits.tokensPerDay) * 100).toFixed(1)}%`,
      };
    });

    const totalCostToday = [...this.providers.values()].reduce(
      (sum, p) => sum + p.costToday,
      0
    );

    return Response.json({
      providers: statuses,
      summary: {
        totalCostToday: totalCostToday.toFixed(4),
        budgetRemaining: (DAILY_BUDGET_CAP - totalCostToday).toFixed(4),
        budgetUtilization: `${((totalCostToday / DAILY_BUDGET_CAP) * 100).toFixed(1)}%`,
      },
    });
  }

  private async handleReset(request: Request): Promise<Response> {
    const { provider } = await request.json<{ provider?: string }>();

    if (provider) {
      const state = this.providers.get(provider);
      if (state) {
        state.tokensUsedThisMinute = 0;
        state.requestsThisMinute = 0;
        state.lastMinuteReset = Date.now();
        state.backoffUntil = null;
        state.consecutiveRateLimits = 0;
      }
    } else {
      // Reset all
      for (const state of this.providers.values()) {
        state.tokensUsedThisMinute = 0;
        state.requestsThisMinute = 0;
        state.lastMinuteReset = Date.now();
        state.backoffUntil = null;
        state.consecutiveRateLimits = 0;
      }
    }

    await this.persist();

    return Response.json({ success: true });
  }

  private async handleSetLimits(request: Request): Promise<Response> {
    const { provider, limits } = await request.json<{
      provider: string;
      limits: Partial<ProviderLimits>;
    }>();

    const state = this.providers.get(provider);
    if (!state) {
      return Response.json({ error: 'Unknown provider' }, { status: 404 });
    }

    state.limits = { ...state.limits, ...limits };

    await this.persist();

    return Response.json({ success: true, limits: state.limits });
  }

  private resetIfNeeded(state: ProviderState): void {
    const now = Date.now();
    const today = new Date().toISOString().split('T')[0];

    // Reset minute counters
    if (now - state.lastMinuteReset >= 60000) {
      state.tokensUsedThisMinute = 0;
      state.requestsThisMinute = 0;
      state.lastMinuteReset = now;
    }

    // Reset daily counters
    if (state.lastDayReset !== today) {
      state.tokensUsedToday = 0;
      state.costToday = 0;
      state.lastDayReset = today;
    }
  }

  private getSecondsUntilMidnight(): number {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setUTCHours(24, 0, 0, 0);
    return Math.floor((midnight.getTime() - now.getTime()) / 1000);
  }

  private async persist(): Promise<void> {
    await this.state.storage.put('providers', Object.fromEntries(this.providers));
  }
}
