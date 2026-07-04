"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guard";
import { can } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { adjustQuantity } from "@/lib/inventory";

/** סגירת פער — מי שיש לו gaps.resolve, או מי שהתחיל את הספירה */
export async function resolveDiscrepancy(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") || "");

  const d = await prisma.discrepancy.findUnique({
    where: { id },
    include: { session: { select: { startedById: true } } },
  });
  if (!d || d.status === "RESOLVED" || d.battalionId !== user.battalionId) return;

  const hasGapsResolve = can(user, "gaps.resolve");
  const isCountCreator = d.session?.startedById === user.id;
  if (!hasGapsResolve && !isCountCreator) return;

  const resolution = String(formData.get("resolution") || "").trim()
    || (isCountCreator ? "אושר ע\"י מחולל הספירה" : "אושר ע\"י מנהל");
  const adjust = formData.get("adjust") === "on";

  await prisma.$transaction(async (tx) => {
    if (adjust && d.holderId) {
      const status = await tx.itemStatus.findFirst({ where: { battalionId: d.battalionId, isDefault: true } })
        ?? await tx.itemStatus.findFirst({ where: { battalionId: d.battalionId } });
      if (status) {
        await adjustQuantity(tx, d.battalionId, d.itemTypeId, d.holderId, status.id, d.diff);
      }
    }
    await tx.discrepancy.update({
      where: { id },
      data: { status: "RESOLVED", resolution, resolvedById: user.id, resolvedAt: new Date() },
    });
  });

  await audit(user.id, "RESOLVE_GAP", "Discrepancy", id, { resolution, adjust });
  revalidatePath("/gaps");
}

/** תיקון כמות שנספרה (ספירה חוזרת) — מעדכן את הכמות בפער ובשורת הספירה.
 *  אם הכמות המתוקנת שווה לצפוי — הפער נסגר אוטומטית. */
export async function correctCountedQuantity(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") || "");
  const newCounted = parseInt(String(formData.get("newCounted") || ""), 10);
  if (isNaN(newCounted) || newCounted < 0) return;

  const d = await prisma.discrepancy.findUnique({
    where: { id },
    include: { session: { select: { startedById: true } } },
  });
  if (!d || d.status === "RESOLVED" || d.battalionId !== user.battalionId) return;
  if (!can(user, "gaps.resolve") && d.session?.startedById !== user.id) return;

  const diff = newCounted - d.expectedQty;
  await prisma.$transaction(async (tx) => {
    // עדכון שורות הספירה התואמות (לתצוגה בדוח)
    await tx.countLine.updateMany({
      where: { sessionId: d.sessionId ?? undefined, itemTypeId: d.itemTypeId, holderId: d.holderId },
      data: { countedQty: newCounted },
    });
    if (diff === 0) {
      // תוקן — אין יותר פער
      await tx.discrepancy.update({
        where: { id },
        data: { status: "RESOLVED", countedQty: newCounted, diff: 0, resolution: "תוקן בספירה חוזרת", resolvedById: user.id, resolvedAt: new Date() },
      });
    } else {
      await tx.discrepancy.update({
        where: { id },
        data: { countedQty: newCounted, diff, kind: diff < 0 ? "LOSS" : "SURPLUS" },
      });
    }
  });

  await audit(user.id, "CORRECT_COUNT", "Discrepancy", id, { newCounted, diff });
  revalidatePath("/gaps");
}
