"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, Badge } from "@/components/ui";
import { approveSoldierForWeapons, revokeSoldierWeaponsApproval, bulkApproveForWeapons } from "./actions";

type Soldier = {
  id: string; fullName: string; personalNumber: string | null; phone: string | null;
  companyName: string | null; enlisted: boolean; enlistedAt: string | null;
  armoryTestDone: boolean;
  weaponsApprovedAt: string | null; weaponsApprovedByName: string | null;
};

const MY_EQUIPMENT_URL = "https://palsam.vercel.app/my-equipment";

function buildWhatsAppUrl(soldier: Soldier, armoryTestUrl: string | null) {
  const lines = [
    `היי ${soldier.fullName},`,
    "",
    "כדי לקבל נשק, צריך להשלים את התהליך:",
    `1. היכנס ללינק: ${MY_EQUIPMENT_URL}`,
    `2. הזן שם מלא + מספר אישי`,
    ...(armoryTestUrl ? [`3. עבור את המבחן: ${armoryTestUrl}`] : []),
    `${armoryTestUrl ? "4" : "3"}. העלה צילום מסך של המבחן שעברת`,
    "",
    "בהצלחה! 🔫",
  ];
  const phone = soldier.phone?.replace(/\D/g, "") ?? "";
  const intlPhone = phone.startsWith("0") ? `972${phone.slice(1)}` : phone;
  return `https://wa.me/${intlPhone}?text=${encodeURIComponent(lines.join("\n"))}`;
}

