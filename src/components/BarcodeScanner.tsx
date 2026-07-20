"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
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
  const [flash, setFlash] = useState<"good" | "bad" | null>(null);
  // מה שהמצלמה קראה בפועל — מבדיל בין "לא זוהה ברקוד" ל"זוהה אבל לא במאגר"
  const [rawSeen, setRawSeen] = useState<string | null>(null);
  const [engine, setEngine] = useState<string | null>(null);
  const [camInfo, setCamInfo] = useState<string | null>(null);
  const framesRef = useRef(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const wedgeRef = useRef<HTMLInputElement | null>(null);
  const lastCodeRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });

  useEscClose(open, () => setOpen(false));

  /**
   * 🔔 ביפ דרך WebAudio — בלי קובץ קול, ועובד גם באייפון (שם navigator.vibrate
   * לא קיים בכלל, ולכן רטט לבדו היה משאיר את המשתמש בלי שום משוב).
   * ה-AudioContext נוצר בלחיצה על "סרוק" — מחווה של המשתמש, כנדרש ב-iOS.
   */
  const audioRef = useRef<AudioContext | null>(null);
  const beep = useCallback((ok: boolean) => {
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      audioRef.current ??= new Ctx();
      const ctx = audioRef.current;
      if (ctx.state === "suspended") void ctx.resume();
      const play = (freq: number, start: number, dur: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "square";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime + start);
        gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + start + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + dur + 0.02);
      };
      if (ok) play(1180, 0, 0.09);           // ביפ אחד גבוה — נמצא
      else { play(320, 0, 0.13); play(240, 0.16, 0.18); }  // שתי נמוכות — לא נמצא
    } catch { /* אודיו חסום — המשוב הוויזואלי עדיין קיים */ }
  }, []);

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
        beep(false);
        navigator.vibrate?.([60, 40, 60]);
        setFlash("bad");
      } else {
        const name = hit.kind === "SERIAL" ? `${hit.itemName} · ${hit.serialNumber}` : hit.itemName;
        setLast({ text: name, ok: true });
        setScanned((n) => n + 1);
        beep(true);
        navigator.vibrate?.(40);
        setFlash("good");
        onHit(hit);
        if (autoClose) setOpen(false);
      }
      setTimeout(() => setFlash(null), 450);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שגיאה בזיהוי");
    } finally {
      setBusy(false);
      setManual("");
    }
  }, [onHit, autoClose, beep]);

  // ── מצלמה ──
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    (async () => {
      setCamState("starting");
      try {
        // רזולוציה גבוהה + פוקוס רציף. ברירת המחדל של getUserMedia עלולה להיות
        // 640x480 ואז ברקוד צפוף (Code 128) לא מפוענח אלא מקרוב מאוד.
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 }, height: { ideal: 1080 },
            // @ts-expect-error — נתמך בכרום/אנדרואיד, מתעלמים ממנו במקום אחר
            focusMode: "continuous",
          },
        });
        {
          const track = stream.getVideoTracks()[0];
          const st = track?.getSettings?.();
          if (st) setCamInfo(`${st.width ?? "?"}×${st.height ?? "?"}`);
        }
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
          setEngine("BarcodeDetector");
          const det = new W.BarcodeDetector({
            formats: ["code_128", "code_39", "ean_13", "ean_8", "upc_a", "upc_e", "itf", "codabar", "qr_code", "data_matrix"],
          });
          const tick = async () => {
            if (cancelled || !videoRef.current) return;
            try {
              const found = await det.detect(videoRef.current);
              if (found[0]?.rawValue) { setRawSeen(found[0].rawValue); await handleCode(found[0].rawValue); }
              framesRef.current++;
            } catch { /* פריים לא קריא — ממשיכים */ }
            if (!cancelled) setTimeout(tick, 250);
          };
          tick();
          stopRef.current = () => { cancelled = true; };
          return;
        }

        // מסלול ב׳ — ZXing (אייפון/ספארי). נטען רק כאן, כדי לא להכביד על שאר המערכת.
        // decodeFromStream ולא decodeFromVideoElement: ZXing מחבר בעצמו את הזרם
        // לאלמנט ומחכה למטא-דאטה, כך שהוא לא מנסה לפענח פריים חסר-מימדים.
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const { DecodeHintType, BarcodeFormat } = await import("@zxing/library");
        if (cancelled) return;
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.QR_CODE, BarcodeFormat.DATA_MATRIX,
          BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.ITF,
          BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
          BarcodeFormat.CODABAR,
        ]);
        hints.set(DecodeHintType.TRY_HARDER, true);
        setEngine("ZXing");
        const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 150 });
        const controls = await reader.decodeFromStream(stream, video, (result) => {
          framesRef.current++;
          if (result) { setRawSeen(result.getText()); void handleCode(result.getText()); }
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
      <button type="button" onClick={() => { setOpen(true); setLast(null); setScanned(0); setErr(null); setRawSeen(null); setEngine(null); setCamInfo(null); }}
        className={compact
          ? "bg-white border border-slate-300 rounded-lg px-2.5 py-2 text-xs hover:bg-slate-50 whitespace-nowrap"
          : "bg-white border border-indigo-300 text-indigo-700 rounded-lg px-3 py-2 text-xs md:text-sm font-medium hover:bg-indigo-50 whitespace-nowrap"}>
        {label}
      </button>

      {/* ⚠️ portal ל-body: הסורק נפתח מתוך מודלים אחרים. position:fixed מאבד
          את משמעותו כשיש אב עם transform/filter, ואז החלון נדחס לזרימת המסמך
          במקום לצוף — והווידאו מקבל גובה מעוות שלא ניתן לפענוח. */}
      {open && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4" dir="rtl">
          <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl max-h-[92dvh] flex flex-col overflow-hidden">

            {/* 📷 המצלמה ראשונה ובגובה מלא — היא העיקר. הכותרת והסגירה מרחפות עליה,
                כדי שבמובייל לא יידחף למטה ולא ייחתך. */}
            {/* ⚠️ בלי aspect-ratio: aspect-ratio יחד עם maxHeight מכווץ גם את *הרוחב*,
                והווידאו יוצא רצועה צרה שממנה אי-אפשר לפענח ברקוד. גובה קבוע + w-full. */}
            <div className="relative bg-slate-900 shrink-0 w-full" style={{ height: "46dvh", minHeight: 240 }}>
              <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />

              {/* הבזק ירוק/אדום על כל חלון המצלמה — המשוב שרואים גם מזווית העין */}
              {flash && (
                <div className={`absolute inset-0 pointer-events-none ${flash === "good" ? "bg-emerald-400/45" : "bg-rose-500/45"}`} />
              )}

              {camState === "live" && !flash && (
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div className="w-[85%] h-24 border-2 border-white/80 rounded-lg shadow-[0_0_0_9999px_rgba(0,0,0,0.28)]" />
                </div>
              )}
              {camState !== "live" && (
                <div className="absolute inset-0 flex items-center justify-center text-center text-slate-300 text-sm p-6">
                  {camState === "starting" ? "מפעיל מצלמה…"
                    : camState === "unavailable" ? "אין גישה למצלמה — סרוק עם סורק חומרה או הקלד למטה"
                    : ""}
                </div>
              )}

              {/* שורת כותרת מרחפת */}
              <div className="absolute top-0 inset-x-0 flex items-start justify-between gap-2 p-3 bg-gradient-to-b from-black/65 to-transparent">
                <span className="text-white text-sm font-bold drop-shadow">
                  {scanned > 0 ? `${scanned} נסרקו` : "כוון לברקוד"}
                </span>
                <button onClick={() => setOpen(false)} aria-label="סגור"
                  className="text-white/90 hover:text-white text-2xl leading-none w-8 h-8 rounded-full bg-black/40 flex items-center justify-center">✕</button>
              </div>

              {/* התוצאה האחרונה — צמודה לתחתית המצלמה, בשדה הראייה */}
              {last && (
                <div className={`absolute bottom-0 inset-x-0 px-3 py-2.5 text-sm font-bold ${last.ok ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"}`}>
                  {last.ok ? "✅" : "⚠️"} {last.text}
                </div>
              )}
              {busy && !last && (
                <div className="absolute bottom-0 inset-x-0 px-3 py-2 text-xs text-white bg-black/55">מזהה…</div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-3">
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

              {(engine || camInfo) && (
                <p className="text-[10px] text-slate-400 text-center">
                  מנוע: {engine ?? "…"}{camInfo ? ` · מצלמה ${camInfo}` : ""}
                </p>
              )}

              {rawSeen && (
                <div className="rounded-lg bg-slate-100 px-3 py-2 text-[11px] text-slate-600">
                  הקוד שנקרא מהמצלמה: <span className="font-mono text-slate-900 select-all break-all">{rawSeen}</span>
                  <button type="button" onClick={() => { setManual(rawSeen); }}
                    className="mr-2 text-indigo-700 underline">העתק לשדה</button>
                </div>
              )}

              <p className="text-[11px] text-slate-400 text-center">
                המערכת מזהה לבד אם הקוד סיריאלי או מק״ט כללי. הסורק נשאר פתוח לסריקה רצופה.
              </p>
            </div>

            <div className="border-t border-slate-200 p-3 bg-white shrink-0">
              <button onClick={() => setOpen(false)} className="w-full rounded-lg bg-slate-800 text-white px-4 py-3 text-sm font-bold">
                {scanned > 0 ? `סיום (${scanned} נסרקו)` : "סגור"}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
