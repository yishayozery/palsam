"use server";

import { requireCapability } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

// ===================== מחסנים =====================

export async function saveWarehouse(_prev: unknown, fd: FormData) {
  const user = await requireCapability("ymach.manage");
  const bId = user.battalionId!;
  // מי שיש לו את המסך יכול להקים — משויך-לפלוגה משתמש בפלוגתו; אדמין/מפקדה בוחר פלוגה (holderId מהטופס)
  const holderId = user.holderId || (fd.get("holderId") as string);
  if (!holderId) return { error: "יש לבחור פלוגה/מחסן" };
  const holder = await prisma.holder.findUnique({ where: { id: holderId }, select: { battalionId: true } });
  if (!holder || holder.battalionId !== bId) return { error: "פלוגה לא תקינה" };

  const id = fd.get("id") as string | null;
  const name = (fd.get("name") as string)?.trim();
  const notes = (fd.get("notes") as string)?.trim() || null;
  if (!name) return { error: "שם חובה" };

  if (id) {
    const existing = await prisma.companyWarehouse.findUnique({ where: { id }, select: { battalionId: true } });
    if (!existing || existing.battalionId !== bId) return { error: "מחסן לא תקין" };
    await prisma.companyWarehouse.update({ where: { id }, data: { name, notes } });
  } else {
    await prisma.companyWarehouse.create({
      data: { battalionId: bId, holderId, name, notes },
    });
  }
  revalidatePath("/ymach");
  return { ok: true };
}

export async function deleteWarehouse(id: string) {
  const user = await requireCapability("ymach.manage");
  const bId = user.battalionId!;
  const wh = await prisma.companyWarehouse.findUnique({
    where: { id },
    select: { battalionId: true, holderId: true, _count: { select: { shelves: true } } },
  });
  if (!wh || wh.battalionId !== bId || (user.holderId && wh.holderId !== user.holderId)) return;
  if (wh._count.shelves > 0) return { error: "יש מדפים במחסן — מחק אותם קודם" };
  await prisma.companyWarehouse.delete({ where: { id } });
  revalidatePath("/ymach");
}

// ===================== מדפים =====================

export async function saveShelf(_prev: unknown, fd: FormData) {
  const user = await requireCapability("ymach.manage");
  const bId = user.battalionId!;

  const id = fd.get("id") as string | null;
  const warehouseId = fd.get("warehouseId") as string;
  const column = (fd.get("column") as string)?.trim();
  const row = (fd.get("row") as string)?.trim();
  const label = (fd.get("label") as string)?.trim() || null;

  if (!column || !row) return { error: "עמודה ושורה חובה" };

  // אימות: המחסן שייך לגדוד של המשתמש (משויך-לפלוגה רואה רק את פלוגתו במסך)
  const wh = await prisma.companyWarehouse.findUnique({ where: { id: warehouseId }, select: { battalionId: true, holderId: true } });
  if (!wh || wh.battalionId !== bId || (user.holderId && wh.holderId !== user.holderId)) return { error: "מחסן לא תקין" };

  if (id) {
    await prisma.companyShelf.update({ where: { id }, data: { column, row, label } });
  } else {
    await prisma.companyShelf.create({
      data: { warehouseId, column, row, label },
    });
  }
  revalidatePath("/ymach");
  return { ok: true };
}

export async function deleteShelf(id: string) {
  const user = await requireCapability("ymach.manage");
  const bId = user.battalionId!;
  const shelf = await prisma.companyShelf.findUnique({
    where: { id },
    include: {
      warehouse: { select: { battalionId: true, holderId: true } },
      _count: { select: { items: true, operationalKits: true } },
    },
  });
  if (!shelf || shelf.warehouse.battalionId !== bId || (user.holderId && shelf.warehouse.holderId !== user.holderId)) return;
  if (shelf._count.items > 0 || shelf._count.operationalKits > 0)
    return { error: "יש פריטים או ארגזים על המדף — פנה אותם קודם" };
  await prisma.companyShelf.delete({ where: { id } });
  revalidatePath("/ymach");
}

// ===================== שיוך פריטים למדפים =====================

export async function assignItemToShelf(shelfId: string, itemTypeId: string, quantity: number) {
  const user = await requireCapability("ymach.manage");
  const bId = user.battalionId!;

  const shelf = await prisma.companyShelf.findUnique({
    where: { id: shelfId },
    include: { warehouse: { select: { battalionId: true, holderId: true } } },
  });
  if (!shelf || shelf.warehouse.battalionId !== bId || (user.holderId && shelf.warehouse.holderId !== user.holderId)) return { error: "מדף לא תקין" };

  await prisma.companyShelfItem.upsert({
    where: { shelfId_itemTypeId: { shelfId, itemTypeId } },
    update: { quantity },
    create: { shelfId, itemTypeId, quantity },
  });
  revalidatePath("/ymach");
  return { ok: true };
}

