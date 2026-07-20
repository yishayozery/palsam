"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import BarcodeScanner from "@/components/BarcodeScanner";
import type { ScanHit } from "@/app/(app)/scan-actions";
import type { ScanMsg } from "@/lib/scan-feedback";
import { createSoldierTransfer } from "./actions";

type SignedUnit = { id: string; serial: string; itemName: string; soldierId: string; soldierName: string; soldierPN: string | null; statusName: string; lotQuantity: number | null };
type QtyHolding = { soldierId: string; soldierName: string; soldierPN: string | null; itemTypeId: string; itemName: string; sku: string | null; unit: string; statusId: string; statusName: string; quantity: number };
type Soldier = { id: string; name: string; pn: string | null };
type Loc = { id: string; name: string };

export default function SoldierTransferModal({
  signedUnits, qtyHoldings = [], soldiers, equipmentLocations,
}: {
  signedUnits: SignedUnit[];
  qtyHoldings?: QtyHolding[];
  soldiers: Soldier[];
  equipmentLocations: Loc[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lotPick, setLotPick] = useState<Map<string, number>>(new Map()); // serialId → כמות חלקית לאצווה
  const [qtyPick, setQtyPick] = useState<Map<string, number>>(new Map()); // `${itemTypeId}|${statusId}` → כמות
  const [keepLoc, setKeepLoc] = useState(true);
  const [locId, setLocId] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [scanMsg, setScanMsg] = useState<ScanMsg | null>(null);

  // חיילים שיש להם ציוד חתום (סריאלי או כמותי) — מקור אפשרי
  const fromSoldiers = useMemo(() => {
    const m = new Map<string, { id: string; name: string; pn: string | null; count: number }>();
    for (const u of signedUnits) {
      const e = m.get(u.soldierId) ?? { id: u.soldierId, name: u.soldierName, pn: u.soldierPN, count: 0 };
      e.count++; m.set(u.soldierId, e);
    }
    for (const q of qtyHoldings) {
      const e = m.get(q.soldierId) ?? { id: q.soldierId, name: q.soldierName, pn: q.soldierPN, count: 0 };
      e.count++; m.set(q.soldierId, e);
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [signedUnits, qtyHoldings]);

  const fromUnits = useMemo(() => signedUnits.filter((u) => u.soldierId === fromId), [signedUnits, fromId]);
  const fromQty = useMemo(() => qtyHoldings.filter((q) => q.soldierId === fromId), [qtyHoldings, fromId]);

  function reset() {
    setFromId(""); setToId(""); setSelected(new Set()); setLotPick(new Map()); setQtyPick(new Map()); setKeepLoc(true); setLocId(""); setMsg(null);
  }
  function toggle(id: string) {
    setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  function setLot(id: string, v: number) {
    setLotPick((prev) => { const n = new Map(prev); if (v > 0) n.set(id, v); else n.delete(id); return n; });
  }
  function setQty(key: string, v: number) {
    setQtyPick((prev) => { const n = new Map(prev); if (v > 0) n.set(key, v); else n.delete(key); return n; });
  }

  /** 📷 סריקה → בחירת פריט להעברה; קופצת אוטומטית לחייל המוסר. */
  function handleScan(hit: ScanHit) {
    if (hit.kind === "NOT_FOUND") return;
    if (hit.kind === "SERIAL") {
      const u = signedUnits.find((x) => x.id === hit.unitId);
      if (!u) { setScanMsg({ ok: false, text: `${hit.itemName} · ${hit.serialNumber} — לא חתום על אף חייל` }); return; }
      if (u.soldierId !== fromId) { setFromId(u.soldierId); setSelected(new Set()); setLotPick(new Map()); setQtyPick(new Map()); }
      setSelected((prev) => new Set(prev).add(u.id));
      setScanMsg({ ok: true, text: `${u.itemName} · ${u.serial} — ${u.soldierName}` });
      return;
    }
    if (!fromId) { setScanMsg({ ok: false, text: `${hit.itemName} — בחר קודם חייל מוסר (פריט כמותי)` }); return; }
    const q = qtyHoldings.find((x) => x.soldierId === fromId && x.itemTypeId === hit.itemTypeId && x.quantity > 0);
    if (!q) { setScanMsg({ ok: false, text: `${hit.itemName} — לא חתום על החייל המוסר` }); return; }
    const key = `${q.itemTypeId}|${q.statusId}`;
    const next = Math.min(q.quantity, (qtyPick.get(key) ?? 0) + 1);
    setQty(key, next);
    setScanMsg({ ok: true, text: `${q.itemName} — ${next}/${q.quantity}` });
  }

  const totalPicked = selected.size + [...qtyPick.values()].filter((v) => v > 0).length;

  function submit() {
    setMsg(null);
    if (!fromId || !toId) { setMsg("בחר חייל מוסר וחייל מקבל"); return; }
    if (totalPicked === 0) { setMsg("בחר לפחות פריט אחד להעברה"); return; }
    const fd = new FormData();
    fd.set("fromSoldierId", fromId);
    fd.set("toSoldierId", toId);
    fd.set("keepLocation", keepLoc ? "true" : "false");
    if (!keepLoc && locId) fd.set("equipmentLocationId", locId);
    selected.forEach((id) => {
      fd.append("serial", id);
      const lot = lotPick.get(id);
      if (lot && lot > 0) fd.set(`lotQty:${id}`, String(lot));
    });
    for (const [key, v] of qtyPick.entries()) {
      if (v > 0) { const [itemTypeId, statusId] = key.split("|"); fd.append(`qty:${itemTypeId}:${statusId}`, String(v)); }
    }
    startTransition(async () => {
      const r = await createSoldierTransfer(fd);
      if (r.error) { setMsg(r.error); return; }
      setOpen(false); reset(); router.refresh();
    });
  }

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="text-sm bg-violet-600 hover:bg-violet-700 text-white rounded-lg px-3 py-2 font-medium">
        🔄 העברה בין חיילים
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start sm:items-center justify-center overflow-y-auto p-3 sm:p-4"
          onClick={() => setOpen(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg my-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white rounded-t-2xl">
              <h3 className="font-bold text-lg">🔄 העברת ציוד בין חיילים</h3>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700 text-xl">✕</button>
            </div>

            <div className="p-4 space-y-4">
              <p className="text-xs text-slate-500">
                הציוד יעבור לחייל המקבל, והוא יתבקש לחתום דיגיטלית בבוט. עד לחתימה — התעודה במצב &quot;ממתין&quot;.
              </p>

              {/* סריקה — מזהה את החייל המוסר לבד */}
              <div className="flex items-center gap-2">
                <BarcodeScanner label="📷 סרוק פריט להעברה" onHit={handleScan} />
                {scanMsg && (
                  <span className={`flex-1 rounded-lg px-2 py-1 text-[11px] ${scanMsg.ok ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
                    {scanMsg.ok ? "✅" : "⚠️"} {scanMsg.text}
                  </span>
                )}
              </div>

              {/* חייל מוסר */}
              <label className="block text-sm">חייל מוסר
                <select value={fromId} onChange={(e) => { setFromId(e.target.value); setSelected(new Set()); setLotPick(new Map()); setQtyPick(new Map()); }}
                  className="mt-1 w-full border border-slate-300 rounded-lg px-2 py-2 text-sm bg-white">
                  <option value="">— בחר חייל עם ציוד חתום —</option>
                  {fromSoldiers.map((s) => <option key={s.id} value={s.id}>{s.name}{s.pn ? ` (${s.pn})` : ""} · {s.count} פריטים</option>)}
                </select>
              </label>

              {/* פריטים סריאליים / אצווה */}
              {fromId && (
                <div>
                  <div className="text-sm font-medium text-slate-700 mb-1">ציוד סריאלי / אצווה ({selected.size}/{fromUnits.length})</div>
                  <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-52 overflow-y-auto">
                    {fromUnits.map((u) => {
                      const isLot = !!u.lotQuantity && u.lotQuantity > 1;
                      return (
                        <div key={u.id} className="px-3 py-2 text-sm hover:bg-slate-50">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={selected.has(u.id)} onChange={() => toggle(u.id)} className="w-4 h-4 accent-violet-600" />
                            <span className="flex-1">{u.itemName} — <span className="font-mono text-xs">{u.serial}</span>{isLot ? ` (מלאי ×${u.lotQuantity})` : ""}</span>
                            <span className="text-[11px] text-slate-400">{u.statusName}</span>
                          </label>
                          {isLot && selected.has(u.id) && (
                            <div className="flex items-center gap-2 mt-1 pr-6 text-xs text-slate-500">
                              כמות להעברה מהאצווה:
                              <input type="number" min={1} max={u.lotQuantity!} value={lotPick.get(u.id) ?? u.lotQuantity!}
                                onChange={(e) => setLot(u.id, Math.max(0, Math.min(u.lotQuantity!, parseInt(e.target.value || "0", 10))))}
                                className="w-20 border border-slate-300 rounded px-2 py-1 text-sm" />
                              <span>מתוך {u.lotQuantity}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {fromUnits.length === 0 && <div className="px-3 py-2 text-sm text-slate-400">אין ציוד סריאלי חתום</div>}
                  </div>
                </div>
              )}

              {/* פריטים כמותיים */}
              {fromId && fromQty.length > 0 && (
                <div>
                  <div className="text-sm font-medium text-slate-700 mb-1">ציוד כמותי</div>
                  <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-52 overflow-y-auto">
                    {fromQty.map((q) => {
                      const key = `${q.itemTypeId}|${q.statusId}`;
                      return (
                        <div key={key} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50">
                          <span className="flex-1">{q.itemName} <span className="text-[11px] text-slate-400">· {q.statusName}</span></span>
                          <span className="text-[11px] text-slate-400">יש {q.quantity} {q.unit}</span>
                          <input type="number" min={0} max={q.quantity} value={qtyPick.get(key) ?? 0}
                            onChange={(e) => setQty(key, Math.max(0, Math.min(q.quantity, parseInt(e.target.value || "0", 10))))}
                            className="w-20 border border-slate-300 rounded px-2 py-1 text-sm" />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* חייל מקבל */}
              <label className="block text-sm">חייל מקבל
                <select value={toId} onChange={(e) => setToId(e.target.value)}
                  className="mt-1 w-full border border-slate-300 rounded-lg px-2 py-2 text-sm bg-white">
                  <option value="">— בחר חייל —</option>
                  {soldiers.filter((s) => s.id !== fromId).map((s) => <option key={s.id} value={s.id}>{s.name}{s.pn ? ` (${s.pn})` : ""}</option>)}
                </select>
              </label>

              {/* מיקום (רלוונטי לציוד סריאלי) */}
              {selected.size > 0 && (
                <div className="text-sm">
                  <div className="font-medium text-slate-700 mb-1">מיקום הציוד הסריאלי</div>
                  <label className="flex items-center gap-2 mb-1">
                    <input type="radio" name="loc" checked={keepLoc} onChange={() => setKeepLoc(true)} /> להשאיר במיקום הנוכחי
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="radio" name="loc" checked={!keepLoc} onChange={() => setKeepLoc(false)} /> להעביר למיקום:
                  </label>
                  {!keepLoc && (
                    <select value={locId} onChange={(e) => setLocId(e.target.value)}
                      className="mt-1 w-full border border-slate-300 rounded-lg px-2 py-2 text-sm bg-white">
                      <option value="">— ללא מיקום —</option>
                      {equipmentLocations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  )}
                </div>
              )}

              {msg && <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{msg}</div>}
            </div>

            <div className="flex items-center justify-end gap-2 p-4 border-t sticky bottom-0 bg-white rounded-b-2xl">
              <button onClick={() => setOpen(false)} className="text-sm text-slate-600 px-4 py-2 hover:bg-slate-50 rounded-lg">ביטול</button>
              <button onClick={submit} disabled={pending}
                className="text-sm bg-violet-600 text-white rounded-lg px-5 py-2 font-medium hover:bg-violet-700 disabled:opacity-50">
                {pending ? "מעביר…" : "🔄 בצע העברה ושלח לחתימה"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
