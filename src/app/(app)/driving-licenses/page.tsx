import { requireUser } from "@/lib/guard";
import { can } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import CrudSection from "@/components/CrudSection";
import { saveLicenseType, toggleLicenseType, updateRefreshDays } from "./actions";
import LicenseEditor from "./LicenseEditor";
import VehicleTypeLicenseEditor from "./VehicleTypeLicenseEditor";
import RefreshDaysSettings from "./RefreshDaysSettings";

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
    select: { drivingRefreshDays: true },
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
      include: {
        company: { select: { name: true } },
        squad: { select: { name: true } },
        drivingLicenses: { select: { licenseTypeId: true } },
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

  const TABS = [
    { key: "soldiers", label: "הרשאות פר חייל" },
    { key: "types", label: "סוגי הרשאות" },
    { key: "vehicles", label: "שיוך רכבים" },
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
            licenses: s.drivingLicenses.map((dl) => ({
              licenseTypeId: dl.licenseTypeId,
            })),
          }))}
          licenseTypes={licenseTypes.map((lt) => ({ id: lt.id, name: lt.name }))}
          canEdit={canEditLicenses}
          drivingRefreshDays={drivingRefreshDays}
        />
      )}
    </div>
  );
}
