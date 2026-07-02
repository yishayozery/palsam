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

/** פתיחת ספירה — יוצר תכנית חד-פעמית + משימה ומתחיל ספירה. */
export async function startCount(formData: FormData) {
  const user = await requireCapability("counts.execute");
  const bId = user.battalionId!;
  const type = String(formData.get("type") || "WAREHOUSE") as CountType;
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

  const typeLabel = type === "WAREHOUSE" ? "מחסן" : type === "COMPANY" ? "פלוגתית" : "רוחבית";
  const now = new Date();

  // 1. יצירת תכנית חד-פעמית
  const plan = await prisma.countPlan.create({
    data: {
      battalionId: bId,
      name: `ספירה ${typeLabel} — ${now.toLocaleDateString("he-IL")}`,
      frequencyDays: 0,
      graceMinutes: 1440,
      scopeHolderIds: holderIds,
      active: false, // חד-פעמית — לא ייצור משימות נוספות
      createdById: user.id,
      responsibleUserId: user.id,
    },
  });

  // 2. יצירת משימות + התחלת ספירה לכל מחזיק
  let firstSessionId = "";
  for (const hId of holderIds) {
    const task = await prisma.countTask.create({
      data: {
        battalionId: bId,
        planId: plan.id,
        holderId: hId,
        assignedUserId: user.id,
        scheduledAt: now,
        dueAt: new Date(now.getTime() + 1440 * 60 * 1000),
        status: "PENDING",
      },
      include: { holder: true, plan: true },
    });

    const holder = task.holder;
    const sessionType = holder.kind === "WAREHOUSE" ? "WAREHOUSE" : "COMPANY";
    const session = await prisma.countSession.create({
      data: { battalionId: bId, type: sessionType, status: type === "GLOBAL" ? "FROZEN" : "IN_PROGRESS", frozen: type === "GLOBAL", startedById: user.id },
    });

    await prisma.countTask.update({
      where: { id: task.id },
      data: { sessionId: session.id, status: "IN_PROGRESS", startedAt: now },
    });

    const balances = await prisma.stockBalance.findMany({ where: { battalionId: bId, holderId: hId, quantity: { gt: 0 } } });
    for (const b of balances) {
      await prisma.countLine.create({ data: { sessionId: session.id, itemTypeId: b.itemTypeId, holderId: b.holderId, expectedQty: b.quantity } });
    }
    const unitWhere: Record<string, unknown> = { battalionId: bId, currentHolderId: hId, dischargedAt: null };
    if (type === "GLOBAL") {
      unitWhere.OR = [{ currentHolderId: hId }, { signedSoldierId: { not: null } }];
      delete unitWhere.currentHolderId;
    }
    const units = await prisma.serialUnit.findMany({ where: unitWhere });
    for (const u of units) {
      await prisma.countLine.create({ data: { sessionId: session.id, itemTypeId: u.itemTypeId, holderId: u.currentHolderId, serialUnitId: u.id, expectedQty: u.lotQuantity ?? 1 } });
    }

    if (!firstSessionId) firstSessionId = session.id;
  }

  await audit(user.id, "START_COUNT", "CountPlan", plan.id, { type, holders: holderIds.length });
  redirect(`/counts/${firstSessionId}`);
}

