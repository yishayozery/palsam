"use server";

import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { linkTokenQuery } from "@/lib/link-token";

type AType = "ARMY_SELF" | "ARMY_ARMY" | "CIVILIAN";

function fillLink(id: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || "https://www.palmy.co.il";
  return `${base}/accident-report/${id}${linkTokenQuery("accident-fill", id)}`;
}

/** יצירת דיווח תאונה חדש (DRAFT) + החזרת לינק למילוי חלק א ע"י החייל. */
export async function createAccidentReport(type: AType): Promise<{ id: string; link: string }> {
  const user = await requireCapability("maintenance.manage");
  const r = await prisma.accidentReport.create({
    data: { battalionId: user.battalionId!, type, status: "DRAFT" },
    select: { id: true },
  });
  revalidatePath("/accidents");
  return { id: r.id, link: fillLink(r.id) };
}

/** לינק למילוי חלק א של דיווח קיים (לשליחה חוזרת). */
export async function getAccidentFillLink(id: string): Promise<{ link?: string; error?: string }> {
  const user = await requireCapability("maintenance.manage");
  const r = await prisma.accidentReport.findFirst({ where: { id, battalionId: user.battalionId! }, select: { id: true } });
  if (!r) return { error: "לא נמצא" };
  return { link: fillLink(r.id) };
}

/** מחיקת דיווח (רק בשלב DRAFT — טרם הוגש). */
export async function deleteAccidentReport(id: string): Promise<{ ok?: boolean; error?: string }> {
  const user = await requireCapability("maintenance.manage");
  const r = await prisma.accidentReport.findFirst({ where: { id, battalionId: user.battalionId! }, select: { status: true } });
  if (!r) return { error: "לא נמצא" };
  if (r.status !== "DRAFT") return { error: "לא ניתן למחוק דיווח שכבר הוגש" };
  await prisma.accidentReport.delete({ where: { id } });
  revalidatePath("/accidents");
  return { ok: true };
}
