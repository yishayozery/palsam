"use client";

import { useRef, useEffect } from "react";

/**
 * משטח חתימה פרופורציונלי — buffer ה-canvas מותאם לרוחב התצוגה × DPR,
 * כך שהחתימה לא נמתחת ונראית חד גם במובייל. onChange מחזיר data-URL PNG (או "" בניקוי).
 */
export default function SignaturePad({ onChange, height = 170 }: { onChange: (dataUrl: string) => void; height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);

  useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext("2d")!;
    const dpr = Math.max(1, window.devicePixelRatio || 1);

    function setup() {
      const rect = c.getBoundingClientRect();
      const w = Math.round(rect.width * dpr);
      const h = Math.round(height * dpr);
      if (c.width === w && c.height === h) return; // אין שינוי — לא לאפס את הציור
      c.width = w; c.height = h;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#1e293b";
      hasInk.current = false;
    }
    setup();

    const pos = (e: PointerEvent) => { const r = c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const down = (e: PointerEvent) => { drawing.current = true; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); c.setPointerCapture(e.pointerId); };
    const move = (e: PointerEvent) => { if (!drawing.current) return; const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); hasInk.current = true; };
    const up = () => { if (drawing.current) { drawing.current = false; if (hasInk.current) onChange(c.toDataURL("image/png")); } };
    c.addEventListener("pointerdown", down); c.addEventListener("pointermove", move);
    c.addEventListener("pointerup", up); c.addEventListener("pointerleave", up);
    window.addEventListener("resize", setup);
    return () => {
      c.removeEventListener("pointerdown", down); c.removeEventListener("pointermove", move);
      c.removeEventListener("pointerup", up); c.removeEventListener("pointerleave", up);
      window.removeEventListener("resize", setup);
    };
  }, [height, onChange]);

  const clear = () => {
    const c = ref.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    hasInk.current = false;
    onChange("");
  };

  return (
    <div>
      <canvas ref={ref} style={{ width: "100%", height }} className="block border-2 border-dashed border-slate-300 rounded-lg bg-white touch-none" />
      <button type="button" onClick={clear} className="text-xs text-slate-400 hover:text-rose-600 mt-1">🧹 נקה חתימה</button>
    </div>
  );
}
