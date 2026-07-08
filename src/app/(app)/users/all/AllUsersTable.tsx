"use client";

import { useState, useMemo, useEffect } from "react";
import { Card, Table, Th, Td, Badge, EmptyState } from "@/components/ui";
import { saveUser, regenerateInvite, toggleUser, clearRateLimits, deleteUser } from "../actions";

const HEB_MAP: Record<string, string> = {
  א:"a",ב:"b",ג:"g",ד:"d",ה:"h",ו:"v",ז:"z",ח:"ch",ט:"t",י:"y",
  כ:"k",ך:"k",ל:"l",מ:"m",ם:"m",נ:"n",ן:"n",ס:"s",ע:"a",פ:"p",
  ף:"f",צ:"tz",ץ:"tz",ק:"k",ר:"r",ש:"sh",ת:"t",
};
function transliterate(heb: string): string {
  let out = "";
  for (const ch of heb) out += HEB_MAP[ch] ?? (/[A-Za-z0-9._-]/.test(ch) ? ch : "");
  return out.toLowerCase();
}

type Role = "SUPER_ADMIN" | "BATTALION_ADMIN" | "WAREHOUSE_MANAGER" | "COMPANY_REP" | "VIEWER" | "SHALISH" | "MAGAD" | "SAMAGAD";
type User = {
  id: string;
  fullName: string;
  username: string;
  phone: string | null;
  title: string | null;
  role: Role;
  customRoleId: string | null;
  systemRoleId: string | null;
  roleLabel: string;
  holderId: string | null;
  holderName: string | null;
  holderKind: string | null;
  holderIds: string[];
  extraHolders: string[];
  squadIds: string[];
  soldierId: string | null;
  soldierFullName: string | null;
  soldierPN: string | null;
  active: boolean;
  passwordSet: boolean;
  inviteToken: string | null;
  canApproveWeapons?: boolean;
  createdAt: string;
};
type Holder = { id: string; name: string; kind: string };
type Squad = { id: string; name: string; companyId: string; companyName: string };
type CustomRole = { id: string; name: string; template: string };
type SystemRoleOpt = { id: string; name: string; isAdmin: boolean; isCommander: boolean; screens: string[] };
type SoldierOpt = { id: string; fullName: string; personalNumber: string | null; phone: string | null; companyName: string | null };

const ROLE_FILTER_OPTS: { v: Role; l: string }[] = [
  { v: "BATTALION_ADMIN", l: 'מפ״מ' },
  { v: "WAREHOUSE_MANAGER", l: "קצין מחסן" },
  { v: "COMPANY_REP", l: 'רס״פ' },
  { v: "SHALISH", l: "שליש" },
  { v: "MAGAD", l: 'מג"ד' },
  { v: "SAMAGAD", l: 'סמג"ד' },
  { v: "VIEWER", l: "צופה" },
];

const ROLE_OPTS = ["BATTALION_ADMIN", "WAREHOUSE_MANAGER", "COMPANY_REP", "SHALISH", "MAGAD", "SAMAGAD", "VIEWER"] as const;
const BUILTIN_LABELS: Record<string, string> = {
  BATTALION_ADMIN: 'מפ״מ (הכל)',
  WAREHOUSE_MANAGER: "קצין מחסן",
  COMPANY_REP: 'נציג פלוגה (רס"פ)',
  SHALISH: "שליש גדודי",
  MAGAD: 'מג"ד',
  SAMAGAD: 'סמג"ד',
  VIEWER: "צופה (קריאה בלבד)",
};

