"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guard";
import { can } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { requiresPersonalId } from "@/lib/handover";
import { getSoldierEquipmentSummary, formatSoldierSummaryForWhatsApp, type SoldierEquipmentSummary } from "@/lib/soldier-summary";
import type { SignatureMethod, Prisma } from "@/generated/prisma";

/**
 * שיוך שורות החתמה לחייל: סריאלי → signedSoldierId (עם פיצול אצווה חלקית), כמותי → גריעת מלאי.
 * משותף לחתימה רגילה (completeSignature) ולחתימה בדיעבד (createSignout retroactive).
 */
async function assignSignoutLinesToSoldier(
  tx: Prisma.TransactionClient,
  lines: { itemTypeId: string; quantity: number; statusId: string | null; serialUnitId: string | null }[],
  soldierId: string,
  fromHolderId: string | null,
  bId: string,
) {
  const { adjustQuantity, defaultStatusId } = await import("@/lib/inventory");
  for (const line of lines) {
    if (line.serialUnitId) {
      const unit = await tx.serialUnit.findUnique({ where: { id: line.serialUnitId } });
      if (!unit) continue;
      const isLot = (unit.lotQuantity ?? 1) > 1;
      const lineQty = line.quantity ?? 1;
      if (isLot && lineQty < (unit.lotQuantity ?? 1)) {
        let suffix = 1;
        while (await tx.serialUnit.findFirst({ where: { itemTypeId: unit.itemTypeId, serialNumber: `${unit.serialNumber}/${suffix}` } })) suffix++;
        await tx.serialUnit.create({
          data: { battalionId: unit.battalionId, itemTypeId: unit.itemTypeId, serialNumber: `${unit.serialNumber}/${suffix}`, lotQuantity: lineQty, statusId: unit.statusId, signedSoldierId: soldierId, currentHolderId: unit.currentHolderId },
        });
        await tx.serialUnit.update({ where: { id: unit.id }, data: { lotQuantity: (unit.lotQuantity ?? 1) - lineQty } });
      } else {
        await tx.serialUnit.update({ where: { id: line.serialUnitId }, data: { signedSoldierId: soldierId } });
      }
    } else if (fromHolderId) {
      const statusId = line.statusId || await defaultStatusId(tx, bId);
      await adjustQuantity(tx, bId, line.itemTypeId, fromHolderId, statusId, -line.quantity);
    }
  }
}

/** שליחת בקשת חתימה לחייל בטלגרם (חתימה בדיעבד) — לינק ל-/sign/[token]. */
async function notifySoldierSignRequest(soldierId: string, battalionId: string, token: string): Promise<boolean> {
  try {
    const soldier = await prisma.soldier.findUnique({ where: { id: soldierId }, select: { telegramChatId: true, fullName: true } });
    const battalion = await prisma.battalion.findUnique({ where: { id: battalionId }, select: { telegramBotToken: true } });
    if (!soldier?.telegramChatId || !battalion?.telegramBotToken) return false;
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.palmy.co.il";
    const text = `✍️ <b>נדרשת חתימתך על תעודת ציוד</b>\nהציוד כבר רשום על שמך. נא לחתום דיגיטלית על התעודה:\n\n👉 <a href="${baseUrl}/sign/${token}">לחץ כאן לחתימה</a>`;
    const { sendTelegramMessage } = await import("@/lib/telegram");
    await sendTelegramMessage(battalion.telegramBotToken, soldier.telegramChatId, text);
    return true;
  } catch (e) {
    console.error("[notifySoldierSignRequest] failed (non-fatal):", e);
    return false;
  }
}

/** שליחת סיכום ציוד לחייל בטלגרם — מחזיר true אם נשלח בהצלחה */
async function notifySoldierTelegram(soldierId: string, battalionId: string, transferId: string | null, action: "SIGN" | "CHECKIN"): Promise<boolean> {
  try {
    const soldier = await prisma.soldier.findUnique({
      where: { id: soldierId },
      select: { telegramChatId: true, fullName: true },
    });
    if (!soldier?.telegramChatId) return false;

    const battalion = await prisma.battalion.findUnique({
      where: { id: battalionId },
      select: { telegramBotToken: true },
    });
    if (!battalion?.telegramBotToken) return false;

    const summary = await getSoldierEquipmentSummary(soldierId);
    if (!summary) return false;

    let text: string;
    if (action === "SIGN") {
      text = formatSoldierSummaryForWhatsApp(summary, { headerTitle: "📝 התקבל ציוד חדש — סיכום ציוד חתום", hideWeaponsEligibility: true });
    } else {
      // CHECKIN — מה הוחזר + מה נשאר חתום (ללא זכאות נשק)
      const returned = transferId ? await prisma.transferLine.findMany({
        where: { transferId },
        select: { quantity: true, itemType: { select: { name: true, unit: true } }, serialUnit: { select: { serialNumber: true } } },
      }) : [];
      const head: string[] = [];
      head.push("↩️ זיכוי ציוד");
      head.push(`חייל: ${summary.soldier.fullName}${summary.soldier.personalNumber ? ` (${summary.soldier.personalNumber})` : ""}${summary.soldier.companyName ? ` · ${summary.soldier.companyName}` : ""}`);
      head.push("");
      head.push(`✅ הוחזר (${returned.length}):`);
      for (const l of returned) {
        head.push(`• ${l.itemType.name}${l.serialUnit ? ` · SN: ${l.serialUnit.serialNumber}` : ` × ${l.quantity} ${l.itemType.unit}`}`);
      }
      if (returned.length === 0) head.push("• —");
      const remaining = formatSoldierSummaryForWhatsApp(summary, { headerTitle: "📦 נשאר חתום עליך:", hideWeaponsEligibility: true, hideSoldierLine: true });
      text = head.join("\n") + "\n\n" + remaining;
    }
    const { sendTelegramMessage, sendTelegramDocument } = await import("@/lib/telegram");

    // שליחת PDF כמסמך אם יש תעודה
    if (transferId) {
      try {
        const { buildTransferPdfBuffer } = await import("@/lib/email-pdf");
        const transfer = await prisma.transfer.findUnique({
          where: { id: transferId },
          include: {
            battalion: true,
            fromHolder: { select: { name: true, signatureClause: true } },
            toHolder: { select: { name: true } },
            toSoldier: { select: { fullName: true, personalNumber: true } },
            createdBy: { select: { fullName: true } },
            approvedBy: { select: { fullName: true } },
            lines: { include: { itemType: true, serialUnit: true, status: true } },
            signatures: {
              where: { status: "SIGNED" },
              select: {
                signedAt: true,
                soldier: { select: { fullName: true, personalNumber: true } },
                signerUser: { select: { fullName: true, title: true } },
              },
              take: 1,
            },
          },
        });
        if (transfer) {
          const pdfBuf = await buildTransferPdfBuffer(transfer as Parameters<typeof buildTransferPdfBuffer>[0]);
          const docNumber = transferId.slice(-8).toUpperCase();
          await sendTelegramDocument(
            battalion.telegramBotToken,
            soldier.telegramChatId,
            pdfBuf,
            `transfer-${docNumber}.pdf`,
            text,
          );
          return true;
        }
      } catch (pdfErr) {
        console.error("[notifySoldierTelegram] PDF send failed, falling back to text:", pdfErr);
      }
    }

    await sendTelegramMessage(battalion.telegramBotToken, soldier.telegramChatId, text);
    return true;
  } catch (e) {
    console.error("[notifySoldierTelegram] failed (non-fatal):", e);
    return false;
  }
}

