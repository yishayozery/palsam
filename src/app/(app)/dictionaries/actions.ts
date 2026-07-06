"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/guard";
import { audit } from "@/lib/audit";
import type { WarehouseType } from "@/generated/prisma";

async function guard() {
  return requireCapability("dictionaries.manage");
}

// ---------- קטגוריות (לפי טיפוס מחסן) ----------
export async function saveCategory(formData: FormData) {
  const user = await guard();
  const bId = user.battalionId!;
  const id = String(formData.get("id") || "");
  const name = String(formData.get("name") || "").trim();
  const warehouseType = String(formData.get("warehouseType") || "EQUIPMENT") as WarehouseType;
  const maxRaw = parseInt(String(formData.get("maxPerSoldier") || ""), 10);
  const maxPerSoldier = maxRaw > 0 ? maxRaw : null;
  if (!name) return;
  if (id) {
    await prisma.category.update({ where: { id }, data: { name, warehouseType, maxPerSoldier } });
  } else {
    await prisma.category.create({ data: { battalionId: bId, name, warehouseType, maxPerSoldier } });
  }
  await audit(user.id, id ? "UPDATE" : "CREATE", "Category", id || name);
  revalidatePath("/dictionaries");
}

export async function deleteCategory(formData: FormData) {
  const user = await guard();
  const id = String(formData.get("id") || "");
  const count = await prisma.itemType.count({ where: { categoryId: id } });
  if (count > 0) return;
  await prisma.category.delete({ where: { id } });
  await audit(user.id, "DELETE", "Category", id);
  revalidatePath("/dictionaries");
}

// ---------- סטטוסים ----------
export async function saveStatus(formData: FormData) {
  const user = await guard();
  const bId = user.battalionId!;
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
  // 🛡️ מניעת כפילות שם בגדוד (case-insensitive)
  const dup = await prisma.itemStatus.findFirst({
    where: { battalionId: bId, name: { equals: name, mode: "insensitive" }, ...(id ? { NOT: { id } } : {}) },
    select: { id: true },
  });
  if (dup) throw new Error(`כבר קיים סטטוס בשם "${name}"`);
  if (id) {
    await prisma.itemStatus.update({ where: { id }, data });
  } else {
    await prisma.itemStatus.create({ data: { ...data, battalionId: bId } });
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
  const bId = user.battalionId!;
  const id = String(formData.get("id") || "");
  const name = String(formData.get("name") || "").trim();
  const intervalDays = parseInt(String(formData.get("intervalDays") || "7"), 10);
  if (!name) return;
  const data = { name, intervalDays: isNaN(intervalDays) ? 7 : intervalDays };
  if (id) {
    await prisma.countFrequency.update({ where: { id }, data });
  } else {
    await prisma.countFrequency.create({ data: { ...data, battalionId: bId } });
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
