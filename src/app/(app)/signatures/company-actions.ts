"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/guard";
import { can } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { notifyIssuerTelegram } from "@/lib/notify";
import { adjustQuantity, defaultStatusId } from "@/lib/inventory";
import { requiresPersonalId } from "@/lib/handover";
import type { SignatureMethod } from "@/generated/prisma";

/**
 * החתמת פלוגה: ניפוק לפלוגה כשהנמען הוא משתמש בפלוגה (מפ/רס"פ),
 * הוא חותם דיגיטלית, והפריטים עוברים לפלוגה אוטומטית עם החתימה.
 * 🔒 הנמען חייב להיות מקושר לחייל ברוסטר עם מ.א. — איש קשר עם זיהוי.
 * מחזיר { token } להצלחה או { error } להודעת שגיאה בעברית.
 */
export async function createCompanySign(
  formData: FormData,
): Promise<{ token?: string; error?: string }> {
  try {
    const user = await requireUser();
    if (!can(user, "signatures.manage")) {
      return { error: "אין לך הרשאה להחתים פלוגה" };
    }
    const bId = user.battalionId!;

    const companyId = String(formData.get("companyId") || "");
    const recipientUserId = String(formData.get("recipientUserId") || "");
    const method = String(formData.get("method") || "QR") as SignatureMethod;
    const serialIds = formData.getAll("serial").map(String).filter(Boolean);
    const qtyEntries: { itemTypeId: string; statusId: string; qty: number }[] = [];
    for (const [key, val] of formData.entries()) {
      if (key.startsWith("qty:")) {
        const [, itemTypeId, statusId] = key.split(":");
        const qty = parseInt(String(val), 10);
        if (qty > 0 && itemTypeId && statusId) qtyEntries.push({ itemTypeId, statusId, qty });
      }
    }

    if (!companyId) return { error: "לא נבחרה פלוגה" };
    if (!recipientUserId) return { error: "לא נבחר נמען חותם — מי יקבל ויחתום על הציוד?" };
    if (serialIds.length === 0 && qtyEntries.length === 0) {
      return { error: "לא נבחרו פריטים להחתמה — הוסף לפחות פריט אחד לעגלה" };
    }

    // 🔒 הפלוגה חייבת להיות בגדוד המבצע — מונע החתמה מול פלוגה של גדוד אחר (IDOR)
    const company = await prisma.holder.findFirst({ where: { id: companyId, battalionId: bId }, select: { id: true } });
    if (!company) return { error: "הפלוגה לא נמצאה בגדוד" };

    // 🔒 ולידציה: נמען חייב להיות מקושר לחייל ברוסטר עם שם + מ.א.
    const recipient = await prisma.appUser.findUnique({
      where: { id: recipientUserId },
      select: {
        fullName: true,
        battalionId: true,
        soldier: { select: { fullName: true, personalNumber: true } },
      },
    });
    if (!recipient) {
      return { error: "הנמען החותם לא נמצא במערכת. רענן את הדף ונסה שוב." };
    }
    // 🔒 הנמען חייב להיות שייך לגדוד המבצע (IDOR)
    if (recipient.battalionId !== bId) {
      return { error: "הנמען אינו שייך לגדוד. רענן את הדף ונסה שוב." };
    }
    if (!recipient.soldier) {
      return {
        error: `🔒 ${recipient.fullName} לא מקושר לחייל ברוסטר השלישות. אי אפשר להחתים בלי איש קשר עם מ.א. — קשר אותו אצל המפ"מ ב-/users.`,
      };
    }
    if (!recipient.soldier.personalNumber || recipient.soldier.personalNumber.length < 5) {
      return {
        error: `🔒 לחייל ${recipient.soldier.fullName} חסר מספר אישי (מ.א.) ברוסטר. עדכן ב-/roster ונסה שוב.`,
      };
    }

  // מציאת מחסן המקור: למפ"מ — לפי המחסן של הפריט (קטגוריה→warehouseType)
  // לקצין מחסן — המחסן שלו
  const findSourceHolder = async (itemTypeId: string): Promise<string | null> => {
    if (user.holderId) return user.holderId;
    const item = await prisma.itemType.findUnique({
      where: { id: itemTypeId }, include: { category: true },
    });
    const wType = item?.category?.warehouseType;
    if (!wType) return null;
    const wh = await prisma.holder.findFirst({
      where: { battalionId: bId, kind: "WAREHOUSE", warehouseType: wType, active: true },
    });
    return wh?.id ?? null;
  };

    const token = nanoid(24);
    let transferId = "";
    await prisma.$transaction(async (tx) => {
      // 🛡️ ולידציה: לא ניתן להחתים יותר ממה שיש במלאי
      for (const e of qtyEntries) {
        const itemHolder = await findSourceHolder(e.itemTypeId);
        if (!itemHolder) throw new Error("לא נמצא מחסן המקור לפריט שנבחר");
        const balance = await tx.stockBalance.findFirst({
          where: { itemTypeId: e.itemTypeId, holderId: itemHolder, statusId: e.statusId, battalionId: bId },
        });
        const available = balance?.quantity ?? 0;
        if (available < e.qty) {
          const item = await tx.itemType.findUnique({ where: { id: e.itemTypeId }, select: { name: true } });
          throw new Error(`🚫 לא מספיק מלאי של "${item?.name ?? e.itemTypeId}": מבקש ${e.qty}, זמין ${available}`);
        }
      }

      // בחירת holder יחיד למפ"מ (לפי הפריט הראשון; כל הפריטים אמורים להיות מאותו מחסן)
      const sampleItemId = qtyEntries[0]?.itemTypeId ??
        (serialIds[0] ? (await tx.serialUnit.findUnique({ where: { id: serialIds[0] } }))?.itemTypeId : null);
      const fromHolderId = sampleItemId ? await findSourceHolder(sampleItemId) : null;

      const transfer = await tx.transfer.create({
        data: {
          battalionId: bId, type: "ISSUE", status: "PENDING",
          fromHolderId, toHolderId: companyId, toUserId: recipientUserId,
          notes: "החתמת פלוגה דרך נמען", createdById: user.id,
        },
      });
      transferId = transfer.id;

      for (const e of qtyEntries) {
        const itemHolder = await findSourceHolder(e.itemTypeId);
        if (itemHolder) {
          await adjustQuantity(tx, bId, e.itemTypeId, itemHolder, e.statusId, -e.qty);
        }
        await tx.transferLine.create({
          data: { transferId: transfer.id, itemTypeId: e.itemTypeId, quantity: e.qty, statusId: e.statusId },
        });
      }
      for (const sid of serialIds) {
        const su = await tx.serialUnit.findUnique({ where: { id: sid }, include: { transferLines: { where: { transfer: { status: "PENDING" } }, take: 1 } } });
        if (!su) continue;
        if (su.transferLines.length > 0) continue;
        const partialLotQty = parseInt(String(formData.get(`lotQty:${sid}`) || "0"), 10);
        const lineQty = partialLotQty > 0 && partialLotQty < (su.lotQuantity ?? 1) ? partialLotQty : (su.lotQuantity ?? 1);
        await tx.transferLine.create({
          data: { transferId: transfer.id, itemTypeId: su.itemTypeId, quantity: lineQty, serialUnitId: sid, statusId: su.statusId },
        });
      }
      await tx.signature.create({
        data: {
          battalionId: bId, signerUserId: recipientUserId, transferId: transfer.id,
          method, status: "PENDING", token,
          tokenExpires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
        },
      });
    });

    await audit(user.id, "COMPANY_SIGN_OUT", "Transfer", transferId, { companyId, recipientUserId });
    revalidatePath("/signatures");
    return { token };
  } catch (e) {
    const raw = e instanceof Error ? e.message : "שגיאה לא ידועה";
    // אם זו הודעת עברית שלנו — להעביר כמו שהיא; אחרת לעטוף בעברית
    const looksHebrew = /[֐-׿]/.test(raw);
    return {
      error: looksHebrew
        ? raw
        : `שגיאת מערכת ביצירת ההחתמה. פנה למפ"מ עם הפרטים הבאים: ${raw}`,
    };
  }
}

