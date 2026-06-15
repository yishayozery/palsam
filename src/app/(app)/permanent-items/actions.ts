"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/guard";
import { audit } from "@/lib/audit";

/** מפמ קובע/מעדכן כמות בסיס לפריט בפלוגה. 0 = הציוד חוזר, >0 = נשאר. */
export async function setBaseline(formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  try {
    const user = await requireCapability("battalion.profile");
    if (!user.battalionId) return { error: "אינך משויך לגדוד" };
    const companyId = String(formData.get("companyId") || "");
    const itemTypeId = String(formData.get("itemTypeId") || "");
    const qtyRaw = String(formData.get("permanentQuantity") || "0");
    const permanentQuantity = Math.max(0, parseInt(qtyRaw, 10) || 0);
    if (!companyId || !itemTypeId) return { error: "חסרים פרמטרים" };

    const company = await prisma.holder.findUnique({ where: { id: companyId }, select: { battalionId: true, kind: true } });
    if (!company || company.battalionId !== user.battalionId || company.kind !== "COMPANY") return { error: "פלוגה לא נמצאה" };
    const item = await prisma.itemType.findUnique({ where: { id: itemTypeId }, select: { battalionId: true } });
    if (!item || item.battalionId !== user.battalionId) return { error: "פריט לא נמצא" };

    await prisma.companyItemBaseline.upsert({
      where: { companyId_itemTypeId: { companyId, itemTypeId } },
      create: { battalionId: user.battalionId, companyId, itemTypeId, permanentQuantity, updatedById: user.id },
      update: { permanentQuantity, updatedById: user.id },
    });
    await audit(user.id, "SET_BASELINE", "CompanyItemBaseline", `${companyId}/${itemTypeId}`, { permanentQuantity });
    revalidatePath("/permanent-items");
    revalidatePath("/signatures");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "שגיאה" };
  }
}

/** עדכון Bulk - מפמ שולח טופס עם כמה שינויים. */
export async function setBaselinesBulk(formData: FormData): Promise<{ ok?: boolean; error?: string; updated?: number }> {
  try {
    const user = await requireCapability("battalion.profile");
    if (!user.battalionId) return { error: "אינך משויך לגדוד" };
    const companyId = String(formData.get("companyId") || "");
    const raw = String(formData.get("rows") || "[]");
    let rows: { itemTypeId: string; permanentQuantity: number }[] = [];
    try { rows = JSON.parse(raw); } catch { return { error: "פורמט שגוי" }; }

    const company = await prisma.holder.findUnique({ where: { id: companyId }, select: { battalionId: true } });
    if (!company || company.battalionId !== user.battalionId) return { error: "פלוגה לא נמצאה" };

    let updated = 0;
    await prisma.$transaction(async (tx) => {
      for (const r of rows) {
        if (!r.itemTypeId) continue;
        const qty = Math.max(0, Math.floor(r.permanentQuantity || 0));
        await tx.companyItemBaseline.upsert({
          where: { companyId_itemTypeId: { companyId, itemTypeId: r.itemTypeId } },
          create: { battalionId: user.battalionId!, companyId, itemTypeId: r.itemTypeId, permanentQuantity: qty, updatedById: user.id },
          update: { permanentQuantity: qty, updatedById: user.id },
        });
        updated++;
      }
    });
    await audit(user.id, "SET_BASELINES_BULK", "CompanyItemBaseline", companyId, { count: updated });
    revalidatePath("/permanent-items");
    revalidatePath("/signatures");
    return { ok: true, updated };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "שגיאה" };
  }
}
