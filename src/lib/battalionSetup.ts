import { prisma } from "@/lib/prisma";
import { PRESET_ROLES } from "@/lib/rbac";
import { ensureNotificationRules } from "@/lib/botNotifications";

/** גדוד-תבנית שממנו מעתיקים ברירות-מחדל (נהלים). גדסם 4. */
export const TEMPLATE_BATTALION_CODE = "5554";

/** סטטוסי נוכחות מלאים — מעבר ל-4 המובנים שנזרעים בהקמה. idempotent לפי שם. */
const FULL_ATTENDANCE_STATUSES: { name: string; icon: string; isPresent: boolean; color: string; sortOrder: number }[] = [
  { name: "נמצא", icon: "✅", isPresent: true, color: "#10b981", sortOrder: 0 },
  { name: "יום יציאה", icon: "⬅️", isPresent: true, color: "#10b981", sortOrder: 1 },
  { name: "יום חזרה", icon: "➡️", isPresent: true, color: "#10b981", sortOrder: 2 },
  { name: "בית (יציאת קו)", icon: "🏠", isPresent: false, color: "#94a3b8", sortOrder: 3 },
  { name: "ימי התארגנות", icon: "🎒", isPresent: false, color: "#60a5fa", sortOrder: 11 },
  { name: "מחלה", icon: "🏥", isPresent: false, color: "#ef4444", sortOrder: 13 },
];

/** זריעת תפקידי RBAC המובנים (idempotent — מדלג על תפקידים שכבר קיימים). */
export async function seedPresetRolesFor(battalionId: string): Promise<number> {
  const existing = await prisma.systemRole.findMany({ where: { battalionId, isPreset: true }, select: { name: true } });
  const have = new Set(existing.map((r) => r.name));
  let created = 0;
  for (const preset of PRESET_ROLES) {
    if (have.has(preset.name)) continue;
    await prisma.systemRole.create({
      data: {
        battalionId, name: preset.name, isPreset: true, isAdmin: preset.isAdmin, isCommander: preset.isCommander, sortOrder: preset.sortOrder,
        permissions: { create: preset.permissions.map((p) => ({ screen: p.screen, level: p.level })) },
      },
    });
    created++;
  }
  return created;
}

/** הוספת סטטוסי נוכחות חסרים (idempotent לפי שם). */
export async function seedAttendanceStatusesFor(battalionId: string): Promise<number> {
  const existing = await prisma.attendanceStatus.findMany({ where: { battalionId }, select: { name: true } });
  const have = new Set(existing.map((s) => s.name));
  const missing = FULL_ATTENDANCE_STATUSES.filter((s) => !have.has(s.name));
  for (const s of missing) await prisma.attendanceStatus.create({ data: { battalionId, ...s } });
  return missing.length;
}

/**
 * העתקת נהלים מגדוד-התבנית (גדסם4), רק אם ריקים ביעד:
 *  - נוהל נהיגה / קצין רכב  → Battalion.drivingProcedureText
 *  - נוהל שמירת נשק / ארמון → ARMORY-holder.weaponsAgreementText (+ signatureClause)
 */
