import { requireCapability } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader, Badge } from "@/components/ui";
import CrudSection from "@/components/CrudSection";
import { HOLDER_TYPE } from "@/lib/labels";
import {
  saveCategory,
  deleteCategory,
  saveStatus,
  deleteStatus,
  saveFrequency,
  deleteFrequency,
  saveHolder,
  toggleHolder,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function DictionariesPage() {
  await requireCapability("dictionaries.manage");

  const [categories, statuses, frequencies, holders] = await Promise.all([
    prisma.category.findMany({
      orderBy: { sortOrder: "asc" },
      include: { _count: { select: { itemTypes: true } } },
    }),
    prisma.itemStatus.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.countFrequency.findMany({ orderBy: { intervalDays: "asc" } }),
    prisma.holder.findMany({ orderBy: { type: "asc" } }),
  ]);

  return (
    <div>
      <PageHeader
        title="ניהול מילונים"
        subtitle="הגדרות המערכת — ללא Hardcoding. נוהל על ידי מנהל המערכת."
      />

      <div className="grid lg:grid-cols-2 gap-6">
        <CrudSection
          title="קטגוריות ציוד"
          addLabel="קטגוריה"
          fields={[{ name: "name", label: "שם הקטגוריה" }]}
          saveAction={saveCategory}
          deleteAction={deleteCategory}
          rows={categories.map((c) => ({
            id: c.id,
            values: { name: c.name },
            locked: c._count.itemTypes > 0,
            display: (
              <span>
                {c.name}{" "}
                {c._count.itemTypes > 0 && (
                  <Badge>{c._count.itemTypes} מק״טים</Badge>
                )}
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
            values: {
              name: s.name,
              isDefault: s.isDefault,
              isWear: s.isWear,
              isLoss: s.isLoss,
              isConsumed: s.isConsumed,
            },
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
            display: (
              <span>
                {f.name} <Badge>כל {f.intervalDays} ימים</Badge>
              </span>
            ),
          }))}
        />

        <CrudSection
          title="מבנה ארגוני (מחזיקים)"
          addLabel="יחידה"
          fields={[
            { name: "name", label: "שם" },
            { name: "code", label: "קוד" },
            {
              name: "type",
              label: "סוג",
              type: "select",
              default: "COMPANY",
              options: [
                { value: "COMPANY", label: "פלוגה" },
                { value: "ARMORY", label: "נשקייה" },
                { value: "WAREHOUSE", label: "מחסן גדודי" },
              ],
            },
          ]}
          saveAction={saveHolder}
          deleteAction={toggleHolder}
          rows={holders.map((h) => ({
            id: h.id,
            values: { name: h.name, code: h.code ?? "", type: h.type },
            display: (
              <span className="flex items-center gap-1.5">
                {h.name}
                <Badge>{HOLDER_TYPE[h.type]}</Badge>
                {!h.active && <Badge className="bg-rose-100 text-rose-700">לא פעיל</Badge>}
              </span>
            ),
          }))}
        />
      </div>
    </div>
  );
}
