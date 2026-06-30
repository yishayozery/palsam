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

export async function createVerificationRequests(sessionId: string, itemTypeIds: string[]) {
  const user = await requireCapability("counts.execute");
  const bId = user.battalionId!;

  const session = await prisma.countSession.findUnique({ where: { id: sessionId } });
  if (!session || session.battalionId !== bId) return { error: "ספירה לא נמצאה" };

  const serialUnits = await prisma.serialUnit.findMany({
    where: {
      battalionId: bId,
      itemTypeId: { in: itemTypeIds },
      signedSoldierId: { not: null },
      dischargedAt: null,
    },
    include: {
      signedSoldier: { select: { id: true, fullName: true, phone: true, telegramChatId: true } },
      itemType: { select: { name: true } },
    },
  });

  const bySoldier = new Map<string, typeof serialUnits>();
  for (const su of serialUnits) {
    if (!su.signedSoldierId) continue;
    const arr = bySoldier.get(su.signedSoldierId) || [];
    arr.push(su);
    bySoldier.set(su.signedSoldierId, arr);
  }

  const created: { id: string; token: string; soldierName: string; phone: string | null; telegramChatId: string | null; itemCount: number }[] = [];

  for (const [soldierId, units] of bySoldier) {
    const soldier = units[0].signedSoldier!;
    const existing = await prisma.verificationRequest.findFirst({
      where: { sessionId, soldierId },
    });
    if (existing) continue;

    const req = await prisma.verificationRequest.create({
      data: {
        battalionId: bId,
        sessionId,
        soldierId,
        items: {
          create: units.map((u) => ({
            serialUnitId: u.id,
            itemTypeName: u.itemType.name,
            serialNumber: u.serialNumber,
          })),
        },
      },
    });

    created.push({
      id: req.id,
      token: req.token,
      soldierName: soldier.fullName,
      phone: soldier.phone,
      telegramChatId: soldier.telegramChatId,
      itemCount: units.length,
    });
  }

  return { ok: true, requests: created, total: created.length };
}

export async function getVerificationStatus(sessionId: string) {
  const user = await requireUser();
  const bId = user.battalionId!;

  const requests = await prisma.verificationRequest.findMany({
    where: { sessionId, battalionId: bId },
    include: {
      soldier: { select: { fullName: true, phone: true } },
      items: { select: { id: true, itemTypeName: true, serialNumber: true, status: true, photoData: true, note: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return requests.map((r) => ({
    id: r.id,
    token: r.token,
    soldierName: r.soldier.fullName,
    phone: r.soldier.phone,
    sentAt: r.sentAt?.toISOString() ?? null,
    sentVia: r.sentVia,
    respondedAt: r.respondedAt?.toISOString() ?? null,
    items: r.items,
  }));
}

export async function markVerificationSent(requestId: string, via: "WHATSAPP" | "TELEGRAM") {
  const user = await requireUser();
  await prisma.verificationRequest.update({
    where: { id: requestId },
    data: { sentAt: new Date(), sentVia: via },
  });
  return { ok: true };
}

export async function sendTelegramVerification(requestId: string) {
  const user = await requireUser();
  const bId = user.battalionId!;

  const req = await prisma.verificationRequest.findUnique({
    where: { id: requestId },
    include: {
      soldier: { select: { fullName: true, telegramChatId: true } },
      battalion: { select: { telegramBotToken: true, name: true } },
      items: { select: { itemTypeName: true, serialNumber: true } },
    },
  });
  if (!req || !req.soldier.telegramChatId || !req.battalion.telegramBotToken) {
    return { error: "חייל או בוט טלגרם לא מוגדרים" };
  }

  const { sendTelegramMessage } = await import("@/lib/telegram");
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://palmy.co.il";

  const itemsList = req.items.map((i) => `• ${i.itemTypeName} (${i.serialNumber})`).join("\n");
  const text = `🔍 <b>אימות ציוד — ${req.battalion.name}</b>\n\nשלום ${req.soldier.fullName},\nנדרש אימות שהציוד הבא נמצא ברשותך:\n\n${itemsList}\n\n👉 <a href="${baseUrl}/verify/${req.token}">לחץ כאן לאימות</a>`;

  await sendTelegramMessage(req.battalion.telegramBotToken, req.soldier.telegramChatId, text);
  await prisma.verificationRequest.update({
    where: { id: requestId },
    data: { sentAt: new Date(), sentVia: "TELEGRAM" },
  });

  return { ok: true };
}

export async function deleteVerificationData(sessionId: string) {
  const user = await requireCapability("counts.manage");
  const bId = user.battalionId!;

  const session = await prisma.countSession.findUnique({ where: { id: sessionId } });
  if (!session || session.battalionId !== bId) return { error: "ספירה לא נמצאה" };

  const requests = await prisma.verificationRequest.findMany({
    where: { sessionId },
    select: { id: true },
  });
  if (requests.length === 0) return { error: "אין נתוני אימות לספירה זו" };

  await prisma.verificationItem.deleteMany({
    where: { requestId: { in: requests.map((r) => r.id) } },
  });
  await prisma.verificationRequest.deleteMany({ where: { sessionId } });

  await audit(user.id, "DELETE_VERIFICATION", "CountSession", sessionId);
  return { ok: true, deleted: requests.length };
}

export async function getVerificationStorageStats() {
  const user = await requireUser();
  const bId = user.battalionId!;

  const items = await prisma.verificationItem.findMany({
    where: { request: { battalionId: bId }, photoData: { not: null } },
    select: {
      photoData: true,
      request: { select: { sessionId: true, session: { select: { completedAt: true } } } },
    },
  });

  let totalBytes = 0;
  const bySessions = new Map<string, { bytes: number; completedAt: Date | null }>();
  for (const item of items) {
    const size = item.photoData ? item.photoData.length : 0;
    totalBytes += size;
    const sid = item.request.sessionId;
    const existing = bySessions.get(sid) || { bytes: 0, completedAt: item.request.session.completedAt };
    existing.bytes += size;
    bySessions.set(sid, existing);
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const oldSessions: { sessionId: string; bytes: number; completedAt: string }[] = [];
  for (const [sid, data] of bySessions) {
    if (data.completedAt && data.completedAt < thirtyDaysAgo) {
      oldSessions.push({ sessionId: sid, bytes: data.bytes, completedAt: data.completedAt.toISOString() });
    }
  }

  return {
    totalBytes,
    totalMB: Math.round(totalBytes / 1024 / 1024 * 10) / 10,
    photoCount: items.length,
    sessionCount: bySessions.size,
    oldSessions,
  };
}

export async function registerTelegramWebhook() {
  const user = await requireCapability("battalion.profile");
  const bId = user.battalionId!;

  const battalion = await prisma.battalion.findUnique({
    where: { id: bId },
    select: { telegramBotToken: true },
  });
  if (!battalion?.telegramBotToken) return { error: "טוקן בוט טלגרם לא מוגדר" };

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://palmy.co.il";
  const webhookUrl = `${baseUrl}/api/telegram/${bId}`;

  const res = await fetch(
    `https://api.telegram.org/bot${battalion.telegramBotToken}/setWebhook`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: webhookUrl }),
    },
  );
  const data = await res.json();
  if (!data.ok) return { error: `Telegram error: ${data.description}` };

  return { ok: true, webhookUrl };
}
