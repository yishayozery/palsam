"use client";

import { useState } from "react";
import { Badge } from "@/components/ui";
import { ROLE_LABELS, WAREHOUSE_TYPE_SHORT, WAREHOUSE_TYPE_ICON } from "@/lib/rbac";
import type { WarehouseType } from "@/generated/prisma";
import HolderLogoForm from "./HolderLogoForm";
import { createSoldier } from "../roster/actions";
import { updateNotificationEmails } from "../warehouses/[type]/actions";
import { useEscClose } from "@/lib/useEscClose";

type User = {
  id: string;
  fullName: string;
  username: string;
  role: "SUPER_ADMIN" | "BATTALION_ADMIN" | "WAREHOUSE_MANAGER" | "COMPANY_REP" | "VIEWER" | "SHALISH" | "MAGAD" | "SAMAGAD";
  phone: string | null;
  title?: string | null;
  systemRole?: { name: string } | null;
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
  logoData?: string | null;
  notificationEmails?: string | null;
  users: User[];
  soldiers?: SoldierRefDetail[];
};

function SoldierQuickAdd({ companyId, onDone }: { companyId: string; onDone: () => void }) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [personalNumber, setPersonalNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [enlistNow, setEnlistNow] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(fd: FormData) {
    setError(null);
    try {
      const r = await createSoldier(fd);
      if (r?.error) { setError(r.error); return; }
      setFirstName(""); setLastName(""); setPersonalNumber(""); setPhone("");
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }

  return (
    <form action={submit} className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 space-y-2">
      <input type="hidden" name="companyId" value={companyId} />
      <input type="hidden" name="enlistNow" value={enlistNow ? "on" : ""} />
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
      <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
        <input type="checkbox" checked={enlistNow} onChange={(e) => setEnlistNow(e.target.checked)} />
        ✓ אשר גיוס מיידי — יוכל לחתום על ציוד
      </label>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} className="text-xs text-slate-500">סגור</button>
        <button disabled={!firstName || !lastName}
          className="bg-emerald-600 text-white rounded-lg px-4 py-1.5 text-xs hover:bg-emerald-700 disabled:opacity-50">+ הוסף</button>
      </div>
    </form>
  );
}

function NotificationEmailsInline({ holderId, initial }: { holderId: string; initial: string | null }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initial ?? "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const emails = initial ? initial.split(",").map((e) => e.trim()).filter(Boolean) : [];

  async function save() {
    setBusy(true);
    const fd = new FormData();
    fd.append("holderId", holderId);
    fd.append("emails", value.trim());
    await updateNotificationEmails(fd);
    setBusy(false);
    setEditing(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-semibold text-amber-900">📧 התראות מייל</span>
        {!editing && (
          <button onClick={() => setEditing(true)} className="text-xs text-amber-700 hover:underline">
            {emails.length > 0 ? "✎ ערוך" : "＋ הגדר"}
          </button>
        )}
      </div>
      {emails.length > 0 && !editing && (
        <div className="flex flex-wrap gap-1">
          {emails.map((e) => (
            <span key={e} className="text-[11px] bg-amber-100 text-amber-800 rounded-full px-2 py-0.5">{e}</span>
          ))}
        </div>
      )}
      {!editing && emails.length === 0 && <p className="text-xs text-amber-700">לא מוגדרים כרגע</p>}
      {editing && (
        <div className="space-y-2 mt-1">
          <input value={value} onChange={(e) => setValue(e.target.value)}
            placeholder="mail1@example.com, mail2@example.com"
            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" dir="ltr" />
          <div className="flex gap-2">
            <button onClick={save} disabled={busy}
              className="bg-emerald-600 text-white rounded px-3 py-1 text-xs disabled:opacity-50">
              {busy ? "..." : "💾 שמור"}
            </button>
            <button onClick={() => { setEditing(false); setValue(initial ?? ""); }}
              className="text-xs text-slate-500">ביטול</button>
          </div>
        </div>
      )}
      {saved && <span className="text-xs text-emerald-700">✓ נשמר</span>}
    </div>
  );
}

export default function HolderDetailsModal({ row, kind, onClose }: { row: HolderRowDetail; kind: "WAREHOUSE" | "COMPANY"; onClose: () => void; baseUrl?: string }) {
  const [soldierAddOpen, setSoldierAddOpen] = useState(false);
  const icon = kind === "WAREHOUSE" && row.warehouseType ? WAREHOUSE_TYPE_ICON[row.warehouseType] : "🪖";

  useEscClose(!soldierAddOpen, onClose);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-3" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* כותרת */}
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 text-white p-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            {row.logoData ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={row.logoData} alt={row.name}
                className="w-14 h-14 object-contain rounded bg-white/10 p-1 shrink-0" />
            ) : (
              <span className="text-3xl">{icon}</span>
            )}
            <div>
              <h3 className="font-bold text-lg">{row.name}</h3>
              {row.warehouseType && <p className="text-xs text-slate-300">{WAREHOUSE_TYPE_SHORT[row.warehouseType]}</p>}
            </div>
          </div>
          <button onClick={onClose} className="text-slate-300 hover:text-white text-2xl">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* סמל פלוגה/מחסן */}
          <HolderLogoForm holderId={row.id} kind={kind} initial={row.logoData ?? null} />
          {/* התראות מייל */}
          <NotificationEmailsInline holderId={row.id} initial={row.notificationEmails ?? null} />

          {/* בעלי תפקיד — קריאה בלבד, ניהול עבר למסך משתמשים */}
          <div>
            <h4 className="font-bold text-slate-700 mb-2 flex items-center justify-between">
              <span>👮 {kind === "WAREHOUSE" ? "מפקדים / אחראים" : 'מ״פ / רס״פ / בעלי תפקיד'} ({row.users.length})</span>
              <a href="/users/all" className="text-xs text-blue-600 hover:underline font-normal">
                נהל משתמשים →
              </a>
            </h4>
            {row.users.length === 0 ? (
              <div className="text-sm text-slate-400 text-center py-3 bg-slate-50 rounded-lg">
                אין בעלי תפקיד עדיין —{" "}
                <a href="/users/all" className="text-blue-600 hover:underline">הוסף במסך המשתמשים</a>
              </div>
            ) : (
              <div className="space-y-1.5">
                {row.users.map((u) => (
                  <div key={u.id} className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2">
                    <span className="text-base">👤</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{u.fullName}</span>
                        {u.title && <Badge className="bg-blue-100 text-blue-700 text-[10px]">{u.title}</Badge>}
                        <Badge className="bg-slate-100 text-slate-600 text-[10px]">🔑 {u.systemRole?.name || ROLE_LABELS[u.role]}</Badge>
                        {!u.passwordSet && <Badge className="bg-amber-100 text-amber-800 text-[10px]">⏳ ממתין</Badge>}
                        {!u.active && <Badge className="bg-rose-100 text-rose-700 text-[10px]">מושבת</Badge>}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5 flex gap-2">
                        <span className="font-mono">@{u.username}</span>
                        {u.phone && <span>· {u.phone}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
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
