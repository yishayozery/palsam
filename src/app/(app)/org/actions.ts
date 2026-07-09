"use server";

import { revalidatePath } from "next/cache";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/guard";
import { hashPassword } from "@/lib/auth";
import { resolveUniqueUsername } from "@/lib/usernames";
import { audit } from "@/lib/audit";
import type { WarehouseType, Role } from "@/generated/prisma";

/** הזמנת משתמש לישות (מחסן / פלוגה) ישירות מהאקורדיון. אופציונלית מקושר לחייל ברוסטר. */
export async function inviteHolderUser(formData: FormData) {
  const admin = await requireCapability("users.manage");
  const bId = admin.battalionId!;
  const holderId = String(formData.get("holderId") || "");
  const enteredUsername = String(formData.get("username") || "").trim().toLowerCase();
  const phoneIn = String(formData.get("phone") || "").trim() || null;
  const title = String(formData.get("title") || "").trim() || null;
  let fullName = String(formData.get("fullName") || "").trim();
  let phone = phoneIn;
  // אופציונלי: קישור לחייל קיים ברוסטר — שואב את הפרטים אוטומטית
  const soldierId = String(formData.get("soldierId") || "") || null;
  if (soldierId) {
    const soldier = await prisma.soldier.findUnique({ where: { id: soldierId } });
    if (!soldier || soldier.battalionId !== bId) throw new Error("חייל לא נמצא");
    const linked = await prisma.appUser.findUnique({ where: { soldierId } });
    if (linked) throw new Error(`החייל ${soldier.fullName} כבר מקושר למשתמש @${linked.username}`);
    fullName = soldier.fullName;
    phone = phone ?? soldier.phone;
  }
  if (!holderId || !fullName || !enteredUsername) {
    throw new Error("חובה: שם, שם משתמש, ובחירת מחסן/פלוגה");
  }

  const holder = await prisma.holder.findUnique({ where: { id: holderId } });
  if (!holder || holder.battalionId !== bId) throw new Error("מחסן/פלוגה לא נמצא");

  // תפקיד נקבע אוטומטית לפי סוג ה-holder
  const role: Role = holder.kind === "WAREHOUSE" ? "WAREHOUSE_MANAGER" : "COMPANY_REP";

  const username = await resolveUniqueUsername(enteredUsername, bId);
  const inviteToken = nanoid(28);
  const randomHash = await hashPassword(nanoid(32));

  const newUser = await prisma.appUser.create({
    data: {
      username, fullName, phone, title, role, battalionId: bId,
      holderId, soldierId, passwordHash: randomHash, passwordSet: false, inviteToken,
    },
  });
  // ריבוי-הקצאה (UserHolder) — תמיכה בכמה מחסנים אם בעתיד תרצה
  await prisma.userHolder.create({ data: { userId: newUser.id, holderId } });

  await audit(admin.id, "INVITE_HOLDER_USER", "AppUser", username, { holderId, role });
  revalidatePath("/org");
  return { username, inviteToken };
}

/** עדכון פרטי משתמש קיים (שם, תואר, נייד, קישור לחייל) */
export async function updateHolderUser(formData: FormData) {
  const admin = await requireCapability("users.manage");
  const userId = String(formData.get("userId") || "");
  const fullName = String(formData.get("fullName") || "").trim();
  const title = String(formData.get("title") || "").trim() || null;
  const phone = String(formData.get("phone") || "").trim() || null;
  const soldierIdRaw = String(formData.get("soldierId") || "").trim();
  const unlink = formData.get("unlinkSoldier") === "on";

  if (!userId || !fullName) throw new Error("חסרים פרטים");

  const target = await prisma.appUser.findUnique({ where: { id: userId } });
  if (!target || target.battalionId !== admin.battalionId) throw new Error("משתמש לא נמצא");

  let soldierId: string | null | undefined = undefined;
  if (unlink) {
    soldierId = null;
  } else if (soldierIdRaw) {
    const soldier = await prisma.soldier.findUnique({ where: { id: soldierIdRaw } });
    if (!soldier || soldier.battalionId !== admin.battalionId) throw new Error("חייל לא נמצא");
    // ודא שלא מקושר למשתמש אחר
    const linked = await prisma.appUser.findUnique({ where: { soldierId: soldierIdRaw } });
    if (linked && linked.id !== userId) {
      throw new Error(`החייל ${soldier.fullName} כבר מקושר למשתמש @${linked.username}`);
    }
    soldierId = soldierIdRaw;
  }

  // 🆕 אם המשתמש עדיין לא הופעל (passwordSet=false), נחדש גם את ה-username מהשם הפרטי
  let newUsername: string | undefined;
  if (!target.passwordSet && fullName) {
    const first = fullName.trim().split(/\s+/)[0] ?? "";
    const slug = first.replace(/[^A-Za-z֐-׿0-9_.-]+/g, "").slice(0, 24);
    if (slug && slug !== target.username) {
      // ייחודיות בתוך הגדוד (per-battalion)
      newUsername = await resolveUniqueUsername(slug, admin.battalionId!, userId);
    }
  }

  await prisma.appUser.update({
    where: { id: userId },
    data: {
      fullName, title, phone,
      ...(soldierId !== undefined ? { soldierId } : {}),
      ...(newUsername ? { username: newUsername } : {}),
    },
  });
  await audit(admin.id, "UPDATE_HOLDER_USER", "AppUser", userId, { fullName, title, soldierLink: soldierId, newUsername });
  revalidatePath("/org");
}

