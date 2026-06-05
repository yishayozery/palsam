/**
 * Seed v2 — PALSAM Multi-Tenant
 * אדמין-על גלובלי + גדוד "גדסם כרמלי": מפמ, 4 מחסנים מטופסים + מנהלים,
 * 5 פלוגות + נציגים, קטגוריות לפי טיפוס מחסן, מידוף, מלאי מלא, חיילים.
 */
import { PrismaClient, type WarehouseType } from "../src/generated/prisma";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 seed v2 — PALSAM...");

  // ניקוי מלא
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
  await prisma.storageLocation.deleteMany();
  await prisma.warehouseCompany.deleteMany();
  await prisma.countFrequency.deleteMany();
  await prisma.itemStatus.deleteMany();
  await prisma.category.deleteMany();
  await prisma.soldier.deleteMany();
  await prisma.appUser.deleteMany();
  await prisma.holder.deleteMany();
  await prisma.battalion.deleteMany();

  const pw = await bcrypt.hash("123456", 10);

  // ===== אדמין-על (גלובלי) =====
  await prisma.appUser.create({
    data: { username: "admin", passwordHash: pw, fullName: "אדמין-על", role: "SUPER_ADMIN" },
  });

  // ===== גדוד =====
  const bat = await prisma.battalion.create({
    data: { name: "גדסם כרמלי", code: "CARMELI", commander: 'מג"ד כרמלי' },
  });
  const bId = bat.id;

  // מפמ
  await prisma.appUser.create({
    data: { username: "mafam", passwordHash: pw, fullName: "מפמ גדסם כרמלי", role: "BATTALION_ADMIN", battalionId: bId },
  });
  // צופה (מג"ד)
  await prisma.appUser.create({
    data: { username: "magad", passwordHash: pw, fullName: 'מג"ד (צופה)', role: "VIEWER", battalionId: bId },
  });

  // ===== 6 מחסנים + מנהלים =====
  const whDefs: { type: WarehouseType; name: string; user: string; manager: string }[] = [
    { type: "EQUIPMENT", name: "מחסן ציוד", user: "kalag", manager: 'קל"ג' },
    { type: "COMMS", name: "מחסן תקשוב", user: "kashrag", manager: 'קשר"ג' },
    { type: "AMMO", name: "בונקר חמידה", user: "bunker", manager: "אחראי בונקר" },
    { type: "ARMORY", name: "ארמון", user: "armory", manager: "אחראי ארמון" },
    { type: "VEHICLES", name: "מחסן רכבים", user: "ktzinrechev", manager: "קצין רכב" },
    { type: "MEDICAL", name: "מחסן רפואה", user: "krpg", manager: 'קרפ"ג' },
  ];
  const wh: Record<WarehouseType, string> = {} as Record<WarehouseType, string>;
  for (const w of whDefs) {
    const h = await prisma.holder.create({
      data: { battalionId: bId, kind: "WAREHOUSE", warehouseType: w.type, name: w.name },
    });
    wh[w.type] = h.id;
    await prisma.appUser.create({
      data: { username: w.user, passwordHash: pw, fullName: `${w.manager} — ${w.name}`, role: "WAREHOUSE_MANAGER", battalionId: bId, holderId: h.id },
    });
  }

  // ===== פלוגות + נציגים =====
  const companyNames = ["מפקדה/אגם", "פלהק", "שינוע", "טנא", "פתן"];
  const repUser = ["repa", "repb", "repc", "repd", "repe"];
  const companies: { id: string; name: string; repId: string }[] = [];
  for (let i = 0; i < companyNames.length; i++) {
    const c = await prisma.holder.create({
      data: { battalionId: bId, kind: "COMPANY", name: companyNames[i] },
    });
    const rep = await prisma.appUser.create({
      data: { username: repUser[i], passwordHash: pw, fullName: `נציג ${companyNames[i]}`, role: "COMPANY_REP", battalionId: bId, holderId: c.id },
    });
    companies.push({ id: c.id, name: companyNames[i], repId: rep.id });
  }

  // קשרי מחסן↔פלוגה (כל מחסן עובד מול כל הפלוגות, עם נציג)
  for (const w of whDefs) {
    for (const c of companies) {
      await prisma.warehouseCompany.create({
        data: { warehouseId: wh[w.type], companyId: c.id, repUserId: c.repId },
      });
    }
  }

  // ===== מילונים =====
  const statusDefs = [
    { name: "תקין", isDefault: true, sortOrder: 0 },
    { name: "בלאי", isWear: true, sortOrder: 1 },
    { name: "פגום", isWear: true, sortOrder: 2 },
    { name: 'שצ"ל', isConsumed: true, sortOrder: 3 },
    { name: "אבוד", isLoss: true, sortOrder: 4 },
  ];
  const statuses: Record<string, string> = {};
  for (const s of statusDefs) {
    const st = await prisma.itemStatus.create({ data: { ...s, battalionId: bId } });
    statuses[s.name] = st.id;
  }
  const ok = statuses["תקין"];
  for (const [name, intervalDays] of [["יומי", 1], ["שבועי", 7], ["חודשי", 30]] as const) {
    await prisma.countFrequency.create({ data: { battalionId: bId, name, intervalDays } });
  }

  // ===== קטגוריות לפי טיפוס מחסן =====
  const catDefs: { name: string; type: WarehouseType }[] = [
    { name: "רובים", type: "ARMORY" },
    { name: "מקלעים", type: "ARMORY" },
    { name: "טילים", type: "ARMORY" },
    { name: "רימונים", type: "AMMO" },
    { name: "עשן", type: "AMMO" },
    { name: "מיגון", type: "EQUIPMENT" },
    { name: "רפואי", type: "EQUIPMENT" },
    { name: "מכשירי קשר", type: "COMMS" },
    { name: "אביזרי תקשוב", type: "COMMS" },
  ];
  const cats: Record<string, string> = {};
  for (let i = 0; i < catDefs.length; i++) {
    const c = await prisma.category.create({ data: { battalionId: bId, name: catDefs[i].name, warehouseType: catDefs[i].type, sortOrder: i } });
    cats[catDefs[i].name] = c.id;
  }

  // ===== מידוף: מספר מדפים לכל מחזיק =====
  const locOf: Record<string, string[]> = {};
  const makeShelves = async (holderId: string) => {
    const ids: string[] = [];
    for (const col of ["A", "B"]) {
      for (const row of ["1", "2", "3"]) {
        const l = await prisma.storageLocation.create({ data: { holderId, column: col, row, label: `${col}-${row}` } });
        ids.push(l.id);
      }
    }
    locOf[holderId] = ids;
  };
  for (const t of Object.keys(wh) as WarehouseType[]) await makeShelves(wh[t]);
  for (const c of companies) await makeShelves(c.id);

  // ===== קטלוג + מלאי =====
  let skuSeq = 1;
  const shelfCounter: Record<string, number> = {};
  const nextShelf = (holderId: string) => {
    const arr = locOf[holderId];
    const i = (shelfCounter[holderId] ?? 0) % arr.length;
    shelfCounter[holderId] = (shelfCounter[holderId] ?? 0) + 1;
    return arr[i];
  };

  const mkItem = async (d: {
    name: string; cat: string; method: "QUANTITY" | "SERIAL" | "LOT" | "KIT";
    unit?: string; sensitive?: boolean; loc?: boolean; sku?: string;
  }) => {
    const categoryId = cats[d.cat];
    const wtype = catDefs.find((c) => c.name === d.cat)!.type;
    const home = nextShelf(wh[wtype]);
    const item = await prisma.itemType.create({
      data: {
        battalionId: bId, sku: d.sku ?? `SKU-${String(skuSeq++).padStart(3, "0")}`,
        name: d.name, categoryId, trackingMethod: d.method, unit: d.unit ?? "יח'",
        isSensitive: d.sensitive ?? false, trackLocation: d.loc ?? false, homeLocationId: home,
      },
    });
    return { item, warehouseId: wh[wtype], home };
  };

  const mkSerial = async (itemTypeId: string, warehouseId: string, prefix: string, count: number, home: string, pad = 3) => {
    for (let i = 1; i <= count; i++) {
      await prisma.serialUnit.create({
        data: { battalionId: bId, itemTypeId, serialNumber: `${prefix}-${String(i).padStart(pad, "0")}`, statusId: ok, currentHolderId: warehouseId, locationId: home },
      });
    }
  };
  const mkStock = async (itemTypeId: string, warehouseId: string, qty: number, home: string) => {
    await prisma.stockBalance.create({ data: { battalionId: bId, itemTypeId, holderId: warehouseId, statusId: ok, quantity: qty, locationId: home } });
  };

  // ארמון
  const m4 = await mkItem({ name: "רובה M4", cat: "רובים", method: "SERIAL", sensitive: true, loc: true, sku: "M4" });
  await mkSerial(m4.item.id, m4.warehouseId, "M4", 50, m4.home, 4);
  const negev = await mkItem({ name: "מקלע נגב", cat: "מקלעים", method: "SERIAL", sensitive: true, loc: true, sku: "NEGEV" });
  await mkSerial(negev.item.id, negev.warehouseId, "NEGEV", 5, negev.home);
  const amr = await mkItem({ name: 'רובה אמ"ר נוגה', cat: "מקלעים", method: "SERIAL", sensitive: true, loc: true, sku: "AMR" });
  await mkSerial(amr.item.id, amr.warehouseId, "AMR", 5, amr.home);
  const law = await mkItem({ name: "טיל לאו (LAW)", cat: "טילים", method: "SERIAL", sensitive: true, sku: "LAW" });
  await mkSerial(law.item.id, law.warehouseId, "LAW", 4, law.home);

  // חמידה
  const grenade = await mkItem({ name: "רימון יד", cat: "רימונים", method: "LOT", sku: "GREN" });
  await prisma.serialUnit.create({ data: { battalionId: bId, itemTypeId: grenade.item.id, serialNumber: "GREN-SERIES-A", lotQuantity: 25, statusId: ok, currentHolderId: grenade.warehouseId, locationId: grenade.home } });
  await prisma.serialUnit.create({ data: { battalionId: bId, itemTypeId: grenade.item.id, serialNumber: "GREN-SERIES-B", lotQuantity: 25, statusId: ok, currentHolderId: grenade.warehouseId, locationId: grenade.home } });
  const smkG = await mkItem({ name: "רימון עשן ירוק", cat: "עשן", method: "QUANTITY", sku: "SMK-G" });
  await mkStock(smkG.item.id, smkG.warehouseId, 10, smkG.home);
  const smkY = await mkItem({ name: "רימון עשן צהוב", cat: "עשן", method: "QUANTITY", sku: "SMK-Y" });
  await mkStock(smkY.item.id, smkY.warehouseId, 20, smkY.home);

  // ציוד
  const helmet = await mkItem({ name: "קסדה", cat: "מיגון", method: "QUANTITY", sku: "HLMT" });
  await mkStock(helmet.item.id, helmet.warehouseId, 100, helmet.home);
  const vest = await mkItem({ name: "אפוד", cat: "מיגון", method: "QUANTITY", sku: "VEST" });
  await mkStock(vest.item.id, vest.warehouseId, 100, vest.home);
  const stretcher = await mkItem({ name: "אלונקה", cat: "רפואי", method: "QUANTITY", sku: "STR" });
  await mkStock(stretcher.item.id, stretcher.warehouseId, 4, stretcher.home);
  const tq = await mkItem({ name: "סד עצירה (חסם עורקים)", cat: "רפואי", method: "QUANTITY", sku: "TQ" });
  await mkStock(tq.item.id, tq.warehouseId, 30, tq.home);

  // תקשוב
  const radio = await mkItem({ name: "מכשיר קשר 710", cat: "מכשירי קשר", method: "SERIAL", sensitive: true, loc: true, sku: "PRC710" });
  await mkSerial(radio.item.id, radio.warehouseId, "PRC710", 10, radio.home);
  const antenna = await mkItem({ name: "אנטנה", cat: "אביזרי תקשוב", method: "QUANTITY", sku: "ANT" });
  await mkStock(antenna.item.id, antenna.warehouseId, 10, antenna.home);
  const madona = await mkItem({ name: "מדונה", cat: "אביזרי תקשוב", method: "QUANTITY", sku: "MDN" });
  await mkStock(madona.item.id, madona.warehouseId, 10, madona.home);
  const kit = await mkItem({ name: 'ערכת חפ"ק', cat: "מכשירי קשר", method: "KIT", sku: "KIT-CPK" });
  await prisma.kitComponent.createMany({
    data: [
      { kitItemTypeId: kit.item.id, componentTypeId: radio.item.id, quantity: 1 },
      { kitItemTypeId: kit.item.id, componentTypeId: antenna.item.id, quantity: 1 },
    ],
  });

  // ===== חיילים — 5 לכל פלוגה =====
  const fn = ["דני", "אבי", "משה", "יוסי", "איתי", "עומר", "נועם", "גיא", "רון", "תומר", "אורי", "ניר", "עידו", "שחר", "אסף", "בר", "ליאור", "עידן", "מתן", "יותם", "אלון", "חן", "דור", "סתיו", "עמית"];
  const ln = ["כהן", "לוי", "מזרחי", "ישראלי", "פרץ", "ביטון", "אברהם", "דהן", "חדד", "אזולאי"];
  let pn = 9100001;
  let k = 0;
  for (const c of companies) {
    for (let i = 0; i < 5; i++) {
      await prisma.soldier.create({
        data: { battalionId: bId, fullName: `${fn[k % fn.length]} ${ln[(k * 3) % ln.length]}`, personalNumber: String(pn++), phone: `05${String(10000000 + k * 137).slice(0, 8)}`, companyId: c.id },
      });
      k++;
    }
  }

  console.log("✅ seed v2 הושלם — גדוד גדסם כרמלי.");
  console.log("   אדמין-על: admin | מפמ: mafam | צופה: magad");
  console.log("   מנהלי מחסן: kalag(ציוד) kashrag(תקשוב) bunker(חמידה) armory(ארמון) ktzinrechev(רכב) krpg(רפואה)");
  console.log("   נציגי פלוגה: repa..repe | סיסמה לכולם: 123456");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
