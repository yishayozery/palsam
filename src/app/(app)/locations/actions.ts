"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/guard";
import { audit } from "@/lib/audit";

export async function saveLocation(formData: FormData) {
  const user = await requireCapability("locations.manage");
  if (!user.holderId) return;
  const id = String(formData.get("id") || "");
  const column = String(formData.get("column") || "").trim();
  const row = String(formData.get("row") || "").trim();
  const label = String(formData.get("label") || "").trim() || null;
  if (!column || !row) return;

  if (id) {
    await prisma.storageLocation.update({ where: { id }, data: { column, row, label } });
  } else {
    // מניעת כפילות
    const exists = await prisma.storageLocation.findFirst({ where: { holderId: user.holderId, column, row } });
    if (exists) return;
    await prisma.storageLocation.create({ data: { holderId: user.holderId, column, row, label } });
  }
  await audit(user.id, id ? "UPDATE" : "CREATE", "StorageLocation", `${column}-${row}`);
  revalidatePath("/locations");
}

export async function deleteLocation(formData: FormData) {
  const user = await requireCapability("locations.manage");
  const id = String(formData.get("id") || "");
  const inUse =
    (await prisma.serialUnit.count({ where: { locationId: id } })) +
    (await prisma.stockBalance.count({ where: { locationId: id } }));
  if (inUse > 0) return;
  await prisma.storageLocation.delete({ where: { id } });
  await audit(user.id, "DELETE", "StorageLocation", id);
  revalidatePath("/locations");
}