export async function copyProceduresFromTemplate(battalionId: string): Promise<{ weapons: boolean; driving: boolean }> {
  const template = await prisma.battalion.findUnique({ where: { code: TEMPLATE_BATTALION_CODE }, select: { id: true, drivingProcedureText: true } });
  const target = await prisma.battalion.findUnique({ where: { id: battalionId }, select: { drivingProcedureText: true } });
  if (!template || template.id === battalionId || !target) return { weapons: false, driving: false };

  // נוהל נהיגה — על הגדוד
  let driving = false;
  if (template.drivingProcedureText && !target.drivingProcedureText) {
    await prisma.battalion.update({ where: { id: battalionId }, data: { drivingProcedureText: template.drivingProcedureText, drivingProcedureUpdatedAt: new Date() } });
    driving = true;
  }

  // נוהל שמירת נשק / ארמון — על מחסן הארמון
  let weapons = false;
  const tplArmory = await prisma.holder.findFirst({ where: { battalionId: template.id, warehouseType: "ARMORY" }, select: { weaponsAgreementText: true, signatureClause: true } });
  const tgtArmory = await prisma.holder.findFirst({ where: { battalionId, warehouseType: "ARMORY" }, select: { id: true, weaponsAgreementText: true, signatureClause: true } });
  if (tplArmory && tgtArmory) {
    const armoryData: { weaponsAgreementText?: string; signatureClause?: string } = {};
    if (tplArmory.weaponsAgreementText && !tgtArmory.weaponsAgreementText) armoryData.weaponsAgreementText = tplArmory.weaponsAgreementText;
    if (tplArmory.signatureClause && !tgtArmory.signatureClause) armoryData.signatureClause = tplArmory.signatureClause;
    if (Object.keys(armoryData).length > 0) {
      await prisma.holder.update({ where: { id: tgtArmory.id }, data: armoryData });
      weapons = !!armoryData.weaponsAgreementText;
    }
  }
  return { weapons, driving };
}

/** זריעת כל הבסיס הנדרש כדי שגדוד חדש יהיה שמיש. idempotent — בטוח לקרוא שוב (backfill). */
export async function seedBattalionEssentials(battalionId: string) {
  const roles = await seedPresetRolesFor(battalionId);
  const attendance = await seedAttendanceStatusesFor(battalionId);
  await ensureNotificationRules(battalionId);
  const procedures = await copyProceduresFromTemplate(battalionId);
  return { roles, attendance, procedures };
}

/** מצב צ'ק-ליסט הקמה לגדוד — כמה מכל רכיב קיים. משמש את מסך ניהול הגדודים. */
export async function getSetupChecklist(battalionId: string) {
  const [roles, categories, itemTypes, companies, presetRoles, botRules, battalion, armory, demoCompany] = await Promise.all([
    prisma.systemRole.count({ where: { battalionId } }),
    prisma.category.count({ where: { battalionId } }),
    prisma.itemType.count({ where: { battalionId } }),
    prisma.holder.count({ where: { battalionId, kind: "COMPANY" } }),
    prisma.systemRole.count({ where: { battalionId, isPreset: true } }),
    prisma.botNotificationRule.count({ where: { battalionId } }),
    prisma.battalion.findUnique({ where: { id: battalionId }, select: { drivingProcedureText: true } }),
    prisma.holder.findFirst({ where: { battalionId, warehouseType: "ARMORY" }, select: { weaponsAgreementText: true } }),
    prisma.holder.findFirst({ where: { battalionId, kind: "COMPANY", name: DEMO_COMPANY_NAME }, select: { id: true } }),
  ]);
  return {
    roles, categories, itemTypes, companies, botRules,
    hasPresetRoles: presetRoles > 0,
    hasProcedures: !!(armory?.weaponsAgreementText || battalion?.drivingProcedureText),
    hasDemo: !!demoCompany,
  };
}

/** שם פלוגת הדמו + קטגוריית הדמו — מזהים אותם למחיקה/זיהוי. */
export const DEMO_COMPANY_NAME = "פלוגת דמו";
export const DEMO_CATEGORY_NAME = "דמו";

const DEMO_SOLDIER_NAMES = [
  "דמו — אבי כהן", "דמו — בני לוי", "דמו — גיל מזרחי", "דמו — דן פרץ",
  "דמו — הראל אמסלם", "דמו — יואב שרון", "דמו — נדב ביטון", "דמו — עידן אזולאי",
];

/**
 * יצירת "פלוגת דמו" — פלוגה + חיילים + ציוד חתום עליהם, כדי לתרגל את המערכת.
 * הכל מסומן (שם "דמו") וניתן למחיקה בכפתור אחד. idempotent — no-op אם כבר קיימת.
 */
