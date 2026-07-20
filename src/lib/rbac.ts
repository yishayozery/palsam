import type { Role, PermissionLevel, WarehouseType } from "@/generated/prisma";

// ===================== מסכים =====================

export const SCREENS = {
  dashboard: "דשבורד",
  soldiers: "חיילי הפלוגה",
  roster: "שלישות (ניהול חיילים)",
  attendance: "נוכחות",
  employment: "תעסוקה (ימי מילואים)",
  dispatch: "שבצ\"ק",
  driving_licenses: "הרשאות נהיגה",
  certifications: "הסמכות",
  trainings: "הדרכות וקורסים",
  stock: "מלאי",
  signatures: "החתמות/זיכוי",
  counts: "ספירות",
  gaps: "פערים",
  armory: "ארמון (אישור נשק)",
  armory_reports: "דוח זכאות נשק",
  armory_allocations: "הקצאות לפלוגה",
  maintenance: "תחזוקה/רכבים",
  transfers: "מסירות",
  kits: "ערכות",
  donations: "תרומות",
  reports: "דוחות",
  history: "היסטוריה",
  audit: "יומן פעולות",
  vacation: "לוח זמינות",
  catalog: "הגדרות פריטים",
  warehouses: "מחסנים",
  allocations: "הקצאות/ציוד קבוע",
  ymach: "מידוף ימ\"ח",
  settings: "הגדרות גדוד",
} as const;

export type Screen = keyof typeof SCREENS;
export const SCREEN_KEYS = Object.keys(SCREENS) as Screen[];

export type ScreenCategory = "warehouse" | "company" | "general" | "admin";
export const SCREEN_CATEGORIES: Record<ScreenCategory, { label: string; icon: string; color: string; screens: Screen[] }> = {
  warehouse: {
    label: "מחסן",
    icon: "🏪",
    color: "amber",
    screens: ["stock", "catalog", "signatures", "counts", "gaps", "transfers", "kits", "warehouses", "donations", "driving_licenses", "maintenance", "ymach"],
  },
  company: {
    label: "פלוגה",
    icon: "👤",
    color: "blue",
    screens: ["soldiers", "roster", "attendance", "employment", "allocations", "armory_allocations", "ymach"],
  },
  general: {
    label: "כללי",
    icon: "📋",
    color: "slate",
    screens: ["dashboard", "dispatch", "vacation", "armory", "armory_reports", "reports", "history", "audit", "certifications", "trainings"],
  },
  admin: {
    label: "ניהול",
    icon: "⚙️",
    color: "purple",
    screens: ["settings"],
  },
};

// ===================== Capability → Screen מיפוי תאימות =====================

export type Capability =
  | "battalions.manage"
  | "users.manage"
  | "org.manage"
  | "battalion.profile"
  | "warehouse.operate"
  | "catalog.manage"
  | "kits.manage"
  | "dictionaries.manage"
  | "locations.manage"
  | "reps.manage"
  | "company.manage"
  | "soldiers.roster"
  | "donations.manage"
  | "transfer.approve"
  | "signatures.manage"
  | "counts.manage"
  | "counts.execute"
  | "gaps.resolve"
  | "maintenance.manage"
  | "reports.view"
  | "audit.view"
  | "dispatch.manage"
  | "dispatch.edit"
  | "maintenance.edit"
  | "weapons.approve"
  | "weapons.view"
  | "attendance.manage"
  | "attendance.view"
  | "weapons.view_report"
  | "ymach.manage"
  | "certifications.view";

/**
 * ⚠️ needsEdit:false = השער עובר גם ברמת VIEW. ה-capabilities האלה הן
 * **צפייה בלבד** ואסור להגן בהן על פעולת כתיבה:
 *   battalion.profile · dispatch.manage · reports.view · audit.view ·
 *   weapons.view · attendance.view · weapons.view_report · certifications.view
 * לכתיבה: canEdit(user, screen) / requireScreenEdit(screen), או capability
 * עם needsEdit:true (למשל dispatch.edit, maintenance.edit).
 */
