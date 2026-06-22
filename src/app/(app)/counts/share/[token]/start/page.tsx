import { redirect } from "next/navigation";
import { requireCapability } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export default async function StartFromShare({ params }: { params: Promise<{ token: string }> }) {
  const user = await requireCapability("counts.execute");
  const { token } = await params;

  const task = await prisma.countTask.findUnique({
    where: { shareToken: token },
    include: { holder: true },
  });
  if (!task || task.battalionId !== user.battalionId) {
    redirect("/counts");
  }
  if (task!.sessionId) {
    redirect(`/counts/${task!.sessionId}`);
  }

  const type = task!.holder.kind === "WAREHOUSE" ? "WAREHOUSE" : "COMPANY";
  const bId = task!.battalionId;
  const holderIds = [task!.holderId];

  let sessionId = "";
  await prisma.$transaction(async (tx) => {
    const session = await tx.countSession.create({
      data: { battalionId: bId, type, status: "IN_PROGRESS", startedById: user.id },
    });
    sessionId = session.id;

    await tx.countTask.update({
      where: { id: task!.id },
      data: { sessionId: session.id, status: "IN_PROGRESS", startedAt: new Date(), assignedUserId: user.id },
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

  await audit(user.id, "START_COUNT_FROM_SHARE", "CountTask", task!.id, { sessionId });
  redirect(`/counts/${sessionId}`);
}
