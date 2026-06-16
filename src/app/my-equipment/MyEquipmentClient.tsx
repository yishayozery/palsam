"use client";

import { useState, useRef, useEffect } from "react";
import { lookupSoldierEquipment, uploadArmoryTestProof, signWeaponsAgreement, getArmoryTestImage, type SoldierEquipmentResult } from "./actions";
import { WEAPONS_AGREEMENT_TITLE, WEAPONS_AGREEMENT_CLAUSES, WEAPONS_AGREEMENT_FOOTER } from "@/lib/weapons-agreement-text";

export default function MyEquipmentClient() {
  const [pn, setPn] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SoldierEquipmentResult | null>(null);

  async function lookup(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("personalNumber", pn);
      fd.append("fullName", name);
      const res = await lookupSoldierEquipment(fd);
      setResult(res);
    } finally { setBusy(false); }
  }

  if (result?.ok) {
    const total = result.serials.length + result.qty.length;
    const e = result.weaponsEligibility;
    const checklistDone = e.enlisted && e.weaponsApproved && e.armoryTestSubmitted && e.weaponsAgreementSigned;
    return (
      <>
        <div className="bg-white rounded-2xl shadow-lg p-5 mb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs text-slate-500">חייל</div>
              <div className="text-xl font-bold text-slate-800">{result.soldier.fullName}</div>
              <div className="text-sm text-slate-600 mt-0.5 flex gap-2 flex-wrap">
                {result.soldier.personalNumber && <span className="font-mono">{result.soldier.personalNumber}</span>}
                {result.soldier.companyName && <span>· {result.soldier.companyName}</span>}
                <span className="text-slate-400">· {result.soldier.battalionName}</span>
              </div>
            </div>
            <button onClick={() => { setResult(null); }}
              className="text-sm bg-slate-100 hover:bg-slate-200 rounded-lg px-3 py-1.5">
              חיפוש חדש
            </button>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-100 text-sm text-slate-700">
            <b>{total}</b> פריטים חתומים עליך
          </div>
        </div>

        {total === 0 && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center">
            <div className="text-4xl mb-2">🎉</div>
            <div className="text-emerald-800 font-medium">אין שום ציוד חתום עליך</div>
            <div className="text-xs text-slate-500 mt-1">אם זה לא נכון - פנה לרס&quot;פ הפלוגה</div>
          </div>
        )}

        {result.serials.length > 0 && (
          <div className="bg-white rounded-2xl shadow-lg p-5 mb-3">
            <h2 className="font-bold text-slate-800 mb-3">🔫 סריאלי / אצוות ({result.serials.length})</h2>
            <div className="space-y-2">
              {result.serials.map((u, i) => (
                <div key={i} className={`border rounded-lg p-3 ${
                  u.isLoss ? "border-rose-300 bg-rose-50" : u.isWear ? "border-amber-300 bg-amber-50" : "border-slate-200"
                }`}>
                  <div className="font-medium text-sm">
                    {u.itemName}
                    {u.sku && <span className="font-mono text-xs text-slate-400 mr-2">{u.sku}</span>}
                    {u.lotQuantity && u.lotQuantity > 1 && (
                      <span className="text-[10px] bg-orange-100 text-orange-800 rounded px-1.5 py-0.5 mr-1">אצווה ×{u.lotQuantity}</span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 font-mono mt-0.5">
                    SN: {u.serial} · {u.statusName}
                    {u.isLoss && " 🔴"}{u.isWear && " 🟡"}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1 flex gap-2 flex-wrap">
                    {u.signedAt && <span>📅 נחתם {new Date(u.signedAt).toLocaleDateString("he-IL")}</span>}
                    {u.signedBy && <span>👤 ע&quot;י {u.signedBy}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {result.qty.length > 0 && (
          <div className="bg-white rounded-2xl shadow-lg p-5">
            <h2 className="font-bold text-slate-800 mb-3">📦 כמותי ({result.qty.length})</h2>
            <div className="space-y-2">
              {result.qty.map((q, i) => (
                <div key={i} className="border border-slate-200 rounded-lg p-3">
                  <div className="font-medium text-sm">
                    {q.itemName}
                    {q.sku && <span className="font-mono text-xs text-slate-400 mr-2">{q.sku}</span>}
                    <span className="text-[11px] bg-blue-100 text-blue-800 rounded px-1.5 py-0.5 mr-1">×{q.quantity} {q.unit}</span>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">{q.statusName}</div>
                  <div className="text-[11px] text-slate-500 mt-1 flex gap-2 flex-wrap">
                    {q.lastSignedAt && <span>📅 לאחרונה {new Date(q.lastSignedAt).toLocaleDateString("he-IL")}</span>}
                    {q.lastSignedBy && <span>👤 ע&quot;י {q.lastSignedBy}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 🔫 תהליך קבלת נשק */}
        <div className="bg-white rounded-2xl shadow-lg p-5 mt-3">
          <h2 className="font-bold text-slate-800 mb-3">
            🔫 תהליך קבלת נשק
            <span className={`mr-2 text-xs font-normal px-2 py-0.5 rounded ${
              checklistDone ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
            }`}>
              {checklistDone ? "✓ זכאי" : "⚠️ לא זכאי"}
            </span>
          </h2>
          <div className="space-y-2 text-sm">
            <ChecklistRow
              done={e.enlisted}
              title="אישור שלישות"
              detail={e.enlisted && e.enlistedAt
                ? `אושר ב-${new Date(e.enlistedAt).toLocaleDateString("he-IL")}${e.enlistedByName ? ` ע"י ${e.enlistedByName}` : ""}`
                : "פנה לשליש הגדוד"}
            />
            <ChecklistRow
              done={e.weaponsApproved}
              title='אישור מג"ד / סמג"ד'
              detail={e.weaponsApproved && e.weaponsApprovedAt
                ? `אושר ב-${new Date(e.weaponsApprovedAt).toLocaleDateString("he-IL")}${e.weaponsApprovedByName ? ` ע"י ${e.weaponsApprovedByName}` : ""}`
                : 'פנה למג"ד או לסמג"ד הגדוד'}
            />
            <ChecklistRow
              done={e.armoryTestSubmitted}
              title="מבחן נוהל ארמון"
              detail={e.armoryTestSubmitted && e.armoryTestSubmittedAt
                ? `הועלה ב-${new Date(e.armoryTestSubmittedAt).toLocaleDateString("he-IL")}`
                : "עוד לא הועלה צילום מסך"}
              extra={
                <ArmoryTestUploader soldierId={result.soldierId} personalNumber={result.soldier.personalNumber ?? ""}
                  testUrl={e.armoryTestUrl} alreadyUploaded={e.armoryTestSubmitted} onUploaded={() => window.location.reload()} />
              }
            />
            <ChecklistRow
              done={e.weaponsAgreementSigned}
              title="חתימה על נוהל שמירה"
              detail={e.weaponsAgreementSigned && e.weaponsAgreementSignedAt
                ? `נחתם ב-${new Date(e.weaponsAgreementSignedAt).toLocaleDateString("he-IL")}`
                : "קרא את הנוהל וחתום"}
              extra={
                !e.weaponsAgreementSigned && (
                  <WeaponsAgreementSign soldierId={result.soldierId} personalNumber={result.soldier.personalNumber ?? ""}
                    soldierName={result.soldier.fullName} onSigned={() => window.location.reload()} />
                )
              }
            />
          </div>
          {!checklistDone && (
            <p className="text-xs text-amber-700 mt-3 bg-amber-50 border border-amber-200 rounded p-2">
              🚫 כדי לחתום על נשק, השלם את כל השלבים למעלה.
            </p>
          )}
        </div>

        <p className="text-[11px] text-slate-400 text-center mt-4">
          📋 לפרטים מלאים או תיקון - פנה לרס&quot;פ הפלוגה
        </p>
      </>
    );
  }

  return (
    <form onSubmit={lookup} className="bg-white rounded-2xl shadow-lg p-6 space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">שם מלא</label>
        <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus
          placeholder="ניר ישראלי"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-slate-500" />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">מספר אישי</label>
        <input value={pn} onChange={(e) => setPn(e.target.value.replace(/\D/g, ""))} required
          inputMode="numeric" placeholder="9100012"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-center text-lg focus:outline-none focus:ring-2 focus:ring-slate-500" />
      </div>
      {result?.ok === false && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-lg p-3 text-sm">
          ⚠️ {result.error}
        </div>
      )}
      <button type="submit" disabled={busy}
        className="w-full bg-slate-800 hover:bg-slate-900 disabled:opacity-60 text-white rounded-lg py-2.5 font-medium transition">
        {busy ? "בודק..." : "🔍 בדוק"}
      </button>
      <p className="text-[11px] text-slate-400 text-center">
        הבדיקה דורשת שם מלא + מספר אישי תואמים. מוגבל ל-10 בדיקות / 5 דקות.
      </p>
    </form>
  );
}

function ChecklistRow({ done, title, detail, extra }: { done: boolean; title: string; detail: string; extra?: React.ReactNode }) {
  return (
    <div className={`flex items-start gap-3 rounded-lg p-2.5 ${done ? "bg-emerald-50" : "bg-rose-50"}`}>
      <span className="text-xl">{done ? "✅" : "❌"}</span>
      <div className="flex-1 min-w-0">
        <div className={`font-medium text-sm ${done ? "text-emerald-900" : "text-rose-900"}`}>{title}</div>
        <div className={`text-xs ${done ? "text-emerald-700" : "text-rose-700"}`}>{detail}</div>
        {extra}
      </div>
    </div>
  );
}

function ArmoryTestUploader({ soldierId, personalNumber, testUrl, alreadyUploaded, onUploaded }: {
  soldierId: string; personalNumber: string; testUrl: string | null; alreadyUploaded: boolean; onUploaded: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showImage, setShowImage] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loadingImage, setLoadingImage] = useState(false);
  const [showReupload, setShowReupload] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true); setErr(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("קריאת קובץ נכשלה"));
        reader.readAsDataURL(file);
      });
      if (dataUrl.length > 2_000_000) {
        setErr("התמונה גדולה מדי (מקס 2MB). דחס/חתוך לפני ההעלאה.");
        return;
      }
      const fd = new FormData();
      fd.append("soldierId", soldierId);
      fd.append("personalNumber", personalNumber);
      fd.append("imageData", dataUrl);
      const res = await uploadArmoryTestProof(fd);
      if (res?.error) setErr(res.error);
      else onUploaded();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שגיאה");
    } finally { setBusy(false); }
  }

  async function viewImage() {
    setLoadingImage(true);
    try {
      const fd = new FormData();
      fd.append("soldierId", soldierId);
      fd.append("personalNumber", personalNumber);
      const res = await getArmoryTestImage(fd);
      if (res?.error) setErr(res.error);
      else if (res?.imageData) { setImageUrl(res.imageData); setShowImage(true); }
      else setErr("לא נמצאה תמונה");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שגיאה");
    } finally { setLoadingImage(false); }
  }

  return (
    <div className="mt-2 flex flex-col gap-2">
      {testUrl && (
        <a href={testUrl} target="_blank" rel="noopener noreferrer"
          className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded px-3 py-1.5 inline-block text-center">
          🔗 פתח את המבחן
        </a>
      )}
      {alreadyUploaded ? (
        <div className="flex gap-2 flex-wrap">
          <button onClick={viewImage} disabled={loadingImage}
            className="text-xs bg-blue-600 hover:bg-blue-700 text-white rounded px-3 py-1.5 font-medium disabled:opacity-50">
            {loadingImage ? "טוען..." : "🖼️ צפה בתמונה"}
          </button>
          <button onClick={() => setShowReupload(true)}
            className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded px-3 py-1.5">
            🔄 העלה תמונה אחרת
          </button>
        </div>
      ) : (
        <button onClick={() => fileRef.current?.click()} disabled={busy}
          className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded px-3 py-2 font-medium disabled:opacity-50">
          {busy ? "מעלה..." : "📤 העלה צילום של מבחן שעברתי"}
        </button>
      )}
      {showReupload && (
        <button onClick={() => fileRef.current?.click()} disabled={busy}
          className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded px-3 py-2 font-medium disabled:opacity-50">
          {busy ? "מעלה..." : "📤 בחר תמונה חדשה"}
        </button>
      )}
      <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
      {showImage && imageUrl && (
        <div className="relative">
          <button onClick={() => setShowImage(false)}
            className="absolute top-1 left-1 bg-black/60 text-white rounded-full w-6 h-6 text-xs z-10">✕</button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt="צילום מבחן ארמון" className="rounded-lg border border-slate-300 max-w-full max-h-80" />
        </div>
      )}
      {err && <div className="text-[11px] text-rose-700 bg-rose-50 rounded p-1.5">⚠️ {err}</div>}
    </div>
  );
}

function WeaponsAgreementSign({ soldierId, personalNumber, soldierName, onSigned }: {
  soldierId: string; personalNumber: string; soldierName: string; onSigned: () => void;
}) {
  const [showAgreement, setShowAgreement] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasDrawn = useRef(false);

  useEffect(() => {
    if (!showAgreement) return;
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
    window.addEventListener("pointerup", up);
    return () => { canvas.removeEventListener("pointerdown", down); canvas.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, [showAgreement]);

  function clearCanvas() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasDrawn.current = false;
  }

  async function handleSign() {
    if (!hasDrawn.current) { setErr("נא לחתום בתיבה למטה"); return; }
    setBusy(true); setErr(null);
    try {
      const signatureData = canvasRef.current!.toDataURL("image/png");
      const fd = new FormData();
      fd.append("soldierId", soldierId);
      fd.append("personalNumber", personalNumber);
      fd.append("signatureData", signatureData);
      const res = await signWeaponsAgreement(fd);
      if (res?.error) setErr(res.error);
      else onSigned();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שגיאה");
    } finally { setBusy(false); }
  }

  if (!showAgreement) {
    return (
      <button onClick={() => setShowAgreement(true)}
        className="mt-2 text-xs bg-rose-600 hover:bg-rose-700 text-white rounded px-3 py-2 font-medium">
        📋 קרא וחתום על נוהל שמירת נשק
      </button>
    );
  }

  return (
    <div className="mt-2 bg-rose-50 border-2 border-rose-300 rounded-xl p-3">
      <div className="text-xs font-bold text-rose-900 mb-2">🔫 {WEAPONS_AGREEMENT_TITLE}</div>
      <div className="text-[13px] text-slate-800 space-y-1.5 leading-relaxed">
        {WEAPONS_AGREEMENT_CLAUSES.map((c, i) => (
          <p key={i}>{i + 1}. {c}</p>
        ))}
      </div>
      <div className="text-[11px] text-rose-700 mt-2 pt-2 border-t border-rose-200">
        {WEAPONS_AGREEMENT_FOOTER}
      </div>

      <div className="mt-3 bg-white border border-slate-200 rounded-lg p-2.5">
        <div className="text-[11px] text-slate-600 mb-1 flex justify-between">
          <span>פרטי המצהיר/ה:</span>
        </div>
        <div className="text-sm text-slate-800 mb-2">
          <span className="font-bold">{soldierName}</span>
          <span className="font-mono text-xs text-slate-500 mr-2">מ.א. {personalNumber}</span>
        </div>
        <div className="text-[11px] text-slate-500 mb-1">חתימה:</div>
        <canvas ref={canvasRef} width={380} height={120}
          className="w-full border-2 border-dashed border-slate-300 rounded-lg bg-slate-50 touch-none" />
        <button onClick={clearCanvas} type="button"
          className="text-[11px] text-slate-500 hover:text-slate-700 mt-1">
          ↻ נקה חתימה
        </button>
      </div>

      {err && <div className="text-[11px] text-rose-700 bg-rose-100 rounded p-1.5 mt-2">⚠️ {err}</div>}

      <div className="mt-3 flex gap-2">
        <button onClick={() => setShowAgreement(false)}
          className="flex-1 text-xs border border-slate-300 rounded px-3 py-2">
          ביטול
        </button>
        <button onClick={handleSign} disabled={busy}
          className="flex-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded px-3 py-2 font-bold disabled:opacity-50">
          {busy ? "שולח..." : "✓ חתימה ואישור"}
        </button>
      </div>
    </div>
  );
}