/** סיום ספירה — חישוב פערים. */
export async function submitCount(formData: FormData) {
  const user = await requireCapability("counts.execute");
  const bId = user.battalionId!;
  const sessionId = String(formData.get("sessionId") || "");
  const session = await prisma.countSession.findUnique({
    where: { id: sessionId },
    include: { lines: { include: { serialUnit: { select: { serialNumber: true } } } } },
  });
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

  // איסוף מספרים סריאליים שהוזנו בספירה (normal mode: sn:, blind mode: enteredSerial:)
  const enteredSerials = new Map<string, string>();
  for (const [key, val] of formData.entries()) {
    if (key.startsWith("sn:") || key.startsWith("enteredSerial:")) {
      const lineId = key.startsWith("sn:") ? key.slice("sn:".length) : key.slice("enteredSerial:".length);
      const sn = String(val).trim();
      if (lineId && sn) enteredSerials.set(lineId, sn);
    }
  }

  // איסוף תמונות (blind mode)
  const enteredPhotos = new Map<string, string>();
  for (const [key, val] of formData.entries()) {
    if (key.startsWith("photo:")) {
      const lineId = key.slice("photo:".length);
      const data = String(val).trim();
      if (lineId && data && data.startsWith("data:")) enteredPhotos.set(lineId, data);
    }
  }

  await prisma.$transaction(async (tx) => {
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

      // בדיקת התאמת מספר סריאלי
      const enteredSN = enteredSerials.get(line.id);
      const expectedSN = line.serialUnit?.serialNumber;
      const snMismatch = enteredSN && expectedSN && enteredSN !== expectedSN;

      let note = recounted ? "ספירה חוזרת בוצעה" : null;
      if (snMismatch) {
        note = `${note ? note + " | " : ""}אי-התאמת סריאלי: הוקלד "${enteredSN}" במקום "${expectedSN}"`;
      } else if (enteredSN && expectedSN && enteredSN === expectedSN) {
        note = `${note ? note + " | " : ""}סריאלי אומת ✓`;
      }

      const photoData = enteredPhotos.get(line.id) ?? null;

      await tx.countLine.update({
        where: { id: line.id },
        data: {
          countedQty: counted,
          note,
          enteredSerial: enteredSN || null,
          photoData,
        },
      });

      const isQtyGap = counted !== line.expectedQty;
      if (isQtyGap || snMismatch) {
        await tx.discrepancy.create({
          data: {
            battalionId: bId, sessionId: session.id, itemTypeId: line.itemTypeId, holderId: line.holderId,
            expectedQty: line.expectedQty, countedQty: counted, diff: counted - line.expectedQty,
            kind: snMismatch && !isQtyGap ? "LOSS" : (counted < line.expectedQty ? "LOSS" : "SURPLUS"),
            status: "OPEN",
            resolution: snMismatch
              ? `אי-התאמת מס׳ סריאלי: "${enteredSN}" במקום "${expectedSN}"${recounted ? " (ספירה חוזרת)" : ""}`
              : recounted ? "ספירה חוזרת אומתה — פער אמיתי" : null,
          },
        });
      }
    }
    await tx.countSession.update({ where: { id: sessionId }, data: { status: "COMPLETED", completedAt: new Date() } });
  }, { timeout: 30000 });

  await audit(user.id, "SUBMIT_COUNT", "CountSession", sessionId);
  revalidatePath("/counts");
  redirect(`/counts/${sessionId}/report`);
}

