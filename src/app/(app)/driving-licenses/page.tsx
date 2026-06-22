import { requireUser } from "@/lib/guard";
import { can } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import CrudSection from "@/components/CrudSection";
import { saveLicenseType, toggleLicenseType } from "./actions";
import LicenseEditor from "./LicenseEditor";

export const dynamic = "force-dynamic";

export default async function DrivingLicensesPage() {
  const user = await requireUser();
  if (!can(user.role, "dispatch.manage")) redirect("/dashboard");
  const bId = user.battalionId!;

  const isAdmin = can(user.role, "battalion.profile");
  const isVehicleOfficer = user.role === "WAREHOUSE_MANAGER";
  const canManageTypes = isAdmin || isVehicleOfficer;
  const canEditLicenses = isAdmin || isVehicleOfficer;

  const [licenseTypes, soldiers] = await Promise.all([
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
        drivingLicenses: { select: { licenseTypeId: true, refresherDate: true } },
      },
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="הרשאות נהיגה"
        subtitle={`${soldiers.length} חיילים · ${licenseTypes.length} סוגי הרשאות`}
      />

      {canManageTypes && (
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
      )}

      <div className="mt-6">
        <h3 className="text-lg font-bold mb-3">הרשאות פר חייל</h3>
        <LicenseEditor
          soldiers={soldiers.map((s) => ({
            id: s.id,
            fullName: s.fullName,
            companyName: s.company?.name ?? null,
            squadName: s.squad?.name ?? null,
            licenses: s.drivingLicenses.map((dl) => ({
              licenseTypeId: dl.licenseTypeId,
              refresherDate: dl.refresherDate ? dl.refresherDate.toISOString().slice(0, 10) : null,
            })),
          }))}
          licenseTypes={licenseTypes.map((lt) => ({ id: lt.id, name: lt.name }))}
          canEdit={canEditLicenses}
        />
      </div>
    </div>
  );
}
