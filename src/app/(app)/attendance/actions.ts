"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guard";
import { can } from "@/lib/rbac";

async function notifyDeparture(soldierId: string, battalionId: string, statusName: string) {
  try {
    const soldier = await prisma.soldier.findUnique({
      where: { id: soldierId },
      select: { telegramChatId: true, fullName: true, personalNumber: true },
    });
    if (!soldier?.telegramChatId) return;

    const battalion = await prisma.battalion.findUnique({
      where: { id: battalionId },
      select: { telegramBotToken: true, soldierDepartureMessage: true },
    });
    if (!battalion?.telegramBotToken) return;

    const signedCount = await prisma.serialUnit.count({ where: { signedSoldierId: soldierId } });
    if (signedCount === 0) return;

    const { getSoldierEquipmentSummary, formatSoldierSummaryForWhatsApp } = await import("@/lib/soldier-summary");
    const summary = await getSoldierEquipmentSummary(soldierId);
    if (!summary) return;

    const header = `⚠️ דיווח: ${statusName}`;
    const text = formatSoldierSummaryForWhatsApp(summary, { headerTitle: `${header} — ציוד חתום עליך` });

    const customMsg = battalion.soldierDepartureMessage?.trim();
    const reminder = customMsg || "🔒 אל תשכח לנעול את הנשק ולוודא שהציוד מאובטח!";

    const { sendTelegramMessage } = await import("@/lib/telegram");
    await sendTelegramMessage(battalion.telegramBotToken, soldier.telegramChatId, text + "\n\n" + reminder);
  } catch (e) {
    console.error("[notifyDeparture] failed (non-fatal):", e);
  }
}

export async function saveAttendance(
  entries: { soldierId: string; date: string; statusId: string | null; type: "plan" | "record" }[],
): Promise<{ ok?: boolean; error?: string }> {
  try {
    const user = await requireUser();
    const canManage = can(user, "attendance.manage");
    const canView = can(user, "attendance.view");
    if (!canManage && !canView) return { error: "אין הרשאה" };

    // 🔒 נעילת שלישות: נציג פלוגה חסום מלערוך נוכחות ליום נעול. שלישות/אדמין עוקפים.
    const isRoster = can(user, "soldiers.roster") || user.isAdmin;
    if (!isRoster && entries.length > 0) {
      const soldierIds = [...new Set(entries.map((e) => e.soldierId))];
      const sList = await prisma.soldier.findMany({ where: { id: { in: soldierIds } }, select: { id: true, companyId: true } });
      const compBy = new Map(sList.map((s) => [s.id, s.companyId]));
      const dates = [...new Set(entries.map((e) => e.date))].map((d) => new Date(d + "T00:00:00Z"));
      const compIds = sList.map((s) => s.companyId).filter((c): c is string => !!c);
      const locks = compIds.length ? await prisma.attendanceLock.findMany({ where: { companyId: { in: compIds }, date: { in: dates } }, select: { companyId: true, date: true } }) : [];
      const lockedSet = new Set(locks.map((l) => `${l.companyId}|${l.date.toISOString().slice(0, 10)}`));
      const isBlocked = (e: (typeof entries)[number]) => { const c = compBy.get(e.soldierId); return !!c && lockedSet.has(`${c}|${e.date}`); };
      if (entries.every(isBlocked)) return { error: "🔒 הנוכחות נעולה ע\"י השלישות — לא ניתן לעדכן" };
      entries = entries.filter((e) => !isBlocked(e));
    }

    const departureAlerts: { soldierId: string; statusName: string }[] = [];

    for (const entry of entries) {
      const dateObj = new Date(entry.date + "T00:00:00Z");
      if (entry.type === "plan") {
        if (entry.statusId) {
          await prisma.attendancePlan.upsert({
            where: { soldierId_date: { soldierId: entry.soldierId, date: dateObj } },
            update: { statusId: entry.statusId, updatedById: user.id },
            create: { soldierId: entry.soldierId, date: dateObj, statusId: entry.statusId, updatedById: user.id },
          });
        } else {
          await prisma.attendancePlan.deleteMany({
            where: { soldierId: entry.soldierId, date: dateObj },
          });
        }
      } else {
        if (entry.statusId) {
          await prisma.attendanceRecord.upsert({
            where: { soldierId_date: { soldierId: entry.soldierId, date: dateObj } },
            update: { statusId: entry.statusId, updatedById: user.id },
            create: { soldierId: entry.soldierId, date: dateObj, statusId: entry.statusId, updatedById: user.id },
          });

          const status = await prisma.attendanceStatus.findUnique({
            where: { id: entry.statusId },
            select: { isPresent: true, name: true },
          });
          if (status && !status.isPresent) {
            departureAlerts.push({ soldierId: entry.soldierId, statusName: status.name });
          }
        } else {
          await prisma.attendanceRecord.deleteMany({
            where: { soldierId: entry.soldierId, date: dateObj },
          });
        }
      }
    }

    if (departureAlerts.length > 0) {
      const seen = new Set<string>();
      for (const alert of departureAlerts) {
        if (seen.has(alert.soldierId)) continue;
        seen.add(alert.soldierId);
        void notifyDeparture(alert.soldierId, user.battalionId!, alert.statusName);
      }
    }

    revalidatePath("/attendance");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "שגיאה" };
  }
}

