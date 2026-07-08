import { PrismaClient } from "../src/generated/prisma";
const p = new PrismaClient();
async function main() {
  const bat = await p.battalion.findUnique({ where: { code: "5554" }, select: { id: true } });
  // חיילים שהפלוגה שלהם היא holder מסוג WAREHOUSE (באג)
  const bad = await p.soldier.findMany({
    where: { battalionId: bat!.id, company: { kind: "WAREHOUSE" } },
    select: {
      id: true, fullName: true, personalNumber: true,
      company: { select: { name: true } },
      squadId: true, squad: { select: { name: true, companyId: true, company: { select: { name: true, kind: true } } } },
      companyRole: { select: { name: true } },
    },
  });
  console.log(`נמצאו ${bad.length} חיילים שהפלוגה שלהם היא מחסן:\n`);
  for (const s of bad) {
    const target = s.squad && s.squad.company?.kind === "COMPANY" ? s.squad.companyId : null;
    console.log(`• ${s.fullName} (${s.personalNumber}) | פלוגה=${s.company?.name} | מחלקה=${s.squad?.name ?? "—"} → פלוגת יעד=${s.squad?.company?.name ?? "❓ אין מחלקה תקינה"}${s.companyRole ? ` | ${s.companyRole.name}` : ""}`);
    if (target) {
      await p.soldier.update({ where: { id: s.id }, data: { companyId: target } });
      console.log(`    ✅ הוחזר ל-${s.squad!.company!.name}`);
    } else {
      console.log(`    ⚠️ אין מחלקה תקינה — צריך שיוך ידני לפלוגה`);
    }
  }
  if (bad.length === 0) console.log("אין — הכל תקין.");
}
main().then(() => p.$disconnect()).catch((e) => { console.error(e); p.$disconnect(); process.exit(1); });
