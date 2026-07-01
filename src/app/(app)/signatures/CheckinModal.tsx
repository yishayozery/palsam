"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { checkinBatch } from "./actions";
import { returnKitWithCheck, type KitReturnItem } from "../ymach/actions";
import { useEscClose } from "@/lib/useEscClose";

type Unit = {
  id: string; serial: string; itemName: string;
  soldierId: string; soldierName: string; soldierPN: string | null; companyName: string | null;
  statusId: string; statusName: string; isWear: boolean; isLoss: boolean;
  lotQuantity: number | null;
};
type QtyHolding = {
  soldierId: string; soldierName: string; soldierPN: string | null;
  itemTypeId: string; itemName: string; sku: string | null; unit: string;
  statusId: string; statusName: string; isWear: boolean; isLoss: boolean;
  quantity: number;
};
type Status = { id: string; name: string; isWear: boolean; isLoss: boolean; isDefault: boolean };
type OpKitCheckin = { id: string; name: string; status: string; soldierId: string; soldierName: string; items: { itemTypeId: string; itemName: string; sku: string | null; quantity: number }[] };

export default function CheckinModal({ signedUnits, qtyHoldings = [], defaultToHolderId, statuses, operationalKits = [] }: {
  signedUnits: Unit[];
  qtyHoldings?: QtyHolding[];
  defaultToHolderId?: string | null;
  statuses: Status[];
  operationalKits?: OpKitCheckin[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [soldierId, setSoldierId] = useState("");
  const [soldierSearch, setSoldierSearch] = useState("");
  const [selectedUnits, setSelectedUnits] = useState<Set<string>>(new Set());
  // 🆕 כמויות לזיכוי לפריטים כמותיים: key = `${itemTypeId}|${statusId}` → qty
  const [qtyReturn, setQtyReturn] = useState<Map<string, number>>(new Map());
  // ⚠️ כמות חלקית לזיכוי לכל אצווה (unitId → qty)
  const [partialLotQty, setPartialLotQty] = useState<Map<string, number>>(new Map());
  const [newStatusId, setNewStatusId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lotPicker, setLotPicker] = useState<{ unit: Unit; qty: number } | null>(null);
  // מארזים מבצעיים — כמות שהוחזרה (kitId → itemTypeId → qty)
  const [opKitReturned, setOpKitReturned] = useState<Record<string, Record<string, number>>>({});
  // סיבת חוסר (kitId → itemTypeId → reason)
  const [opKitReason, setOpKitReason] = useState<Record<string, Record<string, string>>>({});
  // מסך הצלחה אחרי זיכוי
  const [doneData, setDoneData] = useState<{ transferId: string; soldierName: string; soldierPhone: string | null } | null>(null);

  useEscClose(open && !lotPicker, () => { reset(); setOpen(false); });

  // חיילים שיש להם ציוד חתום (סריאלי + כמותי)
  const soldiers = useMemo(() => {
    const map = new Map<string, { id: string; name: string; pn: string | null; companyName: string | null; count: number }>();
    for (const u of signedUnits) {
      if (!map.has(u.soldierId)) {
        map.set(u.soldierId, { id: u.soldierId, name: u.soldierName, pn: u.soldierPN, companyName: u.companyName, count: 0 });
      }
      map.get(u.soldierId)!.count++;
    }
    for (const q of qtyHoldings) {
      if (!map.has(q.soldierId)) {
        map.set(q.soldierId, { id: q.soldierId, name: q.soldierName, pn: q.soldierPN, companyName: null, count: 0 });
      }
      map.get(q.soldierId)!.count++;
    }
    for (const k of operationalKits.filter((ok) => ok.status === "ISSUED")) {
      if (!map.has(k.soldierId)) {
        map.set(k.soldierId, { id: k.soldierId, name: k.soldierName, pn: null, companyName: null, count: 0 });
      }
      map.get(k.soldierId)!.count++;
    }
    let list = Array.from(map.values());
    if (soldierSearch.trim()) {
      const q = soldierSearch.toLowerCase();
      list = list.filter((s) => s.name.toLowerCase().includes(q) || (s.pn ?? "").includes(q));
    }
    return list;
  }, [signedUnits, qtyHoldings, soldierSearch]);

  const selectedSoldier = soldiers.find((s) => s.id === soldierId);
  const soldierUnits = useMemo(() => signedUnits.filter((u) => u.soldierId === soldierId), [signedUnits, soldierId]);
  const soldierQty = useMemo(() => qtyHoldings.filter((q) => q.soldierId === soldierId), [qtyHoldings, soldierId]);

  const soldierOpKits = operationalKits.filter((k) => k.soldierId === soldierId && k.status === "ISSUED");

  const reset = () => {
    setSoldierId(""); setSoldierSearch(""); setSelectedUnits(new Set());
    setPartialLotQty(new Map()); setQtyReturn(new Map()); setNewStatusId(""); setError(null);
    setOpKitReturned({}); setOpKitReason({}); setDoneData(null);
  };

  // לחיצה על יחידה — אם זו אצווה, פתח דיאלוג; אחרת סמן/בטל
  const toggleUnit = (u: Unit, checked: boolean) => {
    if (checked && u.lotQuantity && u.lotQuantity > 1) {
      setLotPicker({ unit: u, qty: u.lotQuantity });
      return;
    }
    setSelectedUnits((s) => {
      const n = new Set(s);
      if (checked) n.add(u.id); else n.delete(u.id);
      return n;
    });
    if (!checked) setPartialLotQty((m) => { const n = new Map(m); n.delete(u.id); return n; });
  };

  const confirmLotPick = () => {
    if (!lotPicker) return;
    const { unit, qty } = lotPicker;
    if (qty < 1 || qty > (unit.lotQuantity ?? 1)) return;
    setSelectedUnits((s) => new Set(s).add(unit.id));
    if (qty < (unit.lotQuantity ?? 1)) {
      setPartialLotQty((m) => new Map(m).set(unit.id, qty));
    } else {
      setPartialLotQty((m) => { const n = new Map(m); n.delete(unit.id); return n; });
    }
    setLotPicker(null);
  };

  async function submit() {
    const qtyTotal = Array.from(qtyReturn.values()).reduce((s, n) => s + n, 0);
    if (selectedUnits.size === 0 && qtyTotal === 0 && soldierOpKits.length === 0) { setError("בחר לפחות פריט אחד לזיכוי"); return; }
    setBusy(true); setError(null);
    try {
      // שלב 1: זיכוי מארזים מבצעיים
      for (const kit of soldierOpKits) {
        const items: KitReturnItem[] = kit.items.map((item) => {
          const returned = opKitReturned[kit.id]?.[item.itemTypeId] ?? item.quantity;
          const missing = item.quantity - returned;
          const reason = opKitReason[kit.id]?.[item.itemTypeId] as KitReturnItem["reason"] ?? "OTHER";
          return { itemTypeId: item.itemTypeId, returnedQty: returned, missingQty: missing, reason: missing > 0 ? reason : undefined };
        });
        const res = await returnKitWithCheck(kit.id, items);
        if (res.error) { setError(`שגיאה במארז ${kit.name}: ${res.error}`); setBusy(false); return; }
      }

      // שלב 2: זיכוי סריאלי + כמותי — batch אחד → transfer אחד
      const serialUnitIds = [...selectedUnits];
      const partialLots: Record<string, number> = {};
      for (const [uid, qty] of partialLotQty) partialLots[uid] = qty;
      const qtyItems: { itemTypeId: string; statusId: string; quantity: number }[] = [];
      for (const q of soldierQty) {
        const key = `${q.itemTypeId}|${q.statusId}`;
        const ret = qtyReturn.get(key) ?? 0;
        if (ret < 1) continue;
        qtyItems.push({ itemTypeId: q.itemTypeId, statusId: q.statusId, quantity: ret });
      }

      if (serialUnitIds.length > 0 || qtyItems.length > 0) {
        const res = await checkinBatch({
          soldierId,
          serialUnitIds,
          partialLotQtys: partialLots,
          statusId: newStatusId,
          qtyItems,
          toHolderId: defaultToHolderId ?? "",
        });
        if (!res.ok) { setError(res.error); setBusy(false); return; }
        setDoneData(res);
      } else if (soldierOpKits.length > 0) {
        // רק מארזים, בלי פריטים נפרדים — סוגרים
        reset(); setOpen(false); router.refresh();
        return;
      }

      setBusy(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
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

  if (doneData) {
    const normalizedPhone = doneData.soldierPhone?.replace(/\D/g, "").replace(/^0/, "972") ?? "";
    const docUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/transfer-doc/${doneData.transferId}`;
    const waText = `שלום ${doneData.soldierName}, מצורף אישור זיכוי ציוד:\n${docUrl}`;
    const waUrl = normalizedPhone
      ? `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(waText)}`
      : `https://wa.me/?text=${encodeURIComponent(waText)}`;
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-2 md:p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 text-center">
          <div className="text-6xl mb-3">✅</div>
          <p className="font-bold text-emerald-700 text-xl">הזיכוי בוצע בהצלחה!</p>
          <p className="text-sm text-slate-500 mt-2">{doneData.soldierName} — הציוד הוחזר למחסן</p>
          <div className="mt-4 flex gap-2">
            <a href={waUrl} target="_blank" rel="noopener noreferrer"
              className="flex-1 bg-green-600 hover:bg-green-700 text-white rounded-lg py-2.5 text-sm font-bold text-center">
              📤 שלח טופס לחייל
            </a>
            <a href={docUrl} target="_blank" rel="noreferrer"
              className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-center hover:bg-slate-50">
              📄 צפייה
            </a>
          </div>
          <button onClick={() => { setDoneData(null); reset(); setOpen(false); }}
            className="mt-4 bg-amber-600 hover:bg-amber-700 text-white rounded-lg px-6 py-2 text-sm font-medium w-full">
            → סגור
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-2 md:p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[95vh] flex flex-col overflow-hidden relative">
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
          ) : soldierUnits.length === 0 && soldierQty.length === 0 && soldierOpKits.length === 0 ? (
            <p className="text-center text-slate-400 py-10 text-sm">אין ציוד חתום על {selectedSoldier?.name}</p>
          ) : (
            <>
              {/* מארזים מבצעיים */}
              {soldierOpKits.length > 0 && (
                <>
                  <div className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wide px-1 pb-1">📦 מארזים מבצעיים ({soldierOpKits.length})</div>
                  {soldierOpKits.map((kit) => (
                    <div key={kit.id} className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 mb-2">
                      <div className="font-medium text-sm text-emerald-800 mb-2">{kit.name}</div>
                      <div className="space-y-1.5">
                        {kit.items.map((item) => {
                          const returned = opKitReturned[kit.id]?.[item.itemTypeId] ?? item.quantity;
                          const missing = item.quantity - returned;
                          const reason = opKitReason[kit.id]?.[item.itemTypeId] ?? "";
                          return (
                            <div key={item.itemTypeId} className="flex flex-wrap items-center gap-2 text-xs bg-white rounded p-2 border border-slate-100">
                              <div className="flex-1 min-w-0">
                                <span className="font-medium">{item.itemName}</span>
                                {item.sku && <span className="text-slate-400 mr-1 font-mono text-[10px]">{item.sku}</span>}
                                <span className="text-slate-500 mr-1">×{item.quantity}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <label className="text-[10px] text-slate-500">הוחזר:</label>
                                <button type="button" onClick={() => setOpKitReturned((p) => ({ ...p, [kit.id]: { ...p[kit.id], [item.itemTypeId]: Math.max(0, returned - 1) } }))}
                                  className="w-6 h-6 rounded border border-slate-300 text-sm font-bold">−</button>
                                <span className={`w-8 text-center font-bold ${returned === item.quantity ? "text-emerald-700" : "text-amber-600"}`}>{returned}</span>
                                <button type="button" onClick={() => setOpKitReturned((p) => ({ ...p, [kit.id]: { ...p[kit.id], [item.itemTypeId]: Math.min(item.quantity, returned + 1) } }))}
                                  className="w-6 h-6 rounded border border-slate-300 text-sm font-bold">+</button>
                              </div>
                              {missing > 0 && (
                                <div className="w-full flex items-center gap-1 mt-1">
                                  <span className="text-rose-600 text-[10px] font-bold">חסר {missing}!</span>
                                  <select value={reason} onChange={(e) => setOpKitReason((p) => ({ ...p, [kit.id]: { ...p[kit.id], [item.itemTypeId]: e.target.value } }))}
                                    className="text-[10px] rounded border border-rose-300 px-1 py-0.5">
                                    <option value="">סיבה</option>
                                    <option value="LOST">אבד</option>
                                    <option value="BROKEN">שבור</option>
                                    <option value="IN_USE">בשימוש</option>
                                    <option value="OTHER">אחר</option>
                                  </select>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </>
              )}
              {soldierQty.length > 0 && (
                <>
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-1 pb-1">📦 כמותי</div>
                  {soldierQty.map((q) => {
                    const key = `${q.itemTypeId}|${q.statusId}`;
                    const ret = qtyReturn.get(key) ?? 0;
                    return (
                      <div key={key} className={`flex items-center gap-2 p-2.5 rounded-lg border mb-1 ${ret > 0 ? "bg-amber-50 border-amber-300" : "bg-white border-slate-200"}`}>
                        <span className="text-lg">📦</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">
                            {q.itemName}
                            {q.sku && <span className="text-[10px] text-slate-400 mr-1 font-mono">{q.sku}</span>}
                          </div>
                          <div className="text-xs text-slate-500">
                            {q.statusName}{q.isWear && " 🟡"}{q.isLoss && " 🔴"} · מחזיק: <b>{q.quantity}</b> {q.unit}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button type="button" onClick={() => setQtyReturn((m) => { const n = new Map(m); n.set(key, Math.max(0, (n.get(key) ?? 0) - 1)); return n; })}
                            className="w-7 h-7 rounded border border-slate-300 text-sm font-bold">−</button>
                          <input type="number" min={0} max={q.quantity} value={ret}
                            onChange={(e) => setQtyReturn((m) => { const n = new Map(m); n.set(key, Math.max(0, Math.min(q.quantity, parseInt(e.target.value) || 0))); return n; })}
                            className="w-14 text-center rounded border border-slate-300 px-1.5 py-1 text-sm" />
                          <button type="button" onClick={() => setQtyReturn((m) => { const n = new Map(m); n.set(key, Math.min(q.quantity, (n.get(key) ?? 0) + 1)); return n; })}
                            className="w-7 h-7 rounded border border-slate-300 text-sm font-bold">+</button>
                          <button type="button" onClick={() => setQtyReturn((m) => { const n = new Map(m); n.set(key, q.quantity); return n; })}
                            className="text-[10px] text-blue-600 hover:underline px-1">הכל</button>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
              {soldierUnits.length > 0 && <>
              <div className="flex items-center justify-between mb-2 px-1">
                <span className="text-sm font-bold text-slate-700">סריאלי / אצוות של {selectedSoldier?.name} ({soldierUnits.length})</span>
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
                const isLot = !!u.lotQuantity && u.lotQuantity > 1;
                const partial = partialLotQty.get(u.id);
                return (
                  <label key={u.id} className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer ${checked ? (isLot ? "bg-orange-50 border-orange-300" : "bg-amber-50 border-amber-300") : (isLot ? "bg-white border-orange-200 hover:bg-orange-50" : "bg-white border-slate-200 hover:bg-slate-50")}`}>
                    <input type="checkbox" checked={checked}
                      onChange={(e) => toggleUnit(u, e.target.checked)}
                      className="w-4 h-4" />
                    <span className="text-lg">{isLot ? "💣" : "📦"}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">
                        {u.itemName}
                        {isLot && (
                          <span className="mr-1 text-[10px] bg-orange-100 text-orange-800 rounded px-1.5 py-0.5">
                            אצווה {partial ? `· מזכה ${partial}/${u.lotQuantity}` : `× ${u.lotQuantity}`}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 font-mono">{isLot ? `לוט: ${u.serial}` : `SN: ${u.serial}`} · {u.statusName}{u.isWear && " 🟡"}{u.isLoss && " 🔴"}</div>
                    </div>
                    {checked && isLot && (
                      <button type="button" onClick={(e) => { e.preventDefault(); setLotPicker({ unit: u, qty: partial ?? (u.lotQuantity ?? 1) }); }}
                        className="text-xs text-orange-700 hover:underline">✎ ערוך כמות</button>
                    )}
                  </label>
                );
              })}
              </>}
            </>
          )}
        </div>

        {/* סטטוס חדש בהחזרה + אישור */}
        {soldierId && (selectedUnits.size > 0 || Array.from(qtyReturn.values()).some((n) => n > 0)) && (
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

        {/* דיאלוג אצווה לזיכוי חלקי */}
        {lotPicker && (
          <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-10 p-3" onClick={() => setLotPicker(null)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="bg-gradient-to-r from-orange-500 to-orange-700 text-white p-4">
                <h3 className="font-bold text-lg">⚠️ זיכוי אצווה</h3>
                <p className="text-xs text-orange-100 mt-1">בחר כמה לזכות מהאצווה — היתרה תישאר אצל החייל</p>
              </div>
              <div className="p-5 space-y-3">
                <div className="bg-orange-50 border-2 border-orange-300 rounded-lg p-3 flex items-start gap-3">
                  <span className="text-3xl">💣</span>
                  <div className="flex-1">
                    <div className="font-bold text-lg">{lotPicker.unit.itemName}</div>
                    <div className="text-xs text-slate-600 mt-1">מס׳ לוט: <span className="font-mono font-bold">{lotPicker.unit.serial}</span></div>
                    <div className="text-xs text-slate-600">חתום על: <b>{lotPicker.unit.soldierName}</b></div>
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
                      ℹ️ זיכוי חלקי: <b>{lotPicker.qty}</b> יחזרו למחסן, <b>{(lotPicker.unit.lotQuantity ?? 1) - lotPicker.qty}</b> יישארו אצל החייל.
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

        <div className="border-t border-slate-200 p-3 bg-white shrink-0">
          {error && <div className="text-sm text-rose-700 font-medium mb-2">⚠️ {error}</div>}
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => { setError(null); }} disabled={busy}
              className="flex-1 sm:flex-none rounded-lg border border-slate-300 px-4 py-2.5 text-sm disabled:opacity-50">ביטול</button>
            <button onClick={submit} disabled={busy || (selectedUnits.size === 0 && Array.from(qtyReturn.values()).every((n) => n < 1) && soldierOpKits.length === 0)}
              className="flex-1 sm:flex-none bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-lg px-5 py-2.5 text-sm font-bold flex items-center justify-center gap-2">
              {busy ? (
                <>
                  <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  מזכה...
                </>
              ) : `✓ זכה ${selectedUnits.size + Array.from(qtyReturn.values()).filter((n) => n > 0).length} פריטים${soldierOpKits.length > 0 ? ` + ${soldierOpKits.length} מארזים` : ""}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