/** עדכון נייד חייל — משמש את SignoutModal כשאין טלפון */
export async function updateSoldierPhone(soldierId: string, phone: string): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  if (!can(user, "signatures")) return { ok: false, error: "אין הרשאה" };
  const clean = phone.replace(/[-\s]/g, "");
  if (!/^05\d{8}$/.test(clean)) return { ok: false, error: "מספר לא תקין (05XXXXXXXX)" };
  const soldier = await prisma.soldier.findUnique({ where: { id: soldierId } });
  if (!soldier || soldier.battalionId !== user.battalionId) return { ok: false, error: "חייל לא נמצא" };
  await prisma.soldier.update({ where: { id: soldierId }, data: { phone: clean } });
  revalidatePath("/signatures");
  return { ok: true };
}

/** מחזיר את ה-summary של חייל אחרי חתימה - לשליחה ב-WhatsApp. ציבורי דרך token. */
export async function getPostSignatureShareData(
  token: string,
): Promise<{ ok: true; summary: SoldierEquipmentSummary; whatsappText: string; soldierPhone: string | null; transferId: string | null } | { ok: false; error: string }> {
  try {
    const sig = await prisma.signature.findUnique({
      where: { token },
      select: { soldierId: true, status: true, transferId: true },
    });
    if (!sig) return { ok: false, error: "החתימה לא נמצאה" };
    if (!sig.soldierId) return { ok: false, error: "סוג חתימה לא נתמך לסיכום" };
    if (sig.status !== "SIGNED") return { ok: false, error: "החתימה עדיין לא בוצעה" };
    const summary = await getSoldierEquipmentSummary(sig.soldierId);
    if (!summary) return { ok: false, error: "חייל לא נמצא" };
    const whatsappText = formatSoldierSummaryForWhatsApp(summary, {
      headerTitle: "📋 סיכום ציוד חתום על החייל (לאחר חתימה)",
    });
    return { ok: true, summary, whatsappText, soldierPhone: summary.soldier.phone, transferId: sig.transferId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "שגיאה" };
  }
}

