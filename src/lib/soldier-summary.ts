import "server-only";
import { prisma } from "@/lib/prisma";

export type SoldierEquipmentSummary = {
  soldier: { id: string; fullName: string; personalNumber: string | null; companyName: string | null; phone: string | null };
  serials: { itemName: string; sku: string | null; serial: string; lotQuantity: number | null; statusName: string; isWear: boolean; isLoss: boolean }[];
  qty: { itemName: string; sku: string | null; unit: string; statusName: string; quantity: number }[];
  weaponsEligibility?: { enlisted: boolean; weaponsApproved: boolean; armoryTestSubmitted: boolean; weaponsAgreementSigned: boolean; isFullyEligible: boolean };
};

/** מחזיר רשימת כל הציוד שחתום על חייל (סריאלי + כמותי), מאוגרגג. */
export async function getSoldierEquipmentSummary(soldierId: string): Promise<SoldierEquipmentSummary | null> {
  const soldier = await prisma.soldier.findUnique({
    where: { id: soldierId },
    include: { company: { select: { name: true } } },
  });
  if (!soldier) return null;

  const serialUnits = await prisma.serialUnit.findMany({
    where: { signedSoldierId: soldierId },
    include: { itemType: { select: { name: true, sku: true } }, status: true },
    orderBy: { itemType: { name: "asc" } },
  });

  const qtyLines = await prisma.transferLine.findMany({
    where: {
      transfer: { status: "COMPLETED", type: { in: ["SIGNOUT", "CHECKIN"] }, toSoldierId: soldierId },
      serialUnitId: null,
    },
    include: {
      itemType: { select: { name: true, sku: true, unit: true } },
      status: true,
      transfer: { select: { type: true } },
    },
  });
  type QtyAcc = { itemName: string; sku: string | null; unit: string; statusName: string; quantity: number };
  const qtyMap = new Map<string, QtyAcc>();
  for (const l of qtyLines) {
    if (!l.statusId || !l.status) continue;
    const k = `${l.itemTypeId}|${l.statusId}`;
    const sign = l.transfer.type === "SIGNOUT" ? 1 : -1;
    const cur = qtyMap.get(k);
    if (cur) cur.quantity += sign * l.quantity;
    else qtyMap.set(k, {
      itemName: l.itemType.name, sku: l.itemType.sku, unit: l.itemType.unit,
      statusName: l.status.name, quantity: sign * l.quantity,
    });
  }
  const qty = Array.from(qtyMap.values()).filter((q) => q.quantity > 0)
    .sort((a, b) => a.itemName.localeCompare(b.itemName));

  const enlisted = !!soldier.enlisted;
  const weaponsApproved = !!soldier.weaponsApprovedAt;
  const armoryTestSubmitted = !!soldier.armoryTestProofAt;
  const weaponsAgreementSigned = !!soldier.weaponsAgreementSignedAt;

  return {
    soldier: {
      id: soldier.id, fullName: soldier.fullName,
      personalNumber: soldier.personalNumber, phone: soldier.phone,
      companyName: soldier.company?.name ?? null,
    },
    serials: serialUnits.map((u) => ({
      itemName: u.itemType.name, sku: u.itemType.sku,
      serial: u.serialNumber, lotQuantity: u.lotQuantity,
      statusName: u.status.name, isWear: u.status.isWear, isLoss: u.status.isLoss,
    })),
    qty,
    weaponsEligibility: {
      enlisted, weaponsApproved, armoryTestSubmitted, weaponsAgreementSigned,
      isFullyEligible: enlisted && weaponsApproved && armoryTestSubmitted && weaponsAgreementSigned,
    },
  };
}

/** בונה טקסט WhatsApp - "מה חתום עליי" - בפורמט קריא */
export function formatSoldierSummaryForWhatsApp(s: SoldierEquipmentSummary, opts?: { headerTitle?: string }): string {
  const lines: string[] = [];
  lines.push(opts?.headerTitle ?? "📋 סיכום ציוד חתום");
  lines.push(`חייל: ${s.soldier.fullName}${s.soldier.personalNumber ? ` (${s.soldier.personalNumber})` : ""}${s.soldier.companyName ? ` · ${s.soldier.companyName}` : ""}`);
  lines.push("");
  if (s.serials.length === 0 && s.qty.length === 0) {
    lines.push("אין ציוד חתום.");
    return lines.join("\n");
  }
  if (s.serials.length > 0) {
    lines.push(`🔫 סריאלי (${s.serials.length}):`);
    for (const u of s.serials) {
      const lot = u.lotQuantity && u.lotQuantity > 1 ? ` ×${u.lotQuantity}` : "";
      const wear = u.isLoss ? " 🔴" : u.isWear ? " 🟡" : "";
      lines.push(`• ${u.itemName}${lot} · SN: ${u.serial} · ${u.statusName}${wear}`);
    }
    lines.push("");
  }
  if (s.qty.length > 0) {
    lines.push(`📦 כמותי (${s.qty.length}):`);
    for (const q of s.qty) {
      const wear = q.statusName !== "תקין" ? ` (${q.statusName})` : "";
      lines.push(`• ${q.itemName} × ${q.quantity} ${q.unit}${wear}`);
    }
  }
  if (s.weaponsEligibility) {
    lines.push("");
    const e = s.weaponsEligibility;
    lines.push(`🔫 זכאות לנשק: ${e.isFullyEligible ? "✅ זכאי" : "❌ לא זכאי"}`);
    if (!e.isFullyEligible) {
      const missing: string[] = [];
      if (!e.enlisted) missing.push("שלישות");
      if (!e.weaponsApproved) missing.push('אישור מג"ד');
      if (!e.armoryTestSubmitted) missing.push("מבחן ארמון");
      if (!e.weaponsAgreementSigned) missing.push("נוהל שמירה");
      lines.push(`חסר: ${missing.join(", ")}`);
    }
  }
  return lines.join("\n");
}
