/**
 * Email Finder API
 *
 * POST /api/find-email - Find email for a person
 * GET /api/find-email - Get finder status and quotas
 */

import { NextRequest } from 'next/server';
import { findEmail, findEmailsBatch, getConfiguredServices, getHunterQuota } from '@/lib/email/finder';
import { success, errors } from '@/lib/api-response';
import { logger } from '@/lib/logger';
import { z } from 'zod';

const findEmailSchema = z.object({
  // Name (at least one required)
  full_name: z.string().optional(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),

  // Domain (at least one required)
  domain: z.string().optional(),
  website: z.string().optional(),
  company_name: z.string().optional(),

  // Options
  verify_smtp: z.boolean().default(true),
  use_hunter: z.boolean().default(true),
  max_candidates: z.number().min(1).max(20).default(5),
  timeout: z.number().min(5000).max(30000).default(15000),
}).refine(
  data => data.full_name || data.first_name,
  { message: 'Either full_name or first_name is required' }
).refine(
  data => data.domain || data.website || data.company_name,
  { message: 'Either domain, website, or company_name is required' }
);

const batchFindSchema = z.object({
  prospects: z.array(z.object({
    full_name: z.string().optional(),
    first_name: z.string().optional(),
    last_name: z.string().optional(),
    domain: z.string().optional(),
    website: z.string().optional(),
  })).min(1).max(50),

  // Options (apply to all)
  verify_smtp: z.boolean().default(true),
  use_hunter: z.boolean().default(true),
  concurrency: z.number().min(1).max(5).default(2),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Check if batch request
    if ('prospects' in body) {
      const parsed = batchFindSchema.parse(body);

      const results = await findEmailsBatch(
        parsed.prospects.map(p => ({
          fullName: p.full_name,
          firstName: p.first_name,
          lastName: p.last_name,
          domain: p.domain,
          website: p.website,
        })),
        {
          verifySmtp: parsed.verify_smtp,
          useHunter: parsed.use_hunter,
          concurrency: parsed.concurrency,
        }
      );

      const found = results.filter(r => r.email !== null);
      const highConfidence = results.filter(r => r.confidence >= 80);

      return success({
        total: results.length,
        found: found.length,
        high_confidence: highConfidence.length,
        results: results.map((r, i) => ({
          input: parsed.prospects[i],
          ...r,
        })),
      });
    }

    // Single email find
    const parsed = findEmailSchema.parse(body);

    const result = await findEmail({
      fullName: parsed.full_name,
      firstName: parsed.first_name,
      lastName: parsed.last_name,
      domain: parsed.domain,
      website: parsed.website,
      companyName: parsed.company_name,
      verifySmtp: parsed.verify_smtp,
      useHunter: parsed.use_hunter,
      maxCandidates: parsed.max_candidates,
      timeout: parsed.timeout,
    });

    logger.info({
      name: parsed.full_name || `${parsed.first_name} ${parsed.last_name}`,
      domain: parsed.domain || parsed.website,
      email: result.email,
      confidence: result.confidence,
    }, 'Email finder request');

    return success(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errors.badRequest(`Validation error: ${error.issues.map(e => e.message).join(', ')}`);
    }
    logger.error({ error }, 'Email finder error');
    return errors.internal('Email finder failed', error);
  }
}

export async function GET() {
  try {
    const services = getConfiguredServices();
    const hunterQuota = await getHunterQuota();

    return success({
      status: 'operational',
      services: {
        hunter: {
          configured: services.includes('hunter'),
          quota: hunterQuota,
        },
        zerobounce: {
          configured: services.includes('zerobounce'),
        },
        smtp_verification: {
          available: true,
        },
        pattern_generation: {
          available: true,
          patterns_count: 35,
        },
      },
      capabilities: [
        'Pattern-based email generation (35+ patterns)',
        'Domain pattern learning and analysis',
        'SMTP mailbox verification',
        'Hunter.io integration',
        'Confidence scoring (0-100)',
        'Catch-all domain detection',
        'Batch processing (up to 50)',
      ],
      usage: {
        example_single: {
          method: 'POST',
          body: {
            first_name: 'John',
            last_name: 'Smith',
            domain: 'acme.com',
            verify_smtp: true,
          },
        },
        example_batch: {
          method: 'POST',
          body: {
            prospects: [
              { full_name: 'John Smith', domain: 'acme.com' },
              { first_name: 'Jane', last_name: 'Doe', website: 'example.com' },
            ],
            concurrency: 2,
          },
        },
      },
    });
  } catch (error) {
    logger.error({ error }, 'Email finder status error');
    return errors.internal('Failed to get email finder status', error);
  }
}
