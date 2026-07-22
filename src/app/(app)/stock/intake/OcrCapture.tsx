"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui";

/**
 * 📷 חילוץ ספרות מתמונת שובר — Tesseract.js, ריצה **מקומית בדפדפן**.
 *
 * המסמך לעולם לא עוזב את המכשיר: אין העלאה לשרת, אין CDN. כל נכסי
 * Tesseract מוגשים מ-'self' (ראה scripts/setup-tesseract.mjs). התוצאה
 * ממלאת את תיבת הטקסט, ומשם ה-checksum בטיוטה תופס כל ספרה שנקראה שגוי.
 *
 * eng בלבד — אנחנו צריכים ספרות (מק"ט + כמויות). התיאור מגיע מהקטלוג
 * לפי המק"ט, לא מה-OCR, אז אין צורך במודל עברי הכבד יותר.
 */
export default function OcrCapture({ onText }: { onText: (text: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setBusy(true);
    setProgress("טוען מנוע…");
    setPreview(URL.createObjectURL(file));
    try {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("eng", 1, {
        workerPath: "/tesseract/worker.min.js",
        corePath: "/tesseract",
        langPath: "/tesseract/tessdata",
        gzip: false, // ה-traineddata אצלנו אינו דחוס
        // ⚠️ ברירת המחדל עוטפת את ה-worker ב-blob: URL, וה-CSP (default-src 'self')
        //    חוסם worker מ-blob. טעינה ישירה מ-'self' עוברת.
        workerBlobURL: false,
        logger: (m: { status: string; progress: number }) => {
          if (m.status === "recognizing text") setProgress(`מזהה… ${Math.round(m.progress * 100)}%`);
          else if (m.status) setProgress(m.status === "loading tesseract core" ? "טוען מנוע…" : "מכין…");
        },
      });
      // ספרות, מקף ורווח בלבד — משפר דיוק על טבלת מספרים
      await worker.setParameters({ tessedit_char_whitelist: "0123456789-. " });
      const { data } = await worker.recognize(file);
      await worker.terminate();

      const text = (data.text || "").trim();
      if (!text) { setError("לא זוהה טקסט. נסו תמונה חדה יותר, מיושרת, עם תאורה טובה."); return; }
      onText(text);
      setProgress(`זוהו ${text.split(/\n/).filter(Boolean).length} שורות — בדקו והשלימו למטה`);
    } catch (e) {
      setError(e instanceof Error ? `שגיאת OCR: ${e.message}` : "שגיאת OCR");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-dashed border-slate-300 p-3 bg-slate-50">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
      />
      <div className="flex items-center gap-3 flex-wrap">
        <Button type="button" onClick={() => inputRef.current?.click()} disabled={busy}>
          📷 צלם / העלה שובר
        </Button>
        <span className="text-xs text-slate-500">
          {busy ? progress : "OCR מקומי — התמונה נשארת במכשיר, לא עולה לשרת"}
        </span>
      </div>
      {preview && (
        // eslint-disable-next-line @next/next/no-img-element -- blob: מקומי, next/image לא מתאים
        <img src={preview} alt="תצוגה מקדימה" className="mt-2 max-h-40 rounded border" />
      )}
      {error && <div className="text-sm text-rose-600 mt-2">{error}</div>}
    </div>
  );
}
