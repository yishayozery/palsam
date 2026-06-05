"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui";
import { ROLE_LABELS, WAREHOUSE_TYPE_SHORT, WAREHOUSE_TYPE_ICON } from "@/lib/rbac";
import type { WarehouseType } from "@/generated/prisma";
import { inviteHolderUser, removeHolderUser } from "./actions";
import { createSoldier } from "../roster/actions";

type User = {
  id: string;
  fullName: string;
  username: string;
  role: "SUPER_ADMIN" | "BATTALION_ADMIN" | "WAREHOUSE_MANAGER" | "COMPANY_REP" | "VIEWER";
  phone: string | null;
  title?: string | null;
  passwordSet: boolean;
  active: boolean;
};
export type SoldierRefDetail = {
  id: string; fullName: string; personalNumber: string | null; enlisted: boolean; isSecondary?: boolean;
};
export type HolderRowDetail = {
  id: string;
  name: string;
  active: boolean;
  warehouseType?: WarehouseType | null;
  users: User[];
  soldiers?: SoldierRefDetail[];
};

type RosterSoldier = { id: string; fullName: string; pn: string | null; companyName: string | null };

function InviteForm({ holderId, kind, onDone }: { holderId: string; kind: "WAREHOUSE" | "COMPANY"; onDone: () => void }) {
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [title, setTitle] = useState("");
  const [check, setCheck] = useState<{ available?: boolean; taken?: boolean; recommended?: string | null }>({});
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkSoldier, setLinkSoldier] = useState(false);
  const [soldierSearch, setSoldierSearch] = useState("");
  const [soldierOptions, setSoldierOptions] = useState<RosterSoldier[]>([]);
  const [selectedSoldier, setSelectedSoldier] = useState<RosterSoldier | null>(null);

  const titleSuggestions = kind === "WAREHOUSE"
    ? ["מפקד מחסן", "אחראי"]
    : ["מ״פ", "מ״פלג", "רס״פ", "מפקד"];

  useEffect(() => {
    if (!username && fullName.trim()) {
      const slug = fullName.trim().split(/\s+/).join(".").toLowerCase()
        .replace(/[^\w.-֐-׿]+/g, "").slice(0, 24);
      if (slug) setUsername(slug);
    }
  }, [fullName, username]);

  useEffect(() => {
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
  }, [username]);

  useEffect(() => {
    if (!linkSoldier) return;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/roster/available?q=${encodeURIComponent(soldierSearch)}`);
        if (res.ok) setSoldierOptions(await res.json());
      } catch { /* ignore */ }
    }, 250);
    return () => clearTimeout(t);
  }, [linkSoldier, soldierSearch]);

  function pickSoldier(s: RosterSoldier) {
    setSelectedSoldier(s); setFullName(s.fullName);
    if (!username) {
      const slug = s.fullName.trim().split(/\s+/).join(".").toLowerCase()
        .replace(/[^\w.-֐-׿]+/g, "").slice(0, 24);
      if (slug) setUsername(slug);
    }
  }

  async function submit(fd: FormData) {
    setError(null);
    try { await inviteHolderUser(fd); onDone(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }

  const statusBadge = !username ? null
    : checking ? <span className="text-xs text-slate-400">בודק...</span>
    : check.available ? <span className="text-xs text-emerald-600">✓ זמין</span>
    : check.taken ? (
        <span className="text-xs text-rose-600">
          תפוס.
          {check.recommended && (
            <button type="button" onClick={() => setUsername(check.recommended!)}
              className="mr-1 underline">השתמש ב-{check.recommended}</button>
          )}
        </span>
      ) : null;

  return (
    <form action={submit} className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
      <input type="hidden" name="holderId" value={holderId} />
      {selectedSoldier && <input type="hidden" name="soldierId" value={selectedSoldier.id} />}
      <input type="hidden" name="title" value={title} />

      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-blue-900">+ הוספת בעל תפקיד</span>
        <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
          <input type="checkbox" checked={linkSoldier} onChange={(e) => { setLinkSoldier(e.target.checked); if (!e.target.checked) { setSelectedSoldier(null); setFullName(""); } }} />
          🔗 חייל מהרוסטר
        </label>
      </div>

      {linkSoldier && !selectedSoldier && (
        <div className="bg-white border border-blue-300 rounded p-2">
          <input value={soldierSearch} onChange={(e) => setSoldierSearch(e.target.value)} placeholder="חפש שם / מ.א..."
            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
          <div className="mt-1 max-h-32 overflow-y-auto">
            {soldierOptions.map((s) => (
              <button key={s.id} type="button" onClick={() => pickSoldier(s)}
                className="w-full text-right px-2 py-1.5 hover:bg-blue-50 flex items-center justify-between text-sm border-b border-slate-100 last:border-0">
                <span><b>{s.fullName}</b> {s.pn && <span className="font-mono text-xs text-slate-400">{s.pn}</span>}</span>
                {s.companyName && <span className="text-xs text-slate-500">{s.companyName}</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {selectedSoldier && (
        <div className="bg-emerald-50 border border-emerald-300 rounded p-2 text-sm flex items-center justify-between">
          <span>🔗 <b>{selectedSoldier.fullName}</b> {selectedSoldier.pn && <span className="font-mono text-xs text-slate-500">({selectedSoldier.pn})</span>}</span>
          <button type="button" onClick={() => { setSelectedSoldier(null); setFullName(""); }} className="text-xs text-rose-500">בטל</button>
        </div>
      )}

      <div>
        <label className="block text-xs text-slate-600 mb-1">תואר/תפקיד (טקסט חופשי)</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={titleSuggestions[0]}
          list={`titles-${holderId}`}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm" />
        <datalist id={`titles-${holderId}`}>
          {titleSuggestions.map((t) => <option key={t} value={t} />)}
        </datalist>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-slate-600 mb-1">שם מלא</label>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} name="fullName" required readOnly={!!selectedSoldier}
            className={`w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm ${selectedSoldier ? "bg-slate-100" : "bg-white"}`} />
        </div>
        <div>
          <label className="block text-xs text-slate-600 mb-1">שם משתמש {statusBadge}</label>
          <input value={username} name="username" required
            onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^\w.-]/g, ""))}
            className={`w-full rounded-lg border px-3 py-1.5 text-sm font-mono ${check.taken ? "border-rose-300 bg-rose-50" : check.available ? "border-emerald-300 bg-emerald-50" : "border-slate-300 bg-white"}`} />
        </div>
      </div>
      <div>
        <label className="block text-xs text-slate-600 mb-1">נייד</label>
        <input value={phone} onChange={(e) => setPhone(e.target.value)} name="phone" placeholder="05X-XXXXXXX"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm" />
      </div>
      {error && <div className="bg-rose-100 border border-rose-200 rounded p-2 text-xs text-rose-700">{error}</div>}
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onDone} className="text-xs text-slate-500">ביטול</button>
        <button disabled={check.taken && !check.recommended}
          className="bg-emerald-600 text-white rounded-lg px-4 py-1.5 text-xs font-medium hover:bg-emerald-700 disabled:opacity-50">
          שלח הזמנה
        </button>
      </div>
    </form>
  );
}

function SoldierQuickAdd({ companyId, onDone }: { companyId: string; onDone: () => void }) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [personalNumber, setPersonalNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(fd: FormData) {
    setError(null);
    try {
      await createSoldier(fd);
      setFirstName(""); setLastName(""); setPersonalNumber(""); setPhone("");
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }

  return (
    <form action={submit} className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 space-y-2">
      <input type="hidden" name="companyId" value={companyId} />
      <input type="hidden" name="enlistNow" value="on" />
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-emerald-900">+ הוספת חייל לפלוגה</span>
        <a href="/roster" target="_blank" className="text-[11px] text-emerald-700 hover:underline">לרוסטר ←</a>
      </div>
      {error && <div className="bg-rose-100 border border-rose-200 rounded p-2 text-xs text-rose-700">{error}</div>}
      <div className="grid grid-cols-2 gap-2">
        <input value={firstName} onChange={(e) => setFirstName(e.target.value)} name="firstName" required placeholder="שם פרטי *"
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm" />
        <input value={lastName} onChange={(e) => setLastName(e.target.value)} name="lastName" required placeholder="שם משפחה *"
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input value={personalNumber} name="personalNumber" inputMode="numeric"
          onChange={(e) => setPersonalNumber(e.target.value.replace(/\D/g, ""))}
          placeholder="מ.א. (אופציונלי)"
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-mono" />
        <input value={phone} onChange={(e) => setPhone(e.target.value)} name="phone" placeholder="נייד (אופציונלי)"
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm" />
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} className="text-xs text-slate-500">סגור</button>
        <button disabled={!firstName || !lastName}
          className="bg-emerald-600 text-white rounded-lg px-4 py-1.5 text-xs hover:bg-emerald-700 disabled:opacity-50">+ הוסף</button>
      </div>
    </form>
  );
}

export default function HolderDetailsModal({ row, kind, onClose }: { row: HolderRowDetail; kind: "WAREHOUSE" | "COMPANY"; onClose: () => void }) {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [soldierAddOpen, setSoldierAddOpen] = useState(false);
  const icon = kind === "WAREHOUSE" && row.warehouseType ? WAREHOUSE_TYPE_ICON[row.warehouseType] : "🪖";

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-3" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* כותרת */}
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 text-white p-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{icon}</span>
            <div>
              <h3 className="font-bold text-lg">{row.name}</h3>
              {row.warehouseType && <p className="text-xs text-slate-300">{WAREHOUSE_TYPE_SHORT[row.warehouseType]}</p>}
            </div>
          </div>
          <button onClick={onClose} className="text-slate-300 hover:text-white text-2xl">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* בעלי תפקיד */}
          <div>
            <h4 className="font-bold text-slate-700 mb-2 flex items-center justify-between">
              <span>👮 {kind === "WAREHOUSE" ? "מפקדים / אחראים" : 'מ״פ / רס״פ / בעלי תפקיד'} ({row.users.length})</span>
            </h4>
            {row.users.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-3 bg-slate-50 rounded-lg">אין בעלי תפקיד עדיין</p>
            ) : (
              <div className="space-y-1.5">
                {row.users.map((u) => (
                  <div key={u.id} className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2 group">
                    <span className="text-base">👤</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{u.fullName}</span>
                        {u.title && <Badge className="bg-blue-100 text-blue-700 text-[10px]">{u.title}</Badge>}
                        <span title="הרשאות מערכת"><Badge className="bg-slate-100 text-slate-600 text-[10px]">🔑 {ROLE_LABELS[u.role]}</Badge></span>
                        {!u.passwordSet && <Badge className="bg-amber-100 text-amber-800 text-[10px]">⏳ ממתין</Badge>}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5 flex gap-2">
                        <span className="font-mono">@{u.username}</span>
                        {u.phone && <span>· {u.phone}</span>}
                      </div>
                    </div>
                    <form action={removeHolderUser}>
                      <input type="hidden" name="userId" value={u.id} />
                      <input type="hidden" name="holderId" value={row.id} />
                      <button className="text-xs text-rose-400 hover:text-rose-700 px-1.5 py-0.5 opacity-0 group-hover:opacity-100">✕</button>
                    </form>
                  </div>
                ))}
              </div>
            )}
            {!inviteOpen ? (
              <button onClick={() => setInviteOpen(true)}
                className="mt-2 w-full border-2 border-dashed border-blue-300 text-blue-700 rounded-lg py-2 text-sm font-medium hover:bg-blue-50">
                + הוסף {kind === "WAREHOUSE" ? "קצין/אחראי" : "מ״פ / רס״פ"}
              </button>
            ) : (
              <div className="mt-2"><InviteForm holderId={row.id} kind={kind} onDone={() => setInviteOpen(false)} /></div>
            )}
          </div>

          {/* חיילים */}
          {(kind === "COMPANY" || (kind === "WAREHOUSE" && (row.soldiers?.length ?? 0) > 0)) && (
            <div className="border-t border-slate-200 pt-4">
              <h4 className="font-bold text-slate-700 mb-2 flex items-center justify-between">
                <span>🪖 חיילים ({row.soldiers?.length ?? 0})</span>
                <a href={kind === "COMPANY" ? `/roster?company=${row.id}` : "/roster"} target="_blank" className="text-xs text-blue-600 hover:underline">לרוסטר ←</a>
              </h4>
              {row.soldiers && row.soldiers.length > 0 ? (
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {row.soldiers.slice(0, 100).map((s) => (
                    <div key={s.id} className="flex items-center gap-2 bg-emerald-50/40 rounded px-2 py-1 text-sm">
                      <span className="text-sm">🪖</span>
                      <span className="flex-1 truncate">{s.fullName}</span>
                      {s.personalNumber && <span className="font-mono text-xs text-slate-400">{s.personalNumber}</span>}
                      {s.isSecondary && <Badge className="bg-purple-100 text-purple-700 text-[9px]">משני</Badge>}
                      {s.enlisted
                        ? <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">✓</Badge>
                        : <Badge className="bg-amber-100 text-amber-700 text-[10px]">ממתין</Badge>}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-400 text-center py-3 bg-slate-50 rounded-lg">אין חיילים עדיין</p>
              )}
              {kind === "COMPANY" && (
                <>
                  {!soldierAddOpen ? (
                    <button onClick={() => setSoldierAddOpen(true)}
                      className="mt-2 w-full border-2 border-dashed border-emerald-300 text-emerald-700 rounded-lg py-2 text-sm font-medium hover:bg-emerald-50">
                      + הוסף חייל לפלוגה
                    </button>
                  ) : (
                    <div className="mt-2"><SoldierQuickAdd companyId={row.id} onDone={() => setSoldierAddOpen(false)} /></div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