/**
 * 🔄 שחזור/יצירת מחדש של קישור הזמנה — שולח את המשתמש להגדיר סיסמה חדשה.
 * אופציה ל-MAFAM/SUPER_ADMIN. אם המשתמש כבר הופעל — מאפס passwordSet ויוצר token חדש.
 */
export async function resetUserInvite(formData: FormData): Promise<{ ok?: boolean; error?: string; inviteToken?: string }> {
  try {
    const admin = await requireCapability("users.manage");
    const userId = String(formData.get("userId") || "");
    if (!userId) return { error: "חסר מזהה" };
    const u = await prisma.appUser.findUnique({ where: { id: userId } });
    if (!u || u.battalionId !== admin.battalionId) return { error: "משתמש לא נמצא" };

    const newToken = nanoid(28);
    const randomHash = await hashPassword(nanoid(32));
    await prisma.appUser.update({
      where: { id: userId },
      data: { inviteToken: newToken, passwordSet: false, passwordHash: randomHash },
    });
    await audit(admin.id, "RESET_INVITE", "AppUser", userId);
    revalidatePath("/org");
    revalidatePath("/reps");
    revalidatePath("/users");
    return { ok: true, inviteToken: newToken };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "שגיאה" };
  }
}

/** הסרת משתמש מ-holder (מבטל active = false אם זה הholder היחיד שלו) */
export async function removeHolderUser(formData: FormData) {
  const admin = await requireCapability("users.manage");
  const userId = String(formData.get("userId") || "");
  const holderId = String(formData.get("holderId") || "");
  if (!userId || !holderId) return;
  const u = await prisma.appUser.findUnique({ where: { id: userId } });
  if (!u || u.battalionId !== admin.battalionId) return;

  await prisma.userHolder.deleteMany({ where: { userId, holderId } });
  const remaining = await prisma.userHolder.count({ where: { userId } });
  if (remaining === 0) {
    // לא נשארו holders — בטל את המשתמש (לא נמחק כדי לשמור היסטוריה)
    await prisma.appUser.update({ where: { id: userId }, data: { active: false, holderId: null } });
  } else if (u.holderId === holderId) {
    const fallback = await prisma.userHolder.findFirst({ where: { userId } });
    await prisma.appUser.update({ where: { id: userId }, data: { holderId: fallback?.holderId ?? null } });
  }
  await audit(admin.id, "REMOVE_HOLDER_USER", "AppUser", userId, { holderId });
  revalidatePath("/org");
}

export async function createWarehouse(formData: FormData) {
  const user = await requireCapability("org.manage");
  const bId = user.battalionId!;
  const name = String(formData.get("name") || "").trim();
  const warehouseType = String(formData.get("warehouseType") || "EQUIPMENT") as WarehouseType;
  if (!name) return;
  const wh = await prisma.holder.create({ data: { battalionId: bId, kind: "WAREHOUSE", warehouseType, name } });
  // קישור אוטומטי לכל הפלוגות הקיימות
  const companies = await prisma.holder.findMany({ where: { battalionId: bId, kind: "COMPANY" } });
  for (const c of companies) {
    await prisma.warehouseCompany.create({ data: { warehouseId: wh.id, companyId: c.id } });
  }
  await audit(user.id, "CREATE", "Holder", name, { kind: "WAREHOUSE", warehouseType });
  revalidatePath("/org");
}

