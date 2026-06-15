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

type CartSerial = { type: "serial"; uid: number; unitId: string; itemName: string; serial: string;
  statusName: string; lotQty?: number; lotTotal?: number; statusOverride?: string };
type CartQty = { type: "qty"; uid: number; itemTypeId: string; statusId: string;
  itemName: string; unit: string; statusName: string;
  available: number; quantity: number; statusOverride?: string };
type CartItem = CartSerial | CartQty;
let UID = 1;

type Baseline = { companyId: string; itemTypeId: string; baseline: number };
type Total = { companyId: string; itemTypeId: string; total: number };

export default function CompanyCheckinModal({
  companies, serials, balances, statuses, requirePersonalId = false,
  baselines = [], totals = [],
}: {
  companies: Company[];
  serials: SerialAtCompany[];
  balances: QtyAtCompany[];
  statuses: Status[];
  requirePersonalId?: boolean;
  baselines?: Baseline[];
  totals?: Total[];
}) {
  // עזר: כמה מותר לזכות לפריט בפלוגה - max(0, current - baseline)
  const allowedToReturn = (companyId: string, itemTypeId: string): { allowed: number; current: number; baseline: number } => {
    const current = totals.find((t) => t.companyId === companyId && t.itemTypeId === itemTypeId)?.total ?? 0;
    const baseline = baselines.find((b) => b.companyId === companyId && b.itemTypeId === itemTypeId)?.baseline ?? 0;
    return { allowed: Math.max(0, current - baseline), current, baseline };
  };
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [companyId, setCompanyId] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [picker, setPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientPersonalId, setRecipientPersonalId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lotPicker, setLotPicker] = useState<{ unit: SerialAtCompany; qty: number } | null>(null);

  useEscClose(open && !lotPicker && !picker, () => { reset(); setOpen(false); });

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

  // פילטר עבור picker - מסיר מה שכבר בעגלה
  const inCartSerialIds = new Set(cart.filter((c) => c.type === "serial").map((c) => (c as CartSerial).unitId));
  const inCartQtyKeys = new Set(cart.filter((c) => c.type === "qty").map((c) => `${(c as CartQty).itemTypeId}:${(c as CartQty).statusId}`));

  const pickerSerials = useMemo(() => {
    let list = compSerials.filter((u) => !inCartSerialIds.has(u.id));
    if (pickerSearch.trim()) {
      const q = pickerSearch.toLowerCase();
      list = list.filter((u) => u.itemName.toLowerCase().includes(q) || u.serial.toLowerCase().includes(q));
    }
    return list;
  }, [compSerials, inCartSerialIds, pickerSearch]);
  const pickerBalances = useMemo(() => {
    let list = compBalances.filter((b) => !inCartQtyKeys.has(`${b.itemTypeId}:${b.statusId}`) && b.quantity > 0);
    if (pickerSearch.trim()) {
      const q = pickerSearch.toLowerCase();
      list = list.filter((b) => b.itemName.toLowerCase().includes(q));
    }
    return list;
  }, [compBalances, inCartQtyKeys, pickerSearch]);

  function reset() {
    setCompanyId(""); setCart([]); setPicker(false); setPickerSearch("");
    setRecipientName(""); setRecipientPersonalId(""); setError(null);
  }

  function addSerial(u: SerialAtCompany) {
    if (u.lotQuantity && u.lotQuantity > 1) {
      setLotPicker({ unit: u, qty: u.lotQuantity });
      return;
    }
    setCart((c) => [...c, { type: "serial", uid: UID++, unitId: u.id, itemName: u.itemName,
      serial: u.serial, statusName: u.statusName }]);
    setPicker(false); setPickerSearch("");
  }
  function confirmLot() {
    if (!lotPicker) return;
    const { unit, qty } = lotPicker;
    if (qty < 1 || qty > (unit.lotQuantity ?? 1)) return;
    setCart((c) => [...c, { type: "serial", uid: UID++, unitId: unit.id, itemName: unit.itemName,
      serial: unit.serial, statusName: unit.statusName,
      lotQty: qty, lotTotal: unit.lotQuantity ?? qty }]);
    setLotPicker(null); setPicker(false); setPickerSearch("");
  }
  function addQty(b: QtyAtCompany) {
    setCart((c) => [...c, { type: "qty", uid: UID++, itemTypeId: b.itemTypeId, statusId: b.statusId,
      itemName: b.itemName, unit: b.unit, statusName: b.statusName,
      available: b.quantity, quantity: 1 }]);
    setPicker(false); setPickerSearch("");
  }
  function updateCartQty(uid: number, val: number) {
    setCart((c) => c.map((x) => x.uid === uid && x.type === "qty"
      ? { ...x, quantity: Math.max(1, Math.min((x as CartQty).available, val)) }
      : x));
  }
  function setCartOverride(uid: number, statusId: string | undefined) {
    setCart((c) => c.map((x) => x.uid === uid ? { ...x, statusOverride: statusId } : x));
  }
  function removeCart(uid: number) {
    setCart((c) => c.filter((x) => x.uid !== uid));
  }

  async function submit() {
    if (!companyId) { setError("בחר פלוגה"); return; }
    if (cart.length === 0) { setError("הוסף לפחות פריט אחד"); return; }
    if (!recipientName.trim()) { setError("חובה למלא שם המוסר מהפלוגה"); return; }
    if (requirePersonalId && recipientPersonalId.length < 5) {
      setError("הגדוד דורש מ.א. — חובה למלא מ.א. תקף"); return;
    }
    setBusy(true); setError(null);
    try {
      const fd = new FormData();
      fd.append("companyId", companyId);
      fd.append("recipientName", recipientName.trim());
      if (recipientPersonalId) fd.append("recipientPersonalId", recipientPersonalId);
      for (const c of cart) {
        if (c.type === "serial") {
          fd.append("serial", c.unitId);
          if (c.lotQty && c.lotTotal && c.lotQty < c.lotTotal) fd.append(`lotQty:${c.unitId}`, String(c.lotQty));
          if (c.statusOverride) fd.append(`serialStatus:${c.unitId}`, c.statusOverride);
        } else {
          fd.append(`qty:${c.itemTypeId}:${c.statusId}`, String(c.quantity));
          if (c.statusOverride) fd.append(`qtyStatus:${c.itemTypeId}:${c.statusId}`, c.statusOverride);
        }
      }
      const res = await companyReturn(fd);
      if (res?.error) { setError(res.error); return; }
      reset(); setOpen(false); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
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
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[95vh] flex flex-col overflow-hidden relative">
        <div className="bg-gradient-to-r from-purple-600 to-purple-800 text-white p-4 flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-bold text-lg">↩️ זיכוי פלוגה</h3>
            <p className="text-xs text-purple-100 mt-0.5">בחר פלוגה → הוסף פריטים → כמות → ✓ אשר</p>
          </div>
          <button onClick={() => { reset(); setOpen(false); }} className="text-purple-100 hover:text-white text-2xl">✕</button>
        </div>

        {/* בורר פלוגה */}
        <div className="bg-purple-50 border-b border-purple-200 p-3 shrink-0">
          <label className="block text-[11px] text-slate-600 mb-0.5">פלוגה</label>
          <select value={companyId} onChange={(e) => { setCompanyId(e.target.value); setCart([]); }}
            className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm bg-white">
            <option value="">— בחר פלוגה —</option>
            {companiesWithStock.map((c) => (
              <option key={c.id} value={c.id}>
                🪖 {c.name} ({c.sCount} סריאליים + {c.qCount} יח׳ כמותיים)
              </option>
            ))}
          </select>
        </div>

        {/* עגלה */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {!companyId ? (
            <p className="text-center text-slate-400 py-10 text-sm">בחר פלוגה כדי להתחיל</p>
          ) : cart.length === 0 ? (
            <div className="text-center py-8 text-sm">
              <p className="text-slate-400 mb-3">העגלה ריקה</p>
              <button onClick={() => setPicker(true)}
                className="bg-purple-600 hover:bg-purple-700 text-white rounded-lg px-4 py-2 text-sm font-medium">
                + הוסף פריט
              </button>
            </div>
          ) : (
            <>
              {cart.map((c) => (
                <div key={c.uid} className="bg-white border-2 border-purple-200 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <span className="text-lg">
                      {c.type === "serial" ? (c.lotQty ? "💣" : "🔫") : "📦"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{c.itemName}</div>
                      {c.type === "serial" ? (
                        <div className="text-xs text-slate-500 font-mono">
                          {c.lotQty ? `לוט: ${c.serial} · ${c.lotQty}/${c.lotTotal}` : `SN: ${c.serial}`}
                          {" · "}{c.statusName}
                        </div>
                      ) : (
                        <div className="text-xs text-slate-500">
                          סטטוס: {c.statusName} · זמין: {c.available} {c.unit}
                        </div>
                      )}
                    </div>
                    <button onClick={() => removeCart(c.uid)} className="text-rose-500 hover:text-rose-700 text-sm">✕</button>
                  </div>

                  {/* כמות לשינוי - רק לכמותי */}
                  {c.type === "qty" && (
                    <div className="flex items-center gap-1 mt-2">
                      <label className="text-[11px] text-slate-600">כמות להחזרה:</label>
                      <button onClick={() => updateCartQty(c.uid, c.quantity - 1)}
                        className="w-7 h-7 rounded border border-slate-300 text-sm font-bold">−</button>
                      <input type="number" min={1} max={c.available} value={c.quantity}
                        onChange={(e) => updateCartQty(c.uid, parseInt(e.target.value) || 1)}
                        className="w-16 rounded border border-slate-300 px-2 py-1 text-sm text-center font-bold" />
                      <button onClick={() => updateCartQty(c.uid, c.quantity + 1)}
                        className="w-7 h-7 rounded border border-slate-300 text-sm font-bold">+</button>
                      <button onClick={() => updateCartQty(c.uid, c.available)}
                        className="text-[10px] text-blue-600 hover:underline px-1">הכל</button>
                    </div>
                  )}

                  {/* סטטוס בהחזרה */}
                  <div className="mt-2 pt-2 border-t border-slate-100">
                    <span className="text-[10px] text-slate-500 ml-2">סטטוס בהחזרה:</span>
                    <div className="inline-flex gap-1 flex-wrap mt-1">
                      <button type="button" onClick={() => setCartOverride(c.uid, undefined)}
                        className={`text-[10px] px-2 py-0.5 rounded-full border ${!c.statusOverride ? "bg-slate-200 border-slate-400" : "border-slate-200"}`}>
                        ללא שינוי
                      </button>
                      {statuses.map((s) => (
                        <button key={s.id} type="button" onClick={() => setCartOverride(c.uid, s.id)}
                          className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${c.statusOverride === s.id ? "ring-1 ring-purple-400" : "border-transparent"} ${s.isLoss ? "bg-rose-100 text-rose-700" : s.isWear ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                          {s.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ))}

              <button onClick={() => setPicker(true)}
                className="w-full border-2 border-dashed border-purple-300 hover:border-purple-500 hover:bg-purple-50 rounded-lg py-2 text-sm text-purple-700">
                + הוסף פריט נוסף
              </button>
            </>
          )}
        </div>

        {/* בורר פריטים (modal פנימי) */}
        {picker && (
          <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-10 p-3" onClick={() => setPicker(false)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="bg-slate-800 text-white p-3 flex items-center justify-between shrink-0">
                <h3 className="font-bold">בחר פריט להחזרה</h3>
                <button onClick={() => setPicker(false)} className="text-white text-xl">✕</button>
              </div>
              <div className="p-3 border-b border-slate-200 shrink-0">
                <input value={pickerSearch} onChange={(e) => setPickerSearch(e.target.value)}
                  placeholder="חפש פריט / SN..." autoFocus
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {pickerBalances.length === 0 && pickerSerials.length === 0 && (
                  <p className="text-center text-slate-400 py-6 text-sm">אין פריטים זמינים להחזרה</p>
                )}
                {pickerBalances.length > 0 && (
                  <>
                    <div className="text-[10px] font-semibold text-slate-500 uppercase px-2 pt-1">כמותי</div>
                    {pickerBalances.map((b) => {
                      const a = allowedToReturn(companyId, b.itemTypeId);
                      const blocked = a.allowed === 0;
                      return (
                        <button key={`${b.itemTypeId}-${b.statusId}`} onClick={() => !blocked && addQty(b)}
                          disabled={blocked}
                          className={`w-full text-right p-2 rounded-lg border flex items-center gap-2 text-sm ${
                            blocked
                              ? "border-rose-200 bg-rose-50 cursor-not-allowed opacity-70"
                              : "border-slate-200 hover:bg-purple-50 hover:border-purple-300"
                          }`}>
                          <span className="text-lg">📦</span>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">{b.itemName}</div>
                            <div className="text-xs text-slate-500">{b.statusName} · במלאי: {b.quantity} {b.unit}</div>
                            <div className="text-[11px] mt-0.5">
                              {a.baseline > 0 ? (
                                <span className={blocked ? "text-rose-700 font-medium" : "text-amber-700"}>
                                  📌 בסיס מפמ: {a.baseline} · זמין לזיכוי: <b>{a.allowed}</b>
                                </span>
                              ) : (
                                <span className="text-emerald-600">📌 בלי בסיס - זמין לזיכוי: <b>{a.current}</b></span>
                              )}
                            </div>
                          </div>
                          {blocked ? (
                            <span className="text-[10px] text-rose-700 font-bold">חסום</span>
                          ) : (
                            <span className="text-purple-600 font-bold">+</span>
                          )}
                        </button>
                      );
                    })}
                  </>
                )}
                {pickerSerials.length > 0 && (
                  <>
                    <div className="text-[10px] font-semibold text-slate-500 uppercase px-2 pt-2">סריאלי / אצוות</div>
                    {pickerSerials.map((u) => {
                      const isLot = !!u.lotQuantity && u.lotQuantity > 1;
                      return (
                        <button key={u.id} onClick={() => addSerial(u)}
                          className={`w-full text-right p-2 rounded-lg border mb-1 hover:bg-purple-50 flex items-center gap-2 text-sm ${isLot ? "border-orange-300" : "border-slate-200"}`}>
                          <span className="text-lg">{isLot ? "💣" : "🔫"}</span>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">{u.itemName}</div>
                            <div className="text-xs text-slate-500 font-mono">
                              {isLot ? `לוט: ${u.serial} ×${u.lotQuantity}` : `SN: ${u.serial}`} · {u.statusName}
                            </div>
                          </div>
                          <span className="text-purple-600 font-bold">+</span>
                        </button>
                      );
                    })}
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* בורר אצווה חלקית */}
        {lotPicker && (
          <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-20 p-3" onClick={() => setLotPicker(null)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="bg-orange-700 text-white p-3"><h3 className="font-bold">אצווה: בחר כמות להחזרה</h3></div>
              <div className="p-4 space-y-2">
                <div className="text-sm"><b>{lotPicker.unit.itemName}</b> · לוט {lotPicker.unit.serial}</div>
                <div className="text-xs text-slate-500">סה״כ באצווה: {lotPicker.unit.lotQuantity}</div>
                <input type="number" min={1} max={lotPicker.unit.lotQuantity ?? 1} value={lotPicker.qty} autoFocus
                  onChange={(e) => setLotPicker((p) => p ? { ...p, qty: Math.max(1, Math.min(lotPicker.unit.lotQuantity ?? 1, parseInt(e.target.value) || 1)) } : p)}
                  className="w-full rounded-lg border-2 border-orange-300 px-3 py-2 text-2xl font-bold text-center" />
              </div>
              <div className="p-3 flex gap-2">
                <button onClick={() => setLotPicker(null)} className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm">ביטול</button>
                <button onClick={confirmLot} className="flex-1 bg-orange-600 text-white rounded-lg px-3 py-2 text-sm font-bold">✓ הוסף {lotPicker.qty}</button>
              </div>
            </div>
          </div>
        )}

        {/* 🔒 פרטי מי שמסר מהפלוגה - חובה */}
        <div className="border-t-2 border-amber-300 bg-amber-50 p-3 shrink-0">
          <div className="text-xs font-bold text-amber-900 mb-1.5">🔒 פרטי מי שמסר מהפלוגה (חובה)</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">שם המוסר <span className="text-rose-600">*</span></label>
              <input value={recipientName} onChange={(e) => setRecipientName(e.target.value)}
                placeholder='שם הרס"פ / קצין הפלוגה שמסר' required
                className={`w-full rounded-lg border-2 px-2 py-1.5 text-sm bg-white ${recipientName.trim() ? "border-emerald-300" : "border-amber-400"}`} />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                מ.א. של המוסר {requirePersonalId ? <span className="text-rose-600">*</span> : <span className="text-slate-400 text-[10px]">(אופציונלי)</span>}
              </label>
              <input value={recipientPersonalId} onChange={(e) => setRecipientPersonalId(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric" placeholder="1234567" required={requirePersonalId}
                className={`w-full rounded-lg border-2 px-2 py-1.5 text-sm font-mono bg-white ${
                  requirePersonalId && recipientPersonalId.length < 5 ? "border-amber-400"
                  : recipientPersonalId.length >= 5 ? "border-emerald-300" : "border-slate-300"
                }`} />
            </div>
          </div>
        </div>

        <div className="border-t border-slate-200 p-3 bg-white shrink-0">
          {error && <div className="text-sm text-rose-700 font-medium mb-2">⚠️ {error}</div>}
          <div className="flex items-center gap-2">
            <button onClick={() => { reset(); setOpen(false); }} disabled={busy}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm disabled:opacity-50">ביטול</button>
            <button onClick={submit}
              disabled={busy || cart.length === 0 || !recipientName.trim() || (requirePersonalId && recipientPersonalId.length < 5)}
              className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg px-5 py-2 text-sm font-bold">
              {busy ? "מזכה..." : `✓ זכה ${cart.length} פריטים`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
