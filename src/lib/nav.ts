import type { Capability } from "./rbac";
import type { Role } from "@/generated/prisma";

export type NavItem = {
  href: string;
  label: string;
  icon: string;
  cap?: Capability; // יכולת נדרשת
  roles?: Role[]; // הגבלה לתפקידים מסוימים
};

// סדר לפי שלבי העבודה: הגדרות גדוד → הקמת מבנה ומשתמשים → פריטים → תפעול שוטף
export const NAV: NavItem[] = [
  { href: "/admin/battalions", label: "ניהול גדודים", icon: "🏛️", roles: ["SUPER_ADMIN"] },
  { href: "/dashboard", label: "דשבורד", icon: "📊", cap: "reports.view" },

  // --- הקמה / הגדרות (מפמ) ---
  { href: "/profile", label: "פרופיל גדוד", icon: "🏷️", cap: "battalion.profile" },
  { href: "/org", label: "מבנה ארגוני", icon: "🏗️", cap: "org.manage" },
  { href: "/users", label: "משתמשים ותפקידים", icon: "👤", cap: "users.manage" },
  { href: "/dictionaries", label: "מילונים", icon: "📚", cap: "dictionaries.manage" },
  { href: "/catalog", label: 'קטלוג מק"טים (פריטים)', icon: "🏷️", cap: "catalog.manage" },

  // --- תפעול שוטף ---
  { href: "/warehouses", label: "מחסנים", icon: "🏪", cap: "reports.view" },
  { href: "/inventory", label: "מלאי", icon: "📦", cap: "reports.view" },
  { href: "/transfers", label: "העברות והחתמות", icon: "🔄", cap: "reports.view" },
  { href: "/signatures", label: "חתימות חיילים", icon: "✍️", cap: "reports.view" },
  { href: "/soldiers", label: "חיילים", icon: "🪖", cap: "company.manage" },
  { href: "/reps", label: "נציגי פלוגות", icon: "🤝", cap: "reps.manage" },
  { href: "/locations", label: "מידוף", icon: "🗄️", cap: "locations.manage" },
  { href: "/donations", label: "מלאי תרומה", icon: "🎁", cap: "donations.manage" },
  { href: "/counts", label: "ספירות מלאי", icon: "🔢", cap: "reports.view" },
  { href: "/gaps", label: "פערים", icon: "⚠️", cap: "reports.view" },

  // --- דוחות ובקרה ---
  { href: "/reports", label: "דוחות", icon: "📈", cap: "reports.view" },
  { href: "/audit", label: "יומן פעולות", icon: "🧾", cap: "audit.view" },
];
