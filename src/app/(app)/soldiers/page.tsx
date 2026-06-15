import { requireCapability } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader, Badge } from "@/components/ui";
import CrudSection from "@/components/CrudSection";
import ImportExcel from "@/components/ImportExcel";
import { saveSoldier, toggleSoldier } from "./actions";
import { importSoldiers } from "./import-actions";
import SoldierEquipmentButton from "./SoldierEquipmentButton";

export const dynamic = "force-dynamic";

export default async function SoldiersPage() {
  const user = await requireCapability("company.manage");
  const bId = user.battalionId!;

  const where = { battalionId: bId, ...(user.holderId ? { companyId: user.holderId } : {}) };
  const [soldiers, companies] = await Promise.all([
    prisma.soldier.findMany({
      where,
      orderBy: [{ platoon: "asc" }, { fullName: "asc" }],
      include: {
        company: true,
        _count: { select: { signedSerialUnits: true, signedKitInstances: true } },
      },
    }),
    prisma.holder.findMany({ where: { battalionId: bId, kind: "COMPANY", active: true }, orderBy: { name: "asc" } }),
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
    { name: "platoon", label: "מחלקה" },
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
              platoon: s.platoon ?? "",
              companyId: s.companyId ?? "",
            },
            display: (
              <span className="flex items-center gap-2 flex-wrap">
                <span className="font-medium">{s.fullName}</span>
                <span className="font-mono text-xs text-slate-400">{s.personalNumber}</span>
                {s.platoon && <Badge className="bg-indigo-100 text-indigo-700">מחלקה {s.platoon}</Badge>}
                {s.company && <Badge>{s.company.name}</Badge>}
                <SoldierEquipmentButton
                  soldierId={s.id} soldierName={s.fullName}
                  signedSerials={serials} signedQty={qty}
                />
                {!s.active && <Badge className="bg-rose-100 text-rose-700">לא פעיל</Badge>}
              </span>
            ),
          };
        })}
      />
    </div>
  );
}