export async function removeItemFromShelf(shelfId: string, itemTypeId: string) {
  const user = await requireCapability("ymach.manage");
  const bId = user.battalionId!;
  const shelf = await prisma.companyShelf.findUnique({
    where: { id: shelfId },
    include: { warehouse: { select: { battalionId: true, holderId: true } } },
  });
  if (!shelf || shelf.warehouse.battalionId !== bId || (user.holderId && shelf.warehouse.holderId !== user.holderId)) return;
  await prisma.companyShelfItem.deleteMany({
    where: { shelfId, itemTypeId },
  });
  revalidatePath("/ymach");
}

// ===================== ארגזים מבצעיים =====================

export async function saveOperationalKit(_prev: unknown, fd: FormData) {
  const user = await requireCapability("ymach.manage");
  const bId = user.battalionId!;
  const holderId = (fd.get("holderId") as string) || user.holderId;
  if (!holderId) return { error: "לא משויך לפלוגה" };

  const holder = await prisma.holder.findUnique({ where: { id: holderId }, select: { battalionId: true } });
  if (!holder || holder.battalionId !== bId) return { error: "פלוגה לא תקינה" };

  const id = fd.get("id") as string | null;
  const name = (fd.get("name") as string)?.trim();
  let kitNumber = (fd.get("kitNumber") as string)?.trim() || null;
  const shelfId = (fd.get("shelfId") as string)?.trim() || null;
  const equipmentLocationId = (fd.get("equipmentLocationId") as string)?.trim() || null;
  const assignedSoldierId = (fd.get("assignedSoldierId") as string)?.trim() || null;
  const notes = (fd.get("notes") as string)?.trim() || null;

  if (!name) return { error: "שם ארגז חובה" };

  // מספר אוטומטי אם לא הוזן
  if (!kitNumber && !id) {
    const count = await prisma.operationalKit.count({ where: { holderId } });
    kitNumber = String(count + 1);
  }

  try {
    if (id) {
      const existing = await prisma.operationalKit.findUnique({ where: { id } });
      // אם שינו חייל במארז ISSUED — מחזירים למדף
      const shouldResetStatus = existing?.status === "ISSUED" && assignedSoldierId !== existing.assignedSoldierId;
      await prisma.operationalKit.update({
        where: { id },
        data: { name, kitNumber, shelfId, equipmentLocationId, assignedSoldierId, notes, ...(shouldResetStatus ? { status: "STORED" } : {}) },
      });
    } else {
      await prisma.operationalKit.create({
        data: { battalionId: bId, holderId, name, kitNumber, shelfId, equipmentLocationId, assignedSoldierId, notes },
      });
    }
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes("Unique constraint")) return { error: "ארגז בשם זה כבר קיים" };
    throw e;
  }
  revalidatePath("/ymach");
  return { ok: true };
}

export async function deleteOperationalKit(id: string) {
  const user = await requireCapability("ymach.manage");
  if (!user.holderId) return;
  const kit = await prisma.operationalKit.findUnique({ where: { id } });
  if (!kit || kit.holderId !== user.holderId) return;
  if (kit.status === "ISSUED") return { error: "הארגז אצל חייל — לא ניתן למחוק" };
  await prisma.operationalKit.delete({ where: { id } });
  revalidatePath("/ymach");
}

export async function updateKitItems(kitId: string, items: { itemTypeId: string; quantity: number }[]) {
  const user = await requireCapability("ymach.manage");
  const bId = user.battalionId!;

  const kit = await prisma.operationalKit.findUnique({ where: { id: kitId } });
  if (!kit || kit.battalionId !== bId) return { error: "ארגז לא תקין" };
  if (user.holderId && kit.holderId !== user.holderId) return { error: "ארגז לא שייך לפלוגה שלך" };

  // delete all and recreate
  await prisma.operationalKitItem.deleteMany({ where: { kitId } });
  if (items.length > 0) {
    await prisma.operationalKitItem.createMany({
      data: items.map((i) => ({ kitId, itemTypeId: i.itemTypeId, quantity: i.quantity })),
    });
  }
  revalidatePath("/ymach");
  return { ok: true };
}

