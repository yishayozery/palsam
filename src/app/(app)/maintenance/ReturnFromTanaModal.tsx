"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { returnFromTana } from "./actions";

type SerialAtTana = {
  id: string; itemTypeId: string; itemName: string; serial: string;
  statusId: string; statusName: string; category: string | null; reason: string | null;
};
type QtyAtTana = {
  itemTypeId: string; statusId: string; itemName: string; unit: string;
  statusName: string; quantity: number; category: string | null; reason: string | null;
};
type Holder = { id: string; name: string; kind: string };

export default function ReturnFromTanaModal({ serials, balances, holders }: {
  serials: SerialAtTana[]; balances: QtyAtTana[]; holders: Holder[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [toHolderId, setToHolderId] = useState("");
  const [asOk, setAsOk] = useState(true);
  const [selectedSerials, setSelectedSerials] = useState<Set<string>>(new Set());
  const [qtyToReturn, setQtyToReturn] = useState<Map<string, number>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const totalSelected = useMemo(() =>
    selectedSerials.size + Array.from(qtyToReturn.values()).reduce((a, b) => a + b, 0),
    [selectedSerials, qtyToReturn]);

  const reset = () => { setToHolderId(""); setAsOk(true); setSelectedSerials(new Set()); setQtyToReturn(new Map()); setError(null); };

  function toggleSerial(id: string, checked: boolean) {
    setSelectedSerials((s) => { const n = new Set(s); if (checked) n.add(id); else n.delete(id); return n; });
  }
  function setQty(itemTypeId: string, statusId: string, val: number, max: number) {
    const key = `${itemTypeId}:${statusId}`;
    const v = Math.min(Math.max(0, val), max);
    setQtyToReturn((m) => { const n = new Map(m); if (v === 0) n.delete(key); else n.set(key, v); return n; });
  }

  async function submit() {
    if (!toHolderId) { setError("בחר יעד החזרה"); return; }
    if (totalSelected === 0) { setError("בחר לפחות פריט אחד"); return; }
    setBusy(true); setError(null);
    try {
      const fd = new FormData();
      fd.append("toHolderId", toHolderId);
      fd.append("asOk", asOk ? "true" : "false");
      for (const sid of selectedSerials) fd.append("serial", sid);
      for (const [key, val] of qtyToReturn) fd.append(`qty:${key}`, String(val));
      const res = await returnFromTana(fd);
      if (res?.error) { setError(res.error); return; }
      reset(); setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4 py-2 text-sm font-medium">
        ✓ תוקן + החזרה
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-2 md:p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[95vh] flex flex-col overflow-hidden">
        <div className="bg-gradient-to-r from-emerald-600 to-emerald-800 text-white p-4 flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-bold text-lg">✓ החזרה מהטנא</h3>
            <p className="text-xs text-emerald-100 mt-0.5">בחר פריטים שתוקנו → יעד החזרה → סטטוס → ✓ אשר</p>
          </div>
          <button onClick={() => { reset(); setOpen(false); }} className="text-emerald-100 hover:text-white text-2xl">✕</button>
        </div>

        <div className="bg-emerald-50 border-b border-emerald-200 p-3 shrink-0 space-y-2">
          <div>
            <label className="block text-[11px] text-slate-600 mb-0.5">יעד החזרה</label>
            <select value={toHolderId} onChange={(e) => setToHolderId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm bg-white">
              <option value="">— בחר יעד —</option>
              <optgroup label="🏪 מחסנים">
                {holders.filter((h) => h.kind === "WAREHOUSE").map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
              </optgroup>
              <optgroup label="🪖 פלוגות">
                {holders.filter((h) => h.kind === "COMPANY").map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
              </optgroup>
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-slate-600 mb-1">סטטוס</label>
            <div className="flex gap-2">
              <label className={`flex-1 px-3 py-1.5 rounded-lg border-2 cursor-pointer text-xs ${asOk ? "border-emerald-500 bg-emerald-50" : "border-slate-200 bg-white"}`}>
                <input type="radio" checked={asOk} onChange={() => setAsOk(true)} className="hidden" />
                ✓ תקין (תוקן)
              </label>
              <label className={`flex-1 px-3 py-1.5 rounded-lg border-2 cursor-pointer text-xs ${!asOk ? "border-amber-500 bg-amber-50" : "border-slate-200 bg-white"}`}>
                <input type="radio" checked={!asOk} onChange={() => setAsOk(false)} className="hidden" />
                ⚠️ עדיין תקול (העברה בלבד)
              </label>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {serials.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1.5 px-1">
                <h4 className="text-sm font-bold text-slate-700">סריאליים בטנא ({serials.length})</h4>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setSelectedSerials(new Set(serials.map((s) => s.id)))}
                    className="text-xs text-blue-600 hover:underline">סמן הכל</button>
                  {selectedSerials.size > 0 && (
                    <button type="button" onClick={() => setSelectedSerials(new Set())}
                      className="text-xs text-rose-500 hover:underline">נקה</button>
                  )}
                </div>
              </div>
              <div className="space-y-1.5">
                {serials.map((u) => {
                  const checked = selectedSerials.has(u.id);
                  return (
                    <label key={u.id} className={`flex items-start gap-2 p-2.5 rounded-lg border cursor-pointer ${checked ? "bg-emerald-50 border-emerald-300" : "bg-white border-slate-200 hover:bg-slate-50"}`}>
                      <input type="checkbox" checked={checked} onChange={(e) => toggleSerial(u.id, e.target.checked)} className="w-4 h-4 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">{u.itemName}{u.category && <span className="text-xs text-slate-500"> · {u.category}</span>}</div>
                        <div className="text-xs text-slate-500 font-mono">SN: {u.serial} · {u.statusName}</div>
                        {u.reason && <div className="text-[11px] text-rose-700 mt-0.5 line-clamp-2">⚠️ {u.reason}</div>}
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {balances.length > 0 && (
            <div>
              <h4 className="text-sm font-bold text-slate-700 mb-1.5 px-1">כמותיים בטנא ({balances.length})</h4>
              <div className="space-y-1.5">
                {balances.map((b) => {
                  const key = `${b.itemTypeId}:${b.statusId}`;
                  const cur = qtyToReturn.get(key) ?? 0;
                  return (
                    <div key={key} className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-200 bg-white">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">{b.itemName}</div>
                        <div className="text-xs text-slate-500">{b.statusName} · קיים: <b>{b.quantity} {b.unit}</b></div>
                        {b.reason && <div className="text-[11px] text-rose-700 mt-0.5 line-clamp-2">⚠️ {b.reason}</div>}
                      </div>
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={() => setQty(b.itemTypeId, b.statusId, cur - 1, b.quantity)} className="w-7 h-7 rounded-lg border border-slate-300 text-sm">−</button>
                        <input type="number" min={0} max={b.quantity} value={cur}
                          onChange={(e) => setQty(b.itemTypeId, b.statusId, parseInt(e.target.value) || 0, b.quantity)}
                          className="w-14 rounded-lg border border-slate-300 px-1 py-1 text-sm text-center" />
                        <button type="button" onClick={() => setQty(b.itemTypeId, b.statusId, cur + 1, b.quantity)} className="w-7 h-7 rounded-lg border border-slate-300 text-sm">+</button>
                        <button type="button" onClick={() => setQty(b.itemTypeId, b.statusId, b.quantity, b.quantity)} className="text-[10px] text-emerald-700 hover:underline mr-1">הכל</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-slate-200 p-3 bg-white flex items-center justify-between gap-2 shrink-0">
          {error && <div className="flex-1 text-sm text-rose-700 font-medium">⚠️ {error}</div>}
          <div className="flex items-center gap-2 mr-auto">
            <button onClick={() => { reset(); setOpen(false); }} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">ביטול</button>
            <button onClick={submit} disabled={busy || totalSelected === 0 || !toHolderId}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg px-5 py-2 text-sm font-bold">
              {busy ? "מחזיר..." : `✓ החזר ${totalSelected} יחידות`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