/** השלמת חתימה של נמען (מפ/רס"פ) → הפריטים עוברים לפלוגה */
export async function completeCompanySignature(token: string, signatureData: string) {
  const sig = await prisma.signature.findUnique({
    where: { token },
    include: { transfer: { include: { lines: true } } },
  });
  if (!sig || sig.status !== "PENDING" || !sig.transfer) return { ok: false, error: "החתימה אינה זמינה או כבר בוצעה" };
  if (sig.tokenExpires && sig.tokenExpires < new Date()) {
    // פג תוקף — מחזירים מלאי שהורד ב-createCompanySign
    await prisma.$transaction(async (tx) => {
      await tx.signature.update({ where: { token }, data: { status: "EXPIRED" } });
      await tx.transfer.update({ where: { id: sig.transferId! }, data: { status: "REJECTED" } });
      if (sig.transfer!.fromHolderId) {
        for (const line of sig.transfer!.lines) {
          if (line.serialUnitId) {
            await tx.serialUnit.update({ where: { id: line.serialUnitId }, data: { currentHolderId: sig.transfer!.fromHolderId } });
          } else if (line.statusId) {
            await adjustQuantity(tx, sig.battalionId, line.itemTypeId, sig.transfer!.fromHolderId!, line.statusId, line.quantity);
          }
        }
      }
    });
    return { ok: false, error: "פג תוקף הקישור — המלאי הוחזר למחסן" };
  }

  await prisma.$transaction(async (tx) => {
    const t = sig.transfer!;
    const targetHolderId = t.toHolderId!;
    for (const line of t.lines) {
      if (line.serialUnitId) {
        const unit = await tx.serialUnit.findUnique({ where: { id: line.serialUnitId } });
        if (!unit) continue;
        const isLot = (unit.lotQuantity ?? 1) > 1;
        const lineQty = line.quantity ?? 1;
        if (isLot && lineQty < (unit.lotQuantity ?? 1)) {
          // פיצול אצווה: יוצרים יחידה חדשה לפלוגה, מקטינים את המקור
          let suffix = 1;
          while (await tx.serialUnit.findFirst({ where: { itemTypeId: unit.itemTypeId, serialNumber: `${unit.serialNumber}/${suffix}` } })) {
            suffix++;
          }
          await tx.serialUnit.create({
            data: {
              battalionId: unit.battalionId, itemTypeId: unit.itemTypeId,
              serialNumber: `${unit.serialNumber}/${suffix}`, lotQuantity: lineQty,
              statusId: unit.statusId, currentHolderId: targetHolderId,
            },
          });
          await tx.serialUnit.update({
            where: { id: unit.id },
            data: { lotQuantity: (unit.lotQuantity ?? 1) - lineQty },
          });
        } else {
          await tx.serialUnit.update({ where: { id: line.serialUnitId }, data: { currentHolderId: targetHolderId } });
        }
      } else if (line.statusId) {
        const bId = t.battalionId!;
        const sId = line.statusId ?? await defaultStatusId(tx, bId);
        await adjustQuantity(tx, bId, line.itemTypeId, targetHolderId, sId, line.quantity);
      }
    }
    await tx.signature.update({ where: { token }, data: { status: "SIGNED", signatureData, signedAt: new Date() } });
    await tx.transfer.update({ where: { id: t.id }, data: { status: "COMPLETED", approvedAt: new Date() } });
  });

  await audit(null, "COMPANY_SIGN", "Signature", sig.id);
  // בבוט גם למחתים (יוצר התעודה) — אישור שהפלוגה חתמה
  await notifyIssuerTelegram(sig.transfer.createdById, sig.battalionId, sig.transferId, "signed");
  revalidatePath("/signatures");
  return { ok: true };
}

