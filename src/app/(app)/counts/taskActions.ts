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

    const balances = await tx.stockBalance.findMany({
      where: { battalionId: bId, holderId: { in: holderIds }, quantity: { gt: 0 } },
    });
    for (const b of balances) {
      await tx.countLine.create({
        data: { sessionId: session.id, itemTypeId: b.itemTypeId, holderId: b.holderId, expectedQty: b.quantity },
      });
    }
    const units = await tx.serialUnit.findMany({
      where: { battalionId: bId, currentHolderId: { in: holderIds }, dischargedAt: null },
    });
    for (const u of units) {
      await tx.countLine.create({
        data: { sessionId: session.id, itemTypeId: u.itemTypeId, holderId: u.currentHolderId, serialUnitId: u.id, expectedQty: u.lotQuantity ?? 1 },
      });
    }
  });

  await audit(user.id, "START_COUNT_FROM_TASK", "CountTask", taskId, { sessionId });
  redirect(`/counts/${sessionId}`);
}
