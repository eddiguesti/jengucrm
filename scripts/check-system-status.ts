import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkSystemStatus() {
  const today = new Date().toISOString().split("T")[0];
  const now = new Date();

  console.log("=".repeat(60));
  console.log("SYSTEM STATUS CHECK");
  console.log("Time:", now.toISOString());
  console.log("=".repeat(60));

  // 1. Check emails table (today)
  const { data: emailsToday, error: e1 } = await supabase
    .from("emails")
    .select("id, created_at, subject, from_email, status, prospect_id")
    .gte("created_at", today)
    .order("created_at", { ascending: false });

  console.log("\n📧 EMAILS TABLE (today)");
  console.log("-".repeat(40));
  console.log("Count:", emailsToday?.length || 0);
  if (e1) console.log("Error:", e1.message);
  if (emailsToday && emailsToday.length > 0) {
    console.log("\nLast 5 entries:");
    emailsToday.slice(0, 5).forEach((e) => {
      console.log(`  ${e.created_at} | ${e.from_email} | ${e.status}`);
    });
  }

  // 2. Check email_send_log table (today)
  const { data: sendLog, error: e2 } = await supabase
    .from("email_send_log")
    .select("id, sent_at, inbox_email, email_id, prospect_id")
    .gte("sent_at", today)
    .order("sent_at", { ascending: false });

  console.log("\n📋 EMAIL_SEND_LOG TABLE (today)");
  console.log("-".repeat(40));
  console.log("Count:", sendLog?.length || 0);
  if (e2) console.log("Error:", e2.message);

  if (sendLog && sendLog.length > 0) {
    const withEmailId = sendLog.filter((s) => s.email_id !== null);
    const withoutEmailId = sendLog.filter((s) => s.email_id === null);
    console.log("With email_id (saved properly):", withEmailId.length);
    console.log("Without email_id (NOT saved to emails table):", withoutEmailId.length);

    console.log("\nLast 5 entries:");
    sendLog.slice(0, 5).forEach((s) => {
      console.log(
        `  ${s.sent_at} | ${s.inbox_email} | email_id: ${s.email_id || "NULL"}`
      );
    });
  }

  // 3. Check last email sent time
  const { data: lastSend } = await supabase
    .from("email_send_log")
    .select("sent_at, inbox_email")
    .order("sent_at", { ascending: false })
    .limit(1)
    .single();

  console.log("\n⏱️  LAST EMAIL SENT");
  console.log("-".repeat(40));
  if (lastSend) {
    const lastTime = new Date(lastSend.sent_at);
    const minAgo = Math.round((now.getTime() - lastTime.getTime()) / 60000);
    console.log(`Time: ${lastSend.sent_at}`);
    console.log(`Minutes ago: ${minAgo}`);
    console.log(`Inbox: ${lastSend.inbox_email}`);
    if (minAgo < 10) {
      console.log("⚠️  WARNING: Email sent very recently!");
    } else {
      console.log("✅ No recent sends (emergency stop likely working)");
    }
  }

  // 4. Check inbox usage today
  const { data: inboxUsage } = await supabase
    .from("email_send_log")
    .select("inbox_email")
    .gte("sent_at", today);

  if (inboxUsage) {
    const usage: Record<string, number> = {};
    inboxUsage.forEach((row) => {
      usage[row.inbox_email] = (usage[row.inbox_email] || 0) + 1;
    });

    console.log("\n📊 INBOX USAGE TODAY");
    console.log("-".repeat(40));
    Object.entries(usage)
      .sort((a, b) => b[1] - a[1])
      .forEach(([email, count]) => {
        console.log(`  ${email}: ${count} emails`);
      });
    console.log(`TOTAL: ${inboxUsage.length} emails`);
  }

  // 5. Check for bounces today
  const { data: bounces } = await supabase
    .from("emails")
    .select("id, to_email, bounce_type")
    .gte("created_at", today)
    .not("bounce_type", "is", null);

  console.log("\n🔴 BOUNCES TODAY");
  console.log("-".repeat(40));
  console.log("Count:", bounces?.length || 0);
  if (bounces && bounces.length > 0) {
    bounces.slice(0, 5).forEach((b) => {
      console.log(`  ${b.to_email} - ${b.bounce_type}`);
    });
  }

  // 6. Summary
  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));

  const emailsCount = emailsToday?.length || 0;
  const sendLogCount = sendLog?.length || 0;
  const discrepancy = sendLogCount - emailsCount;

  console.log(`Emails in 'emails' table: ${emailsCount}`);
  console.log(`Emails in 'email_send_log': ${sendLogCount}`);
  console.log(`Discrepancy: ${discrepancy}`);

  if (discrepancy > 0) {
    console.log(
      `\n⚠️  WARNING: ${discrepancy} emails were sent but NOT saved to emails table!`
    );
    console.log("This breaks warmup limit tracking.");
  }

  if (sendLogCount > 80) {
    console.log(`\n🚨 CRITICAL: ${sendLogCount} emails sent today exceeds 80 limit!`);
  }
}

checkSystemStatus().catch(console.error);
