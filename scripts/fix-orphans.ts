import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

async function main() {
  // מצא את כל הפריטים הסריאליים בלי מחזיק
  const orphans = await prisma.serialUnit.findMany({
    where: { currentHolderId: null },
    include: {
      itemType: { select: { name: true } },
      transferLines: {
        include: {
          transfer: {
            select: { id: true, type: true, status: true, fromHolderId: true, toHolderId: true, createdAt: true,
              fromHolder: { select: { name: true } },
              toHolder: { select: { name: true } },
            },
          },
        },
        orderBy: { transfer: { createdAt: "desc" } },
      },
    },
  });

  console.log(`\n=== נמצאו ${orphans.length} פריטים יתומים (currentHolderId = null) ===\n`);

  for (const u of orphans) {
    console.log(`📦 ${u.itemType.name} | SN: ${u.serialNumber} | ID: ${u.id}`);
    if (u.transferLines.length === 0) {
      console.log(`   ⚠️  אין שורות העברה — לא ברור מאיפה הגיע`);
      continue;
    }
    const latest = u.transferLines[0].transfer;
    console.log(`   העברה אחרונה: ${latest.type} | סטטוס: ${latest.status} | ${latest.createdAt.toISOString().slice(0, 10)}`);
    console.log(`   מ: ${latest.fromHolder?.name ?? latest.fromHolderId} → ל: ${latest.toHolder?.name ?? latest.toHolderId}`);

    // תיקון: מחזירים לפי סטטוס ההעברה
    let fixTo: string | null = null;
    if (latest.status === "PENDING") {
      // העברה תלויה — הפריט צריך לחזור למקור
      fixTo = latest.fromHolderId;
      console.log(`   🔧 תיקון: מחזיר ל-${latest.fromHolder?.name ?? fixTo} (מקור ההעברה ה-PENDING)`);
    } else if (latest.status === "COMPLETED") {
      // העברה הושלמה — הפריט צריך להיות ביעד
      fixTo = latest.toHolderId;
      console.log(`   🔧 תיקון: משייך ל-${latest.toHolder?.name ?? fixTo} (יעד ההעברה ה-COMPLETED)`);
    } else if (latest.status === "REJECTED") {
      // העברה נדחתה — הפריט צריך לחזור למקור
      fixTo = latest.fromHolderId;
      console.log(`   🔧 תיקון: מחזיר ל-${latest.fromHolder?.name ?? fixTo} (מקור ההעברה שנדחתה)`);
    }

    if (fixTo) {
      await prisma.serialUnit.update({
        where: { id: u.id },
        data: { currentHolderId: fixTo },
      });
      console.log(`   ✅ תוקן!`);
    } else {
      console.log(`   ❌ לא ניתן לתקן אוטומטית — סטטוס: ${latest.status}`);
    }
    console.log();
  }

  console.log("סיום.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