const CAP_TO_SCREEN: Record<Capability, { screen: Screen; needsEdit: boolean }> = {
  "battalions.manage": { screen: "settings", needsEdit: true },
  "users.manage": { screen: "settings", needsEdit: true },
  "org.manage": { screen: "settings", needsEdit: true },
  "battalion.profile": { screen: "settings", needsEdit: false },
  "warehouse.operate": { screen: "stock", needsEdit: true },
  "catalog.manage": { screen: "catalog", needsEdit: true },
  "kits.manage": { screen: "kits", needsEdit: true },
  "dictionaries.manage": { screen: "catalog", needsEdit: true },
  "locations.manage": { screen: "stock", needsEdit: true },
  "reps.manage": { screen: "stock", needsEdit: true },
  "company.manage": { screen: "soldiers", needsEdit: true },
  "soldiers.roster": { screen: "roster", needsEdit: true },
  "donations.manage": { screen: "donations", needsEdit: true },
  "transfer.approve": { screen: "transfers", needsEdit: true },
  "signatures.manage": { screen: "signatures", needsEdit: true },
  "counts.manage": { screen: "counts", needsEdit: true },
  "counts.execute": { screen: "counts", needsEdit: true },
  "gaps.resolve": { screen: "gaps", needsEdit: true },
  "maintenance.manage": { screen: "maintenance", needsEdit: true },
  "reports.view": { screen: "reports", needsEdit: false },
  "audit.view": { screen: "audit", needsEdit: false },
  // ⚠️ dispatch.manage נשאר needsEdit:false לתאימות — הוא שומר על *צפייה* במסך.
  //    לכתיבה יש להשתמש ב-dispatch.edit. אותו הפרדה ל-maintenance.
  "dispatch.manage": { screen: "dispatch", needsEdit: false },
  "dispatch.edit": { screen: "dispatch", needsEdit: true },
  "maintenance.edit": { screen: "maintenance", needsEdit: true },
  "weapons.approve": { screen: "armory", needsEdit: true },
  "weapons.view": { screen: "armory", needsEdit: false },
  "attendance.manage": { screen: "attendance", needsEdit: true },
  "attendance.view": { screen: "attendance", needsEdit: false },
  "weapons.view_report": { screen: "armory_reports", needsEdit: false },
  "ymach.manage": { screen: "ymach", needsEdit: true },
  "certifications.view": { screen: "certifications", needsEdit: false },
};

// ===================== SessionUser permissions =====================

export type UserPermissions = Partial<Record<Screen, PermissionLevel>>;

export interface PermissionHolder {
  permissions: UserPermissions;
  isAdmin: boolean;
  isSuperAdmin?: boolean;
}

/**
 * בודק האם למשתמש יש גישה ליכולת/מסך מסוים.
 * תומך בשני פורמטים:
 * - can(user, "dispatch.manage") — תאימות לאחור
 * - can(user, "dispatch") — מסך ישיר
 */
export function can(
  userOrRole: PermissionHolder | Role,
  capOrScreen: Capability | Screen,
): boolean {
  // Legacy: can(role, cap) — ממיר דרך המטריצה הישנה
  if (typeof userOrRole === "string") {
    return LEGACY_MATRIX[userOrRole]?.includes(capOrScreen as Capability) ?? false;
  }

  const user = userOrRole;
  if (user.isSuperAdmin) return true;
  if (user.isAdmin) return true;

  // בדיקה ישירה כמסך
  if (capOrScreen in SCREENS) {
    return !!user.permissions[capOrScreen as Screen];
  }

  // מיפוי capability → screen
  const mapping = CAP_TO_SCREEN[capOrScreen as Capability];
  if (!mapping) return false;

  const level = user.permissions[mapping.screen];
  if (!level) return false;
  if (mapping.needsEdit && level === "VIEW") return false;
  return true;
}

