"use client";

import type { FieldDef } from "@/lib/driverForms";

/** דחיסת תמונה ל-dataURL — משותף לצילום רישיון ולטפסים. */
export function fileImage(file: File, maxW = 900, q = 0.6): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = (e) => { const img = new Image(); img.onload = () => { const c = document.createElement("canvas"); const ratio = Math.min(maxW / img.width, 1); c.width = img.width * ratio; c.height = img.height * ratio; c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height); res(c.toDataURL("image/jpeg", q)); }; img.onerror = rej; img.src = e.target!.result as string; };
    r.onerror = rej; r.readAsDataURL(file);
  });
}

/** רכיב שדה בודד של טופס תיק נהג — משותף למסך קצין רכב ולעמוד הציבורי בבוט. */
export function FieldInput({ f, values, setVal, setGrid }: { f: FieldDef; values: Record<string, unknown>; setVal: (k: string, v: unknown) => void; setGrid: (k: string, row: string, col: string, v: string) => void }) {
  const v = values[f.key];
  const cls = "mt-1 w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm";
  const wrap = f.full || f.type === "grid" || f.type === "textarea" ? "sm:col-span-2" : "";

  if (f.type === "grid") {
    const g = (v as Record<string, Record<string, string>>) ?? {};
    return (
      <div className={wrap}>
        <div className="text-xs text-slate-600 mb-1">{f.label}</div>
        <div className="overflow-x-auto"><table className="min-w-full text-xs border border-slate-200">
          <tbody>
            {(f.rows ?? []).map((row) => (
              <tr key={row} className="border-b border-slate-100">
                <td className="px-2 py-1 font-medium text-slate-700 whitespace-nowrap">{row}</td>
                {(f.columns ?? []).map((col) => (
                  <td key={col.key} className="px-2 py-1">
                    <select value={g[row]?.[col.key] ?? ""} onChange={(e) => setGrid(f.key, row, col.key, e.target.value)} className="border border-slate-300 rounded px-1 py-1 text-xs">
                      <option value="">—</option>
                      {(col.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
    );
  }
  return (
    <label className={`text-xs text-slate-600 ${wrap}`}>
      {f.type !== "checkbox" && f.label}
      {(f.type === "text") && <input value={(v as string) ?? ""} onChange={(e) => setVal(f.key, e.target.value)} list={f.options ? `dl-${f.key}` : undefined} className={cls} />}
      {f.options && f.type === "text" && <datalist id={`dl-${f.key}`}>{f.options.map((o) => <option key={o} value={o} />)}</datalist>}
      {f.type === "date" && <input type="date" value={(v as string) ?? ""} onChange={(e) => setVal(f.key, e.target.value)} className={cls} />}
      {f.type === "textarea" && <textarea value={(v as string) ?? ""} onChange={(e) => setVal(f.key, e.target.value)} rows={2} className={cls} />}
      {(f.type === "select" || f.type === "passfail") && (
        <select value={(v as string) ?? ""} onChange={(e) => setVal(f.key, e.target.value)} className={cls}>
          <option value="">—</option>
          {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      )}
      {f.type === "checkbox" && (
        <span className="flex items-center gap-2 mt-1">
          <input type="checkbox" checked={!!v} onChange={(e) => setVal(f.key, e.target.checked)} className="w-4 h-4" />
          <span>{f.label}</span>
        </span>
      )}
    </label>
  );
}
