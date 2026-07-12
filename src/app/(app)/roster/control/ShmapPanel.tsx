"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";
import { openCallupBulk, closeCallupBulk, updateCallupDates } from "../../attendance/actions";

type Callup = { id: string; start: string; end: string | null };
type Sold = { id: string; name: string; company: string; squad: string | null; callup: Callup | null };

export default function ShmapPanel({ soldiers, today }: { soldiers: Sold[]; today: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [companyF, setCompanyF] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [actionDate, setActionDate] = useState(today);
  const [msg, setMsg] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null); // callup id being edited
  const [eStart, setEStart] = useState(""); const [eEnd, setEEnd] = useState("");

  const companies = useMemo(() => [...new Set(soldiers.map((s) => s.company))].sort(), [soldiers]);
  const filtered = useMemo(() => soldiers.filter((s) =>
    (!companyF || s.company === companyF) && (!q.trim() || s.name.includes(q.trim()))), [soldiers, q, companyF]);

  const isActive = (s: Sold) => s.callup && !s.callup.end;
  const toggle = (id: string) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selectAllFiltered = () => setSel(new Set(filtered.map((s) => s.id)));

  function run(fn: () => Promise<{ ok?: boolean; opened?: number; closed?: number; skipped?: number; error?: string }>, label: string) {
    setMsg(null);
    start(async () => {
      const r = await fn();
      if (r.error) { setMsg("⚠️ " + r.error); return; }
      const n = r.opened ?? r.closed ?? 0;
      setMsg(`✅ ${label}: ${n}${r.skipped ? ` (דולגו ${r.skipped})` : ""}`);
      setSel(new Set());
      router.refresh();
    });
  }

  return (
    <Card className="mb-4">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between p-3 text-right">
        <span className="font-bold text-slate-700">🟣 ניהול שמ״פ — פתיחה / סגירה / עריכת תאריכים</span>
        <span className="text-slate-400">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="p-3 border-t border-slate-100">
          {/* בקרות */}
          <div className="flex flex-wrap gap-2 items-center mb-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 חייל…" className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm flex-1 min-w-[120px]" />
            <select value={companyF} onChange={(e) => setCompanyF(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
              <option value="">כל הפלוגות</option>
              {companies.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <button onClick={selectAllFiltered} className="text-xs text-slate-500 underline">בחר הכל ({filtered.length})</button>
          </div>
          <div className="flex flex-wrap gap-2 items-center mb-2 bg-slate-50 rounded-lg p-2">
            <span className="text-xs text-slate-500">תאריך:</span>
            <input type="date" value={actionDate} onChange={(e) => setActionDate(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
            <button disabled={pending || sel.size === 0} onClick={() => run(() => openCallupBulk([...sel], actionDate), "נפתחו")}
              className="bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white rounded-lg px-3 py-1.5 text-sm font-medium">🟣 פתח שמ״פ ({sel.size})</button>
            <button disabled={pending || sel.size === 0} onClick={() => run(() => closeCallupBulk([...sel], actionDate), "נסגרו")}
              className="bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white rounded-lg px-3 py-1.5 text-sm font-medium">🔴 סגור שמ״פ ({sel.size})</button>
          </div>
          {msg && <div className="text-sm mb-2 text-slate-700">{msg}</div>}

          {/* רשימת חיילים */}
          <div className="space-y-1 max-h-[55vh] overflow-y-auto">
            {filtered.map((s) => (
              <div key={s.id} className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-2 py-1.5">
                <input type="checkbox" checked={sel.has(s.id)} onChange={() => toggle(s.id)} className="accent-purple-600" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-800 truncate">{s.name} <span className="text-[10px] text-slate-400">{s.company}{s.squad ? ` · ${s.squad}` : ""}</span></div>
                  {editId === s.callup?.id ? (
                    <div className="flex items-center gap-1 mt-1">
                      <input type="date" value={eStart} onChange={(e) => setEStart(e.target.value)} className="border border-slate-300 rounded px-1 py-0.5 text-xs" />
                      <span className="text-xs text-slate-400">→</span>
                      <input type="date" value={eEnd} onChange={(e) => setEEnd(e.target.value)} className="border border-slate-300 rounded px-1 py-0.5 text-xs" />
                      <button disabled={pending} onClick={() => { setMsg(null); start(async () => { const r = await updateCallupDates(s.callup!.id, eStart, eEnd || null); if (r.error) { setMsg("⚠️ " + r.error); return; } setEditId(null); router.refresh(); }); }}
                        className="text-xs bg-emerald-600 text-white rounded px-2 py-0.5">שמור</button>
                      <button onClick={() => setEditId(null)} className="text-xs text-slate-400 px-1">ביטול</button>
                    </div>
                  ) : (
                    <div className="text-[11px] leading-tight">
                      {isActive(s) ? <span className="text-purple-700">🟣 בשמ״פ מ-{s.callup!.start}{" "}(פתוח)</span>
                        : s.callup ? <span className="text-slate-500">שמ״פ אחרון: {s.callup.start} → {s.callup.end}</span>
                        : <span className="text-slate-300">לא בשמ״פ</span>}
                    </div>
                  )}
                </div>
                {s.callup && editId !== s.callup.id && (
                  <button onClick={() => { setEditId(s.callup!.id); setEStart(s.callup!.start); setEEnd(s.callup!.end ?? ""); }}
                    className="text-xs text-indigo-600 shrink-0">✏️ ערוך תאריכים</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
