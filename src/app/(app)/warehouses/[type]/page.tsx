import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/guard";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { PageHeader, Badge, Card, Table, Th, Td, EmptyState, StatCard } from "@/components/ui";
import { WAREHOUSE_TYPE_LABELS, WAREHOUSE_TYPE_ICON } from "@/lib/rbac";
import { TRACKING_METHOD } from "@/lib/labels";
import type { WarehouseType } from "@/generated/prisma";

export const dynamic = "force-dynamic";

const VALID: WarehouseType[] = ["EQUIPMENT", "COMMS", "AMMO", "ARMORY", "VEHICLES", "MEDICAL", "GENERAL"];

export default async function WarehouseDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ type: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await requireUser();
  if (user.role === "SUPER_ADMIN") redirect("/admin/battalions");
  const bId = user.battalionId!;
  const { type } = await params;
  const { tab } = await searchParams;
  if (!VALID.includes(type as WarehouseType)) notFound();
  const wtype = type as WarehouseType;

  const warehouse = await prisma.holder.findFirst({
    where: { battalionId: bId, kind: "WAREHOUSE", warehouseType: wtype },
  });
  if (!warehouse) notFound();

  // קצין מחסן רשאי רק למחסנים המשויכים לו
  if (user.role === "WAREHOUSE_MANAGER" && !user.holderIds.includes(warehouse.id)) redirect("/warehouses");
  // משתמשי פלוגה לא רואים את מחסני הגדוד (רק את המחסן הפלוגתי שלהם)
  if (user.role === "COMPANY_REP" || (user.role === "VIEWER" && user.holderIds.length > 0)) redirect("/warehouses");

  const isManager = can(user.role, "warehouse.operate") && user.holderIds.includes(warehouse.id);

  // פלוגות שהמחסן עובד מולן
  const links = await prisma.warehouseCompany.findMany({
    where: { warehouseId: warehouse.id },
    include: { company: true, repUser: true },
  });
  const companies = links.map((l) => l.company);

  const activeTab = tab || "wh";
  const tabHolderId = activeTab === "wh" ? warehouse.id : activeTab;

  // KPIs
  const [serialCount, qtyAgg, pending, wear] = await Promise.all([
    prisma.serialUnit.count({ where: { currentHolderId: warehouse.id } }),
    prisma.stockBalance.aggregate({ _sum: { quantity: true }, where: { holderId: warehouse.id } }),
    prisma.transfer.count({ where: { fromHolderId: warehouse.id, status: "PENDING" } }),
    prisma.serialUnit.count({ where: { battalionId: bId, itemType: { category: { warehouseType: wtype } }, status: { isWear: true } } }),
  ]);

  // מלאי בטאב הנוכחי
  const [balances, serialUnits] = await Promise.all([
    prisma.stockBalance.findMany({
      where: { holderId: tabHolderId, quantity: { gt: 0 }, itemType: { category: { warehouseType: wtype } } },
      include: { itemType: true, status: true, location: true },
      orderBy: { itemType: { name: "asc" } },
    }),
    prisma.serialUnit.findMany({
      where: { currentHolderId: tabHolderId, itemType: { category: { warehouseType: wtype } } },
      include: { itemType: true, status: true, signedSoldier: true, location: true },
      orderBy: [{ itemType: { name: "asc" } }, { serialNumber: "asc" }],
      take: 400,
    }),
  ]);

  const actions = [
    { href: "/inventory", label: "קליטת מלאי", icon: "📥", show: can(user.role, "warehouse.operate") },
    { href: "/transfers", label: "ניפוק / העברה", icon: "🔄", show: can(user.role, "warehouse.operate") },
    { href: `/warehouses/${wtype}?tab=users`, label: "משתמשי המחסן", icon: "👤", show: true },
    { href: "/signatures", label: "החתמות", icon: "✍️", show: can(user.role, "signatures.manage") },
    { href: `/warehouses/${wtype}?tab=wear`, label: "ציוד בלאי", icon: "🛠️", show: true },
    { href: "/reports", label: "דוחות", icon: "📈", show: true },
  ].filter((a) => a.show);

  const isWearTab = activeTab === "wear";
  const isUsersTab = activeTab === "users";
  const wearUnits = isWearTab
    ? await prisma.serialUnit.findMany({
        where: { battalionId: bId, itemType: { category: { warehouseType: wtype } }, status: { OR: [{ isWear: true }, { isLoss: true }] } },
        include: { itemType: true, status: true, currentHolder: true },
      })
    : [];
  // משתמשי המחסן: קציני המחסן + נציגי הפלוגות שהמחסן עובד מולן
  const warehouseUsers = isUsersTab
    ? await prisma.appUser.findMany({ where: { holderId: warehouse.id, role: "WAREHOUSE_MANAGER" } })
    : [];

  return (
    <div>
      <PageHeader
        title={`${WAREHOUSE_TYPE_ICON[wtype]} ${warehouse.name}`}
        subtitle={WAREHOUSE_TYPE_LABELS[wtype]}
        action={<Link href="/warehouses" className="text-sm text-slate-500 hover:text-slate-800">→ כל המחסנים</Link>}
      />

      {/* דשבורד */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        <StatCard label="פריטים פרטניים" value={serialCount} />
        <StatCard label="מלאי כמותי" value={qtyAgg._sum.quantity ?? 0} />
        <StatCard label="במעבר" value={pending} tone={pending > 0 ? "amber" : "slate"} />
        <StatCard label="ציוד בבלאי" value={wear} tone={wear > 0 ? "amber" : "slate"} />
      </div>

      {/* כפתורי פעולה */}
      <div className="flex flex-wrap gap-2 mb-5">
        {actions.map((a) => (
          <Link key={a.label} href={a.href} className="bg-white border border-slate-300 rounded-lg px-4 py-2 text-sm hover:bg-slate-50 flex items-center gap-1.5">
            <span>{a.icon}</span> {a.label}
          </Link>
        ))}
      </div>

      {/* טאבים: מלאי גדודי + פלוגות */}
      <div className="flex flex-wrap gap-1 border-b border-slate-200 mb-4">
        <TabLink type={wtype} id="wh" active={activeTab === "wh"} label="מלאי גדודי" />
        {companies.map((c) => (
          <TabLink key={c.id} type={wtype} id={c.id} active={activeTab === c.id} label={c.name} />
        ))}
      </div>

      {isUsersTab ? (
        <Card>
          <div className="p-3 font-semibold text-slate-700">משתמשי המחסן</div>
          <Table>
            <thead><tr><Th>שם</Th><Th>תפקיד</Th><Th>שיוך</Th></tr></thead>
            <tbody>
              {warehouseUsers.map((u) => (
                <tr key={u.id}>
                  <Td className="font-medium">{u.fullName} <span className="text-xs text-slate-400 font-mono">@{u.username}</span></Td>
                  <Td><Badge className="bg-blue-100 text-blue-700">קצין מחסן</Badge></Td>
                  <Td>{warehouse.name}</Td>
                </tr>
              ))}
              {links.map((l) => (
                <tr key={l.id}>
                  <Td className="font-medium">{l.repUser?.fullName ?? <span className="text-slate-400">— ללא נציג —</span>}</Td>
                  <Td><Badge className="bg-slate-200 text-slate-700">רס״פ פלוגתי</Badge></Td>
                  <Td>{l.company.name}</Td>
                </tr>
              ))}
              {warehouseUsers.length === 0 && links.length === 0 && (
                <tr><Td><span className="text-slate-400 py-4 block">אין משתמשים משויכים</span></Td></tr>
              )}
            </tbody>
          </Table>
        </Card>
      ) : isWearTab ? (
        <Card>
          <div className="p-3 font-semibold text-slate-700">ציוד בלאי / אובדן — {WAREHOUSE_TYPE_LABELS[wtype]}</div>
          {wearUnits.length === 0 ? <EmptyState>אין ציוד בבלאי</EmptyState> : (
            <Table>
              <thead><tr><Th>פריט</Th><Th>מס״ד</Th><Th>סטטוס</Th><Th>מחזיק</Th></tr></thead>
              <tbody>
                {wearUnits.map((u) => (
                  <tr key={u.id}>
                    <Td className="font-medium">{u.itemType.name}</Td>
                    <Td className="font-mono text-xs">{u.serialNumber}</Td>
                    <Td><Badge className="bg-amber-100 text-amber-700">{u.status.name}</Badge></Td>
                    <Td>{u.currentHolder?.name ?? "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      ) : (
        <>
          {balances.length > 0 && (
            <Card className="mb-4">
              <div className="p-3 font-semibold text-slate-700">מלאי כמותי</div>
              <Table>
                <thead><tr><Th>פריט</Th><Th>סטטוס</Th><Th>מידוף</Th><Th>כמות</Th></tr></thead>
                <tbody>
                  {balances.map((b) => (
                    <tr key={b.id}>
                      <Td className="font-medium">{b.itemType.name}</Td>
                      <Td><Badge>{b.status.name}</Badge></Td>
                      <Td className="text-xs text-slate-500">{b.location ? `${b.location.column}-${b.location.row}` : "—"}</Td>
                      <Td className="font-bold">{b.quantity} {b.itemType.unit}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          )}
          <Card>
            <div className="p-3 font-semibold text-slate-700">מלאי פרטני / אצווה</div>
            {serialUnits.length === 0 ? <EmptyState>אין פריטים פרטניים</EmptyState> : (
              <Table>
                <thead><tr><Th>פריט</Th><Th>מס״ד</Th><Th>סוג</Th><Th>סטטוס</Th><Th>מידוף</Th><Th>חתום על</Th></tr></thead>
                <tbody>
                  {serialUnits.map((s) => (
                    <tr key={s.id}>
                      <Td className="font-medium">{s.itemType.name}</Td>
                      <Td className="font-mono text-xs">{s.serialNumber}{s.lotQuantity ? ` ×${s.lotQuantity}` : ""}</Td>
                      <Td><Badge>{TRACKING_METHOD[s.itemType.trackingMethod]}</Badge></Td>
                      <Td><Badge>{s.status.name}</Badge></Td>
                      <Td className="text-xs text-slate-500">{s.location ? `${s.location.column}-${s.location.row}` : "—"}</Td>
                      <Td>{s.signedSoldier ? <span className="text-blue-600 text-sm">{s.signedSoldier.fullName}</span> : "—"}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function TabLink({ type, id, active, label }: { type: string; id: string; active: boolean; label: string }) {
  return (
    <Link
      href={`/warehouses/${type}?tab=${id}`}
      className={`px-4 py-2 text-sm rounded-t-lg ${active ? "bg-white border border-b-0 border-slate-200 font-semibold text-slate-800" : "text-slate-500 hover:text-slate-800"}`}
    >
      {label}
    </Link>
  );
}
