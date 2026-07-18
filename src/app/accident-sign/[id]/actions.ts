"use server";

import { prisma } from "@/lib/prisma";
import { verifyLink } from "@/lib/link-token";

/** חתימת בוחן רכב חיצוני (לינק) — סוגר את הדיווח (APPROVED). */
export async function signAsExaminer(
  id: string, token: string, name: string, signature: string,
): Promise<{ ok?: boolean; error?: string }> {
  if (!verifyLink("accident-sign", id, token)) return { error: "קישור לא תקין" };
  if (!name.trim()) return { error: "חסר שם הבוחן" };
  if (!signature || !signature.startsWith("data:image")) return { error: "חסרה חתימה" };
  const r = await prisma.accidentReport.findUnique({ where: { id }, select: { status: true } });
  if (!r) return { error: "לא נמצא" };
  if (r.status !== "EXAMINER_REVIEW") return { error: r.status === "APPROVED" ? "הדיווח כבר נחתם" : "הדיווח אינו בשלב חתימת הבוחן" };
  await prisma.accidentReport.update({
    where: { id },
    data: { examinerName: name.trim(), examinerSignature: signature, examinerAt: new Date(), status: "APPROVED" },
  });
  return { ok: true };
}
