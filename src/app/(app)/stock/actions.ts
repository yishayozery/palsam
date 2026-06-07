"use server";

import { revalidatePath } from "next/cache";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/guard";
import { audit } from "@/lib/audit";
import { adjustQuantity, defaultStatusId } from "@/lib/inventory";
import { extractPersonalId } from "@/lib/handover";

function cell(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && "text" in v) return String((v as { text: string }).text);
  return String(v).trim();
}

async function pickWarehouse(bId: string, itemTypeId: string) {
  const item = await prisma.itemType.findUnique({ where: { id: itemTypeId }, include: { category: true } });
  if (!item) return null;
  const wtype = item.category?.warehouseType;
  // 1) מחסן תואם לקטגוריה (M4 → ARMORY)
  if (wtype) {
    const exact = await prisma.holder.findFirst({ where: { battalionId: bId, kind: "WAREHOUSE", warehouseType: wtype } });
    if (exact) return exact;
  }
  // 2) פריט תרומה — בעלים
  if (item.ownerHolderId) {
    const owner = await prisma.holder.findUnique({ where: { id: item.ownerHolderId } });
    if (owner) return owner;
  }
  // 3) fallback — מחסן ראשון בגדוד (כללי)
  return prisma.holder.findFirst({ where: { battalionId: bId, kind: "WAREHOUSE" }, orderBy: { createdAt: "asc" } });
}

function revalidateAll() {
  revalidatePath("/stock");
  revalidatePath("/items");
  revalidatePath("/inventory");
  revalidatePath("/warehouses");
}

/** הוספת מלאי כמותי — מוסיף לכמות הקיימת (לא מחליף) */
export async function declareQty(formData: FormData) {
  try {
  const user = await requireCapability("warehouse.operate");
  const bId = user.battalionId!;
  const itemTypeId = String(formData.get("itemTypeId") || "");
  const quantity = Math.max(1, parseInt(String(formData.get("quantity") || "0"), 10) || 0);
  const statusId = String(formData.get("statusId") || "") || (await defaultStatusId(prisma, bId));
  const externalUnit = String(formData.get("externalUnit") || "").trim() || "חטיבה";
  const externalContact = String(formData.get("externalContact") || "").trim() || null;
  let recipientPersonalId: string | null = null;
  try { recipientPersonalId = await extractPersonalId(bId, formData); }
  catch (e) { return { error: e instanceof Error ? e.message.replace(/^PERSONAL_ID_REQUIRED:\s*/, "") : "שגיאה במספר אישי" }; }

  const wh = await pickWarehouse(bId, itemTypeId);
  if (!wh) return { error: "לא נמצא מחסן מתאים לפריט זה" };

  await prisma.$transaction(async (tx) => {
    await adjustQuantity(tx, bId, itemTypeId, wh.id, statusId, quantity);
    await tx.transfer.create({
      data: {
        battalionId: bId, type: "INTAKE", status: "COMPLETED",
        toHolderId: wh.id, reason: "הוספת מלאי",
        externalUnit, externalContact, recipientPersonalId,
        createdById: user.id, approvedById: user.id, approvedAt: new Date(),
        lines: { create: { itemTypeId, quantity, statusId } },
      },
    });
  });

  await audit(user.id, "ADD_QTY", "ItemType", itemTypeId, { quantity, statusId, externalUnit, externalContact, recipientPersonalId });
  revalidateAll();
  return { ok: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message.replace(/^Error:\s*/, "") : "שגיאה" };
  }
}

/** הוספת יחידות סריאליות לפי מספרים שהוקלדו (אחת בשורה / בפסיק) */
/**
 * 🆕 תעודת קליטה רב-פריטית — קולט מספר פריטים בתעודה אחת (Transfer יחיד עם N שורות).
 * formData:
 *   externalUnit, externalContact, recipientPersonalId
 *   line:<idx>:itemTypeId, line:<idx>:trackingMethod, line:<idx>:statusId,
 *   line:<idx>:quantity, line:<idx>:serials (newline-separated), line:<idx>:lotNumber
 */
