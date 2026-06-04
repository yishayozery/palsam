"use server";

import { revalidatePath } from "next/cache";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/guard";
import { hashPassword } from "@/lib/auth";
import { audit } from "@/lib/audit";

/** קצין מחסן מזמין רס"פ חדש לפלוגה + מקשר אותו למחסן שלו (אונבורדינג בהזמנה) */
export async function inviteRep(formData: FormData) {
  const user = await requireCapability("reps.manage");
  const bId = user.battalionId!;
  if (!user.holderId) return;
  const companyId = String(formData.get("companyId") || "");
  const fullName = String(formData.get("fullName") || "").trim();
  const username = String(formData.get("username") || "").trim();
  const phone = String(formData.get("phone") || "").trim() || null;
  if (!companyId || !fullName || !username) return;

  const exists = await prisma.appUser.findUnique({ where: { username } });
  if (exists) return;

  const rep = await prisma.appUser.create({
    data: {
      username, fullName, phone, role: "COMPANY_REP", battalionId: bId, holderId: companyId,
      passwordHash: await hashPassword(nanoid(32)), passwordSet: false, inviteToken: nanoid(28),
    },
  });
  // קישור הרס"פ לפלוגה מול המחסן הנוכחי
  await prisma.warehouseCompany.upsert({
    where: { warehouseId_companyId: { warehouseId: user.holderId, companyId } },
    create: { warehouseId: user.holderId, companyId, repUserId: rep.id },
    update: { repUserId: rep.id },
  });
  await audit(user.id, "INVITE_REP", "AppUser", username, { companyId });
  revalidatePath("/reps");
}

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