const ROLE_SCREENS: Record<string, string> = {
  'מנהל מערכת': `🏪 מחסנים — ניהול מחסני הגדוד, מלאי, מידוף
📋 מלאי — כל הפריטים (סריאליים וכמותיים)
✍️ החתמות ומסירות — החתמת ציוד, זיכוי, מעברים
🔢 ספירות — תכנון וביצוע ספירות מלאי
⚠️ פערים — מעקב חוסרים
👤 חיילים — כל הפלוגות, הסמכות, בקשות סיפוח
🚗 שבצ"ק — שיבוץ רכבים, לוז פלוגתי
📈 דוחות — מצב ציוד, כשירות רכבים, היסטוריה
⚙️ הגדרות — משתמשים, פלוגות, הרשאות`,
  'מפ"מ': `🏪 מחסנים — ניהול מחסני הגדוד, מלאי, מידוף
📋 מלאי — כל הפריטים (סריאליים וכמותיים)
✍️ החתמות ומסירות — החתמת ציוד, זיכוי, מעברים
🔢 ספירות — תכנון וביצוע ספירות מלאי
⚠️ פערים — מעקב חוסרים
👤 חיילים — כל הפלוגות, הסמכות, בקשות סיפוח
🚗 שבצ"ק — שיבוץ רכבים, לוז פלוגתי
📈 דוחות — מצב ציוד, כשירות רכבים, היסטוריה
⚙️ הגדרות — משתמשים, פלוגות, הרשאות`,
  'קשר"ג': `🏪 מחסנים — ניהול המחסן, מידוף, סריקה
📋 מלאי — כל הפריטים במחסן
✍️ החתמות ומסירות — החתמה, זיכוי, מעברים
🔢 ספירות — תכנון ספירות, ביצוע, השוואה
⚠️ פערים — מעקב חוסרים
🏷️ קטלוג — הגדרת פריטים וקטגוריות
📦 ערכות — ערכות ציוד מוכנות
👤 חיילים — צפייה בחיילי הפלוגות
🚗 שבצ"ק — שיבוץ רכבים
📈 דוחות — מלאי ומצב ציוד`,
  'ק.רכב': `🚗 שבצ"ק — שיבוץ רכבים יומי, תבניות קבועות
🪪 רישיונות — הרשאות נהיגה ותוקף רישיונות
🔧 תחזוקה — מעקב טסטים, קילומטראז', טיפולים
📋 מלאי — ציוד רכב
✍️ החתמות ומסירות — החתמת ציוד רכב
🔢 ספירות — ספירת ציוד רכב
📈 דוחות — כשירות רכבים, זכאות`,
  'ק.אג"ם': `📋 מלאי — ניהול ציוד כללי (אג"ם)
🏷️ קטלוג — הגדרת פריטים וקטגוריות
✍️ החתמות ומסירות — החתמה וזיכוי ציוד
🔢 ספירות — ספירות מלאי
⚠️ פערים — מעקב חוסרים
📦 ערכות — ניהול ערכות ציוד
📈 דוחות — מצב ציוד`,
  'מג"ד': `📊 דשבורד — מצב הגדוד במבט אחד
👤 חיילים — כל חיילי הגדוד
🔫 אישור נשק — אישור/דחיית חיילים
🚗 שבצ"ק — שיבוץ רכבים
📈 דוחות — מצב ציוד, כשירות רכבים, היסטוריה`,
  'סמג"ד': `📊 דשבורד — מצב הגדוד במבט אחד
👤 חיילים — כל חיילי הגדוד
🔫 אישור נשק — אישור/דחיית חיילים
🚗 שבצ"ק — שיבוץ רכבים
📈 דוחות — מצב ציוד, כשירות רכבים, היסטוריה`,
  'מפ': `📊 דשבורד — מצב הפלוגה
👤 חיילים — ניהול חיילי הפלוגה, הסמכות, בקשות סיפוח
📋 נוכחות — דיווח נוכחות יומי
🚗 שבצ"ק — שיבוץ רכבים, לוז פלוגתי
✍️ החתמות ומסירות — החתמה, זיכוי, מעברים
📦 המלאי שלי — כל הציוד החתום על הפלוגה
📍 מיקומי ציוד — מיקום פיזי של פריטים
🏗️ ימ"ח — מחסן פלוגתי, ארגזים מבצעיים
📈 דוחות — מצב ציוד, כשירות רכבים`,
  'שליש': `📊 דשבורד — מצב הגדוד
🪖 שלישות — ניהול חיילים, שיבוצים, תפקידים
👤 חיילים — ניהול חיילי הגדוד
🚗 שבצ"ק — שיבוץ רכבים
📋 הסמכות — ניהול הסמכות חיילים
📈 דוחות — זכאות נשק`,
  'מפקד מחלקה': `📊 דשבורד — מצב הפלוגה
👤 חיילים — צפייה בחיילי הפלוגה
📋 נוכחות — דיווח נוכחות המחלקה
🚗 שבצ"ק — צפייה בשיבוץ רכבים`,
  'מפלג': `📊 דשבורד — מצב הפלוגה
👤 חיילים — צפייה בחיילי הפלוגה
📋 נוכחות — צפייה בנוכחות
🚗 שבצ"ק — צפייה בשיבוץ רכבים`,
  'רב': `📊 דשבורד — מצב הגדוד
👤 חיילים — צפייה בחיילי הגדוד
📈 דוחות — דוחות מצב ציוד`,
  'מנהל מחסן': `📋 מלאי — ניהול ציוד המחסן
✍️ החתמות ומסירות — החתמה וזיכוי ציוד
🔢 ספירות — ספירות מלאי
⚠️ פערים — מעקב חוסרים
📈 דוחות — מצב ציוד`,
};