export async function declareMulti(formData: FormData): Promise<{ ok?: boolean; error?: string; transferId?: string }> {
  try {
    const user = await requireCapability("warehouse.operate");
    const bId = user.battalionId!;
    const externalUnit = String(formData.get("externalUnit") || "").trim() || "חטיבה";
    const externalContact = String(formData.get("externalContact") || "").trim() || null;
    let recipientPersonalId: string | null = null;
    try { recipientPersonalId = await extractPersonalId(bId, formData); }
    catch (e) { return { error: e instanceof Error ? e.message.replace(/^PERSONAL_ID_REQUIRED:\s*/, "") : "שגיאה במספר אישי" }; }

    // שליפת כל השורות (line:0:..., line:1:..., ...)
    const idxs = new Set<number>();
    for (const [k] of formData.entries()) {
      const m = k.match(/^line:(\d+):/);
      if (m) idxs.add(parseInt(m[1], 10));
    }
    const lines = [...idxs].sort((a, b) => a - b);
    if (lines.length === 0) return { error: "לא נבחרו פריטים לקליטה" };

    const defStatus = await defaultStatusId(prisma, bId);
    let transferId = "";

    await prisma.$transaction(async (tx) => {
      // משתמשים במחסן של הפריט הראשון לזיהוי toHolder; כל שורה תיקלט למחסן הנכון שלה לפי category
      const firstItemTypeId = String(formData.get(`line:${lines[0]}:itemTypeId`) || "");
      const firstWh = await pickWarehouse(bId, firstItemTypeId);
      if (!firstWh) throw new Error("לא נמצא מחסן יעד לפריט הראשון");

      const transfer = await tx.transfer.create({
        data: {
          battalionId: bId, type: "INTAKE", status: "COMPLETED",
          toHolderId: firstWh.id,
          reason: `קליטת ${lines.length} פריטים בתעודה אחת`,
          externalUnit, externalContact, recipientPersonalId,
          createdById: user.id, approvedById: user.id, approvedAt: new Date(),
        },
      });
      transferId = transfer.id;

      for (const i of lines) {
        const itemTypeId = String(formData.get(`line:${i}:itemTypeId`) || "");
        const trackingMethod = String(formData.get(`line:${i}:trackingMethod`) || "QUANTITY");
        const statusId = String(formData.get(`line:${i}:statusId`) || "") || defStatus;
        const quantity = Math.max(1, parseInt(String(formData.get(`line:${i}:quantity`) || "0"), 10) || 0);
        const serialsRaw = String(formData.get(`line:${i}:serials`) || "");
        const lotNumber = String(formData.get(`line:${i}:lotNumber`) || "").trim();
        if (!itemTypeId) continue;

        const wh = await pickWarehouse(bId, itemTypeId);
        if (!wh) continue;

        if (trackingMethod === "SERIAL") {
          const serials = serialsRaw.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
          if (serials.length === 0) throw new Error(`חסרים מספרי סריאל בשורה ${i + 1}`);
          const uniq = new Set(serials);
          if (uniq.size !== serials.length) throw new Error(`שורה ${i + 1}: יש SN כפולים`);
          const existing = await tx.serialUnit.findMany({
            where: { battalionId: bId, itemTypeId, serialNumber: { in: serials } },
            select: { serialNumber: true },
          });
          if (existing.length > 0) throw new Error(`שורה ${i + 1}: SN קיים — ${existing.map(e => e.serialNumber).join(", ")}`);
          for (const sn of serials) {
            const su = await tx.serialUnit.create({ data: { battalionId: bId, itemTypeId, serialNumber: sn, statusId, currentHolderId: wh.id } });
            await tx.transferLine.create({ data: { transferId: transfer.id, itemTypeId, quantity: 1, serialUnitId: su.id, statusId } });
          }
        } else if (trackingMethod === "LOT") {
          if (!lotNumber) throw new Error(`שורה ${i + 1}: חסר מספר אצווה`);
          if (quantity < 1) throw new Error(`שורה ${i + 1}: כמות חייבת להיות לפחות 1`);
          const su = await tx.serialUnit.create({ data: { battalionId: bId, itemTypeId, serialNumber: lotNumber, lotQuantity: quantity, statusId, currentHolderId: wh.id } });
          await tx.transferLine.create({ data: { transferId: transfer.id, itemTypeId, quantity, serialUnitId: su.id, statusId } });
        } else {
          // QUANTITY
          if (quantity < 1) throw new Error(`שורה ${i + 1}: כמות חייבת להיות לפחות 1`);
          await adjustQuantity(tx, bId, itemTypeId, wh.id, statusId, quantity);
          await tx.transferLine.create({ data: { transferId: transfer.id, itemTypeId, quantity, statusId } });
        }
      }
    });

    await audit(user.id, "DECLARE_MULTI", "Transfer", transferId, { lines: lines.length, externalUnit, recipientPersonalId });
    revalidateAll();
    return { ok: true, transferId };
  } catch (e) {
    return { error: e instanceof Error ? e.message.replace(/^Error:\s*/, "") : "שגיאה" };
  }
}

