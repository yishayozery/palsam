import type { Role, WarehouseType } from "@/generated/prisma";

/** יכולות המערכת — בקרת גישה מבוססת-תפקיד (RBAC) */
export type Capability =
  | "battalions.manage" // אדמין-על: הקמת גדודים + מפמ
  | "users.manage" // ניהול משתמשים (מפמ: מנהלי מחסן/צופים; אדמין-על: מפמ)
  | "battalion.profile" // פרופיל הגדוד
  | "warehouse.operate" // ניפוק/קליטה/גריעה/החזרה במחסן
  | "catalog.manage" // אפיון פריטים + מיקום סופי
  | "kits.manage" // הקמת קיטים
  | "dictionaries.manage" // קטגוריות/סטטוסים/תדירויות
  | "locations.manage" // מידוף (מחסן/עמודה/שורה)
  | "reps.manage" // הגדרת נציגי פלוגה מול המחסן
  | "company.manage" // נציג פלוגה: חיילים + מחסן פלוגתי
  | "transfer.approve" // אישור קבלה (לחיצת יד)
  | "signatures.manage" // החתמות וזיכוי
  | "counts.manage" // הגדרות ספירה
  | "counts.execute" // ביצוע ספירה
  | "gaps.resolve" // אישור/סגירת פערים
  | "reports.view" // דשבורד ודוחות
  | "audit.view"; // יומן פעולות

const MATRIX: Record<Role, Capability[]> = {
  SUPER_ADMIN: ["battalions.manage", "users.manage", "reports.view", "audit.view"],
  BATTALION_ADMIN: [
    "users.manage",
    "battalion.profile",
    "gaps.resolve",
    "reports.view",
    "audit.view",
  ],
  WAREHOUSE_MANAGER: [
    "warehouse.operate",
    "catalog.manage",
    "kits.manage",
    "dictionaries.manage",
    "locations.manage",
    "reps.manage",
    "transfer.approve",
    "signatures.manage",
    "counts.manage",
    "counts.execute",
    "gaps.resolve",
    "reports.view",
    "audit.view",
  ],
  COMPANY_REP: [
    "company.manage",
    "locations.manage",
    "transfer.approve",
    "signatures.manage",
    "counts.execute",
    "reports.view",
  ],
  VIEWER: ["reports.view"],
};

export function can(role: Role, cap: Capability): boolean {
  return MATRIX[role]?.includes(cap) ?? false;
}

export function capabilitiesOf(role: Role): Capability[] {
  return MATRIX[role] ?? [];
}

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: "אדמין-על",
  BATTALION_ADMIN: 'מפמ (אחראי מערכת)',
  WAREHOUSE_MANAGER: "מנהל מחסן",
  COMPANY_REP: "נציג פלוגה",
  VIEWER: "צופה",
};

export const WAREHOUSE_TYPE_LABELS: Record<WarehouseType, string> = {
  EQUIPMENT: 'ציוד (קל"ג)',
  COMMS: 'תקשוב (קשר"ג)',
  AMMO: "חמידה / תחמושת (בונקר)",
  ARMORY: "ארמון",
};

export const WAREHOUSE_TYPE_SHORT: Record<WarehouseType, string> = {
  EQUIPMENT: "ציוד",
  COMMS: "תקשוב",
  AMMO: "חמידה",
  ARMORY: "ארמון",
};

export const WAREHOUSE_TYPE_ICON: Record<WarehouseType, string> = {
  EQUIPMENT: "🎒",
  COMMS: "📡",
  AMMO: "💥",
  ARMORY: "🔫",
};

/** תפקיד מנהל המחסן לפי טיפוס (לתיוג בלבד) */
export const WAREHOUSE_MANAGER_TITLE: Record<WarehouseType, string> = {
  EQUIPMENT: 'קל"ג',
  COMMS: 'קשר"ג',
  AMMO: "אחראי בונקר",
  ARMORY: "אחראי ארמון",
};
