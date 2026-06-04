import { requireCapability } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader, Badge, Card, Table, Th, Td } from "@/components/ui";
import { TRACKING_METHOD } from "@/lib/labels";
import CatalogManager from "./CatalogManager";
import ImportExcel from "@/components/ImportExcel";
import { importItems } from "./import-actions";

export const dynamic = "force-dynamic";

export default async function CatalogPage() {
  const user = await requireCapability("catalog.manage");
  const bId = user.battalionId!;

  const [items, categories] = await Promise.all([
    prisma.itemType.findMany({
      where: { battalionId: bId, isDonated: false },
      orderBy: { sku: "asc" },
      include: {
        category: true,
        kitComponents: { include: { componentType: true } },
        _count: { select: { serialUnits: true, stockBalances: true } },
      },
    }),
    prisma.category.findMany({ where: { battalionId: bId, active: true }, orderBy: { name: "asc" } }),
  ]);

  const methodColors: Record<string, string> = {
    QUANTITY: "bg-blue-100 text-blue-700",
    SERIAL: "bg-purple-100 text-purple-700",
    LOT: "bg-amber-100 text-amber-700",
    KIT: "bg-emerald-100 text-emerald-700",
  };

  return (
    <div>
      <PageHeader
        title='קטלוג מק"טים'
        subtitle="עץ מוצר דינמי — 4 שיטות ניהול מלאי"
        action={
          <div className="flex items-center gap-2">
            <ImportExcel action={importItems} templateHref="/catalog/template" label="ייבוא פריטים" />
            <CatalogManager categories={categories} items={items.map((i) => ({ id: i.id, name: i.name, sku: i.sku }))} />
          </div>
        }
      />

      <Card>
        <Table>
          <thead>
            <tr>
              <Th></Th>
              <Th>מק״ט</Th>
              <Th>שם</Th>
              <Th>קטגוריה</Th>
              <Th>שיטת ניהול</Th>
              <Th>מאפיינים</Th>
              <Th>במלאי</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className={i.active ? "" : "opacity-50"}>
                <Td>
                  {i.imageData ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={i.imageData} alt={i.name} className="w-10 h-10 object-cover rounded-md border border-slate-200" />
                  ) : (
                    <div className="w-10 h-10 rounded-md bg-slate-100 flex items-center justify-center text-slate-300">📦</div>
                  )}
                </Td>
                <Td className="font-mono text-xs">{i.sku}</Td>
                <Td className="font-medium">
                  {i.name}
                  {i.trackingMethod === "KIT" && i.kitComponents.length > 0 && (
                    <div className="text-xs text-slate-400 mt-0.5">
                      ערכה: {i.kitComponents.map((k) => `${k.componentType.name}×${k.quantity}`).join(", ")}
                    </div>
                  )}
                </Td>
                <Td>{i.category?.name ?? <Badge className="bg-purple-100 text-purple-700">תרומה</Badge>}</Td>
                <Td>
                  <Badge className={methodColors[i.trackingMethod]}>
                    {TRACKING_METHOD[i.trackingMethod]}
                  </Badge>
                </Td>
                <Td>
                  <div className="flex gap-1">
                    {i.isSensitive && <Badge className="bg-rose-100 text-rose-700">רגיש</Badge>}
                    {i.trackLocation && <Badge className="bg-slate-100 text-slate-600">מעקב מיקום</Badge>}
                  </div>
                </Td>
                <Td className="text-center">
                  {i._count.serialUnits + i._count.stockBalances > 0 ? "✓" : "—"}
                </Td>
                <Td>
                  <CatalogManager
                    categories={categories}
                    items={items.map((x) => ({ id: x.id, name: x.name, sku: x.sku }))}
                    edit={{
                      id: i.id,
                      sku: i.sku,
                      name: i.name,
                      categoryId: i.categoryId ?? "",
                      trackingMethod: i.trackingMethod,
                      unit: i.unit,
                      isSensitive: i.isSensitive,
                      trackLocation: i.trackLocation,
                      imageData: i.imageData,
                      kitComponents: i.kitComponents.map((k) => ({
                        id: k.id,
                        name: k.componentType.name,
                        quantity: k.quantity,
                      })),
                    }}
                  />
                </Td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <Td className="text-center text-slate-400" >
                  <span className="block py-6">אין מק״טים. הוסף מק״ט ראשון.</span>
                </Td>
              </tr>
            )}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