/** עטיפות חסרות-החזרה — שימוש ב-<form action={...}> ב-Server Components. */
export async function declareSerialsForm(formData: FormData): Promise<void> {
  await declareSerials(formData);
}
export async function declareQtyForm(formData: FormData): Promise<void> {
  await declareQty(formData);
}
export async function declareLotForm(formData: FormData): Promise<void> {
  await declareLot(formData);
}

export async function declareSerials(formData: FormData) {
  try {
  const user = await requireCapability("warehouse.operate");
  const bId = user.battalionId!;
  const itemTypeId = String(formData.get("itemTypeId") || "");
  const serialsRaw = String(formData.get("serials") || "");
  const statusId = String(formData.get("statusId") || "") || (await defaultStatusId(prisma, bId));
  const externalUnit = String(formData.get("externalUnit") || "").trim() || "חטיבה";
  const externalContact = String(formData.get("externalContact") || "").trim() || null;
  let recipientPersonalId: string | null = null;
  try { recipientPersonalId = await extractPersonalId(bId, formData); }
  catch (e) { return { error: e instanceof Error ? e.message.replace(/^PERSONAL_ID_REQUIRED:\s*/, "") : "שגיאה במספר אישי" }; }

  const serials = serialsRaw.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
  if (serials.length === 0) {
    return { error: "חסרים מספרי סריאל — חובה להזין SN לכל יחידה" };
  }
  // בדיקת ייחודיות גם ב-server (לא רק בקליינט)
  const uniq = new Set(serials);
  if (uniq.size !== serials.length) {
    return { error: "יש מספרי סריאל כפולים — כל SN חייב להיות ייחודי" };
  }

  const wh = await pickWarehouse(bId, itemTypeId);
  if (!wh) return { error: "לא נמצא מחסן מתאים לפריט זה" };

  // בדיקה מקדימה: SN כפולים שכבר קיימים לאותו פריט (אותו SN לפריט אחר זה תקין —
  // למשל מסגרת רובה ורכב יכולים לחלוק את אותו מספר)
  const existingDuplicates = await prisma.serialUnit.findMany({
    where: { battalionId: bId, itemTypeId, serialNumber: { in: serials } },
    select: { serialNumber: true },
  });
  if (existingDuplicates.length > 0) {
    const list = existingDuplicates.map((d) => d.serialNumber).join(", ");
    return { error: `מספרי הסריאל הבאים כבר קיימים במלאי לפריט זה: ${list}` };
  }

  let created = 0;
  const failed: string[] = [];
  await prisma.$transaction(async (tx) => {
    const transfer = await tx.transfer.create({
      data: { battalionId: bId, type: "INTAKE", status: "COMPLETED", toHolderId: wh.id, reason: "הזנת סריאליים ידני", externalUnit, externalContact, recipientPersonalId, createdById: user.id, approvedById: user.id, approvedAt: new Date() },
    });
    for (const sn of serials) {
      try {
        const su = await tx.serialUnit.create({ data: { battalionId: bId, itemTypeId, serialNumber: sn, statusId, currentHolderId: wh.id } });
        await tx.transferLine.create({ data: { transferId: transfer.id, itemTypeId, quantity: 1, statusId, serialUnitId: su.id } });
        created++;
      } catch { failed.push(sn); }
    }
  });
  if (created === 0) {
    return { error: `לא נוצרה אף יחידה. נכשלו: ${failed.join(", ")}` };
  }
  await audit(user.id, "DECLARE_SERIALS", "ItemType", itemTypeId, { count: created, failed });
  revalidateAll();
  return { ok: true as const, created };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { error: msg.replace(/^Error:\s*/, "") };
  }
}

