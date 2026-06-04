import { requireCapability } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader, Badge, Card } from "@/components/ui";
import { WAREHOUSE_TYPE_SHORT, ROLE_LABELS } from "@/lib/rbac";
import SettingsTabs from "@/components/SettingsTabs";
import CrudSection from "@/components/CrudSection";
import TabNav from "@/components/TabNav";
import { createWarehouse, createCompany, renameHolder, toggleHolder } from "./actions";

export const dynamic = "force-dynamic";

export default async function OrgPage({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  const user = await requireCapability("org.manage");
  const bId = user.battalionId!;
  const { section } = await searchParams;
  const active = section || "warehouses";

  const [warehouses, companies] = await Promise.all([
    prisma.holder.findMany({
      where: { battalionId: bId, kind: "WAREHOUSE" },
      orderBy: { name: "asc" },
      include: {
        users: { where: { active: true }, select: { id: true, fullName: true, username: true, role: true, phone: true } },
        assignedUsers: { include: { user: { select: { id: true, fullName: true, username: true, role: true } } } },
      },
    }),
    prisma.holder.findMany({
      where: { battalionId: bId, kind: "COMPANY" },
      orderBy: { name: "asc" },
      include: {
        users: { where: { active: true }, select: { id: true, fullName: true, username: true, role: true, phone: true } },
        _count: { select: { soldiers: true } },
      },
    }),
  ]);

  const whOptions = (["EQUIPMENT", "COMMS", "AMMO", "ARMORY", "VEHICLES", "MEDICAL", "GENERAL"] as const).map((v) => ({ value: v, label: WAREHOUSE_TYPE_SHORT[v] }));

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
      <PageHeader title="הגדרות גדוד" subtitle="פרופיל, מבנה ארגוני ומשתמשים" />
      <SettingsTabs active="org" />
      <TabNav
        active={active}
        tabs={[
          { key: "warehouses", label: "מחסני הגדוד", href: "/org?section=warehouses" },
          { key: "companies", label: "פלוגות", href: "/org?section=companies" },
        ]}
      />

      {active === "warehouses" && (
        <div className="space-y-5">
          <CrudSection
            title="מחסני הגדוד"
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
                  {w.users.length > 0 && <Badge className="bg-blue-100 text-blue-700">{w.users.length} קצינים</Badge>}
                  {!w.active && <Badge className="bg-rose-100 text-rose-700">לא פעיל</Badge>}
                </span>
              ),
            }))}
          />

          <Card className="p-5">
            <h3 className="font-bold text-slate-700 mb-3">אנשי קשר במחסנים (מטה פלסם)</h3>
            <p className="text-xs text-slate-500 mb-3">המשתמשים המוגדרים לכל מחסן. לעריכה: <a href="/users" className="text-blue-600 hover:underline">משתמשים ותפקידים</a></p>
            <div className="space-y-3">
              {warehouses.map((w) => (
                <div key={w.id} className="border border-slate-200 rounded-lg p-3">
                  <div className="font-medium text-sm mb-2">{w.name} <span className="text-xs text-slate-400">({w.warehouseType ? WAREHOUSE_TYPE_SHORT[w.warehouseType] : ""})</span></div>
                  {w.users.length === 0 ? (
                    <p className="text-xs text-slate-400">אין משתמשים — הזמן קצין מחסן</p>
                  ) : (
                    <div className="space-y-1">
                      {w.users.map((u) => (
                        <div key={u.id} className="flex items-center gap-2 text-sm">
                          <Badge className="bg-slate-100 text-slate-700">{ROLE_LABELS[u.role]}</Badge>
                          <span>{u.fullName}</span>
                          <span className="text-xs text-slate-400 font-mono">@{u.username}</span>
                          {u.phone && <span className="text-xs text-slate-400">· {u.phone}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {active === "companies" && (
        <div className="space-y-5">
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
                  {c.users.length > 0 && <Badge className="bg-blue-100 text-blue-700">{c.users.length} בעלי תפקיד</Badge>}
                  {!c.active && <Badge className="bg-rose-100 text-rose-700">לא פעיל</Badge>}
                </span>
              ),
            }))}
          />

          <Card className="p-5">
            <h3 className="font-bold text-slate-700 mb-3">בעלי תפקיד בפלוגות (מ"פ, רס"פ ועוד)</h3>
            <p className="text-xs text-slate-500 mb-3">המשתמשים המוגדרים לכל פלוגה. לעריכה: <a href="/users" className="text-blue-600 hover:underline">משתמשים ותפקידים</a></p>
            <div className="space-y-3">
              {companies.map((c) => (
                <div key={c.id} className="border border-slate-200 rounded-lg p-3">
                  <div className="font-medium text-sm mb-2">{c.name}</div>
                  {c.users.length === 0 ? (
                    <p className="text-xs text-slate-400">אין משתמשים בפלוגה</p>
                  ) : (
                    <div className="space-y-1">
                      {c.users.map((u) => (
                        <div key={u.id} className="flex items-center gap-2 text-sm">
                          <Badge className="bg-slate-100 text-slate-700">{ROLE_LABELS[u.role]}</Badge>
                          <span>{u.fullName}</span>
                          <span className="text-xs text-slate-400 font-mono">@{u.username}</span>
                          {u.phone && <span className="text-xs text-slate-400">· {u.phone}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
