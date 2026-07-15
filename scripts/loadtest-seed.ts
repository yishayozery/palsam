/**
 * 🌱 זריעת נתוני-דמו לגדוד 21 (code=21) לצורך בדיקת עומס + תצוגה לצוות.
 * scope מלא לגדוד 21 בלבד. מסומן ב-personalNumber בטווח 8800001+ (זיהוי/ניקוי).
 *
 *   npx tsx --env-file=.env scripts/loadtest-seed.ts
 */
import { PrismaClient } from "../src/generated/prisma";

const p = new PrismaClient();
const N_SOLDIERS = 500;
const COMPANIES = ["פלוגה א'", "פלוגה ב'", "פלוגה ג'", "פלוגה ד'", "מפקדה"];
const FIRST = ["יוסי", "דני", "אבי", "משה", "איתי", "עומר", "נעם", "רון", "גיא", "אלון", "תומר", "ליאור", "עידו", "בר", "שגיא", "יונתן", "אורי", "עמית", "דור", "ניר"];
const LAST = ["כהן", "לוי", "מזרחי", "פרץ", "ביטון", "אברהם", "פרידמן", "דהן", "אזולאי", "חדד", "גבאי", "מלכה", "עמר", "שרון", "ברוך"];
const DIETS = ["צמחוני", "טבעוני", "ציליאק", "כשרות בד\"ץ"];

async function main() {
  const b = await p.battalion.findFirst({ where: { code: "21" }, select: { id: true, name: true } });
  if (!b) throw new Error("גדוד 21 לא נמצא");
  const warehouse = await p.holder.findFirst({ where: { battalionId: b.id, warehouseType: "EQUIPMENT" }, select: { id: true } });
  const okStatus = await p.itemStatus.findFirst({ where: { battalionId: b.id, isDefault: true }, select: { id: true } });
  if (!warehouse || !okStatus) throw new Error("חסר מחסן ציוד / סטטוס תקין");

  console.log(`🌱 זורע ${N_SOLDIERS} חיילים לגדוד ${b.name} ...`);

  // פלוגות
  const companyIds: string[] = [];
  for (const name of COMPANIES) {
    const existing = await p.holder.findFirst({ where: { battalionId: b.id, kind: "COMPANY", name }, select: { id: true } });
    const c = existing ?? await p.holder.create({ data: { battalionId: b.id, kind: "COMPANY", name } });
    companyIds.push(c.id);
  }

  // קטגוריה + סוגי-פריט סריאליים לחתימה
  const category = await p.category.create({ data: { battalionId: b.id, name: "ציוד לחימה (דמו)", warehouseType: "EQUIPMENT" } });
  const rifle = await p.itemType.create({ data: { battalionId: b.id, name: "רובה M4 (דמו)", trackingMethod: "SERIAL", categoryId: category.id, signable: true } });
  const vest = await p.itemType.create({ data: { battalionId: b.id, name: "אפוד קרמי (דמו)", trackingMethod: "SERIAL", categoryId: category.id, signable: true } });

  // חיילים — createMany מהיר, במנות
  const soldierData = Array.from({ length: N_SOLDIERS }, (_, i) => ({
    battalionId: b.id,
    fullName: `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`,
    companyId: companyIds[i % companyIds.length],
    status: "ENLISTED" as const,
    personalNumber: String(8800001 + i),
    dietType: i % 9 === 0 ? DIETS[i % DIETS.length] : null,
    phone: `05${String(20000000 + i).padStart(8, "0")}`,
  }));
  for (let i = 0; i < soldierData.length; i += 100) {
    await p.soldier.createMany({ data: soldierData.slice(i, i + 100), skipDuplicates: true });
  }

  const soldiers = await p.soldier.findMany({ where: { battalionId: b.id, personalNumber: { gte: "8800001", lte: "8800500" } }, select: { id: true, personalNumber: true } });
  console.log(`  ✅ ${soldiers.length} חיילים`);

  // 2 יחידות סריאליות חתומות לכל חייל
  const units: { battalionId: string; itemTypeId: string; serialNumber: string; statusId: string; currentHolderId: string; signedSoldierId: string }[] = [];
  for (const s of soldiers) {
    const n = s.personalNumber.slice(-4);
    units.push({ battalionId: b.id, itemTypeId: rifle.id, serialNumber: `DEMO-R21-${n}`, statusId: okStatus.id, currentHolderId: warehouse.id, signedSoldierId: s.id });
    units.push({ battalionId: b.id, itemTypeId: vest.id, serialNumber: `DEMO-V21-${n}`, statusId: okStatus.id, currentHolderId: warehouse.id, signedSoldierId: s.id });
  }
  for (let i = 0; i < units.length; i += 200) {
    await p.serialUnit.createMany({ data: units.slice(i, i + 200), skipDuplicates: true });
  }
  console.log(`  ✅ ${units.length} יחידות סריאליות חתומות`);
  console.log(`🎯 סיום. גדוד 21 מאוכלס: ${COMPANIES.length} פלוגות, ${soldiers.length} חיילים, ${units.length} פריטים חתומים.`);
}

main().catch((e) => { console.error("❌", e); process.exit(1); }).finally(() => p.$disconnect());
