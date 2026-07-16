"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guard";
import { can } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { nanoid } from "nanoid";
import { escapeTelegram } from "@/lib/escape-html";
import { REQUEST_TYPE_LABEL, REQUEST_STATUS_LABEL } from "@/lib/request-labels";
import { notifyBattalionResponsibles } from "@/lib/request-notify";
import type { RequestType, RequestPriority, RequestStatus, RequestFieldSide, RequestFieldType } from "@/generated/prisma";

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

/** 📷 טעינת תמונות בקשה (lazy) — לצד המבקש (גדוד) או הממונה (חטיבה). */
export async function getRequestImages(requestId: string): Promise<{ images: { id: string; imageData: string; caption: string | null }[] }> {
  const user = await requireUser();
  const req = await prisma.request.findUnique({ where: { id: requestId }, select: { battalionId: true, targetUnitId: true } });
  if (!req || (req.battalionId !== user.battalionId && req.targetUnitId !== user.battalionId)) return { images: [] };
  const images = await prisma.requestImage.findMany({ where: { requestId }, select: { id: true, imageData: true, caption: true }, orderBy: { createdAt: "asc" } });
  return { images };
}

/** 📢 מפקד-תא בחטיבה שולח עדכון יזום לכל הרפרנטים (אחראי-תחום) של הנושא בכל גדודי-הבת. */
export async function broadcastToResponsibles(formData: FormData): Promise<{ error?: string; ok?: boolean; sent?: number }> {
  const user = await requireUser();
  const unit = await myUnit(user);
  if (unit?.level !== "BRIGADE") return { error: "פעולה זו זמינה רק ביחידת חטיבה" };
  const type = String(formData.get("type") || "") as RequestType;
  const message = String(formData.get("message") || "").trim();
  if (!type) return { error: "בחר נושא" };
  if (!message) return { error: "הזן הודעה" };
  if (!(await canHandleType(user, type))) return { error: "אינך אחראי על נושא זה" };

  const children = await prisma.battalion.findMany({ where: { parentId: unit.id }, select: { id: true } });
  const childIds = children.map((c) => c.id);
  const text = `📢 <b>עדכון מהחטיבה — ${escapeTelegram(REQUEST_TYPE_LABEL[type])}</b>\n${escapeTelegram(message)}\n\n<i>— ${escapeTelegram(user.fullName ?? "מפקד תא")}</i>`;
  const sent = await prisma.requestResponsible.count({ where: { battalionId: { in: childIds }, type, chatId: { not: null } } });
  await Promise.all(children.map((c) => notifyBattalionResponsibles(c.id, type, text)));
  await audit(user.id, "BROADCAST_RESPONSIBLES", "RequestType", type, { sent });
  return { ok: true, sent };
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
  // 📷 תמונות מצורפות (תקלות בינוי וכד') — עד 6, base64 data-URL
  const images = formData.getAll("image").map(String).filter((s) => s.startsWith("data:image/")).slice(0, 6);
  if (images.length) {
    await prisma.requestImage.createMany({ data: images.map((imageData) => ({ requestId: req.id, imageData, createdById: user.id })) });
  }
  await audit(user.id, "CREATE_REQUEST", "Request", req.id, { type, targetUnitId: unit.parentId, images: images.length });
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
  const req = await prisma.request.findUnique({ where: { id }, select: { battalionId: true, targetUnitId: true, type: true, title: true } });
  if (!req) return { error: "דרישה לא נמצאה" };
  // הרשאה: היחידה הפותחת (גדוד) או היחידה הממונה (חטיבה)
  if (req.battalionId !== user.battalionId && req.targetUnitId !== user.battalionId) return { error: "אין הרשאה" };
  await prisma.requestUpdate.create({ data: { requestId: id, authorId: user.id, authorName: user.fullName ?? null, text } });
  // 🔔 אם החטיבה הגיבה (עדכון בלי שינוי-סטטוס) — מתריעים לאחראי-התחום בגדוד (היה חסר)
  if (req.targetUnitId === user.battalionId) {
    await notifyBattalionResponsibles(req.battalionId, req.type,
      `💬 עדכון בדרישה — <b>${escapeTelegram(REQUEST_TYPE_LABEL[req.type])}</b>\n${escapeTelegram(req.title)}\n${escapeTelegram(text.slice(0, 300))}`).catch(() => {});
  }
  revalidatePath("/requests");
  return { ok: true };
}

