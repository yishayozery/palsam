"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/guard";
import { audit } from "@/lib/audit";

export async function saveSoldier(formData: FormData) {
  const user = await requireCapability("company.manage");
  const bId = user.battalionId!;
  const id = String(formData.get("id") || "");
  const fullName = String(formData.get("fullName") || "").trim();
  const personalNumber = String(formData.get("personalNumber") || "").trim();
  const phone = String(formData.get("phone") || "").trim() || null;
  let companyId = String(formData.get("companyId") || "") || null;
  if (user.holderId && !companyId) companyId = user.holderId;
  if (!fullName || !personalNumber) return;

  const data = { fullName, personalNumber, phone, companyId };
  if (id) {
    await prisma.soldier.update({ where: { id }, data });
  } else {
    await prisma.soldier.create({ data: { ...data, battalionId: bId } });
  }
  await audit(user.id, id ? "UPDATE" : "CREATE", "Soldier", id || personalNumber);
  revalidatePath("/soldiers");
}

export async function toggleSoldier(formData: FormData) {
  const user = await requireCapability("company.manage");
  const id = String(formData.get("id") || "");
  const s = await prisma.soldier.findUnique({ where: { id } });
  if (!s) return;
  await prisma.soldier.update({ where: { id }, data: { active: !s.active } });
  await audit(user.id, "UPDATE", "Soldier", id, { active: !s.active });
  revalidatePath("/soldiers");
}
