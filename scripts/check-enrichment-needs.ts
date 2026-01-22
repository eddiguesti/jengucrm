import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function check() {
  // Check contacted prospects
  const { count: contactedCount } = await supabase
    .from("prospects")
    .select("*", { count: "exact", head: true })
    .eq("stage", "contacted");

  console.log(`Contacted prospects: ${contactedCount}`);

  // Total Sales Nav with contact name but no email
  const { count: totalNeedsEmail } = await supabase
    .from("prospects")
    .select("*", { count: "exact", head: true })
    .eq("source", "sales_navigator")
    .in("stage", ["new", "researching", "enriched"])
    .eq("archived", false)
    .not("contact_name", "is", null)
    .not("website", "is", null)
    .is("email", null);

  console.log(`Sales Nav with name+website but NO email: ${totalNeedsEmail}`);

  // Total Sales Nav with contact name and website (with or without email)
  const { count: hasWebsite } = await supabase
    .from("prospects")
    .select("*", { count: "exact", head: true })
    .eq("source", "sales_navigator")
    .in("stage", ["new", "researching", "enriched"])
    .eq("archived", false)
    .not("contact_name", "is", null)
    .not("website", "is", null);

  console.log(`Sales Nav with name+website (total): ${hasWebsite}`);

  // Sales Nav needing website enrichment
  const { count: needsWebsite } = await supabase
    .from("prospects")
    .select("*", { count: "exact", head: true })
    .eq("source", "sales_navigator")
    .in("stage", ["new", "researching", "enriched"])
    .eq("archived", false)
    .not("contact_name", "is", null)
    .is("website", null);

  console.log(`Sales Nav needing website enrichment: ${needsWebsite}`);

  // Sample some that need email
  const { data: samples } = await supabase
    .from("prospects")
    .select("name, contact_name, website")
    .eq("source", "sales_navigator")
    .in("stage", ["new", "researching", "enriched"])
    .eq("archived", false)
    .not("contact_name", "is", null)
    .not("website", "is", null)
    .is("email", null)
    .limit(10);

  console.log("\nSamples needing email enrichment:");
  for (const p of samples || []) {
    console.log(`  ${p.contact_name} @ ${p.website}`);
  }
}

check().catch(console.error);
