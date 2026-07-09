"use client";

import { useState, useMemo, useRef } from "react";
import { submitCount } from "../actions";
import { Card } from "@/components/ui";

type Line = {
  id: string; item: string; holder: string; holderId?: string | null;
  serial: string | null;
  serialUnitId?: string | null;
  signedSoldier?: string | null;
  soldierId?: string | null;
  physicalLocation?: string | null;
  equipmentLocation?: string | null;
  shelfLabel?: string | null;
  expiryDate?: string | null;
  lotQuantity?: number | null;
  expected: number; isSerial: boolean;
};

export default function CountExecutor({
  sessionId,
  lines,
  isBlind = false,
  signerMap = {},
}: {
  sessionId: string;
  lines: Line[];
  isBlind?: boolean;
  signerMap?: Record<string, string>;
}) {
  const groups = useMemo(() => lines.reduce<Record<string, Line[]>>((acc, l) => {
    (acc[l.holder] ||= []).push(l);
    return acc;
  }, {}), [lines]);

  const [counts, setCounts] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const l of lines) init[l.id] = isBlind ? "" : String(l.expected);
    return init;
  });
  const [serials, setSerials] = useState<Record<string, string>>({});
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [recountIds, setRecountIds] = useState<Set<string>>(new Set());
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});
  // 🔍 סריקה/חיפוש סריאלי — פתרון לספירת מאות נשקים בלי הקלדה ידנית פר-שורה
  const [scanInput, setScanInput] = useState("");
  const [scanMsg, setScanMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [filter, setFilter] = useState("");
  const dig = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

  // סריקה: מתאים את הסריאלי לשורה, מסמן "נמצא" אוטומטית
  function doScan() {
    const q = scanInput.trim();
    if (!q) return;
    const qd = dig(q);
    const isMarked = (l: Line) => { const v = counts[l.id]; return v === "1" || v === String(l.expected); };
    const match = lines.find((l) => l.isSerial && l.serial && dig(l.serial) === qd && !isMarked(l));
    if (match) {
      setCounts((c) => ({ ...c, [match.id]: String(match.expected || 1) }));
      setSerials((s) => ({ ...s, [match.id]: q }));
      setScanMsg({ ok: true, text: `✓ נמצא: ${match.item}` });
    } else {
      const already = lines.find((l) => l.serial && dig(l.serial) === qd);
      setScanMsg({ ok: false, text: already ? `כבר סומן: ${q}` : `⚠️ ${q} — לא ברשימת המחסן` });
    }
    setScanInput("");
  }

  const stats = useMemo(() => {
    let match = 0, gap = 0, filled = 0;
    for (const l of lines) {
      const v = counts[l.id];
      const n = parseInt(v ?? "", 10);
      if (isNaN(n) || v === "") continue;
      filled++;
      if (!isBlind) {
        if (n === l.expected) match++; else gap++;
      }
    }
    return { match, gap, total: lines.length, filled };
  }, [counts, lines, isBlind]);

  const updateCount = (id: string, value: string) => {
    setCounts((c) => ({ ...c, [id]: value }));
    const line = lines.find((l) => l.id === id);
    if (line && parseInt(value, 10) === line.expected) {
      setRecountIds((s) => { const n = new Set(s); n.delete(id); return n; });
    }
  };

  const handlePhoto = (lineId: string, file: File) => {
    const reader = new FileReader();
    reader.onload = () => setPhotos((p) => ({ ...p, [lineId]: reader.result as string }));
    reader.readAsDataURL(file);
  };

  return (
    <form action={submitCount} className="space-y-4 pb-24">
      <input type="hidden" name="sessionId" value={sessionId} />

      {/* כרטיסי סיכום */}
      {isBlind ? (
        <div className="grid grid-cols-2 gap-3">
          <Card className="p-3 text-center">
            <div className="text-xs text-slate-500">סה״כ פריטים</div>
            <div className="text-2xl font-bold text-slate-800 mt-1">{stats.total}</div>
          </Card>
          <Card className="p-3 text-center">
            <div className="text-xs text-slate-500">מולאו</div>
            <div className="text-2xl font-bold text-indigo-600 mt-1">{stats.filled}</div>
          </Card>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          <Card className="p-3 text-center">
            <div className="text-xs text-slate-500">סה״כ פריטים</div>
            <div className="text-2xl font-bold text-slate-800 mt-1">{stats.total}</div>
          </Card>
          <Card className="p-3 text-center">
            <div className="text-xs text-slate-500">תואמים</div>
            <div className="text-2xl font-bold text-emerald-600 mt-1">{stats.match}</div>
          </Card>
          <Card className="p-3 text-center">
            <div className="text-xs text-slate-500">פערים</div>
            <div className="text-2xl font-bold text-rose-600 mt-1">{stats.gap}</div>
          </Card>
        </div>
      )}

      {isBlind && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-sm text-indigo-800">
          🔍 <b>ספירה עיוורת</b> — סרוק/הקלד את הסריאלי של כל פריט; הוא יסומן אוטומטית. הכמויות הצפויות מוסתרות.
        </div>
      )}

      {/* 🔫 סורק סריאלי — הקלד/סרוק מספר סריאלי ולחץ Enter, הפריט יסומן "נמצא" */}
      {lines.some((l) => l.isSerial) && (
        <Card className="p-3 sticky top-2 z-20">
          <div className="flex items-center gap-2">
            <input value={scanInput} onChange={(e) => setScanInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); doScan(); } }}
              inputMode="numeric" autoFocus placeholder="🔫 סרוק / הקלד מס׳ סריאלי → Enter"
              className="flex-1 rounded-lg border-2 border-indigo-300 px-3 py-2 text-sm font-mono" />
            <button type="button" onClick={doScan} className="bg-indigo-600 text-white rounded-lg px-4 py-2 text-sm font-bold">סמן</button>
          </div>
          {scanMsg && <div className={`text-xs mt-1.5 font-medium ${scanMsg.ok ? "text-emerald-600" : "text-amber-600"}`}>{scanMsg.text}</div>}
          <div className="mt-2">
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="חיפוש בטבלה (שם / סריאלי)…"
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs" />
          </div>
        </Card>
      )}

      {Object.entries(groups).map(([holder, allItems]) => {
        const fq = filter.trim().toLowerCase();
        const fqd = dig(filter);
        const items = fq
          ? allItems.filter((l) => l.item.toLowerCase().includes(fq) || (l.serial ? dig(l.serial).includes(fqd) : false) || (l.signedSoldier ?? "").toLowerCase().includes(fq))
          : allItems;
        if (items.length === 0) return null;
        return (
        <Card key={holder} className="p-4">
          <h3 className="font-bold text-slate-700 mb-3 flex items-center justify-between flex-wrap gap-2">
            <span className="flex items-center gap-2">
              <span>📍 {holder}</span>
              {items[0]?.holderId && signerMap[items[0].holderId] && (
                <span className="bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded-full font-normal">חתם: {signerMap[items[0].holderId!]}</span>
              )}
            </span>
            <span className="text-xs text-slate-400 font-normal">{items.length} פריטים</span>
          </h3>
          <div className="space-y-1.5">
            {items.map((l) => {
              const value = counts[l.id] ?? "";
              const counted = parseInt(value, 10);
              const isGap = !isBlind && !isNaN(counted) && counted !== l.expected;
              const diff = counted - l.expected;
              const recount = recountIds.has(l.id);

              return (
                <div key={l.id} className={`rounded-lg border p-2.5 ${isGap ? "border-rose-300 bg-rose-50/40" : "border-slate-200 bg-white"}`}>
                  <div className="flex items-center gap-3 text-sm">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{l.item}</div>
                      {!isBlind && l.serial && <div className="font-mono text-xs text-slate-400 truncate">SN: {l.serial}</div>}
                      {l.isSerial && !isBlind && (
                        <div className="text-[11px] text-slate-500 flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                          {l.signedSoldier && <span className="text-blue-600">🪖 {l.signedSoldier}</span>}
                          {(l.equipmentLocation || l.physicalLocation) && (
                            <span className="text-emerald-700">📍 {l.equipmentLocation || l.physicalLocation}</span>
                          )}
                          {l.shelfLabel && <span className="text-violet-600">🗄️ {l.shelfLabel}</span>}
                          {l.expiryDate && (
                            <span className={new Date(l.expiryDate) < new Date() ? "text-rose-600 font-medium" : "text-amber-600"}>
                              📅 {new Date(l.expiryDate).toLocaleDateString("he-IL")}
                            </span>
                          )}
                          {l.lotQuantity && l.lotQuantity > 1 && <span className="text-slate-500">📦 כמות אצווה: {l.lotQuantity}</span>}
                        </div>
                      )}
                    </div>
                    {!isBlind && <div className="text-xs text-slate-500 whitespace-nowrap">צפוי: <b>{l.expected}</b></div>}

                    {/* === Blind mode inputs === */}
                    {isBlind ? (
                      <div className="flex flex-col gap-1 items-end">
                        {l.isSerial ? (
                          <>
                            <input type="text" placeholder="מס׳ סריאלי / אצווה"
                              value={serials[l.id] ?? ""}
                              onChange={(e) => setSerials((s) => ({ ...s, [l.id]: e.target.value }))}
                              className="w-36 rounded-lg border border-slate-300 px-2 py-1 text-xs font-mono" />
                            <input type="hidden" name={`enteredSerial:${l.id}`} value={serials[l.id] ?? ""} />
                            {l.lotQuantity && l.lotQuantity > 1 && (
                              <input name={`count:${l.id}`} type="number" min="0" placeholder="כמות"
                                value={value} onChange={(e) => updateCount(l.id, e.target.value)}
                                className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-xs" />
                            )}
                            {(!l.lotQuantity || l.lotQuantity <= 1) && (
                              <>
                                <select name={`count:${l.id}`} value={value}
                                  onChange={(e) => updateCount(l.id, e.target.value)}
                                  className="w-28 rounded-lg border border-slate-300 px-2 py-1 text-sm">
                                  <option value="">—</option>
                                  <option value="1">נמצא</option>
                                  <option value="0">לא נמצא</option>
                                </select>
                              </>
                            )}
                          </>
                        ) : (
                          <input name={`count:${l.id}`} type="number" min="0" placeholder="כמות"
                            value={value} onChange={(e) => updateCount(l.id, e.target.value)}
                            className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-sm" />
                        )}
                      </div>
                    ) : (
                      /* === Normal mode inputs === */
                      l.isSerial ? (
                        <div className="flex flex-col gap-1 items-end">
                          <select name={`count:${l.id}`} value={value}
                            onChange={(e) => updateCount(l.id, e.target.value)}
                            className={`w-28 rounded-lg border px-2 py-1 text-sm ${isGap ? "border-rose-400 bg-white" : "border-slate-300"}`}>
                            <option value={String(l.expected)}>✓ נמצא</option>
                            <option value="0">✗ חסר</option>
                          </select>
                          {l.serial && (
                            <input name={`sn:${l.id}`} type="text" placeholder="הקלד מס׳ סריאלי..."
                              className="w-28 rounded-lg border border-slate-300 px-2 py-1 text-xs font-mono" />
                          )}
                        </div>
                      ) : (
                        <input name={`count:${l.id}`} type="number" min="0" value={value}
                          onChange={(e) => updateCount(l.id, e.target.value)}
                          className={`w-24 rounded-lg border px-2 py-1 text-sm ${isGap ? "border-rose-400 bg-white" : "border-slate-300"}`} />
                      )
                    )}
                  </div>

                  {/* Photo capture */}
                  {isBlind && (
                    <div className="mt-2 flex items-center gap-2">
                      <input type="file" accept="image/*" capture="environment"
                        ref={(el) => { fileRefs.current[l.id] = el; }}
                        onChange={(e) => { if (e.target.files?.[0]) handlePhoto(l.id, e.target.files[0]); }}
                        className="hidden" />
                      <input type="hidden" name={`photo:${l.id}`} value={photos[l.id] ?? ""} />
                      <button type="button" onClick={() => fileRefs.current[l.id]?.click()}
                        className={`text-xs rounded-lg border px-2 py-1 ${photos[l.id] ? "bg-emerald-50 border-emerald-300 text-emerald-700" : "border-slate-300 text-slate-500 hover:bg-slate-50"}`}>
                        {photos[l.id] ? "📸 צולם ✓" : "📷 צלם"}
                      </button>
                      {photos[l.id] && (
                        <button type="button" onClick={() => setPhotos((p) => { const n = { ...p }; delete n[l.id]; return n; })}
                          className="text-[10px] text-rose-500">✕</button>
                      )}
                    </div>
                  )}

                  {isGap && (
                    <div className="mt-2 flex items-center gap-3 text-xs flex-wrap">
                      <span className="text-rose-700 font-medium">
                        ⚠️ פער: {diff > 0 ? `עודף ${diff}` : `חוסר ${Math.abs(diff)}`}
                      </span>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox" checked={recount}
                          onChange={(e) => setRecountIds((s) => {
                            const n = new Set(s);
                            if (e.target.checked) n.add(l.id); else n.delete(l.id);
                            return n;
                          })}
                          name={`recount:${l.id}`}
                          className="w-3.5 h-3.5" />
                        <span className={recount ? "text-amber-700 font-medium" : "text-slate-600"}>
                          ✓ ספירה חוזרת בוצעה — הפער אמיתי
                        </span>
                      </label>
                    </div>
                  )}

                  {/* עריכת מיקום פיזי — רק לסריאלי, לא לחתום על חייל */}
                  {!isBlind && l.isSerial && l.serialUnitId && !l.signedSoldier && (
                    <div className="mt-2 flex items-center gap-2 text-xs">
                      <span className="text-slate-500">📍 מיקום:</span>
                      <input type="text" name={`location:${l.serialUnitId}`}
                        defaultValue={l.physicalLocation ?? ""}
                        placeholder="ארון 3, מדף ב'..."
                        className="flex-1 rounded border border-slate-300 px-2 py-1 text-xs" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
        );
      })}

      {lines.length === 0 && (
        <Card className="p-5"><p className="text-sm text-slate-400 text-center">אין פריטים לספירה בהיקף זה.</p></Card>
      )}

      {/* Sticky footer */}
      <div className="fixed bottom-3 left-3 right-3 md:right-64 bg-white border-2 border-slate-300 rounded-xl shadow-lg p-3 flex items-center justify-between flex-wrap gap-3 z-30">
        <div className="text-sm">
          {isBlind ? (
            <span className="text-indigo-700 font-medium">
              🔍 {stats.filled}/{stats.total} מולאו — פערים יחושבו אחרי ההגשה
            </span>
          ) : stats.gap > 0 ? (
            <span className="text-rose-700 font-medium">
              ⚠️ {stats.gap} פערים יירשמו אוטומטית במסך &quot;פערים&quot;
            </span>
          ) : (
            <span className="text-emerald-700 font-medium">✓ אין פערים בספירה</span>
          )}
        </div>
        <div className="flex gap-2">
          <a href="/counts" className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50">חזרה</a>
          <button className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-5 py-2 text-sm font-bold">
            ✓ סיים ושמור ספירה
          </button>
        </div>
      </div>
    </form>
  );
}