/** טעינת סריאליים מקובץ אקסל */
export async function importSerials(formData: FormData) {
  const user = await requireCapability("warehouse.operate");
  const bId = user.battalionId!;
  const itemTypeId = String(formData.get("itemTypeId") || "");
  const statusId = String(formData.get("statusId") || "") || (await defaultStatusId(prisma, bId));
  const file = formData.get("file") as File | null;
  if (!itemTypeId || !file || file.size === 0) return;

  const wh = await pickWarehouse(bId, itemTypeId);
  if (!wh) return;

  const wb = new ExcelJS.Workbook();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await wb.xlsx.load(Buffer.from(await file.arrayBuffer()) as any);
  const ws = wb.worksheets[0];
  if (!ws) return;

  const serials: string[] = [];
  ws.eachRow((row, idx) => { if (idx === 1) return; const sn = cell(row.getCell(1).value); if (sn) serials.push(sn); });
  if (serials.length === 0) return;

  let created = 0;
  await prisma.$transaction(async (tx) => {
    const transfer = await tx.transfer.create({
      data: { battalionId: bId, type: "INTAKE", status: "COMPLETED", toHolderId: wh.id, reason: "טעינת סריאליים מקובץ", createdById: user.id, approvedById: user.id, approvedAt: new Date() },
    });
    for (const sn of serials) {
      try {
        const su = await tx.serialUnit.create({ data: { battalionId: bId, itemTypeId, serialNumber: sn, statusId, currentHolderId: wh.id } });
        await tx.transferLine.create({ data: { transferId: transfer.id, itemTypeId, quantity: 1, statusId, serialUnitId: su.id } });
        created++;
      } catch { /* כפילות */ }
    }
  });
  await audit(user.id, "IMPORT_SERIALS", "ItemType", itemTypeId, { count: created });
  revalidateAll();
}

/** הוספת אצווה (מספר אצווה + כמות). אפשר כמה אצוות לאותו פריט. */
export async function declareLot(formData: FormData) {
  try {
  const user = await requireCapability("warehouse.operate");
  const bId = user.battalionId!;
  const itemTypeId = String(formData.get("itemTypeId") || "");
  const lotNumber = String(formData.get("lotNumber") || "").trim();
  const quantity = Math.max(1, parseInt(String(formData.get("quantity") || "0"), 10) || 0);
  const statusId = String(formData.get("statusId") || "") || (await defaultStatusId(prisma, bId));
  const externalUnit = String(formData.get("externalUnit") || "").trim() || "חטיבה";
  const externalContact = String(formData.get("externalContact") || "").trim() || null;
  let recipientPersonalId: string | null = null;
  try { recipientPersonalId = await extractPersonalId(bId, formData); }
  catch (e) { return { error: e instanceof Error ? e.message.replace(/^PERSONAL_ID_REQUIRED:\s*/, "") : "שגיאה במספר אישי" }; }
  if (!lotNumber) return { error: "חסר מספר אצווה" };
  if (quantity < 1) return { error: "כמות חייבת להיות לפחות 1" };

  const wh = await pickWarehouse(bId, itemTypeId);
  if (!wh) return { error: "לא נמצא מחסן מתאים לפריט זה" };

  let dupErr: string | null = null;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.serialUnit.create({ data: { battalionId: bId, itemTypeId, serialNumber: lotNumber, lotQuantity: quantity, statusId, currentHolderId: wh.id } });
      await tx.transfer.create({
        data: { battalionId: bId, type: "INTAKE", status: "COMPLETED", toHolderId: wh.id, reason: "הוספת אצווה", externalUnit, externalContact, recipientPersonalId, createdById: user.id, approvedById: user.id, approvedAt: new Date(),
          lines: { create: { itemTypeId, quantity, statusId } } },
      });
    });
  } catch { dupErr = `כפילות במספר האצווה ${lotNumber}`; }
  if (dupErr) return { error: dupErr };
  await audit(user.id, "DECLARE_LOT", "ItemType", itemTypeId, { lot: lotNumber, quantity });
  revalidateAll();
  return { ok: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message.replace(/^Error:\s*/, "") : "שגיאה" };
  }
}

