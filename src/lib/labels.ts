// תוויות עברית ל-enums מבניים (לא דיקשנרי)
import type {
  TrackingMethod,
  TransferType,
  TransferStatus,
  SignatureMethod,
  SignatureStatus,
  CountType,
  CountSessionStatus,
  DiscrepancyKind,
  DiscrepancyStatus,
} from "@/generated/prisma";

export const TRACKING_METHOD: Record<TrackingMethod, string> = {
  QUANTITY: "כמותי",
  SERIAL: 'פרטני (מס"ד)',
  LOT: "אצווה (Lot)",
  KIT: "ערכה",
};

export const TRANSFER_TYPE: Record<TransferType, string> = {
  INTAKE: "קליטת מלאי (מחטיבה)",
  WRITE_OFF: "גריעת מלאי (לחטיבה)",
  ISSUE: "הקצאה לפלוגה/נשקייה",
  RETURN: "החזרה למחסן",
  SIGNOUT: "החתמת חייל",
  CHECKIN: "זיכוי חייל",
};

export const TRANSFER_STATUS: Record<TransferStatus, string> = {
  PENDING: "ממתין לאישור",
  APPROVED: "אושר",
  REJECTED: "נדחה",
  COMPLETED: "הושלם",
};

export const TRANSFER_STATUS_COLOR: Record<TransferStatus, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  APPROVED: "bg-emerald-100 text-emerald-800",
  REJECTED: "bg-rose-100 text-rose-800",
  COMPLETED: "bg-slate-200 text-slate-700",
};

export const SIGNATURE_METHOD: Record<SignatureMethod, string> = {
  LINK: "קישור (וואטסאפ)",
  QR: "קוד QR",
  ONSITE: "שרבוט במקום",
};

export const SIGNATURE_STATUS: Record<SignatureStatus, string> = {
  PENDING: "ממתין לחתימה",
  SIGNED: "נחתם",
  EXPIRED: "פג תוקף",
  CANCELED: "בוטל",
};

export const COUNT_TYPE: Record<CountType, string> = {
  WAREHOUSE: "מחסן בלבד",
  COMPANY: "פלוגתית",
  GLOBAL: "רוחבית (הקפאת מצב)",
};

export const COUNT_STATUS: Record<CountSessionStatus, string> = {
  DRAFT: "טיוטה",
  FROZEN: "מצב מוקפא",
  IN_PROGRESS: "בתהליך",
  COMPLETED: "הושלמה",
  CANCELED: "בוטלה",
};

export const DISCREPANCY_KIND: Record<DiscrepancyKind, string> = {
  LOSS: "חוסר / אובדן",
  SURPLUS: "עודף",
  STATUS_MISMATCH: "אי-התאמת סטטוס",
};

export const DISCREPANCY_STATUS: Record<DiscrepancyStatus, string> = {
  OPEN: "פתוח",
  RESOLVED: "נסגר",
};
