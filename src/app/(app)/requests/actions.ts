"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guard";
import { can } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import type { RequestType, RequestPriority, RequestStatus } from "@/generated/prisma";

type Sessionish = Awaited<ReturnType<typeof requireUser>>;

/** יחידת המשתמש + ההיררכיה שלה. */
async function myUnit(user: Sessionish) {
  return prisma.battalion.findUnique({
    where: { id: user.battalionId! },
    select: { id: true, name: true, level: true, parentId: true, parent: { select: { id: true, name: true } } },
  });
}
function isCommander(user: Sessionish): boolean {
  return !!user.isAdmin || can(user, "battalion.profile");
}
/** מלכ"א = מפקד/מנהל יחידת החטיבה (רואה ומטפל בכל הסוגים). */
function isMalka(user: Sessionish): boolean {
  return !!user.isAdmin || can(user, "battalion.profile");
}
/** האם המשתמש רשאי לטפל בסוג נתון: מלכ"א → הכל; בעל תפקיד → רק סוגים שהוקצו לו. */
async function canHandleType(user: Sessionish, type: RequestType): Promise<boolean> {
  if (isMalka(user)) return true;
  const h = await prisma.requestTypeHandler.findFirst({ where: { brigadeUnitId: user.battalionId!, userId: user.id, type }, select: { id: true } });
  return !!h;
}

/** מלכ"א מקצה בעל-תפקיד לסוג דרישה. */
export async function assignTypeHandler(formData: FormData): Promise<{ error?: string; ok?: boolean }> {
  const user = await requireUser();
  const unit = await myUnit(user);
  if (unit?.level !== "BRIGADE" || !isMalka(user)) return { error: "רק מלכ\"א יכול להקצות בעלי תפקיד" };
  const type = String(formData.get("type") || "") as RequestType;
  const userId = String(formData.get("userId") || "").trim();
  if (!type || !userId) return { error: "בחר סוג ומשתמש" };
  // המשתמש חייב להיות של יחידת החטיבה
  const target = await prisma.appUser.findFirst({ where: { id: userId, battalionId: user.battalionId! }, select: { id: true } });
  if (!target) return { error: "משתמש לא נמצא ביחידה" };
  await prisma.requestTypeHandler.upsert({
    where: { brigadeUnitId_type_userId: { brigadeUnitId: user.battalionId!, type, userId } },
    update: {}, create: { brigadeUnitId: user.battalionId!, type, userId },
  });
  revalidatePath("/requests");
  return { ok: true };
}

/** מלכ"א מסיר הקצאת בעל-תפקיד. */
export async function removeTypeHandler(formData: FormData): Promise<{ error?: string; ok?: boolean }> {
  const user = await requireUser();
  if (!isMalka(user)) return { error: "אין הרשאה" };
  const id = String(formData.get("id") || "");
  const h = await prisma.requestTypeHandler.findUnique({ where: { id }, select: { brigadeUnitId: true } });
  if (!h || h.brigadeUnitId !== user.battalionId!) return { error: "לא נמצא" };
  await prisma.requestTypeHandler.delete({ where: { id } });
  revalidatePath("/requests");
  return { ok: true };
}

/** גדוד פותח דרישה לחטיבה הממונה. */
export async function createRequest(formData: FormData): Promise<{ error?: string; ok?: boolean }> {
  const user = await requireUser();
  const unit = await myUnit(user);
  if (!unit) return { error: "יחידה לא נמצאה" };
  if (!unit.parentId) return { error: "היחידה אינה משויכת לחטיבה — פנה לאדמין-על לשיוך" };

  const type = String(formData.get("type") || "OTHER") as RequestType;
  const title = String(formData.get("title") || "").trim();
  const description = String(formData.get("description") || "").trim() || null;
  const priority = String(formData.get("priority") || "ROUTINE") as RequestPriority;
  const companyId = String(formData.get("companyId") || "").trim() || null;
  if (!title) return { error: "הזן כותרת לדרישה" };

  // שדות דינמיים פר-סוג — נשמרים ב-data (key = `f_<fieldKey>`)
  const data: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (k.startsWith("f_") && typeof v === "string" && v.trim()) data[k.slice(2)] = v.trim();
  }
  // דגל אישור-מפמ פר-סוג — אם לא נדרש אישור, הדרישה עולה ישר לטיפול החטיבה
  const cfg = await prisma.requestTypeConfig.findUnique({ where: { brigadeUnitId_type: { brigadeUnitId: unit.parentId, type } }, select: { requiresApproval: true } });
  const requiresApproval = cfg?.requiresApproval ?? true;

  const req = await prisma.request.create({
    data: {
      battalionId: unit.id, targetUnitId: unit.parentId, companyId, type, title, description, priority,
      data: Object.keys(data).length ? data : undefined,
      status: requiresApproval ? "PENDING_APPROVAL" : "IN_PROGRESS",
      escalatedAt: requiresApproval ? null : new Date(),
      openedById: user.id, openedByName: user.fullName ?? null,
    },
  });
  await audit(user.id, "CREATE_REQUEST", "Request", req.id, { type, targetUnitId: unit.parentId });
  revalidatePath("/requests");
  return { ok: true };
}

