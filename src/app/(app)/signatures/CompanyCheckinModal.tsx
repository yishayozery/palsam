"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { companyReturn } from "./company-actions";
import { useEscClose } from "@/lib/useEscClose";

type Company = { id: string; name: string };
type SerialAtCompany = {
  id: string; itemTypeId: string; itemName: string; serial: string;
  companyId: string; statusId: string; statusName: string;
  isWear: boolean; isLoss: boolean;
  lotQuantity: number | null;
};
type QtyAtCompany = {
  companyId: string; itemTypeId: string; statusId: string;
  itemName: string; unit: string; statusName: string; quantity: number;
  isWear: boolean; isLoss: boolean;
};
type Status = { id: string; name: string; isWear: boolean; isLoss: boolean; isDefault: boolean };

/** פיצול: כל סריאל יכול לקבל qty חלקי + סטטוס פרטני שדורס את הגלובלי */
type SerialPick = { lotQty?: number; statusOverride?: string };

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
  const [serialPicks, setSerialPicks] = useState<Map<string, SerialPick>>(new Map());
  const [qtyToReturn, setQtyToReturn] = useState<Map<string, number>>(new Map());
  const [qtyOverrides, setQtyOverrides] = useState<Map<string, string>>(new Map()); // key→statusId
  const [newStatusId, setNewStatusId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lotPicker, setLotPicker] = useState<{ unit: SerialAtCompany; qty: number } | null>(null);

  useEscClose(open && !lotPicker, () => { reset(); setOpen(false); });

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
    setCompanyId(""); setSelectedSerials(new Set()); setSerialPicks(new Map());
    setQtyToReturn(new Map()); setQtyOverrides(new Map());
    setNewStatusId(""); setError(null);
  };

  function toggleSerial(u: SerialAtCompany, checked: boolean) {
    if (checked && u.lotQuantity && u.lotQuantity > 1) {
      // אצווה — פותחים דיאלוג כדי לוודא לוט נכון + כמות
      setLotPicker({ unit: u, qty: u.lotQuantity });
      return;
    }
    setSelectedSerials((s) => {
      const n = new Set(s);
      if (checked) n.add(u.id); else n.delete(u.id);
      return n;
    });
    if (!checked) {
      setSerialPicks((m) => { const n = new Map(m); n.delete(u.id); return n; });
    }
  }
  function confirmLotPick() {
    if (!lotPicker) return;
    const { unit, qty } = lotPicker;
    if (qty < 1 || qty > (unit.lotQuantity ?? 1)) return;
    setSelectedSerials((s) => new Set(s).add(unit.id));
    setSerialPicks((m) => {
      const n = new Map(m);
      const existing = n.get(unit.id) ?? {};
      n.set(unit.id, { ...existing, lotQty: qty < (unit.lotQuantity ?? 1) ? qty : undefined });
      return n;
    });
    setLotPicker(null);
  }
  function setSerialStatus(id: string, statusId: string | undefined) {
    setSerialPicks((m) => {
      const n = new Map(m);
      const ex = n.get(id) ?? {};
      n.set(id, { ...ex, statusOverride: statusId });
      return n;
    });
  }
  function setQtyStatus(itemTypeId: string, fromStatusId: string, statusId: string | undefined) {
    const key = `${itemTypeId}:${fromStatusId}`;
    setQtyOverrides((m) => {
      const n = new Map(m);
      if (statusId) n.set(key, statusId); else n.delete(key);
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
      for (const sid of selectedSerials) {
        fd.append("serial", sid);
        const p = serialPicks.get(sid);
        if (p?.lotQty) fd.append(`lotQty:${sid}`, String(p.lotQty));
        if (p?.statusOverride) fd.append(`serialStatus:${sid}`, p.statusOverride);
      }
      for (const [key, val] of qtyToReturn) {
        fd.append(`qty:${key}`, String(val));
        const ov = qtyOverrides.get(key);
        if (ov) fd.append(`qtyStatus:${key}`, ov);
      }
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
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[95vh] flex flex-col overflow-hidden relative">
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
                      const isLot = !!u.lotQuantity && u.lotQuantity > 1;
                      const pick = serialPicks.get(u.id);
                      return (
                        <div key={u.id} className={`p-2.5 rounded-lg border ${checked ? (isLot ? "bg-orange-50 border-orange-300" : "bg-purple-50 border-purple-300") : "bg-white border-slate-200 hover:bg-slate-50"}`}>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={checked} onChange={(e) => toggleSerial(u, e.target.checked)} className="w-4 h-4" />
                            <span className="text-lg">{isLot ? "💣" : "📦"}</span>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm truncate">
                                {u.itemName}
                                {isLot && (
                                  <span className="mr-1 text-[10px] bg-orange-100 text-orange-800 rounded px-1.5 py-0.5">
                                    אצווה {pick?.lotQty ? `· מזכה ${pick.lotQty}/${u.lotQuantity}` : `× ${u.lotQuantity}`}
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-slate-500 font-mono">
                                {isLot ? `לוט: ${u.serial}` : `SN: ${u.serial}`} · {u.statusName}{u.isWear && " 🟡"}{u.isLoss && " 🔴"}
                              </div>
                            </div>
                            {checked && isLot && (
                              <button type="button" onClick={(e) => { e.preventDefault(); setLotPicker({ unit: u, qty: pick?.lotQty ?? (u.lotQuantity ?? 1) }); }}
                                className="text-xs text-orange-700 hover:underline">✎ כמות</button>
                            )}
                          </label>
                          {/* סטטוס פרטני לשורה — מאפשר ערבוב תקין/פגום */}
                          {checked && (
                            <div className="mt-2 mr-7 pt-2 border-t border-slate-200">
                              <span className="text-[10px] text-slate-500 ml-2">סטטוס בהחזרה לשורה זו:</span>
                              <div className="inline-flex gap-1 flex-wrap mt-1">
                                <button type="button" onClick={() => setSerialStatus(u.id, undefined)}
                                  className={`text-[10px] px-2 py-0.5 rounded-full border ${!pick?.statusOverride ? "bg-slate-200 border-slate-400" : "border-slate-200"}`}>
                                  כללי
                                </button>
                                {statuses.map((s) => (
                                  <button key={s.id} type="button" onClick={() => setSerialStatus(u.id, s.id)}
                                    className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${pick?.statusOverride === s.id ? "ring-1 ring-purple-400" : "border-transparent"} ${s.isLoss ? "bg-rose-100 text-rose-700" : s.isWear ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                                    {s.name}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
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
                      const ov = qtyOverrides.get(key);
                      return (
                        <div key={key} className={`p-2.5 rounded-lg border ${cur > 0 ? "border-purple-300 bg-purple-50/30" : "border-slate-200 bg-white"}`}>
                          <div className="flex items-center gap-2">
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
                          {/* סטטוס פרטני לשורה — חלק תקין חלק תקול */}
                          {cur > 0 && (
                            <div className="mt-2 pt-2 border-t border-slate-200">
                              <span className="text-[10px] text-slate-500 ml-2">סטטוס לשורה:</span>
                              <div className="inline-flex gap-1 flex-wrap mt-1">
                                <button type="button" onClick={() => setQtyStatus(b.itemTypeId, b.statusId, undefined)}
                                  className={`text-[10px] px-2 py-0.5 rounded-full border ${!ov ? "bg-slate-200 border-slate-400" : "border-slate-200"}`}>
                                  כללי
                                </button>
                                {statuses.map((s) => (
                                  <button key={s.id} type="button" onClick={() => setQtyStatus(b.itemTypeId, b.statusId, s.id)}
                                    className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${ov === s.id ? "ring-1 ring-purple-400" : "border-transparent"} ${s.isLoss ? "bg-rose-100 text-rose-700" : s.isWear ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                                    {s.name}
                                  </button>
                                ))}
                              </div>
                              <p className="text-[10px] text-slate-400 mt-1 ml-2">
                                💡 רוצה לפצל לשני חלקים (תקין + פגום)? עדכן כאן את הכמות לחלק התקין, ולחץ <b>+ זכה שוב</b> אחרי השליחה לשורת הפגומים.
                              </p>
                            </div>
                          )}
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
            <label className="block text-[11px] text-slate-600 mb-1">
              סטטוס ברירת מחדל לכל השורות (אפשר לדרוס פר-שורה למעלה)
            </label>
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

        {/* דיאלוג אצווה */}
        {lotPicker && (
          <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-10 p-3" onClick={() => setLotPicker(null)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="bg-gradient-to-r from-orange-500 to-orange-700 text-white p-4">
                <h3 className="font-bold text-lg">⚠️ זיכוי אצווה מהפלוגה</h3>
                <p className="text-xs text-orange-100 mt-1">ודא שזה הלוט הנכון, ובחר כמה לזכות</p>
              </div>
              <div className="p-5 space-y-3">
                <div className="bg-orange-50 border-2 border-orange-300 rounded-lg p-3 flex items-start gap-3">
                  <span className="text-3xl">💣</span>
                  <div className="flex-1">
                    <div className="font-bold text-lg">{lotPicker.unit.itemName}</div>
                    <div className="text-xs text-slate-600 mt-1">מס׳ לוט: <span className="font-mono font-bold">{lotPicker.unit.serial}</span></div>
                    <div className="text-xs text-slate-600">סטטוס: {lotPicker.unit.statusName}</div>
                    <div className="text-xs text-slate-600">סה״כ באצווה: <span className="font-bold text-orange-700">{lotPicker.unit.lotQuantity}</span></div>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">כמות לזיכוי</label>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setLotPicker((p) => p ? { ...p, qty: Math.max(1, p.qty - 1) } : p)}
                      className="w-10 h-10 rounded-lg border border-slate-300 text-lg font-bold">−</button>
                    <input type="number" min={1} max={lotPicker.unit.lotQuantity ?? 1} value={lotPicker.qty}
                      onChange={(e) => setLotPicker((p) => p ? { ...p, qty: Math.max(1, Math.min(lotPicker.unit.lotQuantity ?? 1, parseInt(e.target.value) || 1)) } : p)}
                      className="flex-1 rounded-lg border-2 border-orange-300 px-3 py-2 text-2xl font-bold text-center" autoFocus />
                    <button type="button" onClick={() => setLotPicker((p) => p ? { ...p, qty: Math.min(lotPicker.unit.lotQuantity ?? 1, p.qty + 1) } : p)}
                      className="w-10 h-10 rounded-lg border border-slate-300 text-lg font-bold">+</button>
                  </div>
                  <div className="flex justify-between mt-2 text-xs">
                    <button type="button" onClick={() => setLotPicker((p) => p ? { ...p, qty: 1 } : p)} className="text-blue-600 hover:underline">1 בלבד</button>
                    <button type="button" onClick={() => setLotPicker((p) => p ? { ...p, qty: Math.floor((lotPicker.unit.lotQuantity ?? 1) / 2) } : p)} className="text-blue-600 hover:underline">חצי</button>
                    <button type="button" onClick={() => setLotPicker((p) => p ? { ...p, qty: lotPicker.unit.lotQuantity ?? 1 } : p)} className="text-blue-600 hover:underline">הכל ({lotPicker.unit.lotQuantity})</button>
                  </div>
                  {lotPicker.qty < (lotPicker.unit.lotQuantity ?? 1) && (
                    <p className="text-[11px] text-amber-700 mt-2 bg-amber-50 rounded p-2">
                      ℹ️ <b>{lotPicker.qty}</b> יחזרו למחסן, <b>{(lotPicker.unit.lotQuantity ?? 1) - lotPicker.qty}</b> יישארו אצל הפלוגה.
                    </p>
                  )}
                </div>
              </div>
              <div className="p-3 border-t border-slate-200 flex gap-2">
                <button onClick={() => setLotPicker(null)} className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm">ביטול</button>
                <button onClick={confirmLotPick} className="flex-1 bg-orange-600 hover:bg-orange-700 text-white rounded-lg px-4 py-2.5 text-sm font-bold">
                  ✓ זכה {lotPicker.qty}
                </button>
              </div>
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