/** יצירת החתמה (SIGNOUT): מחזיק ◄ חייל. */
export async function createSignout(formData: FormData): Promise<{ error: string } | void> {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    console.error("[createSignout] requireUser failed:", e);
    return { error: "שגיאה באימות משתמש" };
  }
  if (!can(user, "signatures.manage")) redirect("/signatures");
  const bId = user.battalionId!;
  const soldierId = String(formData.get("soldierId") || "");
  const method = String(formData.get("method") || "QR") as SignatureMethod;
  // חתימה בדיעבד: הפריט יורד מהמלאי ומשויך מיד, החייל חותם אח"כ דרך לינק שנשלח בטלגרם.
  const retroactive = formData.get("retroactive") === "true";
  const serialIds = formData.getAll("serial").map(String).filter(Boolean);
  console.log("[createSignout] START", { soldierId, method, serialIds, holderId: user.holderId, role: user.role });
  const vehicleId = String(formData.get("vehicleId") || "") || null;
  const kitId = String(formData.get("kitId") || "") || null;
  const physicalLocation = String(formData.get("physicalLocation") || "").trim() || null;
  const equipmentLocationId = String(formData.get("equipmentLocationId") || "") || null;
  // פריטים כמותיים בעגלה (מקבילות: qtyItem[], qtyValue[], qtyStatus[])
  const qtyItems = formData.getAll("qtyItem").map(String);
  const qtyValues = formData.getAll("qtyValue").map((v) => parseInt(String(v), 10) || 0);
  const qtyStatuses = formData.getAll("qtyStatus").map(String);
  const hasAnything = serialIds.length > 0 || kitId || qtyItems.length > 0;
  if (!soldierId || !hasAnything) return { error: "בחר חייל ולפחות פריט אחד" };

  // 🔒 הקפאת מצב — אם יש ספירה בהקפאה שטרם הסתיימה עבור המחסן/פלוגה של המחתים,
  //    חוסמים החתמה עד לסיום הספירה (כדי לא לשבש את מצב המלאי הקפוא).
  if (user.holderId) {
    const frozen = await prisma.countSession.findFirst({
      where: {
        battalionId: bId, frozen: true, status: { not: "COMPLETED" },
        OR: [{ task: { holderId: user.holderId } }, { lines: { some: { holderId: user.holderId } } }],
      },
      select: { id: true },
    });
    if (frozen) {
      const url = `${process.env.NEXT_PUBLIC_APP_URL || "https://www.palmy.co.il"}/counts/${frozen.id}`;
      return { error: `🔒 לא ניתן להחתים כעת — קיימת ספירה בהקפאת מצב שטרם הסתיימה עבור המחסן/פלוגה שלך. יש להשלים אותה תחילה:\n${url}` };
    }
  }

  // 🔒 אכיפת מ.א. — אם הגדוד דורש, חייב להיות לחייל מ.א. במערכת
  if (await requiresPersonalId(bId)) {
    const soldier = await prisma.soldier.findUnique({ where: { id: soldierId }, select: { fullName: true, personalNumber: true } });
    if (!soldier?.personalNumber) {
      return { error: `🔒 הגדוד דורש מ.א. בכל מסירה. החייל ${soldier?.fullName ?? ""} לא מקושר למ.א. — עדכן ב-/roster לפני ההחתמה.` };
    }
  }

  // 🔫 ולידציית נשק - אם פריט כלשהו מ-ARMORY, בודקים את 4 התנאים:
  // שלישות + אישור מג"ד/סמג"ד + העלאת צילום מבחן + חתימה על נוהל (שלוש אלה האחרונים זה תהליך נשק)
  {
    const allItemTypeIds: string[] = [];
    if (serialIds.length > 0) {
      const units = await prisma.serialUnit.findMany({ where: { id: { in: serialIds } }, select: { itemTypeId: true } });
      units.forEach((u) => allItemTypeIds.push(u.itemTypeId));
    }
    for (const q of qtyItems) if (q) allItemTypeIds.push(q);
    if (kitId) {
      const kitItems = await prisma.signableKitLine.findMany({ where: { kitId }, select: { itemTypeId: true } });
      kitItems.forEach((k) => allItemTypeIds.push(k.itemTypeId));
    }
    const { areAnyItemsArmory, getSoldierWeaponsEligibility } = await import("@/lib/weapons-eligibility");
    if (await areAnyItemsArmory(allItemTypeIds)) {
      const elig = await getSoldierWeaponsEligibility(soldierId);
      if (!elig) return { error: "חייל לא נמצא" };
      if (!elig.isFullyEligible) {
        const missing = elig.missingSteps.map((s) => {
          if (s === "enlisted") return "אישור שלישות (פנה לשליש)";
          if (s === "weaponsApproved") return 'אישור מג"ד/סמג"ד';
          if (s === "armoryTestSubmitted") return "העלאת צילום של מבחן נוהל הארמון";
          if (s === "weaponsAgreementSigned") return "חתימה על נוהל שמירת נשק (דרך הלינק לחייל)";
          return s;
        }).join(" + ");
        return { error: `🚫 לא ניתן להחתים על נשק. החייל חסר: ${missing}` };
      }
    }
  }

  // 📦 בדיקת הקצאות לפלוגה — וודא שהפלוגה לא חרגה מההקצאה
  {
    const soldier = await prisma.soldier.findUnique({ where: { id: soldierId }, select: { companyId: true, company: { select: { name: true } } } });
    if (soldier?.companyId) {
      const allItemTypeIds: string[] = [];
      if (serialIds.length > 0) {
        const units = await prisma.serialUnit.findMany({ where: { id: { in: serialIds } }, select: { itemTypeId: true, lotQuantity: true } });
        for (const u of units) allItemTypeIds.push(u.itemTypeId);
      }
      for (const q of qtyItems) if (q) allItemTypeIds.push(q);
      const uniqueItemTypes = [...new Set(allItemTypeIds)];
      const companyAllocations = await prisma.companyAllocation.findMany({
        where: { companyId: soldier.companyId, itemTypeId: { in: uniqueItemTypes } },
      });
      for (const alloc of companyAllocations) {
        const currentSigned = await prisma.serialUnit.count({
          where: { itemTypeId: alloc.itemTypeId, signedSoldier: { companyId: soldier.companyId } },
        });
        const newCount = allItemTypeIds.filter((id) => id === alloc.itemTypeId).length;
        if (currentSigned + newCount > alloc.quantity && alloc.blockOnExceed) {
          const item = await prisma.itemType.findUnique({ where: { id: alloc.itemTypeId }, select: { name: true } });
          return { error: `📦 חריגה מהקצאה: ${soldier.company?.name ?? "פלוגה"} מוקצה ${alloc.quantity} × ${item?.name ?? "פריט"}, כבר חתום ${currentSigned}, מנסה להוסיף ${newCount}` };
        }
      }
    }
  }

  // אם נבחרה ערכה — נוסיף את הפריטים הכמותיים שלה כשורות העברה
  const kitLines = kitId
    ? await prisma.signableKitLine.findMany({ where: { kitId }, include: { itemType: true } })
    : [];

  // 🔒 מגבלת מקס' לחייל — פר סוג-פריט ופר קטגוריה (חסימה קשיחה)
  {
    // כמות חדשה שמתווספת פר סוג-פריט (סריאלי=1 ליחידה, כמותי=כמות, ערכה=כמות)
    const addByType = new Map<string, number>();
    if (serialIds.length > 0) {
      const units = await prisma.serialUnit.findMany({ where: { id: { in: serialIds } }, select: { itemTypeId: true } });
      for (const u of units) addByType.set(u.itemTypeId, (addByType.get(u.itemTypeId) ?? 0) + 1);
    }
    for (let i = 0; i < qtyItems.length; i++) {
      const it = qtyItems[i]; const q = qtyValues[i];
      if (it && q > 0) addByType.set(it, (addByType.get(it) ?? 0) + q);
    }
    for (const kl of kitLines) addByType.set(kl.itemTypeId, (addByType.get(kl.itemTypeId) ?? 0) + kl.quantity);

    if (addByType.size > 0) {
      const typeIds = [...addByType.keys()];
      const types = await prisma.itemType.findMany({
        where: { id: { in: typeIds } },
        select: { id: true, name: true, maxPerSoldier: true, category: { select: { id: true, name: true, maxPerSoldier: true } } },
      });

      // קטגוריות עם מגבלה + כל סוגי הפריט שבהן (לחישוב סה"כ פר-קטגוריה)
      const cats = new Map<string, { name: string; max: number }>();
      for (const t of types) if (t.category?.maxPerSoldier != null) cats.set(t.category.id, { name: t.category.name, max: t.category.maxPerSoldier });
      const catMembers = cats.size > 0
        ? await prisma.itemType.findMany({ where: { battalionId: bId, categoryId: { in: [...cats.keys()] } }, select: { id: true, categoryId: true } })
        : [];

      // כמה כבר חתום על החייל — מחושב בבת אחת לכל הסוגים הרלוונטיים (2 שאילתות, ללא N+1)
      const allTypeIds = [...new Set([...typeIds, ...catMembers.map((m) => m.id)])];
      const [serialGroups, qtyLines] = await Promise.all([
        prisma.serialUnit.groupBy({ by: ["itemTypeId"], where: { battalionId: bId, signedSoldierId: soldierId, itemTypeId: { in: allTypeIds } }, _count: { _all: true } }),
        prisma.transferLine.findMany({
          where: { serialUnitId: null, itemTypeId: { in: allTypeIds }, transfer: { battalionId: bId, status: "COMPLETED", type: { in: ["SIGNOUT", "CHECKIN"] }, toSoldierId: soldierId } },
          select: { itemTypeId: true, quantity: true, transfer: { select: { type: true } } },
        }),
      ]);
      const current = new Map<string, number>();
      for (const g of serialGroups) current.set(g.itemTypeId, g._count._all);
      const netByType = new Map<string, number>();
      for (const l of qtyLines) { if (!l.itemTypeId) continue; netByType.set(l.itemTypeId, (netByType.get(l.itemTypeId) ?? 0) + (l.transfer.type === "SIGNOUT" ? 1 : -1) * l.quantity); }
      for (const [tid, net] of netByType) current.set(tid, (current.get(tid) ?? 0) + Math.max(0, net));
      const curOf = (id: string) => current.get(id) ?? 0;

      // בדיקה פר סוג-פריט
      for (const t of types) {
        if (t.maxPerSoldier == null) continue;
        const cur = curOf(t.id);
        if (cur + (addByType.get(t.id) ?? 0) > t.maxPerSoldier) {
          return { error: `🚫 חייל יכול להיות חתום על מקסימום ${t.maxPerSoldier} × ${t.name}. כבר חתום ${cur}, מנסה להוסיף ${addByType.get(t.id) ?? 0}.` };
        }
      }

      // בדיקה פר קטגוריה (סה"כ מכל הסוגים בקטגוריה)
      for (const [catId, cat] of cats) {
        const memberIds = new Set(catMembers.filter((m) => m.categoryId === catId).map((m) => m.id));
        let curTotal = 0;
        for (const id of memberIds) curTotal += curOf(id);
        let addTotal = 0;
        for (const [tid, n] of addByType) if (memberIds.has(tid)) addTotal += n;
        if (curTotal + addTotal > cat.max) {
          return { error: `🚫 חייל יכול להיות חתום על מקסימום ${cat.max} מקטגוריית "${cat.name}" (מכל הסוגים). כבר חתום ${curTotal}, מנסה להוסיף ${addTotal}.` };
        }
      }
    }
  }

  // 🛡️ ולידציה: לא ניתן להחתים יותר ממה שיש במלאי (פריטים כמותיים שהמשתמש בחר ידנית)
  if (user.holderId && qtyItems.length > 0) {
    for (let i = 0; i < qtyItems.length; i++) {
      const itemTypeId = qtyItems[i];
      const quantity = qtyValues[i];
      const statusId = qtyStatuses[i];
      if (!itemTypeId || !statusId || quantity < 1) continue;
      const balance = await prisma.stockBalance.findFirst({
        where: { itemTypeId, holderId: user.holderId, statusId, battalionId: bId },
      });
      const available = balance?.quantity ?? 0;
      if (available < quantity) {
        const item = await prisma.itemType.findUnique({ where: { id: itemTypeId }, select: { name: true } });
        return { error: `🚫 לא מספיק מלאי של "${item?.name ?? itemTypeId}": מבקש ${quantity}, זמין ${available}` };
      }
    }
  }

  console.log("[createSignout] validations passed, creating transaction...");
  const token = nanoid(24);
  let transferId = "";
  try {
  await prisma.$transaction(async (tx) => {
    const transfer = await tx.transfer.create({
      data: { battalionId: bId, type: "SIGNOUT", status: "PENDING", toSoldierId: soldierId, fromHolderId: user.holderId, createdById: user.id, notes: kitId ? "החתמה על ערכה" : null },
    });
    transferId = transfer.id;
    // יחידות סריאליות שנבחרו ידנית
    for (const sid of serialIds) {
      const su = await tx.serialUnit.findUnique({ where: { id: sid } });
      if (!su) continue;
      // אם זו אצווה והגיע lotQty — שולח כמות חלקית
      const partialLotQty = parseInt(String(formData.get(`lotQty:${sid}`) || "0"), 10);
      const lineQty = partialLotQty > 0 && partialLotQty < (su.lotQuantity ?? 1) ? partialLotQty : (su.lotQuantity ?? 1);
      await tx.transferLine.create({ data: { transferId: transfer.id, itemTypeId: su.itemTypeId, quantity: lineQty, serialUnitId: sid, statusId: su.statusId } });
      // עדכון מיקום פיזי + רכב + מיקום ציוד (חדש)
      const updateData: { vehicleId?: string; physicalLocation?: string; equipmentLocationId?: string } = {};
      if (vehicleId) updateData.vehicleId = vehicleId;
      if (physicalLocation) updateData.physicalLocation = physicalLocation;
      if (equipmentLocationId) updateData.equipmentLocationId = equipmentLocationId;
      if (Object.keys(updateData).length > 0) {
        await tx.serialUnit.update({ where: { id: sid }, data: updateData });
      }
    }
    // פריטים מהערכה — תמיכה בכמותי וסריאלי
    for (const l of kitLines) {
      if (l.itemType.trackingMethod === "QUANTITY" || l.itemType.trackingMethod === "LOT") {
        const status = await tx.itemStatus.findFirst({ where: { battalionId: bId, isDefault: true } });
        await tx.transferLine.create({
          data: { transferId: transfer.id, itemTypeId: l.itemTypeId, quantity: l.quantity, statusId: status?.id },
        });
      } else if (l.itemType.trackingMethod === "SERIAL") {
        // משיכת SN פנוי (לא חתום) מהמחסן של המשתמש
        const available = await tx.serialUnit.findMany({
          where: {
            battalionId: bId, itemTypeId: l.itemTypeId, signedSoldierId: null,
            ...(user.holderId ? { currentHolderId: user.holderId } : {}),
          },
          take: l.quantity,
        });
        if (available.length < l.quantity) {
          throw new Error(`אין מספיק יחידות סריאליות פנויות של ${l.itemType.name} (נדרש: ${l.quantity}, זמין: ${available.length})`);
        }
        for (const su of available) {
          await tx.transferLine.create({
            data: { transferId: transfer.id, itemTypeId: l.itemTypeId, quantity: 1, serialUnitId: su.id, statusId: su.statusId },
          });
          if (vehicleId) {
            await tx.serialUnit.update({ where: { id: su.id }, data: { vehicleId } });
          }
        }
      }
    }
    // פריטים כמותיים שנבחרו ידנית בעגלה
    for (let i = 0; i < qtyItems.length; i++) {
      const itemTypeId = qtyItems[i];
      const quantity = qtyValues[i];
      const statusId = qtyStatuses[i] || null;
      if (!itemTypeId || quantity < 1) continue;
      await tx.transferLine.create({
        data: { transferId: transfer.id, itemTypeId, quantity, statusId },
      });
    }
    await tx.signature.create({
      data: { battalionId: bId, soldierId, transferId: transfer.id, method, status: "PENDING", token, tokenExpires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7) },
    });
  });
  console.log("[createSignout] transaction OK, transferId:", transferId);
  } catch (txErr) {
    console.error("[createSignout] TRANSACTION FAILED:", txErr);
    return { error: txErr instanceof Error ? txErr.message : "שגיאה ביצירת ההחתמה" };
  }

  try {
    await audit(user.id, "CREATE_SIGNOUT", "Transfer", transferId, { soldierId, method, retroactive });
    // חתימה בדיעבד: משייכים את הפריטים ומורידים מהמלאי מיד, ושולחים לחייל בקשת חתימה בטלגרם.
    if (retroactive) {
      const tr = await prisma.transfer.findUnique({ where: { id: transferId }, include: { lines: true } });
      if (tr) {
        await prisma.$transaction(async (tx) => {
          await assignSignoutLinesToSoldier(tx, tr.lines, soldierId, user.holderId ?? null, bId);
          await tx.transfer.update({ where: { id: transferId }, data: { status: "COMPLETED", approvedAt: new Date(), signaturePending: true } });
        });
        await notifySoldierSignRequest(soldierId, bId, token);
      }
      revalidatePath("/signatures");
      redirect(`/signatures?tab=pending`);
    }
    revalidatePath("/signatures");
    if (method === "ONSITE") redirect(`/sign/${token}`);
    redirect(`/signatures/${token}`);
  } catch (postErr) {
    if (isRedirectError(postErr)) throw postErr;
    console.error("[createSignout] POST-TX ERROR:", postErr);
    return { error: postErr instanceof Error ? postErr.message : "שגיאה לאחר יצירת ההחתמה" };
  }
}

