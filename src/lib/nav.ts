import type { Capability } from "./rbac";
import type { Role } from "@/generated/prisma";

export type NavItem = {
  href: string;
  label: string;
  icon: string;
  group: string;
  cap?: Capability;
  roles?: Role[];
};

/** איזה תפקיד שייך לאיזו קבוצה. סינון ברמת הקבוצה — מונע "דלף" של פריטים בין תפקידים. */
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

export const NAV: NavItem[] = [
  // ===== ראשי =====
  { href: "/admin/battalions", label: "ניהול גדודים", icon: "🏛️", group: "ראשי", roles: ["SUPER_ADMIN"] },
  { href: "/profile", label: "הגדרות גדוד", icon: "🏛️", group: "ראשי", cap: "battalion.profile" },
  { href: "/dashboard", label: "דשבורד", icon: "📊", group: "ראשי", cap: "reports.view" },
  { href: "/attendance", label: "נוכחות חיילים", icon: "📋", group: "ראשי", cap: "attendance.view" },
  { href: "/roster", label: "שלישות (חיילים)", icon: "🪖", group: "ראשי", cap: "soldiers.roster" },
  { href: "/soldiers", label: "חיילים (עריכה + ציוד)", icon: "🪖", group: "ראשי", cap: "company.manage" },
  { href: "/permanent-items", label: "ציוד קבוע לפלוגה", icon: "📌", group: "ראשי", cap: "battalion.profile" },
  { href: "/armory-allocations", label: "הקצאות לפלוגה", icon: "📦", group: "ראשי", cap: "weapons.approve" },
  { href: "/dispatch", label: 'שבצ"ק', icon: "🚗", group: "ראשי", cap: "dispatch.manage" },
  { href: "/maintenance", label: "סטטוס רכבים", icon: "🔧", group: "ראשי", cap: "maintenance.manage" },

  // ===== ארמון (מפמ + מגד + סמגד) =====
  { href: "/armory-approvals", label: "אישור חיילים לנשק", icon: "🔫", group: "ארמון", cap: "weapons.approve" },
  { href: "/armory-ineligibility", label: "דוח תהליך זכאות", icon: "📊", group: "ארמון", cap: "weapons.view" },

  // ===== מחסנים (מפמ + מגד + סמגד) =====
  { href: "/warehouses", label: "מחסני הגדוד", icon: "🏪", group: "מחסנים", cap: "battalion.profile" },
  { href: "/items", label: "הגדרות פריטים", icon: "🏷️", group: "מחסנים", cap: "battalion.profile" },
  { href: "/stock/brigade", label: "החתמות/זיכויי חטיבה", icon: "🤝", group: "מחסנים", cap: "warehouse.operate" },
  { href: "/stock", label: "מלאי", icon: "📋", group: "מחסנים", cap: "battalion.profile" },
  { href: "/signatures", label: "החתמת פלוגה", icon: "✍️", group: "מחסנים", cap: "signatures.manage" },
  { href: "/counts", label: "ספירת מלאי", icon: "🔢", group: "מחסנים", cap: "counts.manage" },
  { href: "/gaps", label: "פערים מספירות מלאי", icon: "⚠️", group: "מחסנים", cap: "battalion.profile" },

  // ===== שלישות (שליש גדודי — ניהול חיילים + גיוס) =====
  { href: "/roster", label: "שלישות (חיילים)", icon: "🪖", group: "שלישות", cap: "soldiers.roster" },
  { href: "/armory-ineligibility", label: "דוח תהליך זכאות לנשק", icon: "📊", group: "שלישות", cap: "weapons.view" },
  { href: "/dispatch", label: 'שבצ"ק', icon: "🚗", group: "שלישות", cap: "dispatch.manage" },

  // ===== הפלוגה שלי (רס"פ פלוגה — תפעול ברמת פלוגה) =====
  { href: "/dispatch", label: 'שבצ"ק', icon: "🚗", group: "הפלוגה שלי", cap: "dispatch.manage" },
  { href: "/soldiers", label: "חיילי הפלוגה", icon: "🪖", group: "הפלוגה שלי", cap: "company.manage" },
  { href: "/attendance", label: "נוכחות חיילים", icon: "📋", group: "הפלוגה שלי", cap: "attendance.manage" },
  { href: "/donations", label: "תרומות פלוגתיות", icon: "🎁", group: "הפלוגה שלי", cap: "donations.manage" },
  { href: "/my-inventory", label: "מלאי הפלוגה", icon: "📦", group: "הפלוגה שלי", cap: "company.manage" },
  { href: "/my-inventory/locations", label: "מיקומי ציוד", icon: "📍", group: "הפלוגה שלי", cap: "company.manage" },
  { href: "/transfers", label: "קבלות ממתינות", icon: "📥", group: "הפלוגה שלי", cap: "transfer.approve" },
  { href: "/signatures", label: "החתמת/זיכוי חייל", icon: "✍️", group: "הפלוגה שלי", cap: "signatures.manage" },
  { href: "/counts", label: "ספירת מלאי", icon: "🔢", group: "הפלוגה שלי", cap: "counts.execute" },
  { href: "/gaps", label: "פערים", icon: "⚠️", group: "הפלוגה שלי", cap: "company.manage" },
  { href: "/locations?tab=items", label: "מחסני ימ\"ח", icon: "🗄️", group: "הפלוגה שלי", cap: "locations.manage" },

  // ===== המחסנים שלי (קצין מחסן — תפעול שוטף) =====
  { href: "/dispatch", label: 'שבצ"ק', icon: "🚗", group: "המחסנים שלי", cap: "dispatch.manage" },

  { href: "/items", label: "הגדרת פריטים", icon: "🏷️", group: "המחסנים שלי", cap: "catalog.manage" },
  { href: "/stock", label: "מלאי המחסן", icon: "📋", group: "המחסנים שלי", cap: "warehouse.operate" },
  { href: "/stock/brigade", label: "החתמות/זיכויי חטיבה", icon: "🤝", group: "המחסנים שלי", cap: "warehouse.operate" },
  { href: "/signatures", label: "החתמות (חיילים/פלוגות)", icon: "✍️", group: "המחסנים שלי", cap: "signatures.manage" },
  { href: "/counts", label: "ספירות מלאי", icon: "🔢", group: "המחסנים שלי", cap: "counts.execute" },
  { href: "/gaps", label: "פערים", icon: "⚠️", group: "המחסנים שלי", cap: "gaps.resolve" },
  { href: "/donations", label: "מלאי תרומה", icon: "🎁", group: "המחסנים שלי", cap: "donations.manage" },
  { href: "/transfers", label: "קבלות ממתינות", icon: "📥", group: "המחסנים שלי", cap: "transfer.approve" },
  { href: "/kits", label: "ערכות החתמה", icon: "📦", group: "המחסנים שלי", cap: "kits.manage" },
  { href: "/armory-ineligibility", label: "דוח תהליך זכאות לנשק", icon: "📊", group: "המחסנים שלי", cap: "weapons.view" },

  // ===== דוחות ובקרה =====
  { href: "/reports", label: "דוחות", icon: "📈", group: "דוחות ובקרה", cap: "reports.view" },
  { href: "/history", label: "היסטוריה", icon: "📜", group: "דוחות ובקרה", cap: "reports.view" },
  { href: "/backup", label: "בדיקת גיבוי", icon: "📂", group: "דוחות ובקרה", cap: "battalion.profile" },
  { href: "/audit", label: "יומן פעולות", icon: "🧾", group: "דוחות ובקרה", cap: "audit.view" },

  // ===== עזרה =====
  { href: "/security", label: "🔐 אבטחה (2FA)", icon: "🔐", group: "עזרה" },
  { href: "/help", label: "מקראת השימוש", icon: "📖", group: "עזרה" },
];
