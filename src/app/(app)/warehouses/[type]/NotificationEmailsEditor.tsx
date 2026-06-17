"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";
import { updateNotificationEmails } from "./actions";

export default function NotificationEmailsEditor({
  holderId, holderName, initial, readOnly = false,
}: {
  holderId: string;
  holderName: string;
  initial: string | null;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const emails = initial ? initial.split(",").map((e) => e.trim()).filter(Boolean) : [];
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initial ?? "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true); setError(null);
    const fd = new FormData();
    fd.append("holderId", holderId);
    fd.append("emails", value.trim());
    const res = await updateNotificationEmails(fd);
    setBusy(false);
    if (res?.error) { setError(res.error); return; }
    setEditing(false); setSaved(true);
    setTimeout(() => setSaved(false), 2500);
    router.refresh();
  }

  return (
    <Card className="p-4 mb-4 bg-amber-50 border-amber-200">
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex-1 min-w-44">
          <h3 className="font-bold text-amber-900 mb-1">📧 התראות מייל — {holderName}</h3>
          <p className="text-xs text-amber-800 mb-1">
            כתובות מייל שיקבלו התראה אוטומטית על כל פעולה מבצעית (החתמה, זיכוי, קליטה, העברה).
            {emails.length === 0 && " לא מוגדרים כרגע."}
          </p>
          {emails.length > 0 && !editing && (
            <div className="flex flex-wrap gap-1 mt-1">
              {emails.map((e) => (
                <span key={e} className="text-[11px] bg-amber-100 text-amber-800 rounded-full px-2 py-0.5">{e}</span>
              ))}
            </div>
          )}
        </div>
        {!readOnly && !editing && (
          <button onClick={() => setEditing(true)}
            className="text-xs bg-white border border-amber-300 hover:bg-amber-100 text-amber-800 rounded-lg px-3 py-1.5">
            {emails.length > 0 ? "✎ ערוך" : "＋ הגדר מיילים"}
          </button>
        )}
      </div>

      {editing && (
        <div className="space-y-2 mt-2">
          <input value={value} onChange={(e) => setValue(e.target.value)}
            placeholder="mail1@example.com, mail2@example.com"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" dir="ltr" />
          <p className="text-[10px] text-slate-500">הפרד בפסיקים בין כתובות מייל</p>
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
      )}
      {saved && <div className="text-xs text-emerald-700 mt-1">✓ נשמר</div>}
    </Card>
  );
}
