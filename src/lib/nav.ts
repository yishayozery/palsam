import type { Capability } from "./rbac";
import type { Role } from "@/generated/prisma";

export type NavItem = {
  href: string;
  label: string;
  icon: string;
  group: string; // קבוצה לכותרת בתפריט
  cap?: Capability; // יכולת נדרשת
  roles?: Role[]; // הגבלה לתפקידים מסוימים
};

// סדר לפי שלבי העבודה: הגדרות גדוד → הקמת מבנה ומשתמשים → פריטים → תפעול שוטף
export const NAV: NavItem[] = [
  { href: "/admin/battalions", label: "ניהול גדודים", icon: "🏛️", group: "ראשי", roles: ["SUPER_ADMIN"] },
  { href: "/dashboard", label: "דשבורד", icon: "📊", group: "ראשי", cap: "reports.view" },

  // --- הקמה / הגדרות (מפמ) ---
  { href: "/profile", label: "פרופיל גדוד", icon: "🏷️", group: "הקמה והגדרות", cap: "battalion.profile" },
  { href: "/org", label: "מבנה ארגוני", icon: "🏗️", group: "הקמה והגדרות", cap: "org.manage" },
  { href: "/users", label: "משתמשים ותפקידים", icon: "👤", group: "הקמה והגדרות", cap: "users.manage" },
  { href: "/dictionaries", label: "מילונים", icon: "📚", group: "הקמה והגדרות", cap: "dictionaries.manage" },
  { href: "/catalog", label: 'קטלוג מק"טים (פריטים)', icon: "🏷️", group: "הקמה והגדרות", cap: "catalog.manage" },

  // --- תפעול שוטף ---
  { href: "/warehouses", label: "מחסנים", icon: "🏪", group: "תפעול שוטף", cap: "reports.view" },
  { href: "/inventory", label: "מלאי", icon: "📦", group: "תפעול שוטף", cap: "reports.view" },
  { href: "/transfers", label: "העברות והחתמות", icon: "🔄", group: "תפעול שוטף", cap: "reports.view" },
  { href: "/signatures", label: "חתימות חיילים", icon: "✍️", group: "תפעול שוטף", cap: "reports.view" },
  { href: "/soldiers", label: "חיילים", icon: "🪖", group: "תפעול שוטף", cap: "company.manage" },
  { href: "/reps", label: "נציגי פלוגות", icon: "🤝", group: "תפעול שוטף", cap: "reps.manage" },
  { href: "/locations", label: "מידוף", icon: "🗄️", group: "תפעול שוטף", cap: "locations.manage" },
  { href: "/donations", label: "מלאי תרומה", icon: "🎁", group: "תפעול שוטף", cap: "donations.manage" },
  { href: "/counts", label: "ספירות מלאי", icon: "🔢", group: "תפעול שוטף", cap: "reports.view" },
  { href: "/gaps", label: "פערים", icon: "⚠️", group: "תפעול שוטף", cap: "reports.view" },

  // --- דוחות ובקרה ---
  { href: "/reports", label: "דוחות", icon: "📈", group: "דוחות ובקרה", cap: "reports.view" },
  { href: "/audit", label: "יומן פעולות", icon: "🧾", group: "דוחות ובקרה", cap: "audit.view" },
];
