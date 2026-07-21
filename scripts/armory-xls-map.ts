/**
 * 🔫 מיפוי "דוח צלמים" של ארמון גדסם 4 מהאקסל אל המערכת.
 *
 * ברירת המחדל היא **סימולציה**. כתיבה רק עם --apply.
 *   npx tsx --env-file=.env scripts/armory-xls-map.ts [--apply]
 */
import { PrismaClient } from "../src/generated/prisma";
import { readFileSync } from "fs";
const p = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const XLS = process.argv[process.argv.indexOf("--file") + 1] || "";

/** לשונית → אילו עמודות הן סריאלים, ולאיזה סוג פריט. */
const SHEETS: Record<string, { serialCols: Record<string, string> }> = {
  "שחע":         { serialCols: { "שחע": "שחע" } },
  "M4 +כוונות":  { serialCols: { 'מסת"ב': "רובה M4", "מסטב כוונת": "כוונת" } },
  "M4 קלעים":    { serialCols: { 'מסת"ב': "רובה M4", "מסטב כוונת": "כוונת" } },
  "M16":         { serialCols: { 'מסת"ב': "רובה M16" } },
  "MAG":         { serialCols: { "מאג": "מקלע MAG" } },
  "עידו":        { serialCols: { "עידו + מתאם": "עידו" } },
  "עדי":         { serialCols: { "עדי + מתאם": "עדי" } },
  "אומיקרון":    { serialCols: { "אונמיקרון": "אומיקרון" } },
  "פגיון":       { serialCols: { 'מסתב פגיון M4': "פגיון", "כוונת פגיון": "כוונת פגיון", "ידית לנשק": "ידית לנשק" } },
  "שוטגן":       { serialCols: { "שוטגן": "שוטגן" } },
};
/** לשוניות שלא נכנסות לכתיבה, ולמה. */
const SKIP: Record<string, string> = {
  "קובץ דיווח": "סיכום מספרי בלבד — אין נתוני חייל",
  "ביקורת": "גיליון הצלבה שחוזר על הלשוניות האחרות — עיבוד כפול",
  "חרטא": "ציוד כמותי מתכלה (שקיות זבל, אקונומיקה) — לא סריאלי",
  "רחפנים": "כטב\"ם — פריטים חדשים לגמרי, טעון החלטה נפרדת",
  "משקפת מפקד": "אין עמודת מספר סידורי",
};

const norm = (v: unknown) => (v == null ? "" : String(v).trim());
const digits = (v: unknown) => norm(v).replace(/\D/g, "");

