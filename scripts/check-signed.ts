import { PrismaClient } from "../src/generated/prisma";
const p = new PrismaClient();

async function main() {
  // Check sessions created for "בדיקת ציוד מפוזר v2"
  const plan = await p.countPlan.findFirst({
    where: { name: "בדיקת ציוד מפוזר v2" },
    select: { id: true },
  });
  console.log("Plan:", plan?.id);

  if (plan) {
    const tasks = await p.countTask.findMany({
      where: { planId: plan.id },
      include: {
        holder: { select: { name: true, kind: true } },
        session: {
          select: {
            id: true, type: true, isBlind: true, status: true,
            lines: {
              select: {
                id: true,
                itemType: { select: { name: true } },
                soldierId: true,
                signerUserId: true,
                serialUnit: { select: { serialNumber: true } },
                soldier: { select: { fullName: true } },
              },
            },
          },
        },
      },
    });

    for (const t of tasks) {
      console.log(`\nTask: holder=${t.holder?.name} (${t.holder?.kind})`);
      if (t.session) {
        console.log(`  Session: ${t.session.id}, type=${t.session.type}, status=${t.session.status}`);
        for (const l of t.session.lines) {
          console.log(`  Line: ${l.itemType.name} (${l.serialUnit?.serialNumber}) soldier=${l.soldier?.fullName} signerUserId=${l.signerUserId}`);
        }
      }
    }

    // Check verification requests
    const vReqs = await p.verificationRequest.findMany({
      where: { session: { id: { in: tasks.map((t) => t.sessionId!).filter(Boolean) } } },
      include: {
        soldier: { select: { fullName: true, telegramChatId: true } },
        items: true,
      },
    });
    console.log(`\nVerification requests: ${vReqs.length}`);
    for (const v of vReqs) {
      console.log(`  VReq: soldier=${v.soldier?.fullName} mode=${v.mode} sentAt=${v.sentAt} sentVia=${v.sentVia} items=${v.items.length}`);
    }
  }

  await p.$disconnect();
}
main();
