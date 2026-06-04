"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui";
import { ROLE_LABELS, WAREHOUSE_TYPE_SHORT, WAREHOUSE_TYPE_ICON } from "@/lib/rbac";
import { inviteHolderUser, removeHolderUser, createWarehouse, createCompany, renameHolder, toggleHolder } from "./actions";
import type { WarehouseType } from "@/generated/prisma";

type User = {
  id: string;
  fullName: string;
  username: string;
  role: "SUPER_ADMIN" | "BATTALION_ADMIN" | "WAREHOUSE_MANAGER" | "COMPANY_REP" | "VIEWER";
  phone: string | null;
  passwordSet: boolean;
  active: boolean;
};
export type HolderRow = {
  id: string;
  name: string;
  active: boolean;
  warehouseType?: WarehouseType | null;
  users: User[];
  extra?: { soldierCount?: number };
};

const WH_OPTS: WarehouseType[] = ["EQUIPMENT", "COMMS", "AMMO", "ARMORY", "VEHICLES", "MEDICAL", "GENERAL"];

function InviteRow({ holderId, kind, onDone }: { holderId: string; kind: "WAREHOUSE" | "COMPANY"; onDone: () => void }) {
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [check, setCheck] = useState<{ available?: boolean; taken?: boolean; recommended?: string | null }>({});
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!username && fullName.trim()) {
      const slug = fullName.trim().split(/\s+/).join(".").toLowerCase()
        .replace(/[^\w.-֐-׿]+/g, "")
        .slice(0, 24);
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
        const data = await res.json();
        setCheck(data);
      } catch { setCheck({}); }
      finally { setChecking(false); }
    }, 350);
    return () => clearTimeout(t);
  }, [username]);

  async function submit(fd: FormData) {
    setError(null);
    try {
      await inviteHolderUser(fd);
      setFullName(""); setUsername(""); setPhone("");
      onDone();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg.replace(/^Error:\s*/, ""));
    }
  }

  const roleLabel = kind === "WAREHOUSE" ? "קצין מחסן" : 'רס״פ פלוגה';
  const statusBadge =
    !username ? null
    : checking ? <span className="text-xs text-slate-400 mr-1">בודק...</span>
    : check.available ? <span className="text-xs text-emerald-600 mr-1">✓ זמין</span>
    : check.taken ? (
        <span className="text-xs text-rose-600 mr-1">
          תפוס.
          {check.recommended && (
            <button type="button" onClick={() => setUsername(check.recommended!)}
              className="mr-1 underline hover:text-rose-800">השתמש ב-{check.recommended}</button>
          )}
        </span>
      ) : null;

  return (
    <form action={submit} className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2 mt-2">
      <input type="hidden" name="holderId" value={holderId} />
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm font-semibold text-blue-900">+ הזמנת {roleLabel} חדש</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-slate-600 mb-1">שם מלא</label>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} name="fullName" required
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-slate-600 mb-1">שם משתמש {statusBadge}</label>
          <input value={username} name="username" required
            onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^\w.-]/g, ""))}
            className={`w-full rounded-lg border px-3 py-2 text-sm font-mono ${check.taken ? "border-rose-300 bg-rose-50" : check.available ? "border-emerald-300 bg-emerald-50" : "border-slate-300 bg-white"}`} />
        </div>
      </div>
      <div>
        <label className="block text-xs text-slate-600 mb-1">טלפון (לשליחת הזמנה)</label>
        <input value={phone} onChange={(e) => setPhone(e.target.value)} name="phone" placeholder="05X-XXXXXXX"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
      </div>
      {error && <div className="bg-rose-100 border border-rose-200 rounded p-2 text-xs text-rose-700">{error}</div>}
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onDone} className="text-xs text-slate-500 hover:text-slate-800">ביטול</button>
        <button disabled={check.taken && !check.recommended}
          className="bg-emerald-600 text-white rounded-lg px-4 py-1.5 text-xs font-medium hover:bg-emerald-700 disabled:opacity-50">
          שלח הזמנה
        </button>
      </div>
    </form>
  );
}

