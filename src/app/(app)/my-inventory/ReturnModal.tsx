"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createReturn } from "../return/actions";

type SerialUnit = {
  id: string; itemTypeId: string; itemName: string; sku: string | null;
  serial: string; lotQuantity: number | null;
  signedTo: string | null;
  statusName: string; statusId: string; isWear: boolean; isLoss: boolean;
};
type Balance = {
  itemTypeId: string; itemName: string; unit: string;
  statusId: string; statusName: string;
  isWear: boolean; isLoss: boolean;
  quantity: number;
};
type Status = { id: string; name: string; isDefault: boolean; isWear: boolean; isLoss: boolean };

type CartSerial = { type: "serial"; unitId: string; itemName: string; serial: string; statusName: string };
type CartQty = { type: "qty"; itemTypeId: string; itemName: string; unit: string; quantity: number; maxQty: number; statusId: string; statusName: string };
type CartItem = CartSerial | CartQty;

export default function ReturnModal({ serialUnits, balances, statuses }: {
  serialUnits: SerialUnit[]; balances: Balance[]; statuses: Status[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [itemSearch, setItemSearch] = useState("");
  const [showOnlyDefective, setShowOnlyDefective] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const cartSerialIds = new Set(cart.filter((c) => c.type === "serial").map((c) => (c as CartSerial).unitId));

  const filteredSerials = useMemo(() => {
    return serialUnits.filter((u) => {
      if (cartSerialIds.has(u.id)) return false;
      if (u.signedTo) return false; // יחידה חתומה על חייל — אי-אפשר לזכות
      if (showOnlyDefective && !u.isWear && !u.isLoss) return false;
      if (itemSearch.trim()) {
        const q = itemSearch.toLowerCase();
        return u.itemName.toLowerCase().includes(q) || u.serial.toLowerCase().includes(q);
      }
      return true;
    });
  }, [serialUnits, cartSerialIds, itemSearch, showOnlyDefective]);

  const filteredBalances = useMemo(() => {
    return balances.filter((b) => {
      if (showOnlyDefective && !b.isWear && !b.isLoss) return false;
      if (itemSearch.trim()) {
        const q = itemSearch.toLowerCase();
        return b.itemName.toLowerCase().includes(q);
      }
      return true;
    });
  }, [balances, itemSearch, showOnlyDefective]);

  const addSerial = (u: SerialUnit) =>
    setCart((c) => [...c, { type: "serial", unitId: u.id, itemName: u.itemName, serial: u.serial, statusName: u.statusName }]);
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
        const qtyOne = items.find((i) => i.type === "qty") as CartQty | undefined;
        if (qtyOne) {
          fd.append("statusId", qtyOne.statusId);
          const total = items.filter((i) => i.type === "qty").reduce((s, i) => s + (i as CartQty).quantity, 0);
          fd.append("quantity", String(total));
        }
        for (const i of items) {
          if (i.type === "serial") fd.append("serialId", (i as CartSerial).unitId);
        }
        await createReturn(fd);
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
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[95vh] flex flex-col overflow-hidden">
        <div className="bg-gradient-to-r from-amber-600 to-amber-800 text-white p-4 flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-bold text-lg">↩️ זיכוי לגדוד</h3>
            <p className="text-xs text-amber-100 mt-0.5">החזרת ציוד פלוגתי למחסן הגדודי — לחיצת יד עם קצין המחסן</p>
          </div>
          <button onClick={() => { reset(); setOpen(false); }} className="text-amber-100 hover:text-white text-2xl">✕</button>
        </div>

        <div className="bg-amber-50 border-b border-amber-200 p-2.5 shrink-0">
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input type="checkbox" checked={showOnlyDefective}
              onChange={(e) => setShowOnlyDefective(e.target.checked)} />
            <span className="font-medium text-amber-900">⚠️ הצג רק בלאי / אבוד / תקול</span>
            <span className="text-amber-700">— זיכוי לציוד שדורש החלפה</span>
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
                  <span className="text-lg">{c.type === "serial" ? "📦" : "📦"}</span>
                  {c.type === "serial" ? (
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{c.itemName}</div>
                      <div className="text-xs text-slate-500 font-mono truncate">SN: {c.serial} · {c.statusName}</div>
                    </div>
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
              <p className="text-[11px] text-slate-500 mt-1">⚠️ פריטים חתומים על חיילים — קודם זיכוי החייל</p>
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
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-2 pb-1 pt-1">סריאלי</div>
                  {filteredSerials.map((u) => (
                    <button key={u.id} onClick={() => addSerial(u)}
                      className={`w-full text-right border rounded-lg p-2 mb-1 hover:bg-amber-50 hover:border-amber-300 transition flex items-center gap-2 group ${u.isWear || u.isLoss ? "border-amber-300 bg-amber-50/50" : "bg-white border-slate-200"}`}>
                      <span className="text-lg">📦</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{u.itemName}</div>
                        <div className="text-xs text-slate-500 font-mono truncate">
                          SN: {u.serial} · {u.statusName} {u.isLoss && "🔴"} {u.isWear && "🟡"}
                        </div>
                      </div>
                      <span className="text-amber-600 font-bold text-lg group-hover:scale-110 transition">+</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="border-t border-slate-200 p-3 bg-white flex items-center justify-between gap-2 shrink-0">
          {error && <div className="flex-1 text-sm text-rose-700 font-medium">⚠️ {error}</div>}
          <div className="flex items-center gap-2 mr-auto">
            <button onClick={() => { reset(); setOpen(false); }} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">ביטול</button>
            <button onClick={submit} disabled={busy || cart.length === 0}
              className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-lg px-5 py-2 text-sm font-bold">
              {busy ? "שולח..." : `↩️ שלח לאישור קצין מחסן (${cart.length})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
