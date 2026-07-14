import type { RequestType, RequestPriority, RequestStatus } from "@/generated/prisma";

export const REQUEST_TYPE_LABEL: Record<RequestType, string> = {
  CONSTRUCTION: "🏗️ בינוי",
  TRANSPORT: "🚚 הובלה",
  SUPPLY: "📦 הספקה",
  FUEL: "⛽ דלקים",
  FUEL_CARDS: "💳 כרטיסי דלק",
  MEDICAL: "🩺 רפואה",
  TRAINING: "🎓 הדרכות",
  OTHER: "❓ אחר",
};

export const REQUEST_PRIORITY_LABEL: Record<RequestPriority, string> = {
  ROUTINE: "רגיל",
  URGENT: "🔶 דחוף",
  OPERATIONAL: "🔴 מבצעי",
};

export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  DRAFT: "טיוטה",
  PENDING_APPROVAL: "ממתין לאישור מפקד",
  IN_PROGRESS: "בטיפול החטיבה",
  NEEDS_INFO: "דרוש מידע",
  RESOLVED: "נפתר",
  REJECTED: "נדחה",
  CANCELLED: "בוטל",
};

/** צבע badge לפי סטטוס. */
export const REQUEST_STATUS_STYLE: Record<RequestStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-600",
  PENDING_APPROVAL: "bg-amber-100 text-amber-700",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  NEEDS_INFO: "bg-orange-100 text-orange-700",
  RESOLVED: "bg-emerald-100 text-emerald-700",
  REJECTED: "bg-rose-100 text-rose-700",
  CANCELLED: "bg-slate-100 text-slate-400",
};

export const REQUEST_TYPES: RequestType[] = ["CONSTRUCTION", "TRANSPORT", "SUPPLY", "FUEL", "FUEL_CARDS", "MEDICAL", "TRAINING", "OTHER"];
export const REQUEST_PRIORITIES: RequestPriority[] = ["ROUTINE", "URGENT", "OPERATIONAL"];
