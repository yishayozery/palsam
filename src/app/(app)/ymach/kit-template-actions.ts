"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/guard";
import { audit } from "@/lib/audit";

/**
 * 📦 תבניות ארגז מבצעי — server actions.
 * תבנית = "מה צריך להיות בארגז" (רשימת פריטים + כמות + דגלי סריאלי/אצווה/תוקף).
 * גדודית: משותפת לכל הפלוגות. הרשאה: ymach.manage.
 */

export async function saveKitTemplate(_prev: unknown, fd: FormData) {
  const user = await requireCapability("ymach.manage");
  const bId = user.battalionId!;
  const id = (fd.get("id") as string)?.trim() || null;
  const name = (fd.get("name") as string)?.trim();
  const description = (fd.get("description") as string)?.trim() || null;
  if (!name) return { error: "יש להזין שם תבנית" };

  try {
    if (id) {
      const t = await prisma.kitTemplate.findFirst({ where: { id, battalionId: bId }, select: { id: true } });
      if (!t) return { error: "תבנית לא נמצאה" };
      await prisma.kitTemplate.update({ where: { id }, data: { name, description } });
    } else {
      const created = await prisma.kitTemplate.create({ data: { battalionId: bId, name, description }, select: { id: true } });
      await audit(user.id, "CREATE_KIT_TEMPLATE", "KitTemplate", created.id, { name });
    }
    revalidatePath("/ymach");
    return { ok: true as const };
  } catch (e) {
    // ההתנגשות הצפויה: @@unique([battalionId, name])
    if (e instanceof Error && e.message.includes("Unique")) return { error: "כבר קיימת תבנית בשם הזה" };
    return { error: e instanceof Error ? e.message : "שגיאה בשמירת תבנית" };
  }
}

export async function deleteKitTemplate(id: string) {
  const user = await requireCapability("ymach.manage");
  const bId = user.battalionId!;
  const t = await prisma.kitTemplate.findFirst({ where: { id, battalionId: bId }, select: { id: true, _count: { select: { kits: true } } } });
  if (!t) return { error: "תבנית לא נמצאה" };
  // מחיקת תבנית לא מוחקת ארגזים שכבר הוקמו ממנה (templateId → SetNull), אך נמנע
  // מלמחוק תבנית בשימוש פעיל כדי לא לאבד את ההקשר בשוגג.
  if (t._count.kits > 0) return { error: `התבנית בשימוש ב-${t._count.kits} ארגזים — לא ניתן למחוק` };
  await prisma.kitTemplate.delete({ where: { id } });
  await audit(user.id, "DELETE_KIT_TEMPLATE", "KitTemplate", id, {});
  revalidatePath("/ymach");
  return { ok: true as const };
}

/** הוספה/עדכון של שורת פריט בתבנית. */
export async function saveTemplateLine(fd: FormData) {
  const user = await requireCapability("ymach.manage");
  const bId = user.battalionId!;
  const templateId = (fd.get("templateId") as string)?.trim();
  const itemTypeId = (fd.get("itemTypeId") as string)?.trim();
  const quantity = Math.max(1, parseInt(String(fd.get("quantity") || "1"), 10) || 1);
  const requiresSerial = fd.get("requiresSerial") === "on";
  const requiresLot = fd.get("requiresLot") === "on";
  const requiresExpiry = fd.get("requiresExpiry") === "on";

  const t = await prisma.kitTemplate.findFirst({ where: { id: templateId, battalionId: bId }, select: { id: true } });
  if (!t) return { error: "תבנית לא נמצאה" };
  const item = await prisma.itemType.findFirst({ where: { id: itemTypeId, battalionId: bId }, select: { id: true } });
  if (!item) return { error: "פריט לא נמצא" };

  const existing = await prisma.kitTemplateLine.findUnique({ where: { templateId_itemTypeId: { templateId, itemTypeId } }, select: { id: true } });
  if (existing) {
    await prisma.kitTemplateLine.update({ where: { id: existing.id }, data: { quantity, requiresSerial, requiresLot, requiresExpiry } });
  } else {
    const max = await prisma.kitTemplateLine.aggregate({ where: { templateId }, _max: { sortOrder: true } });
    await prisma.kitTemplateLine.create({ data: { templateId, itemTypeId, quantity, requiresSerial, requiresLot, requiresExpiry, sortOrder: (max._max.sortOrder ?? 0) + 1 } });
  }
  revalidatePath("/ymach");
  return { ok: true as const };
}

export async function deleteTemplateLine(id: string) {
  const user = await requireCapability("ymach.manage");
  const bId = user.battalionId!;
  const line = await prisma.kitTemplateLine.findFirst({ where: { id, template: { battalionId: bId } }, select: { id: true } });
  if (!line) return;
  await prisma.kitTemplateLine.delete({ where: { id } });
  revalidatePath("/ymach");
}