/** בדיקה שלמשתמש יש הרשאת עריכה על מסך */
export function canEdit(user: PermissionHolder, screen: Screen): boolean {
  if (user.isSuperAdmin || user.isAdmin) return true;
  return user.permissions[screen] === "EDIT";
}

// ===================== Legacy =====================

const LEGACY_MATRIX: Record<Role, Capability[]> = {
  SUPER_ADMIN: ["battalions.manage", "users.manage", "reports.view", "audit.view"],
  BATTALION_ADMIN: [
    "users.manage", "org.manage", "battalion.profile", "dictionaries.manage",
    "catalog.manage", "kits.manage", "locations.manage", "warehouse.operate",
    "counts.manage", "counts.execute", "soldiers.roster", "company.manage",
    "signatures.manage", "transfer.approve", "gaps.resolve", "maintenance.manage",
    "reports.view", "audit.view", "dispatch.manage", "weapons.approve",
    "weapons.view", "attendance.manage", "attendance.view", "ymach.manage",
    "certifications.view",
  ],
  WAREHOUSE_MANAGER: [
    "warehouse.operate", "catalog.manage", "kits.manage", "dictionaries.manage",
    "locations.manage", "reps.manage", "company.manage", "donations.manage",
    "transfer.approve", "signatures.manage", "counts.manage", "counts.execute",
    "gaps.resolve", "reports.view", "dispatch.manage", "weapons.view_report",
    "attendance.manage", "attendance.view", "ymach.manage",
    "certifications.view",
  ],
  COMPANY_REP: [
    "company.manage", "locations.manage", "donations.manage", "transfer.approve",
    "signatures.manage", "counts.manage", "counts.execute", "reports.view",
    "dispatch.manage", "attendance.manage", "attendance.view", "ymach.manage",
    "certifications.view",
  ],
  VIEWER: ["reports.view", "dispatch.manage"],
  SHALISH: ["soldiers.roster", "reports.view", "dispatch.manage", "weapons.view"],
  MAGAD: [
    "reports.view", "audit.view", "battalion.profile", "soldiers.roster",
    "company.manage", "signatures.manage", "counts.manage", "counts.execute",
    "gaps.resolve", "maintenance.manage", "dispatch.manage", "weapons.approve",
    "weapons.view", "attendance.view", "certifications.view",
  ],
  SAMAGAD: [
    "reports.view", "audit.view", "battalion.profile", "soldiers.roster",
    "company.manage", "signatures.manage", "counts.manage", "counts.execute",
    "gaps.resolve", "maintenance.manage", "dispatch.manage", "weapons.approve",
    "weapons.view", "attendance.view", "certifications.view",
  ],
};

/** בונה permissions map מתפקיד ישן (legacy) */
export function permissionsFromLegacyRole(role: Role): UserPermissions {
  const caps = LEGACY_MATRIX[role] ?? [];
  const perms: UserPermissions = {};
  for (const cap of caps) {
    const mapping = CAP_TO_SCREEN[cap];
    if (!mapping) continue;
    const level: PermissionLevel = mapping.needsEdit ? "EDIT" : "VIEW";
    const existing = perms[mapping.screen];
    if (!existing || (level === "EDIT" && existing === "VIEW")) {
      perms[mapping.screen] = level;
    }
  }
  return perms;
}

// ===================== Preset role definitions =====================

// Helper: build permissions list from overrides map, ensuring no duplicates
function buildPerms(
  base: PermissionLevel,
  overrides: Partial<Record<Screen, PermissionLevel>> = {},
  exclude: Screen[] = [],
): { screen: Screen; level: PermissionLevel }[] {
  return SCREEN_KEYS
    .filter((s) => !exclude.includes(s))
    .map((s) => ({ screen: s, level: overrides[s] ?? base }))
    .filter((p) => p.level !== ("NONE" as PermissionLevel));
}

