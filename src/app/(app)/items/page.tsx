import { requireCapability } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader, Badge, Card, Table, Th, Td } from "@/components/ui";
import TabNav from "@/components/TabNav";
import CrudSection from "@/components/CrudSection";
import ImportExcel from "@/components/ImportExcel";
import { WAREHOUSE_TYPE_SHORT } from "@/lib/rbac";
import { TRACKING_METHOD } from "@/lib/labels";
import CatalogManager from "../catalog/CatalogManager";
import { importItems } from "../catalog/import-actions";
import {
  saveCategory, deleteCategory, saveStatus, deleteStatus, saveFrequency, deleteFrequency,
} from "../dictionaries/actions";
import ItemsFilters from "./ItemsFilters";
import CategoriesFilters from "./CategoriesFilters";

export const dynamic = "force-dynamic";

const ASSOC: Record<string, { label: string; cls: string }> = {
  MILITARY: { label: "צבאי", cls: "bg-slate-100 text-slate-600" },
  DONATION_COMPANY: { label: "תרומה פלוגתי", cls: "bg-purple-100 text-purple-700" },
  DONATION_BATTALION: { label: "תרומה גדודי", cls: "bg-purple-100 text-purple-700" },
};

export default async function ItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string; category?: string; warehouse?: string; catQ?: string; catWh?: string }>;
}) {
  const user = await requireCapability("catalog.manage");
  const bId = user.battalionId!;
  const { tab, q = "", category = "", warehouse = "", catQ = "", catWh = "" } = await searchParams;
  const active = tab || "items";

  // סקופ לקצין מחסן: רק טיפוסי המחסנים שלו
  const isWarehouseManager = user.role === "WAREHOUSE_MANAGER";
  const myWarehouseTypes: string[] = [];
  if (isWarehouseManager && user.holderIds?.length) {
    const myHolders = await prisma.holder.findMany({
      where: { id: { in: user.holderIds }, kind: "WAREHOUSE" },
      select: { warehouseType: true },
    });
    for (const h of myHolders) if (h.warehouseType) myWarehouseTypes.push(h.warehouseType);
  }
  const scoped = isWarehouseManager && myWarehouseTypes.length > 0;
  const scopeFilter = scoped ? { category: { warehouseType: { in: myWarehouseTypes as ("EQUIPMENT"|"COMMS"|"AMMO"|"ARMORY"|"VEHICLES"|"MEDICAL"|"GENERAL")[] } } } : {};
  const categoryScopeFilter = scoped ? { warehouseType: { in: myWarehouseTypes as ("EQUIPMENT"|"COMMS"|"AMMO"|"ARMORY"|"VEHICLES"|"MEDICAL"|"GENERAL")[] } } : {};

  const tabs = [
    { key: "items", label: "פריטים (מק״טים)", href: "/items?tab=items" },
    { key: "categories", label: "קטגוריות", href: "/items?tab=categories" },
    { key: "statuses", label: "סטטוסים", href: "/items?tab=statuses" },
    { key: "frequencies", label: "תדירויות ספירה", href: "/items?tab=frequencies" },
  ];

  const search = q.trim();
  const itemWhere = {
    battalionId: bId,
    ...scopeFilter,
    ...(search ? { OR: [
      { name: { contains: search, mode: "insensitive" as const } },
      { sku: { contains: search, mode: "insensitive" as const } },
    ] } : {}),
    ...(category ? { categoryId: category } : {}),
    ...(warehouse && !scoped ? { category: { warehouseType: warehouse as "EQUIPMENT" | "COMMS" | "AMMO" | "ARMORY" | "VEHICLES" | "MEDICAL" | "GENERAL" } } : {}),
  };

  // סינון קטגוריות (טאב 'קטגוריות')
  const catSearch = catQ.trim();
  const categoryWhere = {
    battalionId: bId,
    ...categoryScopeFilter,
    ...(catSearch ? { name: { contains: catSearch, mode: "insensitive" as const } } : {}),
    ...(catWh && !scoped ? { warehouseType: catWh as "EQUIPMENT" | "COMMS" | "AMMO" | "ARMORY" | "VEHICLES" | "MEDICAL" | "GENERAL" } : {}),
  };

  const allCategories = await prisma.category.findMany({ where: { battalionId: bId, ...categoryScopeFilter }, orderBy: { name: "asc" } });

  // מידופים זמינים — לקצין מחסן רק במחסניו, למפ"מ הכל
  const locationWhere = scoped && user.holderIds?.length
    ? { holder: { id: { in: user.holderIds }, kind: "WAREHOUSE" as const } }
    : { holder: { battalionId: bId, kind: "WAREHOUSE" as const } };

  const [items, categories, statuses, frequencies, locations] = await Promise.all([
    prisma.itemType.findMany({
      where: itemWhere, orderBy: { name: "asc" },
      include: { category: true, homeLocation: { include: { holder: true } }, _count: { select: { serialUnits: true, stockBalances: true } } },
    }),
    prisma.category.findMany({ where: categoryWhere, orderBy: { sortOrder: "asc" }, include: { _count: { select: { itemTypes: true } } } }),
    prisma.itemStatus.findMany({ where: { battalionId: bId }, orderBy: { sortOrder: "asc" } }),
    prisma.countFrequency.findMany({ where: { battalionId: bId }, orderBy: { intervalDays: "asc" } }),
    prisma.storageLocation.findMany({ where: locationWhere, include: { holder: true }, orderBy: [{ holder: { name: "asc" } }, { column: "asc" }, { row: "asc" }] }),
  ]);

  const locOptions = locations.map((l) => ({
    id: l.id,
    label: `${l.holder.name} · ${l.column}-${l.row}${l.label ? ` (${l.label})` : ""}`,
  }));

  const whOptions = (["EQUIPMENT", "COMMS", "AMMO", "ARMORY", "VEHICLES", "MEDICAL", "GENERAL"] as const).map((v) => ({ value: v, label: WAREHOUSE_TYPE_SHORT[v] }));

  return (
    <div>
      <PageHeader
        title="הגדרות פריטים"
        subtitle="מק״טים, מלאי גדודי, קטגוריות, סטטוסים ותדירויות"
        action={active === "items" ? (
          <div className="flex items-center gap-2">
            <ImportExcel action={importItems} templateHref="/catalog/template" label="ייבוא פריטים" />
            <CatalogManager categories={categories.map((c) => ({ id: c.id, name: c.name }))} locations={locOptions} />
          </div>
        ) : undefined}
      />
      <TabNav tabs={tabs} active={active} />

      {active === "items" && (
        <>
          <ItemsFilters
            initialQ={q}
            initialCategory={category}
            initialWarehouse={warehouse}
            categories={allCategories.map((c) => ({ id: c.id, name: c.name, warehouseType: c.warehouseType }))}
          />
          <Card>
            <Table>
              <thead><tr><Th></Th><Th>שם</Th><Th>מק״ט</Th><Th>קטגוריה</Th><Th>מיקום במחסן</Th><Th>שיטה</Th><Th>שייכות</Th><Th>במלאי</Th><Th></Th></tr></thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id} className={i.active ? "" : "opacity-50"}>
                    <Td>
                      {i.imageData ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={i.imageData} alt={i.name} className="w-9 h-9 object-cover rounded-md border border-slate-200" />
                      ) : <div className="w-9 h-9 rounded-md bg-slate-100 flex items-center justify-center text-slate-300">📦</div>}
                    </Td>
                    <Td className="font-medium">{i.name}</Td>
                    <Td className="font-mono text-xs text-slate-500">{i.sku ?? "—"}</Td>
                    <Td>{i.category?.name ?? "—"}</Td>
                    <Td className="text-xs">
                      {i.homeLocation
                        ? <span><b>{i.homeLocation.holder.name}</b> · {i.homeLocation.column}-{i.homeLocation.row}</span>
                        : <span className="text-slate-300">—</span>}
                    </Td>
                    <Td><Badge>{TRACKING_METHOD[i.trackingMethod]}</Badge></Td>
                    <Td><Badge className={ASSOC[i.association].cls}>{ASSOC[i.association].label}</Badge></Td>
                    <Td className="text-center">{i._count.serialUnits + i._count.stockBalances > 0 ? "✓" : "—"}</Td>
                    <Td>
                      <a href={`/items/${i.id}/history`} className="text-xs text-blue-600 hover:underline ml-2">היסטוריה</a>
                      <CatalogManager
                        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
                        locations={locOptions}
                        edit={{ id: i.id, sku: i.sku ?? "", name: i.name, categoryId: i.categoryId ?? "", trackingMethod: i.trackingMethod, unit: i.unit, association: i.association, signMode: i.signMode, imageData: i.imageData, homeLocationId: i.homeLocationId }}
                      />
                    </Td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr><Td><span className="block py-6 text-slate-400 text-center">
                    {q || category ? "אין פריטים מתאימים לחיפוש" : "אין פריטים. הוסף פריט ראשון."}
                  </span></Td></tr>
                )}
              </tbody>
            </Table>
          </Card>
        </>
      )}

      {active === "categories" && (
        <>
        <CategoriesFilters initialQ={catQ} initialWarehouse={catWh} />
        <CrudSection
          title="קטגוריות ציוד (לפי מחסן)" addLabel="קטגוריה"
          fields={[{ name: "name", label: "שם הקטגוריה" }, { name: "warehouseType", label: "מחסן", type: "select", default: "EQUIPMENT", options: whOptions }]}
          saveAction={saveCategory} deleteAction={deleteCategory}
          rows={categories.map((c) => ({
            id: c.id, values: { name: c.name, warehouseType: c.warehouseType }, locked: c._count.itemTypes > 0,
            display: (<span className="flex items-center gap-1.5">{c.name}<Badge className="bg-slate-100 text-slate-600">{WAREHOUSE_TYPE_SHORT[c.warehouseType]}</Badge>{c._count.itemTypes > 0 && <Badge>{c._count.itemTypes} מק״טים</Badge>}</span>),
          }))}
        />
        </>
      )}

      {active === "statuses" && (
        <CrudSection
          title="סטטוסי ציוד" addLabel="סטטוס"
          fields={[{ name: "name", label: "שם" }, { name: "isDefault", label: "ברירת מחדל", type: "checkbox" }, { name: "isWear", label: "בלאי", type: "checkbox" }, { name: "isLoss", label: "אובדן", type: "checkbox" }, { name: "isConsumed", label: 'שצ"ל', type: "checkbox" }]}
          saveAction={saveStatus} deleteAction={deleteStatus}
          rows={statuses.map((s) => ({
            id: s.id, values: { name: s.name, isDefault: s.isDefault, isWear: s.isWear, isLoss: s.isLoss, isConsumed: s.isConsumed },
            display: (<span className="flex items-center gap-1.5">{s.name}{s.isDefault && <Badge className="bg-blue-100 text-blue-700">ברירת מחדל</Badge>}{s.isWear && <Badge className="bg-amber-100 text-amber-700">בלאי</Badge>}{s.isLoss && <Badge className="bg-rose-100 text-rose-700">אובדן</Badge>}{s.isConsumed && <Badge className="bg-purple-100 text-purple-700">שצ״ל</Badge>}</span>),
          }))}
        />
      )}

      {active === "frequencies" && (
        <CrudSection
          title="תדירויות ספירה" addLabel="תדירות"
          fields={[{ name: "name", label: "שם" }, { name: "intervalDays", label: "מרווח (ימים)", type: "number", default: "7" }]}
          saveAction={saveFrequency} deleteAction={deleteFrequency}
          rows={frequencies.map((f) => ({ id: f.id, values: { name: f.name, intervalDays: String(f.intervalDays) }, display: (<span>{f.name} <Badge>כל {f.intervalDays} ימים</Badge></span>) }))}
        />
      )}
    </div>
  );
}
