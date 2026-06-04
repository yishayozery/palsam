"use client";

import { useState, useEffect } from "react";
import { saveRep, copyFromWarehouse, inviteRep } from "./actions";

type Ref2 = { id: string; name: string };

function InviteForm({ companies, onDone }: { companies: Ref2[]; onDone: () => void }) {
  const [formCompanyId, setFormCompanyId] = useState(companies[0]?.id || "");
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [check, setCheck] = useState<{ available?: boolean; taken?: boolean; recommended?: string | null }>({});
  const [checking, setChecking] = useState(false);
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);

  // הצעת שם משתמש ברירת מחדל מהשם המלא
  useEffect(() => {
    if (!username && fullName.trim()) {
      const slug = fullName.trim().split(/\s+/).join(".").toLowerCase()
        .replace(/[^\w.-֐-׿]+/g, "")
        .slice(0, 24);
      if (slug) setUsername(slug);
    }
  }, [fullName, username]);

  // בדיקת זמינות חיה (debounce)
  useEffect(() => {
    const u = username.trim().toLowerCase();
    if (!u) { setCheck({}); return; }
    setChecking(true);
    const t = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ u, ...(formCompanyId ? { companyId: formCompanyId } : {}) });
        const res = await fetch(`/users/check-username?${params}`);
        const data = await res.json();
        setCheck(data);
      } catch { setCheck({}); }
      finally { setChecking(false); }
    }, 350);
    return () => clearTimeout(t);
  }, [username, formCompanyId]);

  async function submit(fd: FormData) {
    setError(null);
    try {
      await inviteRep(fd);
      onDone();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg.replace(/^REP_EXISTS:\s*/, "").replace(/^Error:\s*/, ""));
    }
  }

  const statusBadge =
    !username ? null
    : checking ? <span className="text-xs text-slate-400">בודק...</span>
    : check.available ? <span className="text-xs text-emerald-600">✓ זמין</span>
    : check.taken ? (
        <span className="text-xs text-rose-600">
          תפוס.
          {check.recommended && (
            <button type="button" onClick={() => setUsername(check.recommended!)}
              className="mr-1 underline hover:text-rose-800">
              השתמש ב-{check.recommended}
            </button>
          )}
        </span>
      ) : null;

  return (
    <form action={submit} className="p-5 space-y-3">
      <div>
        <label className="block text-xs text-slate-500 mb-1">פלוגה</label>
        <select name="companyId" value={formCompanyId} onChange={(e) => setFormCompanyId(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
          {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-slate-500 mb-1">שם מלא</label>
          <input name="fullName" required value={fullName} onChange={(e) => setFullName(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">שם משתמש {statusBadge}</label>
          <input name="username" required value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^\w.-]/g, ""))}
            className={`w-full rounded-lg border px-3 py-2 text-sm font-mono ${check.taken ? "border-rose-300 bg-rose-50" : check.available ? "border-emerald-300 bg-emerald-50" : "border-slate-300"}`} />
        </div>
      </div>
      <div>
        <label className="block text-xs text-slate-500 mb-1">טלפון (לשליחת הזמנה)</label>
        <input name="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="05X-XXXXXXX"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </div>
      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-lg p-2 text-xs text-rose-700">
          {error}
        </div>
      )}
      <p className="text-xs text-slate-400">ייווצר קישור הזמנה — הרס״פ יגדיר סיסמה בכניסה הראשונה. שם משתמש כפול לא ייווצר — המערכת תוסיף סיומת פלוגה+חטיבה אוטומטית.</p>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">ביטול</button>
        <button disabled={check.taken && !check.recommended}
          className="bg-emerald-600 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm">
          יצירת הזמנה
        </button>
      </div>
    </form>
  );
}

type Ref = { id: string; name: string };
type Rep = { id: string; name: string; companyId: string | null };

export default function RepsManager({
  companies,
  reps,
  otherWarehouses,
}: {
  companies: Ref[];
  reps: Rep[];
  otherWarehouses: Ref[];
}) {
  const [open, setOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [companyId, setCompanyId] = useState(companies[0]?.id || "");
  const companyReps = reps.filter((r) => r.companyId === companyId);

  return (
    <div className="flex gap-2">
      {otherWarehouses.length > 0 && (
        <form action={copyFromWarehouse} className="flex items-center gap-1">
          <select name="sourceWarehouseId" className="rounded-lg border border-slate-300 px-2 py-2 text-sm">
            {otherWarehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <button className="bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm hover:bg-slate-50">העתק ממחסן</button>
        </form>
      )}
      <button onClick={() => setInviteOpen(true)} className="bg-emerald-600 text-white rounded-lg px-4 py-2 text-sm hover:bg-emerald-700">+ הזמן רס״פ</button>
      <button onClick={() => setOpen(true)} className="bg-slate-800 text-white rounded-lg px-4 py-2 text-sm hover:bg-slate-900">+ פלוגה</button>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <h3 className="font-bold text-slate-800">הוספת פלוגה ונציג</h3>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>
            <form action={async (fd) => { await saveRep(fd); setOpen(false); }} className="p-5 space-y-4">
              <div>
                <label className="block text-xs text-slate-500 mb-1">פלוגה</label>
                <select name="companyId" value={companyId} onChange={(e) => setCompanyId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">נציג (אופציונלי)</label>
                <select name="repUserId" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                  <option value="">— ללא —</option>
                  {companyReps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
                {companyReps.length === 0 && <p className="text-xs text-amber-600 mt-1">אין נציגים לפלוגה זו. צור משתמש נציג במסך משתמשים.</p>}
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">ביטול</button>
                <button className="bg-slate-800 text-white rounded-lg px-4 py-2 text-sm">הוספה</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {inviteOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <h3 className="font-bold text-slate-800">הזמנת רס״פ חדש</h3>
              <button onClick={() => setInviteOpen(false)} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>
            <InviteForm companies={companies} onDone={() => setInviteOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