// שמות תפקידי-התחום להאצלת רס"פ (מקור אמת אחד — משמש גם ב-team/actions)
export const AREA_ROLE_EQUIP = 'רס"פ מחסן';        // תחום לוגיסטי — החתמות, ספירות, מסירות
export const AREA_ROLE_PERSONNEL = 'רס"פ שלישות';  // תחום כ"א — חיילים, נוכחות, שבצ"ק

export const PRESET_ROLES: {
  name: string; isAdmin: boolean; isCommander: boolean; sortOrder: number;
  permissions: { screen: Screen; level: PermissionLevel }[];
}[] = [
  // ===== רמת גדוד =====
  {
    name: "מנהל מערכת", isAdmin: true, isCommander: false, sortOrder: 0,
    permissions: buildPerms("EDIT"),
  },
  {
    name: 'מג"ד', isAdmin: false, isCommander: false, sortOrder: 1,
    permissions: buildPerms("EDIT", {}, ["settings"]),  // includes roster
  },
  {
    name: 'סמג"ד', isAdmin: false, isCommander: false, sortOrder: 2,
    permissions: buildPerms("EDIT", {}, ["settings"]),
  },
  {
    name: 'מפ"מ', isAdmin: false, isCommander: false, sortOrder: 3,
    permissions: buildPerms("EDIT"),
  },

  // ===== רמת פלוגה =====
  {
    name: "מפ", isAdmin: false, isCommander: true, sortOrder: 4,
    permissions: [
      { screen: "dashboard", level: "VIEW" }, { screen: "soldiers", level: "EDIT" },
      { screen: "attendance", level: "EDIT" }, { screen: "employment", level: "VIEW" },
      { screen: "dispatch", level: "EDIT" }, { screen: "certifications", level: "VIEW" },
      { screen: "signatures", level: "EDIT" }, { screen: "transfers", level: "EDIT" },
      { screen: "counts", level: "EDIT" }, { screen: "donations", level: "EDIT" },
      { screen: "vacation", level: "EDIT" },
      { screen: "stock", level: "VIEW" }, { screen: "gaps", level: "VIEW" },
      { screen: "reports", level: "VIEW" }, { screen: "armory_allocations", level: "VIEW" },
      { screen: "maintenance", level: "EDIT" }, { screen: "ymach", level: "EDIT" },
      { screen: "trainings", level: "VIEW" },
    ],
  },
  {
    name: "מפקד מחלקה", isAdmin: false, isCommander: true, sortOrder: 5,
    permissions: [
      { screen: "dashboard", level: "VIEW" }, { screen: "soldiers", level: "VIEW" },
      { screen: "attendance", level: "EDIT" }, { screen: "dispatch", level: "EDIT" }, { screen: "certifications", level: "VIEW" },
      { screen: "vacation", level: "VIEW" }, { screen: "trainings", level: "VIEW" },
    ],
  },
  {
    // מפלג — נצ"ל פלוגתי: מחתים ציוד, מדווח נוכחות, מנהל ספירות/מסירות בפלוגה
    name: "מפלג", isAdmin: false, isCommander: true, sortOrder: 6,
    permissions: [
      { screen: "dashboard", level: "VIEW" }, { screen: "soldiers", level: "EDIT" },
      { screen: "attendance", level: "EDIT" }, { screen: "employment", level: "VIEW" },
      { screen: "dispatch", level: "EDIT" }, { screen: "certifications", level: "VIEW" },
      { screen: "signatures", level: "EDIT" }, { screen: "transfers", level: "EDIT" },
      { screen: "counts", level: "EDIT" }, { screen: "donations", level: "EDIT" },
      { screen: "vacation", level: "EDIT" },
      { screen: "stock", level: "VIEW" }, { screen: "gaps", level: "VIEW" },
      { screen: "reports", level: "VIEW" }, { screen: "armory_allocations", level: "VIEW" },
      { screen: "maintenance", level: "EDIT" }, { screen: "ymach", level: "EDIT" },
      { screen: "trainings", level: "VIEW" },
    ],
  },

  // ===== תפקידי מטה =====
  {
    name: 'קשר"ג', isAdmin: false, isCommander: false, sortOrder: 7,
    permissions: [
      { screen: "dashboard", level: "VIEW" }, { screen: "soldiers", level: "EDIT" },
      { screen: "dispatch", level: "EDIT" }, { screen: "certifications", level: "VIEW" },
      { screen: "stock", level: "EDIT" }, { screen: "catalog", level: "EDIT" },
      { screen: "signatures", level: "EDIT" }, { screen: "counts", level: "EDIT" },
      { screen: "gaps", level: "EDIT" }, { screen: "transfers", level: "EDIT" },
      { screen: "kits", level: "EDIT" }, { screen: "donations", level: "EDIT" },
      { screen: "reports", level: "VIEW" }, { screen: "armory_reports", level: "VIEW" },
    ],
  },
  {
    // שליש — גדודי, סמכויות מוגבלות
    name: "שליש", isAdmin: false, isCommander: false, sortOrder: 8,
    permissions: [
      { screen: "dashboard", level: "VIEW" }, { screen: "soldiers", level: "EDIT" },
      { screen: "roster", level: "EDIT" }, { screen: "attendance", level: "EDIT" }, { screen: "employment", level: "EDIT" },
      { screen: "dispatch", level: "EDIT" }, { screen: "certifications", level: "EDIT" }, { screen: "reports", level: "VIEW" },
      { screen: "armory_reports", level: "VIEW" },
    ],
  },
  {
    // רב — צופה בלבד
    name: "רב", isAdmin: false, isCommander: false, sortOrder: 9,
    permissions: [
      { screen: "dashboard", level: "VIEW" }, { screen: "soldiers", level: "VIEW" },
      { screen: "reports", level: "VIEW" },
    ],
  },

  // ===== קציני מקצוע =====
  {
    name: "ק.רכב", isAdmin: false, isCommander: false, sortOrder: 10,
    permissions: [
      { screen: "dashboard", level: "VIEW" }, { screen: "soldiers", level: "EDIT" },
      { screen: "dispatch", level: "EDIT" },
      { screen: "driving_licenses", level: "EDIT" }, { screen: "certifications", level: "VIEW" }, { screen: "maintenance", level: "EDIT" },
      { screen: "stock", level: "EDIT" }, { screen: "catalog", level: "EDIT" },
      { screen: "signatures", level: "EDIT" }, { screen: "counts", level: "EDIT" },
      { screen: "gaps", level: "EDIT" }, { screen: "transfers", level: "EDIT" },
      { screen: "reports", level: "VIEW" }, { screen: "armory_reports", level: "VIEW" },
    ],
  },
  {
    // קה"ד — קצין הדרכה: מקים קורסים, מקצה לפלוגות, מנהל הדרכות
    name: 'קה"ד', isAdmin: false, isCommander: false, sortOrder: 10,
    permissions: [
      { screen: "dashboard", level: "VIEW" }, { screen: "trainings", level: "EDIT" },
      { screen: "soldiers", level: "VIEW" }, { screen: "certifications", level: "VIEW" },
      { screen: "driving_licenses", level: "EDIT" }, { screen: "reports", level: "VIEW" },
    ],
  },
  {
    // ק.אג"ם — אחראי ציוד כללי
    name: 'ק.אג"ם', isAdmin: false, isCommander: false, sortOrder: 11,
    permissions: [
      { screen: "dashboard", level: "VIEW" }, { screen: "stock", level: "EDIT" },
      { screen: "catalog", level: "EDIT" }, { screen: "signatures", level: "EDIT" },
      { screen: "counts", level: "EDIT" }, { screen: "gaps", level: "EDIT" },
      { screen: "transfers", level: "EDIT" }, { screen: "kits", level: "EDIT" },
      { screen: "reports", level: "VIEW" },
    ],
  },
  {
    // מנהל מחסן — אחראי מחסן ספציפי
    name: "מנהל מחסן", isAdmin: false, isCommander: false, sortOrder: 12,
    permissions: [
      { screen: "dashboard", level: "VIEW" }, { screen: "stock", level: "EDIT" },
      { screen: "signatures", level: "EDIT" }, { screen: "counts", level: "EDIT" },
      { screen: "gaps", level: "EDIT" }, { screen: "transfers", level: "EDIT" },
      { screen: "reports", level: "VIEW" },
    ],
  },

  // ===== רספ"ים לפי תחום (להאצלה מ-/team) =====
  {
    // רס"פ מחסן — לוגיסטיקה פלוגתית (החתמות, ספירות, מסירות)
    name: AREA_ROLE_EQUIP, isAdmin: false, isCommander: false, sortOrder: 13,
    permissions: [
      { screen: "dashboard", level: "VIEW" }, { screen: "signatures", level: "EDIT" },
      { screen: "counts", level: "EDIT" }, { screen: "gaps", level: "EDIT" },
      { screen: "transfers", level: "EDIT" }, { screen: "stock", level: "VIEW" },
      { screen: "ymach", level: "EDIT" }, { screen: "donations", level: "EDIT" },
      { screen: "reports", level: "VIEW" },
    ],
  },
  {
    // רס"פ שלישות — כוח אדם פלוגתי (חיילים, נוכחות)
    name: AREA_ROLE_PERSONNEL, isAdmin: false, isCommander: false, sortOrder: 14,
    permissions: [
      { screen: "dashboard", level: "VIEW" }, { screen: "soldiers", level: "EDIT" },
      { screen: "attendance", level: "EDIT" }, { screen: "certifications", level: "VIEW" },
      { screen: "dispatch", level: "EDIT" }, { screen: "reports", level: "VIEW" },
    ],
  },
];

