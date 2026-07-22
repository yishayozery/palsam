import { notFound } from "next/navigation";
import Link from "next/link";
import { requireCapability } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { classifyLines, canApproveIntake, summarize } from "@/lib/sap-voucher";
import DraftView from "./DraftView";

export const dynamic = "force-dynamic";

export default async function IntakeDraftPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireCapability("warehouse.operate");
  const bId = user.battalionId!;

  const draft = await prisma.intakeDraft.findFirst({
    where: { id, battalionId: bId },
    select: {
      id: true, voucherNo: true, status: true, holderId: true, transferId: true,
      holder: { select: { name: true } },
      lines: { orderBy: { status: "asc" }, select: {
        id: true, sku: true, description: true, standardQty: true, allocatedQty: true,
        gap: true, status: true, note: true, itemTypeId: true, editedByUser: true,
      } },
    },
  });
  if (!draft) notFound();

  // סיווג חי מול הקטלוג הנוכחי — כדי שמצב הכפתורים תמיד עדכני
  const catalog = await prisma.itemType.findMany({ where: { battalionId: bId }, select: { id: true, sku: true, name: true, trackingMethod: true } });
  const classified = classifyLines(
    draft.lines.map((l) => ({ sku: l.sku, description: l.description, standardQty: l.standardQty, allocatedQty: l.allocatedQty, gap: l.gap })),
    catalog,
  );
  const { ready, blocking } = canApproveIntake(classified);
  const totals = summarize(classified);
  const unknownCount = classified.filter((l) => l.status === "UNKNOWN_SKU").length;

  return (
    <div>
      <PageHeader
        title={`📄 ${draft.voucherNo || "שובר"} → ${draft.holder?.name ?? ""}`}
        subtitle={`${totals.lines} שורות · ${totals.totalUnits} יחידות לקליטה`}
        action={<Link href="/stock/intake" className="text-sm text-indigo-600 hover:underline">→ חזרה לרשימה</Link>}
      />
      <DraftView
        draftId={draft.id}
        status={draft.status}
        transferId={draft.transferId}
        lines={draft.lines.map((l, i) => ({ ...l, liveStatus: classified[i].status, liveNote: classified[i].note }))}
        ready={ready}
        blocking={blocking}
        unknownCount={unknownCount}
      />
    </div>
  );
}
