"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireCapability } from "@/lib/guard";
import { audit } from "@/lib/audit";
import { generatePendingTasks } from "@/lib/countScheduler";

function listFrom(fd: FormData, name: string): string[] {
  return fd.getAll(name).map(String).filter(Boolean);
}

export async function createCountPlan(formData: FormData) {
  const user = await requireCapability("counts.manage");
  const bId = user.battalionId!;
  const name = String(formData.get("name") || "").trim();
  const description = String(formData.get("description") || "").trim() || null;
  if (!name) throw new Error("שם תכנית חובה");

  const scopeHolderIds = listFrom(formData, "scopeHolderIds");
  const scopeCategoryIds = listFrom(formData, "scopeCategoryIds");
  const scopeItemTypeIds = listFrom(formData, "scopeItemTypeIds");
  const trackingMethods = listFrom(formData, "trackingMethods");

  const frequencyDays = Math.max(0, parseInt(String(formData.get("frequencyDays") || "0"), 10));
  const scheduledTimes = String(formData.get("scheduledTimes") || "")
    .split(/[,\s]+/).map((s) => s.trim()).filter((s) => /^\d{1,2}:\d{2}$/.test(s));
  const daysOfWeek = listFrom(formData, "daysOfWeek").map(Number).filter((n) => n >= 0 && n <= 6);
  const graceMinutes = Math.max(0, parseInt(String(formData.get("graceMinutes") || "60"), 10) || 60);
  const startDateRaw = String(formData.get("startDate") || "").trim();
  const endDateRaw = String(formData.get("endDate") || "").trim();
  const startDate = startDateRaw ? new Date(startDateRaw) : null;
  const endDate = endDateRaw ? new Date(endDateRaw) : null;
  const responsibleUserId = String(formData.get("responsibleUserId") || "").trim() || null;

  const isOneTime = frequencyDays === 0;
  const startNow = isOneTime && formData.get("startNow") === "on";
  const freeze = formData.get("freezeState") === "on";
  const isBlind = formData.get("isBlind") === "on";
  const countScope = String(formData.get("countScope") || "WAREHOUSE_STOCK") as "WAREHOUSE_STOCK" | "DISTRIBUTED" | "BOTH";

  const plan = await prisma.countPlan.create({
    data: {
      battalionId: bId, name, description,
      scopeHolderIds, scopeCategoryIds, scopeItemTypeIds, trackingMethods,
      frequencyDays, scheduledTimes, daysOfWeek, graceMinutes,
      startDate, endDate,
      active: !isOneTime,
      isBlind,
      countScope,
      createdById: user.id,
      responsibleUserId: responsibleUserId ?? user.id,
    },
  });

  if (startNow) {
    const sessionId = await startCountFromPlan(bId, plan.id, scopeHolderIds, user.id, freeze, isBlind, countScope);
    await audit(user.id, "CREATE_COUNT_PLAN", "CountPlan", plan.id, { name, startNow: true });
    revalidatePath("/counts/plans");
    revalidatePath("/counts");
    redirect(`/counts/${sessionId}`);
  }

  if (!isOneTime) await generatePendingTasks();

  await audit(user.id, "CREATE_COUNT_PLAN", "CountPlan", plan.id, { name });
  revalidatePath("/counts/plans");
  revalidatePath("/counts");
}

