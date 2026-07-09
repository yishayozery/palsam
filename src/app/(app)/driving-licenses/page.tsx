import { requireUser } from "@/lib/guard";
import { can } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import CrudSection from "@/components/CrudSection";
import { saveLicenseType, toggleLicenseType, updateRefreshDays, saveDrivingProcedureText } from "./actions";
import ProcedureTextForm from "./ProcedureTextForm";
import LicenseEditor from "./LicenseEditor";
import VehicleTypeLicenseEditor from "./VehicleTypeLicenseEditor";
import RefreshDaysSettings from "./RefreshDaysSettings";
import DriverFileSettings from "./DriverFileSettings";
import { FORM_ORDER, FORM_TITLES, DEFAULT_VALIDITY_DAYS } from "@/lib/driverForms";

export const dynamic = "force-dynamic";

export default async function DrivingLicensesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await requireUser();
  if (!can(user, "dispatch.manage")) redirect("/dashboard");
  const bId = user.battalionId!;
  const { tab = "soldiers" } = await searchParams;

  const isAdmin = can(user, "battalion.profile");
  const isVehicleOfficer = user.role === "WAREHOUSE_MANAGER";
  const canManageTypes = isAdmin || isVehicleOfficer;
  const canEditLicenses = isAdmin || isVehicleOfficer;

  const battalion = await prisma.battalion.findUnique({
    where: { id: bId },
    select: { drivingRefreshDays: true, drivingProcedureText: true, drivingProcedureUpdatedAt: true },
  });
  const drivingRefreshDays = battalion?.drivingRefreshDays ?? 180;

  const [licenseTypes, soldiers, vehicleItemTypes, vehicleTypeLicenses] = await Promise.all([
    prisma.drivingLicenseType.findMany({
      where: { battalionId: bId, active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.soldier.findMany({
      where: { battalionId: bId, status: { notIn: ["DISCHARGED", "INACTIVE"] } },
      orderBy: [{ company: { name: "asc" } }, { fullName: "asc" }],
      select: {
        id: true, fullName: true, telegramChatId: true,
        drivingRefresherDate: true, drivingProcedureSignedAt: true,
        civilianLicenseExpiry: true, driverFileApprovedAt: true,
        company: { select: { name: true } },
        squad: { select: { name: true } },
        drivingLicenses: { select: { licenseTypeId: true } },
        driverForms: { select: { formType: true, validUntil: true } },
      },
    }),
    prisma.itemType.findMany({
      where: {
        battalionId: bId,
        active: true,
        category: { warehouseType: "VEHICLES" },
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.vehicleTypeLicense.findMany({
      where: { itemType: { battalionId: bId } },
      select: { id: true, itemTypeId: true, licenseTypeId: true },
    }),
  ]);

  const [withPhoto, validities] = await Promise.all([
    prisma.soldier.findMany({ where: { battalionId: bId, licensePhotoData: { not: null } }, select: { id: true } }),
    prisma.driverFormValidity.findMany({ where: { battalionId: bId }, select: { formType: true, validityDays: true } }),
  ]);
  const photoSet = new Set(withPhoto.map((s) => s.id));
  const valMap = new Map(validities.map((v) => [v.formType, v.validityDays]));

  const TABS = [
    { key: "soldiers", label: "רשיונות והיתרים" },
    { key: "procedure", label: "📝 נוהל נהיגה" },
    { key: "types", label: "סוגי הרשאות" },
    { key: "vehicles", label: "שיוך רכבים" },
    { key: "driverfile", label: "📁 תיק נהג — הגדרות" },
  ] as const;

  return (
    <div>
      <PageHeader
        title="הרשאות נהיגה"
        subtitle={`${soldiers.length} חיילים · ${licenseTypes.length} סוגי הרשאות · ${vehicleItemTypes.length} סוגי רכב`}
      />

      <div className="flex gap-1 mb-4 border-b border-slate-200">
        {TABS.map((t) => (
          <a
            key={t.key}
            href={`?tab=${t.key}`}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
              tab === t.key
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
          </a>
        ))}
      </div>

      {tab === "types" && canManageTypes && (
        <>
        <RefreshDaysSettings currentDays={drivingRefreshDays} action={updateRefreshDays} />
        <CrudSection
          title="סוגי הרשאות"
          addLabel="סוג הרשאה"
          fields={[{ name: "name", label: "שם (למשל: B, C1, רכב קרבי)" }]}
          saveAction={saveLicenseType}
          deleteAction={toggleLicenseType}
          rows={licenseTypes.map((lt) => ({
            id: lt.id,
            values: { name: lt.name },
            display: <span className="font-medium">{lt.name}</span>,
          }))}
        />
        </>
      )}

      {tab === "vehicles" && (
        <VehicleTypeLicenseEditor
          vehicleTypes={vehicleItemTypes}
          licenseTypes={licenseTypes.map((lt) => ({ id: lt.id, name: lt.name }))}
          existing={vehicleTypeLicenses}
          canEdit={canEditLicenses}
        />
      )}

      {tab === "procedure" && (
        <ProcedureTextForm current={battalion?.drivingProcedureText ?? ""} action={saveDrivingProcedureText} canEdit={canEditLicenses} />
      )}

      {tab === "soldiers" && (
        <LicenseEditor
          soldiers={soldiers.map((s) => ({
            id: s.id,
            fullName: s.fullName,
            companyName: s.company?.name ?? null,
            squadName: s.squad?.name ?? null,
            drivingRefresherDate: s.drivingRefresherDate
              ? s.drivingRefresherDate.toISOString().slice(0, 10)
              : null,
            procedureSignedAt: s.drivingProcedureSignedAt ? s.drivingProcedureSignedAt.toISOString() : null,
            telegramLinked: !!s.telegramChatId,
            licenses: s.drivingLicenses.map((dl) => ({ licenseTypeId: dl.licenseTypeId })),
            driverFile: (() => {
              const now = Date.now();
              const formsDone = s.driverForms.length;
              const hasPhoto = photoSet.has(s.id);
              const done = formsDone + (hasPhoto ? 1 : 0);
              const anyExpired = s.driverForms.some((f) => f.validUntil && f.validUntil.getTime() < now)
                || (!!s.civilianLicenseExpiry && s.civilianLicenseExpiry.getTime() < now);
              return { done, total: 4, approved: !!s.driverFileApprovedAt, anyExpired };
            })(),
          }))}
          licenseTypes={licenseTypes.map((lt) => ({ id: lt.id, name: lt.name, kind: lt.kind }))}
          canEdit={canEditLicenses}
          drivingRefreshDays={drivingRefreshDays}
          hasProcedureText={!!battalion?.drivingProcedureText}
          procedureUpdatedAt={battalion?.drivingProcedureUpdatedAt ? battalion.drivingProcedureUpdatedAt.toISOString() : null}
        />
      )}

      {tab === "driverfile" && (
        <DriverFileSettings
          validities={FORM_ORDER.map((ft) => ({ formType: ft, title: FORM_TITLES[ft], days: valMap.get(ft) ?? DEFAULT_VALIDITY_DAYS[ft] }))}
          canEdit={canEditLicenses}
        />
      )}
    </div>
  );
}
