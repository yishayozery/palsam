"use server";

import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/guard";
import { prisma } from "@/lib/prisma";

/** אימות הרשאה + שייכות לגדוד. מחזיר את הדיווח או null. */
async function scoped(id: string) {
  const user = await requireCapability("maintenance.manage");
  const r = await prisma.accidentReport.findFirst({ where: { id, battalionId: user.battalionId! }, select: { id: true, status: true } });
  return r ? { user, r } : null;
}

/** שמירת חלק ב (קצין רכב) — הערות/תחקיר. */
export async function saveOfficerNotes(id: string, notes: string): Promise<{ ok?: boolean; error?: string }> {
  const s = await scoped(id);
  if (!s) return { error: "לא נמצא" };
  await prisma.accidentReport.update({
    where: { id },
    data: { officerNotes: notes, officerUserId: s.user.id, officerAt: new Date() },
  });
  revalidatePath(`/accidents/${id}`);
  return { ok: true };
}

/** קצין רכב מסיים חלק ב → מעביר לאישור מג"ד. */
export async function sendToMagad(id: string, notes: string): Promise<{ ok?: boolean; error?: string }> {
  const s = await scoped(id);
  if (!s) return { error: "לא נמצא" };
  if (s.r.status !== "OFFICER_REVIEW") return { error: "הדיווח אינו בשלב קצין הרכב" };
  await prisma.accidentReport.update({
    where: { id },
    data: { officerNotes: notes, officerUserId: s.user.id, officerAt: new Date(), status: "MAGAD_REVIEW" },
  });
  revalidatePath(`/accidents/${id}`);
  return { ok: true };
}

/** אישור מג"ד (חתימה) → מעביר לאישור בוחן רכב. */
export async function magadApprove(id: string, signature: string): Promise<{ ok?: boolean; error?: string }> {
  const s = await scoped(id);
  if (!s) return { error: "לא נמצא" };
  if (s.r.status !== "MAGAD_REVIEW") return { error: "הדיווח אינו בשלב אישור מג\"ד" };
  if (!signature || !signature.startsWith("data:image")) return { error: "חסרה חתימה" };
  await prisma.accidentReport.update({
    where: { id },
    data: { magadUserId: s.user.id, magadSignature: signature, magadAt: new Date(), status: "EXAMINER_REVIEW" },
  });
  revalidatePath(`/accidents/${id}`);
  return { ok: true };
}

/** החזרה לשלב קצין הרכב (תיקונים). */
export async function returnToOfficer(id: string): Promise<{ ok?: boolean; error?: string }> {
  const s = await scoped(id);
  if (!s) return { error: "לא נמצא" };
  if (s.r.status !== "MAGAD_REVIEW") return { error: "לא ניתן להחזיר בשלב זה" };
  await prisma.accidentReport.update({ where: { id }, data: { status: "OFFICER_REVIEW" } });
  revalidatePath(`/accidents/${id}`);
  return { ok: true };
}