export async function createDemoCompany(battalionId: string): Promise<{ created: boolean; soldiers: number; items: number }> {
  const exists = await prisma.holder.findFirst({ where: { battalionId, kind: "COMPANY", name: DEMO_COMPANY_NAME }, select: { id: true } });
  if (exists) return { created: false, soldiers: 0, items: 0 };

  const warehouse = await prisma.holder.findFirst({ where: { battalionId, warehouseType: "EQUIPMENT" }, select: { id: true } });
  const okStatus = await prisma.itemStatus.findFirst({ where: { battalionId, isDefault: true }, select: { id: true } });
  if (!warehouse || !okStatus) throw new Error("חסר מחסן ציוד או סטטוס 'תקין' — הרץ קודם זריעת בסיס");

  const company = await prisma.holder.create({ data: { battalionId, kind: "COMPANY", name: DEMO_COMPANY_NAME } });
  const category = await prisma.category.create({ data: { battalionId, name: DEMO_CATEGORY_NAME, warehouseType: "EQUIPMENT" } });

  // סוגי-פריט לדמו: 2 סריאליים לחתימה על חיילים
  const rifle = await prisma.itemType.create({ data: { battalionId, name: "דמו — רובה תרגול", trackingMethod: "SERIAL", categoryId: category.id, signable: true } });
  const vest = await prisma.itemType.create({ data: { battalionId, name: "דמו — אפוד תרגול", trackingMethod: "SERIAL", categoryId: category.id, signable: true } });

  let items = 0;
  for (let i = 0; i < DEMO_SOLDIER_NAMES.length; i++) {
    const soldier = await prisma.soldier.create({
      data: { battalionId, fullName: DEMO_SOLDIER_NAMES[i], companyId: company.id, status: "ENLISTED", personalNumber: `9990${String(i + 1).padStart(3, "0")}` },
    });
    // ציוד חתום על החייל (מוצג ב"ציוד חתום" ובמחסן שלו)
    for (const [it, tag] of [[rifle, "R"], [vest, "V"]] as const) {
      await prisma.serialUnit.create({
        data: { battalionId, itemTypeId: it.id, serialNumber: `DEMO-${tag}-${String(i + 1).padStart(3, "0")}`, statusId: okStatus.id, currentHolderId: warehouse.id, signedSoldierId: soldier.id },
      });
      items++;
    }
  }
  return { created: true, soldiers: DEMO_SOLDIER_NAMES.length, items };
}

/** מחיקת פלוגת הדמו + כל הנתונים המסומנים שלה. */
export async function deleteDemoCompany(battalionId: string): Promise<{ deleted: boolean }> {
  const company = await prisma.holder.findFirst({ where: { battalionId, kind: "COMPANY", name: DEMO_COMPANY_NAME }, select: { id: true } });
  const category = await prisma.category.findFirst({ where: { battalionId, name: DEMO_CATEGORY_NAME }, select: { id: true } });
  if (!company && !category) return { deleted: false };

  const demoItemTypeIds = category
    ? (await prisma.itemType.findMany({ where: { battalionId, categoryId: category.id }, select: { id: true } })).map((t) => t.id)
    : [];
  // סדר מחיקה מול FK: יחידות → חיילים → סוגי-פריט → קטגוריה → פלוגה
  if (demoItemTypeIds.length) await prisma.serialUnit.deleteMany({ where: { battalionId, itemTypeId: { in: demoItemTypeIds } } });
  if (company) await prisma.soldier.deleteMany({ where: { battalionId, companyId: company.id } });
  if (demoItemTypeIds.length) await prisma.itemType.deleteMany({ where: { id: { in: demoItemTypeIds } } });
  if (category) await prisma.category.delete({ where: { id: category.id } }).catch(() => {});
  if (company) await prisma.holder.delete({ where: { id: company.id } }).catch(() => {});
  return { deleted: true };
}
