import ExcelJS from "exceljs";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/guard";
import { prisma } from "@/lib/prisma";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const plan = await prisma.countPlan.findUnique({
    where: { id },
    include: {
      tasks: {
        include: {
          holder: { select: { name: true, kind: true } },
          assignedUser: { select: { fullName: true } },
          session: {
            include: {
              lines: { include: { itemType: { select: { name: true } }, serialUnit: { include: { signedSoldier: { select: { fullName: true } } } } } },
              discrepancies: { include: { itemType: { select: { name: true } } } },
            },
          },
        },
        orderBy: [{ holder: { name: "asc" } }],
      },
    },
  });
  if (!plan || plan.battalionId !== user.battalionId) notFound();

  const wb = new ExcelJS.Workbook();

  // === גליון סיכום ===
  const ws = wb.addWorksheet("סיכום", { views: [{ rightToLeft: true }] });
  ws.columns = [
    { header: "מחסן/פלוגה", key: "holder", width: 22 },
    { header: "אחראי דיווח", key: "assignee", width: 22 },
    { header: "מתוזמן", key: "scheduled", width: 18 },
    { header: "סטטוס", key: "status", width: 12 },
    { header: "סה״כ פריטים", key: "items", width: 12 },
    { header: "פערים", key: "gaps", width: 10 },
    { header: "ספירה חוזרת בוצעה", key: "recount", width: 18 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };

  for (const t of plan.tasks) {
    const recount = t.session?.lines.filter((l) => (l.note ?? "").includes("ספירה חוזרת")).length ?? 0;
    ws.addRow({
      holder: t.holder.name,
      assignee: t.assignedUser?.fullName ?? "",
      scheduled: t.scheduledAt.toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" }),
      status: t.status,
      items: t.session?.lines.length ?? 0,
      gaps: t.session?.discrepancies.length ?? 0,
      recount,
    });
  }

  // === גליון פערים ===
  const gapsWs = wb.addWorksheet("פערים", { views: [{ rightToLeft: true }] });
  gapsWs.columns = [
    { header: "מחסן/פלוגה", key: "holder", width: 22 },
    { header: "פריט", key: "item", width: 22 },
    { header: "צפוי", key: "expected", width: 10 },
    { header: "נספר", key: "counted", width: 10 },
    { header: "הפרש", key: "diff", width: 10 },
    { header: "סוג", key: "kind", width: 12 },
    { header: "סטטוס", key: "status", width: 12 },
  ];
  gapsWs.getRow(1).font = { bold: true };
  gapsWs.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } };
  for (const t of plan.tasks) {
    for (const d of t.session?.discrepancies ?? []) {
      gapsWs.addRow({
        holder: t.holder.name,
        item: d.itemType.name,
        expected: d.expectedQty,
        counted: d.countedQty,
        diff: d.diff,
        kind: d.kind === "LOSS" ? "חוסר" : d.kind === "SURPLUS" ? "עודף" : "סטטוס",
        status: d.status,
      });
    }
  }

  // === גליון סריאלים ===
  const serialsWs = wb.addWorksheet("סריאליים", { views: [{ rightToLeft: true }] });
  serialsWs.columns = [
    { header: "מחסן/פלוגה", key: "holder", width: 22 },
    { header: "פריט", key: "item", width: 22 },
    { header: "מס׳ סריאל", key: "sn", width: 18 },
    { header: "מיקום פיזי", key: "loc", width: 18 },
    { header: "חתום על חייל", key: "soldier", width: 22 },
    { header: "צפוי", key: "expected", width: 10 },
    { header: "נספר", key: "counted", width: 10 },
  ];
  serialsWs.getRow(1).font = { bold: true };
  serialsWs.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
  for (const t of plan.tasks) {
    for (const l of t.session?.lines ?? []) {
      if (!l.serialUnitId) continue;
      serialsWs.addRow({
        holder: t.holder.name,
        item: l.itemType.name,
        sn: l.serialUnit?.serialNumber ?? "",
        loc: l.serialUnit?.physicalLocation ?? "",
        soldier: l.serialUnit?.signedSoldier?.fullName ?? "",
        expected: l.expectedQty,
        counted: l.countedQty ?? "",
      });
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  const ts = new Date().toISOString().split("T")[0];
  const filename = `count-plan-${plan.name.replace(/\s+/g, "_")}-${ts}.xlsx`;
  return new Response(buf as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
