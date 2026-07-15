import { NextResponse } from "next/server";
import { processAttendanceReminders } from "@/lib/attendanceReminder";
import { processDriverLicenseReports } from "@/lib/driverLicenseReport";
import { processMaintenanceReminders } from "@/lib/maintenanceReminder";
import { isAuthorizedCron } from "@/lib/cron-auth";

// ברודקאסטים ל-4 גדודים עם throttling עשויים לקחת עד דקה — מרחיב את חלון הריצה (Vercel Pro)
export const maxDuration = 60;

// רץ כל 30 דק' (vercel.json). מפעיל תזכורת פתיחה ב-07:00 ותזכורת חוזרת חצי שעה לפני שעת הגג.
export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const res = await processAttendanceReminders();
    // דוח יומי לקצין רכב על רישיונות שפגים (רק בתעסוקה) — best-effort
    const licenses = await processDriverLicenseReports().catch(() => ({ battalions: 0, sent: 0 }));
    // תזכורת טיפולי רכב (יום לפני) — best-effort
    const maintenance = await processMaintenanceReminders().catch(() => ({ battalions: 0, sent: 0 }));
    return NextResponse.json({ ok: true, ...res, driverLicenses: licenses, maintenance });
  } catch {
    return NextResponse.json({ ok: false, error: "internal error" }, { status: 500 });
  }
}
