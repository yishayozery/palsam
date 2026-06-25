/**
 * 🏗️ הקמת גדסם 4 — ייבוא חיילים + מבנה ארגוני מאלפון
 *
 * שימוש:
 *   npx tsx scripts/seed-gadsam4.ts
 *
 * מה הסקריפט עושה:
 *   1. מוודא שגדוד "גדסם 4" קיים (code=5554)
 *   2. ממפה/יוצר פלוגות (Holder kind=COMPANY)
 *   3. יוצר מחלקות (Squad) בתוך כל פלוגה
 *   4. יוצר תפקידי פלוגה (CompanyRole) עם isCommander
 *   5. מייבא 308 חיילים עם שיוך לפלוגה, מחלקה ותפקיד
 *
 * אפשר להריץ כמה פעמים — עושה upsert לפי מספר אישי
 */

import { PrismaClient } from "../src/generated/prisma";
import ExcelJS from "exceljs";

const prisma = new PrismaClient();

const BATTALION_CODE = "5554";
const EXCEL_PATH = "4/אלפון מלא 22.06.2026.xlsx";

// מיפוי פלוגות מהאקסל לפלוגות קיימות במערכת
const COMPANY_MAP: Record<string, string> = {
  "מפקדת הגדס\"ם": "מפקדה",
  "מפקדת הפלה\"ק": "פלה\"ק",
  "פלוגת טנ\"א יחס\"ם 5444": "טנא",
  "מ\"פ טנ\"א": "טנא",
  "פלוגת שינוע": "שינוע",
  "פתן": "פת\"ן",
  "פלגת השהייה": "פלגת השהייה",    // חדש
  "פלגת טיפול נמרץ": "פלגת טיפול נמרץ", // חדש
  "מחלקת פינוי": "מחלקת פינוי",     // חדש
};

// מחלקות שלא ייובאו — placeholder values
const SKIP_SQUADS = new Set(["לא הוזן", "בלתי מתאים", "בלתי נקרא", "עודף כ״א"]);
// פלוגות שלא ייובאו
const SKIP_COMPANIES = new Set(["בלתי מתאים", "בלתי נקרא", "עודף כ״א", "לא הוזן"]);

// תפקידים שהם מפקדים
const COMMANDER_ROLES = new Set([
  "מג\"ד", "סמג\"ד", "מ\"פ", "סמ\"פ", "מ\"מ", "רס\"פ",
  "קמש\"ג", "ק.משא\"ן", "קל\"ג",
]);

function cell(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && "text" in v) return String((v as { text: string }).text);
  if (typeof v === "object" && "result" in v) return String((v as { result: unknown }).result);
  return String(v).trim();
}

