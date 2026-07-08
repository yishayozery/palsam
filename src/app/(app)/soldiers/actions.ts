"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/guard";
import { audit } from "@/lib/audit";

export async function saveCompanyRole(formData: FormData) {
  const user = await requireCapability("company.manage");
  const bId = user.battalionId!;
  const id = String(formData.get("id") || "");
  const name = String(formData.get("name") || "").trim();
  const isCommander = formData.get("isCommander") === "on" || formData.get("isCommander") === "true";
  const sortOrder = parseInt(String(formData.get("sortOrder") || "0"), 10) || 0;
  const companyId = user.holderId || String(formData.get("companyId") || "");
  if (!name || !companyId) return;

  if (id) {
    await prisma.companyRole.update({ where: { id }, data: { name, isCommander, sortOrder } });
  } else {
    await prisma.companyRole.create({ data: { battalionId: bId, companyId, name, isCommander, sortOrder } });
  }
  await audit(user.id, id ? "UPDATE" : "CREATE", "CompanyRole", id || name, { companyId });
  revalidatePath("/soldiers");
}

export async function toggleCompanyRole(formData: FormData) {
  const user = await requireCapability("company.manage");
  const id = String(formData.get("id") || "");
  const r = await prisma.companyRole.findUnique({ where: { id } });
  if (!r) return;
  await prisma.companyRole.update({ where: { id }, data: { active: !r.active } });
  await audit(user.id, "UPDATE", "CompanyRole", id, { active: !r.active });
  revalidatePath("/soldiers");
}

export async function saveSquad(formData: FormData) {
  const user = await requireCapability("company.manage");
  const bId = user.battalionId!;
  const id = String(formData.get("id") || "");
  const name = String(formData.get("name") || "").trim();
  const sortOrder = parseInt(String(formData.get("sortOrder") || "0"), 10) || 0;
  const companyId = user.holderId || String(formData.get("companyId") || "");
  if (!name || !companyId) return;

  if (id) {
    await prisma.squad.update({ where: { id }, data: { name, sortOrder } });
  } else {
    await prisma.squad.create({ data: { battalionId: bId, companyId, name, sortOrder } });
  }
  await audit(user.id, id ? "UPDATE" : "CREATE", "Squad", id || name);
  revalidatePath("/soldiers");
  revalidatePath("/attendance");
  revalidatePath("/attendance-settings");
}

export async function toggleSquad(formData: FormData) {
  const user = await requireCapability("company.manage");
  const id = String(formData.get("id") || "");
  const sq = await prisma.squad.findUnique({ where: { id } });
  if (!sq) return;
  await prisma.squad.update({ where: { id }, data: { active: !sq.active } });
  await audit(user.id, "UPDATE", "Squad", id, { active: !sq.active });
  revalidatePath("/soldiers");
  revalidatePath("/attendance");
  revalidatePath("/attendance-settings");
}

export async function saveSoldier(formData: FormData): Promise<string | undefined> {
  const user = await requireCapability("company.manage");
  const bId = user.battalionId!;
  const id = String(formData.get("id") || "");
  const fullName = String(formData.get("fullName") || "").trim();
  const personalNumber = String(formData.get("personalNumber") || "").trim();
  const phone = String(formData.get("phone") || "").trim() || null;
  const platoon = String(formData.get("platoon") || "").trim() || null;
  const squadId = String(formData.get("squadId") || "").trim() || null;
  const companyRoleId = String(formData.get("companyRoleId") || "").trim() || null;
  const dutyRoundRaw = String(formData.get("dutyRound") || "").trim();
  const dutyRound = dutyRoundRaw ? (Math.min(3, Math.max(1, parseInt(dutyRoundRaw, 10) || 0)) || null) : null;
  let companyId = String(formData.get("companyId") || "") || null;
  // 🛡️ פלוגת חייל חייבת להיות holder מסוג COMPANY — לעולם לא מחסן.
  // (מנע באג: מנהל מחסן שערך חייל בלי לבחור פלוגה — הפלוגה נדרסה לשם המחסן שלו.)
  if (companyId) {
    const h = await prisma.holder.findUnique({ where: { id: companyId }, select: { kind: true, battalionId: true } });
    if (!h || h.battalionId !== bId || h.kind !== "COMPANY") companyId = null;
  }
  if (!companyId && user.holderId) {
    const h = await prisma.holder.findUnique({ where: { id: user.holderId }, select: { kind: true } });
    if (h?.kind === "COMPANY") companyId = user.holderId; // ברירת מחדל רק אם ה-holder הראשי הוא פלוגה
  }
  if (id && !companyId) {
    const existing = await prisma.soldier.findUnique({ where: { id }, select: { companyId: true } });
    companyId = existing?.companyId ?? null; // בעריכה — שמור על הפלוגה הקיימת, אל תדרוס
  }
  if (!fullName || !personalNumber) return "שם ומספר אישי הם שדות חובה";

  if (!/^\d{7}$/.test(personalNumber)) return "מספר אישי חייב להיות 7 ספרות";

  const duplicate = await prisma.soldier.findFirst({
    where: { battalionId: bId, personalNumber, ...(id ? { id: { not: id } } : {}) },
  });
  if (duplicate) return `מספר אישי ${personalNumber} כבר קיים בגדוד (${duplicate.fullName})`;

  if (phone && !/^05\d{8}$/.test(phone.replace(/-/g, "")))
    return "מספר נייד לא תקין — נדרש פורמט 05X-XXXXXXX";

  const cleanPhone = phone ? phone.replace(/-/g, "") : null;

  const data = { fullName, personalNumber, phone: cleanPhone, platoon, companyId, squadId, companyRoleId, dutyRound };
  if (id) {
    await prisma.soldier.update({ where: { id }, data });
  } else {
    await prisma.soldier.create({ data: { ...data, battalionId: bId } });
  }
  await audit(user.id, id ? "UPDATE" : "CREATE", "Soldier", id || personalNumber);
  revalidatePath("/soldiers");
}

export async function toggleSoldier(formData: FormData) {
  const user = await requireCapability("company.manage");
  const id = String(formData.get("id") || "");
  const s = await prisma.soldier.findUnique({ where: { id } });
  if (!s) return;
  const newStatus = (s.status === "DISCHARGED" || s.status === "INACTIVE") ? "REGISTERED" : "INACTIVE";
  await prisma.soldier.update({ where: { id }, data: { status: newStatus } });
  await audit(user.id, "UPDATE", "Soldier", id, { status: newStatus });
  revalidatePath("/soldiers");
}
