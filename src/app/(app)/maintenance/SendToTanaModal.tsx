"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { sendSerialToTana, sendQtyToTana } from "./actions";

type Serial = { id: string; itemTypeId: string; itemName: string; serial: string; statusName: string; category: string | null };
type Balance = { itemTypeId: string; statusId: string; holderId: string; itemName: string; unit: string; statusName: string; quantity: number; category: string | null };

export default function SendToTanaModal({ serials, balances, label = "🔧 שלח לטנא" }: {
  serials: Serial[]; balances: Balance[]; label?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pickedSerialId, setPickedSerialId] = useState<string | null>(null);
  const [pickedQtyKey, setPickedQtyKey] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const filteredSerials = useMemo(() => {
    if (!search.trim()) return serials.slice(0, 30);
    const q = search.toLowerCase();
    return serials.filter((s) => s.itemName.toLowerCase().includes(q) || s.serial.toLowerCase().includes(q)).slice(0, 30);
  }, [serials, search]);
  const filteredBalances = useMemo(() => {
    if (!search.trim()) return balances.slice(0, 30);
    const q = search.toLowerCase();
    return balances.filter((b) => b.itemName.toLowerCase().includes(q)).slice(0, 30);
  }, [balances, search]);

  const pickedSerial = pickedSerialId ? serials.find((s) => s.id === pickedSerialId) : null;
  const pickedBalance = pickedQtyKey ? balances.find((b) => `${b.itemTypeId}:${b.statusId}:${b.holderId}` === pickedQtyKey) : null;

  const reset = () => { setPickedSerialId(null); setPickedQtyKey(null); setQty(1); setReason(""); setSearch(""); setError(null); };

  async function submit() {
    if (!pickedSerial && !pickedBalance) { setError("בחר פריט"); return; }
    if (!reason.trim()) { setError("הזן תיאור תקלה"); return; }
    setBusy(true); setError(null);
    try {
      const fd = new FormData();
      fd.append("reason", reason);
      let res: { ok?: boolean; error?: string };
      if (pickedSerial) {
        fd.append("serialUnitId", pickedSerial.id);
        res = await sendSerialToTana(fd);
      } else {
        fd.append("itemTypeId", pickedBalance!.itemTypeId);
        fd.append("fromHolderId", pickedBalance!.holderId);
        fd.append("statusId", pickedBalance!.statusId);
        fd.append("quantity", String(Math.min(qty, pickedBalance!.quantity)));
        res = await sendQtyToTana(fd);
      }
      if (res?.error) { setError(res.error); return; }
      reset(); setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="bg-amber-600 hover:bg-amber-700 text-white rounded-lg px-3 md:px-4 py-2 text-xs md:text-sm font-medium">
        {label}
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-2 md:p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[95vh] flex flex-col overflow-hidden">
        <div className="bg-gradient-to-r from-amber-600 to-amber-800 text-white p-4 flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-bold text-lg">🔧 שליחה לטנא</h3>
            <p className="text-xs text-amber-100 mt-0.5">בחר פריט תקול → תאר את התקלה → ✓ שלח</p>
          </div>
          <button onClick={() => { reset(); setOpen(false); }} className="text-amber-100 hover:text-white text-2xl">✕</button>
        </div>

        {!(pickedSerial || pickedBalance) ? (
          <>
            <div className="bg-amber-50 border-b border-amber-200 p-3 shrink-0">
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="חפש פריט / SN..." autoFocus
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white" />
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {filteredSerials.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-slate-600 mb-1.5 px-1">סריאליים ({filteredSerials.length})</h4>
                  <div className="space-y-1">
                    {filteredSerials.map((s) => (
                      <button key={s.id} type="button" onClick={() => setPickedSerialId(s.id)}
                        className="w-full text-right p-2.5 rounded-lg border border-slate-200 hover:bg-amber-50 hover:border-amber-300 flex items-center gap-2 text-sm">
                        <span className="text-lg">📦</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{s.itemName}{s.category && <span className="text-xs text-slate-400"> · {s.category}</span>}</div>
                          <div className="text-xs text-slate-500 font-mono">SN: {s.serial} · {s.statusName}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {filteredBalances.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-slate-600 mb-1.5 px-1">כמותיים ({filteredBalances.length})</h4>
                  <div className="space-y-1">
                    {filteredBalances.map((b) => {
                      const key = `${b.itemTypeId}:${b.statusId}:${b.holderId}`;
                      return (
                        <button key={key} type="button" onClick={() => { setPickedQtyKey(key); setQty(1); }}
                          className="w-full text-right p-2.5 rounded-lg border border-slate-200 hover:bg-amber-50 hover:border-amber-300 flex items-center gap-2 text-sm">
                          <span className="text-lg">📦</span>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">{b.itemName}{b.category && <span className="text-xs text-slate-400"> · {b.category}</span>}</div>
                            <div className="text-xs text-slate-500">{b.statusName} · קיים: {b.quantity} {b.unit}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {filteredSerials.length === 0 && filteredBalances.length === 0 && (
                <p className="text-center text-slate-400 py-10 text-sm">לא נמצא ציוד תואם</p>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {pickedSerial && (
                <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-3 flex items-center justify-between">
                  <div className="text-sm">
                    <div className="font-bold">📦 {pickedSerial.itemName}</div>
                    <div className="text-xs text-slate-600 font-mono">SN: {pickedSerial.serial} · {pickedSerial.statusName}</div>
                  </div>
                  <button type="button" onClick={() => setPickedSerialId(null)} className="text-xs text-rose-600 hover:underline">החלף פריט</button>
                </div>
              )}
              {pickedBalance && (
                <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm">
                      <div className="font-bold">📦 {pickedBalance.itemName}</div>
                      <div className="text-xs text-slate-600">{pickedBalance.statusName} · קיים: {pickedBalance.quantity} {pickedBalance.unit}</div>
                    </div>
                    <button type="button" onClick={() => setPickedQtyKey(null)} className="text-xs text-rose-600 hover:underline">החלף פריט</button>
                  </div>
                  <label className="block text-xs text-slate-600 mb-1">כמות לשליחה</label>
                  <input type="number" min={1} max={pickedBalance.quantity} value={qty}
                    onChange={(e) => setQty(Math.max(1, Math.min(pickedBalance.quantity, parseInt(e.target.value) || 1)))}
                    className="w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-sm bg-white" />
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">תיאור התקלה</label>
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={4}
                  placeholder="לדוגמה: 'נשבר אחיזת ידית', 'מנוע לא מתניע', 'בלאי בריצוף הפנימי'..."
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                <p className="text-xs text-slate-400 mt-1">התיאור יישמר בתעודה כדי שהטנא יידע מה לתקן</p>
              </div>
            </div>

            <div className="border-t border-slate-200 p-3 bg-white flex items-center justify-between gap-2 shrink-0">
              {error && <div className="flex-1 text-sm text-rose-700 font-medium">⚠️ {error}</div>}
              <div className="flex items-center gap-2 mr-auto">
                <button onClick={() => { reset(); setOpen(false); }} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">ביטול</button>
                <button onClick={submit} disabled={busy || !reason.trim()}
                  className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-lg px-5 py-2 text-sm font-bold">
                  {busy ? "שולח..." : "✓ שלח לטנא"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
