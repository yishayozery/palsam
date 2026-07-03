import { requireScreen } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import ExpiryView from "./ExpiryView";

export const dynamic = "force-dynamic";

const DEFAULT_ALERT_DAYS = 90;

export default async function ExpiryPage() {
  const user = await requireScreen("stock");
  const bId = user.battalionId!;

  const units = await prisma.serialUnit.findMany({
    where: {
      battalionId: bId,
      dischargedAt: null,
      expiryDate: { not: null },
    },
    select: {
      id: true,
      serialNumber: true,
      lotQuantity: true,
      expiryDate: true,
      itemType: { select: { name: true, sku: true, expiryAlertDays: true, category: { select: { name: true } } } },
      currentHolder: { select: { name: true, kind: true } },
      signedSoldier: { select: { fullName: true } },
      equipmentLocation: { select: { name: true } },
      status: { select: { name: true } },
    },
    orderBy: { expiryDate: "asc" },
  });

  const now = Date.now();
  const DAY = 86400000;
  const rows = units.map((u) => {
    const exp = u.expiryDate!.getTime();
    const daysLeft = Math.floor((exp - now) / DAY);
    const alertDays = u.itemType.expiryAlertDays ?? DEFAULT_ALERT_DAYS;
    const state: "expired" | "alert" | "ok" = daysLeft < 0 ? "expired" : daysLeft <= alertDays ? "alert" : "ok";
    return {
      id: u.id,
      itemName: u.itemType.name,
      sku: u.itemType.sku,
      category: u.itemType.category?.name ?? "—",
      serial: u.serialNumber,
      lotQuantity: u.lotQuantity,
      expiryISO: u.expiryDate!.toISOString(),
      daysLeft,
      alertDays,
      state,
      holder: u.currentHolder?.name ?? "—",
      soldier: u.signedSoldier?.fullName ?? null,
      location: u.equipmentLocation?.name ?? null,
      statusName: u.status.name,
    };
  });

  const expired = rows.filter((r) => r.state === "expired").length;
  const alert = rows.filter((r) => r.state === "alert").length;

  return (
    <div>
      <PageHeader
        title="📅 ניהול תוקף"
        subtitle="ציוד עם תאריך תפוגה — התראה לפריטים שפגו או שתוקפם עומד לפוג (לפי סף פר-פריט)."
      />
      <ExpiryView rows={rows} expiredCount={expired} alertCount={alert} />
    </div>
  );
}
