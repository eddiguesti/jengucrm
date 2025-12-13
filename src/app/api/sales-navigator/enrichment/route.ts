import { NextRequest } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { success, errors } from '@/lib/api-response';
import { logger } from '@/lib/logger';
import { getDomainPattern, applyPattern } from '@/lib/email/finder/domain-analyzer';
import { validateEmail } from '@/lib/email/verification';
import { researchHotel, findHotelEmails } from '@/lib/hotel-research';
import { millionVerifierVerify } from '@/lib/email/finder/services';
import { scrapeWebsite, extractDomain } from '@/lib/enrichment';
import { findOfficialWebsite, isExcludedWebsite, verifyAccommodationWebsite } from '@/lib/enrichment/official-website';
import { isChainHotel } from '@/lib/constants';

interface EnrichmentJob {
  id: string;
  prospect_id: string;
  prospect_name: string;
  company: string;
  firstname: string;
  lastname: string;
  linkedin_url: string | null;
  status: string;
  email_found: string | null;
  email_verified: boolean;
  research_done: boolean;
  error: string | null;
  created_at: string;
}

function normalizeWebsiteUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return url.href;
  } catch {
    return null;
  }
}

function extractDomainLoose(url: string | null): string | null {
  const normalized = url ? normalizeWebsiteUrl(url) : null;
  if (!normalized) return null;
  try {
    const u = new URL(normalized);
    return u.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

function normalizeToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * GET /api/sales-navigator/enrichment
 * Get enrichment queue
 */
export async function GET() {
  const supabase = createServerClient();

  try {
    const { data: jobs } = await supabase
      .from('sales_nav_enrichment_queue')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    return success({ jobs: jobs || [] });
  } catch (error) {
    logger.error({ error }, 'Failed to get enrichment queue');
    return errors.internal('Failed to get queue', error);
  }
}

/**
 * POST /api/sales-navigator/enrichment
 * Process enrichment queue
 */
export async function POST(request: NextRequest) {
  const supabase = createServerClient();

  try {
    const { action, limit = 5, includeResearch = false } = await request.json();

    if (action !== 'start') {
      return errors.badRequest('Invalid action');
    }

    // Get pending jobs (include prospect location/website for higher email hit-rate)
    const { data: pendingJobs } = await supabase
      .from('sales_nav_enrichment_queue')
      .select('*, prospects!inner(id, name, website, city, country, email, contact_title, tags)')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(limit);

    if (!pendingJobs || pendingJobs.length === 0) {
      return success({ message: 'No pending jobs', processed: 0 });
    }

    logger.info({ count: pendingJobs.length }, 'Starting enrichment processing');

    let processed = 0;
    let succeeded = 0;
    let failed = 0;

    for (const job of pendingJobs as Array<EnrichmentJob & { prospects: { id: string; name: string; website: string | null; city: string | null; country: string | null; email: string | null; contact_title: string | null; tags: string[] | null } }>) {
      try {
        // Claim job (prevents double-processing if multiple runners)
        const { data: claimed } = await supabase
          .from('sales_nav_enrichment_queue')
          .update({ status: 'finding_website', error: null })
          .eq('id', job.id)
          .eq('status', 'pending')
          .select('id');

        if (!claimed || claimed.length === 0) {
          continue;
        }

        processed++;

        const prospect = job.prospects;
        const location = prospect.city || prospect.country || undefined;
        const jobCompany = (job.company || '').trim();
        const companyName =
          jobCompany && !/^(unknown|n\/a|na|null|undefined|-)$/i.test(jobCompany)
            ? jobCompany
            : prospect.name;

        // Hard filter: skip big chains (saves money and avoids wrong targets)
        if (isChainHotel(companyName)) {
          const nextTags = [...new Set([...(prospect.tags || []), 'filtered-chain'])];
          await supabase
            .from('prospects')
            .update({
              archived: true,
              tags: nextTags,
            })
            .eq('id', job.prospect_id);

          await supabase
            .from('sales_nav_enrichment_queue')
            .update({ status: 'failed', error: 'Filtered: chain hotel' })
            .eq('id', job.id);

          failed++;
          continue;
        }

        // Dedupe by LinkedIn URL (keep the best record; avoids paying twice for the same lead)
        if (job.linkedin_url) {
          const { data: linkedInPeers } = await supabase
            .from('prospects')
            .select('id, email, contact_title, created_at')
            .eq('source', 'sales_navigator')
            .eq('archived', false)
            .eq('linkedin_url', job.linkedin_url)
            .neq('id', job.prospect_id)
            .limit(5);

          const peers = (linkedInPeers || []) as Array<{ id: string; email: string | null; contact_title: string | null; created_at: string }>;
          if (peers.length > 0) {
            const score = (p: { email: string | null; contact_title: string | null }) =>
              (p.email ? 10 : 0) +
              (p.contact_title
                ? (/\b(ceo|coo|cfo|chief|president|owner|founder)\b/i.test(p.contact_title)
                    ? 40
                    : /\b(general\s*manager|gm|managing\s*director|director)\b/i.test(p.contact_title)
                      ? 30
                      : 0)
                : 0);

            const currentScore = score({ email: prospect.email, contact_title: prospect.contact_title });
            const bestPeer = peers
              .slice()
              .sort((a, b) => {
                const diff = score(b) - score(a);
                if (diff !== 0) return diff;
                return String(a.created_at || '').localeCompare(String(b.created_at || ''));
              })[0];

            if (bestPeer && score(bestPeer) > currentScore) {
              const nextTags = [...new Set([...(prospect.tags || []), 'duplicate-linkedin'])];
              await supabase
                .from('prospects')
                .update({ archived: true, tags: nextTags })
                .eq('id', job.prospect_id);

              await supabase
                .from('sales_nav_enrichment_queue')
                .update({ status: 'failed', error: 'Duplicate lead (linkedin_url)' })
                .eq('id', job.id);

              failed++;
              continue;
            }
          }
        }

        // Step 0: Find and verify the official website (highest-precision anchor)
        let website = prospect.website;
        if (website) {
          const normalized = normalizeWebsiteUrl(website);
          const excluded = !normalized || isExcludedWebsite(normalized);
          if (excluded) {
            website = null;
          } else {
            const ok = await verifyAccommodationWebsite(normalized);
            website = ok ? normalized : null;
          }
        }

        if (!website) {
          const websiteResult = await findOfficialWebsite(companyName, location || null);
          if (websiteResult.website) {
            website = websiteResult.website;
            await supabase
              .from('prospects')
              .update({ website })
              .eq('id', job.prospect_id);
          }
        }

        if (!website) {
          await supabase
            .from('sales_nav_enrichment_queue')
            .update({
              status: 'failed',
              email_found: null,
              email_verified: false,
              research_done: false,
              error: 'No official hotel/resort/campsite website found',
            })
            .eq('id', job.id);

          const nextTags = [...new Set([...(prospect.tags || []), 'filtered-non-hospitality'])];
          await supabase
            .from('prospects')
            .update({
              archived: true,
              tags: nextTags,
            })
            .eq('id', job.prospect_id);

          failed++;
          continue;
        }

        // Normalize for downstream fetches and domain extraction
        const normalizedWebsite = normalizeWebsiteUrl(website);
        if (!normalizedWebsite) {
          await supabase
            .from('sales_nav_enrichment_queue')
            .update({ status: 'failed', error: 'Invalid website URL' })
            .eq('id', job.id);
          failed++;
          continue;
        }
        website = normalizedWebsite;
        if (prospect.website !== website) {
          await supabase.from('prospects').update({ website }).eq('id', job.prospect_id);
        }

        // Prefer web-search-backed discovery (Grok search). Fallback to pattern guessing.
        let email: string | null = null;
        let contactName: string | null = null;
        let contactTitle: string | null = null;

        let verified = false;

        // Step 1: Find candidate emails (scrape official site first, then Grok web-search)
        await supabase
          .from('sales_nav_enrichment_queue')
          .update({ status: 'finding_email' })
          .eq('id', job.id);

        const scraped = await scrapeWebsite(website).catch(() => null);
        // If the scrape detects a major chain brand, archive and skip
        if (scraped?.propertyInfo?.chainBrand) {
          const nextTags = [...new Set([...(prospect.tags || []), 'filtered-chain'])];
          await supabase
            .from('prospects')
            .update({
              archived: true,
              tags: nextTags,
            })
            .eq('id', job.prospect_id);

          await supabase
            .from('sales_nav_enrichment_queue')
            .update({ status: 'failed', error: `Filtered: chain (${scraped.propertyInfo.chainBrand})` })
            .eq('id', job.id);

          failed++;
          continue;
        }

        const scrapedEmails = scraped?.emails || [];
        const scrapedDomains = new Set(
          scrapedEmails
            .map((e) => e.split('@')[1]?.toLowerCase())
            .filter((d): d is string => !!d)
        );

        const websiteDomain = extractDomain(website)?.toLowerCase() || null;
        if (websiteDomain) scrapedDomains.add(websiteDomain);

        // Dedupe by website domain: keep the best record, archive the rest.
        // This avoids paying to enrich multiple contacts for the same property.
        if (websiteDomain) {
          const { data: existingSameWebsite } = await supabase
            .from('prospects')
            .select('id, email, contact_title, created_at, tags, website')
            .eq('source', 'sales_navigator')
            .eq('archived', false)
            .ilike('website', `%${websiteDomain}%`)
            .limit(25);

          type WebsitePeer = {
            id: string;
            email: string | null;
            contact_title: string | null;
            created_at: string;
          };

          const peers = (existingSameWebsite || [])
            .filter((p: { id: string; website?: string | null }) => {
              if (p.id === job.prospect_id) return false;
              const domain = extractDomainLoose(p.website || null);
              return domain === websiteDomain;
            }) as WebsitePeer[];
          if (peers.length > 0) {
            const score = (p: { email: string | null; contact_title: string | null }) =>
              (p.email ? 10 : 0) +
              (p.contact_title
                ? (/\b(ceo|coo|cfo|chief|president|owner|founder)\b/i.test(p.contact_title)
                    ? 40
                    : /\b(general\s*manager|gm|managing\s*director|director)\b/i.test(p.contact_title)
                      ? 30
                      : 0)
                : 0);

            const currentScore = score({ email: prospect.email, contact_title: prospect.contact_title });
            const bestPeer = peers
              .slice()
              .sort((a, b) => {
                const diff = score(b) - score(a);
                if (diff !== 0) return diff;
                return String(a.created_at || '').localeCompare(String(b.created_at || ''));
              })[0];

            if (bestPeer && score(bestPeer) > currentScore) {
              const nextTags = [...new Set([...(prospect.tags || []), 'duplicate-website'])];
              await supabase
                .from('prospects')
                .update({ archived: true, tags: nextTags })
                .eq('id', job.prospect_id);
              await supabase
                .from('sales_nav_enrichment_queue')
                .update({ status: 'failed', error: 'Duplicate property (website domain)' })
                .eq('id', job.id);
              failed++;
              continue;
            }
          }
        }

        const leadFirst = normalizeToken(job.firstname || '');
        const leadLast = normalizeToken(job.lastname || '');
        const leadHasName = leadFirst.length >= 3 && leadLast.length >= 3;

        const emailResult = await findHotelEmails(
          companyName,
          website,
          location,
          leadHasName ? { name: job.prospect_name || undefined } : undefined
        );

        type Candidate = { email: string; source: 'scrape' | 'grok_contact' | 'grok_general' | 'grok_reservations' | 'pattern'; name?: string | null; title?: string | null };

        const candidates: Candidate[] = [
          ...scrapedEmails.map((e) => ({ email: e, source: 'scrape' as const })),
          ...(emailResult.contactEmails || []).map((c) => ({
            email: c.email,
            source: 'grok_contact' as const,
            name: c.name || null,
            title: c.title || null,
          })),
          ...(emailResult.generalEmail ? [{ email: emailResult.generalEmail, source: 'grok_general' as const }] : []),
          ...(emailResult.reservationsEmail ? [{ email: emailResult.reservationsEmail, source: 'grok_reservations' as const }] : []),
        ]
          .map((c) => ({ ...c, email: c.email.trim().toLowerCase() }))
          .filter((c) => c.email.includes('@'));

        // Pattern guessing (only on official/scraped domains)
        if (websiteDomain) {
          const pattern = await getDomainPattern(websiteDomain, { skipHunter: true });
          if (pattern && pattern.pattern !== 'unknown') {
            const guessed = applyPattern(pattern.pattern, job.firstname, job.lastname, websiteDomain);
            candidates.push({ email: guessed.toLowerCase(), source: 'pattern' });
          }
        }

        // Only accept emails that match the official website domain (or any scraped email domain)
        const domainAllowed = (e: string) => {
          const domain = e.split('@')[1]?.toLowerCase();
          if (!domain) return false;
          return scrapedDomains.has(domain);
        };

        const uniqueCandidates: Candidate[] = [];
        const seenEmails = new Set<string>();
        for (const c of candidates) {
          if (!domainAllowed(c.email)) continue;
          if (seenEmails.has(c.email)) continue;
          seenEmails.add(c.email);
          uniqueCandidates.push(c);
        }

        const isRoleEmail = (e: string) => {
          const local = e.split('@')[0] || '';
          return /^(info|contact|hello|hi|reservations|reception|booking|bookings|support|sales|admin|office|enquiries|enquiry|mail|email|help|team|general|press|media|marketing|hr|jobs|careers|events|feedback|webmaster|privacy|legal|billing|accounts|finance|service|services|customerservice|guest|guestservices|frontdesk|concierge)@/i.test(local);
        };

        const matchLead = (c: Candidate): 0 | 1 | 2 => {
          if (!leadHasName) return 0;
          const local = normalizeToken(c.email.split('@')[0] || '');
          const name = normalizeToken(c.name || '');
          const hasFirst = (local.includes(leadFirst) || name.includes(leadFirst));
          const hasLast = (local.includes(leadLast) || name.includes(leadLast));
          if (hasFirst && hasLast) return 2;
          if (hasFirst || hasLast) return 1;
          return 0;
        };

        const scoreCandidate = (c: Candidate): number => {
          const base =
            c.source === 'scrape' ? 100 :
            c.source === 'grok_contact' ? 80 :
            c.source === 'grok_general' ? 55 :
            c.source === 'grok_reservations' ? 45 :
            35;
          const rolePenalty = isRoleEmail(c.email) ? 40 : 0;
          const hasPerson = c.name ? 5 : 0;
          const domainBoost = websiteDomain && c.email.endsWith(`@${websiteDomain}`) ? 20 : 0;
          const leadMatch = matchLead(c);
          const leadBoost = leadHasName ? (leadMatch === 2 ? 50 : leadMatch === 1 ? 25 : -25) : 0;
          return base + domainBoost + hasPerson + leadBoost - rolePenalty;
        };

        const ranked = uniqueCandidates
          .map((c) => ({ ...c, score: scoreCandidate(c) }))
          .sort((a, b) => b.score - a.score)
          .slice(0, 5);

        // Step 2: Verify a small number of top candidates (precision > recall)
        await supabase
          .from('sales_nav_enrichment_queue')
          .update({ status: 'verifying' })
          .eq('id', job.id);

        const mvKeyPresent = !!process.env.MILLIONVERIFIER_API_KEY;

        for (const candidate of ranked) {
          const role = isRoleEmail(candidate.email);
          if (leadHasName && matchLead(candidate) === 0) continue;

          if (mvKeyPresent) {
            const mv = await millionVerifierVerify(candidate.email);
            if (!mv) continue;
            if (mv.result === 'invalid' || mv.result === 'disposable') continue;
            if (mv.result !== 'ok' && mv.result !== 'catch_all') continue; // be strict on unknown/timeouts

            if (!mv.role && !role) {
              email = candidate.email;
              contactName = candidate.name || null;
              contactTitle = candidate.title || null;
              verified = true;
              break;
            }
          } else {
            const validation = await validateEmail(candidate.email);
            if (!validation.isValid) continue;
            if (!validation.checks.notRoleBased && role) continue;
            email = validation.email;
            contactName = candidate.name || null;
            contactTitle = candidate.title || null;
            verified = validation.confidence === 'high' || validation.confidence === 'medium';
            break;
          }
        }

        await supabase
          .from('sales_nav_enrichment_queue')
          .update({ email_found: email, email_verified: verified })
          .eq('id', job.id);

        if (email) {
          await supabase
            .from('prospects')
            .update({
              email: email,
              contact_name: contactName,
              contact_title: contactTitle,
              score: verified ? 50 : 35,
            })
            .eq('id', job.prospect_id);
        }

        let researchDone = false;
        if (includeResearch) {
          // Step 3: Research (optional; slower)
          await supabase
            .from('sales_nav_enrichment_queue')
            .update({ status: 'researching' })
            .eq('id', job.id);

          try {
            const research = await researchHotel(companyName);

            if (research && research.confidence > 0.3) {
              await supabase
                .from('prospects')
                .update({
                  property_type: research.propertyType || 'hotel',
                  notes: `${research.researchSummary}\n\nRecommended angle: ${research.recommendedAngle}`,
                  score: (email ? 60 : 30) + Math.round(research.confidence * 20),
                })
                .eq('id', job.prospect_id);

              researchDone = true;
            }
          } catch (researchError) {
            logger.warn({ error: researchError, company: job.company }, 'Research failed');
          }
        }

        // Mark as ready
        await supabase
          .from('sales_nav_enrichment_queue')
          .update({
            status: 'ready',
            email_found: email || null,
            email_verified: verified,
            research_done: researchDone,
            error: email ? null : (leadHasName ? 'No verified email for this lead found' : 'No verified personal email found'),
          })
          .eq('id', job.id);

        succeeded++;

        // If no personal email found, tag for manual review
        // Sales Navigator prospects should receive proper Jengu sales emails, not mystery shopper
        if (!email) {
          // Get current tags
          const { data: prospect } = await supabase
            .from('prospects')
            .select('tags, contact_name')
            .eq('id', job.prospect_id)
            .single();

          const currentTags = prospect?.tags || [];
          const newTags = currentTags.includes('needs-email')
            ? currentTags
            : [...currentTags, 'needs-email'];

          // Update tags to mark as needing email
          const updateData: Record<string, unknown> = {
            tags: newTags,
          };

          // If we have the contact name from the enrichment job, ensure it's saved
          if (job.prospect_name && !prospect?.contact_name) {
            updateData.contact_name = job.prospect_name;
          }

          await supabase
            .from('prospects')
            .update(updateData)
            .eq('id', job.prospect_id);

          logger.info({ prospectId: job.prospect_id, contactName: job.prospect_name }, 'Email not found - tagged for manual review');
        }

        // Log activity
        await supabase.from('activities').insert({
          prospect_id: job.prospect_id,
          type: 'note',
          title: 'Enrichment completed',
          description: email
            ? `Found email: ${email} - ready for Jengu outreach`
            : 'Personal email not found - needs manual email discovery',
        });

      } catch (err) {
        logger.error({ error: err, jobId: job.id }, 'Enrichment job failed');
        failed++;

        await supabase
          .from('sales_nav_enrichment_queue')
          .update({
            status: 'failed',
            error: String(err),
          })
          .eq('id', job.id);
      }
    }

    logger.info({ processed, succeeded, failed }, 'Enrichment batch completed');

    return success({
      success: true,
      processed,
      succeeded,
      failed,
    });
  } catch (error) {
    logger.error({ error }, 'Enrichment processing failed');
    return errors.internal('Enrichment failed', error);
  }
}

