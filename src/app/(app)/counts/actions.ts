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
  const user = await requireUser();
  const bId = user.battalionId!;
  const sessionId = String(formData.get("sessionId") || "");
  const session = await prisma.countSession.findUnique({ where: { id: sessionId }, include: { lines: true } });
  if (!session || session.status === "COMPLETED") return;

  await prisma.$transaction(async (tx) => {
    for (const line of session.lines) {
      const raw = formData.get(`count:${line.id}`);
      if (raw === null || String(raw) === "") continue;
      const counted = parseInt(String(raw), 10);
      if (isNaN(counted)) continue;
      await tx.countLine.update({ where: { id: line.id }, data: { countedQty: counted } });
      if (counted !== line.expectedQty) {
        await tx.discrepancy.create({
          data: { battalionId: bId, sessionId: session.id, itemTypeId: line.itemTypeId, holderId: line.holderId, expectedQty: line.expectedQty, countedQty: counted, diff: counted - line.expectedQty, kind: counted < line.expectedQty ? "LOSS" : "SURPLUS", status: "OPEN" },
        });
      }
    }
    await tx.countSession.update({ where: { id: sessionId }, data: { status: "COMPLETED", completedAt: new Date() } });
  });

  await audit(user.id, "SUBMIT_COUNT", "CountSession", sessionId);
  revalidatePath("/counts");
  redirect("/gaps");
}
