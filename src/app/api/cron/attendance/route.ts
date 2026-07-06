import { NextResponse } from "next/server";
import { processAttendanceReminders } from "@/lib/attendanceReminder";

// רץ כל 30 דק' (vercel.json). מפעיל תזכורת פתיחה ב-07:00 ותזכורת חוזרת חצי שעה לפני שעת הגג.
export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET || "";
  if (!expected) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const auth = req.headers.get("authorization") || "";
  const provided = auth.replace(/^Bearer\s+/i, "") || url.searchParams.get("secret") || "";
  if (provided !== expected) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const res = await processAttendanceReminders();
    return NextResponse.json({ ok: true, ...res });
  } catch {
    return NextResponse.json({ ok: false, error: "internal error" }, { status: 500 });
  }
}
