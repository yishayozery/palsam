"use client";

import { useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { completeSignature, getPostSignatureShareData, cancelSignatureByToken } from "@/app/(app)/signatures/actions";
import { completeCompanySignature } from "@/app/(app)/signatures/company-actions";

type WeaponsAgreement = { title: string; clauses: string[]; footer: string };
type SignatureClause = { holderName: string; text: string };
type CommanderApproval = { name: string; date: string; signature: string | null };

export default function SignaturePad({
  token,
  soldierName,
  isCompanySign = false,
  weaponsAgreement,
  signatureClause,
  commanderApproval,
}: {
  token: string;
  soldierName: string;
  isCompanySign?: boolean;
  weaponsAgreement?: WeaponsAgreement;
  signatureClause?: SignatureClause;
  commanderApproval?: CommanderApproval;
}) {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasDrawn = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [whatsappText, setWhatsappText] = useState<string | null>(null);
  const [soldierPhone, setSoldierPhone] = useState<string | null>(null);
  const [transferId, setTransferId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const needsAck = !!(weaponsAgreement || signatureClause);
  const [acknowledged, setAcknowledged] = useState(false);

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

  const handleCancel = async () => {
    if (!confirm("לבטל את ההחתמה ולחזור? תוכל ליצור החתמה חדשה עם הפריטים הנכונים.")) return;
    setCancelling(true);
    const res = await cancelSignatureByToken(token);
    setCancelling(false);
    if (res.ok) {
      const params = new URLSearchParams();
      if (res.soldierId) params.set("reopenFor", res.soldierId);
      if (res.serialIds?.length) params.set("preselect", res.serialIds.join(","));
      router.push(`/signatures?${params.toString()}`);
    } else {
      setError(res.error || "שגיאה בביטול");
    }
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasDrawn.current = false;
  };

  const submit = async () => {
    if (needsAck && !acknowledged) { setError("יש לאשר קריאת ההוראות לפני החתימה"); return; }
    if (!hasDrawn.current) { setError("נא לחתום בתיבה"); return; }
    setError("");
    setSubmitting(true);
    const data = canvasRef.current!.toDataURL("image/png");
    const res = isCompanySign
      ? await completeCompanySignature(token, data)
      : await completeSignature(token, data);
    setSubmitting(false);
    if (res.ok) {
      setDone(true);
      // 📲 טעינה אוטומטית של summary לשיתוף WhatsApp (רק לחתימת חייל)
      if (!isCompanySign) {
        try {
          const share = await getPostSignatureShareData(token);
          if (share.ok) {
            setWhatsappText(share.whatsappText);
            setSoldierPhone(share.soldierPhone);
            setTransferId(share.transferId);
          }
        } catch {}
      }
    }
    else setError(res.error || "שגיאה");
  };

  // אין אוטו-ניווט — המשתמש ילחץ "חזרה" בזמנו (כדי שיספיק לשלוח PDF)

  if (done) {
    const normalizedPhone = soldierPhone?.replace(/\D/g, "").replace(/^0/, "972") ?? "";
    const waUrl = whatsappText
      ? `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(whatsappText)}`
      : null;
    return (
      <div className="text-center py-6">
        <div className="text-6xl mb-3">✅</div>
        <p className="font-bold text-emerald-700 text-xl">החתימה נקלטה בהצלחה!</p>
        <p className="text-sm text-slate-500 mt-2">תודה, {soldierName}.</p>

        {whatsappText && (
          <div className="mt-4 bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-right">
            <div className="text-xs font-bold text-emerald-900 mb-2">📋 סיכום כל הציוד שחתום עליך:</div>
            <pre className="bg-white border border-slate-200 rounded p-2 text-xs whitespace-pre-wrap font-sans max-h-40 overflow-y-auto">{whatsappText}</pre>
            <div className="flex gap-2 mt-2">
              <a href={waUrl!} target="_blank" rel="noopener noreferrer"
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg py-2 text-sm font-bold text-center">
                📲 {normalizedPhone ? `שלח לחייל ב-WhatsApp` : `שתף ב-WhatsApp`}
              </a>
              <button onClick={() => navigator.clipboard.writeText(whatsappText)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                📋 העתק
              </button>
            </div>
          </div>
        )}

        {transferId && (() => {
          const docUrl = `${window.location.origin}/transfer-doc/${transferId}`;
          const pdfWaText = `שלום ${soldierName}, מצורף אישור ${whatsappText ? "החתמת" : ""} ציוד:\n${docUrl}`;
          const pdfWaUrl = normalizedPhone
            ? `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(pdfWaText)}`
            : `https://wa.me/?text=${encodeURIComponent(pdfWaText)}`;
          return (
            <div className="mt-4 flex gap-2">
              <a href={pdfWaUrl} target="_blank" rel="noopener noreferrer"
                className="flex-1 bg-green-600 hover:bg-green-700 text-white rounded-lg py-2 text-sm font-bold text-center">
                📤 שלח טופס לחייל
              </a>
              <a href={docUrl} target="_blank" rel="noreferrer"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-center hover:bg-slate-50">
                📄 צפייה
              </a>
            </div>
          );
        })()}

        <button onClick={() => router.push("/")}
          className="mt-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-6 py-2 text-sm font-medium">
          → חזרה
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* 🔫 נוהל נשק + 📝 תניית חתימה — מתקפלים עם צ'קבוקס */}
      {needsAck && (
        <div className="mb-4 space-y-2">
          {weaponsAgreement && (
            <details className="bg-rose-50 border-2 border-rose-300 rounded-xl overflow-hidden">
              <summary className="px-3 py-2 cursor-pointer text-[12px] font-bold text-rose-900 flex items-center gap-1.5">
                🔫 {weaponsAgreement.title}
                <span className="text-[10px] font-normal text-rose-600 mr-auto">(לחץ לקריאה)</span>
              </summary>
              <div className="px-3 pb-3">
                <div className="text-[13px] text-slate-800 leading-relaxed space-y-1.5">
                  {weaponsAgreement.clauses.map((c, i) => <p key={i}>{c}</p>)}
                </div>
                <div className="text-[11px] text-rose-700 mt-2 pt-2 border-t border-rose-200">
                  {weaponsAgreement.footer}
                </div>
              </div>
            </details>
          )}

          {signatureClause && (
            <details className="bg-amber-50 border-2 border-amber-300 rounded-xl overflow-hidden">
              <summary className="px-3 py-2 cursor-pointer text-[12px] font-bold text-amber-900 flex items-center gap-1.5">
                📝 הצהרת חייל ({signatureClause.holderName})
                <span className="text-[10px] font-normal text-amber-600 mr-auto">(לחץ לקריאה)</span>
              </summary>
              <div className="px-3 pb-3">
                <pre className="text-sm text-slate-800 whitespace-pre-wrap font-sans leading-relaxed">
                  {signatureClause.text}
                </pre>
              </div>
            </details>
          )}

          <label className={`flex items-center gap-2 rounded-lg p-2.5 border-2 cursor-pointer transition ${acknowledged ? "bg-emerald-50 border-emerald-400" : "bg-rose-50 border-rose-300"}`}>
            <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)}
              className="w-5 h-5 rounded accent-emerald-600" />
            <span className={`text-sm font-bold ${acknowledged ? "text-emerald-800" : "text-rose-800"}`}>
              קראתי את ההוראות ואני מאשר/ת
            </span>
          </label>
        </div>
      )}

      {/* אישור מפקד — חתימת מגד/סמגד/מפמ */}
      {commanderApproval && (
        <div className="mb-4 bg-blue-50 border-2 border-blue-300 rounded-xl p-3">
          <div className="text-[11px] font-bold text-blue-900 mb-1 uppercase tracking-wide">
            🎖️ אישור מפקד לנשיאת נשק
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1 text-sm text-slate-800">
              <div>מאשר: <span className="font-bold">{commanderApproval.name}</span></div>
              <div className="text-xs text-slate-500">תאריך: {commanderApproval.date}</div>
            </div>
            {commanderApproval.signature && (
              <div className="shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={commanderApproval.signature} alt="חתימת מפקד" className="h-12 w-auto border border-blue-200 rounded bg-white p-0.5" />
              </div>
            )}
          </div>
        </div>
      )}

      <div className={needsAck && !acknowledged ? "opacity-40 pointer-events-none" : ""}>
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
      <button onClick={handleCancel} disabled={cancelling}
        className="w-full mt-2 rounded-lg border border-slate-200 py-2 text-xs text-slate-500 hover:bg-slate-50 hover:text-slate-700 disabled:opacity-50">
        {cancelling ? "מבטל..." : "← ביטול וחזרה לבחירת ציוד"}
      </button>
      </div>
    </div>
  );
}