// ===================== שמ"פ (שירות מילואים פעיל) =====================

export async function openCallup(
  soldierId: string,
  startDate: string,
): Promise<{ ok?: boolean; error?: string }> {
  try {
    const user = await requireUser();
    if (!can(user, "attendance.manage")) return { error: "אין הרשאה" };
    const existing = await prisma.callupPeriod.findFirst({
      where: { soldierId, endDate: null },
    });
    if (existing) return { error: "לחייל כבר יש שמ\"פ פתוח" };
    await prisma.callupPeriod.create({
      data: {
        soldierId,
        startDate: new Date(startDate + "T00:00:00Z"),
        createdById: user.id,
      },
    });
    revalidatePath("/attendance");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "שגיאה" };
  }
}

export async function closeCallup(
  callupId: string,
  endDate: string,
): Promise<{ ok?: boolean; error?: string }> {
  try {
    const user = await requireUser();
    if (!can(user, "attendance.manage")) return { error: "אין הרשאה" };
    const period = await prisma.callupPeriod.findUnique({ where: { id: callupId } });
    if (!period) return { error: "תקופת שמ\"פ לא נמצאה" };
    if (period.endDate) return { error: "שמ\"פ כבר סגור" };

    const signedCount = await prisma.serialUnit.count({ where: { signedSoldierId: period.soldierId } });
    if (signedCount > 0) {
      return { error: `לא ניתן לסגור שמ"פ — החייל חתום על ${signedCount} פריטי ציוד. יש לזכות את הציוד לפני סגירה.` };
    }

    await prisma.callupPeriod.update({
      where: { id: callupId },
      data: { endDate: new Date(endDate + "T00:00:00Z"), closedById: user.id, closedAt: new Date() },
    });
    revalidatePath("/attendance");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "שגיאה" };
  }
}

export async function deleteCallup(
  callupId: string,
): Promise<{ ok?: boolean; error?: string }> {
  try {
    const user = await requireUser();
    if (!can(user, "attendance.manage")) return { error: "אין הרשאה" };

    const period = await prisma.callupPeriod.findUnique({ where: { id: callupId }, select: { soldierId: true } });
    if (!period) return { error: "תקופת שמ\"פ לא נמצאה" };
    const signedCount = await prisma.serialUnit.count({ where: { signedSoldierId: period.soldierId } });
    if (signedCount > 0) {
      return { error: `לא ניתן למחוק שמ"פ — החייל חתום על ${signedCount} פריטי ציוד.` };
    }

    await prisma.callupPeriod.delete({ where: { id: callupId } });
    revalidatePath("/attendance");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "שגיאה" };
  }
}

export async function assignSquad(
  soldierId: string,
  squadId: string | null,
): Promise<{ ok?: boolean; error?: string }> {
  try {
    const user = await requireUser();
    if (!can(user, "attendance.manage") && !can(user, "battalion.profile"))
      return { error: "אין הרשאה" };
    await prisma.soldier.update({
      where: { id: soldierId },
      data: { squadId },
    });
    revalidatePath("/attendance");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "שגיאה" };
  }
}

/** נעילה/פתיחה של עדכון נוכחות לפלוגה ליום — ע"י השלישות (roster). */
export async function toggleCompanyLock(
  companyId: string,
  date: string,
  lock: boolean,
): Promise<{ ok?: boolean; error?: string }> {
  try {
    const user = await requireUser();
    if (!can(user, "soldiers.roster") && !user.isAdmin) return { error: "רק השלישות יכולה לנעול" };
    const bId = user.battalionId!;
    const dateObj = new Date(date + "T00:00:00Z");
    if (lock) {
      await prisma.attendanceLock.upsert({
        where: { companyId_date: { companyId, date: dateObj } },
        update: { lockedById: user.id, lockedAt: new Date() },
        create: { battalionId: bId, companyId, date: dateObj, lockedById: user.id },
      });
    } else {
      await prisma.attendanceLock.deleteMany({ where: { companyId, date: dateObj } });
    }
    revalidatePath("/roster/control");
    revalidatePath("/attendance");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "שגיאה" };
  }
}
