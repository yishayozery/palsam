"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { nanoid } from "nanoid";
import { requireSuperAdmin } from "@/lib/guard";
import { hashPassword } from "@/lib/auth";
import { resolveUniqueUsername } from "@/lib/usernames";
import { audit } from "@/lib/audit";
import type { WarehouseType } from "@/generated/prisma";

const WH_DEFS: { type: WarehouseType; name: string }[] = [
  { type: "EQUIPMENT", name: "מחסן ציוד" },           // קל"ג
  { type: "COMMS", name: "מחסן תקשוב" },              // קשר"ג
  { type: "AMMO", name: "בונקר חמידה" },              // אחראי בונקר
  { type: "ARMORY", name: "ארמון" },                   // אחראי ארמון
  { type: "VEHICLES", name: "מחסן רכבים" },           // קצין רכב
  { type: "MEDICAL", name: "מחסן רפואה" },            // קרפ"ג
];

/** הקמת גדוד חדש + משתמש מפמ + 4 מחסנים + מילוני בסיס */
export async function createBattalion(formData: FormData) {
  const admin = await requireSuperAdmin();
  const name = String(formData.get("name") || "").trim();
  const code = String(formData.get("code") || "").trim().toUpperCase();
  const brigade = String(formData.get("brigade") || "").trim() || null;
  const commander = String(formData.get("commander") || "").trim() || null;
  const motto = String(formData.get("motto") || "").trim() || null;
  const mafamUser = String(formData.get("mafamUser") || "").trim();
  const mafamName = String(formData.get("mafamName") || "").trim();
  const mafamPhone = String(formData.get("mafamPhone") || "").trim() || null;
  if (!name || !code || !mafamUser || !mafamName) return;

  // ולידציה: מספר גדוד ומספר חטיבה — ספרות בלבד
  if (!/^\d+$/.test(code)) throw new Error("מספר גדוד חייב להכיל ספרות בלבד");
  if (brigade && !/^\d+$/.test(brigade)) throw new Error("מספר חטיבה חייב להכיל ספרות בלבד");

  const exists = await prisma.battalion.findUnique({ where: { code } });
  if (exists) return;

  const mafamUsername = await resolveUniqueUsername(mafamUser, brigade || code);

  await prisma.$transaction(async (tx) => {
    const bat = await tx.battalion.create({ data: { name, code, brigade, commander, motto } });
    // מפמ — באמצעות הזמנה (יגדיר סיסמה בכניסה ראשונה)
    await tx.appUser.create({
      data: {
        username: mafamUsername, fullName: mafamName, phone: mafamPhone, role: "BATTALION_ADMIN",
        battalionId: bat.id, passwordHash: await hashPassword(nanoid(32)),
        passwordSet: false, inviteToken: nanoid(28),
      },
    });
    // 4 מחסנים
    for (const w of WH_DEFS) {
      await tx.holder.create({ data: { battalionId: bat.id, kind: "WAREHOUSE", warehouseType: w.type, name: w.name } });
    }
    // סטטוסי בסיס — פריטים
    for (const [n, flags] of [
      ["תקין", { isDefault: true }],
      ["בלאי", { isWear: true }],
      ["פגום", { isWear: true }],
      ['שצ"ל', { isConsumed: true }],
      ["אבוד", { isLoss: true }],
    ] as const) {
      await tx.itemStatus.create({ data: { battalionId: bat.id, name: n, ...flags } });
    }
    // סטטוסי בסיס — נוכחות
    const attDefs: { name: string; icon: string; isPresent: boolean }[] = [
      { name: "נמצא", icon: "✅", isPresent: true },
      { name: "יום יציאה", icon: "⬅️", isPresent: true },
      { name: "יום חזרה", icon: "➡️", isPresent: true },
      { name: "יציאת קו", icon: "🏠", isPresent: false },
    ];
    for (let i = 0; i < attDefs.length; i++) {
      await tx.attendanceStatus.create({
        data: { battalionId: bat.id, name: attDefs[i].name, icon: attDefs[i].icon, isPresent: attDefs[i].isPresent, color: "#10b981", sortOrder: i },
      });
    }
  });

  await audit(admin.id, "CREATE_BATTALION", "Battalion", code, { name });
  revalidatePath("/admin/battalions");
}

/** אדמין-על: איפוס סיסמת משתמש (מפמ) — מחדש inviteToken ומאפס passwordSet.
 *  אחרי הפעולה מופיע לינק הזמנה חדש (/invite/[token]) לשליחה למשתמש. */
export async function resetUserPassword(formData: FormData) {
  const admin = await requireSuperAdmin();
  const id = String(formData.get("id") || "");
  const user = await prisma.appUser.findUnique({ where: { id }, select: { username: true } });
  if (!user) return;
  const inviteToken = nanoid(28);
  await prisma.appUser.update({ where: { id }, data: { inviteToken, passwordSet: false } });
  await audit(admin.id, "RESET_PASSWORD", "AppUser", user.username, {});
  revalidatePath("/admin/battalions");
}

export async function toggleBattalion(formData: FormData) {
  const admin = await requireSuperAdmin();
  const id = String(formData.get("id") || "");
  const b = await prisma.battalion.findUnique({ where: { id } });
  if (!b) return;
  await prisma.battalion.update({ where: { id }, data: { active: !b.active } });
  await audit(admin.id, "UPDATE", "Battalion", id, { active: !b.active });
  revalidatePath("/admin/battalions");
}
