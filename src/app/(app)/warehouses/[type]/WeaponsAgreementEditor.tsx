"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";
import { updateWeaponsAgreementText } from "./actions";
import { WEAPONS_AGREEMENT_CLAUSES } from "@/lib/weapons-agreement-text";

const DEFAULT_TEXT = WEAPONS_AGREEMENT_CLAUSES.map((c, i) => `${i + 1}. ${c}`).join("\n");

export default function WeaponsAgreementEditor({
  warehouseId, initial, readOnly = false,
}: {
  warehouseId: string;
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
      fd.append("weaponsAgreementText", value.trim());
      const res = await updateWeaponsAgreementText(fd);
      if (res?.error) setError(res.error);
      else {
        setEditing(false); setSaved(true);
        setTimeout(() => setSaved(false), 2500);
        router.refresh();
      }
    } finally { setBusy(false); }
  }

  function loadDefault() {
    setValue(DEFAULT_TEXT);
  }

  if (readOnly && !initial) return null;

  const displayText = initial || DEFAULT_TEXT;

  return (
    <Card className="p-4 mb-4 bg-rose-50 border-rose-200">
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex-1 min-w-44">
          <h3 className="font-bold text-rose-900 mb-1">🔫 נוהל שמירת נשק</h3>
          <p className="text-xs text-rose-800 mb-2">
            הטקסט הזה מוצג לחייל כשהוא חותם על נוהל שמירת הנשק (בדף /my-equipment ובטופס חתימה).
            {!initial && " כרגע משתמש בנוסח ברירת מחדל — ניתן לערוך."}
          </p>
        </div>
        {!readOnly && !editing && (
          <button onClick={() => setEditing(true)}
            className="text-xs bg-white border border-rose-300 hover:bg-rose-100 text-rose-800 rounded-lg px-3 py-1.5">
            {initial ? "✎ ערוך נוהל" : "✎ ערוך נוסח"}
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-2 mt-2">
          <textarea value={value} onChange={(e) => setValue(e.target.value)} rows={10}
            placeholder="הקלד כאן את סעיפי הנוהל. כל שורה = סעיף. השאר ריק לנוסח ברירת מחדל."
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm leading-relaxed" />
          {error && <div className="text-xs text-rose-700 bg-rose-100 rounded p-2">⚠️ {error}</div>}
          <div className="flex gap-2 flex-wrap">
            <button onClick={save} disabled={busy}
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4 py-1.5 text-sm disabled:opacity-50">
              {busy ? "שומר..." : "💾 שמור"}
            </button>
            <button onClick={loadDefault} type="button"
              className="rounded-lg border border-slate-300 px-4 py-1.5 text-sm">טען נוסח ברירת מחדל</button>
            <button onClick={() => { setEditing(false); setValue(initial ?? ""); setError(null); }}
              disabled={busy}
              className="rounded-lg border border-slate-300 px-4 py-1.5 text-sm">ביטול</button>
          </div>
        </div>
      ) : (
        <div className="mt-2">
          <pre className="bg-white border border-rose-200 rounded-lg p-3 text-sm whitespace-pre-wrap font-sans text-slate-800 max-h-48 overflow-y-auto">{displayText}</pre>
          {!initial && <div className="text-[10px] text-slate-500 mt-1 italic">נוסח ברירת מחדל — לחץ ״ערוך״ להתאמה</div>}
          {saved && <div className="text-xs text-emerald-700 mt-1">✓ נשמר</div>}
        </div>
      )}
    </Card>
  );
}
