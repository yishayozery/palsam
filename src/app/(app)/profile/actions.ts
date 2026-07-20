"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCapability, requireScreenEdit } from "@/lib/guard";
import { audit } from "@/lib/audit";

export type ProfileState = { ok?: boolean; error?: string };

export async function updateProfile(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const user = await requireScreenEdit("settings");
  const bId = user.battalionId!;
  const name = String(formData.get("name") || "").trim();
  const code = String(formData.get("code") || "").trim();
  const brigade = String(formData.get("brigade") || "").trim() || null;
  const commander = String(formData.get("commander") || "").trim() || null;
  const motto = String(formData.get("motto") || "").trim() || null;
  const notes = String(formData.get("notes") || "").trim() || null;
  const rawLogo = String(formData.get("logoData") || "");
  const logoData = rawLogo === "__CLEAR__" ? null : rawLogo.startsWith("data:image") ? rawLogo : undefined;

  if (!name) return { error: "שם הגדוד חובה" };
  if (!code) return { error: "קוד הגדוד חובה" };
  if (brigade && !/^\d+$/.test(brigade)) return { error: "מספר חטיבה חייב להכיל ספרות בלבד" };

  // בדיקת ייחודיות לקוד (אם השתנה)
  const current = await prisma.battalion.findUnique({ where: { id: bId }, select: { code: true } });
  if (current && current.code !== code) {
    const dup = await prisma.battalion.findFirst({ where: { code, id: { not: bId } } });
    if (dup) return { error: `קוד "${code}" כבר בשימוש בגדוד אחר` };
  }

  const data: Record<string, unknown> = { name, code, brigade, commander, motto, notes };
  if (logoData !== undefined) data.logoData = logoData;

  try {
    await prisma.battalion.update({ where: { id: bId }, data });
  } catch {
    return { error: "שמירה נכשלה — ייתכן שהתמונה גדולה מדי" };
  }
  await audit(user.id, "UPDATE", "Battalion", bId);
  revalidatePath("/profile");
  revalidatePath("/", "layout");
  return { ok: true };
}
