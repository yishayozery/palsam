import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verifyLink } from "@/lib/link-token";
import ExaminerSignClient from "./ExaminerSignClient";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = { ARMY_SELF: "צבא עצמי", ARMY_ARMY: "צבא עם צבא", CIVILIAN: "מעורבות אזרח" };
const PHOTO_LABEL: Record<string, string> = {
  VEHICLE_FRONT: "רכבנו — חזית", VEHICLE_BACK: "רכבנו — אחור", VEHICLE_LEFT: "רכבנו — שמאל", VEHICLE_RIGHT: "רכבנו — ימין",
  SCENE: "זירת התאונה", CIVIL_LICENSE_FRONT: "רישיון אזרחי קדימה", CIVIL_LICENSE_BACK: "רישיון אזרחי אחורה", MILITARY_LICENSE: "רישיון צבאי",
  OTHER_VEHICLE: "רכב הצד השני", OTHER_CIVIL_LICENSE_FRONT: "רישיון (שני) קדימה", OTHER_CIVIL_LICENSE_BACK: "רישיון (שני) אחורה", OTHER_MILITARY_LICENSE: "רישיון צבאי (שני)", OTHER: "אחר",
};

export default async function AccidentSignPage({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<{ t?: string }> }) {
  const { id } = await params;
  const { t: tok } = await searchParams;
  if (!verifyLink("accident-sign", id, tok)) notFound();

  const r = await prisma.accidentReport.findUnique({
    where: { id },
    include: { photos: { select: { kind: true, blobUrl: true } }, battalion: { select: { name: true } } },
  });
  if (!r) notFound();

  const detail = (labelValue: [string, string | null][]) =>
    labelValue.filter(([, v]) => v).map(([l, v]) => `${l}: ${v}`).join(" · ");

  return (
    <ExaminerSignClient
      id={r.id}
      token={tok ?? ""}
      alreadySigned={r.status === "APPROVED"}
      wrongStage={r.status !== "EXAMINER_REVIEW" && r.status !== "APPROVED"}
      battalionName={r.battalion?.name ?? ""}
      typeLabel={TYPE_LABEL[r.type] ?? r.type}
      eventLine={detail([
        ["מועד", r.accidentAt ? new Date(r.accidentAt).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem", dateStyle: "short", timeStyle: "short" }) : null],
        ["מיקום", r.location],
      ])}
      vehicleLine={detail([["רכבנו", [r.ourVehicleType, r.ourVehiclePlate].filter(Boolean).join(" ")], ["נהג", [r.driverName, r.driverPersonalId].filter(Boolean).join(" ")]])}
      otherLine={r.type !== "ARMY_SELF" ? detail([["צד שני", [r.otherPartyName, r.otherPartyId, r.otherVehiclePlate, r.otherVehicleUnit, r.otherInsurance].filter(Boolean).join(" ")]]) : ""}
      description={r.description ?? ""}
      officerNotes={r.officerNotes ?? ""}
      magadSignature={r.magadSignature}
      examinerName={r.examinerName}
      examinerSignature={r.examinerSignature}
      photos={r.photos.map((p) => ({ label: PHOTO_LABEL[p.kind] ?? p.kind, url: p.blobUrl }))}
    />
  );
}
