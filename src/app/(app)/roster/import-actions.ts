"use server";

import { revalidatePath } from "next/cache";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/guard";
import { audit } from "@/lib/audit";

function cell(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && "text" in v) return String((v as { text: string }).text);
  if (typeof v === "object" && "result" in v) return String((v as { result: unknown }).result);
  return String(v).trim();
}

/**
 * ייבוא חיילים מקובץ אקסל. שורה ראשונה = כותרות.
 * עמודות (בסדר זה):
 *   A: שם פרטי *
 *   B: שם משפחה *
 *   C: פלוגה (שם בדיוק כפי שמופיע במערכת) *
 *   D: מספר אישי (אופציונלי)
 *   E: נייד (אופציונלי)
 *   F: מחלקה (אופציונלי)
 *   G: לאשר גיוס? (כן/לא — ברירת מחדל לא)
 */
export async function importSoldiersRoster(formData: FormData): Promise<{ created: number; skipped: number; errors: string[] }> {
  const user = await requireCapability("soldiers.roster");
  const bId = user.battalionId!;
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) throw new Error("לא נבחר קובץ");

  const wb = new ExcelJS.Workbook();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await wb.xlsx.load(Buffer.from(await file.arrayBuffer()) as any);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("הקובץ ריק");

  const companies = await prisma.holder.findMany({ where: { battalionId: bId, kind: "COMPANY", active: true } });
  const companyByName = new Map<string, string>();
  for (const c of companies) companyByName.set(c.name.trim(), c.id);

  // PNs קיימים כדי למנוע כפילות
  const existingPNs = new Set(
    (await prisma.soldier.findMany({ where: { battalionId: bId, personalNumber: { not: null } }, select: { personalNumber: true } }))
      .map((s) => s.personalNumber!)
  );

  const errors: string[] = [];
  const toCreate: {
    firstName: string; lastName: string; companyId: string; personalNumber: string | null;
    phone: string | null; platoon: string | null; enlisted: boolean;
  }[] = [];
  const seenPNsInFile = new Set<string>();

  ws.eachRow((row, idx) => {
    if (idx === 1) return; // כותרות
    const firstName = cell(row.getCell(1).value);
    const lastName = cell(row.getCell(2).value);
    const companyName = cell(row.getCell(3).value);
    const personalNumberRaw = cell(row.getCell(4).value).replace(/\D/g, "");
    const phone = cell(row.getCell(5).value) || null;
    const platoon = cell(row.getCell(6).value) || null;
    const enlistText = cell(row.getCell(7).value).toLowerCase();
    const enlisted = enlistText === "כן" || enlistText === "yes" || enlistText === "true" || enlistText === "1";

    if (!firstName || !lastName) {
      errors.push(`שורה ${idx}: שם פרטי+שם משפחה חובה`);
      return;
    }
    const companyId = companyByName.get(companyName);
    if (!companyId) {
      errors.push(`שורה ${idx}: פלוגה "${companyName}" לא נמצאה`);
      return;
    }
    const personalNumber = personalNumberRaw || null;
    if (personalNumber) {
      if (existingPNs.has(personalNumber)) { errors.push(`שורה ${idx}: מ.א. ${personalNumber} כבר קיים בגדוד`); return; }
      if (seenPNsInFile.has(personalNumber)) { errors.push(`שורה ${idx}: מ.א. ${personalNumber} כפול בקובץ עצמו`); return; }
      seenPNsInFile.add(personalNumber);
    }
    toCreate.push({ firstName, lastName, companyId, personalNumber, phone, platoon, enlisted });
  });

  let created = 0;
  for (const s of toCreate) {
    try {
      await prisma.soldier.create({
        data: {
          battalionId: bId, fullName: `${s.firstName} ${s.lastName}`,
          firstName: s.firstName, lastName: s.lastName,
          personalNumber: s.personalNumber, phone: s.phone, platoon: s.platoon,
          companyId: s.companyId, active: true,
          enlisted: s.enlisted,
          enlistedAt: s.enlisted ? new Date() : null,
          enlistedById: s.enlisted ? user.id : null,
        },
      });
      created++;
    } catch (e) {
      errors.push(`${s.firstName} ${s.lastName}: ${e instanceof Error ? e.message : "שגיאה"}`);
    }
  }

  await audit(user.id, "IMPORT_ROSTER", "Soldier", `${created} soldiers`, { created, skipped: toCreate.length - created, errors: errors.length });
  revalidatePath("/roster");
  return { created, skipped: errors.length, errors: errors.slice(0, 20) };
}

/** סיד מהיר — 5 חיילי דוגמה לכל פלוגה פעילה. למפ"מ בלבד. שמות עבריים גנריים. */
export async function seedSampleSoldiers(): Promise<{ created: number }> {
  const user = await requireCapability("soldiers.roster");
  const bId = user.battalionId!;
  const companies = await prisma.holder.findMany({ where: { battalionId: bId, kind: "COMPANY", active: true } });
  if (companies.length === 0) throw new Error("אין פלוגות פעילות. הקם פלוגות תחילה ב'מבנה ארגוני'.");

  const firstNames = ["יוסי", "דוד", "מיכאל", "אבי", "רון", "אלון", "נדב", "אריאל", "עומר", "תומר", "אורי", "גיל", "ניר", "אלעד", "שחר"];
  const lastNames  = ["כהן", "לוי", "מזרחי", "פרץ", "ביטון", "אברהם", "מלכה", "אליהו", "חיים", "שמואל", "אסולין", "ישראלי", "בן-דוד", "ארביב", "בן-חמו"];

  let created = 0;
  const existingPNs = new Set(
    (await prisma.soldier.findMany({ where: { battalionId: bId, personalNumber: { not: null } }, select: { personalNumber: true } }))
      .map((s) => s.personalNumber!)
  );

  for (const c of companies) {
    for (let i = 0; i < 5; i++) {
      const fn = firstNames[Math.floor((Math.random() * 1e6) % firstNames.length)];
      const ln = lastNames[Math.floor((Math.random() * 1e6) % lastNames.length)];
      // PN ייחודי - 7 ספרות; אם תפוס נדלג
      let pn = "";
      for (let attempt = 0; attempt < 20; attempt++) {
        const candidate = String(1000000 + Math.floor((Math.random() * 1e6) % 9000000));
        if (!existingPNs.has(candidate)) { pn = candidate; break; }
      }
      if (!pn) continue;
      existingPNs.add(pn);
      await prisma.soldier.create({
        data: {
          battalionId: bId, fullName: `${fn} ${ln}`, firstName: fn, lastName: ln,
          personalNumber: pn, companyId: c.id, active: true,
          enlisted: true, enlistedAt: new Date(), enlistedById: user.id,
        },
      });
      created++;
    }
  }
  await audit(user.id, "SEED_SOLDIERS", "Soldier", `${created}`, { companies: companies.length });
  revalidatePath("/roster");
  return { created };
}
