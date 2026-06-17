"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";
import { updateArmoryTestUrl } from "./actions";

export default function ArmoryTestUrlEditor({
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
      fd.append("armoryTestUrl", value.trim());
      const res = await updateArmoryTestUrl(fd);
      if (res?.error) setError(res.error);
      else {
        setEditing(false); setSaved(true);
        setTimeout(() => setSaved(false), 2500);
        router.refresh();
      }
    } finally { setBusy(false); }
  }

  return (
    <Card className="p-4 mb-4 bg-blue-50 border-blue-200">
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex-1 min-w-44">
          <h3 className="font-bold text-blue-900 mb-1">🔫 קישור למבחן נוהל ארמון</h3>
          <p className="text-xs text-blue-800 mb-2">
            יוצג לחיילים ב-/my-equipment כקישור לפתיחת המבחן. החייל עושה את המבחן ומעלה צילום מסך.
            {!initial && " כרגע לא מוגדר קישור."}
          </p>
        </div>
        {!readOnly && !editing && (
          <button onClick={() => setEditing(true)}
            className="text-xs bg-white border border-blue-300 hover:bg-blue-100 text-blue-800 rounded-lg px-3 py-1.5">
            {initial ? "✎ ערוך קישור" : "＋ הגדר קישור"}
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-2 mt-2">
          <input type="url" value={value} onChange={(e) => setValue(e.target.value)}
            placeholder="https://forms.google.com/..."
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" dir="ltr" />
          {error && <div className="text-xs text-rose-700 bg-rose-100 rounded p-2">⚠️ {error}</div>}
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
      ) : initial ? (
        <div className="mt-2">
          <a href={initial} target="_blank" rel="noopener noreferrer"
            className="text-sm text-blue-700 hover:underline break-all" dir="ltr">
            🔗 {initial}
          </a>
          {saved && <div className="text-xs text-emerald-700 mt-1">✓ נשמר</div>}
        </div>
      ) : null}
    </Card>
  );
}
