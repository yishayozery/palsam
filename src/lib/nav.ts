import type { Capability, Screen } from "./rbac";
import type { Role } from "@/generated/prisma";

export type NavItem = {
  href: string;
  label: string;
  icon: string;
  group: string;
  cap?: Capability;
  screen?: Screen;
  roles?: Role[];
  superAdminOnly?: boolean;
  adminOnly?: boolean;
};

export const NAV: NavItem[] = [
  // ===== ראשי =====
  { href: "/admin/battalions", label: "ניהול גדודים", icon: "🏛️", group: "ראשי", superAdminOnly: true },
  { href: "/profile", label: "הגדרות גדוד", icon: "🏛️", group: "ראשי", screen: "settings" },
  { href: "/dashboard", label: "דשבורד", icon: "📊", group: "ראשי", screen: "dashboard" },
  { href: "/attendance", label: "נוכחות חיילים", icon: "📋", group: "ראשי", screen: "attendance" },
  { href: "/roster", label: "שלישות (חיילים)", icon: "🪖", group: "ראשי", screen: "soldiers" },
  { href: "/soldiers", label: "חיילים (עריכה + ציוד)", icon: "🪖", group: "ראשי", screen: "soldiers" },
  { href: "/permanent-items", label: "ציוד קבוע לפלוגה", icon: "📌", group: "ראשי", screen: "allocations" },
  { href: "/armory-allocations", label: "הקצאות לפלוגה", icon: "📦", group: "ראשי", screen: "armory" },
  { href: "/dispatch", label: 'שבצ"ק', icon: "🚗", group: "ראשי", screen: "dispatch" },
  { href: "/driving-licenses", label: "הרשאות נהיגה", icon: "🪪", group: "ראשי", screen: "driving_licenses" },
  { href: "/maintenance", label: "סטטוס רכבים", icon: "🔧", group: "ראשי", screen: "maintenance" },

  // ===== ארמון =====
  { href: "/armory-approvals", label: "אישור חיילים לנשק", icon: "🔫", group: "ארמון", screen: "armory" },
  { href: "/armory-ineligibility", label: "דוח תהליך זכאות", icon: "📊", group: "ארמון", screen: "armory" },

  // ===== מחסנים (מפמ + מגד + סמגד) =====
  { href: "/warehouses", label: "מחסני הגדוד", icon: "🏪", group: "מחסנים", screen: "warehouses" },
  { href: "/items", label: "הגדרות פריטים", icon: "🏷️", group: "מחסנים", screen: "catalog" },
  { href: "/stock/brigade", label: "החתמות/זיכויי חטיבה", icon: "🤝", group: "מחסנים", screen: "stock" },
  { href: "/stock", label: "מלאי", icon: "📋", group: "מחסנים", screen: "stock" },
  { href: "/signatures", label: "החתמת פלוגה", icon: "✍️", group: "מחסנים", screen: "signatures" },
  { href: "/counts", label: "ספירת מלאי", icon: "🔢", group: "מחסנים", screen: "counts" },
  { href: "/gaps", label: "פערים מספירות מלאי", icon: "⚠️", group: "מחסנים", screen: "gaps" },

  // ===== שלישות =====
  { href: "/roster", label: "שלישות (חיילים)", icon: "🪖", group: "שלישות", screen: "soldiers" },
  { href: "/armory-ineligibility", label: "דוח תהליך זכאות לנשק", icon: "📊", group: "שלישות", screen: "armory" },
  { href: "/dispatch", label: 'שבצ"ק', icon: "🚗", group: "שלישות", screen: "dispatch" },

  // ===== הפלוגה שלי (רס"פ פלוגה — תפעול ברמת פלוגה) =====
  { href: "/dispatch", label: 'שבצ"ק', icon: "🚗", group: "הפלוגה שלי", screen: "dispatch" },
  { href: "/soldiers", label: "חיילי הפלוגה", icon: "🪖", group: "הפלוגה שלי", screen: "soldiers" },
  { href: "/attendance", label: "נוכחות חיילים", icon: "📋", group: "הפלוגה שלי", screen: "attendance" },
  { href: "/donations", label: "תרומות פלוגתיות", icon: "🎁", group: "הפלוגה שלי", screen: "donations" },
  { href: "/my-inventory", label: "מלאי הפלוגה", icon: "📦", group: "הפלוגה שלי", screen: "soldiers" },
  { href: "/my-inventory/locations", label: "מיקומי ציוד", icon: "📍", group: "הפלוגה שלי", screen: "soldiers" },
  { href: "/transfers", label: "קבלות ממתינות", icon: "📥", group: "הפלוגה שלי", screen: "transfers" },
  { href: "/signatures", label: "החתמת/זיכוי חייל", icon: "✍️", group: "הפלוגה שלי", screen: "signatures" },
  { href: "/counts", label: "ספירת מלאי", icon: "🔢", group: "הפלוגה שלי", screen: "counts" },
  { href: "/gaps", label: "פערים", icon: "⚠️", group: "הפלוגה שלי", screen: "gaps" },
  { href: "/locations?tab=items", label: "מחסני ימ\"ח", icon: "🗄️", group: "הפלוגה שלי", screen: "stock" },

  // ===== המחסנים שלי (קצין מחסן — תפעול שוטף) =====
  { href: "/dispatch", label: 'שבצ"ק', icon: "🚗", group: "המחסנים שלי", screen: "dispatch" },
  { href: "/driving-licenses", label: "הרשאות נהיגה", icon: "🪪", group: "המחסנים שלי", screen: "driving_licenses" },
  { href: "/items", label: "הגדרת פריטים", icon: "🏷️", group: "המחסנים שלי", screen: "catalog" },
  { href: "/stock", label: "מלאי המחסן", icon: "📋", group: "המחסנים שלי", screen: "stock" },
  { href: "/stock/brigade", label: "החתמות/זיכויי חטיבה", icon: "🤝", group: "המחסנים שלי", screen: "stock" },
  { href: "/signatures", label: "החתמות (חיילים/פלוגות)", icon: "✍️", group: "המחסנים שלי", screen: "signatures" },
  { href: "/counts", label: "ספירות מלאי", icon: "🔢", group: "המחסנים שלי", screen: "counts" },
  { href: "/gaps", label: "פערים", icon: "⚠️", group: "המחסנים שלי", screen: "gaps" },
  { href: "/donations", label: "מלאי תרומה", icon: "🎁", group: "המחסנים שלי", screen: "donations" },
  { href: "/transfers", label: "קבלות ממתינות", icon: "📥", group: "המחסנים שלי", screen: "transfers" },
  { href: "/kits", label: "ערכות החתמה", icon: "📦", group: "המחסנים שלי", screen: "kits" },
  { href: "/armory-ineligibility", label: "דוח תהליך זכאות לנשק", icon: "📊", group: "המחסנים שלי", screen: "armory" },
  { href: "/soldiers", label: "חיילים (עריכה + ציוד)", icon: "🪖", group: "המחסנים שלי", screen: "soldiers" },
  { href: "/attendance", label: "נוכחות חיילים", icon: "📋", group: "המחסנים שלי", screen: "attendance" },

  // ===== דוחות ובקרה =====
  { href: "/reports", label: "דוחות", icon: "📈", group: "דוחות ובקרה", screen: "reports" },
  { href: "/history", label: "היסטוריה", icon: "📜", group: "דוחות ובקרה", screen: "history" },
  { href: "/backup", label: "בדיקת גיבוי", icon: "📂", group: "דוחות ובקרה", adminOnly: true },
  { href: "/audit", label: "יומן פעולות", icon: "🧾", group: "דוחות ובקרה", screen: "audit" },
  { href: "/vacation", label: "לוח זמינות", icon: "🏖️", group: "דוחות ובקרה", screen: "vacation" },
  { href: "/setup-checklist", label: "צ'קליסט הקמת גדוד", icon: "📋", group: "דוחות ובקרה", adminOnly: true },

  // ===== ניהול =====
  { href: "/roles", label: "תפקידים והרשאות", icon: "🔑", group: "ניהול", adminOnly: true },
  { href: "/users", label: "הגדרות גדוד", icon: "⚙️", group: "ניהול", adminOnly: true },
  { href: "/org", label: "מבנה ארגוני", icon: "🏢", group: "ניהול", adminOnly: true },

  // ===== עזרה =====
  { href: "/security", label: "אבטחה (2FA)", icon: "🔐", group: "עזרה" },
  { href: "/help", label: "מקראת השימוש", icon: "📖", group: "עזרה" },
];

