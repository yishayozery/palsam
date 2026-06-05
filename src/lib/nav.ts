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
  "ראשי": ["SUPER_ADMIN", "BATTALION_ADMIN", "WAREHOUSE_MANAGER", "COMPANY_REP", "VIEWER"],
  "פלסם": ["BATTALION_ADMIN"],
  "המחסנים שלי": ["WAREHOUSE_MANAGER", "BATTALION_ADMIN"],
  "הפלוגה שלי": ["COMPANY_REP"],
  "דוחות ובקרה": ["BATTALION_ADMIN", "WAREHOUSE_MANAGER", "COMPANY_REP", "VIEWER"],
};

export const NAV: NavItem[] = [
  // ===== ראשי =====
  { href: "/admin/battalions", label: "ניהול גדודים", icon: "🏛️", group: "ראשי", roles: ["SUPER_ADMIN"] },
  { href: "/dashboard", label: "דשבורד", icon: "📊", group: "ראשי", cap: "reports.view" },

  // ===== פלסם (מפ"מ — אחראי מערכת בגדוד) =====
  { href: "/profile", label: "הגדרות גדוד", icon: "🏛️", group: "פלסם", cap: "battalion.profile" },
  { href: "/roster", label: "שלישות (חיילים)", icon: "🪖", group: "פלסם", cap: "soldiers.roster" },
  { href: "/items", label: "הגדרות פריטים", icon: "🏷️", group: "פלסם", cap: "battalion.profile" },
  { href: "/stock", label: "מלאי הגדוד", icon: "📋", group: "פלסם", cap: "battalion.profile" },
  { href: "/transfers", label: "העברות (גדוד/חטיבה)", icon: "🔄", group: "פלסם", cap: "battalion.profile" },
  { href: "/warehouses", label: "מחסני הגדוד", icon: "🏪", group: "פלסם", cap: "battalion.profile" },
  { href: "/counts", label: "ספירות מלאי", icon: "🔢", group: "פלסם", cap: "battalion.profile" },
  { href: "/counts/plans", label: "תכניות ספירה", icon: "📋", group: "פלסם", cap: "counts.manage" },
  { href: "/gaps", label: "פערים", icon: "⚠️", group: "פלסם", cap: "battalion.profile" },

  // ===== הפלוגה שלי (רס"פ פלוגה — תפעול ברמת פלוגה) =====
  // סדר העבודה: זיכוי → תרומות → החתמה → חיילים → ספירה → מידוף → פערים
  // (דשבורד מופיע ב"ראשי" — תצוגה משתנה אוטומטית לפי תפקיד)
  { href: "/return", label: "זיכוי לגדוד", icon: "↩️", group: "הפלוגה שלי", cap: "company.manage" },
  { href: "/donations", label: "תרומות פלוגתיות", icon: "🎁", group: "הפלוגה שלי", cap: "donations.manage" },
  { href: "/signatures", label: "החתמת חיילים", icon: "✍️", group: "הפלוגה שלי", cap: "signatures.manage" },
  { href: "/soldiers", label: "חיילי הפלוגה", icon: "🪖", group: "הפלוגה שלי", cap: "company.manage" },
  { href: "/counts", label: "ספירת מלאי", icon: "🔢", group: "הפלוגה שלי", cap: "counts.execute" },
  { href: "/locations", label: "מידוף מחסן", icon: "🗄️", group: "הפלוגה שלי", cap: "locations.manage" },
  { href: "/gaps", label: "פערים", icon: "⚠️", group: "הפלוגה שלי", cap: "company.manage" },

  // ===== המחסנים שלי (קצין מחסן — תפעול שוטף) =====
  // סדר לפי שלבי העבודה: נציגים → פריטים → מלאי → ערכות → מידוף → החתמות → ספירות → פערים
  { href: "/reps", label: "נציגי פלוגות", icon: "🤝", group: "המחסנים שלי", cap: "reps.manage" },
  { href: "/items", label: "הגדרת פריטים", icon: "🏷️", group: "המחסנים שלי", cap: "catalog.manage" },
  { href: "/stock", label: "מלאי המחסן", icon: "📋", group: "המחסנים שלי", cap: "warehouse.operate" },
  { href: "/transfers", label: "העברות ואישורים", icon: "🔄", group: "המחסנים שלי", cap: "transfer.approve" },
  { href: "/kits", label: "ערכות החתמה", icon: "📦", group: "המחסנים שלי", cap: "signatures.manage" },
  { href: "/locations", label: "מידוף מחסן", icon: "🗄️", group: "המחסנים שלי", cap: "locations.manage" },
  { href: "/signatures", label: "החתמות (חיילים/פלוגות)", icon: "✍️", group: "המחסנים שלי", cap: "signatures.manage" },
  { href: "/counts", label: "ספירות מלאי", icon: "🔢", group: "המחסנים שלי", cap: "counts.execute" },
  { href: "/gaps", label: "פערים", icon: "⚠️", group: "המחסנים שלי", cap: "gaps.resolve" },
  // החתמת חיילים נפרדת
  { href: "/donations", label: "מלאי תרומה", icon: "🎁", group: "המחסנים שלי", cap: "donations.manage" },
  { href: "/soldiers", label: "חיילים", icon: "🪖", group: "המחסנים שלי", cap: "company.manage" },

  // ===== דוחות ובקרה =====
  { href: "/reports", label: "דוחות", icon: "📈", group: "דוחות ובקרה", cap: "reports.view" },
  { href: "/audit", label: "יומן פעולות", icon: "🧾", group: "דוחות ובקרה", cap: "audit.view" },
];
