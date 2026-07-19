"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";
import { upsertForecastStatus, deleteForecastStatus, toggleForecastStatus } from "./actions";

type FStatus = { id: string; name: string; icon: string | null; color: string; inService: boolean; sortOrder: number; active: boolean };

/**
 * 📅 סטטוסי תחזית הגעה — שכבת הצווים (לפני התעסוקה), נפרדת מסטטוסי הנוכחות.
 * הדגל "בשמ״פ" הוא הבינארי שהגדוד סופר; שם הסטטוס הוא הסיבה.
 */
export default function ForecastStatusSettings({ statuses }: { statuses: FStatus[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<FStatus | null>(null);
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(fd: FormData) {
    setBusy(true); setErr(null);
    const r = await upsertForecastStatus(fd);
    setBusy(false);
    if (r.error) { setErr(r.error); return; }
    setEditing(null); setAdding(false);
    router.refresh();
  }

  async function remove(id: string, name: string) {
    if (!confirm(`למחוק את "${name}"?`)) return;
    const r = await deleteForecastStatus(id);
    if (r.error) { setErr(r.error); return; }
    router.refresh();
  }

  const inService = statuses.filter((s) => s.inService);
  const absent = statuses.filter((s) => !s.inService);

  return (
    <Card className="p-4 mb-4">
      <div className="flex items-center gap-2 mb-1 flex-wrap">
        <h3 className="font-bold text-slate-800 text-sm">📅 סטטוסי תחזית הגעה</h3>
        <button onClick={() => { setAdding(true); setEditing(null); setErr(null); }}
          className="mr-auto bg-blue-700 hover:bg-blue-800 text-white rounded-lg px-3 py-1.5 text-xs font-medium">
          ➕ סטטוס תחזית
        </button>
      </div>
      <p className="text-xs text-slate-500 mb-3">
        שלב הצווים — לפני התעסוקה. נפרד מסטטוסי הנוכחות שלמטה. הגדוד סופר <b>בשמ״פ / לא בשמ״פ</b>, ושם הסטטוס הוא הסיבה.
        {" "}חייל שלא סומן נחשב <b>בשמ״פ</b>.
      </p>

      {err && <p className="text-rose-600 text-sm mb-2">{err}</p>}

      {(adding || editing) && (
        <form action={save} className="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-3 space-y-2">
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <input name="name" defaultValue={editing?.name ?? ""} placeholder="שם (למשל: חול)" required
              className="border border-slate-300 rounded-lg px-2 py-2 text-sm col-span-2" />
            <input name="icon" defaultValue={editing?.icon ?? ""} placeholder="אימוג׳י"
              className="border border-slate-300 rounded-lg px-2 py-2 text-sm" />
            <input name="color" type="color" defaultValue={editing?.color ?? "#64748b"}
              className="border border-slate-300 rounded-lg px-1 py-1 h-[38px] w-full" />
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <select name="inService" defaultValue={String(editing?.inService ?? false)}
              className="border border-slate-300 rounded-lg px-2 py-2 text-sm bg-white">
              <option value="true">🟢 נחשב בשמ״פ</option>
              <option value="false">🔴 לא בשמ״פ</option>
            </select>
            <label className="text-xs text-slate-600 flex items-center gap-1.5">
              סדר
              <input name="sortOrder" type="number" defaultValue={editing?.sortOrder ?? 0}
                className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm w-20" />
            </label>
            <button disabled={busy} className="mr-auto bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-medium">
              {busy ? "שומר…" : "💾 שמור"}
            </button>
            <button type="button" onClick={() => { setAdding(false); setEditing(null); }}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm">ביטול</button>
          </div>
        </form>
      )}

      {statuses.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-4">לא הוגדרו סטטוסי תחזית.</p>
      ) : (
        <div className="space-y-3">
          {[{ label: "🟢 בשמ״פ", list: inService }, { label: "🔴 לא בשמ״פ", list: absent }].map((grp) => grp.list.length > 0 && (
            <div key={grp.label}>
              <div className="text-[11px] font-bold text-slate-500 mb-1">{grp.label}</div>
              <div className="space-y-1">
                {grp.list.map((s) => (
                  <div key={s.id} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 border ${s.active ? "bg-white border-slate-200" : "bg-slate-50 border-slate-200 opacity-60"}`}>
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ background: s.color }} />
                    <span className="text-sm flex-1">{s.icon} {s.name}</span>
                    <span className="text-[10px] text-slate-400">סדר {s.sortOrder}</span>
                    <button onClick={() => { setEditing(s); setAdding(false); setErr(null); }} className="text-xs text-blue-600 hover:underline">עריכה</button>
                    <button onClick={async () => { await toggleForecastStatus(s.id, !s.active); router.refresh(); }}
                      className="text-xs text-slate-500 hover:underline">{s.active ? "כבה" : "הפעל"}</button>
                    <button onClick={() => remove(s.id, s.name)} className="text-xs text-rose-600 hover:underline">מחק</button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