/** מפ"מ/מפקד מאשר ומסליט לחטיבה — קבלה אוטומטית → בטיפול. */
export async function approveAndEscalate(formData: FormData): Promise<{ error?: string; ok?: boolean }> {
  const user = await requireUser();
  if (!isCommander(user)) return { error: "רק מפקד/מפמ יכול לאשר ולהסליט" };
  const id = String(formData.get("id") || "");
  const req = await prisma.request.findUnique({ where: { id }, select: { battalionId: true, status: true } });
  if (!req || req.battalionId !== user.battalionId) return { error: "דרישה לא נמצאה" };
  if (req.status !== "PENDING_APPROVAL") return { error: "הדרישה כבר אושרה או טופלה" };

  await prisma.$transaction([
    prisma.request.update({ where: { id }, data: { status: "IN_PROGRESS", escalatedAt: new Date(), approvedById: user.id } }),
    prisma.requestUpdate.create({ data: { requestId: id, authorId: user.id, authorName: user.fullName ?? null, text: "אושר והוסלם לחטיבה", statusFrom: "PENDING_APPROVAL", statusTo: "IN_PROGRESS" } }),
  ]);
  await audit(user.id, "ESCALATE_REQUEST", "Request", id, {});
  revalidatePath("/requests");
  return { ok: true };
}

/** ביטול דרישה ע"י היחידה הפותחת. */
export async function cancelRequest(formData: FormData): Promise<{ error?: string; ok?: boolean }> {
  const user = await requireUser();
  const id = String(formData.get("id") || "");
  const req = await prisma.request.findUnique({ where: { id }, select: { battalionId: true, status: true } });
  if (!req || req.battalionId !== user.battalionId) return { error: "דרישה לא נמצאה" };
  if (["RESOLVED", "CANCELLED"].includes(req.status)) return { error: "לא ניתן לבטל דרישה סגורה" };
  await prisma.$transaction([
    prisma.request.update({ where: { id }, data: { status: "CANCELLED" } }),
    prisma.requestUpdate.create({ data: { requestId: id, authorId: user.id, authorName: user.fullName ?? null, text: "בוטל ע\"י היחידה", statusFrom: req.status, statusTo: "CANCELLED" } }),
  ]);
  revalidatePath("/requests");
  return { ok: true };
}

/** הוספת דיווח-טיפול (thread) — חטיבה על דרישה שלה, או גדוד על דרישה שלו (מענה ל-NEEDS_INFO). */
export async function addRequestUpdate(formData: FormData): Promise<{ error?: string; ok?: boolean }> {
  const user = await requireUser();
  const id = String(formData.get("id") || "");
  const text = String(formData.get("text") || "").trim();
  if (!text) return { error: "הזן טקסט לעדכון" };
  const req = await prisma.request.findUnique({ where: { id }, select: { battalionId: true, targetUnitId: true } });
  if (!req) return { error: "דרישה לא נמצאה" };
  // הרשאה: היחידה הפותחת (גדוד) או היחידה הממונה (חטיבה)
  if (req.battalionId !== user.battalionId && req.targetUnitId !== user.battalionId) return { error: "אין הרשאה" };
  await prisma.requestUpdate.create({ data: { requestId: id, authorId: user.id, authorName: user.fullName ?? null, text } });
  revalidatePath("/requests");
  return { ok: true };
}

/** חטיבה משנה סטטוס טיפול (+ דיווח). */
export async function setRequestStatus(formData: FormData): Promise<{ error?: string; ok?: boolean }> {
  const user = await requireUser();
  const id = String(formData.get("id") || "");
  const status = String(formData.get("status") || "") as RequestStatus;
  const note = String(formData.get("note") || "").trim();
  const req = await prisma.request.findUnique({ where: { id }, select: { targetUnitId: true, status: true, type: true } });
  if (!req) return { error: "דרישה לא נמצאה" };
  // רק היחידה הממונה (חטיבה) מטפלת
  if (req.targetUnitId !== user.battalionId) return { error: "רק החטיבה יכולה לעדכן סטטוס טיפול" };
  // בעל תפקיד — רק הסוג/ים שהוקצו לו (מלכ"א = הכל)
  if (!(await canHandleType(user, req.type))) return { error: "אינך אחראי על סוג דרישה זה" };
  const allowed: RequestStatus[] = ["IN_PROGRESS", "NEEDS_INFO", "RESOLVED", "REJECTED"];
  if (!allowed.includes(status)) return { error: "סטטוס לא תקין" };

  await prisma.$transaction([
    prisma.request.update({ where: { id }, data: { status, ...(status === "RESOLVED" ? { resolvedAt: new Date() } : {}), assignedToId: user.id, assignedName: user.fullName ?? null } }),
    prisma.requestUpdate.create({ data: { requestId: id, authorId: user.id, authorName: user.fullName ?? null, text: note || "עודכן סטטוס טיפול", statusFrom: req.status, statusTo: status } }),
  ]);
  await audit(user.id, "SET_REQUEST_STATUS", "Request", id, { status });
  revalidatePath("/requests");
  return { ok: true };
}