/** חטיבה משנה סטטוס טיפול (+ דיווח). */
export async function setRequestStatus(formData: FormData): Promise<{ error?: string; ok?: boolean }> {
  const user = await requireUser();
  const id = String(formData.get("id") || "");
  const status = String(formData.get("status") || "") as RequestStatus;
  const note = String(formData.get("note") || "").trim();
  const req = await prisma.request.findUnique({ where: { id }, select: { targetUnitId: true, status: true, type: true, title: true, battalionId: true } });
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
  await notifyBattalionResponsibles(req.battalionId, req.type,
    `🔔 עדכון דרישה — <b>${escapeTelegram(REQUEST_TYPE_LABEL[req.type])}</b>\n${escapeTelegram(req.title)}\nסטטוס: <b>${escapeTelegram(REQUEST_STATUS_LABEL[status])}</b>${note ? `\n${escapeTelegram(note)}` : ""}`);
  revalidatePath("/requests");
  return { ok: true };
}

/** בדיקת מלכ"א ביחידת חטיבה — משותף להגדרות. מחזיר את מזהה החטיבה. */
async function requireMalkaBrigade(user: Sessionish): Promise<string | null> {
  if (!isMalka(user)) return null;
  const unit = await myUnit(user);
  return unit?.level === "BRIGADE" ? unit.id : null;
}

/** מלכ"א — הגדרת סוג: דגל אישור-מפמ + חלון בקשה. */
export async function setTypeConfig(formData: FormData): Promise<{ error?: string; ok?: boolean }> {
  const user = await requireUser();
  const bId = await requireMalkaBrigade(user);
  if (!bId) return { error: "רק מלכ\"א" };
  const type = String(formData.get("type") || "") as RequestType;
  if (!type) return { error: "חסר סוג" };
  const cutoffRaw = String(formData.get("cutoffHour") || "").trim();
  const cutoffHour = cutoffRaw === "" ? null : Math.max(0, Math.min(23, parseInt(cutoffRaw, 10) || 0));
  const shared = {
    requiresApproval: formData.get("requiresApproval") === "on",
    requestDays: String(formData.get("requestDays") || "").trim() || null,
    requestHours: String(formData.get("requestHours") || "").trim() || null,
    supplyTiming: String(formData.get("supplyTiming") || "").trim() || null,
    cutoffHour,
  };
  await prisma.requestTypeConfig.upsert({
    where: { brigadeUnitId_type: { brigadeUnitId: bId, type } },
    update: shared,
    create: { brigadeUnitId: bId, type, ...shared },
  });
  revalidatePath("/requests");
  return { ok: true };
}

/** מלכ"א — הוספת שדה דינמי לסוג. */
export async function addFieldDef(formData: FormData): Promise<{ error?: string; ok?: boolean }> {
  const user = await requireUser();
  const bId = await requireMalkaBrigade(user);
  if (!bId) return { error: "רק מלכ\"א" };
  const type = String(formData.get("type") || "") as RequestType;
  const side = (String(formData.get("side") || "REQUESTER") === "HANDLER" ? "HANDLER" : "REQUESTER") as RequestFieldSide;
  const label = String(formData.get("label") || "").trim();
  const fieldType = String(formData.get("fieldType") || "TEXT") as RequestFieldType;
  if (!type || !label) return { error: "בחר סוג והזן שם שדה" };
  const options = String(formData.get("options") || "").split(",").map((s) => s.trim()).filter(Boolean);
  const max = await prisma.requestFieldDef.aggregate({ where: { brigadeUnitId: bId, type, side }, _max: { sortOrder: true } });
  await prisma.requestFieldDef.create({
    data: { brigadeUnitId: bId, type, side, fieldKey: `f${nanoid(8)}`, label, fieldType, options, required: formData.get("required") === "on", sortOrder: (max._max.sortOrder ?? -1) + 1 },
  });
  revalidatePath("/requests");
  return { ok: true };
}