/**
 * 🆕 תעודת זיכוי (WRITE_OFF) רב-פריטית — גוריעת מספר פריטים בתעודה אחת.
 * formData:
 *   externalUnit, externalContact, recipientPersonalId, reason
 *   line:<idx>:itemTypeId, line:<idx>:trackingMethod
 *   QTY:  line:<idx>:statusId, line:<idx>:quantity
 *   SERIAL: line:<idx>:serialUnitIds (CSV) — יחידות שכבר במלאי
 *   LOT:  line:<idx>:serialUnitIds (CSV של אצוות), line:<idx>:lotQty (כמה לזכות מהאצווה — חלקי)
 */
export async function withdrawMulti(formData: FormData): Promise<{ ok?: boolean; error?: string; transferId?: string }> {
  try {
    const user = await requireCapability("warehouse.operate");
    const bId = user.battalionId!;
    const externalUnit = String(formData.get("externalUnit") || "").trim() || "חטיבה";
    const externalContact = String(formData.get("externalContact") || "").trim() || null;
    const reason = String(formData.get("reason") || "").trim() || "זיכוי לחטיבה";
    let recipientPersonalId: string | null = null;
    try { recipientPersonalId = await extractPersonalId(bId, formData); }
    catch (e) { return { error: e instanceof Error ? e.message.replace(/^PERSONAL_ID_REQUIRED:\s*/, "") : "שגיאה במ.א." }; }

    const idxs = new Set<number>();
    for (const [k] of formData.entries()) {
      const m = k.match(/^line:(\d+):/);
      if (m) idxs.add(parseInt(m[1], 10));
    }
    const lines = [...idxs].sort((a, b) => a - b);
    if (lines.length === 0) return { error: "לא נבחרו פריטים לזיכוי" };

    let transferId = "";
    await prisma.$transaction(async (tx) => {
      const firstItemTypeId = String(formData.get(`line:${lines[0]}:itemTypeId`) || "");
      const firstWh = await pickWarehouse(bId, firstItemTypeId);
      if (!firstWh) throw new Error("לא נמצא מחסן מקור לפריט הראשון");

      const transfer = await tx.transfer.create({
        data: {
          battalionId: bId, type: "WRITE_OFF", status: "COMPLETED",
          fromHolderId: firstWh.id,
          reason: `זיכוי ${lines.length} פריטים בתעודה אחת — ${reason}`,
          externalUnit, externalContact, recipientPersonalId,
          createdById: user.id, approvedById: user.id, approvedAt: new Date(),
        },
      });
      transferId = transfer.id;

      for (const i of lines) {
        const itemTypeId = String(formData.get(`line:${i}:itemTypeId`) || "");
        const trackingMethod = String(formData.get(`line:${i}:trackingMethod`) || "QUANTITY");
        if (!itemTypeId) continue;

        const wh = await pickWarehouse(bId, itemTypeId);
        if (!wh) continue;

        if (trackingMethod === "SERIAL" || trackingMethod === "LOT") {
          const ids = String(formData.get(`line:${i}:serialUnitIds`) || "").split(",").map((s) => s.trim()).filter(Boolean);
          if (ids.length === 0) throw new Error(`שורה ${i + 1}: לא נבחרו יחידות`);
          for (const sid of ids) {
            const su = await tx.serialUnit.findUnique({ where: { id: sid } });
            if (!su) throw new Error(`שורה ${i + 1}: יחידה לא נמצאה`);
            if (su.battalionId !== bId) throw new Error(`שורה ${i + 1}: יחידה לא שייכת לגדוד`);
            // אצווה חלקית: lotQty:<sid> — אם קיים וקטן מ-lotQuantity, פצל
            const lotQty = parseInt(String(formData.get(`lotQty:${sid}`) || "0"), 10);
            const isLot = (su.lotQuantity ?? 1) > 1;
            const isPartial = isLot && lotQty > 0 && lotQty < (su.lotQuantity ?? 1);
            if (isPartial) {
              // הקטן את הקיים והוסף שורת תעודה עם lineQty
              await tx.serialUnit.update({
                where: { id: sid },
                data: { lotQuantity: (su.lotQuantity ?? 1) - lotQty },
              });
              await tx.transferLine.create({
                data: { transferId: transfer.id, itemTypeId: su.itemTypeId, quantity: lotQty, serialUnitId: sid, statusId: su.statusId },
              });
            } else {
              // יחידה שלמה: מוחקים currentHolderId (יצאה מהגדוד)
              await tx.serialUnit.update({ where: { id: sid }, data: { currentHolderId: null, signedSoldierId: null } });
              await tx.transferLine.create({
                data: { transferId: transfer.id, itemTypeId: su.itemTypeId, quantity: su.lotQuantity ?? 1, serialUnitId: sid, statusId: su.statusId },
              });
            }
          }
        } else {
          // QUANTITY
          const statusId = String(formData.get(`line:${i}:statusId`) || "");
          const quantity = Math.max(1, parseInt(String(formData.get(`line:${i}:quantity`) || "0"), 10) || 0);
          if (!statusId) throw new Error(`שורה ${i + 1}: חסר סטטוס`);
          if (quantity < 1) throw new Error(`שורה ${i + 1}: כמות חייבת להיות לפחות 1`);
          const existing = await tx.stockBalance.findFirst({ where: { itemTypeId, holderId: wh.id, statusId } });
          const current = existing?.quantity ?? 0;
          if (current < quantity) throw new Error(`שורה ${i + 1}: לא מספיק מלאי (קיים ${current}, מבקש ${quantity})`);
          await adjustQuantity(tx, bId, itemTypeId, wh.id, statusId, -quantity);
          await tx.transferLine.create({
            data: { transferId: transfer.id, itemTypeId, quantity, statusId },
          });
        }
      }
    });

    await audit(user.id, "WITHDRAW_MULTI", "Transfer", transferId, { lines: lines.length, externalUnit, recipientPersonalId });
    revalidateAll();
    return { ok: true, transferId };
  } catch (e) {
    return { error: e instanceof Error ? e.message.replace(/^Error:\s*/, "") : "שגיאה" };
  }
}

