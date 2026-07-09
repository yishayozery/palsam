import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { FORM_ORDER, DRIVER_FORMS, type FormType } from "@/lib/driverForms";
import PublicDriverForms from "./PublicDriverForms";

export const dynamic = "force-dynamic";

export default async function PublicDriverFormPage({ params }: { params: Promise<{ soldierId: string }> }) {
  const { soldierId } = await params;
  const soldier = await prisma.soldier.findUnique({
    where: { id: soldierId },
    select: {
      id: true, fullName: true, personalNumber: true,
      company: { select: { name: true } }, companyRole: { select: { name: true } },
      civilianLicenseNumber: true, civilianLicenseGrade: true, civilianLicenseExpiry: true,
      civilianLicenseFrontData: true, civilianLicenseBackData: true, militaryLicenseFrontData: true,
      battalion: { select: { name: true, logoData: true } },
      driverForms: { select: { formType: true, data: true, filledAt: true, validUntil: true } },
    },
  });
  if (!soldier) notFound();

  const formMap = new Map(soldier.driverForms.map((f) => [f.formType, f]));
  // הכשרת בטיחות (officerOnly) לא נשלחת לנהג בבוט — ממולאת רק במערכת
  const forms = FORM_ORDER.filter((ft) => !DRIVER_FORMS[ft].officerOnly).map((ft) => {
    const f = formMap.get(ft);
    return {
      formType: ft as FormType,
      data: (f?.data ?? {}) as Record<string, unknown>,
      filledAt: f?.filledAt ? f.filledAt.toISOString() : null,
      validUntil: f?.validUntil ? f.validUntil.toISOString() : null,
    };
  });
  const photos = {
    civFront: !!soldier.civilianLicenseFrontData,
    civBack: !!soldier.civilianLicenseBackData,
    milFront: !!soldier.militaryLicenseFrontData,
  };

  const nameParts = soldier.fullName.split(" ");
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-800 to-slate-950 p-4">
      <div className="max-w-md mx-auto">
        <div className="bg-white rounded-2xl shadow-xl p-5">
          <div className="text-center mb-4">
            {soldier.battalion.logoData && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={soldier.battalion.logoData} alt="" className="mx-auto w-14 h-14 object-contain mb-2" />
            )}
            <h1 className="text-lg font-bold text-slate-800">📁 תיק נהג</h1>
            <p className="text-sm text-slate-500">{soldier.battalion.name}</p>
            <p className="text-sm text-slate-700 mt-1 font-medium">{soldier.fullName} · מ.א {soldier.personalNumber ?? "—"}</p>
          </div>
          <PublicDriverForms
            soldier={{
              id: soldier.id, fullName: soldier.fullName,
              firstName: nameParts.slice(0, -1).join(" "), lastName: nameParts.slice(-1)[0] ?? "",
              personalNumber: soldier.personalNumber ?? "", company: soldier.company?.name ?? "", role: soldier.companyRole?.name ?? "",
              civilianLicenseNumber: soldier.civilianLicenseNumber ?? "", civilianLicenseGrade: soldier.civilianLicenseGrade ?? "",
              civilianLicenseExpiry: soldier.civilianLicenseExpiry ? soldier.civilianLicenseExpiry.toISOString().slice(0, 10) : "",
            }}
            forms={forms}
            photos={photos}
          />
        </div>
      </div>
    </div>
  );
}
