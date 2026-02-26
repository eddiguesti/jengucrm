/**
 * Import ITB leads from CSV into Supabase prospects table
 *
 * CSV format:
 *   Col 1: Full name
 *   Col 2: "Job Title ,  Company Name"
 *   Col 3: Membership status
 *
 * Run: npx tsx scripts/import-itb-leads.ts [--dry-run]
 */

import * as fs from "fs";
import * as path from "path";
import { parse } from "csv-parse/sync";
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const DRY_RUN = process.argv.includes("--dry-run");
const CSV_PATH = path.join(
  process.cwd(),
  "docs/TODO/ITB leads.csv"
);

interface ITBLead {
  name: string;
  title: string;
  company: string;
  membershipStatus: string;
}

function parseCSV(): ITBLead[] {
  const content = fs.readFileSync(CSV_PATH, "utf-8");
  const rows = parse(content, {
    skip_empty_lines: true,
    relax_quotes: true,
    relax_column_count: true,
  });

  const leads: ITBLead[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 2) continue;

    const name = (row[0] || "").trim();
    const col2 = (row[1] || "").trim();
    const membershipStatus = (row[2] || "").trim();

    if (!name) continue;

    // Parse "Job Title ,  Company Name"
    let title = "";
    let company = "";

    if (col2.includes(" ,  ")) {
      const parts = col2.split(" ,  ");
      title = parts[0].trim();
      company = parts.slice(1).join(" ,  ").trim();
    } else if (col2.includes(",")) {
      const parts = col2.split(",");
      title = parts[0].trim();
      company = parts.slice(1).join(",").trim();
    } else {
      company = col2;
    }

    // Skip entries where company is just a country name (no company)
    const countryNames = new Set([
      "spain", "france", "germany", "italy", "uk", "usa", "austria",
      "switzerland", "netherlands", "belgium", "portugal", "poland",
    ]);
    if (countryNames.has(company.toLowerCase())) continue;

    leads.push({ name, title, company, membershipStatus });
  }

  return leads;
}

function toProspectRecord(lead: ITBLead) {
  // Extract first/last name
  const nameParts = lead.name.split(" ");
  const firstName = nameParts[0];
  const lastName = nameParts.slice(1).join(" ");

  // Score based on title
  let score = 10;
  const titleLower = lead.title.toLowerCase();
  if (titleLower.includes("ceo") || titleLower.includes("coo") || titleLower.includes("chairman")) {
    score = 50;
  } else if (titleLower.includes("director")) {
    score = 40;
  } else if (titleLower.includes("head of") || titleLower.includes("manager")) {
    score = 30;
  } else if (titleLower.includes("buyer") || titleLower.includes("senior")) {
    score = 25;
  }

  // Use "FirstName LastName - Company" as the unique name so multiple
  // contacts from the same company don't conflict on the dedup constraint
  return {
    name: `${lead.name} - ${lead.company}`,
    contact_name: lead.name,
    source_job_title: lead.title,
    source: "itb_leads",
    stage: "new",
    score,
    tier: score >= 40 ? "hot" : score >= 25 ? "warm" : "cold",
    country: null,
    city: null,
    property_type: "travel_company",
    archived: false,
    email: null,
    website: null,
  };
}

async function main() {
  console.log(`=== ITB LEADS IMPORT ${DRY_RUN ? "(DRY RUN)" : ""} ===\n`);

  const leads = parseCSV();
  console.log(`Parsed ${leads.length} leads from CSV\n`);

  // Deduplicate by name+company
  const seen = new Set<string>();
  const unique = leads.filter((l) => {
    const key = `${l.name.toLowerCase()}|${l.company.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  console.log(`Unique leads: ${unique.length}`);

  // Check how many already exist in Supabase
  const { data: existing } = await supabase
    .from("prospects")
    .select("contact_name, name")
    .eq("source", "itb_leads");

  const existingKeys = new Set(
    (existing || []).map(
      (p) => `${(p.contact_name || "").toLowerCase()}|${(p.name || "").toLowerCase()}`
    )
  );

  const toInsert = unique.filter((l) => {
    const key = `${l.name.toLowerCase()}|${l.company.toLowerCase()}`;
    return !existingKeys.has(key);
  });

  console.log(`Already in DB: ${existingKeys.size}`);
  console.log(`New to import: ${toInsert.length}\n`);

  if (DRY_RUN) {
    console.log("Sample records that would be imported:");
    for (const l of toInsert.slice(0, 10)) {
      console.log(`  ${l.name} @ ${l.company} (${l.title}) - score: ${toProspectRecord(l).score}`);
    }
    return;
  }

  // Batch insert in chunks of 100
  const BATCH = 100;
  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < toInsert.length; i += BATCH) {
    const chunk = toInsert.slice(i, i + BATCH);
    const records = chunk.map(toProspectRecord);

    const { error } = await supabase.from("prospects").insert(records);
    if (error) {
      console.error(`Batch ${i / BATCH + 1} error:`, error.message);
      errors += chunk.length;
    } else {
      inserted += chunk.length;
      process.stdout.write(`\rInserted ${inserted}/${toInsert.length}...`);
    }
  }

  console.log(`\n\n✓ Done! Inserted ${inserted} prospects (${errors} errors)`);
  console.log(`\nNext step: run email enrichment to find their emails:`);
  console.log(`  npx tsx scripts/find-itb-websites.ts`);
}

main().catch(console.error);
