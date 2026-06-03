/**
 * Seed — גדוד "גדסם כרמלי"
 * 5 פלוגות, נשקייה, מחסן גדודי; קטגוריות ומלאי מלא; 5 חיילים לפלוגה.
 */
import { PrismaClient } from "../src/generated/prisma";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 seed — גדסם כרמלי...");

  // ניקוי (סדר הפוך לתלויות)
  await prisma.auditLog.deleteMany();
  await prisma.discrepancy.deleteMany();
  await prisma.countLine.deleteMany();
  await prisma.countSession.deleteMany();
  await prisma.countDefinition.deleteMany();
  await prisma.signature.deleteMany();
  await prisma.transferLine.deleteMany();
  await prisma.transfer.deleteMany();
  await prisma.kitQtyLine.deleteMany();
  await prisma.serialUnit.deleteMany();
  await prisma.kitInstance.deleteMany();
  await prisma.stockBalance.deleteMany();
  await prisma.kitComponent.deleteMany();
  await prisma.itemType.deleteMany();
  await prisma.countFrequency.deleteMany();
  await prisma.itemStatus.deleteMany();
  await prisma.category.deleteMany();
  await prisma.soldier.deleteMany();
  await prisma.appUser.deleteMany();
  await prisma.holder.deleteMany();

  // ===== מבנה ארגוני =====
  const warehouse = await prisma.holder.create({
    data: { type: "WAREHOUSE", name: "מחסן גדודי", code: "WH" },
  });
  const armory = await prisma.holder.create({
    data: { type: "ARMORY", name: "נשקייה", code: "ARM", parentId: warehouse.id },
  });
  const companyNames = ["מפקדה/אגם", "פלהק", "שינוע", "טנא", "פתן"];
  const companies: Record<string, string> = {};
  for (const name of companyNames) {
    const c = await prisma.holder.create({
      data: { type: "COMPANY", name, parentId: warehouse.id },
    });
    companies[name] = c.id;
  }

  // ===== משתמשים =====
  const pw = await bcrypt.hash("123456", 10);
  await prisma.appUser.createMany({
    data: [
      { username: "admin", passwordHash: pw, fullName: "מנהל מערכת", role: "ADMIN" },
      { username: "klag", passwordHash: pw, fullName: 'קל"ג גדודי', role: "LOGISTICS", holderId: warehouse.id },
      { username: "armory", passwordHash: pw, fullName: "אחראי נשקייה", role: "ARMORY", holderId: armory.id },
      { username: "magad", passwordHash: pw, fullName: 'מג"ד (צופה)', role: "VIEWER" },
    ],
  });
  // רס"פ לכל פלוגה
  const raspUser = ["raspa", "raspb", "raspc", "raspd", "raspe"];
  for (let i = 0; i < companyNames.length; i++) {
    await prisma.appUser.create({
      data: {
        username: raspUser[i], passwordHash: pw,
        fullName: `רס"פ ${companyNames[i]}`, role: "COMPANY_SP", holderId: companies[companyNames[i]],
      },
    });
  }

  // ===== קטגוריות =====
  const catNames = ['אמל"ח', "תחמושת", "חבלה", "תקשוב", "ציוד אישי"];
  const cats: Record<string, string> = {};
  for (let i = 0; i < catNames.length; i++) {
    const c = await prisma.category.create({ data: { name: catNames[i], sortOrder: i } });
    cats[catNames[i]] = c.id;
  }

  // ===== סטטוסים =====
  const statusDefs = [
    { name: "תקין", isDefault: true, sortOrder: 0 },
    { name: "בלאי", isWear: true, sortOrder: 1 },
    { name: "פגום", isWear: true, sortOrder: 2 },
    { name: 'שצ"ל (שומש/נצרך)', isConsumed: true, sortOrder: 3 },
    { name: "אבוד", isLoss: true, sortOrder: 4 },
  ];
  const statuses: Record<string, string> = {};
  for (const s of statusDefs) {
    const st = await prisma.itemStatus.create({ data: s });
    statuses[s.name] = st.id;
  }
  const ok = statuses["תקין"];

  // ===== תדירויות =====
  await prisma.countFrequency.createMany({
    data: [
      { name: "יומי", intervalDays: 1 },
      { name: "שבועי", intervalDays: 7 },
      { name: "חודשי", intervalDays: 30 },
    ],
  });

  // ===== עוזר ליצירת מק"ט =====
  let skuSeq = 1;
  const mkItem = async (data: {
    name: string; category: string; method: "QUANTITY" | "SERIAL" | "LOT" | "KIT";
    unit?: string; sensitive?: boolean; loc?: boolean; sku?: string;
  }) =>
    prisma.itemType.create({
      data: {
        sku: data.sku ?? `SKU-${String(skuSeq++).padStart(3, "0")}`,
        name: data.name,
        categoryId: cats[data.category],
        trackingMethod: data.method,
        unit: data.unit ?? "יח'",
        isSensitive: data.sensitive ?? false,
        trackLocation: data.loc ?? false,
      },
    });

  // ===== אמל"ח (סריאלי) — בנשקייה =====
  const m4 = await mkItem({ name: "רובה M4", category: 'אמל"ח', method: "SERIAL", sensitive: true, loc: true, sku: "M4" });
  const negev = await mkItem({ name: "מקלע נגב", category: 'אמל"ח', method: "SERIAL", sensitive: true, loc: true, sku: "NEGEV" });
  const amr = await mkItem({ name: 'רובה אמ"ר נוגה', category: 'אמל"ח', method: "SERIAL", sensitive: true, loc: true, sku: "AMR" });

  const mkSerial = async (itemTypeId: string, prefix: string, count: number, holderId: string, pad = 3) => {
    for (let i = 1; i <= count; i++) {
      await prisma.serialUnit.create({
        data: { itemTypeId, serialNumber: `${prefix}-${String(i).padStart(pad, "0")}`, statusId: ok, currentHolderId: holderId },
      });
    }
  };
  await mkSerial(m4.id, "M4", 50, armory.id, 4);
  await mkSerial(negev.id, "NEGEV", 5, armory.id);
  await mkSerial(amr.id, "AMR", 5, armory.id);

  // ===== תחמושת =====
  // טילי לאו — סריאלי ייחודי לכל טיל (בנשקייה)
  const law = await mkItem({ name: 'טיל לאו (LAW)', category: "תחמושת", method: "SERIAL", sensitive: true, sku: "LAW" });
  await mkSerial(law.id, "LAW", 4, armory.id);

  // רימוני יד — אצווה (LOT): חצי מסדרה אחת, חצי מהשנייה
  const grenade = await mkItem({ name: "רימון יד", category: "תחמושת", method: "LOT", sku: "GREN" });
  await prisma.serialUnit.create({ data: { itemTypeId: grenade.id, serialNumber: "GREN-SERIES-A", lotQuantity: 25, statusId: ok, currentHolderId: warehouse.id } });
  await prisma.serialUnit.create({ data: { itemTypeId: grenade.id, serialNumber: "GREN-SERIES-B", lotQuantity: 25, statusId: ok, currentHolderId: warehouse.id } });

  // רימוני צבע — כמותי (ללא סריאלי)
  const smokeGreen = await mkItem({ name: "רימון עשן ירוק", category: "חבלה", method: "QUANTITY", sku: "SMK-G" });
  const smokeYellow = await mkItem({ name: "רימון עשן צהוב", category: "חבלה", method: "QUANTITY", sku: "SMK-Y" });
  await prisma.stockBalance.createMany({
    data: [
      { itemTypeId: smokeGreen.id, holderId: warehouse.id, statusId: ok, quantity: 10 },
      { itemTypeId: smokeYellow.id, holderId: warehouse.id, statusId: ok, quantity: 20 },
    ],
  });

  // ===== ציוד אישי (כמותי) =====
  const helmet = await mkItem({ name: "קסדה", category: "ציוד אישי", method: "QUANTITY", sku: "HLMT" });
  const vest = await mkItem({ name: "אפוד", category: "ציוד אישי", method: "QUANTITY", sku: "VEST" });
  const stretcher = await mkItem({ name: "אלונקה", category: "ציוד אישי", method: "QUANTITY", sku: "STR" });
  const tourniquet = await mkItem({ name: "סד עצירה (חסם עורקים)", category: "ציוד אישי", method: "QUANTITY", sku: "TQ" });
  await prisma.stockBalance.createMany({
    data: [
      { itemTypeId: helmet.id, holderId: warehouse.id, statusId: ok, quantity: 100 },
      { itemTypeId: vest.id, holderId: warehouse.id, statusId: ok, quantity: 100 },
      { itemTypeId: stretcher.id, holderId: warehouse.id, statusId: ok, quantity: 4 },
      { itemTypeId: tourniquet.id, holderId: warehouse.id, statusId: ok, quantity: 30 },
    ],
  });

  // ===== תקשוב =====
  const radio = await mkItem({ name: "מכשיר קשר 710", category: "תקשוב", method: "SERIAL", sensitive: true, loc: true, sku: "PRC710" });
  await mkSerial(radio.id, "PRC710", 10, warehouse.id);
  const antenna = await mkItem({ name: "אנטנה", category: "תקשוב", method: "QUANTITY", sku: "ANT" });
  const madona = await mkItem({ name: "מדונה", category: "תקשוב", method: "QUANTITY", sku: "MDN" });
  await prisma.stockBalance.createMany({
    data: [
      { itemTypeId: antenna.id, holderId: warehouse.id, statusId: ok, quantity: 10 },
      { itemTypeId: madona.id, holderId: warehouse.id, statusId: ok, quantity: 10 },
    ],
  });

  // ===== ערכה (Kit) — ערכת חפ"ק =====
  const kit = await mkItem({ name: 'ערכת חפ"ק', category: "תקשוב", method: "KIT", sku: "KIT-CPK" });
  await prisma.kitComponent.createMany({
    data: [
      { kitItemTypeId: kit.id, componentTypeId: radio.id, quantity: 1 },
      { kitItemTypeId: kit.id, componentTypeId: antenna.id, quantity: 1 },
    ],
  });

  // ===== חיילים — 5 לכל פלוגה =====
  const firstNames = ["דני", "אבי", "משה", "יוסי", "איתי", "עומר", "נועם", "גיא", "רון", "תומר", "אורי", "ניר", "עידו", "שחר", "אסף"];
  const lastNames = ["כהן", "לוי", "מזרחי", "ישראלי", "פרץ", "ביטון", "אברהם", "דהן", "חדד", "אזולאי"];
  let pn = 9100001;
  let nameIdx = 0;
  for (const cname of companyNames) {
    for (let i = 0; i < 5; i++) {
      const fn = firstNames[nameIdx % firstNames.length];
      const ln = lastNames[(nameIdx * 3) % lastNames.length];
      nameIdx++;
      await prisma.soldier.create({
        data: {
          fullName: `${fn} ${ln}`,
          personalNumber: String(pn++),
          phone: `05${String(10000000 + nameIdx * 137).slice(0, 8)}`,
          companyId: companies[cname],
        },
      });
    }
  }

  console.log("✅ seed גדסם כרמלי הושלם.");
  console.log("   משתמשים (סיסמה 123456): admin, klag, armory, magad, raspa..raspe");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