function buildOnboardingMsg(user: User, battalionName: string, battalionCode: string, baseUrl: string): string {
  const screens = ROLE_SCREENS[user.roleLabel] ?? ROLE_SCREENS['רב'] ?? '';
  const pending = !user.passwordSet && user.inviteToken;
  const link = pending ? `${baseUrl}/invite/${user.inviteToken}` : `${baseUrl}/login`;
  const loginInfo = pending
    ? `🔗 קישור להגדרת סיסמה: ${link}\n⚠️ הקישור חד-פעמי — פעיל עד הגדרת סיסמה.`
    : `🔗 כניסה: ${baseUrl}/login?b=${battalionCode}`;
  const allHolders = [user.holderName, ...user.extraHolders].filter(Boolean);
  const holderLine = allHolders.length ? ` (${allHolders.join(", ")})` : "";
  return `שלום ${user.fullName},

${battalionName} עבר לניהול התעסוקה הקרובה דרך מערכת PALMY — מערכת לניהול התעסוקה, ההכנות והתפעול השוטף של הגדוד.

אתה מוגדר כ${user.roleLabel}${holderLine}. מה יש לך במערכת:
${screens}

${loginInfo}
👤 שם משתמש: ${user.username}
📋 קוד גדוד: ${battalionCode}

📌 סיסמה: 12+ תווים, אות גדולה+קטנה, ספרה, תו מיוחד.`;
}

function waLink(phone: string | null, text: string): string {
  const encoded = encodeURIComponent(text);
  return phone
    ? `https://wa.me/${phone.replace(/\D/g, "").replace(/^0/, "972")}?text=${encoded}`
    : `https://wa.me/?text=${encoded}`;
}

function InviteCell({ user, baseUrl, battalionName, battalionCode }: { user: User; baseUrl: string; battalionName: string; battalionCode: string }) {
  const [copied, setCopied] = useState(false);
  const onboardingMsg = buildOnboardingMsg(user, battalionName, battalionCode, baseUrl);
  const onboardingWa = waLink(user.phone, onboardingMsg);

  if (user.passwordSet) {
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        <Badge className="bg-emerald-100 text-emerald-800 text-[10px]">✓ פעיל</Badge>
        <a href={onboardingWa} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">📩 שלח הסבר</a>
        <form action={regenerateInvite}>
          <input type="hidden" name="id" value={user.id} />
          <button className="text-xs text-slate-500 hover:text-slate-800 underline">שלח קישור חדש</button>
        </form>
      </div>
    );
  }
  const link = `${baseUrl}/invite/${user.inviteToken}`;
  const inviteWa = waLink(user.phone, `הוזמנת למערכת ${battalionName}.\n\nהקישור להגדרת סיסמה:\n${link}\n\n👤 שם משתמש: ${user.username}\n📋 קוד גדוד: ${battalionCode}\n\n⚠️ קישור חד-פעמי. סיסמה: 12+ תווים, אות גדולה+קטנה, ספרה, תו מיוחד.`);
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <Badge className="bg-amber-100 text-amber-800 text-[10px]">⏳ ממתין</Badge>
      <button onClick={() => { navigator.clipboard?.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
        className="text-xs text-slate-500 hover:text-slate-800">
        {copied ? "✓ הועתק" : "📋 העתק"}
      </button>
      <a href={inviteWa} target="_blank" rel="noreferrer" className="text-xs text-emerald-600 hover:underline">🔑 סיסמה</a>
      <a href={onboardingWa} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">📩 הסבר</a>
      <form action={regenerateInvite}>
        <input type="hidden" name="id" value={user.id} />
        <button className="text-xs text-blue-600 hover:underline">🔄 חדש</button>
      </form>
    </div>
  );
}

const WAREHOUSE_SCREENS = new Set(["stock", "catalog", "signatures", "counts", "gaps", "transfers", "kits", "donations"]);
const COMPANY_SCREENS = new Set(["soldiers", "attendance", "dispatch", "armory"]);

