/**
 * Enrichment SSE Streaming Endpoint
 * Provides real-time progress updates during enrichment
 */

import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'edge';

const CLOUDFLARE_WORKER_URL = 'https://jengu-crm.edd-181.workers.dev';

interface EnrichmentProgress {
  isRunning: boolean;
  type: 'websites' | 'emails' | 'auto' | null;
  processed: number;
  total: number;
  found: number;
  startedAt: string | null;
  lastUpdatedAt: string | null;
}

async function fetchProgress(): Promise<EnrichmentProgress> {
  try {
    const response = await fetch(`${CLOUDFLARE_WORKER_URL}/enrich/progress`, {
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    });

    if (response.ok) {
      return await response.json();
    }
  } catch (error) {
    console.error('Error fetching progress:', error);
  }

  return {
    isRunning: false,
    type: null,
    processed: 0,
    total: 0,
    found: 0,
    startedAt: null,
    lastUpdatedAt: null,
  };
}

export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();

  // Create a readable stream for SSE
  const stream = new ReadableStream({
    async start(controller) {
      let consecutiveIdle = 0;
      const MAX_IDLE = 30; // Stop after 30 idle checks (~1 minute)
      const POLL_INTERVAL = 2000; // 2 seconds

      const sendEvent = (data: EnrichmentProgress) => {
        const message = `data: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(message));
      };

      // Send initial state
      const initial = await fetchProgress();
      sendEvent(initial);

      // If not running initially, just return the initial state
      if (!initial.isRunning) {
        controller.close();
        return;
      }

      // Poll for updates while running
      const poll = async () => {
        try {
          const progress = await fetchProgress();
          sendEvent(progress);

          if (!progress.isRunning) {
            consecutiveIdle++;
            if (consecutiveIdle >= 3) {
              // Send final state and close
              controller.close();
              return;
            }
          } else {
            consecutiveIdle = 0;
          }

          // Continue polling if not at max idle
          if (consecutiveIdle < MAX_IDLE) {
            setTimeout(poll, POLL_INTERVAL);
          } else {
            controller.close();
          }
        } catch (error) {
          console.error('SSE poll error:', error);
          // Send error event and close
          const errorMessage = `data: ${JSON.stringify({ error: 'Connection lost' })}\n\n`;
          controller.enqueue(encoder.encode(errorMessage));
          controller.close();
        }
      };

      // Start polling
      setTimeout(poll, POLL_INTERVAL);
    },

    cancel() {
      // Clean up when client disconnects
      console.log('SSE stream cancelled by client');
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  });
}
