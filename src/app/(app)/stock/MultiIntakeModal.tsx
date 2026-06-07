"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { declareMulti } from "./actions";
import { useEscClose } from "@/lib/useEscClose";

type Item = { id: string; name: string; sku: string | null; trackingMethod: "QUANTITY" | "SERIAL" | "LOT" | "KIT"; unit: string };
type Status = { id: string; name: string; isDefault: boolean };
type CounterpartOption = { value: string; label: string };

type Line = {
  uid: number; // local UID
  itemId: string;
  itemName: string;
  trackingMethod: "QUANTITY" | "SERIAL" | "LOT";
  unit: string;
  statusId: string;
  quantity: number;
  serials: string;
  lotNumber: string;
  expiryDate: string; // YYYY-MM-DD; ריק=ללא תפוגה
};

let UID_SEQ = 1;

export default function MultiIntakeModal({
  items, statuses, currentUserName, requirePersonalId, counterpartOptions = [],
}: {
  items: Item[]; statuses: Status[]; currentUserName: string;
  requirePersonalId: boolean; counterpartOptions?: CounterpartOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [externalUnit, setExternalUnit] = useState(counterpartOptions[0]?.value || "חטיבה");
  const [externalContact, setExternalContact] = useState("");
  const [recipientPersonalId, setRecipientPersonalId] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEscClose(open, () => { setOpen(false); });

  const defaultStatusId = statuses.find((s) => s.isDefault)?.id ?? statuses[0]?.id ?? "";

  const filtered = useMemo(() => {
    if (!search.trim()) return items.slice(0, 50);
    const q = search.toLowerCase();
    return items.filter((i) => i.name.toLowerCase().includes(q) || (i.sku || "").toLowerCase().includes(q)).slice(0, 50);
  }, [items, search]);

  const addLine = (it: Item) => {
    if (it.trackingMethod === "KIT") return;
    const tm = it.trackingMethod as "QUANTITY" | "SERIAL" | "LOT";
    setLines((l) => [...l, {
      uid: UID_SEQ++, itemId: it.id, itemName: it.name,
      trackingMethod: tm, unit: it.unit,
      statusId: defaultStatusId, quantity: 1, serials: "", lotNumber: "", expiryDate: "",
    }]);
    setSearch("");
  };

  const updateLine = (uid: number, patch: Partial<Line>) => {
    setLines((l) => l.map((x) => x.uid === uid ? { ...x, ...patch } : x));
  };
  const removeLine = (uid: number) => setLines((l) => l.filter((x) => x.uid !== uid));
  const reset = () => {
    setLines([]); setExternalUnit(counterpartOptions[0]?.value || "חטיבה"); setExternalContact("");
    setRecipientPersonalId(""); setSearch(""); setError(null);
  };

  async function submit() {
    setError(null);
    if (lines.length === 0) { setError("הוסף לפחות פריט אחד לתעודה"); return; }
    // ולידציה בסיסית קליינטית
    for (const l of lines) {
      if (l.trackingMethod === "SERIAL") {
        const sns = l.serials.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
        if (sns.length === 0) { setError(`חסרים SN ל-${l.itemName}`); return; }
      }
      if (l.trackingMethod === "LOT") {
        if (!l.lotNumber.trim()) { setError(`חסר מספר אצווה ל-${l.itemName}`); return; }
      }
      if (l.quantity < 1 && l.trackingMethod !== "SERIAL") { setError(`כמות לא תקינה ל-${l.itemName}`); return; }
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("externalUnit", externalUnit);
      fd.append("externalContact", externalContact);
      fd.append("recipientPersonalId", recipientPersonalId);
      lines.forEach((l, i) => {
        fd.append(`line:${i}:itemTypeId`, l.itemId);
        fd.append(`line:${i}:trackingMethod`, l.trackingMethod);
        fd.append(`line:${i}:statusId`, l.statusId);
        fd.append(`line:${i}:quantity`, String(l.quantity));
        if (l.trackingMethod === "SERIAL") fd.append(`line:${i}:serials`, l.serials);
        if (l.trackingMethod === "LOT") fd.append(`line:${i}:lotNumber`, l.lotNumber);
        if (l.expiryDate) fd.append(`line:${i}:expiryDate`, l.expiryDate);
      });
      const res = await declareMulti(fd);
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
        className="bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg px-4 py-2.5 text-sm font-medium flex items-center gap-2">
        📥 הוספת מלאי
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-2 md:p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[95vh] flex flex-col overflow-hidden">
        <div className="bg-gradient-to-r from-emerald-700 to-emerald-900 text-white p-4 flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-bold text-lg">📥 הוספת מלאי</h3>
            <p className="text-xs text-emerald-100 mt-0.5">הוסף פריט אחד או יותר — תעודה אחת לכל הקליטה</p>
          </div>
          <button onClick={() => setOpen(false)} className="text-emerald-100 hover:text-white text-2xl">✕</button>
        </div>

        {/* פרטי תעודה */}
        <div className="bg-emerald-50 border-b border-emerald-200 p-3 shrink-0 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] text-slate-600 mb-0.5">יחידה מנפקת</label>
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
              <label className="block text-[11px] text-slate-600 mb-0.5">שם המנפק (אדם)</label>
              <input value={externalContact} onChange={(e) => setExternalContact(e.target.value)} placeholder="שם הקצין"
                className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
            </div>
          </div>
          {requirePersonalId && (
            <div>
              <label className="block text-[11px] font-bold text-amber-900 mb-0.5">🔒 מ.א. של המנפק (חובה)</label>
              <input value={recipientPersonalId} onChange={(e) => setRecipientPersonalId(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric" placeholder="1234567" required
                className="w-full rounded-lg border border-amber-400 px-2 py-1.5 text-sm font-mono" />
            </div>
          )}
          <p className="text-[10px] text-emerald-700">המקבל: <b>{currentUserName}</b></p>
        </div>

        <div className="flex-1 grid md:grid-cols-2 gap-0 overflow-hidden min-h-0">
          {/* עגלה */}
          <div className="border-l border-slate-200 flex flex-col bg-slate-50 order-2 md:order-1 min-h-0">
            <div className="p-3 border-b border-slate-200 flex items-center justify-between bg-white">
              <div className="font-bold text-slate-800">🛒 עגלת קליטה ({lines.length})</div>
              {lines.length > 0 && <button onClick={() => setLines([])} className="text-xs text-rose-500">נקה</button>}
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {lines.length === 0 ? (
                <div className="text-center text-slate-400 py-10 text-sm">העגלה ריקה.<br />בחר פריטים מהמלאי.</div>
              ) : lines.map((l) => (
                <div key={l.uid} className="bg-white border border-slate-200 rounded-lg p-2.5 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-lg">{l.trackingMethod === "SERIAL" ? "🔫" : l.trackingMethod === "LOT" ? "💣" : "📦"}</span>
                        <span className="font-medium text-sm truncate">{l.itemName}</span>
                        <span className="text-[10px] bg-slate-100 rounded px-1.5 py-0.5">
                          {l.trackingMethod === "SERIAL" ? "סריאלי" : l.trackingMethod === "LOT" ? "אצווה" : "כמותי"}
                        </span>
                      </div>
                    </div>
                    <button onClick={() => removeLine(l.uid)} className="text-rose-400 hover:text-rose-700 text-sm">✕</button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <select value={l.statusId} onChange={(e) => updateLine(l.uid, { statusId: e.target.value })}
                      className="rounded border border-slate-300 px-2 py-1 text-xs">
                      {statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    {l.trackingMethod !== "SERIAL" && (
                      <input type="number" min={1} value={l.quantity}
                        onChange={(e) => updateLine(l.uid, { quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                        className="rounded border border-slate-300 px-2 py-1 text-xs text-center" />
                    )}
                  </div>
                  {l.trackingMethod === "SERIAL" && (
                    <textarea value={l.serials} onChange={(e) => updateLine(l.uid, { serials: e.target.value })}
                      rows={3} placeholder="SN בכל שורה (Enter בין מספרים)"
                      className="w-full rounded border border-slate-300 px-2 py-1 text-xs font-mono" />
                  )}
                  {l.trackingMethod === "LOT" && (
                    <input value={l.lotNumber} onChange={(e) => updateLine(l.uid, { lotNumber: e.target.value })}
                      placeholder="מספר אצווה"
                      className="w-full rounded border border-slate-300 px-2 py-1 text-xs font-mono" />
                  )}
                  {(l.trackingMethod === "SERIAL" || l.trackingMethod === "LOT") && (
                    <div>
                      <label className="block text-[10px] text-slate-500 mb-0.5">⏱️ תאריך תפוגה (אופציונלי)</label>
                      <input type="date" value={l.expiryDate} onChange={(e) => updateLine(l.uid, { expiryDate: e.target.value })}
                        className="w-full rounded border border-slate-300 px-2 py-1 text-xs" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* מלאי לבחירה */}
          <div className="flex flex-col bg-white order-1 md:order-2 min-h-0">
            <div className="p-3 border-b border-slate-200 sticky top-0 bg-white shrink-0">
              <div className="font-bold text-slate-800 mb-2">📋 קטלוג פריטים</div>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="חפש פריט / מק״ט..."
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {filtered.length === 0 ? (
                <p className="text-center text-slate-400 py-8 text-sm">אין תוצאות</p>
              ) : filtered.map((i) => {
                const icon = i.trackingMethod === "SERIAL" ? "🔫" : i.trackingMethod === "LOT" ? "💣" : "📦";
                return (
                  <button key={i.id} onClick={() => addLine(i)}
                    className="w-full text-right p-2 rounded-lg border border-slate-200 hover:bg-emerald-50 hover:border-emerald-300 flex items-center gap-2 text-sm">
                    <span className="text-lg">{icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{i.name}</div>
                      <div className="text-xs text-slate-500">
                        {i.sku && <span className="font-mono">{i.sku} · </span>}
                        {i.trackingMethod === "SERIAL" ? "סריאלי" : i.trackingMethod === "LOT" ? "אצווה" : "כמותי"} · {i.unit}
                      </div>
                    </div>
                    <span className="text-emerald-600 font-bold text-lg">+</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="border-t border-slate-200 p-3 bg-white shrink-0">
          {error && <div className="text-sm text-rose-700 font-medium mb-2">⚠️ {error}</div>}
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => { reset(); setOpen(false); }} disabled={busy}
              className="flex-1 sm:flex-none rounded-lg border border-slate-300 px-4 py-2.5 text-sm disabled:opacity-50">ביטול</button>
            <button onClick={submit} disabled={busy || lines.length === 0 || (requirePersonalId && !recipientPersonalId)}
              className="flex-1 sm:flex-none bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white rounded-lg px-5 py-2.5 text-sm font-bold flex items-center justify-center gap-2">
              {busy ? (
                <>
                  <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  קולט...
                </>
              ) : `✓ קלוט תעודה (${lines.length} שורות)`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