/** השלמת חתימה (ציבורי) */
export async function completeSignature(token: string, signatureData: string) {
  console.log("[completeSignature] START token:", token?.slice(0, 8));
  const sig = await prisma.signature.findUnique({ where: { token }, include: { transfer: { include: { lines: true } } } });
  if (!sig || sig.status !== "PENDING" || !sig.transfer) return { ok: false, error: "החתימה אינה זמינה או כבר בוצעה" };
  console.log("[completeSignature] sig found, lines:", sig.transfer.lines.length, "serial lines:", sig.transfer.lines.filter(l => l.serialUnitId).length);
  if (sig.tokenExpires && sig.tokenExpires < new Date()) {
    await prisma.signature.update({ where: { token }, data: { status: "EXPIRED" } });
    return { ok: false, error: "פג תוקף הקישור" };
  }

  if (!sig.soldierId) return { ok: false, error: "סוג חתימה לא תואם" };
  const soldierId = sig.soldierId;
  const fromHolderId = sig.transfer!.fromHolderId;
  const bId = sig.battalionId;
  try {
  await prisma.$transaction(async (tx) => {
    // חתימה בדיעבד: הפריטים כבר שויכו וירדו מהמלאי — לא לחזור על השיוך, רק לסמן חתום.
    if (!sig.transfer!.signaturePending) {
      await assignSignoutLinesToSoldier(tx, sig.transfer!.lines, soldierId, fromHolderId, bId);
    }
    await tx.signature.update({ where: { token }, data: { status: "SIGNED", signatureData, signedAt: new Date() } });
    await tx.transfer.update({ where: { id: sig.transferId! }, data: { status: "COMPLETED", approvedAt: new Date(), signaturePending: false } });
  });
  console.log("[completeSignature] transaction OK");
  } catch (txErr) {
    console.error("[completeSignature] TRANSACTION FAILED:", txErr);
    return { ok: false, error: txErr instanceof Error ? txErr.message : "שגיאה בביצוע החתימה" };
  }

  await audit(null, "SIGN", "Signature", sig.id, { soldierId });

  // 🔫 חתימה על נוהל שמירת נשק — נחתם אוטומטית כשהחייל חותם על נשק בארמון
  try {
    if (soldierId) {
      const { areAnyItemsArmory } = await import("@/lib/weapons-eligibility");
      const itemTypeIds = sig.transfer!.lines.map((l) => l.itemTypeId);
      if (await areAnyItemsArmory(itemTypeIds)) {
        const soldier = await prisma.soldier.findUnique({ where: { id: soldierId }, select: { weaponsAgreementSignedAt: true } });
        if (soldier && !soldier.weaponsAgreementSignedAt) {
          await prisma.soldier.update({
            where: { id: soldierId },
            data: { weaponsAgreementSignedAt: new Date() },
          });
          await audit(null, "WEAPONS_AGREEMENT_SIGNED", "Soldier", soldierId, { reason: "חתימה אוטומטית עם קבלת נשק" });
        }
      }
    }
  } catch (weaponsErr) {
    console.error("[completeSignature] weapons agreement auto-sign failed (non-fatal):", weaponsErr);
  }

  const telegramSent = await notifySoldierTelegram(soldierId, bId, sig.transferId, "SIGN");

  revalidatePath("/signatures");
  return { ok: true, telegramSent };
}

