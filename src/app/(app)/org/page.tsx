import { requireCapability } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import SettingsTabs from "@/components/SettingsTabs";
import TabNav from "@/components/TabNav";
import HolderAccordion, { type HolderRow } from "./HolderAccordion";

export const dynamic = "force-dynamic";

export default async function OrgPage({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  const user = await requireCapability("org.manage");
  const bId = user.battalionId!;
  const { section } = await searchParams;
  const active = section || "warehouses";

  const [warehouses, companies] = await Promise.all([
    prisma.holder.findMany({
      where: { battalionId: bId, kind: "WAREHOUSE" },
      orderBy: [{ active: "desc" }, { name: "asc" }],
      include: {
        users: {
          select: { id: true, fullName: true, username: true, role: true, phone: true, passwordSet: true, active: true },
          orderBy: { fullName: "asc" },
        },
      },
    }),
    prisma.holder.findMany({
      where: { battalionId: bId, kind: "COMPANY" },
      orderBy: [{ active: "desc" }, { name: "asc" }],
      include: {
        users: {
          select: { id: true, fullName: true, username: true, role: true, phone: true, passwordSet: true, active: true },
          orderBy: { fullName: "asc" },
        },
        soldiers: {
          where: { active: true },
          select: { id: true, fullName: true, personalNumber: true, enlisted: true },
          orderBy: [{ enlisted: "asc" }, { lastName: "asc" }, { fullName: "asc" }],
        },
        _count: { select: { soldiers: true } },
      },
    }),
  ]);

  const warehouseRows: HolderRow[] = warehouses.map((w) => ({
    id: w.id, name: w.name, active: w.active, warehouseType: w.warehouseType,
    users: w.users.filter((u) => u.active || !u.passwordSet),
  }));
  const companyRows: HolderRow[] = companies.map((c) => ({
    id: c.id, name: c.name, active: c.active,
    users: c.users.filter((u) => u.active || !u.passwordSet),
    soldiers: c.soldiers.map((s) => ({ id: s.id, fullName: s.fullName, personalNumber: s.personalNumber, enlisted: s.enlisted })),
    extra: { soldierCount: c._count.soldiers },
  }));

  return (
    <div>
      <PageHeader title="הגדרות גדוד" subtitle="פרופיל, מבנה ארגוני ומשתמשים" />
      <SettingsTabs active="org" />
      <TabNav
        active={active}
        tabs={[
          { key: "warehouses", label: `🏪 מחסנים (${warehouseRows.length})`, href: "/org?section=warehouses" },
          { key: "companies", label: `🪖 פלוגות (${companyRows.length})`, href: "/org?section=companies" },
        ]}
      />

      <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-900 mb-4">
        💡 לחץ על חץ ◀ ליד שם {active === "warehouses" ? "המחסן" : "הפלוגה"} כדי לצפות במשתמשים ולהוסיף חדשים.
        כל משתמש מקבל לינק להזמנה וקובע סיסמה בכניסה ראשונה.
        {active === "warehouses"
          ? " ניתן להוסיף כמה קצינים לאותו מחסן."
          : " ניתן להוסיף כמה רס״פים לאותה פלוגה."}
      </div>

      {active === "warehouses" && <HolderAccordion rows={warehouseRows} kind="WAREHOUSE" />}
      {active === "companies" && <HolderAccordion rows={companyRows} kind="COMPANY" />}
    </div>
  );
}
