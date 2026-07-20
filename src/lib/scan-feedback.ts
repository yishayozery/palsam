import type { ScanHit } from "@/app/(app)/scan-actions";

export type ScanMsg = { ok: boolean; text: string };

/**
 * למה הפריט הסריאלי שנסרק אינו זמין במסך הנוכחי.
 * מרוכז כאן כדי שכל המסכים יסבירו אותו דבר באותה שפה.
 */
export function whyUnavailable(hit: Extract<ScanHit, { kind: "SERIAL" }>): string {
  if (hit.signedSoldierName) return `חתום על ${hit.signedSoldierName}`;
  if (hit.externalHolderName) return `אצל גורם חוץ (${hit.externalHolderName})`;
  if (hit.holderName) return `נמצא ב${hit.holderName}`;
  return "לא זמין כאן";
}

/** תווית קצרה לפריט שנסרק — לשורת המשוב. */
export function scanLabel(hit: ScanHit): string {
  if (hit.kind === "SERIAL") return `${hit.itemName} · ${hit.serialNumber}`;
  if (hit.kind === "ITEM_TYPE") return hit.itemName;
  return hit.code;
}

export const scanOk = (text: string): ScanMsg => ({ ok: true, text });
export const scanFail = (text: string): ScanMsg => ({ ok: false, text });
