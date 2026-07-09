import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/guard";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { FORM_ORDER, DEFAULT_VALIDITY_DAYS, type FormType } from "@/lib/driverForms";
import DriverFileClient from "./DriverFileClient";

export const dynamic = "force-dynamic";

export default async function DriverFilePage({ params }: { params: Promise<{ soldierId: string }> }) {
  const user = await requireUser();
  if (!can(user, "dispatch.manage")) redirect("/dashboard");
  const bId = user.battalionId!;
  const { soldierId } = await params;

  const [soldier, battalion, validities] = await Promise.all([
    prisma.soldier.findUnique({
      where: { id: soldierId },
      select: {
        id: true, fullName: true, personalNumber: true, battalionId: true,
        company: { select: { name: true } },
        companyRole: { select: { name: true } },
        civilianLicenseNumber: true, civilianLicenseGrade: true, civilianLicenseExpiry: true,
        civilianLicenseFrontData: true, civilianLicenseBackData: true, militaryLicenseFrontData: true,
        driverForms: { select: { formType: true, data: true, signatureData: true, signerName: true, signerPersonalNumber: true, filledAt: true, validUntil: true } },
      },
    }),
    prisma.battalion.findUnique({ where: { id: bId }, select: { name: true, logoData: true } }),
    prisma.driverFormValidity.findMany({ where: { battalionId: bId }, select: { formType: true, validityDays: true } }),
  ]);
  if (!soldier || soldier.battalionId !== bId) notFound();

  const valMap = new Map(validities.map((v) => [v.formType, v.validityDays]));
  const formMap = new Map(soldier.driverForms.map((f) => [f.formType, f]));

  const forms = FORM_ORDER.map((ft) => {
    const f = formMap.get(ft);
    return {
      formType: ft as FormType,
      data: (f?.data ?? {}) as Record<string, unknown>,
      signatureData: f?.signatureData ?? null,
      signerName: f?.signerName ?? null,
      signerPersonalNumber: f?.signerPersonalNumber ?? null,
      filledAt: f?.filledAt ? f.filledAt.toISOString() : null,
      validUntil: f?.validUntil ? f.validUntil.toISOString() : null,
      validityDays: valMap.get(ft) ?? DEFAULT_VALIDITY_DAYS[ft as FormType],
    };
  });

  const nameParts = soldier.fullName.split(" ");
  return (
    <div>
      <PageHeader
        title={`📁 תיק נהג — ${soldier.fullName}`}
        subtitle={`${soldier.company?.name ?? "—"} · מ.א ${soldier.personalNumber ?? "—"}`}
        action={<a href="/driver-files" className="bg-white border border-slate-300 text-slate-700 rounded-lg px-4 py-2 text-sm hover:bg-slate-50">← לרשימת הנהגים</a>}
      />
      <DriverFileClient
        soldier={{
          id: soldier.id, fullName: soldier.fullName,
          firstName: nameParts.slice(0, -1).join(" "), lastName: nameParts.slice(-1)[0] ?? "",
          personalNumber: soldier.personalNumber ?? "", company: soldier.company?.name ?? "", role: soldier.companyRole?.name ?? "",
          civilianLicenseNumber: soldier.civilianLicenseNumber ?? "", civilianLicenseGrade: soldier.civilianLicenseGrade ?? "",
          civilianLicenseExpiry: soldier.civilianLicenseExpiry ? soldier.civilianLicenseExpiry.toISOString().slice(0, 10) : "",
          civFront: soldier.civilianLicenseFrontData ?? null, civBack: soldier.civilianLicenseBackData ?? null, milFront: soldier.militaryLicenseFrontData ?? null,
        }}
        forms={forms}
        battalion={{ name: battalion?.name ?? "", logoData: battalion?.logoData ?? null }}
      />
    </div>
  );
}
