"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/guard";
import { audit } from "@/lib/audit";
import { requiresPersonalId } from "@/lib/handover";
import { adjustQuantity } from "@/lib/inventory";

/** רס"פ פלוגה יוצר בקשת זיכוי (RETURN) למחסן ספציפי, עם מקבל ספציפי. אישור — דרך handshake. */
export async function createReturn(formData: FormData): Promise<{ error?: string } | void> {
  const user = await requireCapability("company.manage");
  const bId = user.battalionId!;
  const companyId = user.holderId;
  if (!companyId) return { error: "המשתמש לא משויך לפלוגה" };

  const itemTypeId = String(formData.get("itemTypeId") || "");
  const quantity = Math.max(1, parseInt(String(formData.get("quantity") || "0"), 10) || 0);
  const statusId = String(formData.get("statusId") || "");
  const serialIds = formData.getAll("serialId").map(String).filter(Boolean);
  const notes = String(formData.get("notes") || "").trim() || null;
  // ⚠️ חדש: מחסן יעד נבחר ע"י המשתמש; מקבל ומספרו האישי
  const toHolderIdRaw = String(formData.get("toHolderId") || "").trim();
  const recipientUserId = String(formData.get("recipientUserId") || "").trim() || null;
  const recipientPersonalId = String(formData.get("recipientPersonalId") || "").replace(/\D/g, "") || null;
  if (!itemTypeId) return { error: "חובה לבחור פריט" };

  // מחסן יעד: אם נבחר מפורשות — ודא שייכות; אחרת — איתור אוטו לפי קטגוריה (תאימות לאחור)
  let toHolder: { id: string; name: string } | null = null;
  if (toHolderIdRaw) {
    const chosen = await prisma.holder.findUnique({ where: { id: toHolderIdRaw } });
    if (!chosen || chosen.battalionId !== bId || chosen.kind !== "WAREHOUSE") return { error: "מחסן יעד לא תקף" };
    toHolder = { id: chosen.id, name: chosen.name };
  } else {
    const item = await prisma.itemType.findUnique({ where: { id: itemTypeId }, include: { category: true } });
    if (!item) return { error: "פריט לא נמצא" };
    const wtype = item.category?.warehouseType;
    const found = wtype
      ? await prisma.holder.findFirst({ where: { battalionId: bId, kind: "WAREHOUSE", warehouseType: wtype, active: true } })
      : await prisma.holder.findFirst({ where: { battalionId: bId, kind: "WAREHOUSE", active: true }, orderBy: { createdAt: "asc" } });
    if (!found) return { error: "לא נמצא מחסן יעד תואם" };
    toHolder = { id: found.id, name: found.name };
  }

  // 🔒 מ.א. — אם הגדוד דורש, חייב מ.א. או recipientUserId שמקושר לחייל עם מ.א.
  if (await requiresPersonalId(bId)) {
    let pn = recipientPersonalId;
    if (!pn && recipientUserId) {
      const u = await prisma.appUser.findUnique({ where: { id: recipientUserId }, include: { soldier: { select: { personalNumber: true } } } });
      pn = u?.soldier?.personalNumber ?? null;
    }
    if (!pn) {
      return { error: "🔒 הגדוד דורש מ.א. בכל מסירה. הזן מ.א. של המקבל או בחר מקבל מקושר לחייל עם מ.א." };
    }
  }

  // יצירת ההעברה כ-PENDING (ממתינה לאישור קצין המחסן)
  await prisma.$transaction(async (tx) => {
    const t = await tx.transfer.create({
      data: {
        battalionId: bId,
        type: "RETURN",
        status: "PENDING",
        fromHolderId: companyId,
        toHolderId: toHolder.id,
        reason: `זיכוי מהפלוגה אל ${toHolder.name}`,
        notes,
        recipientPersonalId,
        createdById: user.id,
      },
    });
    if (serialIds.length > 0) {
      for (const sid of serialIds) {
        const su = await tx.serialUnit.findUnique({ where: { id: sid }, include: { transferLines: { where: { transfer: { status: "PENDING" } }, take: 1 } } });
        if (!su || su.currentHolderId !== companyId) continue;
        if (su.transferLines.length > 0) continue;
        const partialLotQty = parseInt(String(formData.get(`lotQty:${sid}`) || "0"), 10);
        const lineQty = partialLotQty > 0 && partialLotQty < (su.lotQuantity ?? 1) ? partialLotQty : (su.lotQuantity ?? 1);
        await tx.transferLine.create({
          data: { transferId: t.id, itemTypeId: su.itemTypeId, quantity: lineQty, serialUnitId: sid, statusId: su.statusId },
        });
      }
    } else if (quantity > 0 && statusId) {
      // גריעת מלאי כמותי מהפלוגה
      await adjustQuantity(tx, bId, itemTypeId, companyId!, statusId, -quantity);
      await tx.transferLine.create({ data: { transferId: t.id, itemTypeId, quantity, statusId } });
    }
  });

  await audit(user.id, "CREATE_RETURN", "Transfer", itemTypeId, { quantity, serials: serialIds.length });
  revalidatePath("/return");
  revalidatePath("/dashboard");
}