// Groups visible per context (holder type)
export const GROUP_CONTEXT: Record<string, "company" | "warehouse" | "admin" | "any"> = {
  "ראשי": "any",
  "עזרה": "any",
  "שלישות": "any",
  "ארמון": "any",
  "מחסנים": "admin",
  "המחסנים שלי": "warehouse",
  "הפלוגה שלי": "company",
  "דוחות ובקרה": "any",
  "ניהול": "admin",
};

// Legacy — kept for backward compatibility
export const GROUP_ROLES: Record<string, Role[]> = {
  "ראשי": ["SUPER_ADMIN", "BATTALION_ADMIN", "WAREHOUSE_MANAGER", "COMPANY_REP", "VIEWER", "MAGAD", "SAMAGAD", "SHALISH"],
  "עזרה": ["SUPER_ADMIN", "BATTALION_ADMIN", "WAREHOUSE_MANAGER", "COMPANY_REP", "VIEWER", "MAGAD", "SAMAGAD", "SHALISH"],
  "שלישות": ["SHALISH"],
  "ארמון": ["BATTALION_ADMIN", "MAGAD", "SAMAGAD"],
  "מחסנים": ["BATTALION_ADMIN", "MAGAD", "SAMAGAD"],
  "המחסנים שלי": ["WAREHOUSE_MANAGER"],
  "הפלוגה שלי": ["COMPANY_REP"],
  "דוחות ובקרה": ["BATTALION_ADMIN", "WAREHOUSE_MANAGER", "COMPANY_REP", "VIEWER", "MAGAD", "SAMAGAD", "SHALISH"],
};
