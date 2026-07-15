import { NextResponse } from "next/server";
import { generatePendingTasks } from "@/lib/countScheduler";
import { isAuthorizedCron } from "@/lib/cron-auth";

// יצירת משימות ספירה + התראות ל-4 גדודים — מרחיב את חלון הריצה (Vercel Pro)
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const created = await generatePendingTasks();
    return NextResponse.json({ ok: true, createdTasks: created });
  } catch {
    return NextResponse.json({ ok: false, error: "internal error" }, { status: 500 });
  }
}
