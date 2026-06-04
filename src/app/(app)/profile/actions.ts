"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/guard";
import { audit } from "@/lib/audit";

export async function updateProfile(formData: FormData) {
  const user = await requireCapability("battalion.profile");
  const bId = user.battalionId!;
  const name = String(formData.get("name") || "").trim();
  const commander = String(formData.get("commander") || "").trim() || null;
  const notes = String(formData.get("notes") || "").trim() || null;
  const rawLogo = String(formData.get("logoData") || "");
  const logoData = rawLogo === "__CLEAR__" ? null : rawLogo.startsWith("data:image") ? rawLogo : undefined;

  const data: Record<string, unknown> = {};
  if (name) data.name = name;
  data.commander = commander;
  data.notes = notes;
  if (logoData !== undefined) data.logoData = logoData;

  await prisma.battalion.update({ where: { id: bId }, data });
  await audit(user.id, "UPDATE", "Battalion", bId);
  revalidatePath("/profile");
  revalidatePath("/", "layout");
}
