import { PrismaClient } from "../src/generated/prisma";
const p = new PrismaClient();
async function main() {
  const bat = await p.battalion.findUnique({ where: { code: "5554" }, select: { id: true } });
  const s = await p.soldier.findFirst({
    where: { battalionId: bat!.id, OR: [{ personalNumber: "8246435" }, { fullName: { contains: "חן ברוך" } }, { fullName: { contains: "ברוך חן" } }] },
    select: {
      id: true, fullName: true, personalNumber: true, status: true, callupClosedAt: true,
      companyId: true, company: { select: { name: true, kind: true } },
      squadId: true, squad: { select: { name: true } },
      companyRoleId: true, companyRole: { select: { name: true } },
    },
  });
  console.log("=== Soldier record ===");
  console.log(JSON.stringify(s, null, 2));
  if (s) {
    const users = await p.appUser.findMany({
      where: { battalionId: bat!.id, OR: [{ soldierId: s.id }, { fullName: { contains: "חן ברוך" } }, { fullName: { contains: "ברוך חן" } }] },
      select: { id: true, username: true, fullName: true, role: true, holderId: true, holder: { select: { name: true, kind: true } }, systemRole: { select: { name: true } }, soldierId: true, active: true },
    });
    console.log("\n=== Linked user(s) ===");
    console.log(JSON.stringify(users, null, 2));
  }
}
main().then(() => p.$disconnect()).catch((e) => { console.error(e); p.$disconnect(); process.exit(1); });
