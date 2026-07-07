import { PrismaClient } from "../src/generated/prisma";
const p = new PrismaClient();
async function main() {
  const bat = await p.battalion.findUnique({ where: { code: "5554" }, select: { id: true, name: true } });
  const role = await p.systemRole.findUnique({
    where: { battalionId_name: { battalionId: bat!.id, name: "שליש" } }, select: { id: true },
  });
  if (!role) { console.log("אין תפקיד שליש בגדוד — מדלג"); return; }
  const add: { screen: string; level: "VIEW" | "EDIT" }[] = [
    { screen: "attendance", level: "EDIT" }, { screen: "employment", level: "VIEW" },
  ];
  for (const perm of add) {
    await p.screenPermission.upsert({
      where: { roleId_screen: { roleId: role.id, screen: perm.screen } },
      update: { level: perm.level }, create: { roleId: role.id, screen: perm.screen, level: perm.level },
    });
  }
  console.log(`✅ שליש (${bat!.name}) — נוספה גישת נוכחות (EDIT) + תעסוקה (VIEW)`);
}
main().then(() => p.$disconnect()).catch((e) => { console.error(e); p.$disconnect(); process.exit(1); });
