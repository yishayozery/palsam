import ExcelJS from "exceljs";
import { requireCapability } from "@/lib/guard";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await requireCapability("warehouse.operate");
  const bId = user.battalionId!;

  const isWM = user.role === "WAREHOUSE_MANAGER";
  const myWHTypes: string[] = [];
  if (isWM && user.holderIds?.length) {
    const h = await prisma.holder.findMany({
      where: { id: { in: user.holderIds }, kind: "WAREHOUSE" },
      select: { warehouseType: true },
    });
    for (const x of h) if (x.warehouseType) myWHTypes.push(x.warehouseType);
  }
  const scoped = isWM && myWHTypes.length > 0;

  const units = await prisma.serialUnit.findMany({
    where: {
      battalionId: bId,
      dischargedAt: null,
      ...(scoped ? { itemType: { category: { warehouseType: { in: myWHTypes as never[] } } } } : {}),
    },
    include: {
      itemType: { include: { category: true } },
      status: true,
      currentHolder: true,
      signedSoldier: true,
    },
    orderBy: [{ itemType: { name: "asc" } }, { serialNumber: "asc" }],
  });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("סריאליים", { views: [{ rightToLeft: true }] });
  ws.columns = [
    { header: "מס׳ סריאל", key: "sn", width: 20 },
    { header: "פריט", key: "name", width: 24 },
    { header: "מק״ט", key: "sku", width: 14 },
    { header: "קטגוריה", key: "category", width: 16 },
    { header: "שיטה", key: "method", width: 12 },
    { header: "כמות (אצווה)", key: "qty", width: 10 },
    { header: "סטטוס", key: "status", width: 14 },
    { header: "מיקום", key: "holder", width: 16 },
    { header: "חתום על חייל", key: "soldier", width: 22 },
    { header: "מ.א.", key: "pn", width: 12 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };

  for (const u of units) {
    ws.addRow({
      sn: u.serialNumber,
      name: u.itemType.name,
      sku: u.itemType.sku ?? "",
      category: u.itemType.category?.name ?? "",
      method: u.itemType.trackingMethod,
      qty: u.lotQuantity ?? 1,
      status: u.status.name,
      holder: u.currentHolder?.name ?? "",
      soldier: u.signedSoldier?.fullName ?? "",
      pn: u.signedSoldier?.personalNumber ?? "",
    });
  }

  const buf = await wb.xlsx.writeBuffer();
  const ts = new Date().toISOString().split("T")[0];
  return new Response(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="serials-${ts}.xlsx"`,
    },
  });
}
