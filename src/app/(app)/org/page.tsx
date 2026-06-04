import { requireCapability } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader, Badge } from "@/components/ui";
import { WAREHOUSE_TYPE_SHORT } from "@/lib/rbac";
import CrudSection from "@/components/CrudSection";
import { createWarehouse, createCompany, renameHolder, toggleHolder } from "./actions";

export const dynamic = "force-dynamic";

export default async function OrgPage() {
  const user = await requireCapability("org.manage");
  const bId = user.battalionId!;

  const [warehouses, companies] = await Promise.all([
    prisma.holder.findMany({
      where: { battalionId: bId, kind: "WAREHOUSE" },
      orderBy: { name: "asc" },
      include: { _count: { select: { users: true } } },
    }),
    prisma.holder.findMany({
      where: { battalionId: bId, kind: "COMPANY" },
      orderBy: { name: "asc" },
      include: { _count: { select: { users: true, soldiers: true } } },
    }),
  ]);

  const whOptions = [
    { value: "EQUIPMENT", label: WAREHOUSE_TYPE_SHORT.EQUIPMENT },
    { value: "COMMS", label: WAREHOUSE_TYPE_SHORT.COMMS },
    { value: "AMMO", label: WAREHOUSE_TYPE_SHORT.AMMO },
    { value: "ARMORY", label: WAREHOUSE_TYPE_SHORT.ARMORY },
  ];

  // CrudSection מצפה ל-saveAction אחד; נשתמש בעטיפה לפי קיום id (שינוי שם) או יצירה
  const saveWarehouse = async (fd: FormData) => {
    "use server";
    if (fd.get("id")) return renameHolder(fd);
    return createWarehouse(fd);
  };
  const saveCompany = async (fd: FormData) => {
    "use server";
    if (fd.get("id")) return renameHolder(fd);
    return createCompany(fd);
  };

  return (
    <div>
      <PageHeader title="מבנה ארגוני" subtitle="הקמת מחסנים ופלוגות בגדוד" />
      <div className="grid lg:grid-cols-2 gap-6">
        <CrudSection
          title="מחסנים"
          addLabel="מחסן"
          fields={[
            { name: "name", label: "שם המחסן" },
            { name: "warehouseType", label: "סוג", type: "select", default: "EQUIPMENT", options: whOptions },
          ]}
          saveAction={saveWarehouse}
          deleteAction={toggleHolder}
          rows={warehouses.map((w) => ({
            id: w.id,
            values: { name: w.name, warehouseType: w.warehouseType ?? "EQUIPMENT" },
            display: (
              <span className="flex items-center gap-1.5">
                {w.name}
                <Badge className="bg-slate-100 text-slate-600">{w.warehouseType ? WAREHOUSE_TYPE_SHORT[w.warehouseType] : ""}</Badge>
                {w._count.users > 0 && <Badge className="bg-blue-100 text-blue-700">{w._count.users} קצינים</Badge>}
                {!w.active && <Badge className="bg-rose-100 text-rose-700">לא פעיל</Badge>}
              </span>
            ),
          }))}
        />

        <CrudSection
          title="פלוגות"
          addLabel="פלוגה"
          fields={[{ name: "name", label: "שם הפלוגה" }]}
          saveAction={saveCompany}
          deleteAction={toggleHolder}
          rows={companies.map((c) => ({
            id: c.id,
            values: { name: c.name },
            display: (
              <span className="flex items-center gap-1.5">
                {c.name}
                {c._count.soldiers > 0 && <Badge>{c._count.soldiers} חיילים</Badge>}
                {!c.active && <Badge className="bg-rose-100 text-rose-700">לא פעיל</Badge>}
              </span>
            ),
          }))}
        />
      </div>
    </div>
  );
}
