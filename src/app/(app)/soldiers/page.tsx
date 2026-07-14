import { requireCapability } from "@/lib/guard";
import { canEdit } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { resolveHolderKinds } from "@/lib/scope";
import { PageHeader, Badge } from "@/components/ui";
import CrudSection from "@/components/CrudSection";
import ImportExcel from "@/components/ImportExcel";
import { saveCompanyRole, toggleCompanyRole, saveSquad, toggleSquad } from "./actions";
import { importSoldiers } from "./import-actions";
import AttachmentRequestSection from "./AttachmentRequestSection";
import PeopleTabs from "@/components/PeopleTabs";
import SoldiersTable, { type SoldierRow } from "./SoldiersTable";

export const dynamic = "force-dynamic";

export default async function SoldiersPage() {
  const user = await requireCapability("company.manage");
  const bId = user.battalionId!;

  const companies = await prisma.holder.findMany({
    where: { battalionId: bId, kind: "COMPANY", active: true },
    orderBy: { name: "asc" },
  });

  // סקופ פלוגתי לפי סוג ה-holders (הרשאות כפולות): משתמש מוסמך לפלוגה/ות רואה אותן,
  // בין אם הוא נציג פלוגה ובין אם מנהל מחסן שמשויך גם לפלוגה. מטה/אדמין — כל הפלוגות.
  const { companyHolderIds } = await resolveHolderKinds(user);
  const scopeCompanyIds = companyHolderIds;
  const showCompany = scopeCompanyIds.length !== 1; // עמודת פלוגה מוצגת אם לא מוגבל לפלוגה אחת
  const companyInWhere = scopeCompanyIds.length > 0 ? { companyId: { in: scopeCompanyIds } } : {};

  const squadFilter = user.squadIds.length > 0 ? { squadId: { in: user.squadIds } } : {};
  const where = { battalionId: bId, ...companyInWhere, ...squadFilter };

  const battalion = await prisma.battalion.findUnique({
    where: { id: bId },
    select: { drivingRefreshDays: true, telegramBotUsername: true },
  });
  const drivingRefreshDays = battalion?.drivingRefreshDays ?? 180;

  const [soldiers, squads, companyRoles, certTypes, attachmentRequests] = await Promise.all([
    prisma.soldier.findMany({
      where,
      orderBy: [{ squad: { sortOrder: "asc" } }, { fullName: "asc" }],
      select: {
        id: true, fullName: true, personalNumber: true, phone: true, platoon: true, status: true,
        telegramChatId: true, drivingRefresherDate: true, dutyRound: true, isAttendanceReporter: true, dietType: true,
        companyId: true, squadId: true, companyRoleId: true,
        company: true,
        squad: true,
        companyRole: true,
        drivingLicenses: { include: { licenseType: { select: { name: true } } } },
        certifications: { select: { certificationTypeId: true } },
        callupPeriods: { where: { endDate: null }, select: { id: true }, take: 1 },
        _count: { select: { signedSerialUnits: true, signedKitInstances: true } },
      },
    }),
    prisma.squad.findMany({
      where: {
        battalionId: bId,
        ...(scopeCompanyIds.length > 0 ? { companyId: { in: scopeCompanyIds } } : {}),
        ...(user.squadIds.length > 0 ? { id: { in: user.squadIds } } : {}),
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { company: { select: { name: true } } },
    }),
    prisma.companyRole.findMany({
      where: {
        battalionId: bId,
        active: true,
        ...(scopeCompanyIds.length > 0 ? { companyId: { in: scopeCompanyIds } } : {}),
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { company: { select: { name: true } } },
    }),
    prisma.certificationType.findMany({
      where: { battalionId: bId, active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
    prisma.attachmentRequest.findMany({
      where: { battalionId: bId },
      orderBy: { requestedAt: "desc" },
      include: {
        targetCompany: { select: { name: true } },
        requestedBy: { select: { fullName: true } },
        statusLog: {
          orderBy: { changedAt: "asc" },
          include: { changedBy: { select: { fullName: true } } },
        },
      },
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

  // 🆕 ארגזים מבצעיים ISSUED לכל חייל
  const issuedKits = soldierIds.length === 0 ? [] : await prisma.operationalKit.findMany({
    where: { assignedSoldierId: { in: soldierIds }, status: "ISSUED", active: true },
    include: {
      items: { include: { itemType: { select: { name: true, sku: true } } } },
    },
  });
  const kitsBySoldier = new Map<string, Array<{ kitName: string; kitNumber: string | null; items: { name: string; sku: string | null; qty: number }[] }>>();
  for (const k of issuedKits) {
    if (!k.assignedSoldierId) continue;
    const arr = kitsBySoldier.get(k.assignedSoldierId) ?? [];
    arr.push({
      kitName: k.name,
      kitNumber: k.kitNumber,
      items: k.items.map((i) => ({ name: i.itemType.name, sku: i.itemType.sku, qty: i.quantity })),
    });
    kitsBySoldier.set(k.assignedSoldierId, arr);
  }

  function drivingStatus(hasLicenses: boolean, rd: Date | null): SoldierRow["drivingStatus"] {
    if (!hasLicenses) return "none";
    if (!rd) return "missing";
    const expiry = new Date(rd);
    expiry.setDate(expiry.getDate() + drivingRefreshDays);
    const daysLeft = Math.ceil((expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (daysLeft < 0) return "expired";
    if (daysLeft <= 30) return "warning";
    return "ok";
  }

  const rows: SoldierRow[] = soldiers.map((s) => {
    const serials = serialsBySoldier.get(s.id) ?? [];
    const qtyMap = qtyBySoldier.get(s.id);
    const qty = qtyMap ? Array.from(qtyMap.values()).filter((q) => q.quantity > 0) : [];
    return {
      id: s.id,
      fullName: s.fullName,
      personalNumber: s.personalNumber ?? "",
      phone: s.phone ?? "",
      companyId: s.companyId ?? "",
      companyName: s.company?.name ?? null,
      squadId: s.squadId ?? "",
      squadName: s.squad?.name ?? s.platoon ?? null,
      companyRoleId: s.companyRoleId ?? "",
      roleName: s.companyRole?.name ?? null,
      isCommander: s.companyRole?.isCommander ?? false,
      dutyRound: s.dutyRound ?? null,
      dietType: s.dietType ?? null,
      isAttendanceReporter: s.isAttendanceReporter,
      certIds: s.certifications.map((c) => c.certificationTypeId),
      drivingNames: s.drivingLicenses.map((dl) => dl.licenseType.name),
      drivingStatus: drivingStatus(s.drivingLicenses.length > 0, s.drivingRefresherDate),
      drivingRefresherDate: s.drivingRefresherDate ? s.drivingRefresherDate.toISOString().slice(0, 10) : null,
      telegramLinked: !!s.telegramChatId,
      inactive: s.status === "DISCHARGED" || s.status === "INACTIVE",
      hasOpenCallup: s.callupPeriods.length > 0,
      signedSerials: serials,
      signedQty: qty,
      issuedKits: kitsBySoldier.get(s.id) ?? [],
    };
  });

  // הצמדת הסמכות לחייל נעשית ע"י מי שמנהל את החיילים (מפ/מפמ/אדמין) — הרשאת עריכה על מסך חיילים.
  const canEditCerts = canEdit(user, "soldiers");
  const squadOpts = squads.map((sq) => ({ id: sq.id, name: showCompany ? `${sq.name} · ${sq.company.name}` : sq.name, companyId: sq.companyId }));
  const roleOpts = companyRoles.map((r) => ({ id: r.id, name: r.name, companyId: r.companyId ?? null, isCommander: r.isCommander }));

  return (
    <div>
      <PageHeader
        helpKey="soldiers"
        title="חיילים"
        subtitle="לחץ '🪖 ציוד חתום' ליד כל חייל לפירוט הציוד, התאריכים ומי החתים"
        action={<ImportExcel action={importSoldiers} templateHref="/soldiers/template" label="ייבוא חיילים" />}
      />
      <PeopleTabs active="soldiers" />

      <AttachmentRequestSection
        companies={companies.map((c) => ({ id: c.id, name: c.name }))}
        requests={attachmentRequests.map((r) => ({
          id: r.id,
          soldierName: r.soldierName,
          personalNumber: r.personalNumber,
          sourceUnit: r.sourceUnit,
          targetCompany: r.targetCompany?.name ?? null,
          fromDate: r.fromDate?.toISOString().slice(0, 10) ?? "",
          toDate: r.toDate?.toISOString().slice(0, 10) ?? "",
          fullEmployment: !!r.fromDate && !!r.toDate && r.fromDate.getFullYear() <= 2020 && r.toDate.getFullYear() >= 2099,
          status: r.status,
          requestedAt: r.requestedAt.toISOString(),
          notes: r.notes,
          statusLog: r.statusLog.map((l) => ({
            status: l.status,
            note: l.note,
            changedBy: l.changedBy.fullName,
            changedAt: l.changedAt.toISOString(),
          })),
        }))}
      />

      <SoldiersTable
        soldiers={rows}
        certTypes={certTypes}
        companyRoles={roleOpts}
        squads={squadOpts}
        companies={companies.map((c) => ({ id: c.id, name: c.name }))}
        showCompany={showCompany}
        canEditCerts={canEditCerts}
        botUsername={battalion?.telegramBotUsername ?? null}
      />

      <div className="mt-6" />

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
          ...(user.holderId
            ? []
            : [{
                name: "companyId",
                label: "פלוגה",
                type: "select" as const,
                options: companies.map((c) => ({ value: c.id, label: c.name })),
              }]),
        ]}
        saveAction={saveCompanyRole}
        deleteAction={toggleCompanyRole}
        rows={companyRoles.map((r) => ({
          id: r.id,
          values: {
            name: r.name,
            isCommander: r.isCommander,
            sortOrder: String(r.sortOrder),
            companyId: r.companyId ?? "",
          },
          display: (
            <span className="flex items-center gap-2">
              <span className="font-medium">{r.name}</span>
              {r.isCommander && <Badge className="bg-amber-100 text-amber-800">⭐ פיקודי</Badge>}
              {!user.holderId && r.company && <Badge>{r.company.name}</Badge>}
            </span>
          ),
        }))}
      />
    </div>
  );
}
