/**
 * 🔧 השלמות לסנכרון דוח צלמים 20.07 — חיילים שלא זוהו + לשונית רחפנים.
 *
 * סימולציה כברירת מחדל. כתיבה רק ב---apply.
 *   npx tsx --env-file=.env scripts/armory-fixups-2007.ts [--apply]
 *
 * לא "מקים 4 חיילים" עיוור: 2 מהם כבר קיימים, ואחד קיים כפול. כל מקרה
 * מטופל לפי מצבו, ולא נוצר שום חייל שכבר יש לו רשומה.
 */
import { PrismaClient } from "../src/generated/prisma";
const p = new PrismaClient();
const APPLY = process.argv.includes("--apply");

const KTBM = 'כטב"ם אבו מקס 4';
const SHALAT = "שלט חכם אבו מקס 4 תרמי";

async function main() {
  const b = await p.battalion.findUnique({ where: { code: "5554" }, select: { id: true } });
  if (!b) throw new Error("אין גדוד 5554");
  const bId = b.id;
  const armory = await p.holder.findFirst({ where: { battalionId: bId, warehouseType: "ARMORY" }, select: { id: true } });
  const status = await p.itemStatus.findFirst({ where: { battalionId: bId, isDefault: true }, select: { id: true } });
  const actor = await p.appUser.findFirst({ where: { battalionId: bId, role: "BATTALION_ADMIN", active: true }, select: { id: true } });
  if (!armory || !status || !actor) throw new Error("חסר ארמון / סטטוס / אדמין");
  const m16 = await p.itemType.findFirst({ where: { battalionId: bId, name: "רובה M16" }, select: { id: true, categoryId: true } });
  if (!m16) throw new Error("אין 'רובה M16'");

  console.log(`=== ${APPLY ? "⚠️ כתיבה" : "סימולציה"} — השלמות דוח צלמים ===\n`);

  // מחתים סריאל קיים (שיושב בארמון) על חייל, בתעודה אחת.
  const signSerial = async (serial: string, soldierId: string, note: string) => {
    const u = await p.serialUnit.findFirst({ where: { battalionId: bId, serialNumber: serial }, select: { id: true, itemTypeId: true, signedSoldier: { select: { fullName: true } } } });
    if (!u) { console.log(`   ⚠️ ${serial}: לא קיים — דילוג`); return; }
    if (u.signedSoldier) { console.log(`   ⏭️  ${serial}: כבר חתום על ${u.signedSoldier.fullName}`); return; }
    if (!APPLY) { console.log(`   • ${serial}: יוחתם`); return; }
    await p.$transaction(async (tx) => {
      const tr = await tx.transfer.create({ data: { battalionId: bId, type: "SIGNOUT", status: "COMPLETED", toSoldierId: soldierId, fromHolderId: armory.id, createdById: actor.id, approvedAt: new Date(), notes: note } });
      await tx.transferLine.create({ data: { transferId: tr.id, itemTypeId: u.itemTypeId, quantity: 1, serialUnitId: u.id, statusId: status.id } });
      await tx.serialUnit.update({ where: { id: u.id }, data: { signedSoldierId: soldierId } });
    });
    console.log(`   ✍️ ${serial}: הוחתם`);
  };

  const createSoldier = async (fullName: string, pn: string, companyName: string) => {
    const existing = await p.soldier.findFirst({ where: { battalionId: bId, personalNumber: pn }, select: { id: true } });
    if (existing) { console.log(`   ⏭️  ${fullName}: כבר קיים`); return existing.id; }
    if (!APPLY) { console.log(`   • ${fullName} [${pn}] → ${companyName}: ייווצר`); return null; }
    const company = await p.holder.findFirst({ where: { battalionId: bId, name: companyName }, select: { id: true } });
    if (!company) throw new Error(`לא נמצא מחזיק "${companyName}"`);
    const s = await p.soldier.create({ data: { battalionId: bId, fullName, personalNumber: pn, companyId: company.id, status: "ENLISTED" }, select: { id: true } });
    console.log(`   🆕 ${fullName} [${pn}] → ${companyName}`);
    return s.id;
  };

  // ── 1) נאור חי אפללו — קיים, נשקי M4 כבר חתומים, רק עדי בארמון ──
  console.log("① נאור חי אפללו [6027981] — קיים");
  const naor = await p.soldier.findFirst({ where: { battalionId: bId, fullName: { contains: "אפללו" } }, select: { id: true } });
  if (naor) await signSerial("10070296", naor.id, "עדי — השלמת דוח צלמים 20.07");

  // ── 2) דסאלין טסרה — קיים כפול. מחתים על הקרוב למ.א בדוח ומסמן לבירור ──
  console.log("\n② דסאלין טסרה — ⚠️ קיים פעמיים [6628341] ו-[6628348]");
  console.log("   הדוח כתב 66283413 → תואם 6628341 (הסרת ספרה אחרונה). מחתים עליו; הכפילות דורשת בירור נפרד.");
  const tsera = await p.soldier.findFirst({ where: { battalionId: bId, personalNumber: "6628341" }, select: { id: true } });
  if (tsera) { for (const s of ["45402438", "25102302", "30241"]) await signSerial(s, tsera.id, "השלמת דוח צלמים 20.07 (טסרה)"); }

  // ── 3+4) חיילים חדשים אמיתיים ──
  console.log("\n③ אביתר בן טוב [7644070] → מפקדה");
  const evyatar = await createSoldier("אביתר בן טוב", "7644070", "מפקדה");
  if (evyatar) await signSerial("4345879", evyatar, "רובה M16 — השלמת דוח צלמים 20.07");

  console.log("\n④ אוריה לוברבאון [7128614] → חפ״ק מגד");
  const orya = await createSoldier("אוריה לוברבאון", "7128614", "חפ״ק מגד");
  if (orya) await signSerial("5118580", orya, "רובה M16 — השלמת דוח צלמים 20.07");

  // ── 5) רחפנים — רוסלן פוטוריאנסקי, פריטים חדשים לגמרי ──
  console.log("\n⑤ רחפנים → רוסלן פוטוריאנסקי [7060852]");
  const rus = await p.soldier.findFirst({ where: { battalionId: bId, fullName: { contains: "רוסלן" } }, select: { id: true } });
  if (rus) {
    // כטב"ם — סריאלי עם מסת"ב 30136
    let ktbmId = (await p.itemType.findFirst({ where: { battalionId: bId, name: KTBM }, select: { id: true } }))?.id ?? null;
    if (!ktbmId) {
      if (APPLY) { ktbmId = (await p.itemType.create({ data: { battalionId: bId, name: KTBM, categoryId: m16.categoryId, trackingMethod: "SERIAL", active: true }, select: { id: true } })).id; console.log(`   🆕 סוג פריט: ${KTBM} (סריאלי)`); }
      else console.log(`   • ייווצר סוג פריט: ${KTBM} (סריאלי)`);
    }
    if (APPLY && ktbmId) {
      const exists = await p.serialUnit.findFirst({ where: { battalionId: bId, serialNumber: "30136" }, select: { id: true } });
      if (!exists) {
        await p.$transaction(async (tx) => {
          const nu = await tx.serialUnit.create({ data: { battalionId: bId, itemTypeId: ktbmId!, serialNumber: "30136", statusId: status.id, currentHolderId: armory.id, signedSoldierId: rus.id } });
          const tr = await tx.transfer.create({ data: { battalionId: bId, type: "SIGNOUT", status: "COMPLETED", toSoldierId: rus.id, fromHolderId: armory.id, createdById: actor.id, approvedAt: new Date(), notes: 'כטב"ם — דוח צלמים 20.07' } });
          await tx.transferLine.create({ data: { transferId: tr.id, itemTypeId: ktbmId!, quantity: 1, serialUnitId: nu.id, statusId: status.id } });
        });
        console.log('   ✍️ כטב"ם 30136 → רוסלן');
      } else console.log('   ⏭️  כטב"ם 30136 כבר קיים');
    }

    // שלט חכם — אין מסת"ב בדוח → כמותי, כמות 1
    console.log('   ℹ️ שלט חכם — אין מסת"ב בדוח → פריט כמותי, כמות 1');
    let shalatId = (await p.itemType.findFirst({ where: { battalionId: bId, name: SHALAT }, select: { id: true } }))?.id ?? null;
    if (!shalatId) {
      if (APPLY) { shalatId = (await p.itemType.create({ data: { battalionId: bId, name: SHALAT, categoryId: m16.categoryId, trackingMethod: "QUANTITY", active: true }, select: { id: true } })).id; console.log(`   🆕 סוג פריט: ${SHALAT} (כמותי)`); }
      else console.log(`   • ייווצר סוג פריט: ${SHALAT} (כמותי)`);
    }
    if (APPLY && shalatId) {
      const already = await p.transferLine.findFirst({ where: { itemTypeId: shalatId, transfer: { type: "SIGNOUT", toSoldierId: rus.id } }, select: { id: true } });
      if (!already) {
        await p.$transaction(async (tx) => {
          const tr = await tx.transfer.create({ data: { battalionId: bId, type: "SIGNOUT", status: "COMPLETED", toSoldierId: rus.id, fromHolderId: armory.id, createdById: actor.id, approvedAt: new Date(), notes: 'שלט חכם — דוח צלמים 20.07' } });
          await tx.transferLine.create({ data: { transferId: tr.id, itemTypeId: shalatId!, quantity: 1, statusId: status.id } });
        });
        console.log('   ✍️ שלט חכם ×1 → רוסלן');
      } else console.log('   ⏭️  שלט חכם כבר חתום על רוסלן');
    }
  }

  console.log(`\n${APPLY ? "✅ הסתיים." : "(סימולציה — לא נכתב דבר)"}`);
}
main().catch((e) => { console.error("❌", e.message); process.exit(1); }).finally(() => p.$disconnect());