/** זיכוי מהיר (Fast Check-in) */
export async function checkinSerial(formData: FormData): Promise<{ error: string } | void> {
  const user = await requireUser();
  if (!can(user, "signatures.manage")) redirect("/signatures");
  const bId = user.battalionId!;
  const serialUnitId = String(formData.get("serialUnitId") || "");
  const statusId = String(formData.get("statusId") || "");
  const partialLotQty = parseInt(String(formData.get("lotQty") || "0"), 10);

  const su = await prisma.serialUnit.findUnique({ where: { id: serialUnitId }, include: { signedSoldier: true } });
  if (!su || !su.signedSoldierId) return;

  // 🔒 אכיפת מ.א. — אם הגדוד דורש, חייב להיות לחייל מ.א.
  if (await requiresPersonalId(bId)) {
    if (!su.signedSoldier?.personalNumber) {
      return { error: `🔒 הגדוד דורש מ.א. בכל מסירה. החייל ${su.signedSoldier?.fullName ?? ""} לא מקושר למ.א.` };
    }
  }

  const isLot = (su.lotQuantity ?? 1) > 1;
  const isPartial = isLot && partialLotQty > 0 && partialLotQty < (su.lotQuantity ?? 1);
  const lineQty = isPartial ? partialLotQty : (su.lotQuantity ?? 1);

  const serialCheckinTransferId = await prisma.$transaction(async (tx) => {
    if (isPartial) {
      const finalStatus = statusId || su.statusId;
      // 🆕 ניסיון מיזוג: חפש אצווה-הורה במחסן עם אותו סטטוס וSN-מקור — וצרף אליה.
      // SN-מקור = ה-serialNumber לפני סופיקס `/N` (למשל 1234585/1 → המקור 1234585).
      const parentSerial = (() => {
        const lastSlash = su.serialNumber.lastIndexOf("/");
        if (lastSlash < 0) return su.serialNumber;
        const suffix = su.serialNumber.slice(lastSlash + 1);
        return /^\d+$/.test(suffix) ? su.serialNumber.slice(0, lastSlash) : su.serialNumber;
      })();
      const mergeTarget = await tx.serialUnit.findFirst({
        where: {
          itemTypeId: su.itemTypeId,
          currentHolderId: su.currentHolderId,
          signedSoldierId: null,
          statusId: finalStatus,
          serialNumber: { in: [parentSerial, su.serialNumber] },
          id: { not: su.id },
          lotQuantity: { gt: 1 }, // אצווה בלבד
        },
      });

      if (mergeTarget) {
        // 🟢 מיזוג: מוסיפים ל-target ומקטינים את המקור — בלי יצירת ילד
        await tx.serialUnit.update({
          where: { id: mergeTarget.id },
          data: { lotQuantity: (mergeTarget.lotQuantity ?? 1) + partialLotQty },
        });
      } else {
        // אין אצווה-הורה במחסן — יוצרים יחידה חדשה (התנהגות מקורית)
        let suffix = 1;
        while (await tx.serialUnit.findFirst({ where: { itemTypeId: su.itemTypeId, serialNumber: `${su.serialNumber}/${suffix}` } })) {
          suffix++;
        }
        await tx.serialUnit.create({
          data: {
            battalionId: bId, itemTypeId: su.itemTypeId,
            serialNumber: `${su.serialNumber}/${suffix}`,
            lotQuantity: partialLotQty,
            statusId: finalStatus,
            currentHolderId: su.currentHolderId,
          },
        });
      }
      await tx.serialUnit.update({
        where: { id: su.id },
        data: { lotQuantity: (su.lotQuantity ?? 1) - partialLotQty },
      });
    } else {
      // זיכוי שלם — היחידה חוזרת למחסן
      await tx.serialUnit.update({ where: { id: serialUnitId }, data: { signedSoldierId: null, ...(statusId ? { statusId } : {}) } });
    }
    const t = await tx.transfer.create({
      data: {
        battalionId: bId, type: "CHECKIN", status: "COMPLETED", toHolderId: su.currentHolderId, createdById: user.id, approvedById: user.id, approvedAt: new Date(),
        reason: isPartial ? `זיכוי חלקי מאצווה ${su.serialNumber} — ${partialLotQty}/${su.lotQuantity}` : "זיכוי מהיר",
        lines: { create: { itemTypeId: su.itemTypeId, quantity: lineQty, serialUnitId: su.id, statusId: statusId || su.statusId } },
      },
      select: { id: true },
    });
    return t.id;
  });

  await audit(user.id, "CHECKIN", "SerialUnit", serialUnitId, { soldier: su.signedSoldier?.fullName, partial: isPartial ? partialLotQty : null });
  // מייל התראה + PDF — דרך ישות Transfer (ה-audit רושם SerialUnit ולכן אינו מפעיל מייל לבדו)
  {
    const { notifyTransactionEmail } = await import("@/lib/email");
    void notifyTransactionEmail({ battalionId: bId, userId: user.id, action: "CHECKIN", entity: "Transfer", entityId: serialCheckinTransferId, holderId: su.currentHolderId, details: { serialUnitId, soldier: su.signedSoldier?.fullName } });
  }

  // 🔫 איפוס דגלי נשק אם החייל החזיר את הנשק האחרון
  if (su.signedSoldierId && !isPartial) {
    const { soldierHasAnyWeapons, resetSoldierWeaponsFlags } = await import("@/lib/weapons-eligibility");
    const stillHas = await soldierHasAnyWeapons(su.signedSoldierId);
    if (!stillHas) {
      await resetSoldierWeaponsFlags(su.signedSoldierId);
      await audit(user.id, "RESET_WEAPONS_FLAGS", "Soldier", su.signedSoldierId, { reason: "החזיר נשק אחרון" });
    }
  }

  if (su.signedSoldierId) void notifySoldierTelegram(su.signedSoldierId, bId, serialCheckinTransferId, "CHECKIN");

  revalidatePath("/signatures");
  revalidatePath("/my-equipment");
}

