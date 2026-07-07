"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";

export default function ProcedureTextForm({
  current, action, canEdit,
}: {
  current: string;
  action: (fd: FormData) => Promise<void>;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [text, setText] = useState(current);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  function save() {
    const fd = new FormData(); fd.set("text", text);
    start(async () => { await action(fd); setSaved(true); router.refresh(); setTimeout(() => setSaved(false), 2500); });
  }

  return (
    <Card className="p-4 max-w-3xl">
      <h2 className="font-bold text-slate-800 mb-1">📝 נוסח נוהל נהיגה</h2>
      <p className="text-sm text-slate-500 mb-3">
        הנוסח שיישלח לחייל בטלגרם לחתימה (בטאב &quot;רשיונות והיתרים&quot; → 📲 שלח לחתימה), והחייל מאשר בכפתור בבוט.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={!canEdit}
        rows={12}
        placeholder="הזן כאן את נוהל הנהיגה שהנהג נדרש לקרוא ולחתום עליו…"
        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono leading-relaxed disabled:bg-slate-50"
      />
      {canEdit && (
        <div className="flex items-center gap-3 mt-3">
          <button onClick={save} disabled={pending}
            className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-5 py-2 text-sm font-medium disabled:opacity-50">
            {pending ? "שומר…" : "שמור נוסח"}
          </button>
          {saved && <span className="text-sm text-emerald-600">✓ נשמר</span>}
        </div>
      )}
    </Card>
  );
}