/** הורדת מלאי כמותי — העברה מחוץ לגדוד. מאפשר ירידה למינוס. */
export async function withdrawQty(formData: FormData) {
  const user = await requireCapability("warehouse.operate");
  const bId = user.battalionId!;
  const itemTypeId = String(formData.get("itemTypeId") || "");
  const quantity = Math.max(1, parseInt(String(formData.get("quantity") || "0"), 10) || 0);
  const statusId = String(formData.get("statusId") || "") || (await defaultStatusId(prisma, bId));
  const externalUnit = String(formData.get("externalUnit") || "").trim() || "חטיבה";
  const externalContact = String(formData.get("externalContact") || "").trim() || null;
  const recipientPersonalId = await extractPersonalId(bId, formData);
  const allowNegative = formData.get("allowNegative") === "on";

  const wh = await pickWarehouse(bId, itemTypeId);
  if (!wh) return;

  await prisma.$transaction(async (tx) => {
    // עקיפת המגבלה של adjustQuantity (לא יורד מתחת ל-0) — לאפשר מינוס במפורש
    const existing = await tx.stockBalance.findFirst({ where: { itemTypeId, holderId: wh.id, statusId } });
    const current = existing?.quantity ?? 0;
    const next = allowNegative ? current - quantity : Math.max(0, current - quantity);
    if (existing) {
      await tx.stockBalance.update({ where: { id: existing.id }, data: { quantity: next } });
    } else if (allowNegative) {
      await tx.stockBalance.create({ data: { battalionId: bId, itemTypeId, holderId: wh.id, statusId, quantity: next } });
    }
    const isOverdraft = next < 0 || (current < quantity && allowNegative);
    await tx.transfer.create({
      data: {
        battalionId: bId, type: "WRITE_OFF", status: "COMPLETED",
        fromHolderId: wh.id, reason: isOverdraft ? "הורדת מלאי — חוב לחטיבה" : "הורדת מלאי",
        externalUnit, externalContact, recipientPersonalId, notes: isOverdraft ? `חוסר ${quantity - current} יחידות (זיכוי יתר)` : null,
        createdById: user.id, approvedById: user.id, approvedAt: new Date(),
        lines: { create: { itemTypeId, quantity, statusId } },
      },
    });
  });

  await audit(user.id, "WITHDRAW_QTY", "ItemType", itemTypeId, { quantity, statusId, externalUnit, allowNegative });
  revalidateAll();
}

