import { requireCapability } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader, Badge, Card } from "@/components/ui";
import CrudSection from "@/components/CrudSection";
import { saveLocation, deleteLocation } from "./actions";

export const dynamic = "force-dynamic";

export default async function LocationsPage() {
  const user = await requireCapability("locations.manage");
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
    include: { _count: { select: { serialUnits: true, stockBalances: true } } },
  });

  return (
    <div>
      <PageHeader title="מידוף" subtitle={`מיקומי אחסון — ${holder?.name ?? ""} (מחסן / עמודה / שורה)`} />
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
    </div>
  );
}
