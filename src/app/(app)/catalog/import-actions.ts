"use server";

import { revalidatePath } from "next/cache";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/guard";
import { audit } from "@/lib/audit";
import type { TrackingMethod } from "@/generated/prisma";

function cell(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && "text" in v) return String((v as { text: string }).text);
  if (typeof v === "object" && "result" in v) return String((v as { result: unknown }).result);
  return String(v).trim();
}

const METHOD_MAP: Record<string, TrackingMethod> = {
  "כמותי": "QUANTITY", QUANTITY: "QUANTITY",
  "פרטני": "SERIAL", "סריאלי": "SERIAL", SERIAL: "SERIAL",
  "אצווה": "LOT", LOT: "LOT",
  "ערכה": "KIT", "קיט": "KIT", KIT: "KIT",
};

const YES = new Set(["כן", "yes", "true", "1", "v", "✓"]);

/** ייבוא פריטים מאקסל. עמודות: מק"ט | שם | קטגוריה | שיטת ניהול | יחידה | רגיש | מעקב מיקום */
export async function importItems(formData: FormData): Promise<void> {
  const user = await requireCapability("catalog.manage");
  const bId = user.battalionId!;
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return;

  const wb = new ExcelJS.Workbook();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await wb.xlsx.load(Buffer.from(await file.arrayBuffer()) as any);
  const ws = wb.worksheets[0];
  if (!ws) return;

  const cats = await prisma.category.findMany({ where: { battalionId: bId } });
  const catByName = new Map(cats.map((c) => [c.name.trim(), c.id]));

  let created = 0;
  const rows: { sku: string; name: string; categoryId: string; trackingMethod: TrackingMethod; unit: string; isSensitive: boolean; trackLocation: boolean }[] = [];
  ws.eachRow((row, idx) => {
    if (idx === 1) return;
    const sku = cell(row.getCell(1).value);
    const name = cell(row.getCell(2).value);
    const categoryName = cell(row.getCell(3).value);
    const method = METHOD_MAP[cell(row.getCell(4).value)] || "QUANTITY";
    const unit = cell(row.getCell(5).value) || "יח'";
    const isSensitive = YES.has(cell(row.getCell(6).value).toLowerCase());
    const trackLocation = YES.has(cell(row.getCell(7).value).toLowerCase());
    const categoryId = catByName.get(categoryName);
    if (!sku || !name || !categoryId) return; // קטגוריה חייבת להתקיים
    rows.push({ sku, name, categoryId, trackingMethod: method, unit, isSensitive, trackLocation });
  });

  for (const r of rows) {
    try {
      await prisma.itemType.upsert({
        where: { battalionId_sku: { battalionId: bId, sku: r.sku } },
        create: { battalionId: bId, ...r },
        update: { name: r.name, categoryId: r.categoryId, trackingMethod: r.trackingMethod, unit: r.unit, isSensitive: r.isSensitive, trackLocation: r.trackLocation },
      });
      created++;
    } catch {
      // דלג
    }
  }

  await audit(user.id, "IMPORT", "ItemType", null, { count: created });
  revalidatePath("/catalog");
}
