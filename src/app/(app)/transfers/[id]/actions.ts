"use server";

import { requireUser } from "@/lib/guard";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { notifyTransactionEmail } from "@/lib/email";

/** שליחה ידנית של תעודת ההעברה למייל (PDF + אקסל) — מחזיר תוצאה מפורשת למשוב במסך. */
export async function resendTransferEmail(transferId: string): Promise<{ ok: boolean; error?: string; recipients?: string[] }> {
  const user = await requireUser();
  if (!can(user, "signatures.manage") && !user.isAdmin) return { ok: false, error: "אין הרשאה לשליחת תעודות" };
  const t = await prisma.transfer.findUnique({ where: { id: transferId }, select: { battalionId: true, fromHolderId: true } });
  if (!t || t.battalionId !== user.battalionId) return { ok: false, error: "תעודה לא נמצאה" };
  return notifyTransactionEmail({ battalionId: t.battalionId, userId: user.id, action: "RESEND", entity: "Transfer", entityId: transferId, holderId: t.fromHolderId });
}
