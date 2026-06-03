"use client";

import { useState } from "react";
import { intakeStock } from "./actions";

type Item = { id: string; name: string; sku: string; trackingMethod: string };
type Status = { id: string; name: string };
type Row = { id: number; name: string; qty: number; matchId: string };

/** ניקוי טקסט עברי להשוואה (הסרת גרשיים/ניקוד/סימנים) */
function norm(s: string) {
  return s.replace(/["'`׳״.,:;()\-]/g, "").replace(/\s+/g, " ").trim();
}

/** התאמת שם שזוהה למק"ט קיים לפי חפיפת מילים */
function bestMatch(name: string, items: Item[]): string {
  const tokens = norm(name).split(" ").filter((t) => t.length >= 2);
  if (tokens.length === 0) return "";
  let best = "";
  let bestScore = 0;
  for (const it of items) {
    const itName = norm(it.name);
    let score = 0;
    for (const t of tokens) if (itName.includes(t)) score += t.length;
    if (score > bestScore) { bestScore = score; best = it.id; }
  }
  return bestScore >= 2 ? best : "";
}

export default function OcrIntake({
  items,
  statuses,
}: {
  items: Item[];
  statuses: Status[];
}) {
  const [open, setOpen] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [rawText, setRawText] = useState("");
  const [rows, setRows] = useState<Row[]>([]);

  const onFile = (f: File) => {
    const reader = new FileReader();
    reader.onload = () => setImage(reader.result as string);
    reader.readAsDataURL(f);
  };

  const runOcr = async () => {
    if (!image) return;
    setBusy(true); setProgress(0); setRows([]); setRawText("");
    try {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("heb+eng", 1, {
        logger: (m: { status: string; progress: number }) => {
          if (m.status === "recognizing text") setProgress(Math.round(m.progress * 100));
        },
      });
      const { data } = await worker.recognize(image);
      await worker.terminate();
      setRawText(data.text);

      // ניתוח שורות: כל שורה עם מספר (כמות) ושם
      const parsed: Row[] = [];
      let id = 0;
      for (const line of data.text.split("\n")) {
        const clean = line.trim();
        if (clean.length < 2) continue;
        const numMatch = clean.match(/\d+/);
        if (!numMatch) continue;
        const qty = parseInt(numMatch[0], 10);
        const name = clean.replace(/\d+/g, "").replace(/[|_]+/g, " ").trim();
        if (!name || !/[֐-׿]/.test(name)) continue; // חייב אות עברית
        parsed.push({ id: id++, name, qty: qty > 0 && qty < 100000 ? qty : 1, matchId: bestMatch(name, items) });
      }
      setRows(parsed);
    } catch {
      setRawText("שגיאה בזיהוי הטקסט. נסה תמונה ברורה יותר.");
    } finally {
      setBusy(false);
    }
  };

  const reset = () => { setImage(null); setRows([]); setRawText(""); setProgress(0); };

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="bg-white border border-slate-300 text-slate-700 rounded-lg px-4 py-2 text-sm hover:bg-slate-50">
        🪪 סריקת טופס חטיבה (OCR)
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <div>
                <h3 className="font-bold text-slate-800">קליטת מלאי מטופס חטיבה</h3>
                <p className="text-xs text-slate-500">צילום הטופס → זיהוי שם וכמות → קליטה</p>
              </div>
              <button onClick={() => { setOpen(false); reset(); }} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>

            <div className="p-5 space-y-4">
              {/* העלאת/צילום טופס */}
              <div className="flex items-center gap-3">
                <label className="text-sm bg-slate-800 text-white rounded-lg px-4 py-2 cursor-pointer hover:bg-slate-900">
                  {image ? "החלף תמונה" : "צלם / בחר טופס"}
                  <input type="file" accept="image/*" capture="environment" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
                </label>
                {image && !busy && (
                  <button onClick={runOcr}
                    className="bg-emerald-600 text-white rounded-lg px-4 py-2 text-sm hover:bg-emerald-700">
                    זהה טקסט
                  </button>
                )}
                {busy && (
                  <span className="text-sm text-slate-500">מזהה... {progress}%</span>
                )}
              </div>

              {image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={image} alt="טופס" className="max-h-48 rounded-lg border border-slate-200" />
              )}

              {/* תוצאות זיהוי */}
              {rows.length > 0 && (
                <div>
                  <h4 className="font-semibold text-sm text-slate-700 mb-2">
                    זוהו {rows.length} שורות — ודא ואשר קליטה:
                  </h4>
                  <div className="space-y-2">
                    {rows.map((r) => (
                      <form key={r.id} action={intakeStock}
                        className="flex items-end gap-2 bg-slate-50 rounded-lg p-2">
                        <div className="flex-1">
                          <div className="text-xs text-slate-400 mb-0.5">זוהה: &quot;{r.name}&quot;</div>
                          <select name="itemTypeId" defaultValue={r.matchId} required
                            className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
                            <option value="">בחר מק״ט...</option>
                            {items.map((i) => (
                              <option key={i.id} value={i.id}>{i.name} ({i.sku})</option>
                            ))}
                          </select>
                        </div>
                        <div className="w-20">
                          <div className="text-xs text-slate-400 mb-0.5">כמות</div>
                          <input name="quantity" type="number" min="1" defaultValue={r.qty}
                            className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
                        </div>
                        <select name="statusId" className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
                          {statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                        <input type="hidden" name="serials" value="" />
                        <input type="hidden" name="reason" value="קליטה מטופס חטיבה (OCR)" />
                        <button className="bg-emerald-600 text-white rounded-lg px-3 py-1.5 text-sm hover:bg-emerald-700 whitespace-nowrap">
                          קלוט
                        </button>
                      </form>
                    ))}
                  </div>
                  <p className="text-xs text-amber-600 bg-amber-50 rounded-lg p-2 mt-3">
                    זיהוי אוטומטי הוא כלי עזר — ודא נכונות שם וכמות לפני קליטה. מתאים לפריטים כמותיים;
                    פריטים סריאליים קלוט ידנית עם מספרי הסריאל.
                  </p>
                </div>
              )}

              {rawText && rows.length === 0 && !busy && (
                <div className="text-sm text-slate-500">
                  <div className="font-semibold mb-1">טקסט שזוהה:</div>
                  <pre className="bg-slate-50 rounded-lg p-3 text-xs whitespace-pre-wrap max-h-40 overflow-y-auto">{rawText}</pre>
                  <p className="mt-2">לא זוהו שורות עם כמות. נסה תמונה ברורה/ישרה יותר.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
