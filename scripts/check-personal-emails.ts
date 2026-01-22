import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function check() {
  const { data: prospects } = await supabase
    .from("prospects")
    .select("name, email, stage, score, source, contact_name")
    .in("stage", ["new", "researching", "enriched", "ready"])
    .eq("archived", false)
    .not("email", "is", null);

  const personalNameEmails: typeof prospects = [];

  for (const p of prospects || []) {
    const email = p.email || "";
    const prefix = email.split("@")[0].toLowerCase();

    // Look for firstname.lastname pattern
    if (prefix.includes(".") && prefix.length > 5) {
      const parts = prefix.split(".");
      // Check it looks like two name parts (not info.hotel etc)
      const genericStarts = [
        "info", "contact", "reserv", "recep", "book", "hotel",
        "front", "guest", "stay", "welcome", "hello", "spa",
        "event", "hr", "job", "career", "recruit", "sales"
      ];
      const isGeneric = genericStarts.some((g) => parts[0].startsWith(g));
      if (isGeneric === false && parts[0].length > 1 && parts[1].length > 1) {
        personalNameEmails.push(p);
      }
    }
  }

  console.log(`Found ${personalNameEmails.length} prospects with firstname.lastname emails:\n`);
  for (const p of personalNameEmails.slice(0, 30)) {
    console.log(`${p.stage} | ${p.score} | ${p.email} | ${p.contact_name || "?"}`);
  }
}

check().catch(console.error);
