"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, requireCapability } from "@/lib/guard";
import { audit } from "@/lib/audit";
import type { CountType } from "@/generated/prisma";

export async function saveCountDefinition(formData: FormData) {
  const user = await requireCapability("counts.manage");
  const bId = user.battalionId!;
  const id = String(formData.get("id") || "");
  const name = String(formData.get("name") || "").trim();
  const type = String(formData.get("type") || "WAREHOUSE") as CountType;
  const frequencyId = String(formData.get("frequencyId") || "") || null;
  const scopeHolderId = String(formData.get("scopeHolderId") || "") || null;
  if (!name) return;
  if (id) {
    await prisma.countDefinition.update({ where: { id }, data: { name, type, frequencyId, scopeHolderId } });
  } else {
    await prisma.countDefinition.create({ data: { battalionId: bId, name, type, frequencyId, scopeHolderId, categoryIds: [], daysOfWeek: [] } });
  }
  await audit(user.id, id ? "UPDATE" : "CREATE", "CountDefinition", id || name);
  revalidatePath("/counts");
}

export async function deleteCountDefinition(formData: FormData) {
  const user = await requireCapability("counts.manage");
  const id = String(formData.get("id") || "");
  await prisma.countDefinition.update({ where: { id }, data: { active: false } });
  await audit(user.id, "DELETE", "CountDefinition", id);
  revalidatePath("/counts");
}

/** 🆕 מחיקת משימת ספירה ספציפית (לאדמין/מפ"מ — לניקוי בדיקות) */
export async function deleteCountTask(formData: FormData) {
  const user = await requireCapability("counts.manage");
  const id = String(formData.get("id") || "");
  const task = await prisma.countTask.findUnique({ where: { id } });
  if (!task || task.battalionId !== user.battalionId) return;
  await prisma.countTask.delete({ where: { id } });
  await audit(user.id, "DELETE_COUNT_TASK", "CountTask", id);
  revalidatePath("/counts");
}

/** 🆕 ביטול ספירה בתהליך (מחזיר ל-CANCELED, לא מוחק היסטוריה) */
export async function cancelCountSession(formData: FormData) {
  const user = await requireCapability("counts.manage");
  const id = String(formData.get("id") || "");
  const session = await prisma.countSession.findUnique({ where: { id } });
  if (!session || session.battalionId !== user.battalionId) return;
  if (session.status === "COMPLETED") return;
  await prisma.countSession.update({ where: { id }, data: { status: "COMPLETED", completedAt: new Date() } });
  await audit(user.id, "CANCEL_COUNT_SESSION", "CountSession", id);
  revalidatePath("/counts");
}

/** 🆕 מחיקה מוחלטת של ספירה - מוחק את הסשן ואת השורות + פערים שנוצרו ממנה */
export async function deleteCountSession(formData: FormData) {
  const user = await requireCapability("counts.manage");
  const id = String(formData.get("id") || "");
  const session = await prisma.countSession.findUnique({ where: { id } });
  if (!session || session.battalionId !== user.battalionId) return;
  await prisma.$transaction(async (tx) => {
    // לנתק משימה שמצביעה לסשן (לא מוחק את המשימה עצמה)
    await tx.countTask.updateMany({ where: { sessionId: id }, data: { sessionId: null, status: "PENDING" } });
    // למחוק פערים שנוצרו מהספירה
    await tx.discrepancy.deleteMany({ where: { sessionId: id } });
    // למחוק שורות
    await tx.countLine.deleteMany({ where: { sessionId: id } });
    // למחוק את הסשן
    await tx.countSession.delete({ where: { id } });
  });
  await audit(user.id, "DELETE_COUNT_SESSION", "CountSession", id);
  revalidatePath("/counts");
  revalidatePath("/gaps");
}

/** עטיפה ל-form */
export async function deleteCountTaskForm(formData: FormData): Promise<void> {
  await deleteCountTask(formData);
}
export async function deleteCountSessionForm(formData: FormData): Promise<void> {
  await deleteCountSession(formData);
}

/** עטיפת void לשימוש ב-<form action> */
export async function purgeAllCountTasksForm(formData: FormData): Promise<void> {
  await purgeAllCountTasks(formData);
}

/** 🆕 מחיקת כל משימות הספירה בגדוד (ניקוי כללי — אדמין בלבד) */
export async function purgeAllCountTasks(formData: FormData) {
  const user = await requireCapability("counts.manage");
  const bId = user.battalionId!;
  const confirm = String(formData.get("confirm") || "");
  if (confirm !== "DELETE-ALL") return { error: "אישור שגוי" };
  const deleted = await prisma.$transaction(async (tx) => {
    // לנתק קישור מסשנים פעילים (לא מוחקים סשנים שכבר הושלמו)
    await tx.countTask.updateMany({ where: { battalionId: bId, sessionId: { not: null } }, data: { sessionId: null } });
    const result = await tx.countTask.deleteMany({ where: { battalionId: bId } });
    return result.count;
  });
  await audit(user.id, "PURGE_COUNT_TASKS", "CountTask", "all", { count: deleted });
  revalidatePath("/counts");
  return { ok: true, deleted };
}

