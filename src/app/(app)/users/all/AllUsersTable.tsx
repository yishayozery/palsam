"use client";

import { useState, useMemo } from "react";
import { Card, Table, Th, Td, Badge, EmptyState } from "@/components/ui";
import { saveUser, regenerateInvite, toggleUser } from "../actions";

type Role = "SUPER_ADMIN" | "BATTALION_ADMIN" | "WAREHOUSE_MANAGER" | "COMPANY_REP" | "VIEWER" | "SHALISH" | "MAGAD" | "SAMAGAD";
type User = {
  id: string;
  fullName: string;
  username: string;
  phone: string | null;
  title: string | null;
  role: Role;
  customRoleId: string | null;
  roleLabel: string;
  holderId: string | null;
  holderName: string | null;
  holderKind: string | null;
  holderIds: string[];
  extraHolders: string[];
  squadIds: string[];
  soldierFullName: string | null;
  soldierPN: string | null;
  active: boolean;
  passwordSet: boolean;
  inviteToken: string | null;
  createdAt: string;
};
type Holder = { id: string; name: string; kind: string };
type Squad = { id: string; name: string; companyId: string; companyName: string };
type CustomRole = { id: string; name: string; template: string };

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

function InviteCell({ user, baseUrl }: { user: User; baseUrl: string }) {
  const [copied, setCopied] = useState(false);
  if (user.passwordSet) {
    return (
      <div className="flex items-center gap-2">
        <Badge className="bg-emerald-100 text-emerald-800 text-[10px]">✓ פעיל</Badge>
        <form action={regenerateInvite}>
          <input type="hidden" name="id" value={user.id} />
          <button className="text-xs text-slate-500 hover:text-slate-800 underline">שלח קישור חדש</button>
        </form>
      </div>
    );
  }
  const link = `${baseUrl}/invite/${user.inviteToken}`;
  const wa = user.phone
    ? `https://wa.me/${user.phone.replace(/\D/g, "").replace(/^0/, "972")}?text=${encodeURIComponent(`הוזמנת למערכת PALSAM. הקישור להגדרת סיסמה: ${link}`)}`
    : `https://wa.me/?text=${encodeURIComponent(`הוזמנת למערכת PALSAM. הקישור להגדרת סיסמה: ${link}`)}`;
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <Badge className="bg-amber-100 text-amber-800 text-[10px]">⏳ ממתין</Badge>
      <button onClick={() => { navigator.clipboard?.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
        className="text-xs text-slate-500 hover:text-slate-800">
        {copied ? "✓ הועתק" : "📋 העתק"}
      </button>
      <a href={wa} target="_blank" rel="noreferrer" className="text-xs text-emerald-600 hover:underline">📱 WhatsApp</a>
      <form action={regenerateInvite}>
        <input type="hidden" name="id" value={user.id} />
        <button className="text-xs text-blue-600 hover:underline">🔄 חדש</button>
      </form>
    </div>
  );
}

function EditDialog({ user, holders, squads, customRoles, onClose }: {
  user: User; holders: Holder[]; squads: Squad[]; customRoles: CustomRole[]; onClose: () => void;
}) {
  const [role, setRole] = useState<string>(user.customRoleId ? `custom:${user.customRoleId}` : user.role);
  const [selectedHolderIds, setSelectedHolderIds] = useState<Set<string>>(
    new Set(user.holderIds.length > 0 ? user.holderIds : (user.holderId ? [user.holderId] : []))
  );
  const [selectedSquadIds, setSelectedSquadIds] = useState<Set<string>>(new Set(user.squadIds));

  const effectiveTemplate = role.startsWith("custom:")
    ? customRoles.find((c) => c.id === role.slice(7))?.template ?? "VIEWER"
    : role;

  const warehouses = holders.filter((h) => h.kind === "WAREHOUSE");
  const companies = holders.filter((h) => h.kind === "COMPANY");

  const showHolderPicker = ["WAREHOUSE_MANAGER", "COMPANY_REP", "VIEWER"].includes(effectiveTemplate);
  const isMultiHolder = effectiveTemplate === "WAREHOUSE_MANAGER";
  const holderOpts = isMultiHolder ? warehouses : companies;
  const holderLabel = isMultiHolder ? "מחסנים" : effectiveTemplate === "COMPANY_REP" ? "פלוגה" : "פלוגה (אופציונלי)";

  // Squad filter: for COMPANY_REP, show only squads of the selected company.
  // For others (WAREHOUSE_MANAGER, VIEWER, MAGAD, etc.), show all squads grouped by company.
  const selectedCompanyId = !isMultiHolder && selectedHolderIds.size === 1 ? [...selectedHolderIds][0] : null;
  const relevantSquads = effectiveTemplate === "COMPANY_REP" && selectedCompanyId
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

  const toggleHolder = (id: string) => {
    const next = new Set(selectedHolderIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedHolderIds(next);
  };

  const toggleSquad = (id: string) => {
    const next = new Set(selectedSquadIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedSquadIds(next);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-slate-200">
          <h3 className="font-bold text-slate-800">עריכת משתמש — {user.fullName}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">✕</button>
        </div>
        <form action={async (fd) => { await saveUser(fd); onClose(); }} className="p-5 space-y-4">
          <input type="hidden" name="id" value={user.id} />
          <input type="hidden" name="username" value={user.username} />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">שם מלא</label>
              <input name="fullName" defaultValue={user.fullName} required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">תואר / תפקיד</label>
              <input name="title" defaultValue={user.title ?? ""} placeholder="מפ״מ, קשר״ג, רס״פ..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">טלפון</label>
              <input name="phone" defaultValue={user.phone ?? ""} placeholder="05X-XXXXXXX"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">שם משתמש</label>
              <div className="w-full rounded-lg bg-slate-100 border border-slate-200 px-3 py-2 text-sm text-slate-500 font-mono">@{user.username}</div>
            </div>
          </div>

          {/* Role */}
          <div>
            <label className="block text-xs text-slate-500 mb-1">הרשאות</label>
            <select name="role" value={role} onChange={(e) => { setRole(e.target.value); setSelectedHolderIds(new Set()); setSelectedSquadIds(new Set()); }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <optgroup label="הרשאות בסיס">
                {ROLE_OPTS.map((r) => <option key={r} value={r}>{BUILTIN_LABELS[r]}</option>)}
              </optgroup>
              {customRoles.length > 0 && (
                <optgroup label="הרשאות מותאמות">
                  {customRoles.map((c) => <option key={c.id} value={`custom:${c.id}`}>{c.name}</option>)}
                </optgroup>
              )}
            </select>
          </div>

          {/* Holder assignment */}
          {showHolderPicker && (
            <div>
              <label className="block text-xs text-slate-500 mb-1">{holderLabel}</label>
              {isMultiHolder ? (
                <div className="rounded-lg border border-slate-300 p-2 space-y-1 max-h-32 overflow-y-auto">
                  {holderOpts.map((h) => (
                    <label key={h.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="holderId" value={h.id}
                        checked={selectedHolderIds.has(h.id)}
                        onChange={() => toggleHolder(h.id)}
                        className="w-4 h-4" /> {h.name}
                    </label>
                  ))}
                </div>
              ) : (
                <select name="holderId" defaultValue={user.holderId ?? ""}
                  onChange={(e) => setSelectedHolderIds(e.target.value ? new Set([e.target.value]) : new Set())}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                  {effectiveTemplate === "VIEWER" && <option value="">כל הגדוד</option>}
                  {holderOpts.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                </select>
              )}
            </div>
          )}

          {/* Squad assignment — available for all roles */}
          {squads.length > 0 && (
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
            <button className="bg-slate-800 text-white rounded-lg px-4 py-2 text-sm hover:bg-slate-900">שמירה</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function AllUsersTable({ users, baseUrl, initialQ, initialRole, initialStatus, holders, squads, customRoles, brigade, battalionCode }: {
  users: User[]; baseUrl: string; initialQ: string; initialRole: string; initialStatus: string;
  holders: Holder[]; squads: Squad[]; customRoles: CustomRole[]; brigade: string; battalionCode: string;
}) {
  const [q, setQ] = useState(initialQ);
  const [role, setRole] = useState(initialRole);
  const [status, setStatus] = useState(initialStatus);
  const [editingUser, setEditingUser] = useState<User | null>(null);

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
          || (u.title ?? "").toLowerCase().includes(qq);
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
            <label className="block text-xs text-slate-500 mb-1">חיפוש (שם / משתמש / טלפון / תואר)</label>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="הקלד..."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">הרשאות</label>
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
                  <Td><InviteCell user={u} baseUrl={baseUrl} /></Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setEditingUser(u)} className="text-xs text-blue-600 hover:text-blue-800">✏️ עריכה</button>
                      <form action={toggleUser}>
                        <input type="hidden" name="id" value={u.id} />
                        <button className="text-xs text-rose-500 hover:text-rose-700">{u.active ? "השבת" : "הפעל"}</button>
                      </form>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {editingUser && (
        <EditDialog
          user={editingUser}
          holders={holders}
          squads={squads}
          customRoles={customRoles}
          onClose={() => setEditingUser(null)}
        />
      )}
    </>
  );
}
