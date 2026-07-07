import { requireUser } from "@/lib/guard";
import { can } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import WarehouseReportClient from "./WarehouseReportClient";

export const dynamic = "force-dynamic";

export default async function WarehouseReportPage({ searchParams }: { searchParams: Promise<{ warehouse?: string }> }) {
  const user = await requireUser();
  if (!can(user, "signatures.manage") && !can(user, "reports.view") && !user.isAdmin) redirect("/dashboard");
  const bId = user.battalionId!;
  const sp = await searchParams;

  const isMafam = user.isAdmin || user.isSuperAdmin || can(user, "battalion.profile");
  const warehouses = await prisma.holder.findMany({
    where: { battalionId: bId, kind: "WAREHOUSE", active: true, ...(isMafam ? {} : { id: { in: user.holderIds } }) },
    select: { id: true, name: true, warehouseType: true },
    orderBy: { name: "asc" },
  });
  const selectedId = (sp.warehouse && warehouses.some((w) => w.id === sp.warehouse)) ? sp.warehouse
    : (user.holderId && warehouses.some((w) => w.id === user.holderId)) ? user.holderId
    : warehouses[0]?.id;

  // פריטים סריאליים חתומים במחסן זה
  const units = selectedId ? await prisma.serialUnit.findMany({
    where: { battalionId: bId, currentHolderId: selectedId, signedSoldierId: { not: null } },
    select: {
      serialNumber: true,
      physicalLocation: true,
      expiryDate: true,
      itemType: { select: { name: true } },
      status: { select: { name: true } },
      equipmentLocation: { select: { name: true } },
      signedSoldier: { select: { id: true, fullName: true, personalNumber: true, company: { select: { name: true } } } },
    },
  }) : [];

  // פריטים כמותיים חתומים (נטו SIGNOUT-CHECKIN) מהמחסן — לחיילים
  const qtyLines = selectedId ? await prisma.transferLine.findMany({
    where: {
      serialUnitId: null,
      transfer: { battalionId: bId, status: "COMPLETED", type: { in: ["SIGNOUT", "CHECKIN"] }, fromHolderId: selectedId, toSoldierId: { not: null } },
      itemType: { trackingMethod: "QUANTITY" },
    },
    select: { quantity: true, itemType: { select: { name: true } }, transfer: { select: { type: true, toSoldierId: true } } },
  }) : [];

  // מספרי ברזל למחסן
  const indexes = selectedId ? await prisma.warehouseSoldierIndex.findMany({ where: { holderId: selectedId }, select: { soldierId: true, number: true } }) : [];
  const ironBy = new Map(indexes.map((i) => [i.soldierId, i.number]));

  // קיבוץ: פלוגה → חייל → פריטים
  type Item = { name: string; serial: string | null; status: string | null; qty?: number; location?: string | null; expiry?: string | null };
  const bySoldier = new Map<string, { name: string; pn: string | null; company: string; iron: number | null; items: Item[] }>();
  const ensure = (id: string, name: string, pn: string | null, company: string) => {
    if (!bySoldier.has(id)) bySoldier.set(id, { name, pn, company, iron: ironBy.get(id) ?? null, items: [] });
    return bySoldier.get(id)!;
  };
  for (const u of units) {
    if (!u.signedSoldier) continue;
    ensure(u.signedSoldier.id, u.signedSoldier.fullName, u.signedSoldier.personalNumber, u.signedSoldier.company?.name ?? "— ללא פלוגה —")
      .items.push({ name: u.itemType.name, serial: u.serialNumber, status: u.status?.name ?? null, location: u.equipmentLocation?.name || u.physicalLocation || null, expiry: u.expiryDate ? u.expiryDate.toISOString().slice(0, 10) : null });
  }
  // qty net per (soldier, itemName)
  const qtyNet = new Map<string, number>();
  const qtyMeta = new Map<string, { sid: string; name: string }>();
  for (const l of qtyLines) {
    const sid = l.transfer.toSoldierId!;
    const key = `${sid}|${l.itemType.name}`;
    qtyNet.set(key, (qtyNet.get(key) ?? 0) + (l.transfer.type === "SIGNOUT" ? 1 : -1) * l.quantity);
    qtyMeta.set(key, { sid, name: l.itemType.name });
  }
  for (const [key, net] of qtyNet) {
    if (net <= 0) continue;
    const m = qtyMeta.get(key)!;
    const s = bySoldier.get(m.sid);
    if (s) s.items.push({ name: m.name, serial: null, status: null, qty: net });
  }

  // קיבוץ לפי פלוגה
  const byCompany = new Map<string, { id: string; name: string; pn: string | null; iron: number | null; items: Item[] }[]>();
  for (const [id, s] of bySoldier) {
    if (!byCompany.has(s.company)) byCompany.set(s.company, []);
    byCompany.get(s.company)!.push({ id, name: s.name, pn: s.pn, iron: s.iron, items: s.items });
  }
  const companies = [...byCompany.entries()]
    .map(([name, soldiers]) => ({ name, soldiers: soldiers.sort((a, b) => (a.iron ?? 9e9) - (b.iron ?? 9e9) || a.name.localeCompare(b.name)) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const selectedName = warehouses.find((w) => w.id === selectedId)?.name ?? "";
  const totalItems = [...bySoldier.values()].reduce((n, s) => n + s.items.length, 0);

  return (
    <div>
      <PageHeader
        title="📋 דוח מחסן — ציוד חתום לפי פלוגה"
        subtitle={`${selectedName} · ${bySoldier.size} חיילים · ${totalItems} פריטים`}
      />
      <WarehouseReportClient
        warehouses={warehouses.map((w) => ({ id: w.id, name: w.name }))}
        selectedId={selectedId ?? ""}
        selectedName={selectedName}
        canEditIron={can(user, "signatures.manage")}
        companies={companies}
      />
    </div>
  );
}
