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
  { href: "/roster", label: "שלישות (חיילים)", icon: "🪖", group: "מבצעי", screen: "roster" },
  { href: "/roster?tab=attachments", label: "בקשות סיפוח", icon: "📌", group: "מבצעי", screen: "roster" },
  { href: "/soldiers", label: "חיילי הפלוגה", icon: "👤", group: "מבצעי", screen: "soldiers" },
  // "הצוות שלי" ו"הסמכות" עברו לטאבים בתוך "חיילי הפלוגה" (PeopleTabs) — הוסרו מהתפריט הראשי
  { href: "/attendance", label: "נוכחות בתעסוקה", icon: "📋", group: "מבצעי", screen: "attendance" },
  { href: "/handover", label: "העברת משמרת", icon: "🔄", group: "מבצעי", screen: "attendance" },
  { href: "/dispatch", label: 'שבצ"ק', icon: "🚗", group: "מבצעי", screen: "dispatch" },
  { href: "/driving-licenses", label: "קצין רכב", icon: "🪪", group: "מבצעי", screen: "driving_licenses" },
  { href: "/trainings", label: "הדרכות וקורסים", icon: "🎓", group: "מבצעי", screen: "trainings" },
  { href: "/maintenance", label: "סטטוס רכבים (טנ\"א)", icon: "🔧", group: "מבצעי", screen: "maintenance" },
  { href: "/vacation", label: "ניהול לוז", icon: "📅", group: "מבצעי" },
  { href: "/armory-allocations", label: "הקצאות לפלוגה", icon: "📦", group: "מבצעי", screen: "armory_allocations" },

  // ===== נשק =====
  { href: "/armory-approvals", label: "אישור חיילים לנשק", icon: "🔫", group: "נשק", screen: "armory" },

  // ===== לוגיסטי =====
  { href: "/permanent-items", label: "ציוד קבוע לפלוגה", icon: "📌", group: "לוגיסטי", screen: "allocations" },
  { href: "/warehouses", label: "ניהול מחסנים", icon: "🏪", group: "לוגיסטי", screen: "warehouses" },
  { href: "/items", label: "הגדרות פריטים", icon: "🏷️", group: "לוגיסטי", screen: "catalog" },
  { href: "/stock", label: "מלאי מחסן גדודי", icon: "📋", group: "לוגיסטי", screen: "stock" },
  { href: "/stock/brigade", label: "החתמות חטיבה", icon: "🤝", group: "לוגיסטי", screen: "stock" },
  { href: "/signatures", label: "החתמות", icon: "✍️", group: "לוגיסטי", screen: "signatures" },
  { href: "/counts", label: "ספירות מלאי", icon: "🔢", group: "לוגיסטי", screen: "counts" },
  { href: "/gaps", label: "פערים", icon: "⚠️", group: "לוגיסטי", screen: "gaps" },
  { href: "/my-inventory", label: "מלאי פלוגתי", icon: "📦", group: "לוגיסטי", screen: "soldiers" },
  { href: "/my-inventory/locations", label: "מיקומי ציוד", icon: "📍", group: "לוגיסטי", screen: "soldiers" },
  { href: "/ymach", label: "מידוף ימ\"ח", icon: "🗄️", group: "לוגיסטי", screen: "ymach" },

  // ===== דוחות =====
  { href: "/reports", label: "דוחות", icon: "📈", group: "דוחות", screen: "reports" },
  { href: "/history", label: "היסטוריה", icon: "📜", group: "דוחות", screen: "history" },
  { href: "/audit", label: "יומן פעולות", icon: "🧾", group: "דוחות", screen: "audit" },
  { href: "/armory-ineligibility", label: "דוח זכאות נשק", icon: "📊", group: "דוחות", screen: "armory_reports" },

  // ===== ניהול =====
  { href: "/profile", label: "הגדרות גדוד", icon: "🏛️", group: "ניהול", screen: "settings" },
  { href: "/setup-checklist", label: "צ'קליסט הקמה", icon: "📋", group: "ניהול", adminOnly: true },

  // ===== עזרה =====
  { href: "/security", label: "אבטחה (2FA)", icon: "🔐", group: "עזרה" },
  { href: "/help", label: "מקראת השימוש", icon: "📖", group: "עזרה" },
  { href: "/support", label: "עזרה ותמיכה", icon: "🆘", group: "עזרה" },
  { href: "/backup", label: "בדיקת גיבוי", icon: "📂", group: "עזרה" },
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
