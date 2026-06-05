"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { checkinSerial } from "./actions";

type Unit = {
  id: string; serial: string; itemName: string;
  soldierId: string; soldierName: string; soldierPN: string | null; companyName: string | null;
  statusId: string; statusName: string; isWear: boolean; isLoss: boolean;
};
type Status = { id: string; name: string; isWear: boolean; isLoss: boolean; isDefault: boolean };

export default function CheckinModal({ signedUnits, statuses }: {
  signedUnits: Unit[]; statuses: Status[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [soldierId, setSoldierId] = useState("");
  const [soldierSearch, setSoldierSearch] = useState("");
  const [selectedUnits, setSelectedUnits] = useState<Set<string>>(new Set());
  const [newStatusId, setNewStatusId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // חיילים שיש להם ציוד חתום
  const soldiers = useMemo(() => {
    const map = new Map<string, { id: string; name: string; pn: string | null; companyName: string | null; count: number }>();
    for (const u of signedUnits) {
      if (!map.has(u.soldierId)) {
        map.set(u.soldierId, { id: u.soldierId, name: u.soldierName, pn: u.soldierPN, companyName: u.companyName, count: 0 });
      }
      map.get(u.soldierId)!.count++;
    }
    let list = Array.from(map.values());
    if (soldierSearch.trim()) {
      const q = soldierSearch.toLowerCase();
      list = list.filter((s) => s.name.toLowerCase().includes(q) || (s.pn ?? "").includes(q));
    }
    return list;
  }, [signedUnits, soldierSearch]);

  const selectedSoldier = soldiers.find((s) => s.id === soldierId);
  const soldierUnits = useMemo(() => signedUnits.filter((u) => u.soldierId === soldierId), [signedUnits, soldierId]);

  const reset = () => { setSoldierId(""); setSoldierSearch(""); setSelectedUnits(new Set()); setNewStatusId(""); setError(null); };

  async function submit() {
    if (selectedUnits.size === 0) { setError("בחר לפחות יחידה אחת לזיכוי"); return; }
    setBusy(true); setError(null);
    try {
      // checkinSerial מטפל ביחידה אחת בכל קריאה (יש לקרוא לכל יחידה)
      for (const unitId of selectedUnits) {
        const fd = new FormData();
        fd.append("serialUnitId", unitId);
        if (newStatusId) fd.append("statusId", newStatusId);
        await checkinSerial(fd);
      }
      reset();
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="bg-amber-600 hover:bg-amber-700 text-white rounded-lg px-4 py-2 text-sm font-medium">
        ↩️ זיכוי חייל
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-2 md:p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[95vh] flex flex-col overflow-hidden">
        <div className="bg-gradient-to-r from-amber-600 to-amber-800 text-white p-4 flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-bold text-lg">↩️ זיכוי חייל</h3>
            <p className="text-xs text-amber-100 mt-0.5">בחר חייל → סמן ציוד להחזרה → סטטוס (תקין/בלאי) → ✓ אשר</p>
          </div>
          <button onClick={() => { reset(); setOpen(false); }} className="text-amber-100 hover:text-white text-2xl">✕</button>
        </div>

        {/* בחירת חייל */}
        <div className="bg-amber-50 border-b border-amber-200 p-3 shrink-0">
          <div className="flex gap-2 items-end flex-wrap">
            <div className="flex-1 min-w-40">
              <label className="block text-[11px] text-slate-600 mb-0.5">חיפוש שם / מ.א.</label>
              <input value={soldierSearch} onChange={(e) => setSoldierSearch(e.target.value)} placeholder="הקלד..."
                className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm bg-white" />
            </div>
            <div className="flex-[2] min-w-48">
              <label className="block text-[11px] text-slate-600 mb-0.5">חייל ({soldiers.length} חתומים)</label>
              <select value={soldierId} onChange={(e) => { setSoldierId(e.target.value); setSelectedUnits(new Set()); }}
                className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm bg-white">
                <option value="">— בחר חייל —</option>
                {soldiers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}{s.pn ? ` (${s.pn})` : ""}{s.companyName ? ` · ${s.companyName}` : ""} — {s.count} פריטים
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* רשימת ציוד החייל */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {!soldierId ? (
            <p className="text-center text-slate-400 py-10 text-sm">בחר חייל מהרשימה</p>
          ) : soldierUnits.length === 0 ? (
            <p className="text-center text-slate-400 py-10 text-sm">אין ציוד חתום על {selectedSoldier?.name}</p>
          ) : (
            <>
              <div className="flex items-center justify-between mb-2 px-1">
                <span className="text-sm font-bold text-slate-700">ציוד של {selectedSoldier?.name} ({soldierUnits.length})</span>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setSelectedUnits(new Set(soldierUnits.map((u) => u.id)))}
                    className="text-xs text-blue-600 hover:underline">סמן הכל</button>
                  {selectedUnits.size > 0 && (
                    <button type="button" onClick={() => setSelectedUnits(new Set())}
                      className="text-xs text-rose-500 hover:underline">נקה</button>
                  )}
                </div>
              </div>
              {soldierUnits.map((u) => {
                const checked = selectedUnits.has(u.id);
                return (
                  <label key={u.id} className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer ${checked ? "bg-amber-50 border-amber-300" : "bg-white border-slate-200 hover:bg-slate-50"}`}>
                    <input type="checkbox" checked={checked}
                      onChange={(e) => setSelectedUnits((s) => {
                        const n = new Set(s);
                        if (e.target.checked) n.add(u.id); else n.delete(u.id);
                        return n;
                      })}
                      className="w-4 h-4" />
                    <span className="text-lg">📦</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{u.itemName}</div>
                      <div className="text-xs text-slate-500 font-mono">SN: {u.serial} · {u.statusName}{u.isWear && " 🟡"}{u.isLoss && " 🔴"}</div>
                    </div>
                  </label>
                );
              })}
            </>
          )}
        </div>

        {/* סטטוס חדש בהחזרה + אישור */}
        {soldierId && selectedUnits.size > 0 && (
          <div className="bg-slate-50 border-t border-slate-200 p-3 shrink-0">
            <label className="block text-[11px] text-slate-600 mb-1">סטטוס בהחזרה (אופציונלי — אם הציוד חזר תקול)</label>
            <div className="flex gap-1.5 flex-wrap">
              <label className={`px-3 py-1.5 rounded-full text-xs border-2 cursor-pointer transition ${newStatusId === "" ? "border-slate-400 bg-white" : "border-transparent bg-slate-100"}`}>
                <input type="radio" checked={newStatusId === ""} onChange={() => setNewStatusId("")} className="hidden" />
                ללא שינוי
              </label>
              {statuses.map((s) => (
                <label key={s.id} className={`px-3 py-1.5 rounded-full text-xs font-medium border-2 cursor-pointer transition ${newStatusId === s.id ? "border-amber-500 ring-2 ring-amber-200" : "border-transparent"} ${s.isLoss ? "bg-rose-100 text-rose-700" : s.isWear ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
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
            <button onClick={submit} disabled={busy || selectedUnits.size === 0}
              className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-lg px-5 py-2 text-sm font-bold">
              {busy ? "מזכה..." : `✓ זכה ${selectedUnits.size} יחידות`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
