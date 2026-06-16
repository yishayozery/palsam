"use client";

import { useState } from "react";
import { lookupSoldierEquipment, type SoldierEquipmentResult } from "./actions";

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