/** הורדת יחידות סריאליות לפי מספרי סריאל שנבחרו */
export async function withdrawSerials(formData: FormData) {
  const user = await requireCapability("warehouse.operate");
  const bId = user.battalionId!;
  const itemTypeId = String(formData.get("itemTypeId") || "");
  const serialIds = formData.getAll("serialId").map(String).filter(Boolean);
  const externalUnit = String(formData.get("externalUnit") || "").trim() || "חטיבה";
  const externalContact = String(formData.get("externalContact") || "").trim() || null;
  const recipientPersonalId = await extractPersonalId(bId, formData);
  if (serialIds.length === 0) return;

  await prisma.$transaction(async (tx) => {
    const transfer = await tx.transfer.create({
      data: { battalionId: bId, type: "WRITE_OFF", status: "COMPLETED", reason: "הורדת מלאי סריאלי",
        externalUnit, externalContact, recipientPersonalId,
        createdById: user.id, approvedById: user.id, approvedAt: new Date() },
    });
    for (const sid of serialIds) {
      const su = await tx.serialUnit.findUnique({ where: { id: sid } });
      if (!su) continue;
      await tx.transferLine.create({ data: { transferId: transfer.id, itemTypeId: su.itemTypeId, quantity: su.lotQuantity ?? 1, serialUnitId: sid, statusId: su.statusId } });
      await tx.serialUnit.delete({ where: { id: sid } });
    }
  });

  await audit(user.id, "WITHDRAW_SERIALS", "ItemType", itemTypeId, { count: serialIds.length });
  revalidateAll();
}

/** שינוי סטטוס ליחידות סריאליות (תקין → בלאי / פגום / אבוד וכו') */
export async function changeUnitsStatus(formData: FormData) {
  const user = await requireCapability("warehouse.operate");
  const bId = user.battalionId!;
  const unitIds = formData.getAll("unitId").map(String).filter(Boolean);
  const newStatusId = String(formData.get("newStatusId") || "");
  const reason = String(formData.get("reason") || "").trim() || null;
  if (unitIds.length === 0) throw new Error("לא נבחרו יחידות לשינוי");
  if (!newStatusId) throw new Error("חובה לבחור סטטוס חדש");

  const status = await prisma.itemStatus.findUnique({ where: { id: newStatusId } });
  if (!status || status.battalionId !== bId) throw new Error("סטטוס לא תקין");

  let changed = 0;
  await prisma.$transaction(async (tx) => {
    for (const id of unitIds) {
      const u = await tx.serialUnit.findUnique({ where: { id } });
      if (!u || u.battalionId !== bId) continue;
      if (u.statusId === newStatusId) continue;
      await tx.serialUnit.update({ where: { id }, data: { statusId: newStatusId } });
      changed++;
    }
  });
  await audit(user.id, "CHANGE_STATUS", "SerialUnit", unitIds.join(","), { newStatusId, statusName: status.name, count: changed, reason });
  revalidateAll();
  return { changed };
}

