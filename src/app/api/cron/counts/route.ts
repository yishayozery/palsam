import { NextResponse } from "next/server";
import { generatePendingTasks } from "@/lib/countScheduler";

/**
 * Cron endpoint — יוצר משימות ספירה לתכניות פעילות ומעדכן סטטוס OVERDUE.
 * הגנה: דורש header `Authorization: Bearer <CRON_SECRET>` או query ?secret=
 * הפעלה: Railway cron (כל 5 דקות) או Vercel cron.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const auth = req.headers.get("authorization") || "";
  const provided = auth.replace(/^Bearer\s+/i, "") || url.searchParams.get("secret") || "";
  const expected = process.env.CRON_SECRET || "";
  // Vercel Cron שולח header `Authorization: Bearer <CRON_SECRET>` אוטומטית
  if (expected && provided !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const created = await generatePendingTasks();
    return NextResponse.json({ ok: true, createdTasks: created });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
