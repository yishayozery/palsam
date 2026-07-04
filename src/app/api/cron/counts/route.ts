import { NextResponse } from "next/server";
import { generatePendingTasks } from "@/lib/countScheduler";
import { sendAttendanceReminders } from "@/lib/attendanceReminder";

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
    // תזכורת בוקר לדיווח נוכחות (רץ פעם ביום בבוקר יחד עם מתזמן הספירות)
    const reminders = await sendAttendanceReminders().catch(() => 0);
    return NextResponse.json({ ok: true, createdTasks: created, attendanceReminders: reminders });
  } catch {
    return NextResponse.json({ ok: false, error: "internal error" }, { status: 500 });
  }
}
