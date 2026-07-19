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
import FuelCardsManager from "./FuelCardsManager";
import FuelCardsClient from "../requests/FuelCardsClient";
import AccidentsClient from "../accidents/AccidentsClient";
import VehicleLinksManager from "./VehicleLinksManager";
import { FORM_ORDER, FORM_TITLES, DEFAULT_VALIDITY_DAYS } from "@/lib/driverForms";

export const dynamic = "force-dynamic";

export default async function DrivingLicensesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await requireUser();
  // מסך קצין הרכב — נגיש גם לבעלי driving_licenses (לא רק dispatch.manage), כדי שהמסך הכפול של הדלק לא יקרוס
  if (!(can(user, "dispatch.manage") || can(user, "driving_licenses") || can(user, "battalion.profile") || user.isAdmin)) redirect("/dashboard");
  const bId = user.battalionId!;
  const { tab = "soldiers" } = await searchParams;

  const isAdmin = can(user, "battalion.profile");
  const isVehicleOfficer = user.role === "WAREHOUSE_MANAGER";
  // המסך כולו מאחורי dispatch.manage — כל מי שנכנס אליו (קצין רכב) יכול לנהל סוגי הרשאות ורישיונות
  const canManage = isAdmin || isVehicleOfficer || can(user, "dispatch.manage");
  const canManageTypes = canManage;
  const canEditLicenses = canManage;

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
    prisma.soldier.findMany({ where: { battalionId: bId, civilianLicenseFrontData: { not: null } }, select: { id: true } }),
    prisma.driverFormValidity.findMany({ where: { battalionId: bId }, select: { formType: true, validityDays: true } }),
  ]);
  const photoSet = new Set(withPhoto.map((s) => s.id));
  const valMap = new Map(validities.map((v) => [v.formType, v.validityDays]));

  const fuelCards = tab === "fuelcards"
    ? (await prisma.vehicleFuelCard.findMany({
        where: { battalionId: bId },
        orderBy: [{ returnedAt: "asc" }, { checkoutAt: "desc" }], take: 300,
        select: { id: true, cardNumber: true, checkoutAt: true, returnedAt: true, note: true, signatureData: true, signedAt: true, signLinkSentAt: true, soldier: { select: { id: true, fullName: true, telegramChatId: true } } },
      })).map((c) => ({ id: c.id, cardNumber: c.cardNumber, soldierId: c.soldier.id, soldierName: c.soldier.fullName, soldierConnected: !!c.soldier.telegramChatId, checkoutAt: c.checkoutAt.toISOString(), returnedAt: c.returnedAt ? c.returnedAt.toISOString() : null, note: c.note, signed: !!c.signatureData, signLinkSentAt: c.signLinkSentAt ? c.signLinkSentAt.toISOString() : null }))
    : [];
  // ⛽ כרטיסי דלק שהחטיבה הקצתה לגדוד — לחתימת קצין הרכב (אותו רכיב כמו במסך הדרישות של המפמ)
  const brigadeFuelCardsRaw = tab === "fuelcards"
    ? await prisma.brigadeFuelCard.findMany({
        where: { allocatedBattalionId: bId },
        select: { id: true, cardNumber: true, label: true, status: true, allocatedBattalionId: true, allocatedName: true, signedByName: true, signedByPersonal: true, signedAt: true },
        orderBy: { createdAt: "asc" }, take: 1000,
      })
    : [];
  const brigadeFuelCards = brigadeFuelCardsRaw.map((c) => ({ ...c, signedAt: c.signedAt?.toISOString() ?? null }));
  const vehicleLinks = tab === "links"
    ? await prisma.vehicleLink.findMany({ where: { battalionId: bId }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, url: true, visibleToSoldier: true } })
    : [];
  const soldierOpts = soldiers.map((s) => ({ id: s.id, name: s.fullName }));

  const accidentReports = tab === "accidents"
    ? await prisma.accidentReport.findMany({
        where: { battalionId: bId }, orderBy: { createdAt: "desc" }, take: 100,
        select: { id: true, type: true, status: true, createdAt: true, location: true, ourVehiclePlate: true, driverName: true, _count: { select: { photos: true } } },
      })
    : [];

  const TABS = [
    { key: "soldiers", label: "רשיונות והיתרים" },
    { key: "types", label: "סוגי הרשאות" },
    { key: "vehicles", label: "שיוך רכבים" },
    { key: "fuelcards", label: "⛽ כרטיסי דלק" },
    { key: "accidents", label: "🚧 דיווחי תאונה" },
    { key: "links", label: "🔗 קישורים" },
    { key: "driverfile", label: "📁 תיק נהג" },
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

      {tab === "fuelcards" && (
        <div className="space-y-6">
          {/* כרטיסי דלק שהחטיבה הקצתה לגדוד — קצין הרכב חותם על קבלה (שם+מ"א+חתימה) */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-2">⛽ כרטיסי דלק מהחטיבה — לחתימת קבלה</h3>
            <FuelCardsClient mode="battalion" cards={brigadeFuelCards} childBattalions={[]} />
          </div>
          {/* משיכת כרטיסי דלק לחיילים (פנימי לגדוד) */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-2">🚗 משיכת כרטיסים לחיילים</h3>
            <FuelCardsManager cards={fuelCards} soldiers={soldierOpts} />
          </div>
        </div>
      )}

      {tab === "accidents" && (
        <AccidentsClient
          reports={accidentReports.map((r) => ({
            id: r.id, type: r.type, status: r.status,
            createdAt: r.createdAt.toISOString(),
            location: r.location, plate: r.ourVehiclePlate, driver: r.driverName,
            photos: r._count.photos,
          }))}
        />
      )}

      {tab === "links" && <VehicleLinksManager links={vehicleLinks} />}

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
        <div className="space-y-4">
          <DriverFileSettings
            validities={FORM_ORDER.map((ft) => ({ formType: ft, title: FORM_TITLES[ft], days: valMap.get(ft) ?? DEFAULT_VALIDITY_DAYS[ft] }))}
            canEdit={canEditLicenses}
          />
          <ProcedureTextForm current={battalion?.drivingProcedureText ?? ""} action={saveDrivingProcedureText} canEdit={canEditLicenses} />
        </div>
      )}
    </div>
  );
}
