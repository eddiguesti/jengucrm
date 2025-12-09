import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { FAKE_EMAIL_PATTERNS, GENERIC_CORPORATE_EMAILS, GENERIC_EMAIL_PREFIXES, isBusinessHours } from "../src/lib/constants";
dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

async function simulate() {
  const minScore = 0;
  const maxEmails = 5;

  // 1. Query prospects (same as auto-email)
  const { data: prospects } = await supabase
    .from("prospects")
    .select("id, name, email, city, country, property_type, source, contact_name, score, tier")
    .in("stage", ["new", "researching"])
    .eq("archived", false)
    .not("email", "is", null)
    .gte("score", minScore)
    .order("score", { ascending: false })
    .limit(maxEmails * 100); // Fixed: increased multiplier

  console.log("Step 1: Fetched " + (prospects?.length || 0) + " prospects");

  // 2. Get already emailed
  const prospectIds = (prospects || []).map(p => p.id);
  const { data: existingEmails } = await supabase
    .from("emails")
    .select("prospect_id")
    .in("prospect_id", prospectIds)
    .eq("direction", "outbound");

  const emailedIds = new Set((existingEmails || []).map(e => e.prospect_id));
  console.log("Step 2: Found " + emailedIds.size + " already emailed");

  // 3. Filter
  const filtered = {
    alreadyEmailed: 0,
    noEmail: 0,
    fake: 0,
    genericCorp: 0,
    genericPrefix: 0,
    outsideHours: 0,
    passed: 0,
  };

  const eligible: typeof prospects = [];

  for (const p of prospects || []) {
    if (emailedIds.has(p.id)) { filtered.alreadyEmailed++; continue; }
    if (p.email === null || p.email === undefined) { filtered.noEmail++; continue; }
    if (FAKE_EMAIL_PATTERNS.some(pattern => pattern.test(p.email!))) { filtered.fake++; continue; }
    if (GENERIC_CORPORATE_EMAILS.some(pattern => pattern.test(p.email!))) { filtered.genericCorp++; continue; }
    if (GENERIC_EMAIL_PREFIXES.some(pattern => pattern.test(p.email!))) {
      filtered.genericPrefix++;
      continue;
    }
    // Timezone check
    const timezoneAwareSending = process.env.TIMEZONE_AWARE_SENDING !== "false";
    if (timezoneAwareSending && p.country && isBusinessHours(p.country) === false) {
      filtered.outsideHours++;
      continue;
    }
    filtered.passed++;
    eligible.push(p);
  }

  console.log("\nStep 3: Filtering results:");
  console.log("  Already emailed: " + filtered.alreadyEmailed);
  console.log("  No email: " + filtered.noEmail);
  console.log("  Fake email: " + filtered.fake);
  console.log("  Generic corp: " + filtered.genericCorp);
  console.log("  Generic prefix: " + filtered.genericPrefix);
  console.log("  Outside hours: " + filtered.outsideHours);
  console.log("  ✅ PASSED: " + filtered.passed);

  if (eligible.length > 0) {
    console.log("\nFirst 5 eligible:");
    for (const p of eligible.slice(0, 5)) {
      console.log("  " + p.email + " | " + p.country + " | score: " + p.score);
    }
  }
}

simulate().catch(console.error);
