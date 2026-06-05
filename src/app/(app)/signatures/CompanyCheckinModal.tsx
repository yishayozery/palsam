"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { companyReturn } from "./company-actions";

type Company = { id: string; name: string };
type SerialAtCompany = {
  id: string; itemTypeId: string; itemName: string; serial: string;
  companyId: string; statusId: string; statusName: string;
  isWear: boolean; isLoss: boolean;
};
type QtyAtCompany = {
  companyId: string; itemTypeId: string; statusId: string;
  itemName: string; unit: string; statusName: string; quantity: number;
  isWear: boolean; isLoss: boolean;
};
type Status = { id: string; name: string; isWear: boolean; isLoss: boolean; isDefault: boolean };

export default function CompanyCheckinModal({
  companies, serials, balances, statuses,
}: {
  companies: Company[];
  serials: SerialAtCompany[];
  balances: QtyAtCompany[];
  statuses: Status[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [companyId, setCompanyId] = useState("");
  const [selectedSerials, setSelectedSerials] = useState<Set<string>>(new Set());
  const [qtyToReturn, setQtyToReturn] = useState<Map<string, number>>(new Map()); // key: itemTypeId:statusId
  const [newStatusId, setNewStatusId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // פלוגות עם ציוד חתום
  const companiesWithStock = useMemo(() => {
    const ids = new Set<string>();
    for (const s of serials) ids.add(s.companyId);
    for (const b of balances) ids.add(b.companyId);
    return companies.filter((c) => ids.has(c.id))
      .map((c) => {
        const sCount = serials.filter((s) => s.companyId === c.id).length;
        const qCount = balances.filter((b) => b.companyId === c.id).reduce((a, b) => a + b.quantity, 0);
        return { ...c, sCount, qCount };
      });
  }, [companies, serials, balances]);

  const compSerials = useMemo(() => serials.filter((s) => s.companyId === companyId), [serials, companyId]);
  const compBalances = useMemo(() => balances.filter((b) => b.companyId === companyId), [balances, companyId]);

  const reset = () => {
    setCompanyId(""); setSelectedSerials(new Set()); setQtyToReturn(new Map()); setNewStatusId(""); setError(null);
  };

  function toggleSerial(id: string, checked: boolean) {
    setSelectedSerials((s) => {
      const n = new Set(s);
      if (checked) n.add(id); else n.delete(id);
      return n;
    });
  }
  function setQty(itemTypeId: string, statusId: string, val: number, max: number) {
    const key = `${itemTypeId}:${statusId}`;
    const v = Math.min(Math.max(0, val), max);
    setQtyToReturn((m) => { const n = new Map(m); if (v === 0) n.delete(key); else n.set(key, v); return n; });
  }

  const totalSelected = selectedSerials.size + Array.from(qtyToReturn.values()).reduce((a, b) => a + b, 0);

  async function submit() {
    if (!companyId || totalSelected === 0) { setError("בחר פלוגה ולפחות פריט אחד"); return; }
    setBusy(true); setError(null);
    try {
      const fd = new FormData();
      fd.append("companyId", companyId);
      if (newStatusId) fd.append("newStatusId", newStatusId);
      for (const sid of selectedSerials) fd.append("serial", sid);
      for (const [key, val] of qtyToReturn) fd.append(`qty:${key}`, String(val));
      const res = await companyReturn(fd);
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
        className="bg-purple-600 hover:bg-purple-700 text-white rounded-lg px-4 py-2 text-sm font-medium">
        ↩️ זיכוי פלוגה
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-2 md:p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[95vh] flex flex-col overflow-hidden">
        <div className="bg-gradient-to-r from-purple-600 to-purple-800 text-white p-4 flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-bold text-lg">↩️ זיכוי פלוגה</h3>
            <p className="text-xs text-purple-100 mt-0.5">בחר פלוגה → סמן ציוד / כמויות להחזרה → סטטוס → ✓ אשר</p>
          </div>
          <button onClick={() => { reset(); setOpen(false); }} className="text-purple-100 hover:text-white text-2xl">✕</button>
        </div>

        {/* בחירת פלוגה */}
        <div className="bg-purple-50 border-b border-purple-200 p-3 shrink-0">
          <label className="block text-[11px] text-slate-600 mb-0.5">פלוגה ({companiesWithStock.length} עם ציוד חתום)</label>
          <select value={companyId} onChange={(e) => { setCompanyId(e.target.value); setSelectedSerials(new Set()); setQtyToReturn(new Map()); }}
            className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm bg-white">
            <option value="">— בחר פלוגה —</option>
            {companiesWithStock.map((c) => (
              <option key={c.id} value={c.id}>
                🪖 {c.name} — {c.sCount} סריאליים + {c.qCount} יח׳ כמותיים
              </option>
            ))}
          </select>
        </div>

        {/* רשימת ציוד */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {!companyId ? (
            <p className="text-center text-slate-400 py-10 text-sm">בחר פלוגה מהרשימה</p>
          ) : (
            <>
              {/* סריאליים */}
              {compSerials.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-1.5 px-1">
                    <h4 className="text-sm font-bold text-slate-700">פריטים סריאליים ({compSerials.length})</h4>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setSelectedSerials(new Set(compSerials.map((u) => u.id)))}
                        className="text-xs text-blue-600 hover:underline">סמן הכל</button>
                      {selectedSerials.size > 0 && (
                        <button type="button" onClick={() => setSelectedSerials(new Set())}
                          className="text-xs text-rose-500 hover:underline">נקה</button>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    {compSerials.map((u) => {
                      const checked = selectedSerials.has(u.id);
                      return (
                        <label key={u.id} className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer ${checked ? "bg-purple-50 border-purple-300" : "bg-white border-slate-200 hover:bg-slate-50"}`}>
                          <input type="checkbox" checked={checked} onChange={(e) => toggleSerial(u.id, e.target.checked)} className="w-4 h-4" />
                          <span className="text-lg">📦</span>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate">{u.itemName}</div>
                            <div className="text-xs text-slate-500 font-mono">SN: {u.serial} · {u.statusName}{u.isWear && " 🟡"}{u.isLoss && " 🔴"}</div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* כמותיים */}
              {compBalances.length > 0 && (
                <div>
                  <h4 className="text-sm font-bold text-slate-700 mb-1.5 px-1">פריטים כמותיים ({compBalances.length})</h4>
                  <div className="space-y-1.5">
                    {compBalances.map((b) => {
                      const key = `${b.itemTypeId}:${b.statusId}`;
                      const cur = qtyToReturn.get(key) ?? 0;
                      return (
                        <div key={key} className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-200 bg-white">
                          <span className="text-lg">📦</span>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate">{b.itemName}</div>
                            <div className="text-xs text-slate-500">{b.statusName}{b.isWear && " 🟡"}{b.isLoss && " 🔴"} · קיים: <b>{b.quantity} {b.unit}</b></div>
                          </div>
                          <div className="flex items-center gap-1">
                            <button type="button" onClick={() => setQty(b.itemTypeId, b.statusId, Math.max(0, cur - 1), b.quantity)}
                              className="w-7 h-7 rounded-lg border border-slate-300 text-sm">−</button>
                            <input type="number" min={0} max={b.quantity} value={cur}
                              onChange={(e) => setQty(b.itemTypeId, b.statusId, parseInt(e.target.value) || 0, b.quantity)}
                              className="w-14 rounded-lg border border-slate-300 px-1 py-1 text-sm text-center" />
                            <button type="button" onClick={() => setQty(b.itemTypeId, b.statusId, cur + 1, b.quantity)}
                              className="w-7 h-7 rounded-lg border border-slate-300 text-sm">+</button>
                            <button type="button" onClick={() => setQty(b.itemTypeId, b.statusId, b.quantity, b.quantity)}
                              className="text-[10px] text-purple-600 hover:underline mr-1">הכל</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {compSerials.length === 0 && compBalances.length === 0 && (
                <p className="text-center text-slate-400 py-10 text-sm">לפלוגה זו אין ציוד חתום</p>
              )}
            </>
          )}
        </div>

        {/* סטטוס חדש */}
        {companyId && totalSelected > 0 && (
          <div className="bg-slate-50 border-t border-slate-200 p-3 shrink-0">
            <label className="block text-[11px] text-slate-600 mb-1">סטטוס בהחזרה (אופציונלי — אם הציוד חזר תקול)</label>
            <div className="flex gap-1.5 flex-wrap">
              <label className={`px-3 py-1.5 rounded-full text-xs border-2 cursor-pointer ${newStatusId === "" ? "border-slate-400 bg-white" : "border-transparent bg-slate-100"}`}>
                <input type="radio" checked={newStatusId === ""} onChange={() => setNewStatusId("")} className="hidden" />
                ללא שינוי
              </label>
              {statuses.map((s) => (
                <label key={s.id} className={`px-3 py-1.5 rounded-full text-xs font-medium border-2 cursor-pointer ${newStatusId === s.id ? "border-purple-500 ring-2 ring-purple-200" : "border-transparent"} ${s.isLoss ? "bg-rose-100 text-rose-700" : s.isWear ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                  <input type="radio" checked={newStatusId === s.id} onChange={() => setNewStatusId(s.id)} className="hidden" />
                  {s.name}
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="border-t border-slate-200 p-3 bg-white flex items-center justify-between gap-2 shrink-0">
          {error && <div className="flex-1 text-sm text-rose-700 font-medium">⚠️ {error}</div>}
          <div className="flex items-center gap-2 mr-auto">
            <button onClick={() => { reset(); setOpen(false); }} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">ביטול</button>
            <button onClick={submit} disabled={busy || totalSelected === 0}
              className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg px-5 py-2 text-sm font-bold">
              {busy ? "מזכה..." : `✓ זכה ${totalSelected} יחידות`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
