"use client";

import { useRef, useState, useEffect } from "react";

/** לוח חתימה אינליין — קנבס פשוט. מחזיר dataURL ב-onChange בכל שינוי. */
export default function SigPadInline({ onChange, label = "חתימת המקבל" }: { onChange: (dataUrl: string) => void; label?: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.strokeStyle = "#1e293b";
  }, []);

  function pos(e: React.PointerEvent) {
    const c = ref.current!; const r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) };
  }
  function down(e: React.PointerEvent) { drawing.current = true; const ctx = ref.current!.getContext("2d")!; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); (e.target as Element).setPointerCapture(e.pointerId); }
  function move(e: React.PointerEvent) { if (!drawing.current) return; const ctx = ref.current!.getContext("2d")!; const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); dirty.current = true; }
  function up() { if (!drawing.current) return; drawing.current = false; if (dirty.current) { setEmpty(false); onChange(ref.current!.toDataURL("image/png")); } }
  function clear() { const c = ref.current!; c.getContext("2d")!.clearRect(0, 0, c.width, c.height); dirty.current = false; setEmpty(true); onChange(""); }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] text-slate-600">✍️ {label} (חובה)</span>
        <button type="button" onClick={clear} className="text-[11px] text-rose-500 hover:underline">נקה</button>
      </div>
      <canvas ref={ref} width={520} height={130}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}
        className={`w-full h-[110px] rounded-lg border-2 bg-white touch-none ${empty ? "border-dashed border-slate-300" : "border-emerald-400"}`} />
      {empty && <p className="text-[10px] text-amber-600 mt-0.5">חתום כאן לפני אישור הזיכוי</p>}
    </div>
  );
}
