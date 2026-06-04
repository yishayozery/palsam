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
  { type: "EQUIPMENT", name: "מחסן ציוד" },
  { type: "COMMS", name: "מחסן תקשוב" },
  { type: "AMMO", name: "בונקר חמידה" },
  { type: "ARMORY", name: "ארמון" },
  { type: "VEHICLES", name: "מחסן רכבים" },
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
    // סטטוסי בסיס
    for (const [n, flags] of [
      ["תקין", { isDefault: true }],
      ["בלאי", { isWear: true }],
      ["פגום", { isWear: true }],
      ['שצ"ל', { isConsumed: true }],
      ["אבוד", { isLoss: true }],
    ] as const) {
      await tx.itemStatus.create({ data: { battalionId: bat.id, name: n, ...flags } });
    }
  });

  await audit(admin.id, "CREATE_BATTALION", "Battalion", code, { name });
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
