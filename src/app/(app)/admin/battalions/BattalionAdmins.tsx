"use client";

import { useState } from "react";
import InviteLink from "@/components/InviteLink";
import { addBattalionAdmin, updateBattalionAdmin, removeBattalionAdmin, resetUserPassword } from "./actions";

type Admin = { id: string; username: string; fullName: string; phone: string | null; passwordSet: boolean; inviteToken: string | null };

export default function BattalionAdmins({ battalionId, admins, baseUrl }: {
  battalionId: string; admins: Admin[]; baseUrl: string;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-1.5">
      {admins.map((u) =>
        editing === u.id ? (
          <form key={u.id} action={updateBattalionAdmin} onSubmit={() => setEditing(null)} className="flex flex-wrap items-center gap-1">
            <input type="hidden" name="id" value={u.id} />
            <input name="fullName" defaultValue={u.fullName} placeholder="שם מלא" required className="rounded border border-slate-300 px-2 py-0.5 text-xs w-28" />
            <input name="username" defaultValue={u.username} placeholder="שם משתמש" required className="rounded border border-slate-300 px-2 py-0.5 text-xs w-24 font-mono" />
            <input name="phone" defaultValue={u.phone || ""} placeholder="טלפון" className="rounded border border-slate-300 px-2 py-0.5 text-xs w-24" />
            <button className="text-[11px] bg-emerald-600 text-white rounded px-2 py-0.5">שמור</button>
            <button type="button" onClick={() => setEditing(null)} className="text-[11px] text-slate-400">ביטול</button>
          </form>
        ) : (
          <div key={u.id} className="flex items-center gap-2 flex-wrap">
            <span>{u.fullName} (@{u.username})</span>
            <button onClick={() => setEditing(u.id)} className="text-[11px] text-blue-600 hover:underline">✏️ ערוך</button>
            {!u.passwordSet && u.inviteToken ? (
              <InviteLink token={u.inviteToken} phone={u.phone} baseUrl={baseUrl} role="admin" />
            ) : (
              <form action={resetUserPassword}>
                <input type="hidden" name="id" value={u.id} />
                <button className="text-[11px] bg-amber-50 border border-amber-300 text-amber-800 rounded px-2 py-0.5 hover:bg-amber-100">🔑 איפוס סיסמה</button>
              </form>
            )}
            {admins.length > 1 && (
              <form action={removeBattalionAdmin} onSubmit={(e) => { if (!confirm(`להסיר את ${u.fullName} מהמנהלים?`)) e.preventDefault(); }}>
                <input type="hidden" name="id" value={u.id} />
                <button className="text-[11px] text-rose-400 hover:text-rose-600">🗑️ הסר</button>
              </form>
            )}
          </div>
        )
      )}
      {admins.length === 0 && <span className="text-slate-400">—</span>}

      {adding ? (
        <form action={addBattalionAdmin} onSubmit={() => setAdding(false)} className="flex flex-wrap items-center gap-1 pt-1">
          <input type="hidden" name="battalionId" value={battalionId} />
          <input name="fullName" placeholder="שם מלא" required className="rounded border border-slate-300 px-2 py-0.5 text-xs w-28" />
          <input name="username" placeholder="שם משתמש" required className="rounded border border-slate-300 px-2 py-0.5 text-xs w-24 font-mono" />
          <input name="phone" placeholder="טלפון" className="rounded border border-slate-300 px-2 py-0.5 text-xs w-24" />
          <button className="text-[11px] bg-slate-800 text-white rounded px-2 py-0.5">הוסף</button>
          <button type="button" onClick={() => setAdding(false)} className="text-[11px] text-slate-400">ביטול</button>
        </form>
      ) : (
        <button onClick={() => setAdding(true)} className="text-[11px] text-emerald-600 hover:underline pt-0.5">➕ הוסף מנהל</button>
      )}
    </div>
  );
}
