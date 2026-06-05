"use client";

import { useState, useEffect } from "react";
import { updateRep } from "./actions";

type Rep = {
  id: string; fullName: string;
  title: string | null; phone: string | null;
  soldierId: string | null;
};

type RosterSoldier = { id: string; fullName: string; pn: string | null; phone: string | null; companyName: string | null };

export default function EditRepInline({ rep }: { rep: Rep }) {
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState(rep.fullName);
  const [title, setTitle] = useState(rep.title ?? "");
  const [phone, setPhone] = useState(rep.phone ?? "");
  const [linkSoldier, setLinkSoldier] = useState(false);
  const [soldierSearch, setSoldierSearch] = useState("");
  const [soldierOptions, setSoldierOptions] = useState<RosterSoldier[]>([]);
  const [selectedSoldier, setSelectedSoldier] = useState<RosterSoldier | null>(null);
  const [unlinkSoldier, setUnlinkSoldier] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
    setSelectedSoldier(s);
    setFullName(s.fullName);
    if (s.phone) setPhone(s.phone);
  }

  async function submit(fd: FormData) {
    setError(null); setBusy(true);
    try {
      if (selectedSoldier) fd.append("soldierId", selectedSoldier.id);
      if (unlinkSoldier) fd.append("unlinkSoldier", "on");
      await updateRep(fd);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-xs text-slate-500 hover:text-slate-800" title="עריכה">
        ✎
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3" onClick={() => setOpen(false)}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <h3 className="font-bold text-slate-800">✎ עריכת רס״פ</h3>
          <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700 text-xl">✕</button>
        </div>

        <form action={submit} className="p-5 space-y-3">
          <input type="hidden" name="userId" value={rep.id} />
          {error && <div className="bg-rose-50 border border-rose-200 rounded p-2 text-xs text-rose-700">{error}</div>}

          {/* קישור לחייל */}
          {!rep.soldierId && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5">
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input type="checkbox" checked={linkSoldier}
                  onChange={(e) => { setLinkSoldier(e.target.checked); if (!e.target.checked) setSelectedSoldier(null); }} />
                🔗 קשר לחייל ברוסטר (מילוי אוטומטי)
              </label>
              {linkSoldier && !selectedSoldier && (
                <div className="mt-2 space-y-1">
                  <input value={soldierSearch} onChange={(e) => setSoldierSearch(e.target.value)} placeholder="חפש שם / מ.א..."
                    className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs" />
                  <div className="max-h-32 overflow-y-auto border border-slate-100 rounded bg-white">
                    {soldierOptions.length === 0 ? (
                      <p className="text-[11px] text-slate-400 p-1.5 text-center">אין חיילים זמינים</p>
                    ) : soldierOptions.map((s) => (
                      <button key={s.id} type="button" onClick={() => pickSoldier(s)}
                        className="w-full text-right px-2 py-1.5 hover:bg-blue-50 flex justify-between text-xs border-b border-slate-100 last:border-0">
                        <span><b>{s.fullName}</b> {s.pn && <span className="font-mono text-slate-400">{s.pn}</span>}</span>
                        {s.companyName && <span className="text-slate-500">{s.companyName}</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {selectedSoldier && (
                <div className="mt-2 flex items-center justify-between text-xs bg-emerald-50 rounded p-2">
                  <span>🔗 <b>{selectedSoldier.fullName}</b></span>
                  <button type="button" onClick={() => setSelectedSoldier(null)} className="text-rose-500">בטל</button>
                </div>
              )}
            </div>
          )}
          {rep.soldierId && (
            <label className="flex items-center gap-2 text-xs cursor-pointer bg-rose-50 border border-rose-200 rounded p-2">
              <input type="checkbox" checked={unlinkSoldier} onChange={(e) => setUnlinkSoldier(e.target.checked)} />
              🔗❌ נתק קישור לחייל ברוסטר
            </label>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">שם מלא</label>
              <input name="fullName" required value={fullName} onChange={(e) => setFullName(e.target.value)}
                readOnly={!!selectedSoldier}
                className={`w-full rounded-lg border border-slate-300 px-3 py-2 text-sm ${selectedSoldier ? "bg-slate-100" : ""}`} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">תואר / תפקיד</label>
              <input name="title" value={title} onChange={(e) => setTitle(e.target.value)}
                placeholder='רס"פ, מ"פ, מ"פלג...'
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">נייד</label>
            <input name="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="05X-XXXXXXX"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">ביטול</button>
            <button disabled={busy} className="bg-emerald-600 text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50">
              {busy ? "שומר..." : "שמור"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
