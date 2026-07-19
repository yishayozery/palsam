"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guard";
import { can } from "@/lib/rbac";
import { resolveHolderKinds } from "@/lib/scope";
import { audit } from "@/lib/audit";

/** החיילים שהמשתמש רשאי לסמן עליהם תחזית — לפי הפלוגה/מחלקה שלו. מטה/שלישות: כל הגדוד. */
async function scopedSoldierIds(
  user: Awaited<ReturnType<typeof requireUser>>,
  ids: string[],
): Promise<string[]> {
  const { companyHolderIds } = await resolveHolderKinds(user);
  const rows = await prisma.soldier.findMany({
    where: {
      id: { in: ids },
      battalionId: user.battalionId!,
      ...(companyHolderIds.length > 0 ? { companyId: { in: companyHolderIds } } : {}),
      ...(user.squadIds.length > 0 ? { squadId: { in: user.squadIds } } : {}),
    },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/**
 * 🗓️ סימון תחזית לטווח תאריכים — חייל בודד או קבוצה.
 * statusId=null מנקה את הטווח (החייל חוזר לברירת המחדל: בשמ"פ).
 * ימים מפוצלים = הרצה חוזרת על טווחים שונים.
 */
export async function markForecastRange(payload: {
  soldierIds: string[];
  startDate: string;
  endDate: string;
  statusId: string | null;
  employmentId?: string | null;
  note?: string;
  overwrite?: boolean;
}): Promise<{ ok?: boolean; days?: number; written?: number; error?: string }> {
  try {
    const user = await requireUser();
    if (!can(user, "attendance.manage")) return { error: "אין הרשאה" };
    const bId = user.battalionId!;
    const { soldierIds, startDate, endDate, statusId, employmentId, note, overwrite = true } = payload;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return { error: "תאריך לא תקין" };
    if (endDate < startDate) return { error: "תאריך הסיום מוקדם מתאריך ההתחלה" };
    if (soldierIds.length === 0) return { error: "בחר לפחות חייל אחד" };

    const valid = await scopedSoldierIds(user, soldierIds);
    if (valid.length === 0) return { error: "לא נמצאו חיילים בהרשאה שלך" };

    // 🔒 IDOR: הסטטוס והתעסוקה חייבים להיות של הגדוד
    if (statusId) {
      const st = await prisma.forecastStatus.findFirst({ where: { id: statusId, battalionId: bId }, select: { id: true } });
      if (!st) return { error: "סטטוס לא נמצא" };
    }
    let empId: string | null = null;
    if (employmentId) {
      const emp = await prisma.employment.findFirst({ where: { id: employmentId, battalionId: bId }, select: { id: true } });
      empId = emp?.id ?? null;
    }

    const dates: Date[] = [];
    for (let d = new Date(startDate + "T00:00:00Z"); d.toISOString().slice(0, 10) <= endDate; d.setUTCDate(d.getUTCDate() + 1)) {
      dates.push(new Date(d));
      if (dates.length > 400) return { error: "טווח ארוך מדי (מקסימום 400 ימים)" };
    }

    let written = 0;
    for (const sid of valid) {
      if (!statusId) {
        const r = await prisma.forecastEntry.deleteMany({ where: { soldierId: sid, date: { in: dates } } });
        written += r.count;
        continue;
      }
      const skip = overwrite
        ? new Set<string>()
        : new Set((await prisma.forecastEntry.findMany({
            where: { soldierId: sid, date: { in: dates } }, select: { date: true },
          })).map((e) => e.date.toISOString().slice(0, 10)));
      for (const date of dates) {
        if (skip.has(date.toISOString().slice(0, 10))) continue;
        await prisma.forecastEntry.upsert({
          where: { soldierId_date: { soldierId: sid, date } },
          update: { statusId, employmentId: empId, note: note?.trim() || null, updatedById: user.id },
          create: { soldierId: sid, date, statusId, employmentId: empId, note: note?.trim() || null, updatedById: user.id },
        });
        written++;
      }
    }

    await audit(user.id, "MARK_FORECAST_RANGE", "Battalion", bId, { soldiers: valid.length, startDate, endDate, statusId, written });
    revalidatePath("/attendance/forecast");
    revalidatePath("/roster/control");
    return { ok: true, days: dates.length, written };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "שגיאה" };
  }
}

/** סימון תא בודד (חייל × תאריך) — לקליק מהיר במטריצה. */
export async function setForecastCell(
  soldierId: string, date: string, statusId: string | null, employmentId?: string | null,
): Promise<{ ok?: boolean; error?: string }> {
  return markForecastRange({ soldierIds: [soldierId], startDate: date, endDate: date, statusId, employmentId })
    .then((r) => (r.error ? { error: r.error } : { ok: true }));
}
