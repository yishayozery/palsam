import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, Badge, Table, Th, Td, EmptyState } from "@/components/ui";
import { findTanaHolder } from "@/lib/tana";
import ReturnFromTanaModal from "./ReturnFromTanaModal";
import ExcludeOfficerToggle from "./ExcludeOfficerToggle";

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
  const isAdmin = user.role === "BATTALION_ADMIN" || user.role === "WAREHOUSE_MANAGER";
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

  // היסטוריית תעודות (רכבים בלבד) — 30 אחרונות
  const recentHistory = await prisma.transfer.findMany({
    where: {
      battalionId: bId,
      OR: [{ fromHolderId: tana.id }, { toHolderId: tana.id }],
      lines: { some: { serialUnit: { itemType: { category: { warehouseType: "VEHICLES" } } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 30,
    include: { fromHolder: true, toHolder: true, createdBy: { select: { fullName: true } }, _count: { select: { lines: true } } },
  });

  // יעדים אפשריים להחזרה (למודאל)
  const holders = await prisma.holder.findMany({
    where: { battalionId: bId, active: true, kind: { in: ["WAREHOUSE", "COMPANY"] }, id: { not: tana.id } },
    orderBy: [{ kind: "asc" }, { name: "asc" }],
    select: { id: true, name: true, kind: true },
  });

  // רכבים שכעת בטנא (למודאל החזרה) — סינון לפי הצ'קבוקס
  const vehiclesAtTana = filteredVehicles.filter((v) => v.currentHolderId === tana.id);

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
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
        <Card className="p-3 bg-emerald-50 border-emerald-200">
          <div className="text-[10px] text-slate-500">סך תקינים בשטח</div>
          <div className="text-2xl font-bold text-emerald-700">{totalOk}</div>
        </Card>
        <Card className="p-3 bg-amber-50 border-amber-200">
          <div className="text-[10px] text-slate-500">תקולים (לא בטנא)</div>
          <div className="text-2xl font-bold text-amber-700">{totalDefectiveOutOfTana}</div>
        </Card>
        <Card className="p-3 bg-orange-50 border-orange-200">
          <div className="text-[10px] text-slate-500">בטנא לתיקון (תעודה פתוחה)</div>
          <div className="text-2xl font-bold text-orange-700">{totalAtTana}</div>
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

      {/* ===== טבלת כל הרכבים ===== */}
      <h2 className="font-bold text-slate-700 mb-2">🚙 כל הרכבים ({filteredVehicles.length})</h2>
      {excludeOfficerOn && (
        <p className="text-xs text-blue-700 mb-2">🔍 מוסתרים {allVehicles.length - filteredVehicles.length} רכבים שנשלחו לטנא ע״י קצין הרכב</p>
      )}
      <Card className="mb-6">
        {filteredVehicles.length === 0 ? (
          <EmptyState>אין רכבים</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr><Th>רכב</Th><Th>מ.ס.</Th><Th>סטטוס</Th><Th>שייכות נוכחית</Th><Th>חייל חתום</Th><Th>מיקום פיזי</Th><Th>תקלה אחרונה</Th></tr>
            </thead>
            <tbody>
              {filteredVehicles.map((v) => {
                const reason = vehicleReasons.get(v.id);
                const isAtTana = v.currentHolderId === tana.id;
                const sentByOfficer = isAtTana && sentByOfficerSet.has(v.id);
                const statusColor = v.status.isLoss ? "bg-rose-100 text-rose-800"
                  : v.status.isWear ? "bg-amber-100 text-amber-800"
                  : "bg-emerald-100 text-emerald-800";
                return (
                  <tr key={v.id} className={isAtTana ? "bg-orange-50" : ""}>
                    <Td className="font-medium">🚙 {v.itemType.name}</Td>
                    <Td className="font-mono text-xs">{v.serialNumber}</Td>
                    <Td><Badge className={statusColor}>{v.status.name}</Badge></Td>
                    <Td className="text-xs">
                      {isAtTana ? (
                        <span className="text-orange-700 font-medium">
                          🔧 בטנא {sentByOfficer && <span className="text-[10px] text-blue-700 mr-1">(ע״י קצין רכב)</span>}
                        </span>
                      ) : v.currentHolder ? (
                        <>{v.currentHolder.kind === "COMPANY" ? "🪖" : "🏪"} {v.currentHolder.name}</>
                      ) : "—"}
                    </Td>
                    <Td className="text-xs text-blue-700">{v.signedSoldier?.fullName ?? "—"}</Td>
                    <Td className="text-xs text-slate-600">
                      {v.location ? `${v.location.column}-${v.location.row}` : (v.physicalLocation ?? "—")}
                    </Td>
                    <Td className="text-xs text-rose-700 max-w-xs truncate">
                      <span title={reason ?? ""}>{reason ?? (v.status.isWear ? "סומן כתקול ללא הסבר" : "—")}</span>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      {/* ===== פירוט לפי סוג רכב ===== */}
      <h2 className="font-bold text-slate-700 mb-2">📊 פירוט לפי סוג רכב</h2>
      <Card className="mb-6">
        {byType.size === 0 ? (
          <EmptyState>אין רכבים צבאיים בגדוד</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr><Th>סוג רכב</Th><Th>סה״כ</Th><Th>תקין (בשטח)</Th><Th>בטנא לתיקון</Th><Th>חתום על חייל</Th></tr>
            </thead>
            <tbody>
              {[...byType.values()].sort((a, b) => b.total - a.total).map((s) => (
                <tr key={s.typeName}>
                  <Td className="font-medium">🚙 {s.typeName}</Td>
                  <Td className="text-center font-bold">{s.total}</Td>
                  <Td className="text-center text-emerald-700">{s.ok}</Td>
                  <Td className="text-center text-orange-700">{s.defectiveAtTana}</Td>
                  <Td className="text-center text-blue-700">{s.signedToSoldier}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {/* ===== היסטוריית תעודות (רכבים בלבד) ===== */}
      <h2 className="font-bold text-slate-700 mb-2 mt-6">📜 היסטוריית תעודות רכבים (טנא)</h2>
      <Card>
        {recentHistory.length === 0 ? (
          <EmptyState>אין תעודות עדיין</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr><Th>תאריך</Th><Th>סוג</Th><Th>מאת</Th><Th>אל</Th><Th>שורות</Th><Th>סיבה</Th><Th></Th></tr>
            </thead>
            <tbody>
              {recentHistory.map((t) => (
                <tr key={t.id}>
                  <Td className="text-xs text-slate-500">{t.createdAt.toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</Td>
                  <Td>
                    <Badge className={t.toHolderId === tana.id ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}>
                      {t.toHolderId === tana.id ? "🔧 כניסה לטנא" : "✓ יציאה מטנא"}
                    </Badge>
                  </Td>
                  <Td className="text-xs">{t.fromHolder?.name ?? "—"}</Td>
                  <Td className="text-xs">{t.toHolder?.name ?? "—"}</Td>
                  <Td className="text-center">{t._count.lines}</Td>
                  <Td className="text-xs text-slate-600 max-w-xs truncate">{t.reason ?? "—"}</Td>
                  <Td><Link href={`/transfers/${t.id}/document`} className="text-xs text-blue-600 hover:underline">תעודה</Link></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
