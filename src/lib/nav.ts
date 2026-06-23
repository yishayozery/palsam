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
  // ===== אדמין-על =====
  { href: "/admin/battalions", label: "ניהול גדודים", icon: "🏛️", group: "ניהול-על", superAdminOnly: true },

  // ===== מבצעי =====
  { href: "/dashboard", label: "דשבורד", icon: "📊", group: "מבצעי", screen: "dashboard" },
  { href: "/roster", label: "שלישות (חיילים)", icon: "🪖", group: "מבצעי", screen: "soldiers" },
  { href: "/soldiers", label: "חיילים (עריכה + ציוד)", icon: "👤", group: "מבצעי", screen: "soldiers" },
  { href: "/attendance", label: "נוכחות בתעסוקה", icon: "📋", group: "מבצעי", screen: "attendance" },
  { href: "/employment", label: "ניהול תעסוקות", icon: "📅", group: "מבצעי", screen: "employment" },
  { href: "/dispatch", label: 'שבצ"ק', icon: "🚗", group: "מבצעי", screen: "dispatch" },
  { href: "/driving-licenses", label: "הרשאות נהיגה", icon: "🪪", group: "מבצעי", screen: "driving_licenses" },
  { href: "/certifications", label: "הסמכות", icon: "🎖️", group: "מבצעי", screen: "certifications" },
  { href: "/maintenance", label: "סטטוס רכבים", icon: "🔧", group: "מבצעי", screen: "maintenance" },
  { href: "/vacation", label: "לוח זמינות", icon: "🏖️", group: "מבצעי" },

  // ===== נשק =====
  { href: "/armory-approvals", label: "אישור חיילים לנשק", icon: "🔫", group: "נשק", screen: "armory" },
  { href: "/armory-ineligibility", label: "דוח זכאות נשק", icon: "📊", group: "נשק", screen: "armory_reports" },

  // ===== לוגיסטי =====
  { href: "/warehouses", label: "מחסנים", icon: "🏪", group: "לוגיסטי", screen: "warehouses" },
  { href: "/items", label: "הגדרות פריטים", icon: "🏷️", group: "לוגיסטי", screen: "catalog" },
  { href: "/stock", label: "מלאי", icon: "📋", group: "לוגיסטי", screen: "stock" },
  { href: "/stock/brigade", label: "החתמות חטיבה", icon: "🤝", group: "לוגיסטי", screen: "stock" },
  { href: "/permanent-items", label: "ציוד קבוע לפלוגה", icon: "📌", group: "לוגיסטי", screen: "allocations" },
  { href: "/armory-allocations", label: "הקצאות לפלוגה", icon: "📦", group: "לוגיסטי", screen: "armory_allocations" },
  { href: "/signatures", label: "החתמות", icon: "✍️", group: "לוגיסטי", screen: "signatures" },
  { href: "/counts", label: "ספירות מלאי", icon: "🔢", group: "לוגיסטי", screen: "counts" },
  { href: "/gaps", label: "פערים", icon: "⚠️", group: "לוגיסטי", screen: "gaps" },
  { href: "/transfers", label: "קבלות ממתינות", icon: "📥", group: "לוגיסטי", screen: "transfers" },
  { href: "/kits", label: "ערכות החתמה", icon: "📦", group: "לוגיסטי", screen: "kits" },
  { href: "/donations", label: "תרומות", icon: "🎁", group: "לוגיסטי", screen: "donations" },
  { href: "/my-inventory", label: "מלאי הפלוגה", icon: "📦", group: "לוגיסטי", screen: "soldiers" },

  // ===== דוחות =====
  { href: "/reports", label: "דוחות", icon: "📈", group: "דוחות", screen: "reports" },
  { href: "/history", label: "היסטוריה", icon: "📜", group: "דוחות", screen: "history" },
  { href: "/audit", label: "יומן פעולות", icon: "🧾", group: "דוחות", screen: "audit" },

  // ===== ניהול =====
  { href: "/profile", label: "הגדרות גדוד", icon: "🏛️", group: "ניהול", screen: "settings" },
  { href: "/users/all", label: "ניהול משתמשים", icon: "👥", group: "ניהול", adminOnly: true },
  { href: "/roles", label: "תפקידים והרשאות", icon: "🔑", group: "ניהול", adminOnly: true },
  { href: "/org", label: "מבנה ארגוני", icon: "🏢", group: "ניהול", adminOnly: true },
  { href: "/backup", label: "בדיקת גיבוי", icon: "📂", group: "ניהול", adminOnly: true },
  { href: "/setup-checklist", label: "צ'קליסט הקמה", icon: "📋", group: "ניהול", adminOnly: true },

  // ===== עזרה =====
  { href: "/security", label: "אבטחה (2FA)", icon: "🔐", group: "עזרה" },
  { href: "/help", label: "מקראת השימוש", icon: "📖", group: "עזרה" },
];

// Groups visible per context (holder type)
export const GROUP_CONTEXT: Record<string, "company" | "warehouse" | "admin" | "any"> = {
  "ניהול-על": "any",
  "מבצעי": "any",
  "נשק": "any",
  "לוגיסטי": "any",
  "דוחות": "any",
  "ניהול": "admin",
  "עזרה": "any",
};

// Legacy — kept for backward compatibility
export const GROUP_ROLES: Record<string, Role[]> = {
  "ניהול-על": ["SUPER_ADMIN"],
  "מבצעי": ["SUPER_ADMIN", "BATTALION_ADMIN", "WAREHOUSE_MANAGER", "COMPANY_REP", "VIEWER", "MAGAD", "SAMAGAD", "SHALISH"],
  "נשק": ["BATTALION_ADMIN", "MAGAD", "SAMAGAD"],
  "לוגיסטי": ["SUPER_ADMIN", "BATTALION_ADMIN", "WAREHOUSE_MANAGER", "COMPANY_REP", "MAGAD", "SAMAGAD", "SHALISH"],
  "דוחות": ["BATTALION_ADMIN", "WAREHOUSE_MANAGER", "COMPANY_REP", "VIEWER", "MAGAD", "SAMAGAD", "SHALISH"],
  "ניהול": ["BATTALION_ADMIN"],
  "עזרה": ["SUPER_ADMIN", "BATTALION_ADMIN", "WAREHOUSE_MANAGER", "COMPANY_REP", "VIEWER", "MAGAD", "SAMAGAD", "SHALISH"],
};