/**
 * זיכוי פלוגה — החזרת ציוד מפלוגה למחסן הגדודי המתאים (סריאלי וכמותי).
 * formData:
 *   - companyId: holderId של הפלוגה
 *   - serial[]: ids של SerialUnit להחזיר
 *   - qty:itemTypeId:statusId = כמות להחזיר (אפשר רבים)
 *   - newStatusId (אופציונלי): סטטוס חדש לכל הפריטים (תקול/אובדן וכו')
 */
export async function companyReturn(formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  try {
    const user = await requireUser();
    if (!can(user, "signatures.manage")) return { error: "אין הרשאה" };
    const bId = user.battalionId!;
    const companyId = String(formData.get("companyId") || "");
    const newStatusId = String(formData.get("newStatusId") || "") || null;
    const recipientName = String(formData.get("recipientName") || "").trim();
    const recipientPersonalId = String(formData.get("recipientPersonalId") || "").replace(/\D/g, "");
    const serialIds = formData.getAll("serial").map(String).filter(Boolean);
    const qtyEntries: { itemTypeId: string; statusId: string; qty: number }[] = [];
    for (const [key, val] of formData.entries()) {
      if (key.startsWith("qty:")) {
        const [, itemTypeId, statusId] = key.split(":");
        const qty = parseInt(String(val), 10);
        if (qty > 0 && itemTypeId && statusId) qtyEntries.push({ itemTypeId, statusId, qty });
      }
    }
    if (!companyId) return { error: "חסרה פלוגה" };
    // 🔒 רס"פ/מפלג — מזכה רק את הפלוגה שלו (חסימת פעולה על פלוגה אחרת)
    if (user.role === "COMPANY_REP" && user.holderId && companyId !== user.holderId) {
      return { error: "אין הרשאה לזכות פלוגה שאינה שלך" };
    }
    if (serialIds.length === 0 && qtyEntries.length === 0) return { error: "בחר לפחות פריט אחד" };
    if (!recipientName) return { error: "🔒 חובה למלא את שם המוסר מהפלוגה" };

    // 🔒 מ.א. - אם הגדוד דורש, חובה למלא ידנית בתעודה (לא נסמך יותר על רוסטר רס"פ)
    if (await requiresPersonalId(bId) && recipientPersonalId.length < 5) {
      return { error: "🔒 הגדוד דורש מ.א. בכל מסירה — חובה למלא מ.א. תקף (לפחות 5 ספרות)" };
    }

    // 📌 ולידציה מול 'ציוד קבוע' — לא ניתן לזכות מתחת לבסיס שהמפמ הגדיר.
    // אגרגציה לפי itemTypeId (לא תלוי סטטוס) - הבסיס אגרגטיבי.
    {
      const { getCompanyItemTotals } = await import("@/lib/company-stock-snapshot");
      const totals = await getCompanyItemTotals(bId, companyId);
      const baselines = await prisma.companyItemBaseline.findMany({
        where: { battalionId: bId, companyId },
        select: { itemTypeId: true, permanentQuantity: true },
      });
      const baselineMap = new Map(baselines.map((b) => [b.itemTypeId, b.permanentQuantity]));
      // סך כמות לזיכוי פר itemTypeId (כמותי + סריאלי שמיועד לחזרה)
      const returnByItem = new Map<string, number>();
      for (const e of qtyEntries) returnByItem.set(e.itemTypeId, (returnByItem.get(e.itemTypeId) ?? 0) + e.qty);
      if (serialIds.length > 0) {
        const units = await prisma.serialUnit.findMany({
          where: { id: { in: serialIds } },
          select: { id: true, itemTypeId: true, lotQuantity: true },
        });
        for (const u of units) {
          const partialLotQty = parseInt(String(formData.get(`lotQty:${u.id}`) || "0"), 10);
          const lineQty = partialLotQty > 0 && partialLotQty < (u.lotQuantity ?? 1) ? partialLotQty : (u.lotQuantity ?? 1);
          returnByItem.set(u.itemTypeId, (returnByItem.get(u.itemTypeId) ?? 0) + lineQty);
        }
      }
      // בדיקת כל פריט מול הבסיס
      for (const [itemTypeId, returnQty] of returnByItem.entries()) {
        const current = totals.get(itemTypeId) ?? 0;
        const baseline = baselineMap.get(itemTypeId) ?? 0;
        const allowedToReturn = Math.max(0, current - baseline);
        if (returnQty > allowedToReturn) {
          const item = await prisma.itemType.findUnique({ where: { id: itemTypeId }, select: { name: true } });
          return {
            error: `📌 לא ניתן לזכות ${returnQty} יח' של "${item?.name ?? "?"}" — הבסיס שהמפמ הגדיר הוא ${baseline}, יש בפלוגה ${current}, זמין לזיכוי ${allowedToReturn}. כדי לזכות יותר — פנה למפמ לעדכן את הבסיס.`,
          };
        }
      }
    }

    // איתור מחסן יעד לפי קטגוריית הפריט
    const findDestWarehouse = async (itemTypeId: string): Promise<string | null> => {
      const item = await prisma.itemType.findUnique({ where: { id: itemTypeId }, include: { category: true } });
      const wType = item?.category?.warehouseType;
      if (wType) {
        const wh = await prisma.holder.findFirst({ where: { battalionId: bId, kind: "WAREHOUSE", warehouseType: wType, active: true } });
        if (wh) return wh.id;
      }
      // fallback — מחסן ראשון
      const any = await prisma.holder.findFirst({ where: { battalionId: bId, kind: "WAREHOUSE", active: true } });
      return any?.id ?? null;
    };

    // 🔒 הפלוגה חייבת להיות בגדוד המבצע — מונע זיכוי מפלוגת גדוד אחר (IDOR)
    const companyHolder = await prisma.holder.findFirst({ where: { id: companyId, battalionId: bId }, select: { id: true } });
    if (!companyHolder) return { error: "הפלוגה לא נמצאה בגדוד" };

    let transferId = "";
    await prisma.$transaction(async (tx) => {
      const sampleItemId = qtyEntries[0]?.itemTypeId ??
        (serialIds[0] ? (await tx.serialUnit.findUnique({ where: { id: serialIds[0] } }))?.itemTypeId : null);
      const toHolderId = sampleItemId ? await findDestWarehouse(sampleItemId) : null;

      const transfer = await tx.transfer.create({
        data: {
          battalionId: bId, type: "RETURN", status: "COMPLETED",
          fromHolderId: companyId, toHolderId,
          reason: "זיכוי פלוגה",
          externalContact: recipientName,
          recipientPersonalId: recipientPersonalId || null,
          createdById: user.id, approvedById: user.id, approvedAt: new Date(),
        },
      });
      transferId = transfer.id;

      // סריאליים: סטטוס פר-שורה > כללי > מקור; אצוות חלקיות מתפצלות.
      for (const sid of serialIds) {
        const su = await tx.serialUnit.findUnique({ where: { id: sid } });
        if (!su || su.battalionId !== bId || su.currentHolderId !== companyId) continue; // 🔒 IDOR
        const destId = await findDestWarehouse(su.itemTypeId);
        const lineOverride = String(formData.get(`serialStatus:${sid}`) || "") || null;
        const finalStatus = lineOverride || newStatusId || su.statusId;
        const partialLotQty = parseInt(String(formData.get(`lotQty:${sid}`) || "0"), 10);
        const isLot = (su.lotQuantity ?? 1) > 1;
        const isPartial = isLot && partialLotQty > 0 && partialLotQty < (su.lotQuantity ?? 1);

        if (isPartial) {
          let suffix = 1;
          while (await tx.serialUnit.findFirst({ where: { itemTypeId: su.itemTypeId, serialNumber: `${su.serialNumber}/${suffix}` } })) {
            suffix++;
          }
          await tx.serialUnit.create({
            data: {
              battalionId: bId, itemTypeId: su.itemTypeId,
              serialNumber: `${su.serialNumber}/${suffix}`,
              lotQuantity: partialLotQty,
              statusId: finalStatus, currentHolderId: destId,
            },
          });
          await tx.serialUnit.update({
            where: { id: su.id },
            data: { lotQuantity: (su.lotQuantity ?? 1) - partialLotQty },
          });
          await tx.transferLine.create({
            data: { transferId: transfer.id, itemTypeId: su.itemTypeId, quantity: partialLotQty, serialUnitId: sid, statusId: finalStatus },
          });
        } else {
          await tx.serialUnit.update({
            where: { id: sid },
            data: { currentHolderId: destId, statusId: finalStatus, signedSoldierId: null, physicalLocation: null, locationId: null },
          });
          await tx.transferLine.create({
            data: { transferId: transfer.id, itemTypeId: su.itemTypeId, quantity: su.lotQuantity ?? 1, serialUnitId: sid, statusId: finalStatus },
          });
        }
      }

      // כמותיים: גריעה מהפלוגה + תוספת במחסן (סטטוס פר-שורה גובר)
      for (const e of qtyEntries) {
        const destId = await findDestWarehouse(e.itemTypeId);
        if (!destId) continue;
        const lineOverride = String(formData.get(`qtyStatus:${e.itemTypeId}:${e.statusId}`) || "") || null;
        const finalStatusId = lineOverride || newStatusId || e.statusId;
        await adjustQuantity(tx, bId, e.itemTypeId, companyId, e.statusId, -e.qty);
        await adjustQuantity(tx, bId, e.itemTypeId, destId, finalStatusId, e.qty);
        await tx.transferLine.create({
          data: { transferId: transfer.id, itemTypeId: e.itemTypeId, quantity: e.qty, statusId: finalStatusId },
        });
      }
    });

    await audit(user.id, "COMPANY_RETURN", "Transfer", transferId, { companyId, serials: serialIds.length, qtyLines: qtyEntries.length });
    revalidatePath("/signatures");
    revalidatePath("/stock");
    revalidatePath("/my-inventory");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message.replace(/^Error:\s*/, "") : "שגיאה לא ידועה" };
  }
}
