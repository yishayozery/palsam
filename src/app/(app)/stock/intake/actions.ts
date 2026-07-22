"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/guard";
import { audit } from "@/lib/audit";
import { adjustQuantity, defaultStatusId } from "@/lib/inventory";
import {
  parseVoucherText, classifyLines, canApproveIntake,
  type CatalogItem,
} from "@/lib/sap-voucher";

/**
 * 📄 קליטת מלאי משובר SAP — server actions.
 *
 * הכלל המנחה: קריאה אוטומטית **לעולם לא כותבת למלאי**. היא יוצרת טיוטה.
 * המלאי זז רק ב-approveIntake, אחרי שני שערים (הקמת פריטים → אישור).
 */

async function loadCatalog(bId: string): Promise<CatalogItem[]> {
  const items = await prisma.itemType.findMany({
    where: { battalionId: bId },
    select: { id: true, sku: true, name: true, trackingMethod: true },
  });
  return items;
}

/** יצירת טיוטה מטקסט מודבק/מוקלד. מסווגת מול הקטלוג ושומרת. */
export async function createDraftFromText(formData: FormData) {
  try {
    const user = await requireCapability("warehouse.operate");
    const bId = user.battalionId!;
    const text = String(formData.get("text") || "");
    const holderId = String(formData.get("holderId") || "");
    const voucherNo = String(formData.get("voucherNo") || "").trim() || null;

    const holder = await prisma.holder.findFirst({ where: { id: holderId, battalionId: bId, kind: "WAREHOUSE" }, select: { id: true } });
    if (!holder) return { error: "יש לבחור מחסן יעד" };

    const { rows, skipped } = parseVoucherText(text);
    if (rows.length === 0) return { error: "לא זוהו שורות בטקסט. ודא שכל שורה כוללת מק\"ט ושלוש עמודות כמות." };

    const catalog = await loadCatalog(bId);
    const classified = classifyLines(rows, catalog);

    const draft = await prisma.intakeDraft.create({
      data: {
        battalionId: bId, holderId: holder.id, voucherNo, sourceKind: "MANUAL",
        createdById: user.id,
        lines: {
          create: classified.map((l, i) => ({
            sku: l.sku, description: l.description, standardQty: l.standardQty,
            allocatedQty: l.allocatedQty, gap: l.gap, status: l.status,
            note: l.note, itemTypeId: l.itemTypeId, rawText: rows[i] ? `${rows[i].sku} ${rows[i].description}` : null,
          })),
        },
      },
      select: { id: true },
    });

    await audit(user.id, "CREATE_INTAKE_DRAFT", "IntakeDraft", draft.id, { rows: rows.length, skipped: skipped.length });
    revalidatePath("/stock/intake");
    return { ok: true as const, id: draft.id, skipped };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "שגיאה ביצירת טיוטה" };
  }
}

/** עריכת שורת טיוטה (מק"ט/כמות/תיאור). מסווגת מחדש את השורה מול הקטלוג. */
export async function updateDraftLine(formData: FormData) {
  try {
    const user = await requireCapability("warehouse.operate");
    const bId = user.battalionId!;
    const lineId = String(formData.get("lineId") || "");
    const line = await prisma.intakeDraftLine.findFirst({
      where: { id: lineId, draft: { battalionId: bId, status: "DRAFT" } },
      select: { id: true, draftId: true },
    });
    if (!line) return { error: "שורה לא נמצאה או שהטיוטה כבר אושרה" };

    const sku = String(formData.get("sku") || "").trim();
    const description = String(formData.get("description") || "").trim();
    const allocatedQty = parseInt(String(formData.get("allocatedQty") || "0"), 10) || 0;
    const standardQty = parseInt(String(formData.get("standardQty") || "0"), 10) || 0;

    const catalog = await loadCatalog(bId);
    const [reclassified] = classifyLines(
      [{ sku, description, standardQty, allocatedQty, gap: standardQty - allocatedQty }],
      catalog,
    );

    await prisma.intakeDraftLine.update({
      where: { id: lineId },
      data: {
        sku: reclassified.sku, description, standardQty, allocatedQty, gap: reclassified.gap,
        status: reclassified.status, note: reclassified.note,
        itemTypeId: reclassified.itemTypeId, editedByUser: true,
      },
    });
    revalidatePath(`/stock/intake/${line.draftId}`);
    return { ok: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "שגיאה בעדכון שורה" };
  }
}

export async function deleteDraftLine(formData: FormData) {
  const user = await requireCapability("warehouse.operate");
  const bId = user.battalionId!;
  const lineId = String(formData.get("lineId") || "");
  const line = await prisma.intakeDraftLine.findFirst({ where: { id: lineId, draft: { battalionId: bId, status: "DRAFT" } }, select: { draftId: true } });
  if (!line) return;
  await prisma.intakeDraftLine.delete({ where: { id: lineId } });
  revalidatePath(`/stock/intake/${line.draftId}`);
}

/**
 * שער 1 — הקמת כל הפריטים החסרים (UNKNOWN_SKU) בקטלוג.
 * ברירת מחדל: קטגוריה "ציוד", מעקב כמותי. אחרי ההקמה השורות מסווגות מחדש.
 */