function SoldierPicker({ soldiers, value, onChange }: { soldiers: SoldierOpt[]; value: string; onChange: (id: string) => void }) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const selected = soldiers.find((s) => s.id === value);
  const filtered = search.trim()
    ? soldiers.filter((s) => {
        const q = search.trim().toLowerCase();
        return s.fullName.toLowerCase().includes(q)
          || (s.personalNumber ?? "").includes(q)
          || (s.phone ?? "").includes(q);
      }).slice(0, 20)
    : soldiers.slice(0, 20);

  return (
    <div className="relative">
      {selected ? (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm">
          <span className="flex-1">🔗 {selected.fullName}{selected.personalNumber ? ` (${selected.personalNumber})` : ""}{selected.companyName ? ` — ${selected.companyName}` : ""}</span>
          <button type="button" onClick={() => { onChange(""); setSearch(""); }} className="text-slate-400 hover:text-rose-600">✕</button>
        </div>
      ) : (
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="חיפוש חייל — שם, מ.א., טלפון..."
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      )}
      {open && !selected && (
        <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="p-3 text-sm text-slate-500 text-center">
              לא נמצא חייל.{" "}
              <a href="/soldiers" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">הוסף חייל חדש ↗</a>
            </div>
          ) : (
            filtered.map((s) => (
              <button key={s.id} type="button"
                onClick={() => { onChange(s.id); setOpen(false); setSearch(""); }}
                className="w-full text-right px-3 py-2 text-sm hover:bg-blue-50 border-b border-slate-100 last:border-0">
                <span className="font-medium">{s.fullName}</span>
                {s.personalNumber && <span className="text-slate-400 mr-2 font-mono text-xs">{s.personalNumber}</span>}
                {s.companyName && <span className="text-slate-400 mr-2 text-xs">({s.companyName})</span>}
              </button>
            ))
          )}
          <button type="button" onClick={() => setOpen(false)}
            className="w-full text-center px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-50 border-t">סגור</button>
        </div>
      )}
    </div>
  );
}

