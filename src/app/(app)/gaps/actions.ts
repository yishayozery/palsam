"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/guard";
import { audit } from "@/lib/audit";
import { adjustQuantity } from "@/lib/inventory";

/** סגירת פער ע"י Admin — עם אפשרות יישור המלאי לכמות שנספרה */
export async function resolveDiscrepancy(formData: FormData) {
  const user = await requireCapability("gaps.resolve");
  const id = String(formData.get("id") || "");
  const resolution = String(formData.get("resolution") || "").trim() || "אושר ע\"י מנהל המערכת";
  const adjust = formData.get("adjust") === "on";

  const d = await prisma.discrepancy.findUnique({ where: { id } });
  if (!d || d.status === "RESOLVED") return;

  await prisma.$transaction(async (tx) => {
    if (adjust && d.holderId) {
      // יישור יתרת המלאי הכמותי לכמות שנספרה בפועל
      const status = await tx.itemStatus.findFirst({ where: { isDefault: true } })
        ?? await tx.itemStatus.findFirst({});
      if (status) {
        await adjustQuantity(tx, d.itemTypeId, d.holderId, status.id, d.diff);
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