/** פתיחת ספירה — מייצר שורות ספירה לפי המלאי הצפוי בהיקף. */
export async function startCount(formData: FormData) {
  const user = await requireCapability("counts.execute");
  const bId = user.battalionId!;
  const type = String(formData.get("type") || "WAREHOUSE") as CountType;
  const definitionId = String(formData.get("definitionId") || "") || null;
  const scopeHolderId = String(formData.get("scopeHolderId") || "") || null;

  // היקף המחזיקים
  let holderIds: string[] = [];
  if (type === "WAREHOUSE") {
    if (user.holderId) holderIds = [user.holderId];
    else holderIds = (await prisma.holder.findMany({ where: { battalionId: bId, kind: "WAREHOUSE" } })).map((h) => h.id);
  } else if (type === "COMPANY") {
    if (scopeHolderId) holderIds = [scopeHolderId];
    else holderIds = (await prisma.holder.findMany({ where: { battalionId: bId, kind: "COMPANY" } })).map((h) => h.id);
  } else {
    holderIds = (await prisma.holder.findMany({ where: { battalionId: bId, active: true } })).map((h) => h.id);
  }

  let sessionId = "";
  await prisma.$transaction(async (tx) => {
    const session = await tx.countSession.create({
      data: { battalionId: bId, definitionId, type, status: type === "GLOBAL" ? "FROZEN" : "IN_PROGRESS", frozen: type === "GLOBAL", startedById: user.id },
    });
    sessionId = session.id;

    const balances = await tx.stockBalance.findMany({ where: { battalionId: bId, holderId: { in: holderIds }, quantity: { gt: 0 } } });
    for (const b of balances) {
      await tx.countLine.create({ data: { sessionId: session.id, itemTypeId: b.itemTypeId, holderId: b.holderId, expectedQty: b.quantity } });
    }
    const units = await tx.serialUnit.findMany({
      where: { battalionId: bId, OR: [{ currentHolderId: { in: holderIds } }, ...(type === "GLOBAL" ? [{ signedSoldierId: { not: null } }] : [])] },
    });
    for (const u of units) {
      await tx.countLine.create({ data: { sessionId: session.id, itemTypeId: u.itemTypeId, holderId: u.currentHolderId, serialUnitId: u.id, expectedQty: u.lotQuantity ?? 1 } });
    }
  });

  await audit(user.id, "START_COUNT", "CountSession", sessionId, { type });
  redirect(`/counts/${sessionId}`);
}

/** סיום ספירה — חישוב פערים. */
export async function submitCount(formData: FormData) {
  const user = await requireCapability("counts.execute");
  const bId = user.battalionId!;
  const sessionId = String(formData.get("sessionId") || "");
  const session = await prisma.countSession.findUnique({ where: { id: sessionId }, include: { lines: true } });
  if (!session || session.battalionId !== bId || session.status === "COMPLETED") return;

  // איסוף עדכוני מיקום פיזי לכל יחידה סריאלית
  const locationUpdates = new Map<string, string>();
  for (const [key, val] of formData.entries()) {
    if (key.startsWith("location:")) {
      const serialUnitId = key.slice("location:".length);
      const loc = String(val).trim();
      if (serialUnitId) locationUpdates.set(serialUnitId, loc);
    }
  }

  await prisma.$transaction(async (tx) => {
    // עדכון מיקומים פיזיים
    for (const [serialUnitId, loc] of locationUpdates) {
      await tx.serialUnit.update({
        where: { id: serialUnitId },
        data: { physicalLocation: loc || null },
      });
    }
    for (const line of session.lines) {
      const raw = formData.get(`count:${line.id}`);
      if (raw === null || String(raw) === "") continue;
      const counted = parseInt(String(raw), 10);
      if (isNaN(counted)) continue;
      const recounted = formData.get(`recount:${line.id}`) === "on";
      const note = recounted ? "ספירה חוזרת בוצעה" : null;
      await tx.countLine.update({ where: { id: line.id }, data: { countedQty: counted, note } });
      if (counted !== line.expectedQty) {
        await tx.discrepancy.create({
          data: {
            battalionId: bId, sessionId: session.id, itemTypeId: line.itemTypeId, holderId: line.holderId,
            expectedQty: line.expectedQty, countedQty: counted, diff: counted - line.expectedQty,
            kind: counted < line.expectedQty ? "LOSS" : "SURPLUS",
            status: "OPEN",
            resolution: recounted ? "ספירה חוזרת אומתה — פער אמיתי" : null,
          },
        });
      }
    }
    await tx.countSession.update({ where: { id: sessionId }, data: { status: "COMPLETED", completedAt: new Date() } });
  });

  await audit(user.id, "SUBMIT_COUNT", "CountSession", sessionId);
  revalidatePath("/counts");
  redirect("/gaps");
}
