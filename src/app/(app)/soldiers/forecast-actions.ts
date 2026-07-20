"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guard";
import { can } from "@/lib/rbac";
import { resolveHolderKinds } from "@/lib/scope";
import { audit } from "@/lib/audit";

/**
 * תחזית הגעה — הגדרה ברמת החייל, במסך חיילי הפלוגה.
 * צו = טווח הגיוס (ForecastOrder). חריג = יום בתוך הצו שבו לא מגיע (ForecastEntry).
 */

const D = /^\d{4}-\d{2}-\d{2}$/;

/** מסנן לחיילים שבסקופ של המשתמש (פלוגה/מחלקה); מטה — כל הגדוד. */
async function scopedIds(
  user: Awaited<ReturnType<typeof requireUser>>,
  ids: string[],
): Promise<string[]> {
  const { companyHolderIds } = await resolveHolderKinds(user);
  const rows = await prisma.soldier.findMany({
    where: {
      id: { in: ids },
      battalionId: user.battalionId!,
      status: { notIn: ["DISCHARGED", "INACTIVE"] },
      ...(companyHolderIds.length > 0 ? { companyId: { in: companyHolderIds } } : {}),
      ...(user.squadIds.length > 0 ? { squadId: { in: user.squadIds } } : {}),
    },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

async function requireForecastEditor() {
  const user = await requireUser();
  if (!can(user, "attendance.manage") && !can(user, "soldiers")) throw new Error("אין הרשאה");
  return user;
}

function revalidateAll() {
  revalidatePath("/soldiers");
  revalidatePath("/attendance/forecast");
  revalidatePath("/roster/control");
}

/**
 * 📜 קביעת צו לחייל/ים בתעסוקה. startDate=null מוחק את הצו — החייל חוזר
 * להיות "לא מגויס" ויורד מהתחזית לגמרי.
 */
export async function setForecastOrder(payload: {
  soldierIds: string[];
  employmentId: string;
  startDate: string | null;
  endDate: string | null;
  note?: string;
}): Promise<{ ok?: boolean; count?: number; error?: string }> {
  try {
    const user = await requireForecastEditor();
    const bId = user.battalionId!;
    const { soldierIds, employmentId, startDate, endDate, note } = payload;
    if (soldierIds.length === 0) return { error: "לא נבחרו חיילים" };

    const emp = await prisma.employment.findFirst({
      where: { id: employmentId, battalionId: bId },
      select: { id: true, startDate: true, endDate: true, name: true },
    });
    if (!emp) return { error: "תעסוקה לא נמצאה" };

    const valid = await scopedIds(user, soldierIds);
    if (valid.length === 0) return { error: "לא נמצאו חיילים בהרשאה שלך" };

    // מחיקת צו
    if (!startDate || !endDate) {
      const r = await prisma.forecastOrder.deleteMany({ where: { soldierId: { in: valid }, employmentId } });
      // ללא צו אין משמעות לחריגים — מנקים כדי שלא יישארו רשומות יתומות
      await prisma.forecastEntry.deleteMany({
        where: { soldierId: { in: valid }, date: { gte: emp.startDate, lte: emp.endDate } },
      });
      await audit(user.id, "CLEAR_FORECAST_ORDER", "Employment", employmentId, { count: r.count });
      revalidateAll();
      return { ok: true, count: r.count };
    }

    if (!D.test(startDate) || !D.test(endDate)) return { error: "תאריך לא תקין" };
    if (endDate < startDate) return { error: "תאריך הסיום מוקדם מתאריך ההתחלה" };
    const empStart = emp.startDate.toISOString().slice(0, 10);
    const empEnd = emp.endDate.toISOString().slice(0, 10);
    if (startDate < empStart || endDate > empEnd) {
      return { error: `הצו חייב להיות בתוך תאריכי התעסוקה (${empStart} — ${empEnd})` };
    }

    const s = new Date(startDate + "T00:00:00Z");
    const e = new Date(endDate + "T00:00:00Z");
    for (const sid of valid) {
      await prisma.forecastOrder.upsert({
        where: { soldierId_employmentId: { soldierId: sid, employmentId } },
        update: { startDate: s, endDate: e, note: note?.trim() || null, updatedById: user.id },
        create: { soldierId: sid, employmentId, startDate: s, endDate: e, note: note?.trim() || null, updatedById: user.id },
      });
      // חריגים שנפלו מחוץ לצו החדש מאבדים משמעות
      await prisma.forecastEntry.deleteMany({
        where: { soldierId: sid, date: { gte: emp.startDate, lte: emp.endDate }, OR: [{ date: { lt: s } }, { date: { gt: e } }] },
      });
    }

    await audit(user.id, "SET_FORECAST_ORDER", "Employment", employmentId, { count: valid.length, startDate, endDate });
    revalidateAll();
    return { ok: true, count: valid.length };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "שגיאה" };
  }
}

/**
 * 🚫 חריג בתוך הצו — טווח ימים שבהם החייל מגויס אך לא מגיע.
 * statusId=null מנקה את הטווח (חוזר לבשמ"פ).
 */
export async function setForecastException(payload: {
  soldierIds: string[];
  employmentId: string;
  startDate: string;
  endDate: string;
  statusId: string | null;
}): Promise<{ ok?: boolean; written?: number; skippedOutsideOrder?: number; error?: string }> {
  try {
    const user = await requireForecastEditor();
    const bId = user.battalionId!;
    const { soldierIds, employmentId, startDate, endDate, statusId } = payload;
    if (!D.test(startDate) || !D.test(endDate)) return { error: "תאריך לא תקין" };
    if (endDate < startDate) return { error: "תאריך הסיום מוקדם מתאריך ההתחלה" };
    if (soldierIds.length === 0) return { error: "לא נבחרו חיילים" };

    if (statusId) {
      const st = await prisma.forecastStatus.findFirst({ where: { id: statusId, battalionId: bId }, select: { id: true } });
      if (!st) return { error: "סטטוס לא נמצא" };
    }

    const valid = await scopedIds(user, soldierIds);
    if (valid.length === 0) return { error: "לא נמצאו חיילים בהרשאה שלך" };

    // חריג קיים רק בתוך הצו — מי שאין לו צו חופף פשוט מדולג
    const orders = await prisma.forecastOrder.findMany({
      where: { soldierId: { in: valid }, employmentId },
      select: { soldierId: true, startDate: true, endDate: true },
    });
    const orderBy = new Map(orders.map((o) => [o.soldierId, o]));

    let written = 0, skippedOutsideOrder = 0;
    for (const sid of valid) {
      const o = orderBy.get(sid);
      if (!o) { skippedOutsideOrder++; continue; }
      // חיתוך הטווח המבוקש עם הצו
      const oStart = o.startDate.toISOString().slice(0, 10);
      const oEnd = o.endDate.toISOString().slice(0, 10);
      const from = startDate > oStart ? startDate : oStart;
      const to = endDate < oEnd ? endDate : oEnd;
      if (to < from) { skippedOutsideOrder++; continue; }

      const dates: Date[] = [];
      for (const d = new Date(from + "T00:00:00Z"); d.toISOString().slice(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 1)) {
        dates.push(new Date(d));
        if (dates.length > 400) break;
      }
      if (!statusId) {
        const r = await prisma.forecastEntry.deleteMany({ where: { soldierId: sid, date: { in: dates } } });
        written += r.count;
        continue;
      }
      for (const date of dates) {
        await prisma.forecastEntry.upsert({
          where: { soldierId_date: { soldierId: sid, date } },
          update: { statusId, employmentId, updatedById: user.id },
          create: { soldierId: sid, date, statusId, employmentId, updatedById: user.id },
        });
        written++;
      }
    }

    await audit(user.id, "SET_FORECAST_EXCEPTION", "Employment", employmentId, { count: valid.length, startDate, endDate, statusId, written });
    revalidateAll();
    return { ok: true, written, skippedOutsideOrder };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "שגיאה" };
  }
}
