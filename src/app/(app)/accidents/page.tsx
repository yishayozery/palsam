import { requireCapability } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import AccidentsClient from "./AccidentsClient";

export const dynamic = "force-dynamic";

export default async function AccidentsPage() {
  const user = await requireCapability("maintenance.manage");
  const reports = await prisma.accidentReport.findMany({
    where: { battalionId: user.battalionId! },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true, type: true, status: true, createdAt: true,
      location: true, ourVehiclePlate: true, driverName: true,
      _count: { select: { photos: true } },
    },
  });

  return (
    <div>
      <PageHeader title="🚧 דיווחי תאונה" subtitle={'חלק א ממולא בשטח ע"י החייל · חלק ב + אישורים כאן'} />
      <AccidentsClient
        reports={reports.map((r) => ({
          id: r.id, type: r.type, status: r.status,
          createdAt: r.createdAt.toISOString(),
          location: r.location, plate: r.ourVehiclePlate, driver: r.driverName,
          photos: r._count.photos,
        }))}
      />
    </div>
  );
}
