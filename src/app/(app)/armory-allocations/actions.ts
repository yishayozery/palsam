"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/guard";
import { audit } from "@/lib/audit";

export async function upsertAllocation(
  formData: FormData,
): Promise<{ ok?: boolean; error?: string }> {
  try {
    const user = await requireCapability("weapons.approve");
    const bId = user.battalionId!;
    const companyId = String(formData.get("companyId") || "");
    const itemTypeId = String(formData.get("itemTypeId") || "");
    const quantity = parseInt(String(formData.get("quantity") || "0"), 10);
    const blockOnExceed = formData.get("blockOnExceed") !== "false";
    if (!companyId || !itemTypeId) return { error: "פרמטרים חסרים" };
    if (quantity < 0) return { error: "כמות לא תקינה" };

    const company = await prisma.holder.findUnique({ where: { id: companyId }, select: { battalionId: true, kind: true } });
    if (!company || company.battalionId !== bId || company.kind !== "COMPANY") return { error: "פלוגה לא נמצאה" };

    if (quantity === 0) {
      await prisma.companyAllocation.deleteMany({ where: { companyId, itemTypeId } });
    } else {
      await prisma.companyAllocation.upsert({
        where: { companyId_itemTypeId: { companyId, itemTypeId } },
        update: { quantity, blockOnExceed, updatedById: user.id },
        create: { battalionId: bId, companyId, itemTypeId, quantity, blockOnExceed, updatedById: user.id },
      });
    }

    await audit(user.id, "UPDATE", "CompanyAllocation", `${companyId}:${itemTypeId}`, { quantity });
    revalidatePath("/armory-allocations");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "שגיאה" };
  }
}
