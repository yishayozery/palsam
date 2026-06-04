"use server";

import { revalidatePath } from "next/cache";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/guard";
import { audit } from "@/lib/audit";

function cell(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && "text" in v) return String((v as { text: string }).text);
  if (typeof v === "object" && "result" in v) return String((v as { result: unknown }).result);
  return String(v).trim();
}

/** ייבוא חיילים מקובץ אקסל. עמודות: שם מלא | מספר אישי | טלפון | פלוגה(אופציונלי) */
export async function importSoldiers(formData: FormData): Promise<void> {
  const user = await requireCapability("company.manage");
  const bId = user.battalionId!;
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return;

  const wb = new ExcelJS.Workbook();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await wb.xlsx.load(Buffer.from(await file.arrayBuffer()) as any);
  const ws = wb.worksheets[0];
  if (!ws) return;

  // מיפוי פלוגות לפי שם (אם אין שיוך קבוע למשתמש)
  const companies = await prisma.holder.findMany({ where: { battalionId: bId, kind: "COMPANY" } });
  const byName = new Map(companies.map((c) => [c.name.trim(), c.id]));

  let created = 0;
  const rows: { fullName: string; personalNumber: string; phone: string | null; platoon: string | null; companyId: string | null }[] = [];
  ws.eachRow((row, idx) => {
    if (idx === 1) return; // כותרת
    const fullName = cell(row.getCell(1).value);
    const personalNumber = cell(row.getCell(2).value);
    const phone = cell(row.getCell(3).value) || null;
    const platoon = cell(row.getCell(4).value) || null;
    const companyName = cell(row.getCell(5).value);
    if (!fullName || !personalNumber) return;
    const companyId = user.holderId || byName.get(companyName) || null;
    rows.push({ fullName, personalNumber, phone, platoon, companyId });
  });

  for (const r of rows) {
    try {
      await prisma.soldier.upsert({
        where: { battalionId_personalNumber: { battalionId: bId, personalNumber: r.personalNumber } },
        create: { battalionId: bId, ...r },
        update: { fullName: r.fullName, phone: r.phone, platoon: r.platoon, ...(r.companyId ? { companyId: r.companyId } : {}) },
      });
      created++;
    } catch {
      // דלג על שורה שגויה
    }
  }

  await audit(user.id, "IMPORT", "Soldier", null, { count: created });
  revalidatePath("/soldiers");
}