export default function ApprovalsClient({ soldiers, armoryTestUrl, approverName }: { soldiers: Soldier[]; armoryTestUrl: string | null; approverName: string }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "blocked">("pending");
  const [busy, setBusy] = useState<string | null>(null);
  const [signFor, setSignFor] = useState<string | null>(null); // soldierId or "bulk"

  const filtered = useMemo(() => {
    return soldiers.filter((s) => {
      if (q.trim() && !`${s.fullName} ${s.personalNumber ?? ""} ${s.companyName ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
      if (filter === "pending") return s.enlisted && !s.weaponsApprovedAt;
      if (filter === "approved") return !!s.weaponsApprovedAt;
      if (filter === "blocked") return !s.enlisted;
      return true;
    });
  }, [soldiers, q, filter]);

  const counts = {
    pending: soldiers.filter((s) => s.enlisted && !s.weaponsApprovedAt).length,
    approved: soldiers.filter((s) => !!s.weaponsApprovedAt).length,
    blocked: soldiers.filter((s) => !s.enlisted).length,
  };

  async function submitApproval(signatureData: string) {
    if (!signFor) return;
    if (signFor === "bulk") {
      setBusy("bulk");
      try {
        const fd = new FormData();
        fd.append("signatureData", signatureData);
        const res = await bulkApproveForWeapons(fd);
        if (res?.error) alert(res.error);
        else { alert(`✅ אושרו ${res.count} חיילים`); router.refresh(); }
      } finally { setBusy(null); setSignFor(null); }
    } else {
      setBusy(signFor);
      try {
        const fd = new FormData();
        fd.append("soldierId", signFor);
        fd.append("signatureData", signatureData);
        const res = await approveSoldierForWeapons(fd);
        if (res?.error) alert(res.error); else router.refresh();
      } finally { setBusy(null); setSignFor(null); }
    }
  }

  async function revoke(id: string) {
    if (!confirm("לבטל אישור נשק לחייל?")) return;
    setBusy(id);
    try {
      const fd = new FormData(); fd.append("soldierId", id);
      const res = await revokeSoldierWeaponsApproval(fd);
      if (res?.error) alert(res.error); else router.refresh();
    } finally { setBusy(null); }
  }

  const signTarget = signFor === "bulk"
    ? `כל ${counts.pending} הממתינים`
    : soldiers.find((s) => s.id === signFor)?.fullName ?? "";

  return (
    <>
      {/* חלונית חתימה */}
      {signFor && (
        <SignatureModal
          approverName={approverName}
          targetName={signTarget}
          onSign={submitApproval}
          onCancel={() => setSignFor(null)}
          busy={!!busy}
        />
      )}

      <Card className="p-3 mb-3">
        <input value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="🔍 חיפוש - שם / מ.א. / פלוגה"
          className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm mb-2" />
        <div className="flex gap-1.5 flex-wrap">
          <FilterChip active={filter === "pending"} onClick={() => setFilter("pending")} color="amber">
            ⏳ ממתינים ({counts.pending})
          </FilterChip>
          <FilterChip active={filter === "approved"} onClick={() => setFilter("approved")} color="emerald">
            ✅ אושרו ({counts.approved})
          </FilterChip>
          <FilterChip active={filter === "blocked"} onClick={() => setFilter("blocked")} color="rose">
            🚫 חסומים (אין שלישות) ({counts.blocked})
          </FilterChip>
          <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
            הכל ({soldiers.length})
          </FilterChip>
        </div>
        {counts.pending > 0 && (
          <button onClick={() => setSignFor("bulk")} disabled={!!busy}
            className="mt-2 w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50">
            {busy === "bulk" ? "מאשר..." : `✓ אשר את כל ${counts.pending} הממתינים`}
          </button>
        )}
      </Card>

      {filtered.length === 0 ? (
        <Card className="p-8 text-center text-slate-400 text-sm">אין חיילים תואמים</Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="divide-y divide-slate-100">
            {filtered.map((s) => (
              <div key={s.id} className="px-4 py-3 flex items-center gap-3 flex-wrap">
                <span className="text-2xl">🪖</span>
                <div className="flex-1 min-w-44">
                  <div className="font-medium flex items-center gap-2 flex-wrap">
                    <span>{s.fullName}</span>
                    {s.personalNumber && <span className="font-mono text-xs text-slate-500">{s.personalNumber}</span>}
                    {s.companyName && <Badge className="bg-indigo-100 text-indigo-700">{s.companyName}</Badge>}
                  </div>
                  <div className="text-xs text-slate-600 mt-0.5 flex gap-2 flex-wrap">
                    {s.enlisted ? (
                      <span className="text-emerald-700">✓ אושר שלישות {s.enlistedAt && `(${new Date(s.enlistedAt).toLocaleDateString("he-IL")})`}</span>
                    ) : (
                      <span className="text-rose-700">✗ לא אושר שלישות</span>
                    )}
                    {s.weaponsApprovedAt && (
                      <span className="text-emerald-700">
                        ✓ אושר לנשק {new Date(s.weaponsApprovedAt).toLocaleDateString("he-IL")}
                        {s.weaponsApprovedByName && ` ע"י ${s.weaponsApprovedByName}`}
                      </span>
                    )}
                  </div>
                </div>
                {s.enlisted && !s.weaponsApprovedAt && (
                  <button onClick={() => setSignFor(s.id)} disabled={!!busy}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4 py-1.5 text-sm font-medium disabled:opacity-50">
                    {busy === s.id ? "..." : "✓ אשר לנשק"}
                  </button>
                )}
                {s.weaponsApprovedAt && !s.armoryTestDone && s.phone && (
                  <a href={buildWhatsAppUrl(s, armoryTestUrl)} target="_blank" rel="noopener noreferrer"
                    className="text-xs bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 rounded-lg px-3 py-1.5">
                    📲 שלח לינק
                  </a>
                )}
                {s.weaponsApprovedAt && (
                  <button onClick={() => revoke(s.id)} disabled={!!busy}
                    className="text-xs bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 rounded-lg px-3 py-1.5">
                    ביטול
                  </button>
                )}
                {!s.enlisted && (
                  <span className="text-xs text-rose-700 bg-rose-50 rounded px-3 py-1.5">חסום - אין שלישות</span>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}

function SignatureModal({ approverName, targetName, onSign, onCancel, busy }: {
  approverName: string; targetName: string;
  onSign: (signatureData: string) => void; onCancel: () => void; busy: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasDrawn = useRef(false);

  const setupCanvas = useCallback(() => {
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
    const down = (e: PointerEvent) => { drawing.current = true; hasDrawn.current = true; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
    const move = (e: PointerEvent) => { if (!drawing.current) return; e.preventDefault(); const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); };
    const up = () => { drawing.current = false; };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointerleave", up);
    return () => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointerleave", up);
    };
  }, []);

  useEffect(() => setupCanvas(), [setupCanvas]);

  function clearCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasDrawn.current = false;
  }

  function submit() {
    if (!hasDrawn.current) { alert("נא לחתום בתיבה"); return; }
    const canvas = canvasRef.current;
    if (!canvas) return;
    onSign(canvas.toDataURL("image/png"));
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5" dir="rtl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-slate-800 mb-1">🔫 אישור חייל לנשק</h3>
        <p className="text-sm text-slate-600 mb-3">
          אני, <span className="font-bold">{approverName}</span>, מאשר/ת את <span className="font-bold text-emerald-700">{targetName}</span> לחימוש.
        </p>

        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-3">
          <div className="text-xs text-slate-500 mb-1">חתימת המאשר/ת:</div>
          <canvas ref={canvasRef} width={380} height={120}
            className="w-full border-2 border-dashed border-slate-300 rounded-lg bg-white touch-none cursor-crosshair" />
          <button onClick={clearCanvas} type="button"
            className="text-[11px] text-slate-500 hover:text-slate-700 mt-1">
            ↻ נקה חתימה
          </button>
        </div>

        <div className="flex gap-2">
          <button onClick={submit} disabled={busy}
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50">
            {busy ? "מאשר..." : "✓ חתום ואשר"}
          </button>
          <button onClick={onCancel} disabled={busy}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm">
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}

function FilterChip({ children, active, onClick, color = "slate" }: {
  children: React.ReactNode; active: boolean; onClick: () => void;
  color?: "slate" | "emerald" | "amber" | "rose";
}) {
  const map = {
    slate: active ? "bg-slate-800 text-white" : "bg-slate-100 hover:bg-slate-200 text-slate-700",
    emerald: active ? "bg-emerald-700 text-white" : "bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200",
    amber: active ? "bg-amber-700 text-white" : "bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200",
    rose: active ? "bg-rose-700 text-white" : "bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200",
  };
  return <button onClick={onClick} className={`text-xs rounded-full px-3 py-1 ${map[color]}`}>{children}</button>;
}
