import { notFound } from "next/navigation";
import { requireCapability } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader, Badge } from "@/components/ui";
import SessionReportView from "./SessionReportView";

export const dynamic = "force-dynamic";

export default async function SessionReportPage({
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
          itemType: { select: { id: true, name: true, sku: true, trackingMethod: true, category: { select: { name: true } } } },
          holder: { select: { id: true, name: true, kind: true } },
          soldier: { select: { fullName: true, personalNumber: true } },
          serialUnit: {
            include: {
              signedSoldier: { select: { fullName: true, personalNumber: true } },
              equipmentLocation: { select: { name: true } },
              storedShelf: { select: { label: true } },
            },
          },
        },
        orderBy: [{ holder: { name: "asc" } }, { itemType: { name: "asc" } }],
      },
      startedBy: { select: { fullName: true } },
    },
  });
  if (!session) notFound();

  const holderIds = [...new Set(session.lines.map((l) => l.holderId).filter(Boolean))] as string[];

  const signerMap: Record<string, string> = {};
  if (holderIds.length > 0) {
    const sigs = await prisma.signature.findMany({
      where: {
        battalionId: session.battalionId,
        signerUserId: { not: null },
        transfer: { type: "ISSUE", toHolderId: { in: holderIds } },
      },
      include: {
        signerUser: { select: { fullName: true } },
        transfer: { select: { toHolderId: true } },
      },
      orderBy: { signedAt: "desc" },
    });
    for (const sig of sigs) {
      const hId = sig.transfer?.toHolderId;
      if (hId && !signerMap[hId]) {
        signerMap[hId] = sig.signerUser!.fullName;
      }
    }
  }

  const discrepancies = await prisma.discrepancy.findMany({
    where: { sessionId: id },
    select: { itemTypeId: true, holderId: true, diff: true, kind: true, resolution: true },
  });
  const discrepancyMap = new Map(
    discrepancies.map((d) => [`${d.itemTypeId}:${d.holderId}`, d]),
  );

  type ReportLine = {
    id: string;
    itemName: string;
    sku: string | null;
    categoryName: string | null;
    holderId: string | null;
    holderName: string;
    holderKind: string;
    soldierName: string | null;
    soldierPN: string | null;
    serialNumber: string | null;
    location: string | null;
    shelf: string | null;
    expiryDate: string | null;
    expectedQty: number;
    countedQty: number | null;
    status: "reported" | "not_reported" | "discrepancy";
    diff: number | null;
    note: string | null;
    signerName: string | null;
  };

  const lines: ReportLine[] = session.lines.map((l) => {
    const soldier = l.soldier || l.serialUnit?.signedSoldier;
    const disc = discrepancyMap.get(`${l.itemTypeId}:${l.holderId}`);
    let status: ReportLine["status"] = "not_reported";
    if (l.countedQty !== null) {
      status = disc ? "discrepancy" : "reported";
    }

    return {
      id: l.id,
      itemName: l.itemType.name,
      sku: l.itemType.sku,
      categoryName: l.itemType.category?.name ?? null,
      holderId: l.holderId,
      holderName: l.holder?.name ?? "—",
      holderKind: l.holder?.kind ?? "",
      soldierName: soldier?.fullName ?? null,
      soldierPN: soldier?.personalNumber ?? null,
      serialNumber: l.serialUnit?.serialNumber ?? null,
      location: l.serialUnit?.equipmentLocation?.name ?? l.serialUnit?.physicalLocation ?? null,
      shelf: l.serialUnit?.storedShelf?.label ?? null,
      expiryDate: l.serialUnit?.expiryDate?.toISOString() ?? null,
      expectedQty: l.expectedQty,
      countedQty: l.countedQty,
      status,
      diff: l.countedQty !== null ? l.countedQty - l.expectedQty : null,
      note: l.note,
      signerName: l.holderId ? (signerMap[l.holderId] ?? null) : null,
    };
  });

  const holders = [...new Map(
    session.lines.filter((l) => l.holder).map((l) => [l.holder!.id, { id: l.holder!.id, name: l.holder!.name }]),
  ).values()];

  const reported = lines.filter((l) => l.status === "reported").length;
  const notReported = lines.filter((l) => l.status === "not_reported").length;
  const discrepancyCount = lines.filter((l) => l.status === "discrepancy").length;

  return (
    <div>
      <PageHeader
        title="דוח ספירה"
        subtitle={`${session.lines.length} פריטים · ${session.completedAt ? new Date(session.completedAt).toLocaleDateString("he-IL") : "בביצוע"}`}
        action={
          <div className="flex gap-2">
            {session.isBlind && <Badge className="bg-indigo-100 text-indigo-800">ספירה עיוורת 🔍</Badge>}
            <Badge className={session.status === "COMPLETED" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}>
              {session.status === "COMPLETED" ? "הושלם ✓" : "בביצוע"}
            </Badge>
            <a href="/counts" className="bg-white border border-slate-300 text-slate-700 rounded-lg px-4 py-2 text-sm hover:bg-slate-50">
              ← חזרה לספירות
            </a>
          </div>
        }
      />
      <SessionReportView
        lines={lines}
        holders={holders}
        summary={{ total: lines.length, reported, notReported, discrepancy: discrepancyCount }}
        startedBy={session.startedBy?.fullName ?? null}
        startedAt={session.startedAt.toISOString()}
        completedAt={session.completedAt?.toISOString() ?? null}
      />
    </div>
  );
}
