"use client";

import { useState } from "react";
import SignaturePad from "@/components/SignaturePad";
import { submitArmoryInspection } from "./actions";

type Item = { id: string; label: string; ok: boolean | null; note: string | null };

export default function FillClient(props: {
  id: string; token: string | null; battalionName: string; holderName: string;
  scheduledAt: string; inspectorName: string; status: string; completedAt: string | null;
  overallOk: boolean | null; signerName: string | null; signatureData: string | null; notes: string | null;
  items: Item[];
}) {
  const done = props.status === "COMPLETED";
  const [items, setItems] = useState<Record<string, { ok: boolean | null; note: string }>>(
    Object.fromEntries(props.items.map((i) => [i.id, { ok: i.ok, note: i.note ?? "" }])),
  );
  const [signerName, setSignerName] = useState(props.signerName ?? props.inspectorName ?? "");
  const [signature, setSignature] = useState("");
  const [notes, setNotes] = useState(props.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; overallOk?: boolean } | null>(done ? { ok: true, overallOk: props.overallOk ?? undefined } : null);

  const when = new Date(props.scheduledAt).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const allMarked = props.items.every((i) => items[i.id]?.ok != null);

  const submit = async () => {
    if (!allMarked) return alert("יש לסמן תקין/ליקוי בכל הסעיפים");
    if (!signature) return alert("נדרשת חתימת המפקד");
    if (!signerName.trim()) return alert("הזן שם המפקד החותם");
    setBusy(true);
    const res = await submitArmoryInspection(props.id, props.token, {
      items: props.items.map((i) => ({ itemId: i.id, ok: items[i.id].ok === true, note: items[i.id].note })),
      signatureData: signature, signerName: signerName.trim(), notes,
    });
    setBusy(false);
    if (res.error) return alert(res.error);
    setResult({ ok: true, overallOk: res.overallOk });
  };

  return (
    <div className="max-w-2xl mx-auto p-4" dir="rtl">
      <div className="text-center mb-4">
        <div className="text-2xl">🔫</div>
        <h1 className="text-xl font-bold">סבב בדיקת נשקייה</h1>
        <div className="text-sm text-slate-500">{props.battalionName}{props.holderName ? ` · ${props.holderName}` : ""}</div>
        <div className="text-sm text-slate-500">📅 {when}{props.inspectorName ? ` · בודק: ${props.inspectorName}` : ""}</div>
      </div>

      {result?.ok ? (
        <div className={`rounded-xl border-2 p-6 text-center ${result.overallOk ? "border-emerald-300 bg-emerald-50" : "border-amber-300 bg-amber-50"}`}>
          <div className="text-3xl mb-2">{result.overallOk ? "✅" : "⚠️"}</div>
          <div className="font-bold text-lg">{result.overallOk ? "הסבב אושר — הכל תקין" : "הסבב נסגר — נמצאו ליקויים"}</div>
          {props.completedAt && <div className="text-sm text-slate-500 mt-1">נחתם: {new Date(props.completedAt).toLocaleString("he-IL")}{props.signerName ? ` · ${props.signerName}` : ""}</div>}
          <div className="mt-4 text-right space-y-1">
            {props.items.map((i) => {
              const st = items[i.id];
              return <div key={i.id} className="text-sm flex items-start gap-2">
                <span>{st.ok === false ? "❌" : "✅"}</span>
                <span className="flex-1">{i.label}{st.note ? <span className="text-slate-500"> — {st.note}</span> : ""}</span>
              </div>;
            })}
          </div>
          {(props.signatureData || signature) && <img src={props.signatureData || signature} alt="חתימה" className="mt-4 h-20 mx-auto border rounded bg-white" />}
        </div>
      ) : (
        <div className="space-y-3">
          {props.items.map((i) => {
            const st = items[i.id];
            return (
              <div key={i.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-sm">{i.label}</span>
                  <div className="flex rounded-lg overflow-hidden border border-slate-200 shrink-0">
                    <button onClick={() => setItems((p) => ({ ...p, [i.id]: { ...p[i.id], ok: true } }))}
                      className={`px-3 py-1 text-sm ${st.ok === true ? "bg-emerald-600 text-white" : "bg-white text-slate-500"}`}>✓ תקין</button>
                    <button onClick={() => setItems((p) => ({ ...p, [i.id]: { ...p[i.id], ok: false } }))}
                      className={`px-3 py-1 text-sm ${st.ok === false ? "bg-rose-600 text-white" : "bg-white text-slate-500"}`}>✗ ליקוי</button>
                  </div>
                </div>
                {st.ok === false && (
                  <input value={st.note} onChange={(e) => setItems((p) => ({ ...p, [i.id]: { ...p[i.id], note: e.target.value } }))}
                    placeholder="פרט את הליקוי" className="mt-2 w-full rounded border border-slate-300 px-2 py-1 text-sm" />
                )}
              </div>
            );
          })}

          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="הערות כלליות (לא חובה)" rows={2}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />

          <div className="rounded-lg border border-slate-200 p-3">
            <label className="text-sm font-medium block mb-1">שם המפקד הבודק</label>
            <input value={signerName} onChange={(e) => setSignerName(e.target.value)} className="w-full rounded border border-slate-300 px-2 py-1 text-sm mb-2" />
            <label className="text-sm font-medium block mb-1">חתימה</label>
            <div className="border border-slate-300 rounded-lg overflow-hidden bg-white">
              <SignaturePad onChange={setSignature} />
            </div>
          </div>

          <button onClick={submit} disabled={busy || !allMarked}
            className="w-full bg-blue-600 text-white rounded-lg py-2.5 font-semibold hover:bg-blue-700 disabled:opacity-50">
            {busy ? "שולח…" : "אשר וסגור סבב"}
          </button>
          {!allMarked && <div className="text-center text-xs text-amber-600">יש לסמן תקין/ליקוי בכל הסעיפים</div>}
        </div>
      )}
    </div>
  );
}
