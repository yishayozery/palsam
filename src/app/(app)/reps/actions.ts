"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/guard";
import { audit } from "@/lib/audit";

export async function saveRep(formData: FormData) {
  const user = await requireCapability("reps.manage");
  if (!user.holderId) return;
  const companyId = String(formData.get("companyId") || "");
  const repUserId = String(formData.get("repUserId") || "") || null;
  if (!companyId) return;

  await prisma.warehouseCompany.upsert({
    where: { warehouseId_companyId: { warehouseId: user.holderId, companyId } },
    create: { warehouseId: user.holderId, companyId, repUserId },
    update: { repUserId },
  });
  await audit(user.id, "UPDATE", "WarehouseCompany", `${user.holderId}:${companyId}`);
  revalidatePath("/reps");
}

export async function removeRep(formData: FormData) {
  const user = await requireCapability("reps.manage");
  const id = String(formData.get("id") || "");
  await prisma.warehouseCompany.delete({ where: { id } });
  await audit(user.id, "DELETE", "WarehouseCompany", id);
  revalidatePath("/reps");
}

/** העתקת רשימת פלוגות+נציגים ממחסן אחר */
export async function copyFromWarehouse(formData: FormData) {
  const user = await requireCapability("reps.manage");
  if (!user.holderId) return;
  const sourceWarehouseId = String(formData.get("sourceWarehouseId") || "");
  if (!sourceWarehouseId || sourceWarehouseId === user.holderId) return;

  const source = await prisma.warehouseCompany.findMany({ where: { warehouseId: sourceWarehouseId } });
  for (const link of source) {
    await prisma.warehouseCompany.upsert({
      where: { warehouseId_companyId: { warehouseId: user.holderId, companyId: link.companyId } },
      create: { warehouseId: user.holderId, companyId: link.companyId, repUserId: link.repUserId },
      update: { repUserId: link.repUserId },
    });
  }
  await audit(user.id, "COPY_REPS", "WarehouseCompany", user.holderId, { from: sourceWarehouseId, count: source.length });
  revalidatePath("/reps");
}
