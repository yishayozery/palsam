"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guard";
import { can } from "@/lib/rbac";
import { audit } from "@/lib/audit";

export async function saveKit(formData: FormData) {
  const user = await requireUser();
  if (!can(user, "signatures.manage") || !user.holderId) return;
  const bId = user.battalionId!;
  const id = String(formData.get("id") || "");
  const name = String(formData.get("name") || "").trim();
  if (!name) return;

  // קווי הערכה: lines[i].itemTypeId + lines[i].quantity
  const itemIds = formData.getAll("itemTypeId").map(String);
  const qtys = formData.getAll("quantity").map((v) => Math.max(1, parseInt(String(v), 10) || 1));
  const lines = itemIds.map((iid, i) => ({ itemTypeId: iid, quantity: qtys[i] || 1 })).filter((l) => l.itemTypeId);

  try {
    if (id) {
      const row = await prisma.signableKit.findUnique({ where: { id }, select: { battalionId: true } });
      if (!row || row.battalionId !== bId) return;
      await prisma.signableKit.update({ where: { id }, data: { name } });
      await prisma.signableKitLine.deleteMany({ where: { kitId: id } });
      for (const l of lines) await prisma.signableKitLine.create({ data: { kitId: id, ...l } });
    } else {
      const kit = await prisma.signableKit.create({ data: { battalionId: bId, holderId: user.holderId, name } });
      for (const l of lines) await prisma.signableKitLine.create({ data: { kitId: kit.id, ...l } });
    }
    await audit(user.id, id ? "UPDATE" : "CREATE", "SignableKit", id || name);
  } catch { /* duplicate name */ }
  revalidatePath("/kits");
}

export async function deleteKit(formData: FormData) {
  const user = await requireUser();
  if (!can(user, "signatures.manage")) return;
  const id = String(formData.get("id") || "");
  const row = await prisma.signableKit.findUnique({ where: { id }, select: { battalionId: true } });
  if (!row || row.battalionId !== user.battalionId) return;
  await prisma.signableKit.delete({ where: { id } });
  await audit(user.id, "DELETE", "SignableKit", id);
  revalidatePath("/kits");
}
