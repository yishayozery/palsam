import Link from "next/link";
import { requireUser } from "@/lib/guard";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { PageHeader, Badge, Card, Table, Th, Td, EmptyState } from "@/components/ui";
import { TRACKING_METHOD } from "@/lib/labels";
import InventoryActions from "./InventoryActions";
import OcrIntake from "./OcrIntake";
import SerialImport from "./SerialImport";

export const dynamic = "force-dynamic";

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ holder?: string }>;
}) {
  const user = await requireUser();
  const bId = user.battalionId!;
  const { holder: holderFilter } = await searchParams;
  const canManage = can(user.role, "warehouse.operate");

  // המחזיק של המשתמש (מחסן/פלוגה) — לקביעת היקף הצפייה והקליטה
  const myHolder = user.holderId
    ? await prisma.holder.findUnique({ where: { id: user.holderId } })
    : null;

  // בידוד: קצין מחסן/רס"פ/צופה-פלוגתי רואים רק את המחזיק שלהם. מפמ/אדמין/צופה-גדודי — הכל.
  const scopedToOwn =
    (user.role === "WAREHOUSE_MANAGER" || user.role === "COMPANY_REP" || user.role === "VIEWER") &&
    !!user.holderId;
  const scopeIds: string[] | null = scopedToOwn ? [user.holderId!] : null;

  const holders = await prisma.holder.findMany({
    where: { battalionId: bId, active: true, ...(scopeIds ? { id: { in: scopeIds } } : {}) },
    orderBy: { name: "asc" },
  });

  // המחזיק האפקטיבי חייב להיות בתוך ההיקף המורשה
  const reqHolder = holderFilter && (!scopeIds || scopeIds.includes(holderFilter)) ? holderFilter : undefined;
  const holderWhere = reqHolder ? { in: [reqHolder] } : scopeIds ? { in: scopeIds } : undefined;

  // קליטה: קצין מחסן יכול לקלוט רק פריטים מטיפוס המחסן שלו
  const itemWhere =
    myHolder?.kind === "WAREHOUSE" && myHolder.warehouseType
      ? { battalionId: bId, active: true, category: { warehouseType: myHolder.warehouseType } }
      : { battalionId: bId, active: true };

  const [balances, serialUnits, items, statuses] = await Promise.all([
    prisma.stockBalance.findMany({
      where: { battalionId: bId, quantity: { gt: 0 }, ...(holderWhere ? { holderId: holderWhere } : {}) },
      include: { itemType: true, holder: true, status: true },
      orderBy: { itemType: { name: "asc" } },
    }),
    prisma.serialUnit.findMany({
      where: { battalionId: bId, ...(holderWhere ? { currentHolderId: holderWhere } : {}) },
      include: { itemType: true, status: true, currentHolder: true, signedSoldier: true },
      orderBy: [{ itemType: { name: "asc" } }, { serialNumber: "asc" }],
      take: 500,
    }),
    prisma.itemType.findMany({ where: itemWhere, orderBy: { name: "asc" } }),
    prisma.itemStatus.findMany({ where: { battalionId: bId, active: true }, orderBy: { sortOrder: "asc" } }),
  ]);

  return (
    <div>
      <PageHeader
        title="מלאי"
        subtitle="תמונת מלאי לפי מחזיק — כמותי, פרטני ואצווה"
        action={
          canManage ? (
            <div className="flex gap-2 flex-wrap">
              <OcrIntake
                items={items.map((i) => ({ id: i.id, name: i.name, sku: i.sku, trackingMethod: i.trackingMethod }))}
                statuses={statuses.map((s) => ({ id: s.id, name: s.name }))}
              />
              <SerialImport
                items={items.filter((i) => i.trackingMethod === "SERIAL").map((i) => ({ id: i.id, name: i.name, sku: i.sku }))}
                statuses={statuses.map((s) => ({ id: s.id, name: s.name }))}
              />
              <InventoryActions
                items={items.map((i) => ({ id: i.id, name: i.name, sku: i.sku, trackingMethod: i.trackingMethod }))}
                statuses={statuses.map((s) => ({ id: s.id, name: s.name }))}
              />
            </div>
          ) : undefined
        }
      />

      {/* סינון לפי מחזיק — רק כשיש יותר ממחזיק אחד בהיקף */}
      {holders.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-5">
          <Link href="/inventory"
            className={`text-sm rounded-lg px-3 py-1.5 ${!holderFilter ? "bg-slate-800 text-white" : "bg-white border border-slate-300 text-slate-600"}`}>
            הכל
          </Link>
          {holders.map((h) => (
            <Link key={h.id} href={`/inventory?holder=${h.id}`}
              className={`text-sm rounded-lg px-3 py-1.5 ${holderFilter === h.id ? "bg-slate-800 text-white" : "bg-white border border-slate-300 text-slate-600"}`}>
              {h.name}
            </Link>
          ))}
        </div>
      )}
      {holders.length === 1 && (
        <div className="mb-5 text-sm text-slate-500">מחסן: <span className="font-medium text-slate-700">{holders[0].name}</span></div>
      )}

      {/* מלאי כמותי */}
      <h2 className="font-bold text-slate-700 mb-2">מלאי כמותי</h2>
      <Card className="mb-6">
        {balances.length === 0 ? (
          <EmptyState>אין מלאי כמותי</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr><Th>פריט</Th><Th>מחזיק</Th><Th>סטטוס</Th><Th>כמות</Th></tr>
            </thead>
            <tbody>
              {balances.map((b) => (
                <tr key={b.id}>
                  <Td className="font-medium">{b.itemType.name}</Td>
                  <Td>{b.holder.name}</Td>
                  <Td><Badge>{b.status.name}</Badge></Td>
                  <Td className="font-bold">{b.quantity} {b.itemType.unit}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {/* מלאי סריאלי / אצווה */}
      <h2 className="font-bold text-slate-700 mb-2">מלאי פרטני ואצווה</h2>
      <Card>
        {serialUnits.length === 0 ? (
          <EmptyState>אין פריטים סריאליים</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>פריט</Th><Th>מספר סריאלי</Th><Th>סוג</Th><Th>סטטוס</Th>
                <Th>מחזיק</Th><Th>חתום על</Th><Th>מיקום פיזי</Th>
              </tr>
            </thead>
            <tbody>
              {serialUnits.map((s) => (
                <tr key={s.id}>
                  <Td className="font-medium">{s.itemType.name}</Td>
                  <Td className="font-mono text-xs">
                    {s.serialNumber}
                    {s.lotQuantity && <span className="text-slate-400"> (×{s.lotQuantity})</span>}
                  </Td>
                  <Td><Badge>{TRACKING_METHOD[s.itemType.trackingMethod]}</Badge></Td>
                  <Td><Badge>{s.status.name}</Badge></Td>
                  <Td>{s.currentHolder?.name ?? "—"}</Td>
                  <Td>{s.signedSoldier ? (
                    <span className="text-blue-600">{s.signedSoldier.fullName}</span>
                  ) : "—"}</Td>
                  <Td className="text-slate-500">{s.physicalLocation ?? "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
