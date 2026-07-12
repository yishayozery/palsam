"use client";

import { useState, useEffect, useCallback } from "react";
import { saveArmoryTestVerification } from "./actions";

type Result = { nameMatch: boolean; matched: number; total: number; idFound: string | null; keywordMatch: boolean; text: string };

const norm = (s: string) => s.replace(/[״"'׳.,\-()]/g, "").replace(/\s+/g, " ").trim();

export default function ArmoryTestViewer({
  soldierId, image, soldierName, initialVerified,
}: {
  soldierId: string; image: string; soldierName: string; initialVerified: boolean | null;
}) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [verified, setVerified] = useState<boolean | null>(initialVerified);
  const [err, setErr] = useState<string | null>(null);

  const runOcr = useCallback(async () => {
    setErr(null); setRunning(true); setProgress(0); setResult(null);
    try {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("heb+eng", 1, {
        logger: (m: { status: string; progress: number }) => { if (m.status === "recognizing text") setProgress(Math.round(m.progress * 100)); },
      });
      const { data } = await worker.recognize(image);
      await worker.terminate();
      const text = data.text || "";
      // התאמה לפי שם — התעודה מציגה ת"ז, שאינה נשמרת במערכת, לכן מאמתים מול השם.
      const ocrNorm = norm(text);
      const nameWords = norm(soldierName).split(" ").filter((w) => w.length >= 2);
      const matched = nameWords.filter((w) => ocrNorm.includes(w)).length;
      const nameMatch = nameWords.length > 0 && matched >= Math.min(2, nameWords.length);
      const idFound = (text.match(/\b\d{7,9}\b/) || [])[0] ?? null; // ת"ז/מ"א שמופיע (לתצוגה)
      const keywordMatch = /בטיחות\s*בנשק|בוחן|מבחן|נשק/.test(text);
      const res: Result = { nameMatch, matched, total: nameWords.length, idFound, keywordMatch, text };
      setResult(res);
      const ok = nameMatch; // שם תואם = אימות
      setVerified(ok);
      await saveArmoryTestVerification(soldierId, ok, text);
    } catch (e) {
      setErr("שגיאה בזיהוי הטקסט מהתמונה. נסה שוב או אמת ידנית.");
      console.error("[ArmoryTestViewer] OCR failed:", e);
    } finally {
      setRunning(false);
    }
  }, [image, soldierName, soldierId]);

  // אימות אוטומטי בכניסה — רק אם טרם נבדק
  useEffect(() => {
    if (initialVerified === null) { const t = setTimeout(() => runOcr(), 0); return () => clearTimeout(t); }
  }, [initialVerified, runOcr]);

  return (
    <div dir="rtl">
      {/* תוצאת אימות */}
      <div className="mb-3">
        {running ? (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5 text-sm text-blue-800">
            🔍 מזהה טקסט מהתמונה… {progress > 0 && `${progress}%`}
          </div>
        ) : verified === true ? (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 text-sm text-emerald-800">
            ✅ <b>אומת</b> — השם &quot;{soldierName}&quot; זוהה בתמונה{result?.idFound ? ` · ת"ז/מ"א בתעודה: ${result.idFound}` : ""}{result && !result.keywordMatch ? " · לא זוהו מילות מפתח — ודא שזה מבחן ארמון" : ""}.
          </div>
        ) : verified === false ? (
          <div className="bg-amber-50 border border-amber-300 rounded-lg p-2.5 text-sm text-amber-900">
            🟡 <b>דרוש אימות ידני</b> — לא זוהתה התאמה מלאה של השם &quot;{soldierName}&quot; בתמונה{result ? ` (${result.matched}/${result.total} מילים)` : ""}. ודא ידנית שהתעודה שייכת לחייל{result?.idFound ? ` · ת"ז/מ"א בתעודה: ${result.idFound}` : ""}.
          </div>
        ) : (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm text-slate-600">טרם נבדק.</div>
        )}
        {err && <div className="text-rose-600 text-xs mt-1">{err}</div>}
        {!running && (
          <button onClick={() => runOcr()} className="mt-2 text-xs bg-slate-800 text-white rounded-lg px-3 py-1.5 font-medium">
            🔍 {verified === null ? "אמת אוטומטית (OCR)" : "בדוק שוב"}
          </button>
        )}
      </div>
      <div className="border border-slate-200 rounded-lg p-2 bg-slate-50 flex justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image} alt="צילום מבחן ארמון" className="max-w-full max-h-[65vh] object-contain rounded" />
      </div>
    </div>
  );
}
