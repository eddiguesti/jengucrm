/**
 * Enrich ITB leads: find company websites + personal emails
 *
 * Targets CEOs, Directors, Senior Managers from ITB leads CSV import.
 *
 * Run: npx tsx scripts/enrich-itb-leads.ts [--limit=50] [--dry-run]
 */

import { supabase } from "./lib/supabase";

const XAI_API_KEY = process.env.XAI_API_KEY;
const MILLIONVERIFIER_API_KEY = process.env.MILLIONVERIFIER_API_KEY;
const DRY_RUN = process.argv.includes("--dry-run");
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? parseInt(limitArg.split("=")[1]) : 50;

if (!XAI_API_KEY) { console.error("XAI_API_KEY not set"); process.exit(1); }
if (!MILLIONVERIFIER_API_KEY) { console.error("MILLIONVERIFIER_API_KEY not set"); process.exit(1); }

// ─── DuckDuckGo Search ───────────────────────────────────────────────────────

async function searchDDG(query: string): Promise<{ url: string; title: string }[]> {
  try {
    const res = await fetch(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      { headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" } }
    );
    if (!res.ok) return [];
    const html = await res.text();
    const results: { url: string; title: string }[] = [];
    const matches = html.matchAll(/<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>([^<]+)</gi);
    for (const m of matches) {
      let url = m[1];
      if (url.includes("uddg=")) {
        const u = url.match(/uddg=([^&]+)/);
        if (u) url = decodeURIComponent(u[1]);
      }
      const skip = /booking\.com|expedia|tripadvisor|linkedin|facebook|twitter|instagram|youtube|wikipedia|crunchbase|bloomberg/i;
      if (!skip.test(url) && url.startsWith("http")) {
        results.push({ url, title: m[2].trim() });
      }
      if (results.length >= 5) break;
    }
    return results;
  } catch {
    return [];
  }
}

// ─── Grok: pick best website ─────────────────────────────────────────────────

async function findWebsiteWithGrok(company: string, results: { url: string; title: string }[]): Promise<string | null> {
  if (results.length === 0) return null;
  try {
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${XAI_API_KEY}` },
      body: JSON.stringify({
        model: "grok-3-mini",
        messages: [{
          role: "user",
          content: `Which of these URLs is the official website for "${company}"?
${results.map((r, i) => `${i + 1}. ${r.url} - ${r.title}`).join("\n")}

Reply with ONLY the URL (no explanation). If none match, reply "none".`,
        }],
        max_tokens: 100,
        temperature: 0,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json() as { choices: { message: { content: string } }[] };
    const url = data.choices?.[0]?.message?.content?.trim();
    if (!url || url === "none" || !url.startsWith("http")) return null;
    return url;
  } catch {
    return null;
  }
}

// ─── MillionVerifier ─────────────────────────────────────────────────────────

async function verifyEmail(email: string): Promise<"ok" | "catch_all" | "invalid" | "unknown"> {
  try {
    const res = await fetch(
      `https://api.millionverifier.com/api/v3/?api=${MILLIONVERIFIER_API_KEY}&email=${encodeURIComponent(email)}&timeout=10`
    );
    if (!res.ok) return "unknown";
    const data = await res.json() as { result: string };
    return (data.result as "ok" | "catch_all" | "invalid" | "unknown") || "unknown";
  } catch {
    return "unknown";
  }
}

function generateEmailPatterns(firstName: string, lastName: string, domain: string): string[] {
  const f = firstName.toLowerCase().replace(/[^a-z]/g, "");
  const l = lastName.toLowerCase().replace(/[^a-z]/g, "");
  if (!f || !l || !domain) return [];
  return [
    `${f}.${l}@${domain}`,
    `${f}@${domain}`,
    `${f}${l}@${domain}`,
    `${f[0]}${l}@${domain}`,
    `${f}${l[0]}@${domain}`,
    `${f[0]}.${l}@${domain}`,
  ];
}

function extractDomain(url: string): string | null {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`=== ITB LEADS ENRICHMENT ${DRY_RUN ? "(DRY RUN)" : ""} | limit=${LIMIT} ===\n`);

  // Get ITB prospects needing enrichment (no email yet, not archived)
  const { data: prospects, error } = await supabase
    .from("prospects")
    .select("id, name, contact_name, source_job_title, website, email")
    .eq("source", "itb_leads")
    .eq("archived", false)
    .is("email", null)
    .in("stage", ["new", "researching"])
    .order("score", { ascending: false })
    .limit(LIMIT);

  if (error || !prospects) {
    console.error("Query error:", error);
    return;
  }

  console.log(`Found ${prospects.length} ITB prospects needing email enrichment\n`);

  let foundWebsite = 0;
  let foundEmail = 0;
  let noEmail = 0;

  for (const p of prospects) {
    // Extract company name from "Contact Name - Company" format
    const company = p.name.includes(" - ") ? p.name.split(" - ").slice(1).join(" - ") : p.name;
    const contactName = p.contact_name || "";
    const nameParts = contactName.trim().split(/\s+/);
    const firstName = nameParts[0] || "";
    const lastName = nameParts.slice(1).join(" ") || nameParts[0] || "";

    console.log(`\n--- ${contactName} @ ${company} ---`);
    console.log(`  Title: ${p.source_job_title}`);

    // Step 1: Find website if not already known
    let website = p.website;
    if (!website) {
      const results = await searchDDG(`${company} official website`);
      website = await findWebsiteWithGrok(company, results);
      if (website && !DRY_RUN) {
        await supabase.from("prospects").update({ website, stage: "researching" }).eq("id", p.id);
        foundWebsite++;
        console.log(`  ✓ Website: ${website}`);
      } else if (website) {
        console.log(`  [dry] Website: ${website}`);
      } else {
        console.log(`  ✗ No website found`);
        noEmail++;
        continue;
      }
    } else {
      console.log(`  Website: ${website} (existing)`);
    }

    const domain = extractDomain(website);
    if (!domain) {
      console.log(`  ✗ Could not extract domain`);
      noEmail++;
      continue;
    }

    // Step 2: Try email patterns
    const patterns = generateEmailPatterns(firstName, lastName, domain);
    console.log(`  Testing ${patterns.length} email patterns for ${firstName} ${lastName}@${domain}...`);

    let verified: string | null = null;
    for (const email of patterns) {
      const result = await verifyEmail(email);
      console.log(`    ${email} - ${result}`);
      if (result === "ok") {
        verified = email;
        break;
      }
    }

    if (verified && !DRY_RUN) {
      await supabase.from("prospects").update({ email: verified, stage: "enriched" }).eq("id", p.id);
      foundEmail++;
      console.log(`  ✓ FOUND: ${verified}`);
    } else if (!verified) {
      noEmail++;
      console.log(`  ✗ No verified email found`);
    }

    // Small delay to avoid rate limiting
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`\n=== RESULTS ===`);
  console.log(`  Websites found: ${foundWebsite}`);
  console.log(`  Emails found:   ${foundEmail}`);
  console.log(`  No email:       ${noEmail}`);
  console.log(`\nRun again to process more prospects.`);
}

main().catch(console.error);
