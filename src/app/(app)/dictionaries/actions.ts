"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/guard";
import { audit } from "@/lib/audit";
import type { HolderType } from "@/generated/prisma";

async function guard() {
  return requireCapability("dictionaries.manage");
}

// ---------- קטגוריות ----------
export async function saveCategory(formData: FormData) {
  const user = await guard();
  const id = String(formData.get("id") || "");
  const name = String(formData.get("name") || "").trim();
  if (!name) return;
  if (id) {
    await prisma.category.update({ where: { id }, data: { name } });
  } else {
    await prisma.category.create({ data: { name } });
  }
  await audit(user.id, id ? "UPDATE" : "CREATE", "Category", id || name);
  revalidatePath("/dictionaries");
}

export async function deleteCategory(formData: FormData) {
  const user = await guard();
  const id = String(formData.get("id") || "");
  const count = await prisma.itemType.count({ where: { categoryId: id } });
  if (count > 0) return; // לא מוחקים קטגוריה בשימוש
  await prisma.category.delete({ where: { id } });
  await audit(user.id, "DELETE", "Category", id);
  revalidatePath("/dictionaries");
}

// ---------- סטטוסים ----------
export async function saveStatus(formData: FormData) {
  const user = await guard();
  const id = String(formData.get("id") || "");
  const name = String(formData.get("name") || "").trim();
  if (!name) return;
  const data = {
    name,
    isDefault: formData.get("isDefault") === "on",
    isWear: formData.get("isWear") === "on",
    isLoss: formData.get("isLoss") === "on",
    isConsumed: formData.get("isConsumed") === "on",
  };
  if (id) {
    await prisma.itemStatus.update({ where: { id }, data });
  } else {
    await prisma.itemStatus.create({ data });
  }
  await audit(user.id, id ? "UPDATE" : "CREATE", "ItemStatus", id || name);
  revalidatePath("/dictionaries");
}

export async function deleteStatus(formData: FormData) {
  const user = await guard();
  const id = String(formData.get("id") || "");
  const inUse =
    (await prisma.serialUnit.count({ where: { statusId: id } })) +
    (await prisma.stockBalance.count({ where: { statusId: id } }));
  if (inUse > 0) return;
  await prisma.itemStatus.delete({ where: { id } });
  await audit(user.id, "DELETE", "ItemStatus", id);
  revalidatePath("/dictionaries");
}

// ---------- תדירויות ----------
export async function saveFrequency(formData: FormData) {
  const user = await guard();
  const id = String(formData.get("id") || "");
  const name = String(formData.get("name") || "").trim();
  const intervalDays = parseInt(String(formData.get("intervalDays") || "7"), 10);
  if (!name) return;
  const data = { name, intervalDays: isNaN(intervalDays) ? 7 : intervalDays };
  if (id) {
    await prisma.countFrequency.update({ where: { id }, data });
  } else {
    await prisma.countFrequency.create({ data });
  }
  await audit(user.id, id ? "UPDATE" : "CREATE", "CountFrequency", id || name);
  revalidatePath("/dictionaries");
}

export async function deleteFrequency(formData: FormData) {
  const user = await guard();
  const id = String(formData.get("id") || "");
  await prisma.countFrequency.delete({ where: { id } });
  await audit(user.id, "DELETE", "CountFrequency", id);
  revalidatePath("/dictionaries");
}

// ---------- מבנה ארגוני (מחזיקים) ----------
export async function saveHolder(formData: FormData) {
  const user = await guard();
  const id = String(formData.get("id") || "");
  const name = String(formData.get("name") || "").trim();
  const type = String(formData.get("type") || "COMPANY") as HolderType;
  const code = String(formData.get("code") || "").trim() || null;
  if (!name) return;
  // שיוך אוטומטי תחת המחסן הגדודי
  const warehouse = await prisma.holder.findFirst({ where: { type: "WAREHOUSE" } });
  if (id) {
    await prisma.holder.update({ where: { id }, data: { name, type, code } });
  } else {
    await prisma.holder.create({
      data: { name, type, code, parentId: type === "WAREHOUSE" ? null : warehouse?.id },
    });
  }
  await audit(user.id, id ? "UPDATE" : "CREATE", "Holder", id || name);
  revalidatePath("/dictionaries");
}

export async function toggleHolder(formData: FormData) {
  const user = await guard();
  const id = String(formData.get("id") || "");
  const h = await prisma.holder.findUnique({ where: { id } });
  if (!h) return;
  await prisma.holder.update({ where: { id }, data: { active: !h.active } });
  await audit(user.id, "UPDATE", "Holder", id, { active: !h.active });
  revalidatePath("/dictionaries");
}
