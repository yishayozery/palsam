"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { signFuelCardPublic } from "./actions";

function SigPad({ onChange }: { onChange: (d: string) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  useEffect(() => {
    const c = ref.current!; const ctx = c.getContext("2d")!;
    ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.strokeStyle = "#1e293b";
    const pos = (e: PointerEvent) => { const r = c.getBoundingClientRect(); return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) }; };
    const down = (e: PointerEvent) => { drawing.current = true; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); c.setPointerCapture(e.pointerId); };
    const move = (e: PointerEvent) => { if (!drawing.current) return; const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); };
    const up = () => { if (drawing.current) { drawing.current = false; onChange(c.toDataURL("image/png")); } };
    c.addEventListener("pointerdown", down); c.addEventListener("pointermove", move); c.addEventListener("pointerup", up); c.addEventListener("pointerleave", up);
    return () => { c.removeEventListener("pointerdown", down); c.removeEventListener("pointermove", move); c.removeEventListener("pointerup", up); c.removeEventListener("pointerleave", up); };
  }, [onChange]);
  const clear = () => { const c = ref.current!; c.getContext("2d")!.clearRect(0, 0, c.width, c.height); onChange(""); };
  return (<div><canvas ref={ref} width={360} height={150} className="w-full border-2 border-dashed border-slate-300 rounded-lg bg-white touch-none" /><button type="button" onClick={clear} className="text-xs text-slate-400 hover:text-rose-600 mt-1">🧹 נקה</button></div>);
}

export default function SignForm({ cardId, token, soldierName }: { cardId: string; token: string; soldierName: string }) {
  const [sig, setSig] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  if (done) return <div className="text-center py-6"><div className="text-5xl mb-2">✅</div><p className="font-bold text-emerald-700">נחתם בהצלחה. תודה, {soldierName}!</p></div>;

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600 text-center">אני מאשר/ת קבלת הכרטיס באחריותי — חתום/י בתיבה:</p>
      <SigPad onChange={setSig} />
      {err && <p className="text-rose-600 text-sm text-center">{err}</p>}
      <button
        onClick={() => { setErr(null); if (!sig) { setErr("נא לחתום"); return; } start(async () => { const r = await signFuelCardPublic(cardId, token, sig); if (r.error) { setErr(r.error); return; } setDone(true); }); }}
        disabled={pending}
        className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl py-3 font-bold">
        {pending ? "שולח…" : "✍️ אשר וחתום"}
      </button>
    </div>
  );
}
