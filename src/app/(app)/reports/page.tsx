import { requireCapability } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader, Badge, Card, Table, Th, Td, EmptyState } from "@/components/ui";
import PrintButton from "@/components/PrintButton";

export const dynamic = "force-dynamic";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ item?: string }>;
}) {
  const user = await requireCapability("reports.view");
  const bId = user.battalionId!;
  const { item: itemId } = await searchParams;

  const isWM = user.role === "WAREHOUSE_MANAGER" && user.holderIds.length > 0;
  const isCR = user.role === "COMPANY_REP" && !!user.holderId;

  // מחסנים/מחזיקים בסקופ של המשתמש
  const scopedHolderIds: string[] = isWM
    ? user.holderIds
    : isCR
      ? [user.holderId!]
      : [];

  // לקצין מחסן — רק קטגוריות שתואמות את warehouseType של המחסנים שלו
  type WT = "EQUIPMENT" | "COMMS" | "AMMO" | "ARMORY" | "VEHICLES" | "MEDICAL" | "GENERAL";
  let scopedWarehouseTypes: WT[] = [];
  if (isWM) {
    const whs = await prisma.holder.findMany({
      where: { id: { in: user.holderIds } },
      select: { warehouseType: true },
    });
    scopedWarehouseTypes = whs.map((w) => w.warehouseType).filter((t): t is WT => !!t);
  }

  // פילטר פריטים: לקצין מחסן רק לפי warehouseType; לרס"פ — כל הציוד הגדודי שהוא יכול לקבל
  const itemWhere = isWM && scopedWarehouseTypes.length > 0
    ? { battalionId: bId, active: true, category: { warehouseType: { in: scopedWarehouseTypes } } }
    : { battalionId: bId, active: true };

  const [items, categories, holders] = await Promise.all([
    prisma.itemType.findMany({ where: itemWhere, orderBy: { name: "asc" } }),
    prisma.category.findMany({
      where: {
        battalionId: bId, active: true,
        ...(isWM && scopedWarehouseTypes.length > 0
          ? { warehouseType: { in: scopedWarehouseTypes } }
          : {}),
      },
    }),
    prisma.holder.findMany({
      where: {
        battalionId: bId, active: true,
        ...(isCR ? { id: user.holderId! } : isWM ? { id: { in: user.holderIds } } : {}),
      },
      orderBy: { name: "asc" },
    }),
  ]);

  // חתך פריט סריאלי נבחר — מסונן לפי המחזיקים בסקופ
  const selected = itemId ? items.find((i) => i.id === itemId) : null;
  const crossSection = selected
    ? await prisma.serialUnit.findMany({
        where: {
          itemTypeId: selected.id, battalionId: bId,
          ...(scopedHolderIds.length > 0 ? { currentHolderId: { in: scopedHolderIds } } : {}),
        },
        include: {
          status: true, currentHolder: true, signedSoldier: true,
          equipmentLocation: { select: { name: true, vehicleSerialUnitId: true } },
        },
        orderBy: [{ currentHolder: { name: "asc" } }],
      })
    : [];

  // פילוח מלאי לפי קטגוריה — מסונן לפי המחזיקים בסקופ
  const byCategory = await Promise.all(
    categories.map(async (c) => {
      const serial = await prisma.serialUnit.count({
        where: {
          battalionId: bId, itemType: { categoryId: c.id },
          ...(scopedHolderIds.length > 0 ? { currentHolderId: { in: scopedHolderIds } } : {}),
        },
      });
      const qty = await prisma.stockBalance.aggregate({
        _sum: { quantity: true },
        where: {
          battalionId: bId, itemType: { categoryId: c.id },
          ...(scopedHolderIds.length > 0 ? { holderId: { in: scopedHolderIds } } : {}),
        },
      });
      return { name: c.name, serial, qty: qty._sum.quantity ?? 0 };
    }),
  );

  // פילוח לפי מחזיק — רק אלו בסקופ
  const byHolder = await Promise.all(
    holders.map(async (h) => {
      const serial = await prisma.serialUnit.count({ where: { battalionId: bId, currentHolderId: h.id } });
      const qty = await prisma.stockBalance.aggregate({
        _sum: { quantity: true }, where: { battalionId: bId, holderId: h.id },
      });
      return { name: h.name, serial, qty: qty._sum.quantity ?? 0 };
    }),
  );

  const scopeLabel = isCR
    ? `הפלוגה שלך בלבד`
    : isWM
      ? `המחסנים שאתה מנהל (${user.holderIds.length})`
      : `כל הגדוד`;

  return (
    <div>
      <PageHeader
        title="מנוע דוחות"
        subtitle={`פילוח מיקומים וחתכי פריטים — סקופ: ${scopeLabel}`}
        action={
          <div className="flex gap-2">
            <PrintButton />
          </div>
        }
      />

      {/* חתך פריט סריאלי */}
      <Card className="p-5 mb-6">
        <h2 className="font-bold text-slate-700 mb-3">חתך פריט סריאלי — איפה נמצא ציוד X</h2>
        <form className="mb-4">
          <select name="item" defaultValue={itemId ?? ""}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">בחר פריט סריאלי...</option>
            {items.filter((i) => i.trackingMethod === "SERIAL" || i.trackingMethod === "LOT").map((i) => (
              <option key={i.id} value={i.id}>{i.name} ({i.sku})</option>
            ))}
          </select>
          <button className="mr-2 bg-slate-800 text-white rounded-lg px-4 py-2 text-sm">הצג</button>
        </form>

        {selected && (
          crossSection.length === 0 ? (
            <EmptyState>אין יחידות לפריט זה בסקופ שלך</EmptyState>
          ) : (
            <Table>
              <thead>
                <tr><Th>מספר סריאלי</Th><Th>סטטוס</Th><Th>מחזיק</Th><Th>חתום על</Th><Th>📍 מיקום ציוד</Th></tr>
              </thead>
              <tbody>
                {crossSection.map((u) => (
                  <tr key={u.id}>
                    <Td className="font-mono text-xs">{u.serialNumber}</Td>
                    <Td><Badge>{u.status.name}</Badge></Td>
                    <Td>{u.currentHolder?.name ?? <span className="text-amber-600">במעבר</span>}</Td>
                    <Td>{u.signedSoldier ? <span className="text-blue-600">{u.signedSoldier.fullName}</span> : "—"}</Td>
                    <Td className="text-slate-500">
                      {u.equipmentLocation
                        ? <span>{u.equipmentLocation.vehicleSerialUnitId ? "🚙" : "📍"} {u.equipmentLocation.name}</span>
                        : (u.physicalLocation ?? "—")}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )
        )}
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        <Card className="p-5">
          <h2 className="font-bold text-slate-700 mb-3">פילוח לפי קטגוריה</h2>
          {byCategory.length === 0 ? <EmptyState>אין קטגוריות בסקופ</EmptyState> : (
            <Table>
              <thead><tr><Th>קטגוריה</Th><Th>סריאלי</Th><Th>כמותי</Th></tr></thead>
              <tbody>
                {byCategory.map((c) => (
                  <tr key={c.name}>
                    <Td className="font-medium">{c.name}</Td>
                    <Td className="text-center">{c.serial}</Td>
                    <Td className="text-center">{c.qty}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="font-bold text-slate-700 mb-3">פילוח לפי מחזיק</h2>
          {byHolder.length === 0 ? <EmptyState>אין מחזיקים בסקופ</EmptyState> : (
            <Table>
              <thead><tr><Th>מחזיק</Th><Th>סריאלי</Th><Th>כמותי</Th></tr></thead>
              <tbody>
                {byHolder.map((h) => (
                  <tr key={h.name}>
                    <Td className="font-medium">{h.name}</Td>
                    <Td className="text-center">{h.serial}</Td>
                    <Td className="text-center">{h.qty}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </div>
  );
}
