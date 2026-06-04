"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/guard";
import { audit } from "@/lib/audit";
import type { WarehouseType } from "@/generated/prisma";

export async function createWarehouse(formData: FormData) {
  const user = await requireCapability("org.manage");
  const bId = user.battalionId!;
  const name = String(formData.get("name") || "").trim();
  const warehouseType = String(formData.get("warehouseType") || "EQUIPMENT") as WarehouseType;
  if (!name) return;
  const wh = await prisma.holder.create({ data: { battalionId: bId, kind: "WAREHOUSE", warehouseType, name } });
  // קישור אוטומטי לכל הפלוגות הקיימות
  const companies = await prisma.holder.findMany({ where: { battalionId: bId, kind: "COMPANY" } });
  for (const c of companies) {
    await prisma.warehouseCompany.create({ data: { warehouseId: wh.id, companyId: c.id } });
  }
  await audit(user.id, "CREATE", "Holder", name, { kind: "WAREHOUSE", warehouseType });
  revalidatePath("/org");
}

export async function createCompany(formData: FormData) {
  const user = await requireCapability("org.manage");
  const bId = user.battalionId!;
  const name = String(formData.get("name") || "").trim();
  if (!name) return;
  const c = await prisma.holder.create({ data: { battalionId: bId, kind: "COMPANY", name } });
  // קישור הפלוגה לכל המחסנים
  const whs = await prisma.holder.findMany({ where: { battalionId: bId, kind: "WAREHOUSE" } });
  for (const w of whs) {
    await prisma.warehouseCompany.create({ data: { warehouseId: w.id, companyId: c.id } });
  }
  await audit(user.id, "CREATE", "Holder", name, { kind: "COMPANY" });
  revalidatePath("/org");
}

export async function renameHolder(formData: FormData) {
  const user = await requireCapability("org.manage");
  const id = String(formData.get("id") || "");
  const name = String(formData.get("name") || "").trim();
  if (!name) return;
  await prisma.holder.update({ where: { id }, data: { name } });
  await audit(user.id, "UPDATE", "Holder", id, { name });
  revalidatePath("/org");
}

export async function toggleHolder(formData: FormData) {
  const user = await requireCapability("org.manage");
  const id = String(formData.get("id") || "");
  const h = await prisma.holder.findUnique({ where: { id } });
  if (!h) return;
  await prisma.holder.update({ where: { id }, data: { active: !h.active } });
  await audit(user.id, "UPDATE", "Holder", id, { active: !h.active });
  revalidatePath("/org");
}
