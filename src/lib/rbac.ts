import type { Role } from "@/generated/prisma";

/** יכולות המערכת — בקרת גישה מבוססת-תפקיד (RBAC) */
export type Capability =
  | "dictionaries.manage" // ניהול מילונים (Admin)
  | "users.manage" // ניהול משתמשים
  | "catalog.manage" // ניהול קטלוג מק"טים / קיטים
  | "warehouse.manage" // קליטה/גריעה/שיגור מהמחסן הגדודי
  | "company.manage" // ניהול מלאי פלוגתי + החתמות
  | "armory.manage" // ניהול נשקייה + החתמות
  | "transfer.approve" // אישור לחיצת יד / קבלת ציוד
  | "soldiers.manage" // ניהול חיילים
  | "counts.manage" // ניהול הגדרות ספירה
  | "counts.execute" // ביצוע ספירה
  | "gaps.resolve" // אישור/סגירת פערים
  | "reports.view" // צפייה בדוחות ודשבורד
  | "audit.view"; // צפייה ביומן פעולות

const MATRIX: Record<Role, Capability[]> = {
  ADMIN: [
    "dictionaries.manage",
    "users.manage",
    "catalog.manage",
    "warehouse.manage",
    "company.manage",
    "armory.manage",
    "transfer.approve",
    "soldiers.manage",
    "counts.manage",
    "counts.execute",
    "gaps.resolve",
    "reports.view",
    "audit.view",
  ],
  LOGISTICS: [
    "warehouse.manage",
    "catalog.manage",
    "transfer.approve",
    "soldiers.manage",
    "counts.execute",
    "reports.view",
    "audit.view",
  ],
  COMPANY_SP: [
    "company.manage",
    "transfer.approve",
    "soldiers.manage",
    "counts.execute",
    "reports.view",
  ],
  ARMORY: [
    "armory.manage",
    "transfer.approve",
    "soldiers.manage",
    "counts.execute",
    "reports.view",
  ],
  VIEWER: ["reports.view"],
};

export function can(role: Role, cap: Capability): boolean {
  return MATRIX[role]?.includes(cap) ?? false;
}

export function capabilitiesOf(role: Role): Capability[] {
  return MATRIX[role] ?? [];
}

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "מנהל מערכת",
  LOGISTICS: "אחראי לוגיסטיקה (קל\"ג)",
  COMPANY_SP: "רס\"פ פלוגתי",
  ARMORY: "אחראי נשקייה",
  VIEWER: "צופה / מבקר",
};