export async function createCompany(formData: FormData) {
  const user = await requireCapability("org.manage");
  const bId = user.battalionId!;
  const name = String(formData.get("name") || "").trim();
  if (!name) return;
  const c = await prisma.holder.create({ data: { battalionId: bId, kind: "COMPANY", name } });
  // קישור הפלוגה לכל המחסנים
  const whs = await prisma.holder.findMany({ where: { battalionId: bId, kind: "WAREHOUSE" } });
  for (const w of whs) {
    await prisma.warehouseCompany.create({ data: { warehouseId: w.id, companyId: c.id } });
  }
  await audit(user.id, "CREATE", "Holder", name, { kind: "COMPANY" });
  revalidatePath("/org");
}

export async function renameHolder(formData: FormData) {
  const user = await requireCapability("org.manage");
  const id = String(formData.get("id") || "");
  const name = String(formData.get("name") || "").trim();
  if (!name) return;
  await prisma.holder.update({ where: { id }, data: { name } });
  await audit(user.id, "UPDATE", "Holder", id, { name });
  revalidatePath("/org");
  revalidatePath("/", "layout");
}

/** העלאת/הסרת סמל פלוגה/מחסן (מוצג בסיידבר לצד סמל הגדוד) */
export async function setHolderLogo(formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  try {
    const user = await requireCapability("org.manage");
    const id = String(formData.get("id") || "");
    const rawLogo = String(formData.get("logoData") || "");
    const logoData = rawLogo === "__CLEAR__" ? null
      : rawLogo.startsWith("data:image") ? rawLogo
      : undefined;
    if (logoData === undefined) return { error: "פורמט תמונה לא תקין" };
    const h = await prisma.holder.findUnique({ where: { id } });
    if (!h || h.battalionId !== user.battalionId) return { error: "מחסן/פלוגה לא נמצא" };
    await prisma.holder.update({ where: { id }, data: { logoData } });
    await audit(user.id, "UPDATE_LOGO", "Holder", id);
    revalidatePath("/org");
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "שגיאה" };
  }
}

export async function toggleHolder(formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  const user = await requireCapability("org.manage");
  const id = String(formData.get("id") || "");
  const h = await prisma.holder.findUnique({ where: { id } });
  if (!h || h.battalionId !== user.battalionId) return { error: "לא נמצא" };

  // 🔒 השבתת מחסן — רק אם ריק. אם יש ציוד עליו או החתמות עליו/ממנו לחיילים — חסום.
  if (h.active && h.kind === "WAREHOUSE") {
    const [serial, qty, signedQty] = await Promise.all([
      // ציוד סריאלי ששייך למחסן (על המדף או חתום על חיילים — שומר currentHolderId)
      prisma.serialUnit.count({ where: { currentHolderId: id, dischargedAt: null } }),
      // מלאי כמותי במחסן
      prisma.stockBalance.aggregate({ where: { holderId: id }, _sum: { quantity: true } }),
      // ציוד כמותי שנופק מהמחסן לחיילים וטרם נקלט בחזרה (SIGNOUT − CHECKIN)
      prisma.transferLine.findMany({
        where: { transfer: { status: "COMPLETED", type: { in: ["SIGNOUT", "CHECKIN"] }, fromHolderId: id, toSoldierId: { not: null } }, serialUnitId: null },
        select: { quantity: true, transfer: { select: { type: true } } },
      }),
    ]);
    const qtyStock = qty._sum.quantity ?? 0;
    const outstanding = signedQty.reduce((s, l) => s + (l.transfer.type === "SIGNOUT" ? 1 : -1) * l.quantity, 0);
    const reasons: string[] = [];
    if (serial > 0) reasons.push(`${serial} פריטים סריאליים (על המדף/חתומים)`);
    if (qtyStock > 0) reasons.push(`${qtyStock} יח' מלאי כמותי`);
    if (outstanding > 0) reasons.push(`${outstanding} יח' חתומות על חיילים`);
    if (reasons.length > 0) {
      return { error: `לא ניתן להשבית את "${h.name}" — המחסן אינו ריק: ${reasons.join(" · ")}. יש לרוקן/לזכות את הציוד קודם.` };
    }
  }

  await prisma.holder.update({ where: { id }, data: { active: !h.active } });
  await audit(user.id, "UPDATE", "Holder", id, { active: !h.active });
  revalidatePath("/org");
  return { ok: true };
}
