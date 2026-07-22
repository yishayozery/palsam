"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createReturn } from "../return/actions";

type SerialUnit = {
  id: string; itemTypeId: string; itemName: string; sku: string | null;
  serial: string; lotQuantity: number | null;
  signedTo: string | null;
  statusName: string; statusId: string; isWear: boolean; isLoss: boolean;
  warehouseType: string | null;
};
type Balance = {
  itemTypeId: string; itemName: string; unit: string;
  statusId: string; statusName: string;
  isWear: boolean; isLoss: boolean;
  quantity: number;
  warehouseType: string | null;
};
type Status = { id: string; name: string; isDefault: boolean; isWear: boolean; isLoss: boolean };
type Recipient = { id: string; name: string; title: string | null; personalNumber: string | null };
type Warehouse = { id: string; name: string; recipients: Recipient[]; warehouseType: string | null };

type CartSerial = { type: "serial"; unitId: string; itemName: string; serial: string; statusName: string; lotQty?: number; lotTotal?: number };
type CartQty = { type: "qty"; itemTypeId: string; itemName: string; unit: string; quantity: number; maxQty: number; statusId: string; statusName: string };
type CartItem = CartSerial | CartQty;

export default function ReturnModal({ serialUnits, balances, statuses, warehouses, requirePersonalId }: {
  serialUnits: SerialUnit[]; balances: Balance[]; statuses: Status[];
  warehouses: Warehouse[]; requirePersonalId: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [itemSearch, setItemSearch] = useState("");
  const [showOnlyDefective, setShowOnlyDefective] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lotPicker, setLotPicker] = useState<{ unit: SerialUnit; qty: number } | null>(null);
  // יעד הזיכוי
  const [toHolderId, setToHolderId] = useState(warehouses[0]?.id ?? "");
  const [recipientUserId, setRecipientUserId] = useState("");
  const [manualPN, setManualPN] = useState("");

  const selectedWh = warehouses.find((w) => w.id === toHolderId);
  const selectedRecipient = selectedWh?.recipients.find((r) => r.id === recipientUserId);
  const effectivePN = selectedRecipient?.personalNumber || manualPN;

  const cartSerialIds = new Set(cart.filter((c) => c.type === "serial").map((c) => (c as CartSerial).unitId));

  const selectedWhType = selectedWh?.warehouseType ?? null;

  const filteredSerials = useMemo(() => {
    return serialUnits.filter((u) => {
      if (cartSerialIds.has(u.id)) return false;
      if (u.signedTo) return false; // יחידה חתומה על חייל — אי-אפשר לזכות
      // סינון לפי טיפוס מחסן הנבחר — הפלוגה מזכה רק את מה ששייך למחסן הזה
      if (selectedWhType && u.warehouseType && u.warehouseType !== selectedWhType) return false;
      if (showOnlyDefective && !u.isWear && !u.isLoss) return false;
      if (itemSearch.trim()) {
        const q = itemSearch.toLowerCase();
        return u.itemName.toLowerCase().includes(q) || u.serial.toLowerCase().includes(q);
      }
      return true;
    });
  }, [serialUnits, cartSerialIds, itemSearch, showOnlyDefective, selectedWhType]);

  const filteredBalances = useMemo(() => {
    return balances.filter((b) => {
      if (selectedWhType && b.warehouseType && b.warehouseType !== selectedWhType) return false;
      if (showOnlyDefective && !b.isWear && !b.isLoss) return false;
      if (itemSearch.trim()) {
        const q = itemSearch.toLowerCase();
        return b.itemName.toLowerCase().includes(q);
      }
      return true;
    });
  }, [balances, itemSearch, showOnlyDefective, selectedWhType]);

  const addSerial = (u: SerialUnit) => {
    if (u.lotQuantity && u.lotQuantity > 1) { setLotPicker({ unit: u, qty: u.lotQuantity }); return; }
    setCart((c) => [...c, { type: "serial", unitId: u.id, itemName: u.itemName, serial: u.serial, statusName: u.statusName }]);
  };
  const confirmLotPick = () => {
    if (!lotPicker) return;
    const { unit, qty } = lotPicker;
    if (qty < 1 || qty > (unit.lotQuantity ?? 1)) return;
    setCart((c) => [...c, { type: "serial", unitId: unit.id, itemName: unit.itemName, serial: unit.serial, statusName: unit.statusName, lotQty: qty, lotTotal: unit.lotQuantity ?? qty }]);
    setLotPicker(null);
  };
  const addQty = (b: Balance) => {
    const existing = cart.find((c) => c.type === "qty" && c.itemTypeId === b.itemTypeId && c.statusId === b.statusId);
    if (existing) {
      setCart((c) => c.map((x) => x === existing ? { ...(x as CartQty), quantity: Math.min(b.quantity, (x as CartQty).quantity + 1) } : x));
    } else {
      setCart((c) => [...c, { type: "qty", itemTypeId: b.itemTypeId, itemName: b.itemName, unit: b.unit, quantity: 1, maxQty: b.quantity, statusId: b.statusId, statusName: b.statusName }]);
    }
  };
  const updateCartQty = (idx: number, n: number) => setCart((c) => c.map((x, i) => i === idx ? { ...(x as CartQty), quantity: Math.max(1, Math.min((x as CartQty).maxQty, n)) } : x));
  const removeCart = (idx: number) => setCart((c) => c.filter((_, i) => i !== idx));
  const reset = () => { setItemSearch(""); setShowOnlyDefective(false); setCart([]); setNotes(""); setError(null); };

  async function submit() {
    setError(null);
    if (cart.length === 0) { setError("הוסף לפחות פריט אחד לעגלה"); return; }
    if (!toHolderId) { setError("בחר מחסן יעד"); return; }
    if (requirePersonalId && !effectivePN) { setError("🔒 הגדוד דורש מ.א. של המקבל — בחר נמען עם מ.א. או הזן ידנית"); return; }
    setBusy(true);
    try {
      // יוצרים פעולת זיכוי לכל קבוצת פריטים (group by itemTypeId)
      // מבנה: כל הסריאלים → fd.serialId; כל הכמותיים → fd.quantity + statusId
      // צריך להפריד פעולת RETURN לכל פריט בנפרד או להגדיר createReturn לקבל כמה
      // לפי הקוד הקיים — createReturn מקבל itemTypeId יחיד. נריץ פעם לכל פריט.
      const byItem = new Map<string, CartItem[]>();
      for (const c of cart) {
        const id = c.type === "serial"
          ? serialUnits.find((u) => u.id === (c as CartSerial).unitId)?.itemTypeId
          : (c as CartQty).itemTypeId;
        if (!id) continue;
        if (!byItem.has(id)) byItem.set(id, []);
        byItem.get(id)!.push(c);
      }
      for (const [itemTypeId, items] of byItem) {
        const fd = new FormData();
        fd.append("itemTypeId", itemTypeId);
        fd.append("notes", notes);
        fd.append("toHolderId", toHolderId);
        if (recipientUserId) fd.append("recipientUserId", recipientUserId);
        if (manualPN) fd.append("recipientPersonalId", manualPN);
        const qtyOne = items.find((i) => i.type === "qty") as CartQty | undefined;
        if (qtyOne) {
          fd.append("statusId", qtyOne.statusId);
          const total = items.filter((i) => i.type === "qty").reduce((s, i) => s + (i as CartQty).quantity, 0);
          fd.append("quantity", String(total));
        }
        for (const i of items) {
          if (i.type === "serial") {
            const cs = i as CartSerial;
            fd.append("serialId", cs.unitId);
            if (cs.lotQty && cs.lotTotal && cs.lotQty < cs.lotTotal) {
              fd.append(`lotQty:${cs.unitId}`, String(cs.lotQty));
            }
          }
        }
        const r = await createReturn(fd);
        if (r?.error) { setError(r.error); return; }
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
        ↩️ זיכוי לגדוד
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-2 md:p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[95vh] flex flex-col overflow-hidden relative">
        <div className="bg-gradient-to-r from-amber-600 to-amber-800 text-white p-4 flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-bold text-lg">↩️ זיכוי לגדוד</h3>
            <p className="text-xs text-amber-100 mt-0.5">החזרת ציוד פלוגתי למחסן הגדודי — לחיצת יד עם קצין המחסן</p>
          </div>
          <button onClick={() => { reset(); setOpen(false); }} className="text-amber-100 hover:text-white text-2xl">✕</button>
        </div>

        {/* 🎯 יעד הזיכוי — מחסן + מקבל + מ.א. (אם הדגל דולק) */}
        <div className="bg-amber-50 border-b border-amber-200 p-3 shrink-0 space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-semibold text-amber-900 mb-0.5">🏪 מחסן יעד</label>
              <select value={toHolderId} onChange={(e) => { setToHolderId(e.target.value); setRecipientUserId(""); }}
                className="w-full rounded-lg border border-amber-300 bg-white px-2 py-1.5 text-sm">
                <option value="">— בחר מחסן —</option>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-amber-900 mb-0.5">👤 מקבל (אופציונלי)</label>
              <select value={recipientUserId} onChange={(e) => setRecipientUserId(e.target.value)} disabled={!selectedWh}
                className="w-full rounded-lg border border-amber-300 bg-white px-2 py-1.5 text-sm disabled:opacity-50">
                <option value="">— ללא נמען ספציפי —</option>
                {selectedWh?.recipients.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}{r.title ? ` (${r.title})` : ""}{r.personalNumber ? ` · מ.א. ${r.personalNumber}` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {requirePersonalId && (
            <div>
              <label className="block text-[11px] font-bold text-rose-900 mb-0.5">🔒 מ.א. של המקבל (חובה)</label>
              {selectedRecipient?.personalNumber ? (
                <div className="bg-emerald-50 border border-emerald-300 rounded px-2 py-1.5 text-xs text-emerald-800">
                  ✓ נלקח אוטו מ-<b>{selectedRecipient.name}</b>: <span className="font-mono">{selectedRecipient.personalNumber}</span>
                </div>
              ) : (
                <input value={manualPN} onChange={(e) => setManualPN(e.target.value.replace(/\D/g, ""))}
                  inputMode="numeric" placeholder="1234567" required
                  className="w-full rounded-lg border-2 border-rose-400 bg-white px-2 py-1.5 text-sm font-mono" />
              )}
            </div>
          )}
          <label className="flex items-center gap-2 text-xs cursor-pointer pt-1 border-t border-amber-200">
            <input type="checkbox" checked={showOnlyDefective}
              onChange={(e) => setShowOnlyDefective(e.target.checked)} />
            <span className="font-medium text-amber-900">⚠️ הצג רק בלאי / אבוד / תקול</span>
          </label>
        </div>

        <div className="flex-1 grid md:grid-cols-2 gap-0 overflow-hidden min-h-0">
          {/* עגלה */}
          <div className="border-l border-slate-200 flex flex-col bg-slate-50 order-2 md:order-1">
            <div className="p-3 border-b border-slate-200 flex items-center justify-between bg-white">
              <div className="font-bold text-slate-800">🛒 עגלת זיכוי ({cart.length})</div>
              {cart.length > 0 && <button onClick={() => setCart([])} className="text-xs text-rose-500">נקה</button>}
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {cart.length === 0 ? (
                <div className="text-center text-slate-400 py-10 text-sm">עגלה ריקה.<br />לחץ על פריט לזיכוי.</div>
              ) : cart.map((c, i) => (
                <div key={i} className="bg-white border border-slate-200 rounded-lg p-2 flex items-center gap-2">
                  <span className="text-lg">{c.type === "serial" && c.lotQty ? "💣" : "📦"}</span>
                  {c.type === "serial" ? (
                    <>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">
                          {c.itemName}
                          {c.lotQty && <span className="mr-1 text-[10px] bg-orange-100 text-orange-800 rounded px-1.5 py-0.5">אצווה · {c.lotQty}/{c.lotTotal}</span>}
                        </div>
                        <div className="text-xs text-slate-500 font-mono truncate">{c.lotQty ? `לוט: ${c.serial}` : `SN: ${c.serial}`} · {c.statusName}</div>
                      </div>
                      {c.lotQty && (
                        <input type="number" min={1} max={c.lotTotal} value={c.lotQty}
                          onChange={(e) => {
                            const n = Math.max(1, Math.min(c.lotTotal ?? 1, parseInt(e.target.value) || 1));
                            setCart((arr) => arr.map((x, j) => j === i ? { ...(x as CartSerial), lotQty: n } : x));
                          }}
                          className="w-14 rounded border border-slate-300 px-1.5 py-1 text-sm text-center" />
                      )}
                    </>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{c.itemName}</div>
                        <div className="text-xs text-slate-500">{c.statusName}</div>
                      </div>
                      <input type="number" min={1} max={c.maxQty} value={c.quantity}
                        onChange={(e) => updateCartQty(i, parseInt(e.target.value) || 1)}
                        className="w-16 rounded border border-slate-300 px-1.5 py-1 text-sm text-center" />
                      <span className="text-xs text-slate-400">{c.unit}</span>
                    </>
                  )}
                  <button onClick={() => removeCart(i)} className="text-rose-400 hover:text-rose-700 px-1">✕</button>
                </div>
              ))}
            </div>

            <div className="p-3 border-t border-slate-200 bg-white">
              <label className="block text-[11px] text-slate-600 mb-0.5">הערות (סיבת הזיכוי, מצב הציוד וכו')</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                placeholder="לדוגמה: בלאי אחרי תרגיל, החזרה במסגרת זיכוי תקופתי..."
                className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
            </div>
          </div>

          {/* מלאי הפלוגה */}
          <div className="flex flex-col bg-white order-1 md:order-2 min-h-0">
            <div className="p-3 border-b border-slate-200 bg-white sticky top-0 shrink-0">
              <div className="font-bold text-slate-800 mb-2">📦 מלאי הפלוגה להחזרה</div>
              <input value={itemSearch} onChange={(e) => setItemSearch(e.target.value)} placeholder="חפש פריט..."
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
              <p className="text-[11px] text-slate-500 mt-1">
                ⚠️ פריטים חתומים על חיילים — קודם זיכוי החייל
                {selectedWhType && <span className="block text-emerald-700 mt-0.5">🏪 מציג רק פריטים השייכים לטיפוס המחסן הנבחר</span>}
              </p>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {filteredBalances.length === 0 && filteredSerials.length === 0 && (
                <div className="text-center text-slate-400 py-10 text-sm">
                  {showOnlyDefective ? "אין פריטים תקולים להחזרה" : "אין פריטים זמינים להחזרה"}
                </div>
              )}

              {filteredBalances.length > 0 && (
                <div>
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-2 pb-1">כמותי</div>
                  {filteredBalances.map((b) => (
                    <button key={`${b.itemTypeId}-${b.statusId}`} onClick={() => addQty(b)}
                      className={`w-full text-right border rounded-lg p-2 mb-1 hover:bg-amber-50 hover:border-amber-300 transition flex items-center gap-2 group ${b.isWear || b.isLoss ? "border-amber-300 bg-amber-50/50" : "bg-white border-slate-200"}`}>
                      <span className="text-lg">📦</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{b.itemName}</div>
                        <div className="text-xs text-slate-500">
                          {b.statusName} {b.isLoss && "🔴"} {b.isWear && "🟡"}
                          · זמין: <b>{b.quantity}</b> {b.unit}
                        </div>
                      </div>
                      <span className="text-amber-600 font-bold text-lg group-hover:scale-110 transition">+</span>
                    </button>
                  ))}
                </div>
              )}

              {filteredSerials.length > 0 && (
                <div>
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-2 pb-1 pt-1">סריאלי / אצוות</div>
                  {filteredSerials.map((u) => {
                    const isLot = !!u.lotQuantity && u.lotQuantity > 1;
                    return (
                      <button key={u.id} onClick={() => addSerial(u)}
                        className={`w-full text-right border rounded-lg p-2 mb-1 hover:bg-amber-50 transition flex items-center gap-2 group ${isLot ? "border-orange-300 hover:border-orange-400" : (u.isWear || u.isLoss ? "border-amber-300 bg-amber-50/50" : "bg-white border-slate-200")}`}>
                        <span className="text-lg">{isLot ? "💣" : "📦"}</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">
                            {u.itemName}
                            {isLot && <span className="mr-1 text-[10px] bg-orange-100 text-orange-800 rounded px-1.5 py-0.5">אצווה ×{u.lotQuantity}</span>}
                          </div>
                          <div className="text-xs text-slate-500 font-mono truncate">
                            {isLot ? `לוט: ${u.serial}` : `SN: ${u.serial}`} · {u.statusName} {u.isLoss && "🔴"} {u.isWear && "🟡"}
                          </div>
                        </div>
                        <span className={`font-bold text-lg group-hover:scale-110 transition ${isLot ? "text-orange-600" : "text-amber-600"}`}>+</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* דיאלוג אצווה לזיכוי חלקי */}
        {lotPicker && (
          <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-10 p-3" onClick={() => setLotPicker(null)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="bg-gradient-to-r from-orange-500 to-orange-700 text-white p-4">
                <h3 className="font-bold text-lg">⚠️ זיכוי אצווה</h3>
                <p className="text-xs text-orange-100 mt-1">בחר כמה לזכות מהאצווה — היתרה נשארת בפלוגה</p>
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
                      ℹ️ זיכוי חלקי: <b>{lotPicker.qty}</b> יחזרו למחסן, <b>{(lotPicker.unit.lotQuantity ?? 1) - lotPicker.qty}</b> יישארו בפלוגה.
                    </p>
                  )}
                </div>
              </div>
              <div className="p-3 border-t border-slate-200 flex gap-2">
                <button onClick={() => setLotPicker(null)} className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm">ביטול</button>
                <button onClick={confirmLotPick} className="flex-1 bg-orange-600 hover:bg-orange-700 text-white rounded-lg px-4 py-2.5 text-sm font-bold">
                  ✓ הוסף לעגלה ({lotPicker.qty})
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="border-t border-slate-200 p-3 bg-white shrink-0">
          {error && <div className="text-sm text-rose-700 font-medium mb-2">⚠️ {error}</div>}
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => { reset(); setOpen(false); }} disabled={busy}
              className="flex-1 sm:flex-none rounded-lg border border-slate-300 px-4 py-2.5 text-sm disabled:opacity-50">ביטול</button>
            <button onClick={submit} disabled={busy || cart.length === 0}
              className="flex-1 sm:flex-none bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-lg px-5 py-2.5 text-sm font-bold flex items-center justify-center gap-2">
              {busy ? (
                <>
                  <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  שולח...
                </>
              ) : `↩️ שלח לאישור (${cart.length})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
