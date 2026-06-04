import { requireCapability } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader, Badge, Card } from "@/components/ui";
import TabNav from "@/components/TabNav";
import CrudSection from "@/components/CrudSection";
import { saveLocation, deleteLocation } from "./actions";

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
          { key: "shelves", label: "מדפים", href: "/locations?tab=shelves" },
          { key: "map", label: "שרטוט המחסן", href: "/locations?tab=map" },
        ]}
      />

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
              <span className="flex items-center gap-2">
                <span className="font-mono font-medium">{l.column}-{l.row}</span>
                {l.label && <span className="text-slate-500 text-sm">{l.label}</span>}
                {l._count.serialUnits + l._count.stockBalances > 0 && (
                  <Badge>{l._count.serialUnits + l._count.stockBalances} פריטים</Badge>
                )}
              </span>
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
