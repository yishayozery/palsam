"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { resolveBarcode, type ScanHit } from "@/app/(app)/scan-actions";
import { useEscClose } from "@/lib/useEscClose";

/**
 * 📷 סריקת ברקוד — רכיב אחד לכל המסכים, שלוש דרכי קלט:
 *
 *  1. מצלמת הטלפון — BarcodeDetector מובנה (אנדרואיד/כרום); ZXing כגיבוי (אייפון)
 *  2. סורק חומרה (USB/בלוטות') — מתנהג כמקלדת: מקליד את הקוד ולוחץ Enter
 *  3. הקלדה ידנית — כשאין מצלמה או שהברקוד מרוט
 *
 * הזיהוי (סיריאלי מול כללי) נעשה בשרת ב-resolveBarcode — הסורק לא בוחר מצב.
 */

type Detected = { rawValue: string };
type DetectorLike = { detect(src: CanvasImageSource): Promise<Detected[]> };

export default function BarcodeScanner({
  onHit, label = "📷 סרוק ברקוד", compact = false, autoClose = false,
}: {
  onHit: (hit: ScanHit) => void;
  label?: string;
  compact?: boolean;
  /** לסגור את הסורק אחרי סריקה מוצלחת. ברירת מחדל: להישאר פתוח לסריקה רצופה. */
  autoClose?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [manual, setManual] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [last, setLast] = useState<{ text: string; ok: boolean } | null>(null);
  const [camState, setCamState] = useState<"idle" | "starting" | "live" | "unavailable">("idle");
  const [scanned, setScanned] = useState(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const wedgeRef = useRef<HTMLInputElement | null>(null);
  const lastCodeRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });

  useEscClose(open, () => setOpen(false));

  const handleCode = useCallback(async (code: string) => {
    const clean = code.trim();
    if (!clean) return;
    // דה-באונס: סורק מצלמה יורה את אותו קוד עשרות פעמים בשנייה
    const now = Date.now();
    if (lastCodeRef.current.code === clean && now - lastCodeRef.current.at < 2500) return;
    lastCodeRef.current = { code: clean, at: now };

    setBusy(true); setErr(null);
    try {
      const hit = await resolveBarcode(clean);
      if (hit.kind === "NOT_FOUND") {
        setLast({ text: `לא נמצא: ${clean}`, ok: false });
        if (navigator.vibrate) navigator.vibrate([60, 40, 60]);
      } else {
        const name = hit.kind === "SERIAL" ? `${hit.itemName} · ${hit.serialNumber}` : hit.itemName;
        setLast({ text: name, ok: true });
        setScanned((n) => n + 1);
        if (navigator.vibrate) navigator.vibrate(40);
        onHit(hit);
        if (autoClose) setOpen(false);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שגיאה בזיהוי");
    } finally {
      setBusy(false);
      setManual("");
    }
  }, [onHit, autoClose]);

  // ── מצלמה ──
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    (async () => {
      setCamState("starting");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play().catch(() => {});
        setCamState("live");

        // מסלול א׳ — BarcodeDetector מובנה (אנדרואיד/כרום): ללא ספריה
        const W = window as unknown as { BarcodeDetector?: new (o?: unknown) => DetectorLike };
        if (W.BarcodeDetector) {
          const det = new W.BarcodeDetector({
            formats: ["code_128", "code_39", "ean_13", "ean_8", "upc_a", "upc_e", "itf", "codabar", "qr_code", "data_matrix"],
          });
          const tick = async () => {
            if (cancelled || !videoRef.current) return;
            try {
              const found = await det.detect(videoRef.current);
              if (found[0]?.rawValue) await handleCode(found[0].rawValue);
            } catch { /* פריים לא קריא — ממשיכים */ }
            if (!cancelled) setTimeout(tick, 250);
          };
          tick();
          stopRef.current = () => { cancelled = true; };
          return;
        }

        // מסלול ב׳ — ZXing (אייפון/ספארי). נטען רק כאן, כדי לא להכביד על שאר המערכת.
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        if (cancelled) return;
        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromVideoElement(video, (result) => {
          if (result) void handleCode(result.getText());
        });
        stopRef.current = () => { cancelled = true; controls.stop(); };
      } catch {
        if (!cancelled) setCamState("unavailable");
      }
    })();

    return () => {
      cancelled = true;
      stopRef.current?.();
      stopRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [open, handleCode]);

  // ── סורק חומרה: שדה נסתר שתמיד ממוקד, קולט הקלדה מהירה + Enter ──
  useEffect(() => {
    if (!open) return;
    const refocus = () => {
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
      wedgeRef.current?.focus();
    };
    refocus();
    const t = setInterval(refocus, 700);
    return () => clearInterval(t);
  }, [open]);

  return (
    <>
      <button type="button" onClick={() => { setOpen(true); setLast(null); setScanned(0); setErr(null); }}
        className={compact
          ? "bg-white border border-slate-300 rounded-lg px-2.5 py-2 text-xs hover:bg-slate-50 whitespace-nowrap"
          : "bg-white border border-indigo-300 text-indigo-700 rounded-lg px-3 py-2 text-xs md:text-sm font-medium hover:bg-indigo-50 whitespace-nowrap"}>
        {label}
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" dir="rtl">
          <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[92dvh] flex flex-col overflow-hidden">
            <div className="bg-gradient-to-r from-indigo-700 to-indigo-800 text-white p-4 flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-bold">📷 סריקת ברקוד</h3>
                <p className="text-xs text-indigo-200 mt-0.5">
                  {scanned > 0 ? `${scanned} פריטים נסרקו` : "כוון את המצלמה, או השתמש בסורק"}
                </p>
              </div>
              <button onClick={() => setOpen(false)} className="text-indigo-200 hover:text-white text-2xl">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {/* חלון המצלמה */}
              <div className="relative bg-slate-900 rounded-xl overflow-hidden" style={{ aspectRatio: "4 / 3" }}>
                <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
                {camState !== "live" && (
                  <div className="absolute inset-0 flex items-center justify-center text-center text-slate-300 text-sm p-4">
                    {camState === "starting" ? "מפעיל מצלמה…"
                      : camState === "unavailable" ? "אין גישה למצלמה — אפשר לסרוק עם סורק חומרה או להקליד ידנית"
                      : ""}
                  </div>
                )}
                {camState === "live" && (
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div className="w-4/5 h-1/3 border-2 border-white/70 rounded-lg" />
                  </div>
                )}
              </div>

              {/* תוצאה אחרונה */}
              {last && (
                <div className={`rounded-lg px-3 py-2 text-sm font-medium ${last.ok ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-rose-50 text-rose-800 border border-rose-200"}`}>
                  {last.ok ? "✅" : "⚠️"} {last.text}
                </div>
              )}
              {busy && <p className="text-xs text-slate-500 text-center">מזהה…</p>}
              {err && <p className="text-rose-600 text-sm text-center">{err}</p>}

              {/* סורק חומרה — נסתר, תמיד ממוקד */}
              <input ref={wedgeRef} className="sr-only" aria-hidden tabIndex={-1}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  const el = e.currentTarget;
                  void handleCode(el.value);
                  el.value = "";
                }} />

              {/* הקלדה ידנית */}
              <div>
                <label className="block text-[11px] text-slate-600 mb-1">הקלדה ידנית (מספר סריאלי או מק״ט)</label>
                <div className="flex gap-2">
                  <input value={manual} onChange={(e) => setManual(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleCode(manual); } }}
                    placeholder="למשל 1234567" inputMode="text"
                    className="flex-1 border border-slate-300 rounded-lg px-3 py-2.5 text-sm font-mono" />
                  <button type="button" onClick={() => void handleCode(manual)} disabled={busy || !manual.trim()}
                    className="bg-indigo-700 hover:bg-indigo-800 disabled:opacity-50 text-white rounded-lg px-4 py-2.5 text-sm font-medium">
                    חפש
                  </button>
                </div>
              </div>

              <p className="text-[11px] text-slate-400 text-center">
                המערכת מזהה לבד אם הקוד סיריאלי או מק״ט כללי.
              </p>
            </div>

            <div className="border-t border-slate-200 p-3 bg-white shrink-0">
              <button onClick={() => setOpen(false)} className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm">
                {scanned > 0 ? `סיום (${scanned} נסרקו)` : "סגור"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