/** שינוי סטטוס לכמות (מעביר qty מסטטוס אחד לאחר באותו פריט+מחזיק) */
export async function changeQuantityStatus(formData: FormData) {
  const user = await requireCapability("warehouse.operate");
  const bId = user.battalionId!;
  const itemTypeId = String(formData.get("itemTypeId") || "");
  const fromStatusId = String(formData.get("fromStatusId") || "");
  const newStatusId = String(formData.get("newStatusId") || "");
  const quantity = Math.max(1, parseInt(String(formData.get("quantity") || "0"), 10) || 0);
  const reason = String(formData.get("reason") || "").trim() || null;
  if (!itemTypeId || !fromStatusId || !newStatusId || quantity < 1) throw new Error("חסרים פרטים");
  if (fromStatusId === newStatusId) throw new Error("הסטטוס החדש זהה לקיים");

  await prisma.$transaction(async (tx) => {
    const wh = await pickWarehouse(bId, itemTypeId);
    if (!wh) throw new Error("מחסן לא נמצא");
    const existing = await tx.stockBalance.findFirst({ where: { itemTypeId, holderId: wh.id, statusId: fromStatusId } });
    if (!existing || existing.quantity < quantity) throw new Error(`אין מספיק במלאי בסטטוס המקור (${existing?.quantity ?? 0} זמין)`);
    await adjustQuantity(tx, bId, itemTypeId, wh.id, fromStatusId, -quantity);
    await adjustQuantity(tx, bId, itemTypeId, wh.id, newStatusId, quantity);
  });
  await audit(user.id, "CHANGE_STATUS_QTY", "ItemType", itemTypeId, { from: fromStatusId, to: newStatusId, quantity, reason });
  revalidateAll();
}

/** עריכת מספר סריאל (תיקון טעות הקלדה) */
export async function editSerialNumber(formData: FormData) {
  const user = await requireCapability("warehouse.operate");
  const bId = user.battalionId!;
  const id = String(formData.get("id") || "");
  const newSerial = String(formData.get("newSerial") || "").trim();
  if (!id || !newSerial) throw new Error("חסר מספר סריאל");

  const unit = await prisma.serialUnit.findUnique({ where: { id } });
  if (!unit || unit.battalionId !== bId) throw new Error("יחידה לא נמצאה");
  if (unit.serialNumber === newSerial) return;

  // בדיקת כפילות מול אותו פריט
  const dup = await prisma.serialUnit.findFirst({
    where: { battalionId: bId, itemTypeId: unit.itemTypeId, serialNumber: newSerial, id: { not: id } },
  });
  if (dup) throw new Error(`מספר ${newSerial} כבר קיים בפריט זה`);

  await prisma.serialUnit.update({ where: { id }, data: { serialNumber: newSerial } });
  await audit(user.id, "EDIT_SN", "SerialUnit", id, { from: unit.serialNumber, to: newSerial });
  revalidateAll();
}

/** טעינת אצוות מקובץ אקסל (עמודה 1: מספר אצווה, עמודה 2: כמות) */
export async function importLots(formData: FormData) {
  const user = await requireCapability("warehouse.operate");
  const bId = user.battalionId!;
  const itemTypeId = String(formData.get("itemTypeId") || "");
  const statusId = String(formData.get("statusId") || "") || (await defaultStatusId(prisma, bId));
  const file = formData.get("file") as File | null;
  if (!itemTypeId || !file || file.size === 0) return;

  const wh = await pickWarehouse(bId, itemTypeId);
  if (!wh) return;

  const wb = new ExcelJS.Workbook();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await wb.xlsx.load(Buffer.from(await file.arrayBuffer()) as any);
  const ws = wb.worksheets[0];
  if (!ws) return;

  const lots: { sn: string; qty: number }[] = [];
  ws.eachRow((row, idx) => {
    if (idx === 1) return;
    const sn = cell(row.getCell(1).value);
    const qty = parseInt(cell(row.getCell(2).value), 10);
    if (sn && qty > 0) lots.push({ sn, qty });
  });
  if (lots.length === 0) return;

  let created = 0;
  await prisma.$transaction(async (tx) => {
    const transfer = await tx.transfer.create({
      data: { battalionId: bId, type: "INTAKE", status: "COMPLETED", toHolderId: wh.id, reason: "טעינת אצוות מקובץ", createdById: user.id, approvedById: user.id, approvedAt: new Date() },
    });
    for (const l of lots) {
      try {
        await tx.serialUnit.create({ data: { battalionId: bId, itemTypeId, serialNumber: l.sn, lotQuantity: l.qty, statusId, currentHolderId: wh.id } });
        await tx.transferLine.create({ data: { transferId: transfer.id, itemTypeId, quantity: l.qty, statusId } });
        created++;
      } catch { /* כפילות */ }
    }
  });
  await audit(user.id, "IMPORT_LOTS", "ItemType", itemTypeId, { count: created });
  revalidateAll();
}
