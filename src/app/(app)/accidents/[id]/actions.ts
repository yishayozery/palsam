"use server";

import { revalidatePath } from "next/cache";
import { requireVehicleAccess } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { linkTokenQuery } from "@/lib/link-token";

/** לינק לחתימת בוחן רכב חיצוני (לשליחה בוואטסאפ). */
export async function getExaminerLink(id: string): Promise<{ link?: string; error?: string }> {
  const s = await scoped(id);
  if (!s) return { error: "לא נמצא" };
  const base = process.env.NEXT_PUBLIC_APP_URL || "https://www.palmy.co.il";
  return { link: `${base}/accident-sign/${id}${linkTokenQuery("accident-sign", id)}` };
}

/** אימות הרשאה + שייכות לגדוד. מחזיר את הדיווח או null. */
async function scoped(id: string) {
  const user = await requireVehicleAccess();
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
  // 🔔 התראה למג"ד
  const d = await prisma.accidentReport.findUnique({ where: { id }, select: { type: true, driverName: true, ourVehiclePlate: true, location: true } });
  if (d) {
    const TYPE_LABEL: Record<string, string> = { ARMY_SELF: "צבא עצמי", ARMY_ARMY: "צבא עם צבא", CIVILIAN: "מעורבות אזרח" };
    const summary = [TYPE_LABEL[d.type] ?? d.type, d.driverName, d.ourVehiclePlate && `רכב ${d.ourVehiclePlate}`, d.location].filter(Boolean).join(" · ");
    const { notifyMagadAccident } = await import("@/lib/accident-notify");
    await notifyMagadAccident(s.user.battalionId!, id, summary).catch(() => {});
  }
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