async function main() {
  const b = await p.battalion.findUnique({ where: { code: "5554" }, select: { id: true, name: true } });
  if (!b) throw new Error("אין גדוד 5554");
  const armory = await p.holder.findFirst({ where: { battalionId: b.id, warehouseType: "ARMORY" }, select: { id: true, name: true } });
  if (!armory) throw new Error("אין מחסן ארמון");

  const rows = JSON.parse(readFileSync(XLS, "utf8")) as { sheet: string; header: string[]; cells: string[] }[];
  const soldiers = await p.soldier.findMany({ where: { battalionId: b.id }, select: { id: true, fullName: true, personalNumber: true } });
  const byPn = new Map(soldiers.filter((s) => s.personalNumber).map((s) => [digits(s.personalNumber), s]));
  const itemTypes = await p.itemType.findMany({ where: { battalionId: b.id }, select: { id: true, name: true, trackingMethod: true } });
  const byName = new Map(itemTypes.map((i) => [i.name, i]));
  const units = await p.serialUnit.findMany({ where: { battalionId: b.id }, select: { id: true, serialNumber: true, itemTypeId: true, signedSoldierId: true, currentHolderId: true } });
  const bySerial = new Map(units.map((u) => [u.serialNumber.trim(), u]));

  console.log(`=== ${b.name} · ארמון: ${armory.name} · ${APPLY ? "⚠️ כתיבה" : "סימולציה"} ===\n`);
  console.log("לשוניות שלא נכנסות:");
  for (const [k, why] of Object.entries(SKIP)) console.log(`   ⏭️  ${k} — ${why}`);

  const missingItems = new Set<string>();
  const unknownSoldiers = new Map<string, string>();
  const plan: { sheet: string; serial: string; item: string; soldierId: string | null; soldierName: string; action: string }[] = [];
  const conflicts: string[] = [];

  // 🔍 בקובץ יש שורת-כותרת "מסתב בנשקיה" שאחריה רשימת מספרי נשק שנמצאים
  //    בארמון ולא חתומים על אף אחד. הם יושבים בעמודת מ.א, לא בעמודת הסריאל.
  //    בלי הזיהוי הזה הם נקראים כחיילים לא מזוהים ופשוט נעלמים.
  const armorySection = new Set<string>();
  const nameKey = (f: string, l: string) => `${f} ${l}`.replace(/\s+/g, " ").trim();
  const byName2 = new Map<string, typeof soldiers[number][]>();
  for (const s of soldiers) {
    const k = s.fullName.replace(/\s+/g, " ").trim();
    byName2.set(k, [...(byName2.get(k) ?? []), s]);
  }
  let nameMatched = 0;
  const armoryStock: { serial: string; item: string }[] = [];

  for (const r of rows) {
    const cfg = SHEETS[r.sheet];
    if (!cfg) continue;
    const idx = (h: string) => r.header.indexOf(h);
    const joined = r.cells.join(" ");
    if (/בנשקיה/.test(joined)) { armorySection.add(r.sheet); continue; }

    const pnRaw = digits(r.cells[idx("מ.א")]);
    const first = norm(r.cells[idx("שם")]);
    const last = norm(r.cells[idx("שם משפחה")]);

    // אחרי הכותרת — המספר הוא סריאל בארמון, לא מ.א
    if (armorySection.has(r.sheet)) {
      if (pnRaw) armoryStock.push({ serial: pnRaw, item: Object.values(cfg.serialCols)[0] });
      continue;
    }

    let soldier = pnRaw ? byPn.get(pnRaw) ?? null : null;
    // מ.א שאיבד אפס מוביל (587783 → 0587783)
    if (!soldier && pnRaw && pnRaw.length === 6) soldier = byPn.get("0" + pnRaw) ?? byPn.get(pnRaw.padStart(7, "0")) ?? null;
    // נפילה לשם מלא — רק כשהוא חד-ערכי בגדוד
    if (!soldier && (first || last)) {
      const cands = byName2.get(nameKey(first, last)) ?? byName2.get(nameKey(last, first)) ?? [];
      if (cands.length === 1) { soldier = cands[0]; nameMatched++; }
    }
    if (pnRaw && !soldier) unknownSoldiers.set(pnRaw, `${first} ${last}`.trim());

    for (const [col, itemName] of Object.entries(cfg.serialCols)) {
      const ci = idx(col);
      if (ci < 0) continue;
      const raw = norm(r.cells[ci]);
      const serial = raw.replace(/\s/g, "");
      if (!serial || serial === "?" || !/^[0-9A-Za-z]{3,}$/.test(serial)) continue;
      const it = byName.get(itemName);
      if (!it) { missingItems.add(itemName); continue; }

      const existing = bySerial.get(serial);
      let action: string;
      if (!existing) action = "יחידה חדשה";
      else if (existing.itemTypeId !== it.id) { conflicts.push(`${serial} (${itemName}): קיים תחת סוג פריט אחר`); continue; }
      else if (existing.signedSoldierId === (soldier?.id ?? null)) action = "כבר תואם";
      else if (existing.signedSoldierId && soldier) action = "החתמה מחדש (חייל אחר)";
      else if (existing.signedSoldierId && !soldier) action = "זיכוי לארמון";
      else action = "החתמה חדשה";
      plan.push({ sheet: r.sheet, serial, item: itemName, soldierId: soldier?.id ?? null, soldierName: soldier?.fullName ?? (pnRaw ? `?${pnRaw}` : "— ארמון —"), action });
    }
  }
  console.log(`
🏬 מלאי בארמון (לא חתום) שזוהה מהכותרות: ${armoryStock.length}`);
  for (const a of armoryStock) console.log(`   ${a.serial}  ${a.item}`);
  console.log(`
🔤 הותאמו לפי שם מלא (מ.א לא תאם): ${nameMatched}`);

  const byAction: Record<string, number> = {};
  for (const x of plan) byAction[x.action] = (byAction[x.action] ?? 0) + 1;
  console.log(`\n📋 ${plan.length} שורות סריאליות נקראו`);
  for (const [a, n] of Object.entries(byAction).sort((x, y) => y[1] - x[1])) console.log(`   ${String(n).padStart(4)}  ${a}`);

  console.log(`\n🆕 סוגי פריטים שחסרים בקטלוג (${missingItems.size}):`);
  for (const m of missingItems) console.log(`   • ${m}`);

  console.log(`\n❓ מ.א שלא נמצאו בגדוד (${unknownSoldiers.size}):`);
  for (const [pn, name] of [...unknownSoldiers].slice(0, 25)) console.log(`   ${pn.padStart(9)}  ${name}`);
  if (unknownSoldiers.size > 25) console.log(`   ... ועוד ${unknownSoldiers.size - 25}`);

  if (conflicts.length) { console.log(`\n🛑 התנגשויות (${conflicts.length}):`); conflicts.slice(0, 15).forEach((c) => console.log(`   ${c}`)); }

  // ── ביצוע ───────────────────────────────────────────────────────────
  if (!APPLY) { console.log("\n(סימולציה — לא נכתב דבר)"); return; }

  const status = await p.itemStatus.findFirst({ where: { battalionId: b.id, isDefault: true }, select: { id: true } });
  if (!status) throw new Error("אין סטטוס ברירת-מחדל");
  // createdById הוא שדה חובה ב-Transfer. מייחסים לאדמין הגדוד — הפעולה בוצעה
  // בשמו כסנכרון יזום, ולא מתחזים למחסנאי שלא נגע בזה.
  const actor = await p.appUser.findFirst({ where: { battalionId: b.id, role: "BATTALION_ADMIN", active: true }, select: { id: true, fullName: true } });
  if (!actor) throw new Error("לא נמצא אדמין גדוד לייחוס התעודות");
  console.log(`👤 התעודות ייווצרו בשם: ${actor.fullName}`);
  const m16 = byName.get("רובה M16");
  if (!m16) throw new Error("לא נמצא 'רובה M16' — לא ניתן לגזור קטגוריה");
  const m16full = await p.itemType.findUnique({ where: { id: m16.id }, select: { categoryId: true } });

  for (const name of missingItems) {
    const c = await p.itemType.create({
      data: { battalionId: b.id, name, categoryId: m16full!.categoryId, trackingMethod: "SERIAL", active: true },
      select: { id: true, name: true, trackingMethod: true },
    });
    byName.set(name, c);
    console.log(`🆕 הוקם סוג פריט: ${name}`);
  }

  let armoryCreated = 0;
  for (const a of armoryStock) {
    const it = byName.get(a.item);
    if (!it || bySerial.has(a.serial)) continue;
    await p.serialUnit.create({ data: { battalionId: b.id, itemTypeId: it.id, serialNumber: a.serial, statusId: status.id, currentHolderId: armory.id, signedSoldierId: null } });
    armoryCreated++;
  }
  console.log(`🏬 נוספו לארמון (לא חתומים): ${armoryCreated}`);

  // תעודה אחת לכל חייל — לא תעודה נפרדת לכל פריט
  const perSoldier = new Map<string, typeof plan>();
  const returns: typeof plan = [];
  for (const x of plan) {
    if (x.action === "כבר תואם") continue;
    if (!x.soldierId) { returns.push(x); continue; }
    perSoldier.set(x.soldierId, [...(perSoldier.get(x.soldierId) ?? []), x]);
  }

  let signedN = 0, docs = 0, createdN = 0;
  for (const [soldierId, items] of perSoldier) {
    await p.$transaction(async (tx) => {
      const tr = await tx.transfer.create({
        data: { battalionId: b.id, type: "SIGNOUT", status: "COMPLETED", toSoldierId: soldierId,
          fromHolderId: armory.id, createdById: actor.id, approvedAt: new Date(), notes: "סנכרון מדוח צלמים 20.07 (ארמון)" },
      });
      docs++;
      for (const x of items) {
        const it = byName.get(x.item)!;
        const unit = bySerial.get(x.serial);
        let unitId: string;
        if (!unit) {
          const nu = await tx.serialUnit.create({ data: { battalionId: b.id, itemTypeId: it.id, serialNumber: x.serial, statusId: status.id, currentHolderId: armory.id, signedSoldierId: soldierId } });
          unitId = nu.id;
          bySerial.set(x.serial, { id: nu.id, serialNumber: nu.serialNumber, itemTypeId: nu.itemTypeId, signedSoldierId: soldierId, currentHolderId: armory.id });
          createdN++;
        } else {
          unitId = unit.id;
          await tx.serialUnit.update({ where: { id: unit.id }, data: { signedSoldierId: soldierId } });
        }
        await tx.transferLine.create({ data: { transferId: tr.id, itemTypeId: it.id, quantity: 1, serialUnitId: unitId, statusId: status.id } });
        signedN++;
      }
    });
  }
  console.log(`✍️ הוחתמו ${signedN} פריטים על ${docs} תעודות (${createdN} יחידות חדשות)`);

  let returned = 0;
  for (const x of returns) {
    const unit = bySerial.get(x.serial);
    if (!unit?.signedSoldierId) continue;
    const prev = unit.signedSoldierId;
    await p.$transaction(async (tx) => {
      const tr = await tx.transfer.create({
        data: { battalionId: b.id, type: "CHECKIN", status: "COMPLETED", toSoldierId: prev,
          fromHolderId: armory.id, createdById: actor.id, approvedAt: new Date(), notes: "זיכוי לארמון — סנכרון מדוח צלמים 20.07" },
      });
      await tx.transferLine.create({ data: { transferId: tr.id, itemTypeId: unit.itemTypeId, quantity: 1, serialUnitId: unit.id, statusId: status.id } });
      await tx.serialUnit.update({ where: { id: unit.id }, data: { signedSoldierId: null, currentHolderId: armory.id } });
    });
    returned++;
  }
  console.log(`↩️ זוכו לארמון: ${returned}`);
  console.log("\n✅ הסתיים.");
}
main().catch((e) => { console.error("❌", e.message); process.exit(1); }).finally(() => p.$disconnect());