/** מלכ"א — עדכון שדה (שם / אופציות / חובה). */
export async function updateFieldDef(formData: FormData): Promise<{ error?: string; ok?: boolean }> {
  const user = await requireUser();
  const bId = await requireMalkaBrigade(user);
  if (!bId) return { error: "רק מלכ\"א" };
  const id = String(formData.get("id") || "");
  const def = await prisma.requestFieldDef.findFirst({ where: { id, brigadeUnitId: bId }, select: { id: true } });
  if (!def) return { error: "שדה לא נמצא" };
  await prisma.requestFieldDef.update({
    where: { id },
    data: {
      label: String(formData.get("label") || "").trim() || undefined,
      options: String(formData.get("options") || "").split(",").map((s) => s.trim()).filter(Boolean),
      required: formData.get("required") === "on",
    },
  });
  revalidatePath("/requests");
  return { ok: true };
}

/** מלכ"א — מחיקת שדה. */
export async function removeFieldDef(formData: FormData): Promise<void> {
  const user = await requireUser();
  const bId = await requireMalkaBrigade(user);
  if (!bId) return;
  const id = String(formData.get("id") || "");
  const def = await prisma.requestFieldDef.findFirst({ where: { id, brigadeUnitId: bId }, select: { id: true } });
  if (!def) return;
  await prisma.requestFieldDef.delete({ where: { id } });
  revalidatePath("/requests");
}

/** חטיבה — מילוי/עדכון שדות טיפול דינמיים (מוזגים ל-data של הדרישה). */
export async function saveHandlerFields(formData: FormData): Promise<{ error?: string; ok?: boolean }> {
  const user = await requireUser();
  const id = String(formData.get("id") || "");
  const req = await prisma.request.findUnique({ where: { id }, select: { targetUnitId: true, type: true, data: true, title: true, battalionId: true } });
  if (!req) return { error: "דרישה לא נמצאה" };
  if (req.targetUnitId !== user.battalionId) return { error: "רק החטיבה יכולה למלא שדות טיפול" };
  if (!(await canHandleType(user, req.type))) return { error: "אינך אחראי על סוג זה" };
  const merged: Record<string, string> = { ...((req.data as Record<string, string> | null) ?? {}) };
  for (const [k, v] of formData.entries()) {
    // שדות טיפול נשמרים ב-namespace "h:" כדי לא להתנגש עם שדות המבקש (fieldKey זהה אפשרי)
    if (k.startsWith("fh_") && typeof v === "string") { const key = `h:${k.slice(3)}`; if (v.trim()) merged[key] = v.trim(); else delete merged[key]; }
  }
  await prisma.request.update({ where: { id }, data: { data: merged } });
  await notifyBattalionResponsibles(req.battalionId, req.type,
    `🔔 עודכנו פרטי טיפול — <b>${escapeTelegram(REQUEST_TYPE_LABEL[req.type])}</b>\n${escapeTelegram(req.title)}`);
  revalidatePath("/requests");
  return { ok: true };
}

// ===== אחראי-תחום ברמת הגדוד (צד המבקש) — פר-סוג =====

