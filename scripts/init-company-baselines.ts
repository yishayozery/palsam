/**
 * 📌 סקריפט אתחול: לכל פלוגה, לכל פריט שיש בה היום -
 * קביעת CompanyItemBaseline.permanentQuantity = הכמות הנוכחית האגרגטיבית.
 *
 * אגרגציה (לא תלוי סטטוס - תקין + תקול + אובד נספרים יחד):
 * - StockBalance הקיים אצל הפלוגה (כל המיקומים)
 * - SerialUnit שמיקומו currentHolder = הפלוגה (lotQuantity או 1)
 * - SerialUnit שחתום על חייל של הפלוגה
 * - SoldierItemLocation של חיילי הפלוגה (כמותי-חתום)
 *
 * הרצה: npx tsx scripts/init-company-baselines.ts [battalionCode?]
 * בלי battalionCode → כל הגדודים. אם יש baseline קיים, ידלג עליו (לא דורס).
 */
import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

async function main() {
  const battalionCode = process.argv[2];
  const battalions = await prisma.battalion.findMany({
    where: battalionCode ? { code: battalionCode } : {},
    select: { id: true, name: true, code: true },
  });
  if (battalions.length === 0) {
    console.error(`❌ לא נמצאו גדודים${battalionCode ? ` עם code=${battalionCode}` : ""}`);
    process.exit(1);
  }

  for (const battalion of battalions) {
    console.log(`\n🏛️  ${battalion.name} (${battalion.code})`);
    const companies = await prisma.holder.findMany({
      where: { battalionId: battalion.id, kind: "COMPANY", active: true },
      select: { id: true, name: true },
    });

    for (const company of companies) {
      // לוקחים את כל חיילי הפלוגה
      const soldiers = await prisma.soldier.findMany({
        where: { battalionId: battalion.id, companyId: company.id, status: { notIn: ["DISCHARGED", "INACTIVE"] } },
        select: { id: true },
      });
      const soldierIds = soldiers.map((s) => s.id);

      // 1. StockBalance של הפלוגה (כל המיקומים מאוחדים)
      const stockBalances = await prisma.stockBalance.findMany({
        where: { battalionId: battalion.id, holderId: company.id, quantity: { gt: 0 } },
        select: { itemTypeId: true, quantity: true },
      });

      // 2. SerialUnit שנמצא פיזית בפלוגה או חתום על חייל מהפלוגה
      const serialUnits = await prisma.serialUnit.findMany({
        where: {
          battalionId: battalion.id,
          OR: [
            { currentHolderId: company.id },
            soldierIds.length > 0 ? { signedSoldierId: { in: soldierIds } } : {},
          ].filter((c) => Object.keys(c).length > 0),
        },
        select: { itemTypeId: true, lotQuantity: true },
      });

      // 3. כמותי חתום על חיילים — סכימה של (SIGNOUT - CHECKIN) לכל פריט
      const signedQtyLines = soldierIds.length === 0 ? [] : await prisma.transferLine.findMany({
        where: {
          transfer: { battalionId: battalion.id, status: "COMPLETED",
            type: { in: ["SIGNOUT", "CHECKIN"] }, toSoldierId: { in: soldierIds } },
          serialUnitId: null,
          itemType: { trackingMethod: "QUANTITY" },
        },
        include: { transfer: { select: { type: true } } },
      });

      // אגרגציה
      const agg = new Map<string, number>();
      for (const b of stockBalances) {
        agg.set(b.itemTypeId, (agg.get(b.itemTypeId) ?? 0) + b.quantity);
      }
      for (const u of serialUnits) {
        agg.set(u.itemTypeId, (agg.get(u.itemTypeId) ?? 0) + (u.lotQuantity ?? 1));
      }
      for (const l of signedQtyLines) {
        const sign = l.transfer.type === "SIGNOUT" ? 1 : -1;
        agg.set(l.itemTypeId, (agg.get(l.itemTypeId) ?? 0) + sign * l.quantity);
      }

      let created = 0;
      let skipped = 0;
      for (const [itemTypeId, totalQty] of agg.entries()) {
        if (totalQty <= 0) continue;
        const existing = await prisma.companyItemBaseline.findUnique({
          where: { companyId_itemTypeId: { companyId: company.id, itemTypeId } },
        });
        if (existing) { skipped++; continue; }
        await prisma.companyItemBaseline.create({
          data: { battalionId: battalion.id, companyId: company.id, itemTypeId, permanentQuantity: totalQty },
        });
        created++;
      }
      console.log(`  ✓ ${company.name}: ${created} שורות בסיס נוצרו (${skipped} קיימות, דולגו)`);
    }
  }
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
