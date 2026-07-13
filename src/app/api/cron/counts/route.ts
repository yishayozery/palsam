import { NextResponse } from "next/server";
import { generatePendingTasks } from "@/lib/countScheduler";

// יצירת משימות ספירה + התראות ל-4 גדודים — מרחיב את חלון הריצה (Vercel Pro)
export const maxDuration = 60;

export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET || "";
  if (!expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const auth = req.headers.get("authorization") || "";
  const provided = auth.replace(/^Bearer\s+/i, "") || url.searchParams.get("secret") || "";
  if (provided !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const created = await generatePendingTasks();
    return NextResponse.json({ ok: true, createdTasks: created });
  } catch {
    return NextResponse.json({ ok: false, error: "internal error" }, { status: 500 });
  }
}