export async function duplicateKit(kitId: string) {
  const user = await requireCapability("ymach.manage");
  const bId = user.battalionId!;

  const source = await prisma.operationalKit.findUnique({
    where: { id: kitId },
    include: { items: true },
  });
  if (!source || source.battalionId !== bId) return { error: "ארגז לא תקין" };
  if (user.holderId && source.holderId !== user.holderId) return { error: "ארגז לא שייך לפלוגה שלך" };
  const holderId = source.holderId;

  const existing = await prisma.operationalKit.count({ where: { holderId } });
  const newName = `${source.name} (עותק ${existing + 1})`;
  const newNumber = String(existing + 1);

  const clone = await prisma.operationalKit.create({
    data: {
      battalionId: bId,
      holderId,
      name: newName,
      kitNumber: newNumber,
      shelfId: source.shelfId,
      notes: source.notes,
    },
  });

  if (source.items.length > 0) {
    await prisma.operationalKitItem.createMany({
      data: source.items.map((i) => ({
        kitId: clone.id,
        itemTypeId: i.itemTypeId,
        quantity: i.quantity,
      })),
    });
  }

  revalidatePath("/ymach");
  return { ok: true, newId: clone.id };
}

export async function issueKit(kitId: string) {
  const user = await requireCapability("ymach.manage");
  if (!user.holderId) return { error: "לא משויך" };
  const kit = await prisma.operationalKit.findUnique({ where: { id: kitId } });
  if (!kit || kit.holderId !== user.holderId) return { error: "ארגז לא תקין" };
  if (!kit.assignedSoldierId) return { error: "לא צוות חייל" };
  await prisma.operationalKit.update({ where: { id: kitId }, data: { status: "ISSUED" } });
  revalidatePath("/ymach");
  return { ok: true };
}

export async function returnKit(kitId: string) {
  const user = await requireCapability("ymach.manage");
  if (!user.holderId) return { error: "לא משויך" };
  const kit = await prisma.operationalKit.findUnique({ where: { id: kitId } });
  if (!kit || kit.holderId !== user.holderId) return { error: "ארגז לא תקין" };
  await prisma.operationalKit.update({ where: { id: kitId }, data: { status: "STORED" } });
  revalidatePath("/ymach");
  return { ok: true };
}

// ===================== אפסון — החזרת ציוד לימ"ח =====================

export type StorageCheckItem = {
  serialUnitId: string;
  returned: boolean;
  shelfId: string | null;
  gapReason?: "LOST" | "BROKEN" | "IN_USE" | "OTHER";
  gapText?: string;
};

export async function getSoldierSignedItems(soldierId: string) {
  const user = await requireCapability("ymach.manage");
  if (!user.holderId) return { error: "לא משויך" };

  const items = await prisma.serialUnit.findMany({
    where: {
      signedSoldierId: soldierId,
      dischargedAt: null,
      currentHolderId: user.holderId,
    },
    select: {
      id: true,
      serialNumber: true,
      storageStatus: true,
      storedShelfId: true,
      itemType: { select: { id: true, name: true, sku: true } },
      storedShelf: {
        select: {
          id: true, column: true, row: true,
          warehouse: { select: { name: true } },
        },
      },
    },
    orderBy: { itemType: { name: "asc" } },
  });

  return { items };
}

export async function processStorage(
  soldierId: string,
  checks: StorageCheckItem[],
) {
  const user = await requireCapability("ymach.manage");
  const bId = user.battalionId!;
  const holderId = user.holderId;
  if (!holderId) return { error: "לא משויך" };

  const now = new Date();
  let stored = 0;
  let gaps = 0;

  for (const check of checks) {
    if (check.returned) {
      // פריט חזר → STORED + מדף
      await prisma.serialUnit.update({
        where: { id: check.serialUnitId },
        data: {
          storageStatus: "STORED",
          storedShelfId: check.shelfId,
          storedAt: now,
          storedByUserId: user.id,
        },
      });
      stored++;
    } else {
      // פריט חסר → יוצר פער ימ"ח
      const unit = await prisma.serialUnit.findUnique({
        where: { id: check.serialUnitId },
        select: { itemTypeId: true },
      });
      if (unit) {
        await prisma.ymachGap.create({
          data: {
            battalionId: bId,
            holderId,
            soldierId,
            serialUnitId: check.serialUnitId,
            itemTypeId: unit.itemTypeId,
            reason: check.gapReason ?? "OTHER",
            reasonText: check.gapText ?? null,
            createdById: user.id,
          },
        });
        gaps++;
      }
    }
  }

  revalidatePath("/ymach");
  return { ok: true, stored, gaps };
}

// הוצאה מאפסון — מחזיר פריטים ל-ACTIVE
export async function releaseFromStorage(serialUnitIds: string[]) {
  const user = await requireCapability("ymach.manage");
  if (!user.holderId) return { error: "לא משויך" };

  await prisma.serialUnit.updateMany({
    where: {
      id: { in: serialUnitIds },
      currentHolderId: user.holderId,
      storageStatus: "STORED",
    },
    data: {
      storageStatus: "ACTIVE",
      storedShelfId: null,
      storedAt: null,
      storedByUserId: null,
    },
  });

  revalidatePath("/ymach");
  return { ok: true };
}

