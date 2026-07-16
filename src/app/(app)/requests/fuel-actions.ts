"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guard";
import { can } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { notifyBattalionResponsibles } from "@/lib/request-notify";
import { escapeTelegram } from "@/lib/escape-html";

type Sessionish = Awaited<ReturnType<typeof requireUser>>;

/** מלכ"א ביחידת חטיבה — מחזיר את מזהה החטיבה או null. */
async function requireBrigadeMalka(user: Sessionish): Promise<string | null> {
  if (!(user.isAdmin || can(user, "battalion.profile"))) return null;
  const unit = await prisma.battalion.findUnique({ where: { id: user.battalionId! }, select: { id: true, level: true } });
  return unit?.level === "BRIGADE" ? unit.id : null;
}

/** מלכ"א טוען רשימת כרטיסים (מספר בכל שורה). idempotent — מדלג על קיימים. */
export async function importFuelCards(formData: FormData): Promise<{ error?: string; added?: number }> {
  const user = await requireUser();
  const bId = await requireBrigadeMalka(user);
  if (!bId) return { error: "רק מלכ\"א של החטיבה" };
  const raw = String(formData.get("numbers") || "");
  const label = String(formData.get("label") || "").trim() || null;
  const numbers = [...new Set(raw.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean))];
  if (numbers.length === 0) return { error: "לא הוזנו מספרי כרטיסים" };
  const res = await prisma.brigadeFuelCard.createMany({
    data: numbers.map((cardNumber) => ({ brigadeUnitId: bId, cardNumber, label })),
    skipDuplicates: true,
  });
  await audit(user.id, "IMPORT_FUEL_CARDS", "BrigadeFuelCard", bId, { count: res.count });
  revalidatePath("/requests"); revalidatePath("/driving-licenses");
  return { added: res.count };
}

/** מלכ"א מקצה כרטיסים לגדוד. cardIds מרובים או כמות מהמאגר. */
export async function allocateFuelCards(formData: FormData): Promise<{ error?: string; ok?: boolean }> {
  const user = await requireUser();
  const bId = await requireBrigadeMalka(user);
  if (!bId) return { error: "רק מלכ\"א של החטיבה" };
  const battalionId = String(formData.get("battalionId") || "");
  const ids = String(formData.get("cardIds") || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!battalionId || ids.length === 0) return { error: "בחר גדוד וכרטיסים" };
  // הגדוד חייב להיות תחת החטיבה
  const battalion = await prisma.battalion.findFirst({ where: { id: battalionId, parentId: bId }, select: { id: true, name: true } });
  if (!battalion) return { error: "גדוד לא נמצא תחת החטיבה" };
  await prisma.brigadeFuelCard.updateMany({
    where: { id: { in: ids }, brigadeUnitId: bId, status: "AVAILABLE" },
    data: { status: "ALLOCATED", allocatedBattalionId: battalion.id, allocatedName: battalion.name, allocatedAt: new Date() },
  });
  // התראה לאחראי-כרטיסי-דלק בגדוד היעד
  await notifyBattalionResponsibles(battalion.id, "FUEL_CARDS", `⛽ הוקצו לגדוד <b>${ids.length}</b> כרטיסי דלק מהחטיבה. יש לחתום על קבלתם.`);
  revalidatePath("/requests"); revalidatePath("/driving-licenses");
  return { ok: true };
}

/** מלכ"א מחזיר כרטיס למאגר (ביטול הקצאה) — רק אם טרם נחתם. */
export async function unallocateFuelCard(formData: FormData): Promise<{ error?: string; ok?: boolean }> {
  const user = await requireUser();
  const bId = await requireBrigadeMalka(user);
  if (!bId) return { error: "רק מלכ\"א" };
  const id = String(formData.get("id") || "");
  const card = await prisma.brigadeFuelCard.findFirst({ where: { id, brigadeUnitId: bId }, select: { id: true, status: true } });
  if (!card) return { error: "כרטיס לא נמצא" };
  if (card.status === "SIGNED") return { error: "כרטיס חתום — לא ניתן לבטל" };
  await prisma.brigadeFuelCard.update({ where: { id }, data: { status: "AVAILABLE", allocatedBattalionId: null, allocatedName: null, allocatedAt: null } });
  revalidatePath("/requests"); revalidatePath("/driving-licenses");
  return { ok: true };
}

/** מלכ"א מוחק כרטיס מהמאגר (רק אם לא הוקצה/נחתם). */
export async function deleteFuelCard(formData: FormData): Promise<{ error?: string; ok?: boolean }> {
  const user = await requireUser();
  const bId = await requireBrigadeMalka(user);
  if (!bId) return { error: "רק מלכ\"א" };
  const id = String(formData.get("id") || "");
  const card = await prisma.brigadeFuelCard.findFirst({ where: { id, brigadeUnitId: bId }, select: { id: true, status: true } });
  if (!card) return { error: "כרטיס לא נמצא" };
  if (card.status !== "AVAILABLE") return { error: "ניתן למחוק רק כרטיס במאגר" };
  await prisma.brigadeFuelCard.delete({ where: { id } });
  revalidatePath("/requests"); revalidatePath("/driving-licenses");
  return { ok: true };
}

/** קצין רכב/מפקד הגדוד חותם על קבלת כרטיס (שם + מ"א + חתימה). */
export async function signFuelCard(formData: FormData): Promise<{ error?: string; ok?: boolean }> {
  const user = await requireUser();
  const canSign = user.isAdmin || can(user, "battalion.profile") || can(user, "driving_licenses") || can(user, "dispatch");
  if (!canSign) return { error: "אין הרשאה לחתום" };
  const id = String(formData.get("id") || "");
  const signedByName = String(formData.get("signedByName") || "").trim();
  const signedByPersonal = String(formData.get("signedByPersonal") || "").trim();
  const signatureData = String(formData.get("signatureData") || "").trim() || null;
  if (!signedByName || !signedByPersonal) return { error: "הזן שם ומספר אישי" };
  const card = await prisma.brigadeFuelCard.findUnique({ where: { id }, select: { id: true, status: true, allocatedBattalionId: true, cardNumber: true } });
  if (!card) return { error: "כרטיס לא נמצא" };
  if (card.allocatedBattalionId !== user.battalionId) return { error: "הכרטיס לא הוקצה לגדוד שלך" };
  if (card.status !== "ALLOCATED") return { error: "הכרטיס אינו ממתין לחתימה" };
  await prisma.brigadeFuelCard.update({ where: { id }, data: { status: "SIGNED", signedByName, signedByPersonal, signatureData, signedAt: new Date() } });
  await audit(user.id, "SIGN_FUEL_CARD", "BrigadeFuelCard", id, { cardNumber: card.cardNumber });
  await notifyBattalionResponsibles(user.battalionId!, "FUEL_CARDS", `⛽ כרטיס דלק <b>${escapeTelegram(card.cardNumber)}</b> נחתם ע"י ${escapeTelegram(signedByName)} (מ"א ${escapeTelegram(signedByPersonal)}).`);
  revalidatePath("/requests"); revalidatePath("/driving-licenses");
  return { ok: true };
}