export async function createMissingItems(formData: FormData) {
  try {
    const user = await requireCapability("warehouse.operate");
    const bId = user.battalionId!;
    const draftId = String(formData.get("draftId") || "");
    const draft = await prisma.intakeDraft.findFirst({
      where: { id: draftId, battalionId: bId, status: "DRAFT" },
      select: { id: true, lines: { where: { status: "UNKNOWN_SKU" }, select: { id: true, sku: true, description: true } } },
    });
    if (!draft) return { error: "טיוטה לא נמצאה" };
    if (draft.lines.length === 0) return { error: "אין פריטים חסרים להקמה" };

    // קטגוריית "ציוד" כברירת מחדל; אם אין — הראשונה בגדוד
    const cat =
      (await prisma.category.findFirst({ where: { battalionId: bId, name: "ציוד" }, select: { id: true } })) ??
      (await prisma.category.findFirst({ where: { battalionId: bId }, orderBy: { name: "asc" }, select: { id: true } }));
    if (!cat) return { error: "אין קטגוריה בגדוד — לא ניתן להקים פריט" };

    let created = 0;
    for (const l of draft.lines) {
      // ייתכן שהמק"ט כבר קיים (הוקם ידנית בינתיים) — find-or-create
      const exists = await prisma.itemType.findFirst({ where: { battalionId: bId, sku: l.sku }, select: { id: true } });
      if (!exists) {
        await prisma.itemType.create({
          data: { battalionId: bId, name: l.description || l.sku, sku: l.sku, categoryId: cat.id, trackingMethod: "QUANTITY", active: true },
        });
        created++;
      }
    }

    // סיווג מחדש של כל הטיוטה
    await reclassifyDraft(bId, draftId);
    await audit(user.id, "INTAKE_CREATE_ITEMS", "IntakeDraft", draftId, { created });
    revalidatePath(`/stock/intake/${draftId}`);
    return { ok: true as const, created };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "שגיאה בהקמת פריטים" };
  }
}

/** סיווג מחדש של כל שורות הטיוטה מול הקטלוג הנוכחי. */
async function reclassifyDraft(bId: string, draftId: string) {
  const lines = await prisma.intakeDraftLine.findMany({ where: { draftId }, select: { id: true, sku: true, description: true, standardQty: true, allocatedQty: true } });
  const catalog = await loadCatalog(bId);
  const classified = classifyLines(
    lines.map((l) => ({ sku: l.sku, description: l.description, standardQty: l.standardQty, allocatedQty: l.allocatedQty, gap: l.standardQty - l.allocatedQty })),
    catalog,
  );
  await prisma.$transaction(
    classified.map((c, i) => prisma.intakeDraftLine.update({ where: { id: lines[i].id }, data: { status: c.status, note: c.note, itemTypeId: c.itemTypeId } })),
  );
}

/**
 * שער 2 — אישור הקליטה. נעול כל עוד יש שורה חוסמת (מק"ט לא מוכר, checksum
 * שבור, או פריט סריאלי). יוצר INTAKE אחד עם שורה לכל פריט, ומעדכן מלאי.
 */
export async function approveIntake(formData: FormData) {
  try {
    const user = await requireCapability("warehouse.operate");
    const bId = user.battalionId!;
    const draftId = String(formData.get("draftId") || "");
    const draft = await prisma.intakeDraft.findFirst({
      where: { id: draftId, battalionId: bId, status: "DRAFT" },
      select: { id: true, holderId: true, voucherNo: true, lines: { select: { id: true, sku: true, description: true, standardQty: true, allocatedQty: true, status: true, itemTypeId: true } } },
    });
    if (!draft) return { error: "טיוטה לא נמצאה או שכבר אושרה" };

    const classified = classifyLines(
      draft.lines.map((l) => ({ sku: l.sku, description: l.description, standardQty: l.standardQty, allocatedQty: l.allocatedQty, gap: l.standardQty - l.allocatedQty })),
      await loadCatalog(bId),
    );
    const { ready, blocking } = canApproveIntake(classified);
    if (!ready) return { error: `לא ניתן לאשר — יש שורות חוסמות: ${JSON.stringify(blocking)}` };

    const statusId = await defaultStatusId(prisma, bId);
    const toIntake = draft.lines.filter((l) => l.status === "OK" && l.itemTypeId && l.allocatedQty > 0);

    const transfer = await prisma.$transaction(async (tx) => {
      const tr = await tx.transfer.create({
        data: {
          battalionId: bId, type: "INTAKE", status: "COMPLETED", toHolderId: draft.holderId,
          reason: `קליטת שובר SAP${draft.voucherNo ? ` ${draft.voucherNo}` : ""}`, externalUnit: "חטיבה",
          createdById: user.id, approvedById: user.id, approvedAt: new Date(),
        },
        select: { id: true },
      });
      for (const l of toIntake) {
        await adjustQuantity(tx, bId, l.itemTypeId!, draft.holderId, statusId, l.allocatedQty);
        await tx.transferLine.create({ data: { transferId: tr.id, itemTypeId: l.itemTypeId!, quantity: l.allocatedQty, statusId } });
      }
      await tx.intakeDraft.update({ where: { id: draftId }, data: { status: "APPROVED", approvedAt: new Date(), approvedById: user.id, transferId: tr.id } });
      return tr;
    });

    await audit(user.id, "APPROVE_INTAKE", "IntakeDraft", draftId, { transferId: transfer.id, lines: toIntake.length });
    revalidatePath("/stock");
    revalidatePath("/stock/intake");
    revalidatePath(`/stock/intake/${draftId}`);
    return { ok: true as const, transferId: transfer.id, count: toIntake.length };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "שגיאה באישור הקליטה" };
  }
}

export async function cancelDraft(formData: FormData) {
  const user = await requireCapability("warehouse.operate");
  const bId = user.battalionId!;
  const draftId = String(formData.get("draftId") || "");
  const draft = await prisma.intakeDraft.findFirst({ where: { id: draftId, battalionId: bId, status: "DRAFT" }, select: { id: true } });
  if (!draft) return;
  await prisma.intakeDraft.update({ where: { id: draftId }, data: { status: "CANCELLED" } });
  await audit(user.id, "CANCEL_INTAKE_DRAFT", "IntakeDraft", draftId, {});
  revalidatePath("/stock/intake");
}
