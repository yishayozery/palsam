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

export const NAV: NavItem[] = [
  // ===== ראשי =====
  { href: "/admin/battalions", label: "ניהול גדודים", icon: "🏛️", group: "ראשי", roles: ["SUPER_ADMIN"] },
  { href: "/dashboard", label: "דשבורד", icon: "📊", group: "ראשי", cap: "reports.view" },

  // ===== פלסם (מפ"מ — אחראי מערכת בגדוד) =====
  { href: "/profile", label: "הגדרות גדוד", icon: "🏛️", group: "פלסם", cap: "battalion.profile" },
  { href: "/items", label: "הגדרות פריטים", icon: "🏷️", group: "פלסם", cap: "catalog.manage" },
  { href: "/stock", label: "מלאי הגדוד", icon: "📋", group: "פלסם", cap: "warehouse.operate" },
  { href: "/transfers", label: "העברות (גדוד/חטיבה)", icon: "🔄", group: "פלסם", cap: "reports.view" },
  { href: "/warehouses", label: "מחסני הגדוד", icon: "🏪", group: "פלסם", cap: "reports.view" },
  { href: "/counts", label: "ספירות מלאי", icon: "🔢", group: "פלסם", cap: "reports.view" },
  { href: "/gaps", label: "פערים", icon: "⚠️", group: "פלסם", cap: "reports.view" },

  // ===== המחסנים שלי (קצין מחסן — תפעול שוטף במחסן) =====
  { href: "/inventory", label: "מלאי המחסן", icon: "📦", group: "המחסנים שלי", cap: "warehouse.operate" },
  { href: "/donations", label: "מלאי תרומה", icon: "🎁", group: "המחסנים שלי", cap: "donations.manage" },
  { href: "/signatures", label: "החתמות חיילים", icon: "✍️", group: "המחסנים שלי", cap: "signatures.manage" },
  { href: "/soldiers", label: "חיילים", icon: "🪖", group: "המחסנים שלי", cap: "company.manage" },
  { href: "/reps", label: "נציגי פלוגות", icon: "🤝", group: "המחסנים שלי", cap: "reps.manage" },
  { href: "/locations", label: "מידוף", icon: "🗄️", group: "המחסנים שלי", cap: "locations.manage" },
  { href: "/kits", label: "ערכות החתמה", icon: "📦", group: "המחסנים שלי", cap: "signatures.manage" },

  // ===== דוחות ובקרה =====
  { href: "/reports", label: "דוחות", icon: "📈", group: "דוחות ובקרה", cap: "reports.view" },
  { href: "/audit", label: "יומן פעולות", icon: "🧾", group: "דוחות ובקרה", cap: "audit.view" },
];
