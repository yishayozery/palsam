import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient();

async function main() {
  const result = await prisma.serialUnit.updateMany({
    where: { currentHolderId: null, dischargedAt: null },
    data: { dischargedAt: new Date() },
  });
  console.log(`Updated ${result.count} items with dischargedAt`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
