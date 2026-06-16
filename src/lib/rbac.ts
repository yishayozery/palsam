import type { Role, WarehouseType } from "@/generated/prisma";

/** יכולות המערכת — בקרת גישה מבוססת-תפקיד (RBAC) */
export type Capability =
  | "battalions.manage" // אדמין-על: הקמת גדודים + מפמ
  | "users.manage" // ניהול משתמשים (מפמ: מנהלי מחסן/צופים; אדמין-על: מפמ)
  | "org.manage" // מפמ: הקמת מחסנים ופלוגות
  | "battalion.profile" // פרופיל הגדוד
  | "warehouse.operate" // ניפוק/קליטה/גריעה/החזרה במחסן
  | "catalog.manage" // אפיון פריטים + מיקום סופי
  | "kits.manage" // הקמת קיטים
  | "dictionaries.manage" // קטגוריות/סטטוסים/תדירויות
  | "locations.manage" // מידוף (מחסן/עמודה/שורה)
  | "reps.manage" // הגדרת נציגי פלוגה מול המחסן
  | "company.manage" // נציג פלוגה: חיילים + מחסן פלוגתי
  | "soldiers.roster" // שליש: ניהול חיילים גדודי + אישור גיוס
  | "donations.manage" // מלאי תרומה / ציוד לא-צבאי
  | "transfer.approve" // אישור קבלה (לחיצת יד)
  | "signatures.manage" // החתמות וזיכוי
  | "counts.manage" // הגדרות ספירה
  | "counts.execute" // ביצוע ספירה
  | "gaps.resolve" // אישור/סגירת פערים
  | "maintenance.manage" // טנא: ניהול ציוד תקול ותיקונים
  | "reports.view" // דשבורד ודוחות
  | "audit.view" // יומן פעולות
  | "dispatch.manage" // שבצ"ק - יצירה/עריכה של שיבוצי רכב
  | "weapons.approve" // 🔫 אישור חייל לחימוש (מג"ד/סמג"ד)
  | "weapons.view"; // צפייה בדוח זכאות נשק

const MATRIX: Record<Role, Capability[]> = {
  SUPER_ADMIN: ["battalions.manage", "users.manage", "reports.view", "audit.view"],
  BATTALION_ADMIN: [
    "users.manage",
    "org.manage",
    "battalion.profile",
    "dictionaries.manage",
    "catalog.manage",
    "kits.manage",
    "locations.manage",
    "warehouse.operate", // הצהרת מלאי גדודי מול החטיבה
    "counts.manage", // תכניות ספירה
    "counts.execute", // ביצוע ספירה (גם למפ"מ)
    "soldiers.roster", // שלישות: ניהול חיילים גדודי
    "signatures.manage", // החתמות (פלוגה / חייל) — צפייה ויצירה
    "transfer.approve", // אישור לחיצת יד גם למפ"מ
    "gaps.resolve",
    "maintenance.manage",
    "reports.view",
    "audit.view",
    "dispatch.manage",
    "weapons.approve",
    "weapons.view",
  ],
  WAREHOUSE_MANAGER: [
    "warehouse.operate",
    "catalog.manage",
    "kits.manage",
    "dictionaries.manage",
    "locations.manage",
    "reps.manage",
    "donations.manage",
    "transfer.approve",
    "signatures.manage",
    "counts.manage",
    "counts.execute",
    "gaps.resolve",
    "reports.view",
    "dispatch.manage",
    "weapons.view", // קצין הארמון רואה את דוח הזכאות (לדעת מי לחתום)
  ],
  COMPANY_REP: [
    "company.manage",
    "locations.manage",
    "donations.manage",
    "transfer.approve",
    "signatures.manage",
    "counts.manage",
    "counts.execute",
    "reports.view",
    "dispatch.manage",
  ],
  VIEWER: ["reports.view", "dispatch.manage"],
  // 🆕 מג"ד: צפייה מלאה (כמו מפ"מ) - ללא יכולת לערוך/להקים, פלוס אישור חימוש
  MAGAD: [
    "reports.view",
    "audit.view",
    "battalion.profile", // צפייה בפרופיל הגדוד (read-only enforcement in UI/actions)
    "soldiers.roster", // צפייה ברוסטר
    "signatures.manage", // צפייה בהחתמות
    "counts.manage",
    "counts.execute",
    "gaps.resolve",
    "maintenance.manage",
    "dispatch.manage",
    "weapons.approve",
    "weapons.view",
  ],
  // 🆕 סמג"ד: אותן הרשאות כמו מג"ד
  SAMAGAD: [
    "reports.view",
    "audit.view",
    "battalion.profile",
    "soldiers.roster",
    "signatures.manage",
    "counts.manage",
    "counts.execute",
    "gaps.resolve",
    "maintenance.manage",
    "dispatch.manage",
    "weapons.approve",
    "weapons.view",
  ],
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
  WAREHOUSE_MANAGER: "קצין מחסן",
  COMPANY_REP: 'רס"פ פלוגתי',
  VIEWER: "צופה",
  MAGAD: 'מג"ד',
  SAMAGAD: 'סמג"ד',
};

export const WAREHOUSE_TYPE_LABELS: Record<WarehouseType, string> = {
  EQUIPMENT: 'ציוד (קל"ג)',
  COMMS: 'תקשוב (קשר"ג)',
  AMMO: "חמידה / תחמושת (בונקר)",
  ARMORY: "ארמון",
  VEHICLES: "רכבים (קצין רכב)",
  MEDICAL: "רפואה",
  GENERAL: "כללי",
};

export const WAREHOUSE_TYPE_SHORT: Record<WarehouseType, string> = {
  EQUIPMENT: "ציוד",
  COMMS: "תקשוב",
  AMMO: "חמידה",
  ARMORY: "ארמון",
  VEHICLES: "רכבים",
  MEDICAL: "רפואה",
  GENERAL: "כללי",
};

export const WAREHOUSE_TYPE_ICON: Record<WarehouseType, string> = {
  EQUIPMENT: "🎒",
  COMMS: "📡",
  AMMO: "💥",
  ARMORY: "🔫",
  VEHICLES: "🚙",
  MEDICAL: "⚕️",
  GENERAL: "📦",
};

/** תפקיד מנהל המחסן לפי טיפוס (לתיוג בלבד) */
export const WAREHOUSE_MANAGER_TITLE: Record<WarehouseType, string> = {
  EQUIPMENT: 'קל"ג',
  COMMS: 'קשר"ג',
  AMMO: "אחראי בונקר",
  ARMORY: "אחראי ארמון",
  VEHICLES: "קצין רכב",
  MEDICAL: 'קרפ"ג',
  GENERAL: "אחראי כללי",
};
