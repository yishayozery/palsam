import { requireUser } from "@/lib/guard";
import { can } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getWarehouseStateReport, getWarehouseMovementsReport } from "@/lib/warehouseReports";
import ReportsClient from "./ReportsClient";

export const dynamic = "force-dynamic";

function ilToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
}

export default async function WarehouseReportsPage({ searchParams }: { searchParams: Promise<{ warehouse?: string; tab?: string; from?: string; to?: string }> }) {
  const user = await requireUser();
  if (!can(user, "signatures.manage") && !can(user, "reports.view") && !user.isAdmin) redirect("/dashboard");
  const bId = user.battalionId!;
  const sp = await searchParams;

  const isMafam = user.isAdmin || user.isSuperAdmin || can(user, "battalion.profile");
  const warehouses = await prisma.holder.findMany({
    where: { battalionId: bId, kind: "WAREHOUSE", active: true, ...(isMafam ? {} : { id: { in: user.holderIds } }) },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const selectedId = (sp.warehouse && warehouses.some((w) => w.id === sp.warehouse)) ? sp.warehouse
    : (user.holderId && warehouses.some((w) => w.id === user.holderId)) ? user.holderId
    : warehouses[0]?.id;
  const selectedName = warehouses.find((w) => w.id === selectedId)?.name ?? "";

  const tab = sp.tab === "movements" ? "movements" : "state";
  const today = ilToday();
  const from = sp.from || today;
  const to = sp.to || from;

  const state = tab === "state" && selectedId ? await getWarehouseStateReport(bId, selectedId) : null;
  const movements = tab === "movements" && selectedId ? await getWarehouseMovementsReport(bId, selectedId, from, to) : null;

  return (
    <ReportsClient
      warehouses={warehouses}
      selectedId={selectedId ?? ""}
      selectedName={selectedName}
      tab={tab}
      from={from}
      to={to}
      state={state}
      movements={movements ? { ...movements, detail: movements.detail.map((d) => ({ ...d, time: d.time.toISOString() })) } : null}
    />
  );
}
