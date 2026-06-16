"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";
import { updateSignatureClause } from "./actions";

export default function SignatureClauseEditor({
  warehouseId, warehouseName, initial, readOnly = false,
}: {
  warehouseId: string;
  warehouseName: string;
  initial: string | null;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initial ?? "");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true); setError(null);
    try {
      const fd = new FormData();
      fd.append("warehouseId", warehouseId);
      fd.append("signatureClause", value.trim());
      const res = await updateSignatureClause(fd);
      if (res?.error) setError(res.error);
      else {
        setEditing(false); setSaved(true);
        setTimeout(() => setSaved(false), 2500);
        router.refresh();
      }
    } finally { setBusy(false); }
  }

  if (readOnly && !initial) return null;

  return (
    <Card className="p-4 mb-4 bg-amber-50 border-amber-200">
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex-1 min-w-44">
          <h3 className="font-bold text-amber-900 mb-1">📝 תניית חתימה — {warehouseName}</h3>
          <p className="text-xs text-amber-800 mb-2">
            הטקסט הזה יוצג לחייל במסך החתימה לפני שהוא חותם דיגיטלית, וגם בתעודת ה-PDF.
            לדוגמה: ״אני, החתום מטה, מצהיר שקיבלתי את כלי הירייה במצב תקין״.
          </p>
        </div>
        {!readOnly && !editing && (
          <button onClick={() => setEditing(true)}
            className="text-xs bg-white border border-amber-300 hover:bg-amber-100 text-amber-800 rounded-lg px-3 py-1.5">
            {initial ? "✎ ערוך" : "+ הוסף תנייה"}
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-2 mt-2">
          <textarea value={value} onChange={(e) => setValue(e.target.value)} rows={5}
            placeholder="הקלד כאן את התניה. השאר ריק כדי להסיר."
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm leading-relaxed" />
          {error && <div className="text-xs text-rose-700 bg-rose-50 rounded p-2">⚠️ {error}</div>}
          <div className="flex gap-2">
            <button onClick={save} disabled={busy}
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4 py-1.5 text-sm disabled:opacity-50">
              {busy ? "שומר..." : "💾 שמור"}
            </button>
            <button onClick={() => { setEditing(false); setValue(initial ?? ""); setError(null); }}
              disabled={busy}
              className="rounded-lg border border-slate-300 px-4 py-1.5 text-sm">ביטול</button>
          </div>
        </div>
      ) : (
        <div className="mt-2">
          {initial ? (
            <pre className="bg-white border border-amber-200 rounded-lg p-3 text-sm whitespace-pre-wrap font-sans text-slate-800">{initial}</pre>
          ) : (
            <div className="text-xs text-slate-500 italic">אין תניית חתימה מוגדרת — לחץ כדי להוסיף.</div>
          )}
          {saved && <div className="text-xs text-emerald-700 mt-1">✓ נשמר</div>}
        </div>
      )}
    </Card>
  );
}