function HolderItem({ row, kind, defaultOpen }: { row: HolderRow; kind: "WAREHOUSE" | "COMPANY"; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editName, setEditName] = useState(false);

  const icon = kind === "WAREHOUSE" && row.warehouseType ? WAREHOUSE_TYPE_ICON[row.warehouseType] : kind === "COMPANY" ? "🪖" : "📦";
  const typeLabel = row.warehouseType ? WAREHOUSE_TYPE_SHORT[row.warehouseType] : "";

  return (
    <div className={`border rounded-xl overflow-hidden transition ${open ? "border-slate-300 shadow-sm" : "border-slate-200"} ${!row.active ? "opacity-60" : ""}`}>
      {/* כותרת */}
      <div className="bg-gradient-to-l from-white to-slate-50 flex items-center gap-3 px-4 py-3 hover:bg-slate-50 cursor-pointer"
        onClick={() => setOpen(!open)}>
        <button type="button" className="text-slate-400 hover:text-slate-700 text-xl leading-none w-6 transition-transform"
          style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}>
          ▶
        </button>
        <span className="text-2xl">{icon}</span>
        <div className="flex-1">
          {editName ? (
            <form action={async (fd) => { await renameHolder(fd); setEditName(false); }} className="flex items-center gap-2"
              onClick={(e) => e.stopPropagation()}>
              <input type="hidden" name="id" value={row.id} />
              <input name="name" defaultValue={row.name} autoFocus required
                className="rounded border border-slate-300 px-2 py-1 text-sm" />
              <button className="text-xs text-emerald-700 hover:text-emerald-800">שמור</button>
              <button type="button" onClick={(e) => { e.stopPropagation(); setEditName(false); }} className="text-xs text-slate-500">ביטול</button>
            </form>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-slate-800">{row.name}</span>
              {typeLabel && <Badge className="bg-slate-100 text-slate-600">{typeLabel}</Badge>}
              {row.extra?.soldierCount !== undefined && row.extra.soldierCount > 0 && (
                <Badge className="bg-emerald-50 text-emerald-700">{row.extra.soldierCount} חיילים</Badge>
              )}
              {row.users.length > 0 && (
                <Badge className="bg-blue-50 text-blue-700">
                  {row.users.length} {kind === "WAREHOUSE" ? "קצינים" : "רס״פים"}
                </Badge>
              )}
              {!row.active && <Badge className="bg-rose-100 text-rose-700">לא פעיל</Badge>}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <button type="button" onClick={() => setEditName(true)} className="text-xs text-slate-400 hover:text-slate-700 px-2 py-1">
            ✎
          </button>
          <form action={toggleHolder}>
            <input type="hidden" name="id" value={row.id} />
            <button className="text-xs text-slate-400 hover:text-rose-600 px-2 py-1" title={row.active ? "השבת" : "הפעל"}>
              {row.active ? "🚫" : "↻"}
            </button>
          </form>
        </div>
      </div>

      {/* תוכן נפתח */}
      {open && (
        <div className="bg-white p-4 border-t border-slate-200">
          {row.users.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-2">אין משתמשים — הזמן {kind === "WAREHOUSE" ? "קצין מחסן" : 'רס״פ'} ראשון</p>
          ) : (
            <div className="space-y-2">
              {row.users.map((u) => (
                <div key={u.id} className="flex items-center gap-3 bg-slate-50 rounded-lg px-3 py-2 group">
                  <span className="text-lg">👤</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-slate-800">{u.fullName}</span>
                      <Badge className="bg-white border border-slate-200 text-slate-600 text-[10px]">{ROLE_LABELS[u.role]}</Badge>
                      {!u.passwordSet && <Badge className="bg-amber-100 text-amber-800 text-[10px]">⏳ ממתין להזמנה</Badge>}
                      {!u.active && <Badge className="bg-rose-100 text-rose-700 text-[10px]">מושבת</Badge>}
                    </div>
                    <div className="text-xs text-slate-500 flex gap-2 mt-0.5">
                      <span className="font-mono">@{u.username}</span>
                      {u.phone && <span>· {u.phone}</span>}
                    </div>
                  </div>
                  <form action={removeHolderUser}>
                    <input type="hidden" name="userId" value={u.id} />
                    <input type="hidden" name="holderId" value={row.id} />
                    <button className="text-xs text-slate-400 hover:text-rose-600 opacity-0 group-hover:opacity-100 transition px-2 py-1"
                      title="הסר משתמש זה מהמקום הזה">
                      ✕ הסר
                    </button>
                  </form>
                </div>
              ))}
            </div>
          )}

          {!inviteOpen ? (
            <button type="button" onClick={() => setInviteOpen(true)}
              className="mt-3 w-full border-2 border-dashed border-blue-300 text-blue-700 rounded-lg py-2 text-sm font-medium hover:bg-blue-50 hover:border-blue-400 transition">
              + הוסף {kind === "WAREHOUSE" ? "קצין מחסן" : 'רס״פ פלוגה'}
            </button>
          ) : (
            <InviteRow holderId={row.id} kind={kind} onDone={() => setInviteOpen(false)} />
          )}
        </div>
      )}
    </div>
  );
}

