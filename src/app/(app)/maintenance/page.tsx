import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card } from "@/components/ui";
import { findTanaHolder } from "@/lib/tana";
import ReturnFromTanaModal from "./ReturnFromTanaModal";
import ExcludeOfficerToggle from "./ExcludeOfficerToggle";
import MaintenanceTabs, { type VehRow, type TypeRow, type VehHist } from "./MaintenanceTabs";

export const dynamic = "force-dynamic";

export default async function MaintenancePage({
  searchParams,
}: {
  searchParams: Promise<{ excludeOfficer?: string }>;
}) {
  const user = await requireUser();
  const bId = user.battalionId!;
  if (!bId) redirect("/");
  const { excludeOfficer = "" } = await searchParams;
  const excludeOfficerOn = excludeOfficer === "1";

  // הרשאה: מפ"מ, קצין מחסן או רס"פ של פלוגת הטנא
  const isTanaRep = user.role === "COMPANY_REP" && user.holderId
    ? (await prisma.holder.findUnique({ where: { id: user.holderId }, select: { name: true } }))?.name?.includes("טנא")
    : false;
  const isAdmin = user.isAdmin || user.role === "WAREHOUSE_MANAGER";
  if (!isAdmin && !isTanaRep) redirect("/");

  const tana = await findTanaHolder(bId);
  if (!tana) {
    return (
      <div>
        <PageHeader title="סטטוס רכבים" subtitle="מעקב רכבים ותחזוקה" />
        <Card className="p-6 bg-amber-50 border-amber-300">
          <p className="text-sm text-amber-900">
            ⚠️ לא נמצאה פלוגת טנא בגדוד. כדי להפעיל את המודול — מפ״מ יקים פלוגה ששמה מכיל את המילה <b>טנא</b>{" "}
            ב-<Link href="/org" className="underline">/org</Link>.
          </p>
        </Card>
      </div>
    );
  }

  // ⚠️ רכבים בלבד + צבאי בלבד (לא תרומות)
  const allVehicles = await prisma.serialUnit.findMany({
    where: {
      battalionId: bId,
      dischargedAt: null,
      itemType: { category: { warehouseType: "VEHICLES" }, association: "MILITARY" },
    },
    include: {
      itemType: { include: { category: true } },
      status: true,
      currentHolder: { select: { id: true, name: true, kind: true } },
      signedSoldier: { select: { id: true, fullName: true } },
      location: { select: { column: true, row: true } },
    },
    orderBy: [{ itemType: { name: "asc" } }, { serialNumber: "asc" }],
  });

  // קצין רכב — משתמש WAREHOUSE_MANAGER עם holder.warehouseType=VEHICLES
  const vehicleOfficerUsers = await prisma.appUser.findMany({
    where: {
      battalionId: bId, role: "WAREHOUSE_MANAGER", active: true,
      holder: { warehouseType: "VEHICLES" },
    },
    select: { id: true, fullName: true, soldierId: true },
  });
  const vehicleOfficerIds = new Set(vehicleOfficerUsers.map((u) => u.id));

  // תעודות שקשורות לטנא — נשתמש לאיתור reason, repair time, "ע"י קצין רכב"
  const tanaTransfers = await prisma.transferLine.findMany({
    where: {
      serialUnitId: { in: allVehicles.map((v) => v.id) },
      transfer: {
        OR: [{ fromHolderId: tana.id }, { toHolderId: tana.id }],
      },
    },
    select: {
      serialUnitId: true,
      transfer: {
        select: {
          id: true, createdAt: true, fromHolderId: true, toHolderId: true,
          reason: true, createdById: true,
        },
      },
    },
    orderBy: { transfer: { createdAt: "desc" } },
  });

  // לכל רכב: היסטוריית תעודות (סדר יורד)
  const vehicleHistory = new Map<string, typeof tanaTransfers>();
  for (const l of tanaTransfers) {
    if (!l.serialUnitId) continue;
    const arr = vehicleHistory.get(l.serialUnitId) ?? [];
    arr.push(l);
    vehicleHistory.set(l.serialUnitId, arr);
  }

  // סיבה אחרונה לתקלה לכל רכב
  const vehicleReasons = new Map<string, string>();
  for (const [vid, hist] of vehicleHistory) {
    for (const l of hist) {
      if (l.transfer.toHolderId === tana.id && l.transfer.reason?.includes("תקלה")) {
        vehicleReasons.set(vid, l.transfer.reason);
        break; // האחרון
      }
    }
  }

  // האם רכב בטנא נשלח ע"י קצין רכב? (לפי last send-to-TANA createdById)
  const sentByOfficerSet = new Set<string>();
  for (const [vid, hist] of vehicleHistory) {
    const lastIn = hist.find((l) => l.transfer.toHolderId === tana.id);
    if (lastIn && vehicleOfficerIds.has(lastIn.transfer.createdById)) {
      sentByOfficerSet.add(vid);
    }
  }

  // החרגה (אם הצ'קבוקס הופעל) — מסירים רכבים בטנא שנשלחו ע"י קצין רכב
  const filteredVehicles = excludeOfficerOn
    ? allVehicles.filter((v) => !(v.currentHolderId === tana.id && sentByOfficerSet.has(v.id)))
    : allVehicles;

  // קיבוץ לפי סוג רכב
  type TypeStats = { typeName: string; total: number; ok: number; defectiveAtTana: number; inUse: number; signedToSoldier: number };
  const byType = new Map<string, TypeStats>();
  for (const v of filteredVehicles) {
    const typeName = v.itemType.name;
    if (!byType.has(typeName)) byType.set(typeName, { typeName, total: 0, ok: 0, defectiveAtTana: 0, inUse: 0, signedToSoldier: 0 });
    const s = byType.get(typeName)!;
    s.total++;
    const isAtTana = v.currentHolderId === tana.id;
    if (isAtTana) s.defectiveAtTana++;
    else {
      if (!v.status.isWear && !v.status.isLoss) s.ok++;
      s.inUse++;
    }
    if (v.signedSoldierId) s.signedToSoldier++;
  }

  // חישוב זמן תיקון ממוצע + ספירת רכבים שתוקנו
  // לכל רכב — מוצאים זוגות (החזרה מהטנא, השליחה האחרונה לפניה)
  let repairedCount = 0;
  let totalRepairMs = 0;
  for (const [, hist] of vehicleHistory) {
    // hist ממויין יורד; הופכים לסדר עולה לזיווג נוח
    const asc = [...hist].reverse();
    let lastSentAt: Date | null = null;
    for (const l of asc) {
      if (l.transfer.toHolderId === tana.id) {
        lastSentAt = l.transfer.createdAt;
      } else if (l.transfer.fromHolderId === tana.id && lastSentAt) {
        const ms = l.transfer.createdAt.getTime() - lastSentAt.getTime();
        if (ms > 0) {
          repairedCount++;
          totalRepairMs += ms;
        }
        lastSentAt = null;
      }
    }
  }
  const avgRepairHours = repairedCount > 0 ? Math.round((totalRepairMs / repairedCount) / 3_600_000) : 0;
  const avgRepairText = avgRepairHours < 24
    ? `${avgRepairHours} שע׳`
    : `${Math.round(avgRepairHours / 24)} ימים`;

  // סך הרכבים שכרגע בטנא (לפי הסינון)
  const totalAtTana = filteredVehicles.filter((v) => v.currentHolderId === tana.id).length;
  const totalOk = filteredVehicles.filter((v) => v.currentHolderId !== tana.id && !v.status.isWear && !v.status.isLoss).length;
  const totalDefectiveOutOfTana = filteredVehicles.filter((v) => v.currentHolderId !== tana.id && v.status.isWear).length;

  // שמות holders (למקור/יעד בהיסטוריה)
  const allHolders = await prisma.holder.findMany({ where: { battalionId: bId }, select: { id: true, name: true } });
  const holderName = new Map(allHolders.map((h) => [h.id, h.name]));

  // התרעת "חזרה מהירה" — רכב שחזר לטנא תוך פחות מ-5 ימים מהיציאה הקודמת (בעיה חוזרת)
  const RECUR_DAYS = 5;
  const recurringByVehicle = new Map<string, number>();
  type Ev = { date: Date; kind: "in" | "out"; from: string; to: string; reason: string | null; transferId: string; gapDays: number | null };
  const historyEventsByVehicle = new Map<string, Ev[]>();
  for (const [vid, hist] of vehicleHistory) {
    const asc = [...hist].reverse(); // סדר עולה לזיווג
    let lastOut: Date | null = null;
    const events: Ev[] = [];
    for (const l of asc) {
      const t = l.transfer;
      const kind: "in" | "out" = t.toHolderId === tana.id ? "in" : "out";
      let gapDays: number | null = null;
      if (kind === "in" && lastOut) {
        const days = (t.createdAt.getTime() - lastOut.getTime()) / 86400000;
        if (days >= 0 && days < RECUR_DAYS) gapDays = Math.max(0, Math.round(days));
      }
      events.push({ date: t.createdAt, kind, from: holderName.get(t.fromHolderId ?? "") ?? "—", to: holderName.get(t.toHolderId ?? "") ?? "—", reason: t.reason, transferId: t.id, gapDays });
      if (kind === "out") lastOut = t.createdAt;
    }
    const lastIn = [...events].reverse().find((e) => e.kind === "in");
    if (lastIn?.gapDays != null) recurringByVehicle.set(vid, lastIn.gapDays);
    historyEventsByVehicle.set(vid, events.reverse()); // תצוגה: חדש קודם
  }

  // יעדים אפשריים להחזרה (למודאל)
  const holders = await prisma.holder.findMany({
    where: { battalionId: bId, active: true, kind: { in: ["WAREHOUSE", "COMPANY"] }, id: { not: tana.id } },
    orderBy: [{ kind: "asc" }, { name: "asc" }],
    select: { id: true, name: true, kind: true },
  });

  // רכבים שכעת בטנא (למודאל החזרה) — סינון לפי הצ'קבוקס
  const vehiclesAtTana = filteredVehicles.filter((v) => v.currentHolderId === tana.id);

  // ===== נתונים לרכיב הטאבים (מספור + חיפוש + היסטוריה) =====
  const vehiclesData: VehRow[] = filteredVehicles.map((v, i) => ({
    id: v.id, num: i + 1, typeName: v.itemType.name, serial: v.serialNumber,
    statusName: v.status.name,
    statusTone: v.status.isLoss ? "loss" : v.status.isWear ? "wear" : "ok",
    holderLabel: v.currentHolder ? `${v.currentHolder.kind === "COMPANY" ? "🪖" : "🏪"} ${v.currentHolder.name}` : "—",
    atTana: v.currentHolderId === tana.id,
    sentByOfficer: v.currentHolderId === tana.id && sentByOfficerSet.has(v.id),
    signedSoldier: v.signedSoldier?.fullName ?? null,
    physicalLocation: v.location ? `${v.location.column}-${v.location.row}` : (v.physicalLocation ?? null),
    reason: vehicleReasons.get(v.id) ?? null,
    recurringDays: recurringByVehicle.get(v.id) ?? null,
  }));
  const byTypeData: TypeRow[] = [...byType.values()].sort((a, b) => b.total - a.total)
    .map((s) => ({ typeName: s.typeName, total: s.total, ok: s.ok, defectiveAtTana: s.defectiveAtTana, signedToSoldier: s.signedToSoldier }));
  const numByVid = new Map(vehiclesData.map((v) => [v.id, v.num]));
  const vehByVid = new Map(filteredVehicles.map((v) => [v.id, v]));
  const historyData: VehHist[] = [...historyEventsByVehicle.entries()]
    .filter(([vid]) => vehByVid.has(vid))
    .map(([vid, events]) => {
      const v = vehByVid.get(vid)!;
      return {
        id: vid, num: numByVid.get(vid) ?? 0, typeName: v.itemType.name, serial: v.serialNumber,
        hasRecurring: events.some((e) => e.gapDays != null),
        events: events.map((e) => ({ date: e.date.toISOString(), kind: e.kind, from: e.from, to: e.to, reason: e.reason, transferId: e.transferId, gapDays: e.gapDays })),
      };
    })
    .sort((a, b) => (b.hasRecurring ? 1 : 0) - (a.hasRecurring ? 1 : 0) || a.num - b.num);
  const recurringCount = vehiclesData.filter((v) => v.recurringDays != null).length;

  return (
    <div>
      <PageHeader
        title="🚙 סטטוס רכבים"
        subtitle={`כל הרכבים הצבאיים בגדוד — מעקב סטטוס, תקלות ותחזוקה (טנא)`}
        action={
          <div className="flex items-center gap-3 flex-wrap">
            <ExcludeOfficerToggle checked={excludeOfficerOn} />
            {vehiclesAtTana.length > 0 && (
              <ReturnFromTanaModal
                serials={vehiclesAtTana.map((v) => ({
                  id: v.id, itemTypeId: v.itemTypeId, itemName: v.itemType.name, serial: v.serialNumber,
                  statusId: v.statusId, statusName: v.status.name,
                  category: v.itemType.category?.name ?? null,
                  reason: vehicleReasons.get(v.id) ?? null,
                }))}
                balances={[]}
                holders={holders.map((h) => ({ id: h.id, name: h.name, kind: h.kind }))}
              />
            )}
          </div>
        }
      />

      {/* ===== דשבורד עליון ===== */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mb-4">
        <Card className="p-3 bg-emerald-50 border-emerald-200">
          <div className="text-[10px] text-slate-500">סך תקינים בשטח</div>
          <div className="text-2xl font-bold text-emerald-700">{totalOk}</div>
        </Card>
        <Card className="p-3 bg-amber-50 border-amber-200">
          <div className="text-[10px] text-slate-500">תקולים (לא בטנא)</div>
          <div className="text-2xl font-bold text-amber-700">{totalDefectiveOutOfTana}</div>
        </Card>
        <Card className="p-3 bg-orange-50 border-orange-200">
          <div className="text-[10px] text-slate-500">בטנא לתיקון</div>
          <div className="text-2xl font-bold text-orange-700">{totalAtTana}</div>
        </Card>
        <Card className="p-3 bg-rose-50 border-rose-200">
          <div className="text-[10px] text-slate-500">🔁 חזרות מהירות (&lt;5 ימים)</div>
          <div className="text-2xl font-bold text-rose-700">{recurringCount}</div>
        </Card>
        <Card className="p-3 bg-emerald-50 border-emerald-200">
          <div className="text-[10px] text-slate-500">סך רכבים שתוקנו</div>
          <div className="text-2xl font-bold text-emerald-700">{repairedCount}</div>
        </Card>
        <Card className="p-3 bg-blue-50 border-blue-200">
          <div className="text-[10px] text-slate-500">זמן ממוצע לתיקון</div>
          <div className="text-2xl font-bold text-blue-700">{repairedCount > 0 ? avgRepairText : "—"}</div>
        </Card>
      </div>

      {excludeOfficerOn && (
        <p className="text-xs text-blue-700 mb-2">🔍 מוסתרים {allVehicles.length - filteredVehicles.length} רכבים שנשלחו לטנא ע״י קצין הרכב</p>
      )}

      <MaintenanceTabs vehicles={vehiclesData} byType={byTypeData} history={historyData} />
    </div>
  );
}