async function main() {
  // 1. מצא גדוד
  const battalion = await prisma.battalion.findUnique({ where: { code: BATTALION_CODE } });
  if (!battalion) {
    console.error(`❌ גדוד ${BATTALION_CODE} לא נמצא`);
    process.exit(1);
  }
  const bId = battalion.id;
  console.log(`✅ גדוד: ${battalion.name} (${bId})`);

  // 2. קרא אקסל
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(EXCEL_PATH);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("הקובץ ריק");

  // 3. אסוף נתונים
  type RawSoldier = {
    personalNumber: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    email: string | null;
    companyRaw: string;
    squadRaw: string;
    roleRaw: string;
  };

  const soldiers: RawSoldier[] = [];
  const companiesNeeded = new Set<string>();
  const squadsNeeded = new Map<string, Set<string>>(); // companyName → set of squad names
  const rolesNeeded = new Set<string>();

  ws.eachRow((row, idx) => {
    if (idx === 1) return;
    const pn = cell(row.getCell(1).value).replace(/\D/g, "");
    const firstName = cell(row.getCell(2).value);
    const lastName = cell(row.getCell(3).value);
    if (!pn || !firstName || !lastName) return;

    const phone = cell(row.getCell(4).value) || null;
    const email = cell(row.getCell(5).value) || null;
    const companyRaw = cell(row.getCell(22).value) || "לא הוזן"; // עמודה V = פלוגה
    const squadRaw = cell(row.getCell(23).value) || "";           // עמודה W = מחלקה
    const roleRaw = cell(row.getCell(15).value) || "";            // עמודה O = תפקיד ראשי

    // דלג על חיילים בפלוגות placeholder
    if (SKIP_COMPANIES.has(companyRaw)) return;

    const mappedCompany = COMPANY_MAP[companyRaw] || companyRaw;
    companiesNeeded.add(mappedCompany);

    if (squadRaw && !SKIP_SQUADS.has(squadRaw)) {
      if (!squadsNeeded.has(mappedCompany)) squadsNeeded.set(mappedCompany, new Set());
      squadsNeeded.get(mappedCompany)!.add(squadRaw);
    }

    if (roleRaw && roleRaw !== "לא הוזן") {
      rolesNeeded.add(roleRaw);
    }

    soldiers.push({
      personalNumber: pn,
      firstName,
      lastName,
      phone,
      email,
      companyRaw: mappedCompany,
      squadRaw: (squadRaw && !SKIP_SQUADS.has(squadRaw)) ? squadRaw : "",
      roleRaw: (roleRaw && roleRaw !== "לא הוזן") ? roleRaw : "",
    });
  });

  console.log(`📋 ${soldiers.length} חיילים לייבוא`);
  console.log(`📋 ${companiesNeeded.size} פלוגות: ${[...companiesNeeded].join(", ")}`);
  console.log(`📋 ${squadsNeeded.size} פלוגות עם מחלקות`);
  console.log(`📋 ${rolesNeeded.size} תפקידים: ${[...rolesNeeded].join(", ")}`);

  // 4. יצירת/עדכון פלוגות
  const existingCompanies = await prisma.holder.findMany({
    where: { battalionId: bId, kind: "COMPANY" },
    select: { id: true, name: true },
  });
  const companyMap = new Map(existingCompanies.map(c => [c.name, c.id]));
  console.log(`\n📂 פלוגות קיימות: ${existingCompanies.map(c => c.name).join(", ")}`);

  for (const name of companiesNeeded) {
    if (!companyMap.has(name)) {
      const created = await prisma.holder.create({
        data: { battalionId: bId, name, kind: "COMPANY" },
      });
      companyMap.set(name, created.id);
      console.log(`  ✨ נוצרה פלוגה: ${name}`);
    }
  }

  // 5. יצירת מחלקות
  const existingSquads = await prisma.squad.findMany({
    where: { battalionId: bId },
    select: { id: true, name: true, companyId: true },
  });
  const squadMap = new Map(existingSquads.map(s => [`${s.companyId}:${s.name}`, s.id]));

  for (const [companyName, squadNames] of squadsNeeded) {
    const companyId = companyMap.get(companyName);
    if (!companyId) continue;
    for (const squadName of squadNames) {
      const key = `${companyId}:${squadName}`;
      if (!squadMap.has(key)) {
        const created = await prisma.squad.create({
          data: { battalionId: bId, companyId, name: squadName },
        });
        squadMap.set(key, created.id);
        console.log(`  ✨ מחלקה: ${squadName} (${companyName})`);
      }
    }
  }

  // 6. יצירת תפקידים
  const existingRoles = await prisma.companyRole.findMany({
    where: { battalionId: bId },
    select: { id: true, name: true },
  });
  const roleMap = new Map(existingRoles.map(r => [r.name, r.id]));

  for (const roleName of rolesNeeded) {
    if (!roleMap.has(roleName)) {
      const isCmd = COMMANDER_ROLES.has(roleName);
      const created = await prisma.companyRole.create({
        data: { battalionId: bId, name: roleName, isCommander: isCmd },
      });
      roleMap.set(roleName, created.id);
      console.log(`  ✨ תפקיד: ${roleName}${isCmd ? " (מפקד)" : ""}`);
    }
  }

  // 7. ייבוא חיילים
  const existingPNs = new Map(
    (await prisma.soldier.findMany({
      where: { battalionId: bId, personalNumber: { not: null } },
      select: { id: true, personalNumber: true },
    })).map(s => [s.personalNumber!, s.id])
  );

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const s of soldiers) {
    const companyId = companyMap.get(s.companyRaw);
    if (!companyId) { skipped++; continue; }

    const squadId = s.squadRaw ? squadMap.get(`${companyId}:${s.squadRaw}`) : undefined;
    const roleId = s.roleRaw ? roleMap.get(s.roleRaw) : undefined;

    const data = {
      battalionId: bId,
      fullName: `${s.firstName} ${s.lastName}`,
      firstName: s.firstName,
      lastName: s.lastName,
      personalNumber: s.personalNumber,
      phone: s.phone,
      companyId,
      squadId: squadId || undefined,
      companyRoleId: roleId || undefined,
      status: "REGISTERED" as const,
    };

    if (existingPNs.has(s.personalNumber)) {
      // עדכן חייל קיים
      await prisma.soldier.update({
        where: { id: existingPNs.get(s.personalNumber)! },
        data: {
          fullName: data.fullName,
          firstName: data.firstName,
          lastName: data.lastName,
          phone: data.phone,
          companyId: data.companyId,
          squadId: data.squadId ?? null,
          companyRoleId: data.companyRoleId ?? null,
        },
      });
      updated++;
    } else {
      await prisma.soldier.create({ data });
      created++;
    }
  }

  console.log(`\n✅ סיום ייבוא:`);
  console.log(`   נוצרו: ${created}`);
  console.log(`   עודכנו: ${updated}`);
  console.log(`   דולגו: ${skipped}`);

  // 8. סיכום
  const totalSoldiers = await prisma.soldier.count({ where: { battalionId: bId } });
  const totalCompanies = await prisma.holder.count({ where: { battalionId: bId, kind: "COMPANY" } });
  const totalSquads = await prisma.squad.count({ where: { battalionId: bId } });
  const totalRoles = await prisma.companyRole.count({ where: { battalionId: bId } });

  console.log(`\n📊 סך הכל בגדסם 4:`);
  console.log(`   חיילים: ${totalSoldiers}`);
  console.log(`   פלוגות: ${totalCompanies}`);
  console.log(`   מחלקות: ${totalSquads}`);
  console.log(`   תפקידים: ${totalRoles}`);
}

main()
  .catch((e) => { console.error("❌ שגיאה:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