function UserFormDialog({ user, holders, squads, customRoles, systemRoles, soldiers, brigade, battalionCode, onClose }: {
  user: User | null;
  holders: Holder[];
  squads: Squad[];
  customRoles: CustomRole[];
  systemRoles: SystemRoleOpt[];
  soldiers: SoldierOpt[];
  brigade: string;
  battalionCode: string;
  onClose: () => void;
}) {
  const isNew = !user;
  const [role, setRole] = useState<string>(user?.customRoleId ? `custom:${user.customRoleId}` : user?.role ?? "VIEWER");
  const [selectedSystemRoleId, setSelectedSystemRoleId] = useState<string>(user?.systemRoleId ?? "");

  const existingWarehouseIds = user ? user.holderIds.filter((id) => holders.find((h) => h.id === id && h.kind === "WAREHOUSE")) : [];
  const existingCompanyId = user?.holderId && holders.find((h) => h.id === user.holderId && h.kind === "COMPANY") ? user.holderId
    : user ? user.holderIds.find((id) => holders.find((h) => h.id === id && h.kind === "COMPANY")) ?? null : null;

  const [selectedWarehouseIds, setSelectedWarehouseIds] = useState<Set<string>>(new Set(existingWarehouseIds));
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>(existingCompanyId ?? "");
  const [selectedSquadIds, setSelectedSquadIds] = useState<Set<string>>(new Set(user?.squadIds ?? []));
  const [username, setUsername] = useState(user?.username ?? "");
  const [fullName, setFullName] = useState(user?.fullName ?? "");
  const [selectedSoldierId, setSelectedSoldierId] = useState(user?.soldierId ?? "");
  const [check, setCheck] = useState<{ available?: boolean; taken?: boolean; recommended?: string | null }>({});
  const [checking, setChecking] = useState(false);

  const handleSoldierChange = (id: string) => {
    setSelectedSoldierId(id);
    if (id) {
      const s = soldiers.find((s) => s.id === id);
      if (s) {
        setFullName(s.fullName);
        if (s.phone) {
          const phoneInput = document.querySelector<HTMLInputElement>('input[name="phone"]');
          if (phoneInput && !phoneInput.value) phoneInput.value = s.phone;
        }
      }
    }
  };

  const selectedSR = systemRoles.find((r) => r.id === selectedSystemRoleId);

  const hasWarehouseScreens = selectedSR ? selectedSR.screens.some((s) => WAREHOUSE_SCREENS.has(s)) : false;
  const hasCompanyScreens = selectedSR ? selectedSR.isCommander || selectedSR.screens.some((s) => COMPANY_SCREENS.has(s)) : false;

  const effectiveTemplate = selectedSR
    ? (selectedSR.isAdmin ? "BATTALION_ADMIN"
      : selectedSR.isCommander ? "COMPANY_REP"
      : hasWarehouseScreens && !hasCompanyScreens ? "WAREHOUSE_MANAGER"
      : hasCompanyScreens && !hasWarehouseScreens ? "COMPANY_REP"
      : hasWarehouseScreens && hasCompanyScreens ? "DUAL"
      : "VIEWER")
    : role.startsWith("custom:")
      ? customRoles.find((c) => c.id === role.slice(7))?.template ?? "VIEWER"
      : role;

  const warehouses = holders.filter((h) => h.kind === "WAREHOUSE");
  const companies = holders.filter((h) => h.kind === "COMPANY");

  // שיוך גמיש: כל תפקיד (למעט אדמין, שרואה הכל) יכול לקבל גם מחסנים וגם פלוגה/מחלקות בכל שילוב —
  // כך שאפשר לסמן למפלג/רס"פ/שליש כמה מחסנים בדיוק כמו לקצין מחסן.
  const isAdminTemplate = effectiveTemplate === "BATTALION_ADMIN";
  const showWarehousePicker = !isAdminTemplate;
  const showCompanyPicker = !isAdminTemplate;

  const relevantSquads = selectedCompanyId
    ? squads.filter((s) => s.companyId === selectedCompanyId)
    : squads;

  const squadsByCompany = useMemo(() => {
    const map = new Map<string, { companyName: string; squads: Squad[] }>();
    for (const s of relevantSquads) {
      const entry = map.get(s.companyId) ?? { companyName: s.companyName, squads: [] };
      entry.squads.push(s);
      map.set(s.companyId, entry);
    }
    return [...map.values()];
  }, [relevantSquads]);

  useEffect(() => {
    if (!isNew) return;
    if (!fullName.trim()) return;
    const parts = fullName.trim().split(/\s+/);
    const first = transliterate(parts[0] ?? "");
    const last = transliterate(parts[parts.length - 1] ?? "");
    const slug = parts.length > 1 && last ? `${first}${last}` : first;
    if (!slug) return;
    const suffix = brigade || battalionCode;
    setUsername(suffix ? `${slug}.${suffix}` : slug);
  }, [fullName, isNew, brigade, battalionCode]);

  useEffect(() => {
    if (!isNew) return;
    const u = username.trim().toLowerCase();
    if (!u) { setCheck({}); return; }
    setChecking(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/users/check-username?u=${encodeURIComponent(u)}`);
        setCheck(await res.json());
      } catch { setCheck({}); }
      finally { setChecking(false); }
    }, 350);
    return () => clearTimeout(t);
  }, [username, isNew]);

  const toggleWarehouse = (id: string) => {
    const next = new Set(selectedWarehouseIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedWarehouseIds(next);
  };

  const toggleSquad = (id: string) => {
    const next = new Set(selectedSquadIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedSquadIds(next);
  };

  const statusBadge = !isNew ? null
    : !username ? null
    : checking ? <span className="text-xs text-slate-400">בודק...</span>
    : check.available ? <span className="text-xs text-emerald-600">✓ זמין</span>
    : check.taken ? (
        <span className="text-xs text-rose-600">
          תפוס
          {check.recommended && (
            <button type="button" onClick={() => setUsername(check.recommended!)}
              className="mr-1 underline">השתמש ב-{check.recommended}</button>
          )}
        </span>
      ) : null;

  const effectiveRole = effectiveTemplate === "DUAL"
    ? (selectedWarehouseIds.size > 0 ? "WAREHOUSE_MANAGER" : selectedCompanyId ? "COMPANY_REP" : "VIEWER")
    : effectiveTemplate === "BATTALION_ADMIN" ? "BATTALION_ADMIN"
    : effectiveTemplate === "WAREHOUSE_MANAGER" ? "WAREHOUSE_MANAGER"
    : effectiveTemplate === "COMPANY_REP" ? "COMPANY_REP"
    : role.startsWith("custom:") ? role : "VIEWER";

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-slate-200">
          <h3 className="font-bold text-slate-800">{isNew ? "הוספת משתמש חדש" : `עריכת משתמש — ${user.fullName}`}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">✕</button>
        </div>
        <form action={async (fd) => { await saveUser(fd); onClose(); }} className="p-5 space-y-4">
          {user && <input type="hidden" name="id" value={user.id} />}
          {!isNew && <input type="hidden" name="username" value={user.username} />}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">שם מלא</label>
              <input name="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} required
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">תואר / תפקיד</label>
              <input name="title" defaultValue={user?.title ?? ""} placeholder="מפ״מ, קשר״ג, רס״פ..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">טלפון</label>
              <input name="phone" defaultValue={user?.phone ?? ""} placeholder="05X-XXXXXXX"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">שם משתמש {statusBadge}</label>
              {isNew ? (
                <input name="username" value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^\w.-]/g, ""))}
                  required placeholder="username"
                  className={`w-full rounded-lg border px-3 py-2 text-sm font-mono ${check.taken ? "border-rose-300 bg-rose-50" : check.available ? "border-emerald-300 bg-emerald-50" : "border-slate-300"}`} />
              ) : (
                <div className="w-full rounded-lg bg-slate-100 border border-slate-200 px-3 py-2 text-sm text-slate-500 font-mono">@{user.username}</div>
              )}
            </div>
          </div>

          {/* 🔫 הרשאה פר-משתמש: אישור חיילים לנשק */}
          <input type="hidden" name="canApproveWeaponsField" value="1" />
          <label className="flex items-center gap-2 text-sm bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 cursor-pointer">
            <input type="checkbox" name="canApproveWeapons" defaultChecked={!!user?.canApproveWeapons} className="w-4 h-4 accent-rose-600" />
            <span>🔫 <b>יכול לאשר חיילים לנשק</b> — רק אם מסומן, המשתמש יראה את המסך ויוכל לאשר.</span>
          </label>

          <div>
            <label className="block text-xs text-slate-500 mb-1">🔗 קישור לחייל (אופציונלי)</label>
            <SoldierPicker soldiers={soldiers} value={selectedSoldierId} onChange={handleSoldierChange} />
            <input type="hidden" name="soldierId" value={selectedSoldierId} />
            <p className="text-[11px] text-slate-400 mt-1">
              בחר חייל קיים. לא מצאת?{" "}
              <a href="/roster" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">הקם חייל חדש ↗</a>
              {" "}וחזור לבחור אותו.
            </p>
          </div>

          {/* Role — SystemRole is primary when roles exist */}
          {systemRoles.length > 0 ? (
            <div>
              <label className="block text-xs text-slate-500 mb-1">תפקיד</label>
              <select name="systemRoleId" value={selectedSystemRoleId} onChange={(e) => {
                setSelectedSystemRoleId(e.target.value);
                const sr = systemRoles.find((r) => r.id === e.target.value);
                if (sr) {
                  setRole(sr.isAdmin ? "BATTALION_ADMIN" : sr.isCommander ? "COMPANY_REP" : "VIEWER");
                }
                setSelectedWarehouseIds(new Set());
                setSelectedCompanyId("");
                setSelectedSquadIds(new Set());
              }}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                <option value="">— בחר תפקיד —</option>
                {systemRoles.map((sr) => <option key={sr.id} value={sr.id}>{sr.name}</option>)}
              </select>
              <input type="hidden" name="role" value={effectiveRole} />
              {selectedSR && (
                <p className="text-[11px] mt-1 text-slate-500">
                  {selectedSR.isAdmin ? "🔑 מנהל — גישה מלאה לכל הגדוד" : selectedSR.isCommander ? "🪖 מפקד — משויך לפלוגה" : `📋 ${selectedSR.screens.length} מסכים`}
                  {" · "}
                  <a href="/roles" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">ניהול תפקידים ↗</a>
                </p>
              )}
            </div>
          ) : (
            <div>
              <label className="block text-xs text-slate-500 mb-1">תפקיד במערכת</label>
              <select name="role" value={role} onChange={(e) => { setRole(e.target.value); setSelectedWarehouseIds(new Set()); setSelectedCompanyId(""); setSelectedSquadIds(new Set()); }}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                <optgroup label="תפקידים בסיסיים">
                  {ROLE_OPTS.map((r) => <option key={r} value={r}>{BUILTIN_LABELS[r]}</option>)}
                </optgroup>
                {customRoles.length > 0 && (
                  <optgroup label="תפקידים מותאמים">
                    {customRoles.map((c) => <option key={c.id} value={`custom:${c.id}`}>{c.name}</option>)}
                  </optgroup>
                )}
              </select>
              <p className="text-[11px] text-slate-400 mt-1">
                💡 הגדר תפקידים עם הרשאות מסכים ב<a href="/roles" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">הרשאות ותפקידים ↗</a>
              </p>
            </div>
          )}

          {/* Warehouse assignment — auto-shown when role has warehouse screens */}
          {showWarehousePicker && warehouses.length > 0 && (
            <div>
              <label className="block text-xs text-slate-500 mb-1">🏪 מחסנים</label>
              <div className="rounded-lg border border-slate-300 p-2 space-y-1 max-h-32 overflow-y-auto">
                {warehouses.map((h) => (
                  <label key={h.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="holderId" value={h.id}
                      checked={selectedWarehouseIds.has(h.id)}
                      onChange={() => toggleWarehouse(h.id)}
                      className="w-4 h-4" /> {h.name}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Company assignment — auto-shown when role has company screens */}
          {showCompanyPicker && companies.length > 0 && (
            <div>
              <label className="block text-xs text-slate-500 mb-1">🪖 פלוגה{effectiveTemplate === "VIEWER" ? " (אופציונלי)" : ""}</label>
              <select name="companyHolderId" value={selectedCompanyId}
                onChange={(e) => { setSelectedCompanyId(e.target.value); setSelectedSquadIds(new Set()); }}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                <option value="">{effectiveTemplate === "VIEWER" ? "כל הגדוד" : "— בחר פלוגה —"}</option>
                {companies.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
            </div>
          )}

          {/* Squad assignment */}
          {squads.length > 0 && (showCompanyPicker || selectedSR?.isAdmin) && (
            <div>
              <label className="block text-xs text-slate-500 mb-1">
                מחלקות משויכות
                <span className="text-slate-400 mr-1">(ריק = רואה הכל)</span>
              </label>
              <div className="rounded-lg border border-slate-300 p-2 space-y-2 max-h-48 overflow-y-auto">
                {squadsByCompany.map(({ companyName, squads: compSquads }) => (
                  <div key={companyName}>
                    <div className="text-[11px] text-slate-400 font-medium mb-1">{companyName}</div>
                    {compSquads.map((sq) => (
                      <label key={sq.id} className="flex items-center gap-2 text-sm mr-2">
                        <input type="checkbox" name="squadId" value={sq.id}
                          checked={selectedSquadIds.has(sq.id)}
                          onChange={() => toggleSquad(sq.id)}
                          className="w-4 h-4" /> {sq.name}
                      </label>
                    ))}
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                שיוך למחלקות מסנן אוטומטית את החיילים שהמשתמש רואה (נוכחות, החתמות וכו׳).
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">ביטול</button>
            <button disabled={isNew && check.taken && !check.recommended}
              className="bg-slate-800 text-white rounded-lg px-4 py-2 text-sm hover:bg-slate-900 disabled:opacity-50">
              {isNew ? "צור והזמן" : "שמירה"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function AllUsersTable({ users, baseUrl, initialQ, initialRole, initialStatus, holders, squads, customRoles, systemRoles, soldiers, brigade, battalionCode, battalionName }: {
  users: User[]; baseUrl: string; initialQ: string; initialRole: string; initialStatus: string;
  holders: Holder[]; squads: Squad[]; customRoles: CustomRole[]; systemRoles: SystemRoleOpt[]; soldiers: SoldierOpt[]; brigade: string; battalionCode: string; battalionName: string;
}) {
  const [q, setQ] = useState(initialQ);
  const [role, setRole] = useState(initialRole);
  const [status, setStatus] = useState(initialStatus);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const stats = useMemo(() => ({
    total: users.length,
    active: users.filter((u) => u.active && u.passwordSet).length,
    pending: users.filter((u) => !u.passwordSet).length,
    inactive: users.filter((u) => !u.active).length,
  }), [users]);

  const filtered = useMemo(() => {
    return users.filter((u) => {
      if (role && u.role !== role) return false;
      if (status === "active" && (!u.active || !u.passwordSet)) return false;
      if (status === "pending" && u.passwordSet) return false;
      if (status === "inactive" && u.active) return false;
      if (q.trim()) {
        const qq = q.trim().toLowerCase();
        return u.fullName.toLowerCase().includes(qq)
          || u.username.toLowerCase().includes(qq)
          || (u.phone ?? "").includes(qq)
          || (u.title ?? "").toLowerCase().includes(qq)
          || (u.holderName ?? "").toLowerCase().includes(qq);
      }
      return true;
    });
  }, [users, q, role, status]);

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Card className="p-3"><div className="text-xs text-slate-500">סה״כ משתמשים</div><div className="text-2xl font-bold mt-1">{stats.total}</div></Card>
        <Card className="p-3"><div className="text-xs text-slate-500">פעילים</div><div className="text-2xl font-bold mt-1 text-emerald-600">{stats.active}</div></Card>
        <Card className="p-3"><div className="text-xs text-slate-500">ממתינים</div><div className="text-2xl font-bold mt-1 text-amber-600">{stats.pending}</div></Card>
        <Card className="p-3"><div className="text-xs text-slate-500">מושבתים</div><div className="text-2xl font-bold mt-1 text-slate-400">{stats.inactive}</div></Card>
      </div>

      <Card className="p-3 mb-3">
        <div className="flex gap-2 flex-wrap items-end">
          <div className="flex-1 min-w-40">
            <label className="block text-xs text-slate-500 mb-1">חיפוש</label>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="שם, משתמש, טלפון, שיוך..."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">תפקיד</label>
            <select value={role} onChange={(e) => setRole(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="">הכל</option>
              {ROLE_FILTER_OPTS.map((r) => <option key={r.v} value={r.v}>{r.l}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">סטטוס</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="">הכל</option>
              <option value="active">פעילים</option>
              <option value="pending">ממתינים להזמנה</option>
              <option value="inactive">מושבתים</option>
            </select>
          </div>
          <button type="button" onClick={async () => {
              const names = users.filter(u => u.active).map(u => u.fullName + " (" + u.username + ")");
              const choice = prompt("בחר משתמש לפתיחת חסימה:\n\nהכנס שם משתמש (username), או השאר ריק לפתיחת כל החסימות.\n\nמשתמשים פעילים:\n" + names.join("\n"));
              if (choice === null) return;
              const fd = new FormData();
              if (choice.trim()) fd.set("username", choice.trim());
              await clearRateLimits(fd);
              alert(choice.trim() ? `✅ חסימות הכניסה של ${choice.trim()} נמחקו` : "✅ כל חסימות הכניסה נמחקו");
            }}
            className="rounded-lg border border-amber-300 bg-amber-50 text-amber-800 px-3 py-2 text-sm hover:bg-amber-100 whitespace-nowrap"
            title="פתיחת חסימת כניסה למשתמש ספציפי או לכולם">
            🔓 פתח חסימות
          </button>
          <button onClick={() => setShowCreate(true)}
            className="bg-slate-800 text-white rounded-lg px-4 py-2 text-sm hover:bg-slate-900 whitespace-nowrap">
            + הוסף משתמש
          </button>
          <span className="text-xs text-slate-500 self-end pb-2">{filtered.length} משתמשים</span>
        </div>
      </Card>

      <Card>
        {filtered.length === 0 ? (
          <EmptyState>לא נמצאו משתמשים</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr><Th>שם</Th><Th>תואר</Th><Th>הרשאות</Th><Th>שיוך</Th><Th>מחלקות</Th><Th>סטטוס</Th><Th></Th></tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id} className={u.active ? "" : "opacity-50"}>
                  <Td>
                    <div className="font-medium">{u.fullName}</div>
                    <div className="text-xs text-slate-400 font-mono">@{u.username}</div>
                    {u.soldierFullName && <div className="text-[11px] text-purple-600">🔗 {u.soldierFullName}{u.soldierPN ? ` (${u.soldierPN})` : ""}</div>}
                  </Td>
                  <Td className="text-xs">{u.title ?? <span className="text-slate-300">—</span>}</Td>
                  <Td><Badge className="bg-slate-200 text-slate-700 text-[10px]">🔑 {u.roleLabel}</Badge></Td>
                  <Td className="text-xs">
                    {u.holderName ?? <span className="text-slate-300">—</span>}
                    {u.extraHolders.length > 0 && <span className="text-slate-400"> +{u.extraHolders.length}</span>}
                  </Td>
                  <Td className="text-xs">
                    {u.squadIds.length > 0
                      ? <span className="text-blue-600">{u.squadIds.length} מחלקות</span>
                      : <span className="text-slate-300">—</span>}
                  </Td>
                  <Td><InviteCell user={u} baseUrl={baseUrl} battalionName={battalionName} battalionCode={battalionCode} /></Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setEditingUser(u)} className="text-xs text-blue-600 hover:text-blue-800">✏️ עריכה</button>
                      <form action={toggleUser}>
                        <input type="hidden" name="id" value={u.id} />
                        <button className="text-xs text-rose-500 hover:text-rose-700">{u.active ? "השבת" : "הפעל"}</button>
                      </form>
                      <button onClick={async () => {
                        if (!confirm(`למחוק את המשתמש ${u.fullName}?`)) return;
                        if (!confirm(`בטוח? פעולה זו לא ניתנת לביטול.`)) return;
                        const fd = new FormData(); fd.set("id", u.id);
                        try { await deleteUser(fd); } catch (e) { alert(e instanceof Error ? e.message : "שגיאה"); }
                      }} className="text-xs text-rose-500 hover:text-rose-700">🗑️</button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {editingUser && (
        <UserFormDialog
          user={editingUser}
          holders={holders}
          squads={squads}
          customRoles={customRoles}
          systemRoles={systemRoles}
          soldiers={soldiers}
          brigade={brigade}
          battalionCode={battalionCode}
          onClose={() => setEditingUser(null)}
        />
      )}

      {showCreate && (
        <UserFormDialog
          user={null}
          holders={holders}
          squads={squads}
          customRoles={customRoles}
          systemRoles={systemRoles}
          soldiers={soldiers}
          brigade={brigade}
          battalionCode={battalionCode}
          onClose={() => setShowCreate(false)}
        />
      )}
    </>
  );
}
