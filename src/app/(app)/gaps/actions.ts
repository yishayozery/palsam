"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guard";
import { can } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { adjustQuantity } from "@/lib/inventory";

/** סגירת פער — מי שיש לו gaps.resolve, או מי שהתחיל את הספירה */
export async function resolveDiscrepancy(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") || "");

  const d = await prisma.discrepancy.findUnique({
    where: { id },
    include: { session: { select: { startedById: true } } },
  });
  if (!d || d.status === "RESOLVED" || d.battalionId !== user.battalionId) return;

  const hasGapsResolve = can(user, "gaps.resolve");
  const isCountCreator = d.session?.startedById === user.id;
  if (!hasGapsResolve && !isCountCreator) return;

  const resolution = String(formData.get("resolution") || "").trim()
    || (isCountCreator ? "אושר ע\"י מחולל הספירה" : "אושר ע\"י מנהל");
  const adjust = formData.get("adjust") === "on";

  await prisma.$transaction(async (tx) => {
    if (adjust && d.holderId) {
      const status = await tx.itemStatus.findFirst({ where: { battalionId: d.battalionId, isDefault: true } })
        ?? await tx.itemStatus.findFirst({ where: { battalionId: d.battalionId } });
      if (status) {
        await adjustQuantity(tx, d.battalionId, d.itemTypeId, d.holderId, status.id, d.diff);
      }
    }
    await tx.discrepancy.update({
      where: { id },
      data: { status: "RESOLVED", resolution, resolvedById: user.id, resolvedAt: new Date() },
    });
  });

  await audit(user.id, "RESOLVE_GAP", "Discrepancy", id, { resolution, adjust });
  revalidatePath("/gaps");
}
