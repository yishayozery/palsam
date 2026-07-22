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

/**
 * 📉 נתוני דוח חוסרים ברמת חייל — נטענים מהשרת כדי לא להיות תחומים למחסן
 * שנבחר בבורר. משתמש הנעול לפלוגה שלו רואה רק אותה; משתמש עם הרשאות
 * רחבות (בלי holder ספציפי / אדמין) רואה את **כל** הגדוד בדוח אחד.
 */
export type KitShortageRow = {
  kitName: string; kitNumber: string | null; status: string; item: string; sku: string | null;
  required: number; present: number; serialNumber: string | null; lotNumber: string | null; expiryDate: string | null;
};
export type KitShortageSoldier = { soldierId: string; name: string; rows: KitShortageRow[] };

export async function getKitShortages(): Promise<{ scope: "battalion" | "holder"; soldiers: KitShortageSoldier[] }> {
  const user = await requireCapability("ymach.manage");
  const bId = user.battalionId!;

  // תיחום זהה ללוגיקת העמוד: נעול לפלוגה רק אם ל-holder של המשתמש יש רשומה בגדוד.
  const own = user.holderId
    ? await prisma.holder.findFirst({ where: { id: user.holderId, battalionId: bId }, select: { id: true } })
    : null;
  const scopedHolderId = user.isAdmin ? null : own?.id ?? null;

  const kits = await prisma.operationalKit.findMany({
    where: {
      battalionId: bId, active: true,
      templateId: { not: null }, assignedSoldierId: { not: null },
      ...(scopedHolderId ? { holderId: scopedHolderId } : {}),
    },
    select: {
      name: true, kitNumber: true, status: true,
      assignedSoldierId: true, assignedSoldier: { select: { fullName: true } },
      items: { select: { quantity: true, present: true, presentQuantity: true, serialNumber: true, lotNumber: true, expiryDate: true, itemType: { select: { name: true, sku: true } } } },
    },
  });

  const bySoldier = new Map<string, KitShortageSoldier>();
  for (const k of kits) {
    if (!k.assignedSoldierId || !k.assignedSoldier) continue;
    const missing = k.items
      .map((it) => ({ it, present: it.present ? Math.min(it.presentQuantity, it.quantity) : 0 }))
      .filter(({ it, present }) => present < it.quantity)
      .map(({ it, present }) => ({
        kitName: k.name, kitNumber: k.kitNumber, status: k.status,
        item: it.itemType.name, sku: it.itemType.sku, required: it.quantity, present,
        serialNumber: it.serialNumber, lotNumber: it.lotNumber,
        expiryDate: it.expiryDate ? it.expiryDate.toISOString().slice(0, 10) : null,
      }));
    if (missing.length === 0) continue;
    const cur = bySoldier.get(k.assignedSoldierId) ?? { soldierId: k.assignedSoldierId, name: k.assignedSoldier.fullName, rows: [] };
    cur.rows.push(...missing);
    bySoldier.set(k.assignedSoldierId, cur);
  }
  const soldiers = [...bySoldier.values()].sort((a, b) => a.name.localeCompare(b.name));
  return { scope: scopedHolderId ? "holder" : "battalion", soldiers };
}

export async function deleteTemplateLine(id: string) {
  const user = await requireCapability("ymach.manage");
  const bId = user.battalionId!;
  const line = await prisma.kitTemplateLine.findFirst({ where: { id, template: { battalionId: bId } }, select: { id: true } });
  if (!line) return;
  await prisma.kitTemplateLine.delete({ where: { id } });
  revalidatePath("/ymach");
}

/**
 * הקמת ארגז מתבנית — יוצר את הארגז ופורש את שורות התבנית לפריטי-ארגז,
 * כל אחד מסומן present=false (עדיין לא סומן שקיים), presentQuantity=0,
 * ו-quantity = הכמות הנדרשת מהתבנית. משם המשתמש עובר צ'קליסט של יש/אין.
 */
export async function createKitFromTemplate(fd: FormData) {
  const user = await requireCapability("ymach.manage");
  const bId = user.battalionId!;
  const holderId = (fd.get("holderId") as string) || user.holderId;
  if (!holderId) return { error: "לא משויך לפלוגה" };
  const templateId = (fd.get("templateId") as string)?.trim();
  const name = (fd.get("name") as string)?.trim();
  const kitNumberIn = (fd.get("kitNumber") as string)?.trim() || null;

  const holder = await prisma.holder.findFirst({ where: { id: holderId, battalionId: bId }, select: { id: true } });
  if (!holder) return { error: "פלוגה לא תקינה" };
  const template = await prisma.kitTemplate.findFirst({
    where: { id: templateId, battalionId: bId },
    select: { id: true, name: true, lines: { select: { itemTypeId: true, quantity: true } } },
  });
  if (!template) return { error: "תבנית לא נמצאה" };

  const kitName = name || template.name;
  let kitNumber = kitNumberIn;
  if (!kitNumber) {
    const count = await prisma.operationalKit.count({ where: { holderId } });
    kitNumber = String(count + 1);
  }

  try {
    const kit = await prisma.operationalKit.create({
      data: {
        battalionId: bId, holderId, name: kitName, kitNumber, templateId: template.id,
        items: {
          create: template.lines.map((l) => ({
            itemTypeId: l.itemTypeId, quantity: l.quantity, present: false, presentQuantity: 0,
          })),
        },
      },
      select: { id: true },
    });
    await audit(user.id, "CREATE_KIT_FROM_TEMPLATE", "OperationalKit", kit.id, { templateId, lines: template.lines.length });
    revalidatePath("/ymach");
    return { ok: true as const, id: kit.id };
  } catch (e) {
    if (e instanceof Error && e.message.includes("Unique")) return { error: "כבר קיים ארגז בשם הזה בפלוגה" };
    return { error: e instanceof Error ? e.message : "שגיאה בהקמת ארגז" };
  }
}

/**
 * שמירת צ'קליסט הארגז — מעדכן פר-פריט את יש/אין, הכמות שנמצאה, ושדות
 * סריאלי/אצווה/תוקף. הקלט הוא JSON מקודד (מפני שמדובר במספר משתנה של שורות).
 */
export async function saveKitChecklist(kitId: string, rows: {
  itemTypeId: string; present: boolean; presentQuantity: number;
  serialNumber?: string | null; lotNumber?: string | null; expiryDate?: string | null;
}[]) {
  const user = await requireCapability("ymach.manage");
  const bId = user.battalionId!;
  const kit = await prisma.operationalKit.findFirst({ where: { id: kitId, battalionId: bId }, select: { id: true, holderId: true } });
  if (!kit) return { error: "ארגז לא נמצא" };
  if (user.holderId && kit.holderId !== user.holderId) return { error: "הארגז לא שייך לפלוגה שלך" };

  await prisma.$transaction(
    rows.map((r) =>
      prisma.operationalKitItem.updateMany({
        where: { kitId, itemTypeId: r.itemTypeId },
        data: {
          present: r.present,
          presentQuantity: Math.max(0, r.presentQuantity || 0),
          serialNumber: r.serialNumber?.trim() || null,
          lotNumber: r.lotNumber?.trim() || null,
          expiryDate: r.expiryDate ? new Date(r.expiryDate) : null,
        },
      }),
    ),
  );
  await audit(user.id, "SAVE_KIT_CHECKLIST", "OperationalKit", kitId, { rows: rows.length });
  revalidatePath("/ymach");
  return { ok: true as const };
}
