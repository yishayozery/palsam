import ExcelJS from "exceljs";
import { requireCapability } from "@/lib/guard";
import { prisma } from "@/lib/prisma";

/**
 * 📊 דוח כל הציוד של הפלוגה עם מיקומים פיזיים.
 * משלב 3 סוגים: סריאלי/אצוות, כמותי במלאי הפלוגה, כמותי חתום על חייל.
 */
export async function GET() {
  const user = await requireCapability("company.manage");
  const bId = user.battalionId!;
  const companyId = user.holderId;
  if (!companyId) {
    return new Response("לא משויך לפלוגה", { status: 400 });
  }

  const [company, serialUnits, qtyStock, soldiers, locations] = await Promise.all([
    prisma.holder.findUnique({ where: { id: companyId }, select: { name: true } }),
    prisma.serialUnit.findMany({
      where: { battalionId: bId, OR: [{ currentHolderId: companyId }, { signedSoldier: { companyId } }] },
      include: {
        itemType: { select: { name: true, sku: true, trackingMethod: true, unit: true, category: { select: { name: true } } } },
        status: { select: { name: true } },
        signedSoldier: { select: { fullName: true, personalNumber: true } },
        equipmentLocation: { select: { name: true } },
        currentHolder: { select: { name: true } },
      },
      orderBy: [{ itemType: { name: "asc" } }, { serialNumber: "asc" }],
    }),
    prisma.stockBalance.findMany({
      where: { battalionId: bId, holderId: companyId, quantity: { gt: 0 }, itemType: { trackingMethod: "QUANTITY" } },
      include: {
        itemType: { select: { name: true, sku: true, unit: true, category: { select: { name: true } } } },
        status: { select: { name: true } },
        equipmentLocation: { select: { name: true } },
      },
      orderBy: [{ itemType: { name: "asc" } }],
    }),
    prisma.soldier.findMany({
      where: { battalionId: bId, companyId, active: true },
      select: { id: true, fullName: true, personalNumber: true },
    }),
    prisma.equipmentLocation.findMany({
      where: { holderId: companyId, active: true },
      select: { id: true, name: true },
    }),
  ]);

  const soldierIds = soldiers.map((s) => s.id);
  const signedQtyLines = soldierIds.length === 0 ? [] : await prisma.transferLine.findMany({
    where: {
      transfer: { battalionId: bId, status: "COMPLETED", type: { in: ["SIGNOUT", "CHECKIN"] }, toSoldierId: { in: soldierIds } },
      serialUnitId: null,
      itemType: { trackingMethod: "QUANTITY" },
    },
    include: {
      itemType: { select: { name: true, sku: true, unit: true, category: { select: { name: true } } } },
      status: { select: { name: true } },
      transfer: { select: { type: true, toSoldierId: true } },
    },
  });
  type SignedAgg = {
    soldierId: string; itemTypeId: string; statusId: string;
    itemName: string; sku: string | null; unit: string; categoryName: string | null;
    statusName: string; quantity: number;
  };
  const signedAggMap = new Map<string, SignedAgg>();
  for (const l of signedQtyLines) {
    const sId = l.transfer.toSoldierId;
    if (!sId || !l.statusId) continue;
    const k = `${sId}|${l.itemTypeId}|${l.statusId}`;
    const sign = l.transfer.type === "SIGNOUT" ? 1 : -1;
    const cur = signedAggMap.get(k);
    if (cur) cur.quantity += sign * l.quantity;
    else signedAggMap.set(k, {
      soldierId: sId, itemTypeId: l.itemTypeId, statusId: l.statusId,
      itemName: l.itemType.name, sku: l.itemType.sku, unit: l.itemType.unit,
      categoryName: l.itemType.category?.name ?? null,
      statusName: l.status!.name, quantity: sign * l.quantity,
    });
  }
  const signedRows = Array.from(signedAggMap.values()).filter((a) => a.quantity > 0);
  const placements = soldierIds.length === 0 ? [] : await prisma.soldierItemLocation.findMany({
    where: { battalionId: bId, soldierId: { in: soldierIds } },
    select: { soldierId: true, itemTypeId: true, statusId: true, equipmentLocationId: true, quantity: true },
  });
  const locNameById = new Map(locations.map((l) => [l.id, l.name]));
  const soldierById = new Map(soldiers.map((s) => [s.id, s]));

  // ===== Excel =====
  const wb = new ExcelJS.Workbook();
  const HEADER_FILL = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFE2E8F0" } };
  const headerStyle = (ws: ExcelJS.Worksheet) => {
    const r = ws.getRow(1);
    r.font = { bold: true };
    r.fill = HEADER_FILL;
  };

  // Sheet 1: דוח מאוחד - כל פריט מפוצל לפי שורות
  const ws = wb.addWorksheet("כל הציוד", { views: [{ rightToLeft: true }] });
  ws.columns = [
    { header: "סוג", key: "type", width: 10 },
    { header: "פריט", key: "name", width: 28 },
    { header: "מק״ט", key: "sku", width: 14 },
    { header: "קטגוריה", key: "category", width: 16 },
    { header: "סטטוס", key: "status", width: 12 },
    { header: "כמות", key: "qty", width: 8 },
    { header: "יחידה", key: "unit", width: 8 },
    { header: 'מס"ב', key: "sn", width: 16 },
    { header: "חייל חתום", key: "soldier", width: 22 },
    { header: "מ.א.", key: "pn", width: 12 },
    { header: "📍 מיקום", key: "loc", width: 22 },
  ];
  headerStyle(ws);

  // סריאלי
  for (const u of serialUnits) {
    ws.addRow({
      type: u.lotQuantity && u.lotQuantity > 1 ? "אצווה" : "סריאלי",
      name: u.itemType.name, sku: u.itemType.sku ?? "",
      category: u.itemType.category?.name ?? "",
      status: u.status.name,
      qty: u.lotQuantity ?? 1, unit: u.itemType.unit,
      sn: u.serialNumber,
      soldier: u.signedSoldier?.fullName ?? "",
      pn: u.signedSoldier?.personalNumber ?? "",
      loc: u.equipmentLocation?.name ?? "— ללא מיקום —",
    });
  }

  // כמותי במלאי
  for (const s of qtyStock) {
    ws.addRow({
      type: "כמותי",
      name: s.itemType.name, sku: s.itemType.sku ?? "",
      category: s.itemType.category?.name ?? "",
      status: s.status.name,
      qty: s.quantity, unit: s.itemType.unit,
      sn: "", soldier: "", pn: "",
      loc: s.equipmentLocation?.name ?? "— ללא מיקום —",
    });
  }

  // כמותי חתום על חיילים - מתפלג לפי SoldierItemLocation
  for (const sr of signedRows) {
    const soldier = soldierById.get(sr.soldierId);
    const ps = placements.filter((p) => p.soldierId === sr.soldierId && p.itemTypeId === sr.itemTypeId && p.statusId === sr.statusId);
    if (ps.length === 0) {
      // הכל לא ממוקם
      ws.addRow({
        type: "חתום-חייל",
        name: sr.itemName, sku: sr.sku ?? "",
        category: sr.categoryName ?? "",
        status: sr.statusName, qty: sr.quantity, unit: sr.unit,
        sn: "", soldier: soldier?.fullName ?? "", pn: soldier?.personalNumber ?? "",
        loc: "— ללא מיקום —",
      });
      continue;
    }
    const placed = ps.reduce((a, p) => a + p.quantity, 0);
    for (const p of ps) {
      ws.addRow({
        type: "חתום-חייל",
        name: sr.itemName, sku: sr.sku ?? "",
        category: sr.categoryName ?? "",
        status: sr.statusName, qty: p.quantity, unit: sr.unit,
        sn: "", soldier: soldier?.fullName ?? "", pn: soldier?.personalNumber ?? "",
        loc: locNameById.get(p.equipmentLocationId) ?? "?",
      });
    }
    if (placed < sr.quantity) {
      ws.addRow({
        type: "חתום-חייל",
        name: sr.itemName, sku: sr.sku ?? "",
        category: sr.categoryName ?? "",
        status: sr.statusName, qty: sr.quantity - placed, unit: sr.unit,
        sn: "", soldier: soldier?.fullName ?? "", pn: soldier?.personalNumber ?? "",
        loc: "— ללא מיקום —",
      });
    }
  }

  // Sheet 2: סיכום לפי מיקום
  const wsLoc = wb.addWorksheet("סיכום לפי מיקום", { views: [{ rightToLeft: true }] });
  wsLoc.columns = [
    { header: "מיקום", key: "loc", width: 24 },
    { header: "פריט", key: "name", width: 28 },
    { header: "כמות", key: "qty", width: 10 },
    { header: "פירוט", key: "detail", width: 30 },
  ];
  headerStyle(wsLoc);
  type LocAgg = Map<string, { name: string; qty: number; detail: string }>;
  const byLoc = new Map<string, LocAgg>();
  const ensureLoc = (locName: string): LocAgg => {
    if (!byLoc.has(locName)) byLoc.set(locName, new Map());
    return byLoc.get(locName)!;
  };
  for (const u of serialUnits) {
    const m = ensureLoc(u.equipmentLocation?.name ?? "— ללא מיקום —");
    const k = `${u.itemType.name}|${u.status.name}`;
    const cur = m.get(k) ?? { name: `${u.itemType.name} (${u.status.name})`, qty: 0, detail: "" };
    cur.qty += u.lotQuantity ?? 1;
    cur.detail = (cur.detail ? cur.detail + ", " : "") + `SN ${u.serialNumber}`;
    m.set(k, cur);
  }
  for (const s of qtyStock) {
    const m = ensureLoc(s.equipmentLocation?.name ?? "— ללא מיקום —");
    const k = `${s.itemType.name}|${s.status.name}`;
    const cur = m.get(k) ?? { name: `${s.itemType.name} (${s.status.name})`, qty: 0, detail: "מלאי הפלוגה" };
    cur.qty += s.quantity;
    m.set(k, cur);
  }
  for (const p of placements) {
    const sr = signedRows.find((r) => r.soldierId === p.soldierId && r.itemTypeId === p.itemTypeId && r.statusId === p.statusId);
    if (!sr) continue;
    const m = ensureLoc(locNameById.get(p.equipmentLocationId) ?? "?");
    const k = `${sr.itemName}|${sr.statusName}`;
    const cur = m.get(k) ?? { name: `${sr.itemName} (${sr.statusName})`, qty: 0, detail: "" };
    cur.qty += p.quantity;
    const soldier = soldierById.get(sr.soldierId);
    cur.detail = (cur.detail ? cur.detail + ", " : "") + `${soldier?.fullName ?? ""}`;
    m.set(k, cur);
  }
  const sortedLocs = Array.from(byLoc.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  for (const [locName, items] of sortedLocs) {
    const sorted = Array.from(items.values()).sort((a, b) => a.name.localeCompare(b.name));
    for (const it of sorted) {
      wsLoc.addRow({ loc: locName, name: it.name, qty: it.qty, detail: it.detail });
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  const ts = new Date().toISOString().split("T")[0];
  const compName = (company?.name ?? "company").replace(/[^\w֐-׿]/g, "_");
  return new Response(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="equipment-locations-${compName}-${ts}.xlsx"`,
    },
  });
}
