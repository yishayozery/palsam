import type { Capability } from "./rbac";
import type { Role } from "@/generated/prisma";

export type NavItem = {
  href: string;
  label: string;
  icon: string;
  cap?: Capability; // יכולת נדרשת
  roles?: Role[]; // הגבלה לתפקידים מסוימים
};

export const NAV: NavItem[] = [
  { href: "/admin/battalions", label: "ניהול גדודים", icon: "🏛️", roles: ["SUPER_ADMIN"] },
  { href: "/dashboard", label: "דשבורד", icon: "📊", cap: "reports.view" },
  { href: "/warehouses", label: "מחסנים", icon: "🏪", cap: "reports.view" },
  { href: "/inventory", label: "מלאי", icon: "📦", cap: "reports.view" },
  { href: "/catalog", label: 'קטלוג מק"טים', icon: "🏷️", cap: "catalog.manage" },
  { href: "/transfers", label: "העברות והחתמות", icon: "🔄", cap: "reports.view" },
  { href: "/signatures", label: "חתימות חיילים", icon: "✍️", cap: "reports.view" },
  { href: "/counts", label: "ספירות מלאי", icon: "🔢", cap: "reports.view" },
  { href: "/gaps", label: "פערים", icon: "⚠️", cap: "reports.view" },
  { href: "/soldiers", label: "חיילים", icon: "🪖", cap: "company.manage" },
  { href: "/donations", label: "מלאי תרומה", icon: "🎁", cap: "donations.manage" },
  { href: "/locations", label: "מידוף", icon: "🗄️", cap: "locations.manage" },
  { href: "/reps", label: "נציגי פלוגות", icon: "🤝", cap: "reps.manage" },
  { href: "/dictionaries", label: "מילונים", icon: "📚", cap: "dictionaries.manage" },
  { href: "/org", label: "מבנה ארגוני", icon: "🏗️", cap: "org.manage" },
  { href: "/users", label: "משתמשים", icon: "👤", cap: "users.manage" },
  { href: "/roles", label: "תפקידים", icon: "🎖️", cap: "users.manage" },
  { href: "/profile", label: "פרופיל גדוד", icon: "🏷️", cap: "battalion.profile" },
  { href: "/reports", label: "דוחות", icon: "📈", cap: "reports.view" },
  { href: "/audit", label: "יומן פעולות", icon: "🧾", cap: "audit.view" },
];