// סגירת פער ימ"ח
export async function resolveYmachGap(gapId: string) {
  const user = await requireCapability("ymach.manage");
  if (!user.holderId) return { error: "לא משויך" };

  const gap = await prisma.ymachGap.findUnique({ where: { id: gapId } });
  if (!gap || gap.holderId !== user.holderId) return { error: "פער לא תקין" };

  await prisma.ymachGap.update({
    where: { id: gapId },
    data: { status: "RESOLVED", resolvedAt: new Date(), resolvedById: user.id },
  });
  revalidatePath("/ymach");
  return { ok: true };
}

// החתמת מארז — שינוי סטטוס + הסרת פריטים אופציונלית
export async function signKit(
  kitId: string,
  removedItems?: { itemTypeId: string; quantity: number }[],
) {
  const user = await requireCapability("ymach.manage");

  const kit = await prisma.operationalKit.findUnique({
    where: { id: kitId },
    include: { items: true },
  });
  if (!kit || kit.battalionId !== user.battalionId) return { error: "מארז לא תקין" };
  if (!user.isAdmin && kit.holderId !== user.holderId) return { error: "מארז לא שייך למחסן שלך" };
  if (!kit.assignedSoldierId) return { error: "מארז לא צוות לחייל" };
  if (kit.status === "ISSUED") return { error: "מארז כבר אצל חייל" };

  // הסרת פריטים אם צוין
  if (removedItems && removedItems.length > 0) {
    for (const rm of removedItems) {
      const existing = kit.items.find((i) => i.itemTypeId === rm.itemTypeId);
      if (!existing) continue;
      const newQty = existing.quantity - rm.quantity;
      if (newQty <= 0) {
        await prisma.operationalKitItem.delete({ where: { id: existing.id } });
      } else {
        await prisma.operationalKitItem.update({ where: { id: existing.id }, data: { quantity: newQty } });
      }
    }
  }

  await prisma.operationalKit.update({
    where: { id: kitId },
    data: { status: "ISSUED" },
  });

  revalidatePath("/ymach");
  revalidatePath("/signatures");
  return { ok: true };
}

// זיכוי מארז — צ'קליסט עם אפשרות פער חלקי
export type KitReturnItem = {
  itemTypeId: string;
  returnedQty: number;
  missingQty: number;
  reason?: "LOST" | "BROKEN" | "IN_USE" | "OTHER";
  reasonText?: string;
};

export async function returnKitWithCheck(
  kitId: string,
  items: KitReturnItem[],
) {
  const user = await requireCapability("ymach.manage");
  const bId = user.battalionId!;
  const holderId = user.holderId;
  if (!holderId) return { error: "לא משויך" };

  const kit = await prisma.operationalKit.findUnique({
    where: { id: kitId },
    include: { items: true },
  });
  if (!kit || kit.holderId !== holderId) return { error: "מארז לא תקין" };
  if (kit.status !== "ISSUED") return { error: "מארז לא אצל חייל" };

  let gapsCreated = 0;

  for (const check of items) {
    if (check.missingQty > 0 && kit.assignedSoldierId) {
      await prisma.ymachGap.create({
        data: {
          battalionId: bId,
          holderId,
          soldierId: kit.assignedSoldierId,
          itemTypeId: check.itemTypeId,
          quantity: check.missingQty,
          reason: check.reason ?? "OTHER",
          reasonText: check.reasonText ?? null,
          operationalKitId: kitId,
          createdById: user.id,
        },
      });
      gapsCreated++;

      // עדכון תכולת המארז — הורדת כמות חסרה
      const existing = kit.items.find((i) => i.itemTypeId === check.itemTypeId);
      if (existing) {
        const newQty = existing.quantity - check.missingQty;
        if (newQty <= 0) {
          await prisma.operationalKitItem.delete({ where: { id: existing.id } });
        } else {
          await prisma.operationalKitItem.update({ where: { id: existing.id }, data: { quantity: newQty } });
        }
      }
    }
  }

  await prisma.operationalKit.update({
    where: { id: kitId },
    data: { status: "STORED" },
  });

  revalidatePath("/ymach");
  revalidatePath("/signatures");
  return { ok: true, gapsCreated };
}

// שליפת פערים פתוחים
export async function getOpenGaps() {
  const user = await requireCapability("ymach.manage");
  if (!user.holderId) return { gaps: [] };

  const gaps = await prisma.ymachGap.findMany({
    where: { holderId: user.holderId, status: "OPEN" },
    include: {
      soldier: { select: { fullName: true, personalNumber: true } },
      itemType: { select: { name: true, sku: true } },
      serialUnit: { select: { serialNumber: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return { gaps };
}
