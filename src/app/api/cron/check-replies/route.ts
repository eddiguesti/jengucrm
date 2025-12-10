import { NextRequest, NextResponse } from "next/server";

// Cron job to check for email replies
// Runs daily at 9am via Vercel Cron (configured in vercel.json)
export async function GET(request: NextRequest) {
  // Verify this is a cron request (Vercel sets this header)
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  // In production, verify the cron secret
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // EMERGENCY STOP - All email operations disabled
    return NextResponse.json({
      success: true,
      message: "EMERGENCY STOP - Reply checking disabled",
      disabled: true,
      emergency_stop: true,
      checked_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Cron check-replies error:", error);
    return NextResponse.json(
      { error: "Cron job failed", details: String(error) },
      { status: 500 },
    );
  }
}