function AddHolderForm({ kind }: { kind: "WAREHOUSE" | "COMPANY" }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [warehouseType, setWarehouseType] = useState<WarehouseType>("EQUIPMENT");

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="w-full border-2 border-dashed border-slate-300 text-slate-600 rounded-xl py-3 text-sm font-medium hover:bg-slate-50 hover:border-slate-400 transition">
        + {kind === "WAREHOUSE" ? "הוסף מחסן" : "הוסף פלוגה"}
      </button>
    );
  }

  const action = kind === "WAREHOUSE" ? createWarehouse : createCompany;
  return (
    <form action={async (fd) => { await action(fd); setOpen(false); setName(""); }}
      className="border-2 border-slate-300 rounded-xl p-3 bg-slate-50 flex items-end gap-2 flex-wrap">
      <div className="flex-1 min-w-40">
        <label className="block text-xs text-slate-600 mb-1">{kind === "WAREHOUSE" ? "שם המחסן" : "שם הפלוגה"}</label>
        <input value={name} onChange={(e) => setName(e.target.value)} name="name" required autoFocus
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white" />
      </div>
      {kind === "WAREHOUSE" && (
        <div>
          <label className="block text-xs text-slate-600 mb-1">סוג</label>
          <select name="warehouseType" value={warehouseType}
            onChange={(e) => setWarehouseType(e.target.value as WarehouseType)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
            {WH_OPTS.map((v) => <option key={v} value={v}>{WAREHOUSE_TYPE_SHORT[v]}</option>)}
          </select>
        </div>
      )}
      <button className="bg-slate-800 text-white rounded-lg px-4 py-2 text-sm hover:bg-slate-900">הוסף</button>
      <button type="button" onClick={() => setOpen(false)} className="text-xs text-slate-500 hover:text-slate-800 px-2">ביטול</button>
    </form>
  );
}

export default function HolderAccordion({ rows, kind }: { rows: HolderRow[]; kind: "WAREHOUSE" | "COMPANY" }) {
  return (
    <div className="space-y-3">
      {rows.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-400">
          אין {kind === "WAREHOUSE" ? "מחסנים" : "פלוגות"} עדיין. הוסף את ה{kind === "WAREHOUSE" ? "ראשון" : "ראשונה"} ↓
        </div>
      ) : (
        rows.map((r) => <HolderItem key={r.id} row={r} kind={kind} defaultOpen={false} />)
      )}
      <AddHolderForm kind={kind} />
    </div>
  );
}
