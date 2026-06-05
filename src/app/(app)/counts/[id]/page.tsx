import { notFound, redirect } from "next/navigation";
import { requireCapability } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader, Badge } from "@/components/ui";
import { COUNT_TYPE } from "@/lib/labels";
import CountExecutor from "./CountExecutor";

export const dynamic = "force-dynamic";

export default async function CountSessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireCapability("counts.execute");
  const { id } = await params;

  const session = await prisma.countSession.findUnique({
    where: { id },
    include: {
      lines: {
        include: {
          itemType: true, holder: true,
          serialUnit: { include: { signedSoldier: { select: { fullName: true, personalNumber: true } } } },
        },
        orderBy: [{ holder: { name: "asc" } }, { itemType: { name: "asc" } }],
      },
    },
  });
  if (!session) notFound();
  if (session.status === "COMPLETED") redirect("/counts");

  return (
    <div>
      <PageHeader
        title="ביצוע ספירה"
        subtitle={`${COUNT_TYPE[session.type]} · ${session.lines.length} פריטים`}
        action={session.frozen ? <Badge className="bg-amber-100 text-amber-800">מצב מוקפא ❄️</Badge> : undefined}
      />
      <CountExecutor
        sessionId={session.id}
        lines={session.lines.map((l) => ({
          id: l.id,
          item: l.itemType.name,
          holder: l.holder?.name ?? "—",
          serial: l.serialUnit?.serialNumber ?? null,
          serialUnitId: l.serialUnitId,
          signedSoldier: l.serialUnit?.signedSoldier
            ? `${l.serialUnit.signedSoldier.fullName}${l.serialUnit.signedSoldier.personalNumber ? ` (${l.serialUnit.signedSoldier.personalNumber})` : ""}`
            : null,
          physicalLocation: l.serialUnit?.physicalLocation ?? null,
          expected: l.expectedQty,
          isSerial: !!l.serialUnitId,
        }))}
      />
    </div>
  );
}
