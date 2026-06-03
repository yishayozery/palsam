import type { Capability } from "./rbac";

export type NavItem = {
  href: string;
  label: string;
  icon: string;
  cap?: Capability; // יכולת נדרשת (אם אין — גלוי לכולם המחוברים)
};

export const NAV: NavItem[] = [
  { href: "/dashboard", label: "דשבורד", icon: "📊", cap: "reports.view" },
  { href: "/inventory", label: "מלאי", icon: "📦", cap: "reports.view" },
  { href: "/catalog", label: 'קטלוג מק"טים', icon: "🏷️", cap: "catalog.manage" },
  { href: "/transfers", label: "העברות והחתמות", icon: "🔄", cap: "reports.view" },
  { href: "/signatures", label: "חתימות חיילים", icon: "✍️", cap: "reports.view" },
  { href: "/counts", label: "ספירות מלאי", icon: "🔢", cap: "reports.view" },
  { href: "/gaps", label: "פערים", icon: "⚠️", cap: "reports.view" },
  { href: "/soldiers", label: "חיילים", icon: "🪖", cap: "soldiers.manage" },
  { href: "/dictionaries", label: "מילונים", icon: "📚", cap: "dictionaries.manage" },
  { href: "/users", label: "משתמשים", icon: "👤", cap: "users.manage" },
  { href: "/reports", label: "דוחות", icon: "📈", cap: "reports.view" },
  { href: "/audit", label: "יומן פעולות", icon: "🧾", cap: "audit.view" },
];
