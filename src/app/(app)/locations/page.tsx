import { requireCapability } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader, Badge, Card } from "@/components/ui";
import TabNav from "@/components/TabNav";
import CrudSection from "@/components/CrudSection";
import { saveLocation, deleteLocation } from "./actions";
import ItemLocationsTab from "./ItemLocationsTab";

export const dynamic = "force-dynamic";

export default async function LocationsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await requireCapability("locations.manage");
  const { tab } = await searchParams;
  const active = tab || "shelves";
  if (!user.holderId) {
    return (
      <div>
        <PageHeader title="מידוף" subtitle="ניהול מיקומי אחסון" />
        <Card className="p-6"><p className="text-sm text-slate-400">אינך משויך למחסן/פלוגה.</p></Card>
      </div>
    );
  }

  const holder = await prisma.holder.findUnique({ where: { id: user.holderId } });
  const locations = await prisma.storageLocation.findMany({
    where: { holderId: user.holderId },
    orderBy: [{ column: "asc" }, { row: "asc" }],
    include: {
      _count: { select: { serialUnits: true, stockBalances: true } },
      serialUnits: { include: { itemType: true } },
      stockBalances: { include: { itemType: true } },
    },
  });
  // פריטים + המיקום הנוכחי שלהם ב-holder הזה
  const bId = user.battalionId!;
  const [allItems, holderMappings] = await Promise.all([
    prisma.itemType.findMany({
      where: { battalionId: bId, active: true },
      orderBy: { name: "asc" },
      include: { category: { select: { warehouseType: true } } },
    }),
    prisma.itemHolderLocation.findMany({
      where: { holderId: user.holderId },
      select: { itemTypeId: true, locationId: true },
    }),
  ]);

  // קיבוץ לרשת לפי עמודה/שורה
  const columns = [...new Set(locations.map((l) => l.column))].sort();
  const rows = [...new Set(locations.map((l) => l.row))].sort();
  const grid = new Map<string, typeof locations[0]>();
  for (const l of locations) grid.set(`${l.column}|${l.row}`, l);

  return (
    <div>
      <PageHeader title="מידוף" subtitle={`${holder?.name ?? ""} — ניהול מיקומי אחסון ושרטוט המחסן`} />
      <TabNav
        active={active}
        tabs={[
          { key: "shelves", label: "🗄️ מידוף מחסן", href: "/locations?tab=shelves" },
          { key: "items", label: "פריטים במידוף", href: "/locations?tab=items" },
          { key: "map", label: "שרטוט המחסן", href: "/locations?tab=map" },
        ]}
      />

      {active === "items" && (
        <div className="mt-4">
          <ItemLocationsTab
            holderName={holder?.name ?? ""}
            items={allItems.map((i) => ({
              id: i.id, name: i.name, sku: i.sku,
              trackingMethod: i.trackingMethod,
              warehouseType: i.category?.warehouseType ?? null,
            }))}
            locations={locations.map((l) => ({ id: l.id, column: l.column, row: l.row, label: l.label }))}
            mappings={holderMappings}
          />
        </div>
      )}

      {active === "shelves" && (
        <CrudSection
          title="מדפים"
          addLabel="מדף"
          fields={[
            { name: "column", label: "עמודה" },
            { name: "row", label: "שורה" },
            { name: "label", label: "תיאור (אופציונלי)" },
          ]}
          saveAction={saveLocation}
          deleteAction={deleteLocation}
          rows={locations.map((l) => ({
            id: l.id,
            values: { column: l.column, row: l.row, label: l.label ?? "" },
            locked: l._count.serialUnits + l._count.stockBalances > 0,
            display: (
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono font-medium">{l.column}-{l.row}</span>
                  {l.label && <span className="text-slate-500 text-sm">{l.label}</span>}
                  {l._count.serialUnits > 0 && <Badge className="bg-blue-100 text-blue-700">{l._count.serialUnits} סריאלי</Badge>}
                  {l._count.stockBalances > 0 && <Badge className="bg-emerald-100 text-emerald-700">{l._count.stockBalances} מק״טים</Badge>}
                </div>
                {(l.serialUnits.length > 0 || l.stockBalances.length > 0) && (
                  <div className="text-[11px] text-slate-500 flex flex-wrap gap-2 mt-0.5">
                    {(() => {
                      // קיבוץ סריאלי לפי שם פריט
                      const serialAgg = new Map<string, number>();
                      for (const u of l.serialUnits) serialAgg.set(u.itemType.name, (serialAgg.get(u.itemType.name) ?? 0) + (u.lotQuantity ?? 1));
                      const qtyAgg = new Map<string, number>();
                      for (const b of l.stockBalances) qtyAgg.set(b.itemType.name, (qtyAgg.get(b.itemType.name) ?? 0) + b.quantity);
                      const all = [...Array.from(serialAgg.entries()), ...Array.from(qtyAgg.entries())];
                      return all.slice(0, 6).map(([name, qty]) => (
                        <span key={name} className="bg-slate-50 rounded px-1.5 py-0.5">{name}: <b>{qty}</b></span>
                      ));
                    })()}
                    {(l.serialUnits.length + l.stockBalances.length > 6) && (
                      <span className="text-slate-400">+ עוד {l.serialUnits.length + l.stockBalances.length - 6}</span>
                    )}
                  </div>
                )}
              </div>
            ),
          }))}
        />
      )}

      {active === "map" && (
        <Card className="p-5 overflow-x-auto">
          {locations.length === 0 ? (
            <p className="text-sm text-slate-400">אין מדפים להציג. צור מדפים בטאב הקודם.</p>
          ) : (
            <>
              <p className="text-sm text-slate-500 mb-3">
                שרטוט סכמטי של המחסן — כל תא מייצג מדף (עמודה × שורה). מעבר עכבר מציג את הפריטים.
              </p>
              <div className="inline-block">
                <table className="border-collapse">
                  <thead>
                    <tr>
                      <th className="p-2"></th>
                      {columns.map((c) => (
                        <th key={c} className="px-3 py-2 text-sm font-mono text-slate-500">עמודה {c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r}>
                        <th className="px-3 py-2 text-sm font-mono text-slate-500">שורה {r}</th>
                        {columns.map((c) => {
                          const cell = grid.get(`${c}|${r}`);
                          if (!cell) return <td key={c} className="w-32 h-24 border-2 border-dashed border-slate-200" />;
                          const total = cell._count.serialUnits + cell._count.stockBalances;
                          const itemsTitle = [
                            ...cell.serialUnits.map((s) => `${s.itemType.name} ${s.serialNumber}`),
                            ...cell.stockBalances.map((b) => `${b.itemType.name} ×${b.quantity}`),
                          ].join("\n") || "ריק";
                          return (
                            <td key={c} title={itemsTitle}
                              className={`w-32 h-24 border-2 ${total > 0 ? "border-blue-400 bg-blue-50" : "border-slate-200 bg-slate-50"} p-2 align-top cursor-help`}>
                              <div className="font-mono text-xs text-slate-500">{cell.column}-{cell.row}</div>
                              {cell.label && <div className="text-xs text-slate-400">{cell.label}</div>}
                              <div className="mt-1 text-2xl font-bold text-slate-800">{total}</div>
                              <div className="text-[10px] text-slate-500">פריטים</div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card>
      )}
    </div>
  );
}
