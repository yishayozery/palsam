"use client";

import { useState, useMemo } from "react";
import { changeUnitsStatus, changeQuantityStatus } from "./actions";

type Status = { id: string; name: string; isDefault: boolean; isWear: boolean; isLoss: boolean };
type Stock = { itemTypeId: string; itemName: string; sku: string | null; unit: string;
  statusId: string; statusName: string; quantity: number; isWear: boolean; isLoss: boolean };
type SerialUnit = { id: string; itemTypeId: string; itemName: string; sku: string | null;
  serialNumber: string; lotQuantity: number | null; statusId: string; statusName: string;
  isWear: boolean; isLoss: boolean };

function statusBadgeColor(s: Status): string {
  if (s.isLoss) return "bg-rose-100 text-rose-700";
  if (s.isWear) return "bg-amber-100 text-amber-700";
  if (s.isDefault) return "bg-emerald-100 text-emerald-700";
  return "bg-slate-100 text-slate-700";
}

type QtyChange = { itemTypeId: string; itemName: string; unit: string;
  fromStatusId: string; fromStatusName: string;
  available: number; quantity: number;
  newStatusId: string; };

export default function StatusChangeModal({ statuses, stocks, units }: {
  statuses: Status[]; stocks: Stock[]; units: SerialUnit[];
}) {
  const [open, setOpen] = useState(false);
  const [showOnlyDefective, setShowOnlyDefective] = useState(false);
  const [search, setSearch] = useState("");
  const [reason, setReason] = useState("");
  // קווי שינוי כמותי — uid לפי itemTypeId+fromStatusId
  const [qtyChanges, setQtyChanges] = useState<Map<string, QtyChange>>(new Map());
  // יחידות סריאליות שנבחרו לשינוי (id -> newStatusId)
  const [serialChanges, setSerialChanges] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const workingStatusId = statuses.find((s) => s.isDefault && !s.isWear && !s.isLoss)?.id
                       ?? statuses.find((s) => !s.isWear && !s.isLoss)?.id ?? "";

  const filteredStocks = useMemo(() => {
    let list = stocks.filter((s) => s.quantity > 0);
    if (showOnlyDefective) list = list.filter((s) => s.isWear || s.isLoss);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((s) => s.itemName.toLowerCase().includes(q) || (s.sku ?? "").toLowerCase().includes(q));
    }
    return list;
  }, [stocks, showOnlyDefective, search]);

  const filteredUnits = useMemo(() => {
    let list = units;
    if (showOnlyDefective) list = list.filter((u) => u.isWear || u.isLoss);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((u) =>
        u.itemName.toLowerCase().includes(q)
        || (u.sku ?? "").toLowerCase().includes(q)
        || u.serialNumber.toLowerCase().includes(q));
    }
    return list;
  }, [units, showOnlyDefective, search]);

  function setQtyChange(s: Stock, qty: number, newStatusId: string) {
    const key = `${s.itemTypeId}|${s.statusId}`;
    setQtyChanges((m) => {
      const n = new Map(m);
      if (qty <= 0) { n.delete(key); return n; }
      n.set(key, {
        itemTypeId: s.itemTypeId, itemName: s.itemName, unit: s.unit,
        fromStatusId: s.statusId, fromStatusName: s.statusName,
        available: s.quantity, quantity: Math.min(qty, s.quantity),
        newStatusId,
      });
      return n;
    });
  }
  function toggleSerial(u: SerialUnit, newStatusId: string) {
    setSerialChanges((m) => {
      const n = new Map(m);
      if (n.has(u.id)) n.delete(u.id);
      else n.set(u.id, newStatusId);
      return n;
    });
  }
  function changeSerialStatus(u: SerialUnit, newStatusId: string) {
    setSerialChanges((m) => {
      const n = new Map(m);
      n.set(u.id, newStatusId);
      return n;
    });
  }

  function reset() {
    setQtyChanges(new Map()); setSerialChanges(new Map());
    setSearch(""); setReason(""); setError(null); setOk(null);
  }

  async function submit() {
    setError(null); setOk(null);
    const qtyList = Array.from(qtyChanges.values()).filter((c) => c.quantity > 0 && c.newStatusId);
    const serialList = Array.from(serialChanges.entries());
    if (qtyList.length === 0 && serialList.length === 0) { setError("בחר לפחות פריט אחד לשינוי"); return; }
    setBusy(true);
    let totalChanged = 0;
    try {
      // קבוצות סריאליות לפי newStatusId
      const bySerial = new Map<string, string[]>();
      for (const [unitId, newStatusId] of serialList) {
        if (!bySerial.has(newStatusId)) bySerial.set(newStatusId, []);
        bySerial.get(newStatusId)!.push(unitId);
      }
      for (const [newStatusId, unitIds] of bySerial) {
        const fd = new FormData();
        for (const id of unitIds) fd.append("unitId", id);
        fd.append("newStatusId", newStatusId);
        if (reason) fd.append("reason", reason);
        const r = await changeUnitsStatus(fd);
        if (r?.error) { setError(r.error); setBusy(false); return; }
        totalChanged += r?.changed ?? unitIds.length;
      }
      // שינוי כמותי - פעם אחת לכל שורה
      for (const c of qtyList) {
        const fd = new FormData();
        fd.append("itemTypeId", c.itemTypeId);
        fd.append("fromStatusId", c.fromStatusId);
        fd.append("newStatusId", c.newStatusId);
        fd.append("quantity", String(c.quantity));
        if (reason) fd.append("reason", reason);
        const rq = await changeQuantityStatus(fd);
        if (rq?.error) { setError(rq.error); setBusy(false); return; }
        totalChanged += c.quantity;
      }
      setOk(`✓ עודכנו ${totalChanged} פריטים`);
      setTimeout(() => { reset(); setOpen(false); setOk(null); }, 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="bg-amber-600 hover:bg-amber-700 text-white rounded-lg px-3 md:px-5 py-2 md:py-2.5 text-xs md:text-sm font-medium shadow-sm flex items-center gap-2"
        title="הזן כמות פר פריט/בחר יחידות, ובחר סטטוס חדש - הכל בבת אחת">
        ⚠️ <span className="hidden sm:inline">סמן תקול / שנה סטטוס</span><span className="sm:hidden">תקולים</span>
      </button>
    );
  }

  const totalQtyToChange = Array.from(qtyChanges.values()).reduce((s, c) => s + c.quantity, 0);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 md:p-3">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[95vh] flex flex-col overflow-hidden">
        <div className="bg-gradient-to-r from-amber-700 to-amber-900 text-white p-4 flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-bold text-lg">⚠️ שינוי סטטוס פריטים</h3>
            <p className="text-xs text-amber-100 mt-0.5">בחר פריטים והעבר לסטטוס חדש - בבת אחת</p>
          </div>
          <button onClick={() => { reset(); setOpen(false); }} className="text-amber-100 hover:text-white text-2xl">✕</button>
        </div>

        {/* פילטר וחיפוש */}
        <div className="bg-amber-50 border-b border-amber-200 p-3 shrink-0 space-y-2">
          <div className="flex gap-2 flex-wrap items-center">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="חפש פריט / SN..."
              className="flex-1 min-w-40 rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input type="checkbox" checked={showOnlyDefective}
                onChange={(e) => setShowOnlyDefective(e.target.checked)} className="w-4 h-4" />
              <span>הצג רק בלאי / אבוד</span>
            </label>
          </div>
        </div>

        {/* רשימת פריטים */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {error && <div className="bg-rose-50 border-2 border-rose-300 rounded-lg p-3 text-sm text-rose-800">⚠️ {error}</div>}
          {ok && <div className="bg-emerald-50 border-2 border-emerald-300 rounded-lg p-3 text-sm text-emerald-800">{ok}</div>}

          {/* כמותי */}
          {filteredStocks.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide pb-1.5">📦 כמותי</div>
              <div className="space-y-1.5">
                {filteredStocks.map((s) => {
                  const key = `${s.itemTypeId}|${s.statusId}`;
                  const change = qtyChanges.get(key);
                  const tone = s.isLoss ? "border-rose-300 bg-rose-50" : s.isWear ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white";
                  return (
                    <div key={key} className={`border rounded-lg p-2.5 ${tone}`}>
                      <div className="flex items-start gap-2">
                        <span className="text-lg">📦</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">
                            {s.itemName}
                            {s.sku && <span className="font-mono text-[10px] text-slate-400 mr-1">{s.sku}</span>}
                          </div>
                          <div className="text-xs text-slate-500">
                            <b>{s.statusName}</b>{s.isWear && " 🟡"}{s.isLoss && " 🔴"} · זמין: <b>{s.quantity}</b> {s.unit}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap mt-2">
                        <label className="text-[11px] text-slate-600">כמות לשנות:</label>
                        <input type="number" min={0} max={s.quantity}
                          value={change?.quantity ?? ""}
                          onChange={(e) => setQtyChange(s, parseInt(e.target.value) || 0, change?.newStatusId ?? workingStatusId)}
                          placeholder="0"
                          className="w-16 rounded border border-slate-300 px-1.5 py-1 text-sm text-center" />
                        <button type="button"
                          onClick={() => setQtyChange(s, s.quantity, change?.newStatusId ?? workingStatusId)}
                          className="text-[10px] text-blue-600 hover:underline">הכל</button>
                        <label className="text-[11px] text-slate-600 mr-1">↦ לסטטוס:</label>
                        <select value={change?.newStatusId ?? workingStatusId}
                          onChange={(e) => setQtyChange(s, change?.quantity ?? s.quantity, e.target.value)}
                          className="rounded border border-slate-300 px-1.5 py-1 text-xs">
                          {statuses.filter((st) => st.id !== s.statusId).map((st) => (
                            <option key={st.id} value={st.id}>{st.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* סריאלי */}
          {filteredUnits.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide pb-1.5">🔫 סריאלי / אצוות</div>
              <div className="space-y-1.5">
                {filteredUnits.map((u) => {
                  const newStatusId = serialChanges.get(u.id);
                  const selected = !!newStatusId;
                  const tone = u.isLoss ? "border-rose-300 bg-rose-50" : u.isWear ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white";
                  return (
                    <div key={u.id} className={`border rounded-lg p-2.5 ${tone} ${selected ? "ring-2 ring-amber-400" : ""}`}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <input type="checkbox" checked={selected}
                          onChange={() => toggleSerial(u, workingStatusId)}
                          className="w-4 h-4" />
                        <span className="text-lg">{u.lotQuantity && u.lotQuantity > 1 ? "💣" : "🔫"}</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">{u.itemName}</div>
                          <div className="text-xs text-slate-500 font-mono">
                            {u.lotQuantity && u.lotQuantity > 1 ? `לוט: ${u.serialNumber}×${u.lotQuantity}` : `SN: ${u.serialNumber}`} · {u.statusName}
                            {u.isWear && " 🟡"}{u.isLoss && " 🔴"}
                          </div>
                        </div>
                        {selected && (
                          <select value={newStatusId} onChange={(e) => changeSerialStatus(u, e.target.value)}
                            className="rounded border border-slate-300 px-2 py-1 text-xs">
                            {statuses.filter((st) => st.id !== u.statusId).map((st) => (
                              <option key={st.id} value={st.id}>{st.name}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {filteredStocks.length === 0 && filteredUnits.length === 0 && (
            <div className="text-center text-slate-400 py-10 text-sm">
              {showOnlyDefective ? "אין פריטי בלאי / אבוד תואמים" : "אין פריטים תואמים"}
            </div>
          )}
        </div>

        {/* סיבה + שליחה */}
        <div className="border-t border-slate-200 p-3 bg-white shrink-0 space-y-2">
          <input value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="סיבה (אופציונלי): נשק נפל ונשבר; קסדה התבלתה..."
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
          <div className="flex items-center gap-2">
            <button onClick={() => { reset(); setOpen(false); }} disabled={busy}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm disabled:opacity-50">ביטול</button>
            <button onClick={submit}
              disabled={busy || (totalQtyToChange === 0 && serialChanges.size === 0)}
              className="flex-1 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-lg px-5 py-2 text-sm font-bold">
              {busy ? "מעדכן..." : `⚠️ עדכן ${totalQtyToChange + serialChanges.size} פריטים`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
