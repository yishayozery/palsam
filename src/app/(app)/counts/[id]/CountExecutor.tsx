"use client";

import { useState, useMemo } from "react";
import { submitCount } from "../actions";
import { Card } from "@/components/ui";

type Line = {
  id: string; item: string; holder: string; serial: string | null; expected: number; isSerial: boolean;
};

export default function CountExecutor({
  sessionId,
  lines,
}: {
  sessionId: string;
  lines: Line[];
}) {
  const groups = useMemo(() => lines.reduce<Record<string, Line[]>>((acc, l) => {
    (acc[l.holder] ||= []).push(l);
    return acc;
  }, {}), [lines]);

  const [counts, setCounts] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const l of lines) init[l.id] = String(l.expected);
    return init;
  });
  const [recountIds, setRecountIds] = useState<Set<string>>(new Set());

  const stats = useMemo(() => {
    let match = 0, gap = 0;
    for (const l of lines) {
      const v = counts[l.id];
      const n = parseInt(v ?? "", 10);
      if (isNaN(n)) continue;
      if (n === l.expected) match++; else gap++;
    }
    return { match, gap, total: lines.length };
  }, [counts, lines]);

  const updateCount = (id: string, value: string) => {
    setCounts((c) => ({ ...c, [id]: value }));
    const line = lines.find((l) => l.id === id);
    if (line && parseInt(value, 10) === line.expected) {
      setRecountIds((s) => { const n = new Set(s); n.delete(id); return n; });
    }
  };

  return (
    <form action={submitCount} className="space-y-4 pb-24">
      <input type="hidden" name="sessionId" value={sessionId} />

      {/* כרטיסי סיכום */}
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

      {Object.entries(groups).map(([holder, items]) => (
        <Card key={holder} className="p-4">
          <h3 className="font-bold text-slate-700 mb-3 flex items-center justify-between">
            <span>📍 {holder}</span>
            <span className="text-xs text-slate-400 font-normal">{items.length} פריטים</span>
          </h3>
          <div className="space-y-1.5">
            {items.map((l) => {
              const value = counts[l.id] ?? "";
              const counted = parseInt(value, 10);
              const isGap = !isNaN(counted) && counted !== l.expected;
              const diff = counted - l.expected;
              const recount = recountIds.has(l.id);

              return (
                <div key={l.id} className={`rounded-lg border p-2.5 ${isGap ? "border-rose-300 bg-rose-50/40" : "border-slate-200 bg-white"}`}>
                  <div className="flex items-center gap-3 text-sm">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{l.item}</div>
                      {l.serial && <div className="font-mono text-xs text-slate-400 truncate">SN: {l.serial}</div>}
                    </div>
                    <div className="text-xs text-slate-500 whitespace-nowrap">צפוי: <b>{l.expected}</b></div>
                    {l.isSerial ? (
                      <select name={`count:${l.id}`} value={value}
                        onChange={(e) => updateCount(l.id, e.target.value)}
                        className={`w-28 rounded-lg border px-2 py-1 text-sm ${isGap ? "border-rose-400 bg-white" : "border-slate-300"}`}>
                        <option value={String(l.expected)}>✓ נמצא</option>
                        <option value="0">✗ חסר</option>
                      </select>
                    ) : (
                      <input name={`count:${l.id}`} type="number" min="0" value={value}
                        onChange={(e) => updateCount(l.id, e.target.value)}
                        className={`w-24 rounded-lg border px-2 py-1 text-sm ${isGap ? "border-rose-400 bg-white" : "border-slate-300"}`} />
                    )}
                  </div>
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
                </div>
              );
            })}
          </div>
        </Card>
      ))}

      {lines.length === 0 && (
        <Card className="p-5"><p className="text-sm text-slate-400 text-center">אין פריטים לספירה בהיקף זה.</p></Card>
      )}

      {/* Sticky footer */}
      <div className="fixed bottom-3 left-3 right-3 md:right-64 bg-white border-2 border-slate-300 rounded-xl shadow-lg p-3 flex items-center justify-between flex-wrap gap-3 z-30">
        <div className="text-sm">
          {stats.gap > 0 ? (
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
