import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verifyLink } from "@/lib/link-token";
import AccidentFormClient from "./AccidentFormClient";

export const dynamic = "force-dynamic";

export default async function AccidentReportFillPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { id } = await params;
  const { t: tok } = await searchParams;
  if (!verifyLink("accident-fill", id, tok)) notFound();

  const report = await prisma.accidentReport.findUnique({
    where: { id },
    select: {
      id: true, type: true, status: true, reportingSoldierId: true,
      accidentAt: true, location: true, description: true,
      ourVehiclePlate: true, ourVehicleType: true,
      driverName: true, driverPersonalId: true, driverPhone: true,
      otherPartyName: true, otherPartyId: true, otherPartyPhone: true,
      otherVehiclePlate: true, otherVehicleUnit: true, otherInsurance: true,
      battalion: { select: { name: true } },
      photos: { select: { kind: true, blobUrl: true } },
    },
  });
  if (!report) notFound();

  // 🪪 רישיונות שכבר קיימים במערכת על החייל המדווח — לא לבקש שוב
  const existingLicenses: Record<string, string> = {};
  if (report.reportingSoldierId) {
    const sol = await prisma.soldier.findUnique({
      where: { id: report.reportingSoldierId },
      select: { civilianLicenseFrontData: true, civilianLicenseBackData: true, militaryLicenseFrontData: true },
    });
    if (sol?.civilianLicenseFrontData) existingLicenses.CIVIL_LICENSE_FRONT = sol.civilianLicenseFrontData;
    if (sol?.civilianLicenseBackData) existingLicenses.CIVIL_LICENSE_BACK = sol.civilianLicenseBackData;
    if (sol?.militaryLicenseFrontData) existingLicenses.MILITARY_LICENSE = sol.militaryLicenseFrontData;
  }

  return (
    <AccidentFormClient
      id={report.id}
      token={tok ?? ""}
      type={report.type}
      done={report.status !== "DRAFT"}
      battalionName={report.battalion?.name ?? ""}
      initial={{
        accidentAt: report.accidentAt ? report.accidentAt.toISOString().slice(0, 16) : "",
        location: report.location ?? "", description: report.description ?? "",
        ourVehiclePlate: report.ourVehiclePlate ?? "", ourVehicleType: report.ourVehicleType ?? "",
        driverName: report.driverName ?? "", driverPersonalId: report.driverPersonalId ?? "", driverPhone: report.driverPhone ?? "",
        otherPartyName: report.otherPartyName ?? "", otherPartyId: report.otherPartyId ?? "", otherPartyPhone: report.otherPartyPhone ?? "",
        otherVehiclePlate: report.otherVehiclePlate ?? "", otherVehicleUnit: report.otherVehicleUnit ?? "", otherInsurance: report.otherInsurance ?? "",
      }}
      photos={Object.fromEntries(report.photos.map((p) => [p.kind, p.blobUrl]))}
      existingLicenses={existingLicenses}
    />
  );
}