/** זיכוי כמותי של חייל: יוצר CHECKIN, מחזיר StockBalance למחסן. */
export async function checkinQuantity(formData: FormData): Promise<{ error: string } | void> {
  const user = await requireUser();
  if (!can(user, "signatures.manage")) redirect("/signatures");
  const bId = user.battalionId!;
  const soldierId = String(formData.get("soldierId") || "");
  const itemTypeId = String(formData.get("itemTypeId") || "");
  const statusId = String(formData.get("statusId") || "");
  const newStatusId = String(formData.get("newStatusId") || "") || null;
  const quantity = parseInt(String(formData.get("quantity") || "0"), 10);
  let toHolderId = String(formData.get("toHolderId") || "") || (user.holderId ?? null);
  if (!soldierId || !itemTypeId || !statusId || quantity < 1) {
    return { error: "חסרים נתונים — חייל / פריט / כמות" };
  }
  if (!toHolderId) {
    const origTransfer = await prisma.transfer.findFirst({
      where: { battalionId: bId, type: "SIGNOUT", status: "COMPLETED", toSoldierId: soldierId, lines: { some: { itemTypeId } } },
      select: { fromHolderId: true },
      orderBy: { createdAt: "desc" },
    });
    toHolderId = origTransfer?.fromHolderId ?? null;
    // fallback: החתמה ע"י מנהל מערכת יכולה להיות ללא fromHolderId — מחזירים למחסן לפי סוג הפריט
    if (!toHolderId) {
      const it = await prisma.itemType.findUnique({ where: { id: itemTypeId }, select: { category: { select: { warehouseType: true } } } });
      const wt = it?.category?.warehouseType ?? null;
      const wh = (wt && await prisma.holder.findFirst({ where: { battalionId: bId, kind: "WAREHOUSE", active: true, warehouseType: wt }, select: { id: true } }))
        || await prisma.holder.findFirst({ where: { battalionId: bId, kind: "WAREHOUSE", active: true }, select: { id: true } });
      toHolderId = wh?.id ?? null;
    }
    if (!toHolderId) return { error: "לא נמצא מחסן יעד להחזרה — פנה לקצין מחסן" };
  }

  const checkinTransferId = await prisma.$transaction(async (tx) => {
    const finalStatusId = newStatusId || statusId;
    // מחזיר ל-StockBalance של המחסן עם הסטטוס הסופי
    const existing = await tx.stockBalance.findFirst({
      where: { itemTypeId, holderId: toHolderId, statusId: finalStatusId, battalionId: bId },
    });
    if (existing) {
      await tx.stockBalance.update({ where: { id: existing.id }, data: { quantity: existing.quantity + quantity } });
    } else {
      await tx.stockBalance.create({
        data: { battalionId: bId, itemTypeId, holderId: toHolderId, statusId: finalStatusId, quantity },
      });
    }
    const t = await tx.transfer.create({
      data: {
        battalionId: bId, type: "CHECKIN", status: "COMPLETED",
        toHolderId, toSoldierId: soldierId,
        createdById: user.id, approvedById: user.id, approvedAt: new Date(),
        reason: "זיכוי כמותי מחייל",
        lines: { create: { itemTypeId, quantity, statusId: finalStatusId } },
      },
      select: { id: true },
    });
    return t.id;
  });

  await audit(user.id, "CHECKIN_QTY", "Soldier", soldierId, { itemTypeId, quantity });
  // מייל התראה + PDF — דרך ישות Transfer (ה-audit רושם Soldier ולכן אינו מפעיל מייל לבדו)
  const { notifyTransactionEmail } = await import("@/lib/email");
  void notifyTransactionEmail({ battalionId: bId, userId: user.id, action: "CHECKIN_QTY", entity: "Transfer", entityId: checkinTransferId, holderId: toHolderId, details: { itemTypeId, quantity, soldierId } });
  // טלגרם עם PDF תעודת הזיכוי
  void notifySoldierTelegram(soldierId, bId, checkinTransferId, "CHECKIN");

  revalidatePath("/signatures");
}

/** ביטול ציבורי לפי token — מאפשר לחייל/נמען לבטל לפני שחתם */
export async function cancelSignatureByToken(token: string): Promise<{ ok?: boolean; error?: string; soldierId?: string; serialIds?: string[] }> {
  try {
    const sig = await prisma.signature.findUnique({
      where: { token },
      select: { id: true, status: true, transferId: true, soldierId: true, signerUserId: true, battalionId: true, tokenExpires: true },
    });
    if (!sig) return { error: "לא נמצא" };
    if (sig.status !== "PENDING") return { error: "לא ניתן לבטל" };
    if (sig.tokenExpires && sig.tokenExpires < new Date()) return { error: "פג תוקף הקישור" };
    let serialIds: string[] = [];
    await prisma.$transaction(async (tx) => {
      if (sig.transferId) {
        const transfer = await tx.transfer.findUnique({ where: { id: sig.transferId }, include: { lines: true } });
        if (transfer) {
          serialIds = transfer.lines.filter((l) => l.serialUnitId).map((l) => l.serialUnitId!);
          // החתמת פלוגה — מלאי הורד מראש ב-createCompanySign, צריך להחזיר
          if (sig.signerUserId && transfer.fromHolderId) {
            const { adjustQuantity } = await import("@/lib/inventory");
            for (const line of transfer.lines) {
              if (line.serialUnitId) {
                await tx.serialUnit.update({ where: { id: line.serialUnitId }, data: { currentHolderId: transfer.fromHolderId } });
              } else if (line.statusId) {
                await adjustQuantity(tx, sig.battalionId, line.itemTypeId, transfer.fromHolderId, line.statusId, line.quantity);
              }
            }
          }
          // מוחקים את ההחתמה + ה-Transfer — לא נחתם, לא קרה כלום במלאי
          await tx.signature.delete({ where: { id: sig.id } });
          await tx.transfer.delete({ where: { id: sig.transferId } });
        } else {
          await tx.signature.delete({ where: { id: sig.id } });
        }
      } else {
        await tx.signature.delete({ where: { id: sig.id } });
      }
    });
    revalidatePath("/signatures");
    return { ok: true, soldierId: sig.soldierId ?? undefined, serialIds };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "שגיאה" };
  }
}

