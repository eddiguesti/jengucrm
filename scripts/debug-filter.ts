import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import {
  GENERIC_EMAIL_PREFIXES,
  isBusinessHours,
} from "../src/lib/constants";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function check() {
  const { data: prospects } = await supabase
    .from("prospects")
    .select("id, email, stage, country")
    .in("stage", ["new", "researching", "enriched", "ready"])
    .eq("archived", false)
    .not("email", "is", null)
    .limit(2000);

  const prospectIds = (prospects || []).map((p) => p.id);
  const { data: existingEmails } = await supabase
    .from("emails")
    .select("prospect_id")
    .in("prospect_id", prospectIds)
    .eq("direction", "outbound");

  const emailedIds = new Set((existingEmails || []).map((e) => e.prospect_id));

  let alreadyEmailed = 0;
  let genericPrefix = 0;
  let outsideHours = 0;
  let passed = 0;

  const passedProspects: typeof prospects = [];

  for (const p of prospects || []) {
    if (emailedIds.has(p.id)) {
      alreadyEmailed++;
      continue;
    }
    if (GENERIC_EMAIL_PREFIXES.some((pattern) => pattern.test(p.email))) {
      genericPrefix++;
      continue;
    }
    if (p.country && isBusinessHours(p.country) === false) {
      outsideHours++;
      continue;
    }
    passed++;
    passedProspects.push(p);
  }

  console.log("Filter results (FULL patterns):");
  console.log("  Total:", prospects?.length);
  console.log("  Already emailed:", alreadyEmailed);
  console.log("  Generic prefix:", genericPrefix);
  console.log("  Outside hours:", outsideHours);
  console.log("  Passed:", passed);

  console.log("\nProspects that PASSED all filters:");
  for (const p of passedProspects.slice(0, 20)) {
    console.log("  " + p.email + " | " + (p.country || "no country"));
  }

  // Test specific
  const testEmail = "laurent.demoulin@ritzcarlton.com";
  const isGeneric = GENERIC_EMAIL_PREFIXES.some((pattern) =>
    pattern.test(testEmail)
  );
  console.log("\nTest laurent.demoulin@ritzcarlton.com:");
  console.log("  Is generic?", isGeneric);
  console.log("  Business hours Morocco?", isBusinessHours("Morocco"));
}

check().catch(console.error);
