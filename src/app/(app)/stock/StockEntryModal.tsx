"use client";

import { useState, useMemo } from "react";
import { TRACKING_METHOD } from "@/lib/labels";
import { declareQty, declareSerials, declareLot, importSerials, importLots } from "./actions";

type Item = {
  id: string; name: string; sku: string | null;
  trackingMethod: "QUANTITY" | "SERIAL" | "LOT" | "KIT";
  unit: string;
  association: string;
};
type Status = { id: string; name: string; isDefault: boolean };

export default function StockEntryModal({ items, statuses, currentUserName, requirePersonalId }: { items: Item[]; statuses: Status[]; currentUserName: string; requirePersonalId: boolean }) {
  const [open, setOpen] = useState(false);
  const [itemQuery, setItemQuery] = useState("");
  const [itemId, setItemId] = useState("");
  const [qty, setQty] = useState<number>(1);
  const [lotNumber, setLotNumber] = useState("");
  const [serials, setSerials] = useState<string[]>([]);
  const defaultStatus = statuses.find((s) => s.isDefault)?.id ?? statuses[0]?.id ?? "";
  const [statusId, setStatusId] = useState(defaultStatus);
  const [externalUnit, setExternalUnit] = useState("חטיבה");
  const [externalContact, setExternalContact] = useState("");
  const [recipientPersonalId, setRecipientPersonalId] = useState("");

  const selected = items.find((i) => i.id === itemId);
  const filteredItems = useMemo(() => {
    if (!itemQuery.trim()) return items.slice(0, 50);
    const q = itemQuery.toLowerCase();
    return items.filter((i) => i.name.toLowerCase().includes(q) || (i.sku || "").toLowerCase().includes(q)).slice(0, 50);
  }, [items, itemQuery]);

  // עדכון מספר השורות לסריאל לפי הכמות
  const adjustSerials = (n: number) => {
    setQty(n);
    if (selected?.trackingMethod === "SERIAL") {
      setSerials((prev) => {
        const next = [...prev];
        if (n > prev.length) for (let i = prev.length; i < n; i++) next.push("");
        else next.length = n;
        return next;
      });
    }
  };

  const reset = () => {
    setItemId(""); setItemQuery(""); setQty(1); setLotNumber("");
    setSerials([]); setStatusId(defaultStatus);
  };

  return (
    <>
      <button onClick={() => { reset(); setOpen(true); }}
        className="bg-slate-800 text-white rounded-lg px-5 py-2.5 text-sm font-medium hover:bg-slate-900 shadow-sm flex items-center gap-2">
        <span className="text-lg leading-none">+</span> הוספת מלאי
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">
            {/* כותרת */}
            <div className="bg-gradient-to-r from-slate-800 to-slate-900 text-white p-5 rounded-t-2xl flex items-center justify-between">
              <div>
                <h3 className="font-bold text-lg">הוספת מלאי לגדוד</h3>
                <p className="text-xs text-slate-300 mt-0.5">בחר פריט והזן כמות / מספרים סריאליים / אצווה</p>
              </div>
              <button onClick={() => setOpen(false)} className="text-slate-300 hover:text-white text-2xl leading-none">✕</button>
            </div>

            <div className="p-6 space-y-5">
              {/* בחירת פריט */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">פריט / מק״ט</label>
                {!selected ? (
                  <>
                    <input
                      autoFocus value={itemQuery} onChange={(e) => setItemQuery(e.target.value)}
                      placeholder="הקלד שם פריט או מק״ט..."
                      className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                    />
                    <div className="mt-2 max-h-48 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100 bg-slate-50">
                      {filteredItems.length === 0 ? (
                        <p className="text-sm text-slate-400 p-3 text-center">לא נמצאו פריטים</p>
                      ) : filteredItems.map((i) => (
                        <button key={i.id} type="button" onClick={() => setItemId(i.id)}
                          className="w-full text-right px-4 py-2.5 hover:bg-blue-50 flex items-center justify-between text-sm">
                          <span className="flex items-center gap-2">
                            <span className="font-medium">{i.name}</span>
                            {i.sku && <span className="font-mono text-xs text-slate-400">{i.sku}</span>}
                          </span>
                          <span className="text-xs bg-slate-200 text-slate-700 rounded-full px-2 py-0.5">
                            {TRACKING_METHOD[i.trackingMethod]}
                          </span>
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">📦</span>
                      <div>
                        <div className="font-bold text-slate-800">{selected.name}</div>
                        <div className="text-xs text-slate-500 flex items-center gap-2">
                          {selected.sku && <span className="font-mono">{selected.sku}</span>}
                          <span className="bg-white border border-slate-300 rounded-full px-2 py-0.5">
                            {TRACKING_METHOD[selected.trackingMethod]}
                          </span>
                          <span>· יחידה: {selected.unit}</span>
                        </div>
                      </div>
                    </div>
                    <button type="button" onClick={() => { setItemId(""); setItemQuery(""); }}
                      className="text-xs text-rose-500 hover:text-rose-700">החלף פריט</button>
                  </div>
                )}
              </div>

              {/* פרטי הזנה */}
              {selected && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">סטטוס תקינות</label>
                      <select value={statusId} onChange={(e) => setStatusId(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400">
                        {statuses.map((s) => <option key={s.id} value={s.id}>{s.name}{s.isDefault ? " (ברירת מחדל)" : ""}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">כמות</label>
                      <input
                        type="number" min={selected.trackingMethod === "SERIAL" ? 1 : 0} value={qty}
                        onChange={(e) => adjustSerials(parseInt(e.target.value) || 0)}
                        className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                      />
                    </div>
                  </div>

                  {selected.trackingMethod === "LOT" && (
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">מספר אצווה</label>
                      <input value={lotNumber} onChange={(e) => setLotNumber(e.target.value)} placeholder="GREN-2026-A"
                        className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-slate-400" />
                      <p className="text-xs text-slate-400 mt-1">ניתן להוסיף כמה אצוות לאותו פריט. כל אצווה = שורה חדשה.</p>
                    </div>
                  )}

                  {selected.trackingMethod === "SERIAL" && qty > 0 && (() => {
                    const trimmed = serials.map((s) => s.trim());
                    const filledCount = trimmed.filter(Boolean).length;
                    const seen = new Map<string, number>();
                    trimmed.forEach((s, i) => { if (s) seen.set(s, (seen.get(s) ?? 0) + 1); });
                    const dupIndices = trimmed.map((s, i) => s && (seen.get(s)! > 1));
                    const hasDup = dupIndices.some(Boolean);
                    return (
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                        מספרים סריאליים — חובה ({filledCount}/{qty} מולאו)
                        {hasDup && <span className="text-rose-600 text-xs mr-2">⚠️ יש כפילויות</span>}
                      </label>
                      <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-lg p-2 space-y-1.5 bg-slate-50">
                        {serials.map((sn, i) => {
                          const isDup = dupIndices[i];
                          return (
                            <div key={i} className="flex items-center gap-2">
                              <span className="text-xs text-slate-400 font-mono w-8 text-center">#{i + 1}</span>
                              <input value={sn} required
                                onChange={(e) => setSerials((prev) => prev.map((v, idx) => idx === i ? e.target.value : v))}
                                placeholder={`SN-${String(i + 1).padStart(3, "0")}`}
                                className={`flex-1 rounded-lg border px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 ${isDup ? "border-rose-400 bg-rose-50 focus:ring-rose-400" : sn.trim() ? "border-emerald-300 bg-emerald-50 focus:ring-emerald-400" : "border-slate-300 focus:ring-slate-400"}`} />
                              {isDup && <span className="text-xs text-rose-600">כפילות</span>}
                              {sn.trim() && !isDup && <span className="text-xs text-emerald-600">✓</span>}
                            </div>
                          );
                        })}
                      </div>
                      <p className="text-xs text-slate-400 mt-1">כל שורה = יחידה. כל מספר סריאלי חייב להיות ייחודי.</p>
                    </div>
                    );
                  })()}

                  {/* מנפק / מקבל */}
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                    <h4 className="text-sm font-semibold text-amber-900">פרטי ההעברה (מי מנפק / מי מקבל)</h4>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs text-slate-600 mb-1">יחידה מנפקת</label>
                        <input value={externalUnit} onChange={(e) => setExternalUnit(e.target.value)} placeholder="חטיבה"
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-600 mb-1">שם המנפק (אדם)</label>
                        <input value={externalContact} onChange={(e) => setExternalContact(e.target.value)} placeholder="שם הקצין החטיבתי"
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                      </div>
                    </div>
                    <p className="text-xs text-slate-500">המקבל: <span className="font-medium text-slate-700">{currentUserName}</span> (אתה)</p>
                    {requirePersonalId && (
                      <div className="bg-white border border-amber-300 rounded-lg p-2 mt-2">
                        <label className="block text-xs font-bold text-amber-900 mb-1">
                          🔒 מספר אישי של המנפק (חובה לפי הגדרות הגדוד)
                        </label>
                        <input
                          value={recipientPersonalId}
                          onChange={(e) => setRecipientPersonalId(e.target.value.replace(/\D/g, ""))}
                          placeholder="לדוגמה: 1234567"
                          inputMode="numeric"
                          pattern="\d*"
                          required
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
                        />
                      </div>
                    )}
                  </div>

                  {/* כפתורי שליחה */}
                  <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-slate-200">
                    <button type="button" onClick={() => setOpen(false)}
                      className="rounded-lg border border-slate-300 px-5 py-2 text-sm hover:bg-slate-50">ביטול</button>
                    {selected.trackingMethod === "QUANTITY" && (
                      <form action={async (fd) => { await declareQty(fd); reset(); setOpen(false); }}>
                        <input type="hidden" name="itemTypeId" value={itemId} />
                        <input type="hidden" name="quantity" value={qty} />
                        <input type="hidden" name="statusId" value={statusId} />
                        <input type="hidden" name="externalUnit" value={externalUnit} />
                        <input type="hidden" name="externalContact" value={externalContact} />
                        <input type="hidden" name="recipientPersonalId" value={recipientPersonalId} />
                        <button disabled={qty < 1} className="bg-emerald-600 text-white rounded-lg px-5 py-2 text-sm hover:bg-emerald-700 disabled:opacity-50">
                          הוסף +{qty}
                        </button>
                      </form>
                    )}
                    {selected.trackingMethod === "LOT" && (
                      <form action={async (fd) => { await declareLot(fd); reset(); setOpen(false); }}>
                        <input type="hidden" name="itemTypeId" value={itemId} />
                        <input type="hidden" name="lotNumber" value={lotNumber} />
                        <input type="hidden" name="quantity" value={qty} />
                        <input type="hidden" name="statusId" value={statusId} />
                        <input type="hidden" name="externalUnit" value={externalUnit} />
                        <input type="hidden" name="externalContact" value={externalContact} />
                        <input type="hidden" name="recipientPersonalId" value={recipientPersonalId} />
                        <button disabled={!lotNumber || qty < 1}
                          className="bg-emerald-600 text-white rounded-lg px-5 py-2 text-sm hover:bg-emerald-700 disabled:opacity-50">
                          הוסף אצווה ({qty})
                        </button>
                      </form>
                    )}
                    {selected.trackingMethod === "SERIAL" && (() => {
                      const trimmed = serials.map((s) => s.trim());
                      const filled = trimmed.filter(Boolean);
                      const allFilled = filled.length === qty && qty > 0;
                      const noDup = new Set(filled).size === filled.length;
                      const valid = allFilled && noDup;
                      return (
                      <form action={async (fd) => {
                          if (!valid) return;
                          await declareSerials(fd); reset(); setOpen(false);
                        }}>
                        <input type="hidden" name="itemTypeId" value={itemId} />
                        <input type="hidden" name="serials" value={trimmed.join("\n")} />
                        <input type="hidden" name="statusId" value={statusId} />
                        <input type="hidden" name="externalUnit" value={externalUnit} />
                        <input type="hidden" name="externalContact" value={externalContact} />
                        <input type="hidden" name="recipientPersonalId" value={recipientPersonalId} />
                        <button disabled={!valid}
                          title={!allFilled ? "מלא את כל מספרי הסריאל" : !noDup ? "יש מספרים כפולים" : ""}
                          className="bg-emerald-600 text-white rounded-lg px-5 py-2 text-sm hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed">
                          הוסף {qty} יחידות
                        </button>
                      </form>
                      );
                    })()}
                  </div>

                  {/* טעינה מקובץ */}
                  {(selected.trackingMethod === "SERIAL" || selected.trackingMethod === "LOT") && (
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mt-2">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-semibold text-sm text-slate-700">או — טעינה מקובץ אקסל</h4>
                        <a href={selected.trackingMethod === "SERIAL" ? "/stock/serials-template" : "/stock/lots-template"}
                          className="text-xs text-blue-600 hover:underline">⬇ תבנית לדוגמה</a>
                      </div>
                      <form action={async (fd) => {
                          if (selected.trackingMethod === "SERIAL") await importSerials(fd);
                          else await importLots(fd);
                          reset(); setOpen(false);
                        }}
                        className="flex items-center gap-2">
                        <input type="hidden" name="itemTypeId" value={itemId} />
                        <input type="hidden" name="statusId" value={statusId} />
                        <input type="hidden" name="externalUnit" value={externalUnit} />
                        <input type="hidden" name="externalContact" value={externalContact} />
                        <input type="hidden" name="recipientPersonalId" value={recipientPersonalId} />
                        <input type="file" name="file" accept=".xlsx,.xls" required
                          className="text-sm flex-1" />
                        <button className="bg-slate-700 text-white rounded-lg px-4 py-1.5 text-sm hover:bg-slate-800">
                          ⬆ טען
                        </button>
                      </form>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