// ===================== תוויות (legacy, נשמר לשימוש מעברי) =====================

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: "אדמין-על",
  BATTALION_ADMIN: "מנהל מערכת",
  WAREHOUSE_MANAGER: "קצין מחסן",
  COMPANY_REP: 'רס"פ פלוגתי',
  VIEWER: "צופה",
  SHALISH: "שליש גדודי",
  MAGAD: 'מג"ד',
  SAMAGAD: 'סמג"ד',
};

export function capabilitiesOf(role: Role): Capability[] {
  return LEGACY_MATRIX[role] ?? [];
}

export const WAREHOUSE_TYPE_LABELS: Record<WarehouseType, string> = {
  EQUIPMENT: 'ציוד (קל"ג)',
  COMMS: 'תקשוב (קשר"ג)',
  AMMO: "חמידה / תחמושת (בונקר)",
  ARMORY: "ארמון",
  VEHICLES: "רכבים (קצין רכב)",
  MEDICAL: "רפואה",
  GENERAL: "כללי",
};

export const WAREHOUSE_TYPE_SHORT: Record<WarehouseType, string> = {
  EQUIPMENT: "ציוד",
  COMMS: "תקשוב",
  AMMO: "חמידה",
  ARMORY: "ארמון",
  VEHICLES: "רכבים",
  MEDICAL: "רפואה",
  GENERAL: "כללי",
};

export const WAREHOUSE_TYPE_ICON: Record<WarehouseType, string> = {
  EQUIPMENT: "🎒",
  COMMS: "📡",
  AMMO: "💥",
  ARMORY: "🔫",
  VEHICLES: "🚙",
  MEDICAL: "⚕️",
  GENERAL: "📦",
};

export const WAREHOUSE_MANAGER_TITLE: Record<WarehouseType, string> = {
  EQUIPMENT: 'קל"ג',
  COMMS: 'קשר"ג',
  AMMO: "אחראי בונקר",
  ARMORY: "אחראי ארמון",
  VEHICLES: "קצין רכב",
  MEDICAL: 'קרפ"ג',
  GENERAL: "אחראי כללי",
};