/** הסרת שורת פריט מהחתמה ממתינה (לפני חתימה) */
export async function removeTransferLineByToken(token: string, lineId: string): Promise<{ ok?: boolean; error?: string }> {
  try {
    const sig = await prisma.signature.findUnique({
      where: { token },
      select: { status: true, transferId: true, tokenExpires: true },
    });
    if (!sig || sig.status !== "PENDING" || !sig.transferId) return { error: "לא ניתן לערוך" };
    if (sig.tokenExpires && sig.tokenExpires < new Date()) return { error: "פג תוקף הקישור" };
    const line = await prisma.transferLine.findUnique({ where: { id: lineId } });
    if (!line || line.transferId !== sig.transferId) return { error: "שורה לא נמצאה" };
    const remaining = await prisma.transferLine.count({ where: { transferId: sig.transferId } });
    if (remaining <= 1) return { error: "לא ניתן להסיר את הפריט האחרון. בטל את ההחתמה במקום." };
    await prisma.transferLine.delete({ where: { id: lineId } });
    revalidatePath(`/sign/${token}`);
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "שגיאה" };
  }
}

/** עדכון כמות בשורת פריט בהחתמה ממתינה (לפני חתימה) */
export async function updateTransferLineQtyByToken(token: string, lineId: string, newQty: number): Promise<{ ok?: boolean; error?: string }> {
  try {
    if (newQty < 1) return { error: "כמות חייבת להיות לפחות 1" };
    const sig = await prisma.signature.findUnique({
      where: { token },
      select: { status: true, transferId: true, tokenExpires: true },
    });
    if (!sig || sig.status !== "PENDING" || !sig.transferId) return { error: "לא ניתן לערוך" };
    if (sig.tokenExpires && sig.tokenExpires < new Date()) return { error: "פג תוקף הקישור" };
    const line = await prisma.transferLine.findUnique({ where: { id: lineId } });
    if (!line || line.transferId !== sig.transferId) return { error: "שורה לא נמצאה" };
    await prisma.transferLine.update({ where: { id: lineId }, data: { quantity: newQty } });
    revalidatePath(`/sign/${token}`);
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "שגיאה" };
  }
}

/** עטיפה void לשימוש ב-<form action={...}> ב-Server Components */
export async function cancelSignatureForm(formData: FormData): Promise<void> {
  await cancelSignature(formData);
}

/**
 * ביטול תעודת החתמה ממתינה — מבטל את ה-transfer והסיגנטור,
 * ומשחרר את הפריטים הסריאליים שהיו "מנעולים" לאותה החתמה.
 */
export async function cancelSignature(formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  try {
    const user = await requireUser();
    if (!can(user, "signatures.manage")) return { error: "אין הרשאה" };
    const bId = user.battalionId!;
    const signatureId = String(formData.get("signatureId") || "");
    if (!signatureId) return { error: "חסר מזהה" };

    const sig = await prisma.signature.findUnique({ where: { id: signatureId }, include: { transfer: { include: { lines: true } } } });
    if (!sig || sig.battalionId !== bId) return { error: "לא נמצא" };
    if (sig.status !== "PENDING") return { error: "לא ניתן לבטל — החתימה כבר הושלמה / בוטלה" };

    await prisma.$transaction(async (tx) => {
      await tx.signature.update({ where: { id: signatureId }, data: { status: "CANCELED" } });
      if (sig.transferId && sig.transfer) {
        await tx.transfer.update({ where: { id: sig.transferId }, data: { status: "REJECTED" } });
        // החתמת פלוגה — מלאי הורד מראש, צריך להחזיר
        if (sig.signerUserId && sig.transfer.fromHolderId) {
          const { adjustQuantity } = await import("@/lib/inventory");
          for (const line of sig.transfer.lines) {
            if (line.serialUnitId) {
              await tx.serialUnit.update({ where: { id: line.serialUnitId }, data: { currentHolderId: sig.transfer.fromHolderId } });
            } else if (line.statusId) {
              await adjustQuantity(tx, bId, line.itemTypeId, sig.transfer.fromHolderId, line.statusId, line.quantity);
            }
          }
        }
      }
    });
    await audit(user.id, "CANCEL_SIGNATURE", "Signature", signatureId);
    revalidatePath("/signatures");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "שגיאה" };
  }
}

/** עדכון מיקום פיזי (אחריות מול מיקום) */
export async function updatePhysicalLocation(formData: FormData) {
  const user = await requireUser();
  if (!can(user, "signatures.manage")) redirect("/signatures");
  const serialUnitId = String(formData.get("serialUnitId") || "");
  const physicalLocation = String(formData.get("physicalLocation") || "").trim() || null;
  await prisma.serialUnit.update({ where: { id: serialUnitId }, data: { physicalLocation } });
  await audit(user.id, "UPDATE_LOCATION", "SerialUnit", serialUnitId, { physicalLocation });
  revalidatePath("/signatures");
}

