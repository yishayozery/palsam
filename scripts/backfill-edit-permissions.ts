/**
 * Backfill: שדרוג VIEW→EDIT לתפקידי-preset קיימים, בעקבות הפרדת
 * dispatch.edit / maintenance.edit מ-dispatch.manage / battalion.profile.
 *
 * ⚠️ למה זה הכרחי: ה-presets ב-rbac.ts נזרעים פעם אחת בלבד. שינוי ה-preset
 * בקוד לא נוגע בגדודים שכבר קיימים — בלי הסקריפט הזה, מפקד מחלקה עם
 * dispatch:VIEW ב-DB ייחסם מכתיבה לשבצ"ק אחרי ההידוק.
 *
 * ריצה יבשה כברירת מחדל; --apply לכתיבה.
 */
import { PrismaClient } from "../src/generated/prisma";
const p = new PrismaClient();
const APPLY = process.argv.includes("--apply");

/** תפקיד → המסכים שבהם הוא באמת מנהל, ולכן צריך EDIT ולא VIEW. */
const UPGRADES: { role: string; screens: string[] }[] = [
  { role: "מפקד מחלקה", screens: ["dispatch"] },
  { role: "מפ", screens: ["maintenance", "driving_licenses"] },
  { role: "מפלג", screens: ["maintenance", "dispatch"] },
  { role: 'קה"ד', screens: ["driving_licenses"] },
  // רס"פ/סרס"פ/קל"ג/אחראי ארמון יושבים תחת "מנהל מחסן" ומנהלים שבצ"ק בפועל
  { role: "מנהל מחסן", screens: ["dispatch"] },
];

async function main() {
  const roles = await p.systemRole.findMany({
    where: { name: { in: UPGRADES.map((u) => u.role) } },
    select: {
      id: true, name: true,
      battalion: { select: { name: true, code: true } },
      permissions: { select: { id: true, screen: true, level: true } },
    },
  });
  console.log(`נמצאו ${roles.length} תפקידים תואמים בכל הגדודים\n`);

  let changes = 0, already = 0, missing = 0;
  for (const r of roles) {
    const want = UPGRADES.find((u) => u.role === r.name)!.screens;
    for (const screen of want) {
      const perm = r.permissions.find((x) => x.screen === screen);
      const label = `${r.battalion.name} (${r.battalion.code}) · ${r.name} · ${screen}`;
      if (!perm) {
        // אין לתפקיד הרשאה למסך הזה כלל — לא ממציאים גישה חדשה
        console.log(`  ⏭️  ${label} — אין הרשאה למסך, מדלג`);
        missing++;
        continue;
      }
      if (perm.level === "EDIT") { already++; continue; }
      console.log(`  ⬆️  ${label}: ${perm.level} -> EDIT`);
      changes++;
      if (APPLY) await p.screenPermission.update({ where: { id: perm.id }, data: { level: "EDIT" } });
    }
  }

  console.log(`\nלשדרוג: ${changes} | כבר EDIT: ${already} | ללא הרשאה למסך: ${missing}`);
  if (!APPLY) console.log(`(ריצה יבשה - הרץ עם --apply)`);
  else console.log(`OK`);
}
main().finally(() => p.$disconnect());