/** מפקד הגדוד מוסיף אחראי-תחום לסוג דרישה: חייל במערכת (userId) או חייל ללא חשבון (שם+טלפון → טוקן בוט). */
export async function addResponsible(formData: FormData): Promise<{ error?: string; ok?: boolean }> {
  const user = await requireUser();
  if (!isCommander(user)) return { error: "רק מפקד הגדוד יכול להגדיר אחראים" };
  const unit = await myUnit(user);
  if (unit?.level === "BRIGADE") return { error: "הגדרה זו מיועדת לגדוד" };
  const bId = user.battalionId!;
  const type = String(formData.get("type") || "") as RequestType;
  if (!type) return { error: "חסר סוג" };
  const userId = String(formData.get("userId") || "").trim();
  let name = String(formData.get("name") || "").trim();
  const phone = String(formData.get("phone") || "").trim() || null;
  if (userId) {
    // חייל במערכת — חייב להיות של הגדוד
    const target = await prisma.appUser.findFirst({ where: { id: userId, battalionId: bId }, select: { id: true, fullName: true } });
    if (!target) return { error: "משתמש לא נמצא בגדוד" };
    name = target.fullName ?? (name || "—");
    await prisma.requestResponsible.create({ data: { battalionId: bId, type, userId, name, phone } });
  } else {
    // חייל ללא חשבון — שם חובה, מקבל טוקן לקישור בוט
    if (!name) return { error: "הזן שם" };
    await prisma.requestResponsible.create({ data: { battalionId: bId, type, name, phone } });
  }
  revalidatePath("/requests");
  return { ok: true };
}

/** מפקד הגדוד מסיר אחראי-תחום. */
export async function removeResponsible(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!isCommander(user)) return;
  const id = String(formData.get("id") || "");
  const r = await prisma.requestResponsible.findUnique({ where: { id }, select: { battalionId: true } });
  if (!r || r.battalionId !== user.battalionId!) return;
  await prisma.requestResponsible.delete({ where: { id } });
  revalidatePath("/requests");
}

// ===== הובלה — מעמיס/פורק (עדכון דרך הבוט) =====
type TransportLink = { role: "LOADER" | "UNLOADER"; label: string; name: string | null; link: string | null; reportText: string | null; reportedAt: string | null };

/** יצירת/שליפת צדדי-הובלה (מעמיס/פורק) לדרישת הובלה + קישורי בוט אישיים לשיתוף. */
export async function ensureTransportParties(requestId: string): Promise<{ error?: string; links?: TransportLink[] }> {
  const user = await requireUser();
  const req = await prisma.request.findUnique({ where: { id: requestId }, select: { battalionId: true, targetUnitId: true, type: true, data: true } });
  if (!req) return { error: "דרישה לא נמצאה" };
  // רק הגדוד הפותח או החטיבה הממונה
  if (req.battalionId !== user.battalionId && req.targetUnitId !== user.battalionId) return { error: "אין הרשאה" };
  if (req.type !== "TRANSPORT") return { error: "רלוונטי להובלה בלבד" };
  const data = (req.data as Record<string, string> | null) ?? {};
  const contacts: { role: "LOADER" | "UNLOADER"; name: string | null }[] = [
    { role: "LOADER", name: data["loaderContact"] || null },
    { role: "UNLOADER", name: data["unloaderContact"] || null },
  ];
  for (const c of contacts) {
    await prisma.transportParty.upsert({
      where: { requestId_role: { requestId, role: c.role } },
      update: { name: c.name ?? undefined },
      create: { requestId, role: c.role, name: c.name },
    });
  }
  const battalion = await prisma.battalion.findUnique({ where: { id: req.battalionId }, select: { telegramBotUsername: true } });
  const botUsername = battalion?.telegramBotUsername ?? null;
  const parties = await prisma.transportParty.findMany({ where: { requestId }, select: { role: true, name: true, token: true, reportText: true, reportedAt: true } });
  const prefix = { LOADER: "tload", UNLOADER: "tunload" } as const;
  const links: TransportLink[] = parties.map((p) => ({
    role: p.role, label: p.role === "LOADER" ? "מעמיס" : "פורק", name: p.name,
    link: botUsername ? `https://t.me/${botUsername}?start=${prefix[p.role]}_${p.token}` : null,
    reportText: p.reportText, reportedAt: p.reportedAt?.toISOString() ?? null,
  }));
  revalidatePath("/requests");
  return { links };
}
