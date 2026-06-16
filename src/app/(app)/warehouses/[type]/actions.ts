"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guard";
import { can } from "@/lib/rbac";
import { audit } from "@/lib/audit";

/** עדכון תניית חתימה למחסן. רק מפ"מ או קצין המחסן. */
export async function updateSignatureClause(
  formData: FormData,
): Promise<{ ok?: boolean; error?: string }> {
  try {
    const user = await requireUser();
    const warehouseId = String(formData.get("warehouseId") || "");
    const raw = String(formData.get("signatureClause") || "").trim();
    const signatureClause = raw === "" ? null : raw;
    if (!warehouseId) return { error: "חסר מזהה מחסן" };

    const wh = await prisma.holder.findUnique({
      where: { id: warehouseId },
      select: { battalionId: true, kind: true },
    });
    if (!wh || wh.battalionId !== user.battalionId) return { error: "מחסן לא נמצא" };
    if (wh.kind !== "WAREHOUSE") return { error: "ניתן רק במחסן" };

    // הרשאה: מפ"מ או קצין המחסן הזה
    const isMafam = user.role === "BATTALION_ADMIN" && can(user.role, "battalion.profile");
    const isWHManager = user.role === "WAREHOUSE_MANAGER" && user.holderIds.includes(warehouseId);
    if (!isMafam && !isWHManager) return { error: "אין הרשאה" };

    await prisma.holder.update({ where: { id: warehouseId }, data: { signatureClause } });
    await audit(user.id, "UPDATE", "Holder", warehouseId, { signatureClauseLen: signatureClause?.length ?? 0 });
    revalidatePath("/warehouses");
    revalidatePath(`/warehouses/${warehouseId}`);
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "שגיאה" };
  }
}
