import { requireUser } from "@/lib/guard";
import { can } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { FORM_ORDER, FORM_TITLES, DEFAULT_VALIDITY_DAYS, type FormType } from "@/lib/driverForms";
import DriverFilesClient from "./DriverFilesClient";

export const dynamic = "force-dynamic";

export default async function DriverFilesPage() {
  const user = await requireUser();
  if (!can(user, "dispatch.manage")) redirect("/dashboard");
  const bId = user.battalionId!;

  const [drivers, withPhoto, validities] = await Promise.all([
    prisma.soldier.findMany({
      where: {
        battalionId: bId,
        status: { notIn: ["DISCHARGED", "INACTIVE"] },
        OR: [{ drivingLicenses: { some: {} } }, { driverForms: { some: {} } }, { civilianLicenseNumber: { not: null } }],
      },
      orderBy: [{ company: { name: "asc" } }, { fullName: "asc" }],
      select: {
        id: true, fullName: true, personalNumber: true,
        company: { select: { name: true } },
        civilianLicenseExpiry: true,
        driverForms: { select: { formType: true, validUntil: true } },
      },
    }),
    prisma.soldier.findMany({ where: { battalionId: bId, licensePhotoData: { not: null } }, select: { id: true } }),
    prisma.driverFormValidity.findMany({ where: { battalionId: bId }, select: { formType: true, validityDays: true } }),
  ]);

  const photoSet = new Set(withPhoto.map((s) => s.id));
  const valMap = new Map(validities.map((v) => [v.formType, v.validityDays]));
  const now = Date.now();
  const monthMs = 30 * 86400000;

  type FileStatus = "missing" | "valid" | "expiring" | "expired";
  const statusOf = (validUntil: Date | null | undefined, exists: boolean): FileStatus => {
    if (!exists) return "missing";
    if (!validUntil) return "valid";
    const t = validUntil.getTime();
    if (t < now) return "expired";
    if (t - now < monthMs) return "expiring";
    return "valid";
  };

  const rows = drivers.map((d) => {
    const formMap = new Map(d.driverForms.map((f) => [f.formType, f.validUntil]));
    const forms = FORM_ORDER.map((ft) => ({ formType: ft, status: statusOf(formMap.get(ft) ?? null, formMap.has(ft)) }));
    const photoStatus = statusOf(d.civilianLicenseExpiry ?? null, photoSet.has(d.id));
    const all = [...forms.map((f) => f.status), photoStatus];
    const complete = all.every((s) => s === "valid" || s === "expiring");
    const anyProblem = all.some((s) => s === "missing" || s === "expired");
    return {
      id: d.id, name: d.fullName, pn: d.personalNumber ?? "", company: d.company?.name ?? "—",
      forms, photoStatus, complete, anyProblem,
      licenseExpiry: d.civilianLicenseExpiry ? d.civilianLicenseExpiry.toISOString().slice(0, 10) : null,
    };
  });

  const validityRows = FORM_ORDER.map((ft) => ({
    formType: ft, title: FORM_TITLES[ft as FormType], days: valMap.get(ft) ?? DEFAULT_VALIDITY_DAYS[ft as FormType],
  }));

  return (
    <div>
      <PageHeader title="📁 תיקי נהגים" subtitle={`${rows.length} נהגים · 3 טפסים + צילום רישיון לכל נהג`} />
      <DriverFilesClient rows={rows} validityRows={validityRows} formTitles={FORM_TITLES} canEdit={can(user, "dispatch.manage")} />
    </div>
  );
}
