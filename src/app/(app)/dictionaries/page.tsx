import { requireCapability } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader, Badge } from "@/components/ui";
import { WAREHOUSE_TYPE_SHORT } from "@/lib/rbac";
import CrudSection from "@/components/CrudSection";
import {
  saveCategory,
  deleteCategory,
  saveStatus,
  deleteStatus,
  saveFrequency,
  deleteFrequency,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function DictionariesPage() {
  const user = await requireCapability("dictionaries.manage");
  const bId = user.battalionId!;

  const [categories, statuses, frequencies] = await Promise.all([
    prisma.category.findMany({ where: { battalionId: bId }, orderBy: { sortOrder: "asc" }, include: { _count: { select: { itemTypes: true } } } }),
    prisma.itemStatus.findMany({ where: { battalionId: bId }, orderBy: { sortOrder: "asc" } }),
    prisma.countFrequency.findMany({ where: { battalionId: bId }, orderBy: { intervalDays: "asc" } }),
  ]);

  const whOptions = [
    { value: "EQUIPMENT", label: WAREHOUSE_TYPE_SHORT.EQUIPMENT },
    { value: "COMMS", label: WAREHOUSE_TYPE_SHORT.COMMS },
    { value: "AMMO", label: WAREHOUSE_TYPE_SHORT.AMMO },
    { value: "ARMORY", label: WAREHOUSE_TYPE_SHORT.ARMORY },
  ];

  return (
    <div>
      <PageHeader title="ניהול מילונים" subtitle="הגדרות הגדוד — ללא Hardcoding" />
      <div className="grid lg:grid-cols-2 gap-6">
        <CrudSection
          title="קטגוריות ציוד (לפי מחסן)"
          addLabel="קטגוריה"
          fields={[
            { name: "name", label: "שם הקטגוריה" },
            { name: "warehouseType", label: "מחסן", type: "select", default: "EQUIPMENT", options: whOptions },
          ]}
          saveAction={saveCategory}
          deleteAction={deleteCategory}
          rows={categories.map((c) => ({
            id: c.id,
            values: { name: c.name, warehouseType: c.warehouseType },
            locked: c._count.itemTypes > 0,
            display: (
              <span className="flex items-center gap-1.5">
                {c.name}
                <Badge className="bg-slate-100 text-slate-600">{WAREHOUSE_TYPE_SHORT[c.warehouseType]}</Badge>
                {c._count.itemTypes > 0 && <Badge>{c._count.itemTypes} מק״טים</Badge>}
              </span>
            ),
          }))}
        />

        <CrudSection
          title="סטטוסי ציוד"
          addLabel="סטטוס"
          fields={[
            { name: "name", label: "שם הסטטוס" },
            { name: "isDefault", label: "ברירת מחדל", type: "checkbox" },
            { name: "isWear", label: "בלאי", type: "checkbox" },
            { name: "isLoss", label: "אובדן", type: "checkbox" },
            { name: "isConsumed", label: 'שצ"ל', type: "checkbox" },
          ]}
          saveAction={saveStatus}
          deleteAction={deleteStatus}
          rows={statuses.map((s) => ({
            id: s.id,
            values: { name: s.name, isDefault: s.isDefault, isWear: s.isWear, isLoss: s.isLoss, isConsumed: s.isConsumed },
            display: (
              <span className="flex items-center gap-1.5">
                {s.name}
                {s.isDefault && <Badge className="bg-blue-100 text-blue-700">ברירת מחדל</Badge>}
                {s.isWear && <Badge className="bg-amber-100 text-amber-700">בלאי</Badge>}
                {s.isLoss && <Badge className="bg-rose-100 text-rose-700">אובדן</Badge>}
                {s.isConsumed && <Badge className="bg-purple-100 text-purple-700">שצ״ל</Badge>}
              </span>
            ),
          }))}
        />

        <CrudSection
          title="תדירויות ספירה"
          addLabel="תדירות"
          fields={[
            { name: "name", label: "שם" },
            { name: "intervalDays", label: "מרווח (ימים)", type: "number", default: "7" },
          ]}
          saveAction={saveFrequency}
          deleteAction={deleteFrequency}
          rows={frequencies.map((f) => ({
            id: f.id,
            values: { name: f.name, intervalDays: String(f.intervalDays) },
            display: (<span>{f.name} <Badge>כל {f.intervalDays} ימים</Badge></span>),
          }))}
        />
      </div>
    </div>
  );
}
