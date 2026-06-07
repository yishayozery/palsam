"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { withdrawMulti } from "./actions";
import { useEscClose } from "@/lib/useEscClose";

type StockEntry = { itemTypeId: string; statusId: string; statusName: string; quantity: number };
type SerialEntry = {
  id: string; itemTypeId: string; serialNumber: string;
  lotQuantity: number | null; statusId: string; statusName: string;
};
type Item = { id: string; name: string; sku: string | null; trackingMethod: "QUANTITY" | "SERIAL" | "LOT"; unit: string };
type Status = { id: string; name: string; isDefault: boolean };
type CounterpartOption = { value: string; label: string };

type LineQty = { uid: number; kind: "QTY"; itemId: string; itemName: string; statusId: string; statusName: string; quantity: number; maxQty: number; unit: string };
type LineSerial = { uid: number; kind: "SERIAL"; itemId: string; itemName: string; serialUnitId: string; serial: string; statusName: string };
type LineLot = { uid: number; kind: "LOT"; itemId: string; itemName: string; serialUnitId: string; lotNumber: string; lotTotal: number; lotQty: number; statusName: string };
type Line = LineQty | LineSerial | LineLot;

let UID = 1;

export default function MultiWithdrawModal({
  items, statuses, stocks, units, currentUserName, requirePersonalId, counterpartOptions = [],
}: {
  items: Item[]; statuses: Status[];
  stocks: StockEntry[]; units: SerialEntry[];
  currentUserName: string; requirePersonalId: boolean;
  counterpartOptions?: CounterpartOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [externalUnit, setExternalUnit] = useState(counterpartOptions[0]?.value || "חטיבה");
  const [externalContact, setExternalContact] = useState("");
  const [recipientPersonalId, setRecipientPersonalId] = useState("");
  const [reason, setReason] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lotPicker, setLotPicker] = useState<{ unit: SerialEntry; qty: number; itemName: string } | null>(null);

  useEscClose(open && !lotPicker, () => setOpen(false));

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const matchingItems = useMemo(() => {
    if (!search.trim()) return items.slice(0, 50);
    const q = search.toLowerCase();
    return items.filter((i) => i.name.toLowerCase().includes(q) || (i.sku || "").toLowerCase().includes(q)).slice(0, 50);
  }, [items, search]);

  // קליק על פריט קטלוג: לפתוח רשימה רלוונטית
  const [picker, setPicker] = useState<{ item: Item } | null>(null);

  const addQtyLine = (item: Item, st: StockEntry) => {
    const inCart = lines.filter((l) => l.kind === "QTY" && l.itemId === item.id && (l as LineQty).statusId === st.statusId).reduce((a, b) => a + (b as LineQty).quantity, 0);
    const remaining = st.quantity - inCart;
    if (remaining <= 0) return;
    setLines((l) => [...l, {
      uid: UID++, kind: "QTY", itemId: item.id, itemName: item.name,
      statusId: st.statusId, statusName: st.statusName, quantity: 1, maxQty: remaining, unit: item.unit,
    }]);
    setPicker(null);
  };
  const addSerialLine = (item: Item, u: SerialEntry) => {
    const exists = lines.some((l) => (l.kind === "SERIAL" || l.kind === "LOT") && l.serialUnitId === u.id);
    if (exists) return;
    if (u.lotQuantity && u.lotQuantity > 1) {
      setLotPicker({ unit: u, qty: u.lotQuantity, itemName: item.name });
      return;
    }
    setLines((l) => [...l, {
      uid: UID++, kind: "SERIAL", itemId: item.id, itemName: item.name,
      serialUnitId: u.id, serial: u.serialNumber, statusName: u.statusName,
    }]);
    setPicker(null);
  };
  const confirmLotPick = () => {
    if (!lotPicker) return;
    const { unit, qty, itemName } = lotPicker;
    setLines((l) => [...l, {
      uid: UID++, kind: "LOT", itemId: unit.itemTypeId, itemName,
      serialUnitId: unit.id, lotNumber: unit.serialNumber,
      lotTotal: unit.lotQuantity ?? qty, lotQty: qty, statusName: unit.statusName,
    }]);
    setLotPicker(null);
    setPicker(null);
  };

  const updateQtyLine = (uid: number, n: number) => {
    setLines((l) => l.map((x) => x.uid === uid && x.kind === "QTY" ? { ...x, quantity: Math.max(1, Math.min(x.maxQty, n)) } as LineQty : x));
  };
  const updateLotLineQty = (uid: number, n: number) => {
    setLines((l) => l.map((x) => x.uid === uid && x.kind === "LOT" ? { ...x, lotQty: Math.max(1, Math.min(x.lotTotal, n)) } as LineLot : x));
  };
  const removeLine = (uid: number) => setLines((l) => l.filter((x) => x.uid !== uid));
  const reset = () => {
    setLines([]); setReason(""); setRecipientPersonalId(""); setExternalContact("");
    setExternalUnit(counterpartOptions[0]?.value || "חטיבה");
    setSearch(""); setPicker(null); setError(null);
  };

  // קיבוץ שורות סריאל/אצווה לפי פריט (לשליחה)
  async function submit() {
    setError(null);
    if (lines.length === 0) { setError("הוסף לפחות פריט אחד לתעודה"); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("externalUnit", externalUnit);
      fd.append("externalContact", externalContact);
      fd.append("recipientPersonalId", recipientPersonalId);
      fd.append("reason", reason);

      // קיבוץ: שורות QTY נכנסות ישירות, שורות SERIAL/LOT לפי itemId
      const grouped = new Map<string, { method: "QUANTITY" | "SERIAL" | "LOT"; serials: string[]; lotMap: Map<string, number> }>();
      let i = 0;
      for (const l of lines) {
        if (l.kind === "QTY") {
          fd.append(`line:${i}:itemTypeId`, l.itemId);
          fd.append(`line:${i}:trackingMethod`, "QUANTITY");
          fd.append(`line:${i}:statusId`, l.statusId);
          fd.append(`line:${i}:quantity`, String(l.quantity));
          i++;
        } else {
          const method = l.kind === "LOT" ? "LOT" : "SERIAL";
          const key = `${l.itemId}:${method}`;
          if (!grouped.has(key)) grouped.set(key, { method, serials: [], lotMap: new Map() });
          const g = grouped.get(key)!;
          g.serials.push(l.serialUnitId);
          if (l.kind === "LOT" && l.lotQty < l.lotTotal) g.lotMap.set(l.serialUnitId, l.lotQty);
        }
      }
      for (const [key, g] of grouped) {
        const [itemId] = key.split(":");
        fd.append(`line:${i}:itemTypeId`, itemId);
        fd.append(`line:${i}:trackingMethod`, g.method);
        fd.append(`line:${i}:serialUnitIds`, g.serials.join(","));
        for (const [sid, q] of g.lotMap) fd.append(`lotQty:${sid}`, String(q));
        i++;
      }
      const res = await withdrawMulti(fd);
      if (res?.error) { setError(res.error); return; }
      reset(); setOpen(false);
      if (res?.transferId) router.push(`/transfers/${res.transferId}/document`);
      else router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }

  if (!open) {
    return (
      <button onClick={() => { reset(); setOpen(true); }}
        className="bg-rose-700 hover:bg-rose-800 text-white rounded-lg px-4 py-2.5 text-sm font-medium flex items-center gap-2">
        📤 זיכוי רב-פריטי
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-2 md:p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[95vh] flex flex-col overflow-hidden relative">
        <div className="bg-gradient-to-r from-rose-700 to-rose-900 text-white p-4 flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-bold text-lg">📤 זיכוי לחטיבה — תעודה אחת</h3>
            <p className="text-xs text-rose-100 mt-0.5">הוסף כמה פריטים שצריך → תעודת WRITE_OFF אחת</p>
          </div>
          <button onClick={() => setOpen(false)} className="text-rose-100 hover:text-white text-2xl">✕</button>
        </div>

        {/* פרטי תעודה */}
        <div className="bg-rose-50 border-b border-rose-200 p-3 shrink-0 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] text-slate-600 mb-0.5">יחידה מקבלת</label>
              {counterpartOptions.length > 0 ? (
                <select value={counterpartOptions.find((o) => o.value === externalUnit) ? externalUnit : "__manual__"}
                  onChange={(e) => { if (e.target.value !== "__manual__") setExternalUnit(e.target.value); else setExternalUnit(""); }}
                  className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm bg-white">
                  {counterpartOptions.map((o) => <option key={o.value || "manual"} value={o.value || "__manual__"}>{o.label}</option>)}
                </select>
              ) : (
                <input value={externalUnit} onChange={(e) => setExternalUnit(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
              )}
            </div>
            <div>
              <label className="block text-[11px] text-slate-600 mb-0.5">שם המקבל (אדם)</label>
              <input value={externalContact} onChange={(e) => setExternalContact(e.target.value)} placeholder="שם הקצין החטיבתי"
                className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-[11px] text-slate-600 mb-0.5">סיבת הזיכוי</label>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="זיכוי תקופתי / שינוי תקן / החלפת ציוד..."
              className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
          </div>
          {requirePersonalId && (
            <div>
              <label className="block text-[11px] font-bold text-amber-900 mb-0.5">🔒 מ.א. של המקבל בחטיבה (חובה)</label>
              <input value={recipientPersonalId} onChange={(e) => setRecipientPersonalId(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric" placeholder="1234567" required
                className="w-full rounded-lg border border-amber-400 px-2 py-1.5 text-sm font-mono" />
            </div>
          )}
          <p className="text-[10px] text-rose-700">המנפק: <b>{currentUserName}</b></p>
        </div>

        <div className="flex-1 grid md:grid-cols-2 gap-0 overflow-hidden min-h-0">
          {/* עגלה */}
          <div className="border-l border-slate-200 flex flex-col bg-slate-50 order-2 md:order-1 min-h-0">
            <div className="p-3 border-b border-slate-200 flex items-center justify-between bg-white">
              <div className="font-bold text-slate-800">🛒 עגלת זיכוי ({lines.length})</div>
              {lines.length > 0 && <button onClick={() => setLines([])} className="text-xs text-rose-500">נקה</button>}
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {lines.length === 0 ? (
                <div className="text-center text-slate-400 py-10 text-sm">העגלה ריקה.<br />בחר פריטים לזיכוי.</div>
              ) : lines.map((l) => (
                <div key={l.uid} className="bg-white border border-slate-200 rounded-lg p-2 flex items-center gap-2">
                  <span className="text-lg">
                    {l.kind === "SERIAL" ? "🔫" : l.kind === "LOT" ? "💣" : "📦"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{l.itemName}</div>
                    {l.kind === "QTY" && <div className="text-xs text-slate-500">{l.statusName} · זמין: {l.maxQty} {l.unit}</div>}
                    {l.kind === "SERIAL" && <div className="text-xs text-slate-500 font-mono">SN: {l.serial} · {l.statusName}</div>}
                    {l.kind === "LOT" && (
                      <div className="text-xs text-slate-500 font-mono">
                        לוט: {l.lotNumber} · <span className="text-orange-700">{l.lotQty}/{l.lotTotal}</span> · {l.statusName}
                      </div>
                    )}
                  </div>
                  {l.kind === "QTY" && (
                    <input type="number" min={1} max={l.maxQty} value={l.quantity}
                      onChange={(e) => updateQtyLine(l.uid, parseInt(e.target.value) || 1)}
                      className="w-16 rounded border border-slate-300 px-1.5 py-1 text-sm text-center" />
                  )}
                  {l.kind === "LOT" && (
                    <input type="number" min={1} max={l.lotTotal} value={l.lotQty}
                      onChange={(e) => updateLotLineQty(l.uid, parseInt(e.target.value) || 1)}
                      className="w-16 rounded border border-orange-300 px-1.5 py-1 text-sm text-center" />
                  )}
                  <button onClick={() => removeLine(l.uid)} className="text-rose-400 hover:text-rose-700">✕</button>
                </div>
              ))}
            </div>
          </div>

          {/* קטלוג */}
          <div className="flex flex-col bg-white order-1 md:order-2 min-h-0">
            <div className="p-3 border-b border-slate-200 bg-white shrink-0">
              <div className="font-bold text-slate-800 mb-2">📋 פריטים לזיכוי</div>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="חפש פריט..."
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {matchingItems.map((i) => {
                const myStocks = stocks.filter((s) => s.itemTypeId === i.id && s.quantity > 0);
                const myUnits = units.filter((u) => u.itemTypeId === i.id);
                const available = myStocks.reduce((a, b) => a + b.quantity, 0) + myUnits.length;
                if (available === 0) return null;
                const icon = i.trackingMethod === "SERIAL" ? "🔫" : i.trackingMethod === "LOT" ? "💣" : "📦";
                return (
                  <button key={i.id} onClick={() => setPicker({ item: i })}
                    className="w-full text-right p-2 rounded-lg border border-slate-200 hover:bg-rose-50 hover:border-rose-300 flex items-center gap-2 text-sm">
                    <span className="text-lg">{icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{i.name}</div>
                      <div className="text-xs text-slate-500">{i.sku && <span className="font-mono">{i.sku} · </span>}זמין: <b>{available}</b> {i.unit}</div>
                    </div>
                    <span className="text-rose-600 font-bold">+</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* פיקר בחירה (לאחר לחיצה על פריט) */}
        {picker && (() => {
          const { item } = picker;
          const myStocks = stocks.filter((s) => s.itemTypeId === item.id && s.quantity > 0);
          const myUnits = units.filter((u) => u.itemTypeId === item.id);
          const inCartUnits = new Set(lines.filter((l) => l.kind !== "QTY").map((l) => (l as LineSerial | LineLot).serialUnitId));
          return (
            <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-10 p-3" onClick={() => setPicker(null)}>
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
                <div className="bg-rose-600 text-white p-3 shrink-0">
                  <h3 className="font-bold">בחירה לזיכוי: {item.name}</h3>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                  {myStocks.map((s) => {
                    const inCart = lines.filter((l) => l.kind === "QTY" && l.itemId === item.id && (l as LineQty).statusId === s.statusId).reduce((a, b) => a + (b as LineQty).quantity, 0);
                    const remaining = s.quantity - inCart;
                    return (
                      <button key={`${item.id}-${s.statusId}`} onClick={() => addQtyLine(item, s)} disabled={remaining <= 0}
                        className="w-full text-right p-2 rounded-lg border border-slate-200 hover:bg-rose-50 disabled:opacity-50 flex items-center gap-2 text-sm">
                        <span className="text-lg">📦</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium">{s.statusName}</div>
                          <div className="text-xs text-slate-500">זמין: {remaining}/{s.quantity}</div>
                        </div>
                      </button>
                    );
                  })}
                  {myUnits.filter((u) => !inCartUnits.has(u.id)).map((u) => {
                    const isLot = !!u.lotQuantity && u.lotQuantity > 1;
                    return (
                      <button key={u.id} onClick={() => addSerialLine(item, u)}
                        className={`w-full text-right p-2 rounded-lg border mb-1 hover:bg-rose-50 flex items-center gap-2 text-sm ${isLot ? "border-orange-300" : "border-slate-200"}`}>
                        <span className="text-lg">{isLot ? "💣" : "🔫"}</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium">{isLot ? `לוט: ${u.serialNumber}` : `SN: ${u.serialNumber}`}</div>
                          <div className="text-xs text-slate-500">{u.statusName}{isLot && ` · אצווה ×${u.lotQuantity}`}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="p-2 border-t border-slate-200 shrink-0">
                  <button onClick={() => setPicker(null)} className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm">סגור</button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* דיאלוג אצווה */}
        {lotPicker && (
          <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-20 p-3" onClick={() => setLotPicker(null)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="bg-gradient-to-r from-orange-500 to-orange-700 text-white p-4">
                <h3 className="font-bold text-lg">⚠️ זיכוי אצווה</h3>
              </div>
              <div className="p-5 space-y-3">
                <div className="bg-orange-50 border-2 border-orange-300 rounded-lg p-3">
                  <div className="font-bold">{lotPicker.itemName}</div>
                  <div className="text-xs text-slate-600">לוט: <b>{lotPicker.unit.serialNumber}</b> · סה״כ: {lotPicker.unit.lotQuantity}</div>
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1.5">כמות לזיכוי</label>
                  <input type="number" min={1} max={lotPicker.unit.lotQuantity ?? 1} value={lotPicker.qty}
                    onChange={(e) => setLotPicker((p) => p ? { ...p, qty: Math.max(1, Math.min(p.unit.lotQuantity ?? 1, parseInt(e.target.value) || 1)) } : p)}
                    className="w-full rounded-lg border-2 border-orange-300 px-3 py-2 text-2xl font-bold text-center" autoFocus />
                </div>
              </div>
              <div className="p-3 border-t border-slate-200 flex gap-2">
                <button onClick={() => setLotPicker(null)} className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm">ביטול</button>
                <button onClick={confirmLotPick} className="flex-1 bg-orange-600 hover:bg-orange-700 text-white rounded-lg px-4 py-2.5 text-sm font-bold">
                  ✓ הוסף ({lotPicker.qty})
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
            <button onClick={submit} disabled={busy || lines.length === 0 || (requirePersonalId && !recipientPersonalId)}
              className="flex-1 sm:flex-none bg-rose-700 hover:bg-rose-800 disabled:opacity-50 text-white rounded-lg px-5 py-2.5 text-sm font-bold flex items-center justify-center gap-2">
              {busy ? (
                <>
                  <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  שולח...
                </>
              ) : `📤 זכה תעודה (${lines.length} שורות)`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