/** זיכוי batch: כל הפריטים (סריאלי+כמותי) בהעברה אחת → מחזיר transferId */
export async function checkinBatch(payload: {
  soldierId: string;
  serialUnitIds: string[];
  partialLotQtys: Record<string, number>;
  statusId: string;
  qtyItems: { itemTypeId: string; statusId: string; quantity: number }[];
  toHolderId: string;
}): Promise<{ ok: true; transferId: string; soldierName: string; soldierPhone: string | null } | { ok: false; error: string }> {
  const user = await requireUser();
  if (!can(user, "signatures.manage")) return { ok: false, error: "אין הרשאה" };
  const bId = user.battalionId!;
  const { soldierId, serialUnitIds, partialLotQtys, statusId, qtyItems, toHolderId } = payload;

  if (!soldierId || (serialUnitIds.length === 0 && qtyItems.length === 0)) {
    return { ok: false, error: "חסרים נתונים" };
  }

  const soldier = await prisma.soldier.findUnique({ where: { id: soldierId }, select: { fullName: true, phone: true } });
  if (!soldier) return { ok: false, error: "חייל לא נמצא" };

  if (await requiresPersonalId(bId)) {
    const s = await prisma.soldier.findUnique({ where: { id: soldierId }, select: { personalNumber: true, fullName: true } });
    if (!s?.personalNumber) return { ok: false, error: `🔒 הגדוד דורש מ.א. לחייל ${s?.fullName ?? ""}` };
  }

  try {
    const transferId = await prisma.$transaction(async (tx) => {
      type LineCreate = { itemTypeId: string; quantity: number; serialUnitId?: string; statusId: string };
      const lines: LineCreate[] = [];

      for (const unitId of serialUnitIds) {
        const su = await tx.serialUnit.findUnique({ where: { id: unitId }, include: { signedSoldier: true } });
        if (!su || !su.signedSoldierId) continue;

        const partialQty = partialLotQtys[unitId] ?? 0;
        const isLot = (su.lotQuantity ?? 1) > 1;
        const isPartial = isLot && partialQty > 0 && partialQty < (su.lotQuantity ?? 1);
        const lineQty = isPartial ? partialQty : (su.lotQuantity ?? 1);
        const finalStatus = statusId || su.statusId;

        if (isPartial) {
          const parentSerial = (() => {
            const lastSlash = su.serialNumber.lastIndexOf("/");
            if (lastSlash < 0) return su.serialNumber;
            const suffix = su.serialNumber.slice(lastSlash + 1);
            return /^\d+$/.test(suffix) ? su.serialNumber.slice(0, lastSlash) : su.serialNumber;
          })();
          const mergeTarget = await tx.serialUnit.findFirst({
            where: {
              itemTypeId: su.itemTypeId, currentHolderId: su.currentHolderId,
              signedSoldierId: null, statusId: finalStatus,
              serialNumber: { in: [parentSerial, su.serialNumber] },
              id: { not: su.id }, lotQuantity: { gt: 1 },
            },
          });
          if (mergeTarget) {
            await tx.serialUnit.update({ where: { id: mergeTarget.id }, data: { lotQuantity: (mergeTarget.lotQuantity ?? 1) + partialQty } });
          } else {
            let suffix = 1;
            while (await tx.serialUnit.findFirst({ where: { itemTypeId: su.itemTypeId, serialNumber: `${su.serialNumber}/${suffix}` } })) suffix++;
            await tx.serialUnit.create({
              data: { battalionId: bId, itemTypeId: su.itemTypeId, serialNumber: `${su.serialNumber}/${suffix}`, lotQuantity: partialQty, statusId: finalStatus, currentHolderId: su.currentHolderId },
            });
          }
          await tx.serialUnit.update({ where: { id: su.id }, data: { lotQuantity: (su.lotQuantity ?? 1) - partialQty } });
        } else {
          await tx.serialUnit.update({ where: { id: unitId }, data: { signedSoldierId: null, ...(statusId ? { statusId } : {}) } });
        }

        lines.push({ itemTypeId: su.itemTypeId, quantity: lineQty, serialUnitId: su.id, statusId: finalStatus });
      }

      for (const q of qtyItems) {
        if (q.quantity < 1) continue;
        const finalStatusId = statusId || q.statusId;
        // מציאת מחסן יעד: אם לא סופק, מחפשים את מחסן המקור מהחתמה המקורית
        let targetHolder = toHolderId;
        if (!targetHolder) {
          const origTransfer = await tx.transfer.findFirst({
            where: { battalionId: bId, type: "SIGNOUT", status: "COMPLETED", toSoldierId: soldierId, lines: { some: { itemTypeId: q.itemTypeId } } },
            select: { fromHolderId: true },
            orderBy: { createdAt: "desc" },
          });
          targetHolder = origTransfer?.fromHolderId ?? "";
        }
        if (!targetHolder) throw new Error("לא נמצא מחסן יעד להחזרה — פנה לקצין מחסן");
        const existing = await tx.stockBalance.findFirst({ where: { itemTypeId: q.itemTypeId, holderId: targetHolder, statusId: finalStatusId, battalionId: bId } });
        if (existing) {
          await tx.stockBalance.update({ where: { id: existing.id }, data: { quantity: existing.quantity + q.quantity } });
        } else {
          await tx.stockBalance.create({ data: { battalionId: bId, itemTypeId: q.itemTypeId, holderId: targetHolder, statusId: finalStatusId, quantity: q.quantity } });
        }
        lines.push({ itemTypeId: q.itemTypeId, quantity: q.quantity, statusId: finalStatusId });
      }

      if (lines.length === 0) throw new Error("אין פריטים לזיכוי");

      // מציאת מחסן יעד לטרנספר: סריאלי ← currentHolderId; כמותי ← מקור ההחתמה
      const transferHolderId = toHolderId
        || (serialUnitIds.length > 0
          ? (await tx.serialUnit.findUnique({ where: { id: serialUnitIds[0] }, select: { currentHolderId: true } }))?.currentHolderId
          : null)
        || null;

      const transfer = await tx.transfer.create({
        data: {
          battalionId: bId, type: "CHECKIN", status: "COMPLETED",
          toHolderId: transferHolderId, toSoldierId: soldierId,
          createdById: user.id, approvedById: user.id, approvedAt: new Date(),
          reason: `זיכוי ${lines.length} פריטים`,
          lines: { create: lines },
        },
      });
      return transfer.id;
    });

    await audit(user.id, "CHECKIN_BATCH", "Soldier", soldierId, { items: serialUnitIds.length + qtyItems.length });
    // מייל התראה + PDF — דרך ישות Transfer (ה-audit רושם Soldier ולכן אינו מפעיל מייל לבדו)
    {
      const { notifyTransactionEmail } = await import("@/lib/email");
      void notifyTransactionEmail({ battalionId: bId, userId: user.id, action: "CHECKIN_BATCH", entity: "Transfer", entityId: transferId, holderId: toHolderId || null, details: { soldierId, items: serialUnitIds.length + qtyItems.length } });
    }

    for (const unitId of serialUnitIds) {
      const su = await prisma.serialUnit.findUnique({ where: { id: unitId }, select: { signedSoldierId: true, itemTypeId: true } });
      if (su && !su.signedSoldierId) {
        const { soldierHasAnyWeapons, resetSoldierWeaponsFlags } = await import("@/lib/weapons-eligibility");
        const stillHas = await soldierHasAnyWeapons(soldierId);
        if (!stillHas) {
          await resetSoldierWeaponsFlags(soldierId);
          await audit(user.id, "RESET_WEAPONS_FLAGS", "Soldier", soldierId, { reason: "החזיר נשק אחרון" });
        }
        break;
      }
    }

    void notifySoldierTelegram(soldierId, bId, transferId, "CHECKIN");

    revalidatePath("/signatures");
    revalidatePath("/my-equipment");
    return { ok: true, transferId, soldierName: soldier.fullName, soldierPhone: soldier.phone };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "שגיאה בזיכוי" };
  }
}
