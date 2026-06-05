import { requireCapability } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import SettingsTabs from "@/components/SettingsTabs";
import TabNav from "@/components/TabNav";
import { HolderCardGrid, type HolderRowDetail } from "./HolderCard";
import AddHolderCard from "./AddHolderCard";

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
          select: { id: true, fullName: true, username: true, role: true, phone: true, title: true, passwordSet: true, active: true },
          orderBy: { fullName: "asc" },
        },
        // חיילים שמוצבים במחזיק כשיוך משני (למשל ארמון)
        secondarySoldiers: {
          where: { active: true },
          select: { id: true, fullName: true, personalNumber: true, enlisted: true },
          orderBy: [{ lastName: "asc" }, { fullName: "asc" }],
        },
      },
    }),
    prisma.holder.findMany({
      where: { battalionId: bId, kind: "COMPANY" },
      orderBy: [{ active: "desc" }, { name: "asc" }],
      include: {
        users: {
          select: { id: true, fullName: true, username: true, role: true, phone: true, title: true, passwordSet: true, active: true },
          orderBy: { fullName: "asc" },
        },
        soldiers: {
          where: { active: true },
          select: { id: true, fullName: true, personalNumber: true, enlisted: true },
          orderBy: [{ enlisted: "asc" }, { lastName: "asc" }, { fullName: "asc" }],
        },
      },
    }),
  ]);

  const warehouseRows: HolderRowDetail[] = warehouses.map((w) => ({
    id: w.id, name: w.name, active: w.active, warehouseType: w.warehouseType,
    users: w.users.filter((u) => u.active || !u.passwordSet),
    soldiers: w.secondarySoldiers.map((s) => ({
      id: s.id, fullName: s.fullName, personalNumber: s.personalNumber, enlisted: s.enlisted, isSecondary: true,
    })),
  }));
  const companyRows: HolderRowDetail[] = companies.map((c) => ({
    id: c.id, name: c.name, active: c.active,
    users: c.users.filter((u) => u.active || !u.passwordSet),
    soldiers: c.soldiers.map((s) => ({
      id: s.id, fullName: s.fullName, personalNumber: s.personalNumber, enlisted: s.enlisted,
    })),
  }));

  return (
    <div>
      <PageHeader title="הגדרות גדוד" subtitle="פרופיל, מבנה ארגוני ומטה הגדוד" />
      <SettingsTabs active="org" />
      <TabNav
        active={active}
        tabs={[
          { key: "warehouses", label: `🏪 מחסנים (${warehouseRows.length})`, href: "/org?section=warehouses" },
          { key: "companies", label: `🪖 פלוגות (${companyRows.length})`, href: "/org?section=companies" },
        ]}
      />

      <div className="mt-3 mb-4 bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-900">
        💡 לחץ על קובייה לפתיחת חלון פרטים — בעלי תפקיד, חיילים, הוספה ועריכה.
        חייל יכול להיות משויך גם לפלוגה (ראשי) וגם למחסן (משני) — למשל חייל ארמון שגם בפלוגה א'.
      </div>

      {active === "warehouses" && (
        <HolderCardGrid rows={warehouseRows} kind="WAREHOUSE" addButton={<AddHolderCard kind="WAREHOUSE" />} />
      )}
      {active === "companies" && (
        <HolderCardGrid rows={companyRows} kind="COMPANY" addButton={<AddHolderCard kind="COMPANY" />} />
      )}
    </div>
  );
}