export async function createVerificationRequests(
  sessionId: string,
  itemTypeIds: string[],
  mode: string = "CONFIRM",
) {
  const user = await requireCapability("counts.execute");
  const bId = user.battalionId!;

  const session = await prisma.countSession.findUnique({ where: { id: sessionId } });
  if (!session || session.battalionId !== bId) return { error: "ספירה לא נמצאה" };

  const vMode = mode as "CONFIRM" | "SERIAL_ENTRY" | "LOCATION" | "QUANTITY_CONFIRM" | "BLIND_COUNT" | "BATCH";

  // --- חיילים: פריטים סריאליים חתומים ---
  const serialUnits = await prisma.serialUnit.findMany({
    where: {
      battalionId: bId,
      itemTypeId: { in: itemTypeIds },
      signedSoldierId: { not: null },
      dischargedAt: null,
    },
    include: {
      signedSoldier: { select: { id: true, fullName: true, phone: true, telegramChatId: true, companyId: true } },
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

  let soldierCount = 0;
  for (const [soldierId, units] of bySoldier) {
    const existing = await prisma.verificationRequest.findFirst({ where: { sessionId, soldierId } });
    if (existing) continue;

    await prisma.verificationRequest.create({
      data: {
        battalionId: bId,
        sessionId,
        soldierId,
        mode: vMode,
        items: {
          create: units.map((u) => ({
            serialUnitId: u.id,
            itemTypeName: u.itemType.name,
            serialNumber: u.serialNumber,
          })),
        },
      },
    });
    soldierCount++;
  }

  // --- פלוגות/מחסנים: פריטים שלא חתומים על חייל (נמצאים ב-holder) ---
  const holderUnits = await prisma.serialUnit.findMany({
    where: {
      battalionId: bId,
      itemTypeId: { in: itemTypeIds },
      signedSoldierId: null,
      currentHolderId: { not: null },
      dischargedAt: null,
    },
    include: {
      currentHolder: { select: { id: true, name: true, kind: true } },
      itemType: { select: { name: true } },
    },
  });

  const byHolder = new Map<string, typeof holderUnits>();
  for (const su of holderUnits) {
    if (!su.currentHolderId) continue;
    const arr = byHolder.get(su.currentHolderId) || [];
    arr.push(su);
    byHolder.set(su.currentHolderId, arr);
  }

  let holderCount = 0;
  for (const [holderId, units] of byHolder) {
    const existing = await prisma.verificationRequest.findFirst({ where: { sessionId, holderId } });
    if (existing) continue;

    await prisma.verificationRequest.create({
      data: {
        battalionId: bId,
        sessionId,
        holderId,
        mode: vMode,
        items: {
          create: units.map((u) => ({
            serialUnitId: u.id,
            itemTypeName: u.itemType.name,
            serialNumber: u.serialNumber,
          })),
        },
      },
    });
    holderCount++;
  }

  // --- כמות (StockBalance) לפלוגות/מחסנים עבור QUANTITY_CONFIRM / BLIND_COUNT ---
  let stockCount = 0;
  if (vMode === "QUANTITY_CONFIRM" || vMode === "BLIND_COUNT") {
    const stockBalances = await prisma.stockBalance.findMany({
      where: {
        battalionId: bId,
        itemTypeId: { in: itemTypeIds },
        quantity: { gt: 0 },
      },
      include: {
        holder: { select: { id: true, name: true } },
        itemType: { select: { name: true } },
      },
    });

    const byStockHolder = new Map<string, typeof stockBalances>();
    for (const sb of stockBalances) {
      const arr = byStockHolder.get(sb.holderId) || [];
      arr.push(sb);
      byStockHolder.set(sb.holderId, arr);
    }

    for (const [holderId, balances] of byStockHolder) {
      const existing = await prisma.verificationRequest.findFirst({
        where: { sessionId, holderId, mode: vMode },
      });
      if (existing) continue;

      await prisma.verificationRequest.create({
        data: {
          battalionId: bId,
          sessionId,
          holderId,
          mode: vMode,
          items: {
            create: balances.map((sb) => ({
              itemTypeName: sb.itemType.name,
              expectedQuantity: vMode === "BLIND_COUNT" ? null : sb.quantity,
            })),
          },
        },
      });
      stockCount++;
    }
  }

  return { ok: true, soldierCount, holderCount, stockCount, total: soldierCount + holderCount + stockCount };
}

export async function getVerificationStatus(sessionId: string) {
  const user = await requireUser();
  const bId = user.battalionId!;

  const requests = await prisma.verificationRequest.findMany({
    where: { sessionId, battalionId: bId },
    include: {
      soldier: { select: { fullName: true, phone: true, telegramChatId: true, companyId: true, company: { select: { name: true } } } },
      holder: { select: { id: true, name: true, kind: true } },
      items: {
        select: {
          id: true, itemTypeName: true, serialNumber: true, status: true,
          photoData: true, note: true,
          expectedQuantity: true, reportedQuantity: true,
          reportedSerial: true, reportedLocation: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return requests.map((r) => ({
    id: r.id,
    token: r.token,
    mode: r.mode,
    soldierName: r.soldier?.fullName ?? null,
    holderName: r.holder?.name ?? null,
    holderKind: r.holder?.kind ?? null,
    companyName: r.soldier?.company?.name ?? r.holder?.name ?? null,
    phone: r.soldier?.phone ?? null,
    hasTelegram: !!(r.soldier?.telegramChatId),
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

  const req = await prisma.verificationRequest.findUnique({
    where: { id: requestId },
    include: {
      soldier: { select: { fullName: true, telegramChatId: true } },
      battalion: { select: { telegramBotToken: true, name: true } },
      items: { select: { id: true, itemTypeName: true, serialNumber: true, expectedQuantity: true } },
    },
  });
  if (!req || !req.soldier?.telegramChatId || !req.battalion.telegramBotToken) {
    return { error: "חייל או בוט טלגרם לא מוגדרים" };
  }

  const { sendTelegramMessage } = await import("@/lib/telegram");
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.palmy.co.il";

  const fmtItem = (i: { itemTypeName: string; serialNumber: string | null }) =>
    i.serialNumber ? `• <b>${i.itemTypeName}</b>\n   🔢 <code>${i.serialNumber}</code>` : `• <b>${i.itemTypeName}</b>`;

  const itemsList = req.items.map(fmtItem).join("\n");

  // CONFIRM mode — inline buttons per item inside Telegram
  if (req.mode === "CONFIRM") {
    const lines: string[] = [
      `🔍 <b>אימות ציוד — ${req.battalion.name}</b>`,
      ``,
      `שלום ${req.soldier.fullName},`,
      `סמן/י עבור כל פריט האם נמצא ברשותך:`,
      ``,
    ];
    for (const i of req.items) {
      lines.push(fmtItem(i));
    }

    const buttons = req.items.map((i) => ([
      { text: `✅ נמצא — ${i.itemTypeName}${i.serialNumber ? ` (${i.serialNumber})` : ""}`, callback_data: `verify:${i.id}:found` },
      { text: `❌ חסר`, callback_data: `verify:${i.id}:denied` },
    ]));

    await sendTelegramMessage(req.battalion.telegramBotToken, req.soldier.telegramChatId, lines.join("\n"), { inline_keyboard: buttons });

  // BATCH mode — single confirm/deny for all items
  } else if (req.mode === "BATCH") {
    const text = `🔍 <b>אימות ציוד — ${req.battalion.name}</b>\n\nשלום ${req.soldier.fullName},\nהאם כל הפריטים הבאים נמצאים ברשותך?\n\n${itemsList}`;
    await sendTelegramMessage(req.battalion.telegramBotToken, req.soldier.telegramChatId, text, {
      inline_keyboard: [
        [
          { text: "✅ הכל נמצא", callback_data: `vbatch:${req.id}:confirm` },
          { text: "❌ חסרים פריטים", callback_data: `vbatch:${req.id}:deny` },
        ],
      ],
    });

  // Other modes — link to web form
  } else {
    const text = `🔍 <b>אימות ציוד — ${req.battalion.name}</b>\n\nשלום ${req.soldier.fullName},\nנדרש אימות שהציוד הבא נמצא ברשותך:\n\n${itemsList}\n\n👉 <a href="${baseUrl}/verify/${req.token}">לחץ כאן לאימות</a>`;
    await sendTelegramMessage(req.battalion.telegramBotToken, req.soldier.telegramChatId, text);
  }

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

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.palmy.co.il";
  const webhookUrl = `${baseUrl}/api/telegram/${bId}`;

  const token = battalion.telegramBotToken;
  const apiBase = `https://api.telegram.org/bot${token}`;

  const res = await fetch(`${apiBase}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: webhookUrl }),
  });
  const data = await res.json();
  if (!data.ok) return { error: `Telegram error: ${data.description}` };

  await fetch(`${apiBase}/setMyCommands`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      commands: [
        { command: "start", description: "הרשמה למערכת" },
        { command: "status", description: "📋 טפסים להחתמה — סטטוס שלבים" },
        { command: "equipment", description: "📦 רשימת ציוד חתום" },
        { command: "counts", description: "📊 ספירות מלאי" },
        { command: "info", description: "ℹ️ מידע כללי" },
        { command: "help", description: "❓ עזרה ותפריט" },
      ],
    }),
  });

  // כפתור תפריט ☰ ליד שדה הטקסט
  await fetch(`${apiBase}/setChatMenuButton`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      menu_button: { type: "commands" },
    }),
  });

  // שמירת username הבוט
  let botUsername: string | null = null;
  try {
    const meRes = await fetch(`${apiBase}/getMe`);
    const meData = await meRes.json();
    if (meData.ok && meData.result?.username) {
      botUsername = meData.result.username;
      await prisma.battalion.update({
        where: { id: bId },
        data: { telegramBotUsername: botUsername },
      });
    }
  } catch {}

  return { ok: true, webhookUrl, botUsername };
}
