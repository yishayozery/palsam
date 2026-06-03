"use client";

import { useRef, useState, useEffect } from "react";
import { completeSignature } from "@/app/(app)/signatures/actions";

export default function SignaturePad({
  token,
  soldierName,
}: {
  token: string;
  soldierName: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasDrawn = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#1e293b";

    const pos = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left) * (canvas.width / rect.width),
        y: (e.clientY - rect.top) * (canvas.height / rect.height),
      };
    };
    const down = (e: PointerEvent) => {
      drawing.current = true;
      hasDrawn.current = true;
      const p = pos(e);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
    };
    const move = (e: PointerEvent) => {
      if (!drawing.current) return;
      e.preventDefault();
      const p = pos(e);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    };
    const up = () => { drawing.current = false; };

    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, []);

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasDrawn.current = false;
  };

  const submit = async () => {
    if (!hasDrawn.current) { setError("נא לחתום בתיבה"); return; }
    setError("");
    setSubmitting(true);
    const data = canvasRef.current!.toDataURL("image/png");
    const res = await completeSignature(token, data);
    setSubmitting(false);
    if (res.ok) setDone(true);
    else setError(res.error || "שגיאה");
  };

  if (done) {
    return (
      <div className="text-center py-6">
        <div className="text-5xl mb-2">✅</div>
        <p className="font-bold text-emerald-700">החתימה נקלטה!</p>
        <p className="text-sm text-slate-500 mt-1">תודה, {soldierName}.</p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm text-slate-600 mb-2">
        אני, <span className="font-bold">{soldierName}</span>, מאשר/ת קבלת הציוד וחותם/ת:
      </p>
      <canvas
        ref={canvasRef}
        width={400}
        height={180}
        className="w-full border-2 border-dashed border-slate-300 rounded-lg bg-slate-50 touch-none"
      />
      {error && <p className="text-sm text-rose-600 mt-1">{error}</p>}
      <div className="flex gap-2 mt-3">
        <button onClick={clear} type="button"
          className="flex-1 rounded-lg border border-slate-300 py-2.5 text-sm">
          ניקוי
        </button>
        <button onClick={submit} disabled={submitting}
          className="flex-[2] bg-emerald-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-emerald-700 disabled:opacity-60">
          {submitting ? "שולח..." : "אישור וחתימה"}
        </button>
      </div>
    </div>
  );
}
