import { notFound, redirect } from "next/navigation";
import { requireCapability } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader, Badge } from "@/components/ui";
import { COUNT_TYPE } from "@/lib/labels";
import CountExecutor from "./CountExecutor";
import VerificationPanel from "./VerificationPanel";

export const dynamic = "force-dynamic";
// "שלח לכולם" מריץ ברודקאסט מווסת (~25/שנייה) שיכול לקחת עד דקה לפלוגה גדולה
export const maxDuration = 60;

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
    },
  });
  if (!session) notFound();
  if (session.status === "COMPLETED") redirect(`/counts/${id}/report`);

  const serialItemTypes = new Map<string, string>();
  for (const l of session.lines) {
    if (l.serialUnit) serialItemTypes.set(l.itemType.id, l.itemType.name);
  }

  const companyHolderIds = [...new Set(
    session.lines.filter((l) => l.holder?.kind === "COMPANY").map((l) => l.holderId!),
  )].filter(Boolean);

  const signerMap: Record<string, string> = {};
  if (companyHolderIds.length > 0) {
    const sigs = await prisma.signature.findMany({
      where: {
        battalionId: session.battalionId,
        signerUserId: { not: null },
        transfer: { type: "ISSUE", toHolderId: { in: companyHolderIds } },
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

  return (
    <div>
      <PageHeader
        title="ביצוע ספירה"
        subtitle={`${COUNT_TYPE[session.type]} · ${session.lines.length} פריטים`}
        action={
          <div className="flex gap-2">
            {session.frozen && <Badge className="bg-amber-100 text-amber-800">מצב מוקפא ❄️</Badge>}
            {session.isBlind && <Badge className="bg-indigo-100 text-indigo-800">ספירה עיוורת 🔍</Badge>}
          </div>
        }
      />

      {serialItemTypes.size > 0 && (
        <div className="mb-4">
          <VerificationPanel
            sessionId={session.id}
            itemTypes={Array.from(serialItemTypes, ([id, name]) => ({ id, name }))}
          />
        </div>
      )}

      <CountExecutor
        sessionId={session.id}
        isBlind={session.isBlind}
        signerMap={signerMap}
        lines={session.lines.map((l) => ({
          id: l.id,
          item: l.itemType.name,
          itemTypeId: l.itemTypeId,
          holder: l.holder?.name ?? "—",
          holderId: l.holderId ?? null,
          serial: l.serialUnit?.serialNumber ?? null,
          serialUnitId: l.serialUnitId,
          signedSoldier: (l.soldier || l.serialUnit?.signedSoldier)
            ? `${(l.soldier ?? l.serialUnit?.signedSoldier)!.fullName}${(l.soldier ?? l.serialUnit?.signedSoldier)!.personalNumber ? ` (${(l.soldier ?? l.serialUnit?.signedSoldier)!.personalNumber})` : ""}`
            : null,
          soldierId: l.soldierId ?? null,
          physicalLocation: l.serialUnit?.physicalLocation ?? null,
          equipmentLocation: l.serialUnit?.equipmentLocation?.name ?? null,
          shelfLabel: l.serialUnit?.storedShelf?.label ?? null,
          expiryDate: l.serialUnit?.expiryDate?.toISOString() ?? null,
          lotQuantity: l.serialUnit?.lotQuantity ?? null,
          expected: l.expectedQty,
          isSerial: !!l.serialUnitId,
        }))}
      />
    </div>
  );
}
