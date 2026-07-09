import "server-only";
import { prisma } from "./prisma";

export async function runCountFromPlan(
  bId: string, planId: string, scopeHolderIds: string[], userId: string,
  freeze: boolean, blind: boolean = false,
  scope: "WAREHOUSE_STOCK" | "DISTRIBUTED" | "BOTH" = "WAREHOUSE_STOCK",
  filters?: { scopeCategoryIds?: string[]; scopeItemTypeIds?: string[]; trackingMethods?: string[] },
  graceMinutes: number = 1440,
  flags?: { signOnComplete?: boolean; correctByReporter?: boolean },
): Promise<string> {
  const signOnComplete = flags?.signOnComplete ?? false;
  const correctByReporter = flags?.correctByReporter ?? false;
  let holderIds = scopeHolderIds;
  if (holderIds.length === 0) {
    holderIds = (await prisma.holder.findMany({
      where: { battalionId: bId, active: true, kind: { in: ["WAREHOUSE", "COMPANY"] } },
      select: { id: true },
    })).map((h) => h.id);
  }

  const includeWarehouse = scope === "WAREHOUSE_STOCK" || scope === "BOTH";
  const includeDistributed = scope === "DISTRIBUTED" || scope === "BOTH";

  // 🎯 סינון פריטים לפי בחירת מקים הספירה: קטגוריה / פריט ספציפי / שיטת מעקב.
  //    ריק בכל השלוש = הכל. allowedItemTypeIds=null אומר "ללא הגבלה".
  const scopeCategoryIds = filters?.scopeCategoryIds ?? [];
  const scopeItemTypeIds = filters?.scopeItemTypeIds ?? [];
  const trackingMethods = filters?.trackingMethods ?? [];
  const itemTypeFilter: Record<string, unknown> = {};
  if (scopeItemTypeIds.length > 0) itemTypeFilter.id = { in: scopeItemTypeIds };
  if (scopeCategoryIds.length > 0) itemTypeFilter.categoryId = { in: scopeCategoryIds };
  if (trackingMethods.length > 0) itemTypeFilter.trackingMethod = { in: trackingMethods };
  let allowedItemTypeIds: string[] | null = null;
  if (Object.keys(itemTypeFilter).length > 0) {
    allowedItemTypeIds = (await prisma.itemType.findMany({
      where: { battalionId: bId, ...itemTypeFilter }, select: { id: true },
    })).map((m) => m.id);
  }
  // האם לכלול ציוד כמותי? רק אם המסנן ריק או כולל QUANTITY במפורש.
  const includeQuantity = trackingMethods.length === 0 || trackingMethods.includes("QUANTITY");

  const now = new Date();
  let firstSessionId = "";

  // --- שלב 1: ספירות מלאי מחסן (per-holder) ---
  if (includeWarehouse) {
    for (const hId of holderIds) {
      const task = await prisma.countTask.create({
        data: {
          battalionId: bId, planId, holderId: hId,
          assignedUserId: userId,
          scheduledAt: now,
          dueAt: new Date(now.getTime() + graceMinutes * 60 * 1000),
          status: "PENDING",
        },
        include: { holder: true },
      });

      const sessionType = task.holder.kind === "WAREHOUSE" ? "WAREHOUSE" : "COMPANY";
      const session = await prisma.countSession.create({
        data: {
          battalionId: bId,
          type: sessionType as "WAREHOUSE" | "COMPANY" | "GLOBAL",
          status: freeze ? "FROZEN" : "IN_PROGRESS",
          frozen: freeze,
          isBlind: blind,
          signOnComplete,
          correctByReporter,
          startedById: userId,
        },
      });

      await prisma.countTask.update({
        where: { id: task.id },
        data: { sessionId: session.id, status: "IN_PROGRESS", startedAt: now },
      });

      // ציוד כמותי במחסן — רק אם המסנן כולל QUANTITY
      const balances = includeQuantity ? await prisma.stockBalance.findMany({
        where: {
          battalionId: bId, holderId: hId, quantity: { gt: 0 },
          ...(allowedItemTypeIds ? { itemTypeId: { in: allowedItemTypeIds } } : {}),
        },
      }) : [];
      for (const b of balances) {
        await prisma.countLine.create({
          data: { sessionId: session.id, itemTypeId: b.itemTypeId, holderId: b.holderId, expectedQty: b.quantity },
        });
      }

      const units = await prisma.serialUnit.findMany({
        where: {
          // ספירת מחסן = רק מה שפיזית במחסן (לא חתום על חייל)
          battalionId: bId, currentHolderId: hId, dischargedAt: null, signedSoldierId: null,
          ...(allowedItemTypeIds ? { itemTypeId: { in: allowedItemTypeIds } } : {}),
        },
      });
      for (const u of units) {
        await prisma.countLine.create({
          data: { sessionId: session.id, itemTypeId: u.itemTypeId, holderId: u.currentHolderId, serialUnitId: u.id, expectedQty: u.lotQuantity ?? 1 },
        });
      }

      if (!firstSessionId) firstSessionId = session.id;
    }
  }

  // --- שלב 2: ציוד מפוזר — כל חייל שחתום על ציוד בהיקף (סריאלי או כמותי) מדווח ---
  if (includeDistributed) {
    // ההיקף נקבע לפי המחסנים/פלוגות שנבחרו:
    //  • מחסן → כל הציוד מסוג המחסן (category.warehouseType) החתום על חיילים
    //  • פלוגה → כל הציוד של חיילי אותה פלוגה
    // בשילוב מסנני התכנית (קטגוריה/פריט/שיטת-מעקב). חייל-מרכזי: מי שחתום על
    // ציוד רלוונטי — סריאלי או כמותי — משתתף ומדווח (ללא "רכיבה על סריאלי").
    const scopedHolders = holderIds.length > 0
      ? await prisma.holder.findMany({ where: { id: { in: holderIds } }, select: { id: true, kind: true, warehouseType: true } })
      : [];
    const scopedWhTypes = [...new Set(scopedHolders.filter((h) => h.kind === "WAREHOUSE" && h.warehouseType).map((h) => h.warehouseType as string))];
    const scopedCompanyIds = scopedHolders.filter((h) => h.kind === "COMPANY").map((h) => h.id);

    // סינון פריטים למפוזר: לפי סוג-מחסן של ההיקף + מסנני התכנית (קטגוריה/פריט/מעקב)
    const distItemWhere: Record<string, unknown> = { battalionId: bId };
    if (scopedWhTypes.length > 0 && scopedCompanyIds.length === 0) distItemWhere.category = { warehouseType: { in: scopedWhTypes } };
    if (scopeItemTypeIds.length > 0) distItemWhere.id = { in: scopeItemTypeIds };
    if (scopeCategoryIds.length > 0) distItemWhere.categoryId = { in: scopeCategoryIds };
    if (trackingMethods.length > 0) distItemWhere.trackingMethod = { in: trackingMethods };
    const distAllowedIds = Object.keys(distItemWhere).length > 1
      ? (await prisma.itemType.findMany({ where: distItemWhere, select: { id: true } })).map((m) => m.id)
      : null;
    const soldierCompanyFilter = scopedCompanyIds.length > 0 ? { companyId: { in: scopedCompanyIds } } : {};

    // 1. ציוד סריאלי חתום על חיילים (לפי בעלות-מחסן/פלוגה, לא מיקום פיזי)
    const signedUnits = await prisma.serialUnit.findMany({
      where: {
        battalionId: bId, signedSoldierId: { not: null }, dischargedAt: null,
        ...(distAllowedIds ? { itemTypeId: { in: distAllowedIds } } : {}),
        ...(scopedCompanyIds.length > 0 ? { signedSoldier: { is: { companyId: { in: scopedCompanyIds } } } } : {}),
      },
      include: {
        signedSoldier: { select: { id: true, fullName: true, telegramChatId: true, companyId: true } },
        itemType: { select: { id: true, name: true } },
      },
    });

    // 2. ציוד כמותי חתום על חיילים (TransferLine — SIGNOUT מוסיף, CHECKIN מוריד)
    type QtyLine = { itemTypeId: string; itemName: string; quantity: number };
    const qtyBySoldier = new Map<string, QtyLine[]>();
    if (includeQuantity) {
      const qtyRows = await prisma.transferLine.findMany({
        where: {
          transfer: {
            status: "COMPLETED", type: { in: ["SIGNOUT", "CHECKIN"] }, battalionId: bId,
            ...(scopedCompanyIds.length > 0 ? { toSoldier: { is: { companyId: { in: scopedCompanyIds } } } } : { toSoldierId: { not: null } }),
          },
          serialUnitId: null,
          ...(distAllowedIds ? { itemTypeId: { in: distAllowedIds } } : {}),
        },
        select: { itemTypeId: true, quantity: true, transfer: { select: { type: true, toSoldierId: true } }, itemType: { select: { name: true } } },
      });
      const acc = new Map<string, QtyLine & { soldierId: string }>();
      for (const l of qtyRows) {
        const sId = l.transfer.toSoldierId;
        if (!sId) continue;
        const key = `${sId}|${l.itemTypeId}`;
        const sign = l.transfer.type === "SIGNOUT" ? 1 : -1;
        const cur = acc.get(key);
        if (cur) cur.quantity += sign * l.quantity;
        else acc.set(key, { soldierId: sId, itemTypeId: l.itemTypeId, itemName: l.itemType.name, quantity: sign * l.quantity });
      }
      for (const v of acc.values()) {
        if (v.quantity <= 0) continue;
        (qtyBySoldier.get(v.soldierId) || (() => { const a: QtyLine[] = []; qtyBySoldier.set(v.soldierId, a); return a; })())
          .push({ itemTypeId: v.itemTypeId, itemName: v.itemName, quantity: v.quantity });
      }
    }

    // 3. איחוד חיילים משני המקורות — כל מי שחתום על ציוד בהיקף
    type SUnit = typeof signedUnits[number];
    const serialBySoldier = new Map<string, SUnit[]>();
    for (const u of signedUnits) {
      (serialBySoldier.get(u.signedSoldierId!) || (() => { const a: SUnit[] = []; serialBySoldier.set(u.signedSoldierId!, a); return a; })()).push(u);
    }
    const allSoldierIds = new Set<string>([...serialBySoldier.keys(), ...qtyBySoldier.keys()]);

    if (allSoldierIds.size > 0) {
      // פרטי חיילים (כולל חיילים עם ציוד כמותי בלבד)
      const soldierInfo = new Map<string, { id: string; fullName: string; telegramChatId: string | null; companyId: string | null }>();
      for (const u of signedUnits) if (u.signedSoldier) soldierInfo.set(u.signedSoldier.id, u.signedSoldier);
      const missing = [...allSoldierIds].filter((id) => !soldierInfo.has(id));
      if (missing.length > 0) {
        const more = await prisma.soldier.findMany({ where: { id: { in: missing } }, select: { id: true, fullName: true, telegramChatId: true, companyId: true } });
        for (const s of more) soldierInfo.set(s.id, s);
      }

      // חותמי פלוגה (Signature על Transfer מסוג ISSUE) — לתצוגה בדוח
      const companySigners = new Map<string, string>();
      const issueSignatures = await prisma.signature.findMany({
        where: { battalionId: bId, signerUserId: { not: null }, transfer: { type: "ISSUE" } },
        include: { transfer: { select: { toHolderId: true } } },
        orderBy: { signedAt: "desc" },
      });
      for (const sig of issueSignatures) {
        const hId = sig.transfer?.toHolderId;
        if (hId && !companySigners.has(hId)) companySigners.set(hId, sig.signerUserId!);
      }

      // session אחד לכל הספירה המפוזרת
      const session = await prisma.countSession.create({
        data: { battalionId: bId, type: "COMPANY", status: freeze ? "FROZEN" : "IN_PROGRESS", frozen: freeze, isBlind: blind, signOnComplete, correctByReporter, startedById: userId },
      });
      const dueAt = new Date(now.getTime() + graceMinutes * 60 * 1000);
      const dueStr = dueAt.toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jerusalem" });
      await prisma.countTask.create({
        data: {
          battalionId: bId, planId, holderId: holderIds[0] ?? scopedHolders[0]?.id ?? "",
          assignedUserId: userId, scheduledAt: now, dueAt,
          status: "IN_PROGRESS", sessionId: session.id, startedAt: now,
        },
      });

      const battalion = await prisma.battalion.findUnique({ where: { id: bId }, select: { telegramBotToken: true, name: true } });

      // 📤 אוספים את כל ההודעות ושולחים במנות מקבילות אחרי הלולאה —
      //    מונע timeout של הקרון כששולחים לעשרות/מאות חיילים (טורי = ~150ms×N).
      const pendingSends: { vReqId: string; chatId: string; text: string }[] = [];

      for (const soldierId of allSoldierIds) {
        const soldier = soldierInfo.get(soldierId)!;
        const signerUserId = soldier.companyId ? (companySigners.get(soldier.companyId) ?? null) : null;
        const lineHolderId = soldier.companyId ?? holderIds[0] ?? scopedHolders[0]?.id ?? null;
        const serialUnits = serialBySoldier.get(soldierId) ?? [];
        const qtyItems = qtyBySoldier.get(soldierId) ?? [];

        for (const u of serialUnits) {
          await prisma.countLine.create({
            data: { sessionId: session.id, itemTypeId: u.itemTypeId, holderId: lineHolderId, serialUnitId: u.id, expectedQty: u.lotQuantity ?? 1, soldierId, signerUserId },
          });
        }
        for (const q of qtyItems) {
          await prisma.countLine.create({
            data: { sessionId: session.id, itemTypeId: q.itemTypeId, holderId: lineHolderId, expectedQty: q.quantity, soldierId, signerUserId },
          });
        }

        const vReq = await prisma.verificationRequest.create({
          data: {
            battalionId: bId, sessionId: session.id, soldierId, mode: blind ? "BLIND_COUNT" : "CONFIRM",
            items: {
              create: [
                ...serialUnits.map((u) => ({ serialUnitId: u.id, itemTypeId: u.itemTypeId, itemTypeName: u.itemType.name, serialNumber: u.serialNumber, expectedQuantity: u.lotQuantity ?? 1, expectedExpiry: u.expiryDate })),
                ...qtyItems.map((q) => ({ itemTypeId: q.itemTypeId, itemTypeName: q.itemName, expectedQuantity: q.quantity })),
              ],
            },
          },
        });

        if (soldier.telegramChatId && battalion?.telegramBotToken) {
            const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.palmy.co.il";
            const link = `${baseUrl}/verify/${vReq.token}`;
            const serialCount = serialUnits.length;
            const qtyCount = qtyItems.length;

            let text: string;
            if (blind) {
              // 🔒 עיוור — לא חושפים סריאלי/כמות. רק מה צריך לדווח.
              const parts: string[] = [];
              if (serialCount > 0) parts.push(`🔢 ${serialCount} פריטים סריאליים — הקש/י את המספר הסריאלי של כל אחד`);
              if (qtyCount > 0) parts.push(`🔢 ${qtyCount} פריטים כמותיים — ספור/י ודווח/י כמות`);
              text = [
                `📋 <b>ספירת ציוד עיוורת — ${battalion.name}</b>`, ``,
                `שלום ${soldier.fullName},`,
                `נדרשת ספירת ציוד. אין לך את הנתונים מראש — דווח/י מה שמצאת בפועל:`, ``,
                ...parts, ``,
                `⏰ <b>יש לסיים עד: ${dueStr}</b>`, ``,
                `👉 <a href="${link}">לחץ כאן לדיווח</a>`,
              ].join("\n");
            } else {
              // אישור — מציגים את הציוד; הדיווח (כולל מיקום/תוקף) בדף הייעודי.
              const serialLines = serialUnits.map((u) =>
                u.serialNumber ? `• <b>${u.itemType.name}</b> — <code>${u.serialNumber}</code>` : `• <b>${u.itemType.name}</b>`);
              const qtyLinesTxt = qtyItems.map((q) => `• <b>${q.itemName}</b> ×${q.quantity}`);
              text = [
                `📋 <b>ספירת ציוד — ${battalion.name}</b>`, ``,
                `שלום ${soldier.fullName},`, `אשר/י את הציוד הבא ודווח/י מה שחסר/שונה:`, ``,
                ...serialLines, ...qtyLinesTxt, ``,
                `⏰ <b>יש לסיים עד: ${dueStr}</b>`, ``,
                `👉 <a href="${link}">לחץ כאן לדיווח</a>`,
              ].join("\n");
            }
            pendingSends.push({ vReqId: vReq.id, chatId: soldier.telegramChatId, text });
        }
      }

      // שליחה מקבילה במנות של 20 — 120 הודעות ב-~1ש' במקום ~18ש' טורי
      if (pendingSends.length > 0 && battalion?.telegramBotToken) {
        const { sendTelegramMessage } = await import("@/lib/telegram");
        const token = battalion.telegramBotToken;
        const sentIds: string[] = [];
        for (let i = 0; i < pendingSends.length; i += 20) {
          const batch = pendingSends.slice(i, i + 20);
          const results = await Promise.allSettled(batch.map((s) => sendTelegramMessage(token, s.chatId, s.text)));
          results.forEach((r, j) => { if (r.status === "fulfilled") sentIds.push(batch[j].vReqId); });
        }
        if (sentIds.length > 0) {
          await prisma.verificationRequest.updateMany({ where: { id: { in: sentIds } }, data: { sentAt: new Date(), sentVia: "TELEGRAM" } });
        }
      }

      if (!firstSessionId) firstSessionId = session.id;
    }
  }

  return firstSessionId;
}
