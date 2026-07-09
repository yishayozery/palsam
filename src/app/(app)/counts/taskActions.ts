"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/guard";
import { audit } from "@/lib/audit";

/** התחלת ספירה ממשימת CountTask — מוליד CountSession + שורות ספירה ומחבר חזרה. */
export async function startCountFromTask(formData: FormData) {
  const user = await requireCapability("counts.execute");
  const taskId = String(formData.get("taskId") || "");
  if (!taskId) return;

  const task = await prisma.countTask.findUnique({
    where: { id: taskId },
    include: { holder: true, plan: true },
  });
  if (!task || task.battalionId !== user.battalionId) return;
  if (task.sessionId) {
    redirect(`/counts/${task.sessionId}`);
    return;
  }

  const type = task.holder.kind === "WAREHOUSE" ? "WAREHOUSE" : "COMPANY";
  const bId = task.battalionId;
  const holderIds = [task.holderId];

  const plan = task.plan;
  const scopeItemTypeIds = plan?.scopeItemTypeIds ?? [];
  const scopeCategoryIds = plan?.scopeCategoryIds ?? [];
  const trackingMethods = plan?.trackingMethods ?? [];

  const itemTypeFilter: Record<string, unknown> = {};
  if (scopeItemTypeIds.length > 0) itemTypeFilter.id = { in: scopeItemTypeIds };
  if (scopeCategoryIds.length > 0) itemTypeFilter.categoryId = { in: scopeCategoryIds };
  if (trackingMethods.length > 0) itemTypeFilter.trackingMethod = { in: trackingMethods };
  const hasItemFilter = Object.keys(itemTypeFilter).length > 0;

  let allowedItemTypeIds: string[] | null = null;
  if (hasItemFilter) {
    const matched = await prisma.itemType.findMany({
      where: { battalionId: bId, ...itemTypeFilter },
      select: { id: true },
    });
    allowedItemTypeIds = matched.map((m) => m.id);
  }

  let sessionId = "";
  await prisma.$transaction(async (tx) => {
    const session = await tx.countSession.create({
      data: { battalionId: bId, type, status: "IN_PROGRESS", startedById: user.id },
    });
    sessionId = session.id;

    await tx.countTask.update({
      where: { id: taskId },
      data: { sessionId: session.id, status: "IN_PROGRESS", startedAt: new Date() },
    });

    const balanceWhere: Record<string, unknown> = {
      battalionId: bId, holderId: { in: holderIds }, quantity: { gt: 0 },
    };
    if (allowedItemTypeIds) balanceWhere.itemTypeId = { in: allowedItemTypeIds };
    const balances = await tx.stockBalance.findMany({ where: balanceWhere });
    for (const b of balances) {
      await tx.countLine.create({
        data: { sessionId: session.id, itemTypeId: b.itemTypeId, holderId: b.holderId, expectedQty: b.quantity },
      });
    }

    // ספירת מחסן = רק מה שפיזית במחסן (לא חתום על חייל — החתומים נספרים בקסקדה האישית)
    const unitWhere: Record<string, unknown> = {
      battalionId: bId, currentHolderId: { in: holderIds }, dischargedAt: null, signedSoldierId: null,
    };
    if (allowedItemTypeIds) unitWhere.itemTypeId = { in: allowedItemTypeIds };
    const units = await tx.serialUnit.findMany({ where: unitWhere });
    for (const u of units) {
      await tx.countLine.create({
        data: { sessionId: session.id, itemTypeId: u.itemTypeId, holderId: u.currentHolderId, serialUnitId: u.id, expectedQty: u.lotQuantity ?? 1 },
      });
    }
  });

  await audit(user.id, "START_COUNT_FROM_TASK", "CountTask", taskId, { sessionId });
  redirect(`/counts/${sessionId}`);
}

/** האצלת משימת ספירה למשתמש אחר */
export async function delegateCountTask(formData: FormData) {
  const user = await requireCapability("counts.execute");
  const taskId = String(formData.get("taskId") || "");
  const newUserId = String(formData.get("newUserId") || "");
  if (!taskId || !newUserId) return;

  const task = await prisma.countTask.findUnique({
    where: { id: taskId },
    include: { holder: true, plan: { select: { name: true } } },
  });
  if (!task || task.battalionId !== user.battalionId) return;
  if (task.sessionId) return; // already started

  const newUser = await prisma.appUser.findUnique({
    where: { id: newUserId },
    select: { id: true, fullName: true, battalionId: true, soldier: { select: { telegramChatId: true } } },
  });
  if (!newUser || newUser.battalionId !== user.battalionId) return;

  await prisma.countTask.update({
    where: { id: taskId },
    data: { assignedUserId: newUserId },
  });

  await audit(user.id, "DELEGATE_COUNT_TASK", "CountTask", taskId, {
    from: user.id,
    to: newUserId,
    toName: newUser.fullName,
  });

  // notify new assignee via Telegram
  const chatId = newUser.soldier?.telegramChatId;
  if (chatId) {
    const battalion = await prisma.battalion.findUnique({
      where: { id: user.battalionId! },
      select: { telegramBotToken: true },
    });
    if (battalion?.telegramBotToken) {
      const { sendTelegramMessage } = await import("@/lib/telegram");
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.palmy.co.il";
      const due = task.dueAt.toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
      const text = [
        `🔄 <b>הואצלה אליך משימת ספירה</b>`,
        ``,
        `מחזיק: <b>${task.holder.name}</b>`,
        `תכנית: ${task.plan?.name ?? "ספירה"}`,
        `עד: ${due}`,
        `הואצל ע״י: ${user.fullName ?? ""}`,
        ``,
        `👉 <a href="${baseUrl}/counts/share/${task.shareToken}">לחץ כאן לביצוע</a>`,
      ].join("\n");
      await sendTelegramMessage(battalion.telegramBotToken, chatId, text).catch(() => {});
    }
  }

  const { revalidatePath } = await import("next/cache");
  revalidatePath("/counts");
}
