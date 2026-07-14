import { prisma } from "@/lib/prisma";
import { verifyLink } from "@/lib/link-token";
import { getSession } from "@/lib/auth";
import FillClient from "./FillClient";

export const dynamic = "force-dynamic";

export default async function ArmoryInspectionFillPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ t?: string }> }) {
  const { id } = await params;
  const { t } = await searchParams;

  const insp = await prisma.armoryInspection.findUnique({
    where: { id },
    include: {
      items: { orderBy: { sortOrder: "asc" } },
      battalion: { select: { name: true } },
    },
  });
  if (!insp) return <div className="p-8 text-center text-slate-500">הסבב לא נמצא.</div>;

  // הרשאת צפייה: טוקן תקף או משתמש מחובר מאותו גדוד
  let authOk = verifyLink("armory-inspection", id, t ?? null);
  if (!authOk) {
    const user = await getSession();
    authOk = !!user && user.battalionId === insp.battalionId;
  }
  if (!authOk) return <div className="p-8 text-center text-rose-600">לינק לא תקף או שאין לך הרשאה לצפות בסבב זה.</div>;

  const inspectorName = insp.inspectorName
    ?? (insp.inspectorSoldierId ? (await prisma.soldier.findUnique({ where: { id: insp.inspectorSoldierId }, select: { fullName: true } }))?.fullName : null)
    ?? "";
  const holderName = insp.holderId ? (await prisma.holder.findUnique({ where: { id: insp.holderId }, select: { name: true } }))?.name ?? "" : "";

  return (
    <FillClient
      id={id}
      token={t ?? null}
      battalionName={insp.battalion.name}
      holderName={holderName}
      scheduledAt={insp.scheduledAt.toISOString()}
      inspectorName={inspectorName}
      status={insp.status}
      completedAt={insp.completedAt?.toISOString() ?? null}
      overallOk={insp.overallOk}
      signerName={insp.signerName}
      signatureData={insp.signatureData}
      notes={insp.notes}
      items={insp.items.map((i) => ({ id: i.id, label: i.label, ok: i.ok, note: i.note }))}
    />
  );
}
