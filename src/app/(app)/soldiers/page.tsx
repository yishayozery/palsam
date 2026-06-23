import { requireCapability } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader, Badge } from "@/components/ui";
import CrudSection from "@/components/CrudSection";
import ImportExcel from "@/components/ImportExcel";
import { saveSoldier, toggleSoldier, saveCompanyRole, toggleCompanyRole, saveSquad, toggleSquad } from "./actions";
import { importSoldiers } from "./import-actions";
import SoldierEquipmentButton from "./SoldierEquipmentButton";
import CompanyFilter from "./CompanyFilter";

export const dynamic = "force-dynamic";

export default async function SoldiersPage({
  searchParams,
}: {
  searchParams: Promise<{ companyId?: string }>;
}) {
  const user = await requireCapability("company.manage");
  const bId = user.battalionId!;
  const sp = await searchParams;

  const companies = await prisma.holder.findMany({
    where: { battalionId: bId, kind: "COMPANY", active: true },
    orderBy: { name: "asc" },
  });

  // holderId = פלוגה (COMPANY_REP) או מחסן (WAREHOUSE_MANAGER)
  // נבדוק אם ה-holderId הוא באמת פלוגה
  const isCompanyHolder = user.holderId ? companies.some((c) => c.id === user.holderId) : false;

  // מפ"ר רואה רק את הפלוגה שלו; מפ"מ/קצין מחסן בוחרים פלוגה מ-dropdown
  // קצין מחסן עם squadIds — לא מסננים לפי פלוגה, רק לפי מחלקה
  const effectiveCompanyId = isCompanyHolder
    ? user.holderId
    : (user.squadIds.length > 0
      ? null
      : (sp.companyId && companies.some((c) => c.id === sp.companyId) ? sp.companyId : companies[0]?.id));

  const squadFilter = user.squadIds.length > 0 ? { squadId: { in: user.squadIds } } : {};
  const companyFilter = effectiveCompanyId ? { companyId: effectiveCompanyId } : {};
  const where = { battalionId: bId, ...companyFilter, ...squadFilter };

  const battalion = await prisma.battalion.findUnique({
    where: { id: bId },
    select: { drivingRefreshDays: true },
  });
  const drivingRefreshDays = battalion?.drivingRefreshDays ?? 180;

  const [soldiers, squads, companyRoles] = await Promise.all([
    prisma.soldier.findMany({
      where,
      orderBy: [{ squad: { sortOrder: "asc" } }, { fullName: "asc" }],
      include: {
        company: true,
        squad: true,
        companyRole: true,
        drivingLicenses: { include: { licenseType: { select: { name: true } } } },
        _count: { select: { signedSerialUnits: true, signedKitInstances: true } },
      },
    }),
    prisma.squad.findMany({
      where: {
        battalionId: bId,
        ...(effectiveCompanyId ? { companyId: effectiveCompanyId } : {}),
        ...(user.squadIds.length > 0 ? { id: { in: user.squadIds } } : {}),
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { company: { select: { name: true } } },
    }),
    prisma.companyRole.findMany({
      where: { battalionId: bId, active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
  ]);

  const soldierIds = soldiers.map((s) => s.id);

  // 🆕 ציוד סריאלי חתום פר חייל + תאריך + מי חתם (מתעודת SIGNOUT האחרונה שמכילה את היחידה)
  const signedSerialsRaw = soldierIds.length === 0 ? [] : await prisma.serialUnit.findMany({
    where: { battalionId: bId, signedSoldierId: { in: soldierIds } },
    include: {
      itemType: { select: { name: true, sku: true } },
      status: true,
      currentHolder: { select: { name: true } },
    },
  });
  // למצוא לכל יחידה את תעודת ה-SIGNOUT האחרונה
  const signedSerialIds = signedSerialsRaw.map((u) => u.id);
  const signoutLines = signedSerialIds.length === 0 ? [] : await prisma.transferLine.findMany({
    where: {
      serialUnitId: { in: signedSerialIds },
      transfer: { type: "SIGNOUT", status: "COMPLETED" },
    },
    include: { transfer: { select: { createdAt: true, createdBy: { select: { fullName: true } }, toSoldierId: true } } },
    orderBy: { transfer: { createdAt: "desc" } },
  });
  const lastSignByUnit = new Map<string, { at: Date; by: string }>();
  for (const l of signoutLines) {
    if (!l.serialUnitId) continue;
    if (!lastSignByUnit.has(l.serialUnitId)) {
      lastSignByUnit.set(l.serialUnitId, { at: l.transfer.createdAt, by: l.transfer.createdBy.fullName });
    }
  }

  // קיבוץ סריאלי לפי חייל
  const serialsBySoldier = new Map<string, Array<{
    id: string; itemName: string; sku: string | null; serialNumber: string; lotQuantity: number | null;
    statusName: string; isWear: boolean; isLoss: boolean;
    signedAt: string | null; signedBy: string | null; currentHolderName: string | null;
  }>>();
  for (const u of signedSerialsRaw) {
    if (!u.signedSoldierId) continue;
    const meta = lastSignByUnit.get(u.id);
    const arr = serialsBySoldier.get(u.signedSoldierId) ?? [];
    arr.push({
      id: u.id, itemName: u.itemType.name, sku: u.itemType.sku,
      serialNumber: u.serialNumber, lotQuantity: u.lotQuantity,
      statusName: u.status.name, isWear: u.status.isWear, isLoss: u.status.isLoss,
      signedAt: meta?.at.toISOString() ?? null,
      signedBy: meta?.by ?? null,
      currentHolderName: u.currentHolder?.name ?? null,
    });
    serialsBySoldier.set(u.signedSoldierId, arr);
  }

  // 🆕 ציוד כמותי חתום: SIGNOUT-CHECKIN פר (חייל, פריט, סטטוס)
  const qtyLines = soldierIds.length === 0 ? [] : await prisma.transferLine.findMany({
    where: {
      transfer: {
        battalionId: bId, status: "COMPLETED",
        type: { in: ["SIGNOUT", "CHECKIN"] },
        toSoldierId: { in: soldierIds },
      },
      serialUnitId: null,
    },
    include: {
      itemType: { select: { name: true, sku: true, unit: true } },
      status: true,
      transfer: { select: { type: true, toSoldierId: true, createdAt: true, createdBy: { select: { fullName: true } } } },
    },
    orderBy: { transfer: { createdAt: "desc" } },
  });
  type QtyAcc = { itemTypeId: string; itemName: string; sku: string | null; unit: string;
    statusName: string; quantity: number; lastSignedAt: string | null; lastSignedBy: string | null };
  const qtyBySoldier = new Map<string, Map<string, QtyAcc>>();
  for (const l of qtyLines) {
    const sId = l.transfer.toSoldierId;
    if (!sId || !l.status) continue;
    const map = qtyBySoldier.get(sId) ?? new Map<string, QtyAcc>();
    const key = `${l.itemTypeId}|${l.statusId}`;
    const sign = l.transfer.type === "SIGNOUT" ? 1 : -1;
    const cur = map.get(key);
    if (cur) {
      cur.quantity += sign * l.quantity;
    } else {
      map.set(key, {
        itemTypeId: l.itemTypeId, itemName: l.itemType.name, sku: l.itemType.sku, unit: l.itemType.unit,
        statusName: l.status.name, quantity: sign * l.quantity,
        // הראשון שמתבצע ב-orderBy desc - לכן זה החדש
        lastSignedAt: l.transfer.type === "SIGNOUT" ? l.transfer.createdAt.toISOString() : null,
        lastSignedBy: l.transfer.type === "SIGNOUT" ? l.transfer.createdBy.fullName : null,
      });
    }
    qtyBySoldier.set(sId, map); // 🐛 fix: ה-map לא נשמר חזרה במפה הראשית — לכן ציוד כמותי לא הוצג
  }

  const fields = [
    { name: "fullName", label: "שם מלא" },
    { name: "personalNumber", label: "מספר אישי" },
    { name: "phone", label: "טלפון" },
    ...(squads.length > 0
      ? [{
          name: "squadId",
          label: "מחלקה",
          type: "select" as const,
          options: squads.map((sq) => ({
            value: sq.id,
            label: user.holderId ? sq.name : `${sq.name} (${sq.company.name})`,
          })),
        }]
      : [{ name: "platoon", label: "מחלקה" }]),
    ...(companyRoles.length > 0
      ? [{
          name: "companyRoleId",
          label: "תפקיד",
          type: "select" as const,
          options: companyRoles.map((r) => ({
            value: r.id,
            label: r.isCommander ? `${r.name} ⭐` : r.name,
          })),
        }]
      : []),
    ...(user.holderId
      ? []
      : [{
          name: "companyId",
          label: "פלוגה",
          type: "select" as const,
          options: companies.map((c) => ({ value: c.id, label: c.name })),
        }]),
  ];

  return (
    <div>
      <PageHeader
        title="חיילים"
        subtitle="לחץ '🪖 ציוד חתום' ליד כל חייל לפירוט הציוד, התאריכים ומי החתים"
        action={<ImportExcel action={importSoldiers} templateHref="/soldiers/template" label="ייבוא חיילים" />}
      />
      {!isCompanyHolder && user.squadIds.length === 0 && companies.length > 0 && effectiveCompanyId && (
        <CompanyFilter companies={companies} selectedId={effectiveCompanyId} />
      )}
      <CrudSection
        title="רשימת חיילים"
        addLabel="חייל"
        fields={fields}
        saveAction={saveSoldier}
        deleteAction={toggleSoldier}
        rows={soldiers.map((s) => {
          const serials = serialsBySoldier.get(s.id) ?? [];
          const qtyMap = qtyBySoldier.get(s.id);
          const qty = qtyMap ? Array.from(qtyMap.values()).filter((q) => q.quantity > 0) : [];
          return {
            id: s.id,
            values: {
              fullName: s.fullName,
              personalNumber: s.personalNumber ?? "",
              phone: s.phone ?? "",
              squadId: s.squadId ?? "",
              platoon: s.platoon ?? "",
              companyRoleId: s.companyRoleId ?? "",
              companyId: s.companyId ?? "",
            },
            display: (
              <span className="flex items-center gap-2 flex-wrap">
                <span className="font-medium">{s.fullName}</span>
                <span className="font-mono text-xs text-slate-400">{s.personalNumber}</span>
                {(s.squad?.name || s.platoon) && <Badge className="bg-indigo-100 text-indigo-700">{s.squad?.name ?? s.platoon}</Badge>}
                {s.companyRole && <Badge className={s.companyRole.isCommander ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"}>{s.companyRole.name}{s.companyRole.isCommander ? " ⭐" : ""}</Badge>}
                {s.company && <Badge>{s.company.name}</Badge>}
                {s.drivingLicenses.length > 0 && (
                  <Badge className="bg-green-100 text-green-700">🪪 {s.drivingLicenses.map((dl) => dl.licenseType.name).join(", ")}</Badge>
                )}
                {s.drivingLicenses.length > 0 && (() => {
                  const rd = s.drivingRefresherDate;
                  if (!rd) return <Badge className="bg-rose-100 text-rose-700">ריענון נהיגה</Badge>;
                  const expiry = new Date(rd);
                  expiry.setDate(expiry.getDate() + drivingRefreshDays);
                  const daysLeft = Math.ceil((expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                  if (daysLeft <= 30) return <Badge className={daysLeft < 0 ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}>ריענון נהיגה</Badge>;
                  return null;
                })()}
                <SoldierEquipmentButton
                  soldierId={s.id} soldierName={s.fullName}
                  signedSerials={serials} signedQty={qty}
                />
                {(s.status === "DISCHARGED" || s.status === "INACTIVE") && <Badge className="bg-rose-100 text-rose-700">לא פעיל</Badge>}
              </span>
            ),
          };
        })}
      />

      <CrudSection
        title="מחלקות"
        addLabel="מחלקה"
        fields={[
          { name: "name", label: "שם מחלקה" },
          { name: "sortOrder", label: "סדר", type: "number" as const },
          ...(user.holderId
            ? []
            : [{
                name: "companyId",
                label: "פלוגה",
                type: "select" as const,
                options: companies.map((c) => ({ value: c.id, label: c.name })),
              }]),
        ]}
        saveAction={saveSquad}
        deleteAction={toggleSquad}
        rows={squads.map((sq) => ({
          id: sq.id,
          values: {
            name: sq.name,
            sortOrder: String(sq.sortOrder),
            companyId: sq.companyId,
          },
          display: (
            <span className="flex items-center gap-2">
              <span className="font-medium">{sq.name}</span>
              {!user.holderId && <Badge>{sq.company.name}</Badge>}
            </span>
          ),
        }))}
      />

      <CrudSection
        title="תפקידים בפלוגה"
        addLabel="תפקיד"
        fields={[
          { name: "name", label: "שם התפקיד" },
          { name: "isCommander", label: "פיקודי", type: "checkbox" as const },
          { name: "sortOrder", label: "סדר", type: "number" as const },
        ]}
        saveAction={saveCompanyRole}
        deleteAction={toggleCompanyRole}
        rows={companyRoles.map((r) => ({
          id: r.id,
          values: { name: r.name, isCommander: r.isCommander, sortOrder: String(r.sortOrder) },
          display: (
            <span className="flex items-center gap-2">
              <span className="font-medium">{r.name}</span>
              {r.isCommander && <Badge className="bg-amber-100 text-amber-800">⭐ פיקודי</Badge>}
            </span>
          ),
        }))}
      />
    </div>
  );
}
