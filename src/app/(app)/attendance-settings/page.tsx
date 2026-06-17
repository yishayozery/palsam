import { requireCapability } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card } from "@/components/ui";
import AttendanceSettingsClient from "./AttendanceSettingsClient";

export const dynamic = "force-dynamic";

export default async function AttendanceSettingsPage() {
  const user = await requireCapability("battalion.profile");
  const bId = user.battalionId!;

  const statuses = await prisma.attendanceStatus.findMany({
    where: { battalionId: bId },
    orderBy: { sortOrder: "asc" },
  });

  const companies = await prisma.holder.findMany({
    where: { battalionId: bId, kind: "COMPANY", active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const squads = await prisma.squad.findMany({
    where: { battalionId: bId },
    orderBy: [{ company: { name: "asc" } }, { sortOrder: "asc" }],
    include: { company: { select: { name: true } }, _count: { select: { soldiers: true } } },
  });

  return (
    <div>
      <PageHeader
        title="⚙️ הגדרות נוכחות"
        subtitle="הגדר סטטוסי נוכחות ומחלקות לפלוגות"
      />
      <AttendanceSettingsClient
        statuses={statuses}
        companies={companies}
        squads={squads.map((s) => ({
          id: s.id,
          name: s.name,
          companyId: s.companyId,
          companyName: s.company.name,
          sortOrder: s.sortOrder,
          soldierCount: s._count.soldiers,
        }))}
      />
    </div>
  );
}
