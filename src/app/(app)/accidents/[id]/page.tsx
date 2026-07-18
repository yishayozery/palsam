import { notFound } from "next/navigation";
import { requireCapability } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import AccidentDetailClient from "./AccidentDetailClient";

export const dynamic = "force-dynamic";

export default async function AccidentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireCapability("maintenance.manage");
  const { id } = await params;
  const r = await prisma.accidentReport.findFirst({
    where: { id, battalionId: user.battalionId! },
    include: { photos: { select: { kind: true, blobUrl: true } }, battalion: { select: { name: true } } },
  });
  if (!r) notFound();

  // שמות המטפלים (קצין רכב / מג"ד) — resolve מזהי משתמש
  const uids = [r.officerUserId, r.magadUserId].filter((x): x is string => !!x);
  const users = uids.length ? await prisma.appUser.findMany({ where: { id: { in: uids } }, select: { id: true, fullName: true, title: true } }) : [];
  const nameOf = (uid: string | null) => (uid ? users.find((u) => u.id === uid) : null);

  return (
    <AccidentDetailClient
      id={r.id}
      type={r.type}
      status={r.status}
      battalionName={r.battalion?.name ?? ""}
      createdAt={r.createdAt.toISOString()}
      partA={{
        accidentAt: r.accidentAt?.toISOString() ?? null,
        location: r.location, description: r.description,
        ourVehiclePlate: r.ourVehiclePlate, ourVehicleType: r.ourVehicleType,
        driverName: r.driverName, driverPersonalId: r.driverPersonalId, driverPhone: r.driverPhone,
        otherPartyName: r.otherPartyName, otherPartyId: r.otherPartyId, otherPartyPhone: r.otherPartyPhone,
        otherVehiclePlate: r.otherVehiclePlate, otherVehicleUnit: r.otherVehicleUnit, otherInsurance: r.otherInsurance,
      }}
      photos={r.photos.map((p) => ({ kind: p.kind, url: p.blobUrl }))}
      officerNotes={r.officerNotes ?? ""}
      officerName={nameOf(r.officerUserId)?.fullName ?? null}
      officerAt={r.officerAt?.toISOString() ?? null}
      magadName={nameOf(r.magadUserId)?.fullName ?? null}
      magadSignature={r.magadSignature}
      magadAt={r.magadAt?.toISOString() ?? null}
      examinerName={r.examinerName}
      examinerSignature={r.examinerSignature}
      examinerAt={r.examinerAt?.toISOString() ?? null}
    />
  );
}
