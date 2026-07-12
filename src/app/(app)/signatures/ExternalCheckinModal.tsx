"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { externalCheckin } from "./external-actions";
import { useEscClose } from "@/lib/useEscClose";

type Held = { id: string; itemName: string; serial: string; holder: string; status: string };

export default function ExternalCheckinModal({ warehouses, defaultWarehouseId, held }: {
  warehouses: { id: string; name: string }[]; defaultWarehouseId: string | null; held: Held[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState(defaultWarehouseId ?? warehouses[0]?.id ?? "");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEscClose(open, () => setOpen(false));

  const filt = useMemo(() => search ? held.filter((h) => h.itemName.includes(search) || h.serial.includes(search) || h.holder.includes(search)) : held, [held, search]);
  function toggle(id: string) { setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }); }

  async function submit() {
    setErr(null);
    if (!target) { setErr("בחר מחסן יעד"); return; }
    if (picked.size === 0) { setErr("בחר לפחות פריט"); return; }
    setBusy(true);
    const r = await externalCheckin({ warehouseId: target, serialUnitIds: [...picked], qtyItems: [] });
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    setPicked(new Set()); setOpen(false);
    router.push(`/transfers/${r.transferId}/document`);
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="bg-white border border-emerald-300 text-emerald-700 rounded-lg px-3 py-2 text-xs md:text-sm font-medium hover:bg-emerald-50">
        ↩️ זיכוי חוץ ({held.length})
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start sm:items-center justify-center p-0 sm:p-4 overflow-y-auto" dir="rtl">
          <div className="bg-white w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl max-h-[92dvh] flex flex-col overflow-hidden">
            <div className="bg-gradient-to-r from-emerald-700 to-emerald-800 text-white p-4 flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-bold text-lg">↩️ זיכוי חוץ</h3>
                <p className="text-xs text-emerald-200 mt-0.5">קבלת ציוד חזרה מגורם חיצוני למחסן</p>
              </div>
              <button onClick={() => setOpen(false)} className="text-emerald-200 hover:text-white text-2xl">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              <div>
                <label className="block text-[11px] text-slate-600 mb-1">מחסן יעד</label>
                <select value={target} onChange={(e) => setTarget(e.target.value)} className="w-full border border-slate-300 rounded-lg px-2 py-2 text-sm bg-white">
                  {warehouses.length === 0 && <option value="">— אין מחסן —</option>}
                  {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 חיפוש פריט / גורם…" className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
              <div className="space-y-1 max-h-72 overflow-y-auto">
                {filt.map((h) => (
                  <label key={h.id} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 cursor-pointer ${picked.has(h.id) ? "bg-emerald-50 border border-emerald-200" : "bg-slate-50"}`}>
                    <input type="checkbox" checked={picked.has(h.id)} onChange={() => toggle(h.id)} className="accent-emerald-600" />
                    <span className="text-sm flex-1">{h.itemName} <span className="font-mono text-[11px] text-slate-500">{h.serial}</span> <span className="text-[10px] text-slate-400">· {h.status}</span></span>
                    <span className="text-[11px] text-indigo-700">🌐 {h.holder}</span>
                  </label>
                ))}
                {filt.length === 0 && <div className="text-center text-slate-400 text-sm py-4">אין ציוד אצל גורמי חוץ.</div>}
              </div>
              {err && <p className="text-rose-600 text-sm text-center">{err}</p>}
            </div>
            <div className="border-t border-slate-200 p-3 bg-white shrink-0 flex items-center gap-2">
              <button onClick={() => setOpen(false)} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm">ביטול</button>
              <button onClick={submit} disabled={busy || picked.size === 0 || !target} className="flex-1 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white rounded-lg px-4 py-2.5 text-sm font-bold">
                {busy ? "מזכה…" : `↩️ זכה למחסן (${picked.size})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