async function startCountFromPlan(
  bId: string, planId: string, scopeHolderIds: string[], userId: string,
  freeze: boolean, blind: boolean = false,
  scope: "WAREHOUSE_STOCK" | "DISTRIBUTED" | "BOTH" = "WAREHOUSE_STOCK",
): Promise<string> {
  let holderIds = scopeHolderIds;
  if (holderIds.length === 0) {
    holderIds = (await prisma.holder.findMany({
      where: { battalionId: bId, active: true, kind: { in: ["WAREHOUSE", "COMPANY"] } },
      select: { id: true },
    })).map((h) => h.id);
  }

  const includeWarehouse = scope === "WAREHOUSE_STOCK" || scope === "BOTH";
  const includeDistributed = scope === "DISTRIBUTED" || scope === "BOTH";

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
          dueAt: new Date(now.getTime() + 1440 * 60 * 1000),
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
          startedById: userId,
        },
      });

      await prisma.countTask.update({
        where: { id: task.id },
        data: { sessionId: session.id, status: "IN_PROGRESS", startedAt: now },
      });

      const balances = await prisma.stockBalance.findMany({
        where: { battalionId: bId, holderId: hId, quantity: { gt: 0 } },
      });
      for (const b of balances) {
        await prisma.countLine.create({
          data: { sessionId: session.id, itemTypeId: b.itemTypeId, holderId: b.holderId, expectedQty: b.quantity },
        });
      }

      const units = await prisma.serialUnit.findMany({
        where: { battalionId: bId, currentHolderId: hId, dischargedAt: null },
      });
      for (const u of units) {
        await prisma.countLine.create({
          data: { sessionId: session.id, itemTypeId: u.itemTypeId, holderId: u.currentHolderId, serialUnitId: u.id, expectedQty: u.lotQuantity ?? 1 },
        });
      }

      if (!firstSessionId) firstSessionId = session.id;
    }
  }

  // --- שלב 2: ציוד מפוזר — ציוד חתום על חיילים + ציוד ברמת פלוגה ---
  if (includeDistributed) {
    {
      // ציוד חתום על חיילים
      const signedUnits = await prisma.serialUnit.findMany({
        where: {
          battalionId: bId,
          currentHolderId: { in: holderIds },
          signedSoldierId: { not: null },
          dischargedAt: null,
        },
        include: {
          signedSoldier: { select: { id: true, fullName: true, telegramChatId: true, companyId: true } },
          itemType: { select: { id: true, name: true } },
        },
      });

      // ציוד ברמת פלוגה — רק כשאין שלב מחסן (DISTRIBUTED בלבד), כי BOTH כבר מכסה זאת בשלב 1
      const companyUnits = !includeWarehouse ? await prisma.serialUnit.findMany({
        where: {
          battalionId: bId,
          currentHolderId: { in: holderIds },
          signedSoldierId: null,
          dischargedAt: null,
          currentHolder: { kind: "COMPANY" },
        },
        include: {
          itemType: { select: { id: true, name: true } },
        },
      }) : [];

      const companyHolderList = !includeWarehouse ? await prisma.holder.findMany({
        where: { id: { in: holderIds }, kind: "COMPANY" },
        select: { id: true },
      }) : [];
      const companyHolderIdSet = new Set(companyHolderList.map((h) => h.id));
      const companyBalances = !includeWarehouse ? await prisma.stockBalance.findMany({
        where: {
          battalionId: bId,
          holderId: { in: companyHolderList.map((h) => h.id) },
          quantity: { gt: 0 },
        },
      }) : [];

      // קיבוץ לפי פלוגה (holder)
      const byHolder = new Map<string, typeof signedUnits>();
      for (const u of signedUnits) {
        const hId = u.currentHolderId!;
        (byHolder.get(hId) || (() => { const a: typeof signedUnits = []; byHolder.set(hId, a); return a; })()).push(u);
      }
      // הוספת company holders שיש להם ציוד ברמת פלוגה אבל אין חיילים חתומים
      for (const u of companyUnits) {
        if (!byHolder.has(u.currentHolderId!)) byHolder.set(u.currentHolderId!, []);
      }
      for (const b of companyBalances) {
        if (!byHolder.has(b.holderId)) byHolder.set(b.holderId, []);
      }

      // מציאת חותמי פלוגה: Signature.signerUserId על Transfer מסוג ISSUE
      const companySigners = new Map<string, string>();
      const issueSignatures = await prisma.signature.findMany({
        where: {
          battalionId: bId,
          signerUserId: { not: null },
          transfer: { type: "ISSUE" },
        },
        include: {
          signerUser: { select: { fullName: true } },
          transfer: { select: { toHolderId: true } },
        },
        orderBy: { signedAt: "desc" },
      });
      for (const sig of issueSignatures) {
        const hId = sig.transfer?.toHolderId;
        if (hId && !companySigners.has(hId)) {
          companySigners.set(hId, sig.signerUserId!);
        }
      }

      for (const [hId, units] of byHolder) {
        const signerUserId = companySigners.get(hId) ?? null;

        // יצירת session אחד per company לציוד מפוזר
        const session = await prisma.countSession.create({
          data: {
            battalionId: bId,
            type: "COMPANY",
            status: "IN_PROGRESS",
            frozen: false,
            isBlind: blind,
            startedById: userId,
          },
        });

        // CountTask ברמת holder
        const holderTask = await prisma.countTask.create({
          data: {
            battalionId: bId, planId, holderId: hId,
            assignedUserId: userId,
            scheduledAt: now,
            dueAt: new Date(now.getTime() + 1440 * 60 * 1000),
            status: "IN_PROGRESS",
            sessionId: session.id,
            startedAt: now,
          },
        });
        void holderTask;

        // CountLines ברמת חייל (ציוד חתום)
        for (const u of units) {
          await prisma.countLine.create({
            data: {
              sessionId: session.id,
              itemTypeId: u.itemTypeId,
              holderId: u.currentHolderId!,
              serialUnitId: u.id,
              expectedQty: u.lotQuantity ?? 1,
              soldierId: u.signedSoldierId,
              signerUserId,
            },
          });
        }

        // CountLines — ציוד סריאלי ברמת פלוגה (לא חתום על חייל)
        const holderCompanyUnits = companyUnits.filter((u) => u.currentHolderId === hId);
        for (const u of holderCompanyUnits) {
          await prisma.countLine.create({
            data: {
              sessionId: session.id,
              itemTypeId: u.itemTypeId,
              holderId: hId,
              serialUnitId: u.id,
              expectedQty: u.lotQuantity ?? 1,
              signerUserId,
            },
          });
        }

        // CountLines — מלאי כמותי ברמת פלוגה
        if (companyHolderIdSet.has(hId)) {
          const holderBalances = companyBalances.filter((b) => b.holderId === hId);
          for (const b of holderBalances) {
            await prisma.countLine.create({
              data: {
                sessionId: session.id,
                itemTypeId: b.itemTypeId,
                holderId: hId,
                expectedQty: b.quantity,
                signerUserId,
              },
            });
          }
        }

        // יצירת VerificationRequests + שליחת טלגרם לכל חייל
        const bySoldier = new Map<string, typeof units>();
        for (const u of units) {
          if (!u.signedSoldierId) continue;
          (bySoldier.get(u.signedSoldierId) || (() => { const a: typeof units = []; bySoldier.set(u.signedSoldierId, a); return a; })()).push(u);
        }

        const battalion = await prisma.battalion.findUnique({
          where: { id: bId },
          select: { telegramBotToken: true, name: true },
        });

        for (const [soldierId, soldierUnits] of bySoldier) {
          const soldier = soldierUnits[0].signedSoldier!;
          const vReq = await prisma.verificationRequest.create({
            data: {
              battalionId: bId,
              sessionId: session.id,
              soldierId,
              mode: blind ? "BLIND_COUNT" : "CONFIRM",
              items: {
                create: soldierUnits.map((u) => ({
                  serialUnitId: u.id,
                  itemTypeName: u.itemType.name,
                  serialNumber: u.serialNumber,
                  expectedQuantity: u.lotQuantity ?? 1,
                })),
              },
            },
          });

          // שליחת טלגרם אוטומטית
          if (soldier.telegramChatId && battalion?.telegramBotToken) {
            try {
              const { sendTelegramMessage } = await import("@/lib/telegram");
              const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.palmy.co.il";
              const fmtItem = (u: { itemType: { name: string }; serialNumber: string | null }) =>
                u.serialNumber ? `• <b>${u.itemType.name}</b>\n   🔢 <code>${u.serialNumber}</code>` : `• <b>${u.itemType.name}</b>`;
              const itemsList = soldierUnits.map(fmtItem).join("\n");

              if (blind) {
                const text = `📋 <b>ספירת ציוד — ${battalion.name}</b>\n\nשלום ${soldier.fullName},\nנדרשת ספירת ציוד.\nאנא דווח/י על הפריטים הבאים:\n\n${itemsList}\n\n👉 <a href="${baseUrl}/verify/${vReq.token}">לחץ כאן לדיווח</a>`;
                await sendTelegramMessage(battalion.telegramBotToken, soldier.telegramChatId, text);
              } else {
                const vItems = await prisma.verificationItem.findMany({
                  where: { requestId: vReq.id },
                  select: { id: true, itemTypeName: true, serialNumber: true },
                });
                const buttons = vItems.map((vi) => ([
                  { text: `✅ נמצא — ${vi.itemTypeName}${vi.serialNumber ? ` (${vi.serialNumber})` : ""}`, callback_data: `verify:${vi.id}:found` },
                  { text: `❌ חסר`, callback_data: `verify:${vi.id}:denied` },
                ]));
                const text = [
                  `📋 <b>ספירת ציוד — ${battalion.name}</b>`,
                  ``,
                  `שלום ${soldier.fullName},`,
                  `סמן/י עבור כל פריט האם נמצא ברשותך:`,
                  ``,
                  ...soldierUnits.map(fmtItem),
                ].join("\n");
                await sendTelegramMessage(battalion.telegramBotToken, soldier.telegramChatId, text, { inline_keyboard: buttons });
              }

              await prisma.verificationRequest.update({
                where: { id: vReq.id },
                data: { sentAt: new Date(), sentVia: "TELEGRAM" },
              });
            } catch { /* Telegram send failure — non-fatal */ }
          }
        }

        if (!firstSessionId) firstSessionId = session.id;
      }
    }
  }

  return firstSessionId;
}

export async function toggleCountPlan(formData: FormData) {
  const user = await requireCapability("counts.manage");
  const id = String(formData.get("id") || "");
  const plan = await prisma.countPlan.findUnique({ where: { id } });
  if (!plan || plan.battalionId !== user.battalionId) return;
  await prisma.countPlan.update({ where: { id }, data: { active: !plan.active } });
  if (!plan.active) await generatePendingTasks();
  await audit(user.id, "UPDATE_COUNT_PLAN", "CountPlan", id, { active: !plan.active });
  revalidatePath("/counts/plans");
  revalidatePath("/counts");
}

export async function deleteCountPlan(formData: FormData) {
  const user = await requireCapability("counts.manage");
  const id = String(formData.get("id") || "");
  const plan = await prisma.countPlan.findUnique({ where: { id } });
  if (!plan || plan.battalionId !== user.battalionId) return;
  await prisma.countPlan.delete({ where: { id } });
  await audit(user.id, "DELETE_COUNT_PLAN", "CountPlan", id);
  revalidatePath("/counts/plans");
}
