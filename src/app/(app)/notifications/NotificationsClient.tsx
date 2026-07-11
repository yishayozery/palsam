"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";
import { RECIPIENT_LABELS, ALL_RECIPIENT_TAGS } from "@/lib/botNotifications";
import { saveNotificationRule } from "./actions";

type Rule = { id: string; key: string; name: string; description: string | null; enabled: boolean; daysBefore: number; recipients: string };

function timing(daysBefore: number) {
  return daysBefore === 0 ? "ביום עצמו" : daysBefore === 1 ? "יום לפני" : `${daysBefore} ימים לפני`;
}

export default function NotificationsClient({ rules }: { rules: Rule[] }) {
  const [edit, setEdit] = useState<Rule | null>(null);
  return (
    <>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead><tr className="bg-slate-100 text-slate-500 text-xs">
              <th className="px-3 py-2 text-right">שם ההודעה</th>
              <th className="px-3 py-2 text-right">מה שולחים</th>
              <th className="px-3 py-2 text-right">למי</th>
              <th className="px-3 py-2 text-right">מתי</th>
              <th className="px-3 py-2 text-center">פעיל</th>
              <th className="px-3 py-2"></th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {rules.map((r) => {
                const tags = r.recipients.split(",").map((s) => s.trim()).filter(Boolean);
                return (
                  <tr key={r.id} className={r.enabled ? "" : "opacity-50"}>
                    <td className="px-3 py-2 font-medium text-slate-800 whitespace-nowrap">{r.name}</td>
                    <td className="px-3 py-2 text-slate-600 text-xs max-w-[260px]">{r.description ?? "—"}</td>
                    <td className="px-3 py-2 text-xs">
                      <div className="flex flex-wrap gap-1">
                        {tags.length ? tags.map((t) => <span key={t} className="bg-sky-100 text-sky-700 rounded px-1.5 py-0.5">{RECIPIENT_LABELS[t] ?? t}</span>) : <span className="text-slate-400">—</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap">{timing(r.daysBefore)}</td>
                    <td className="px-3 py-2 text-center">{r.enabled ? <span className="text-emerald-600">🟢</span> : <span className="text-slate-400">⚪</span>}</td>
                    <td className="px-3 py-2 text-left"><button onClick={() => setEdit(r)} className="text-xs bg-slate-800 text-white rounded px-3 py-1 hover:bg-slate-900">✏️ ערוך</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="text-xs text-slate-400 mt-3">התזכורות נשלחות אוטומטית מהקרון היומי (בבוקר). &quot;כמה ימים לפני&quot; רלוונטי לתזכורות מבוססות-תאריך (כמו טיפול רכב).</p>

      {edit && <EditModal rule={edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function EditModal({ rule, onClose }: { rule: Rule; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const initTags = new Set(rule.recipients.split(",").map((s) => s.trim()).filter(Boolean));

  function submit(fd: FormData) {
    setErr(null);
    fd.set("id", rule.id);
    start(async () => {
      const r = await saveNotificationRule(fd);
      if (r?.error) { setErr(r.error); return; }
      onClose(); router.refresh();
    });
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md my-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-bold text-slate-800">{rule.name}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl">✕</button>
        </div>
        <form action={submit} className="p-4 space-y-4">
          {rule.description && <p className="text-xs text-slate-500">{rule.description}</p>}
          <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
            <input type="checkbox" name="enabled" defaultChecked={rule.enabled} className="w-4 h-4 accent-emerald-600" />
            הודעה פעילה
          </label>
          <div>
            <label className="text-sm font-medium block mb-1">כמה ימים לפני</label>
            <input type="number" name="daysBefore" min={0} max={30} defaultValue={rule.daysBefore} className="w-24 border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
            <span className="text-xs text-slate-400 mr-2">0 = ביום עצמו</span>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1.5">למי לשלוח</label>
            <div className="space-y-1.5">
              {ALL_RECIPIENT_TAGS.map((t) => (
                <label key={t} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" name="recipients" value={t} defaultChecked={initTags.has(t)} className="w-4 h-4 accent-sky-600" />
                  {RECIPIENT_LABELS[t]}
                </label>
              ))}
            </div>
          </div>
          {err && <p className="text-rose-600 text-sm">{err}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="text-sm text-slate-600 px-4 py-2 hover:bg-slate-50 rounded-lg">ביטול</button>
            <button disabled={pending} className="text-sm bg-emerald-600 text-white rounded-lg px-5 py-2 font-medium hover:bg-emerald-700 disabled:opacity-50">{pending ? "שומר…" : "💾 שמור"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
