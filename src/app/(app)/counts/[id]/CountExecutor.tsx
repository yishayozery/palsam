"use client";

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
  // קיבוץ לפי מחזיק
  const groups = lines.reduce<Record<string, Line[]>>((acc, l) => {
    (acc[l.holder] ||= []).push(l);
    return acc;
  }, {});

  return (
    <form action={submitCount} className="space-y-5">
      <input type="hidden" name="sessionId" value={sessionId} />

      {Object.entries(groups).map(([holder, items]) => (
        <Card key={holder} className="p-5">
          <h3 className="font-bold text-slate-700 mb-3">{holder}</h3>
          <div className="space-y-1.5">
            {items.map((l) => (
              <div key={l.id} className="flex items-center gap-3 text-sm py-1">
                <span className="flex-1">
                  {l.item}
                  {l.serial && <span className="font-mono text-xs text-slate-400 mr-2">{l.serial}</span>}
                </span>
                <span className="text-xs text-slate-400">צפוי: {l.expected}</span>
                {l.isSerial ? (
                  <select name={`count:${l.id}`} defaultValue={String(l.expected)}
                    className="w-28 rounded-lg border border-slate-300 px-2 py-1 text-sm">
                    <option value={String(l.expected)}>נמצא ✓</option>
                    <option value="0">חסר ✗</option>
                  </select>
                ) : (
                  <input name={`count:${l.id}`} type="number" min="0" defaultValue={String(l.expected)}
                    className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-sm" />
                )}
              </div>
            ))}
          </div>
        </Card>
      ))}

      {lines.length === 0 && (
        <Card className="p-5"><p className="text-sm text-slate-400">אין פריטים לספירה בהיקף זה.</p></Card>
      )}

      <div className="flex justify-end">
        <button className="bg-emerald-600 text-white rounded-lg px-6 py-2.5 text-sm font-medium hover:bg-emerald-700">
          סיום ספירה וחישוב פערים
        </button>
      </div>
    </form>
  );
}
