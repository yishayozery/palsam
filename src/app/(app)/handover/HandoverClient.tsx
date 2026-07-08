"use client";

import { useState } from "react";
import { Card } from "@/components/ui";
import { createHandover, toggleHandoverItem, addHandoverItem, completeHandover, deleteHandover } from "./actions";

type Item = { id: string; category: string; label: string; done: boolean };
type Handover = {
  id: string; companyName: string; fromRound: number | null; toRound: number | null;
  title: string | null; status: string; createdAt: string; items: Item[];
};
type Company = { id: string; name: string };

const CAT_ICON: Record<string, string> = { EQUIPMENT: "✍️", GAP: "⚠️", COUNT: "🔢", DISPATCH: "🚗", MANUAL: "📝" };

export default function HandoverClient({ companies, handovers }: { companies: Company[]; handovers: Handover[] }) {
  const [open, setOpen] = useState(false);
  const [addingTo, setAddingTo] = useState<string | null>(null);

  return (
    <div>
      {/* יצירת העברת משמרת */}
      {!open ? (
        <button onClick={() => setOpen(true)} className="mb-4 bg-slate-800 text-white rounded-lg px-5 py-2.5 text-sm font-medium hover:bg-slate-900">
          + העברת משמרת חדשה
        </button>
      ) : (
        <Card className="p-4 mb-4">
          <form action={createHandover} className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">פלוגה *</label>
                <select name="companyId" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">סבב יוצא</label>
                <input name="fromRound" type="number" min={1} placeholder="מס'" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">סבב נכנס</label>
                <input name="toRound" type="number" min={1} placeholder="מס'" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">כותרת (אופציונלי)</label>
                <input name="title" placeholder="למשל: החלפת סבב יולי" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
            </div>
            <p className="text-xs text-slate-500">ייווצר צ'ק ליסט ריק — הוסיפו את משימות ההעברה ידנית בכרטיס שייפתח.</p>
            <div className="flex gap-2">
              <button className="bg-emerald-600 text-white rounded-lg px-5 py-2 text-sm font-medium hover:bg-emerald-700">צור צ'ק ליסט</button>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-slate-300 px-5 py-2 text-sm">ביטול</button>
            </div>
          </form>
        </Card>
      )}

      {handovers.length === 0 ? (
        <Card className="p-8 text-center text-slate-400 text-sm">אין העברות משמרת עדיין</Card>
      ) : (
        <div className="space-y-4">
          {handovers.map((h) => {
            const done = h.items.filter((i) => i.done).length;
            const total = h.items.length;
            const pct = total > 0 ? Math.round((done / total) * 100) : 0;
            const isDone = h.status === "COMPLETED";
            return (
              <Card key={h.id} className={`p-4 ${isDone ? "bg-slate-50" : ""}`}>
                <div className="flex items-start justify-between gap-2 flex-wrap mb-2">
                  <div>
                    <div className="font-bold text-slate-800">
                      {h.companyName}
                      {(h.fromRound != null || h.toRound != null) && (
                        <span className="text-sm font-normal text-slate-500 mr-2">🔄 סבב {h.fromRound ?? "?"} ← {h.toRound ?? "?"}</span>
                      )}
                    </div>
                    {h.title && <div className="text-xs text-slate-500">{h.title}</div>}
                  </div>
                  <div className="flex items-center gap-2">
                    {isDone ? (
                      <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-1 rounded-full">✅ הושלם</span>
                    ) : (
                      <span className="text-xs font-medium text-slate-600">{done}/{total}</span>
                    )}
                    <form action={deleteHandover}><input type="hidden" name="id" value={h.id} /><button className="text-xs text-rose-400 hover:text-rose-600" title="מחק">🗑️</button></form>
                  </div>
                </div>

                {total > 0 && (
                  <div className="w-full h-1.5 bg-slate-100 rounded-full mb-3 overflow-hidden">
                    <div className={`h-full ${pct === 100 ? "bg-emerald-500" : "bg-blue-500"}`} style={{ width: `${pct}%` }} />
                  </div>
                )}

                <div className="space-y-1.5">
                  {h.items.map((it) => (
                    <form key={it.id} action={toggleHandoverItem} className={`flex items-center gap-2 text-sm ${it.done ? "opacity-50" : ""}`}>
                      <input type="hidden" name="id" value={it.id} />
                      <button disabled={isDone} className={`shrink-0 w-5 h-5 rounded border flex items-center justify-center ${it.done ? "bg-emerald-500 border-emerald-500 text-white" : "bg-white border-slate-300"}`}>
                        {it.done ? "✓" : ""}
                      </button>
                      <span className="shrink-0">{CAT_ICON[it.category] ?? "•"}</span>
                      <span className={it.done ? "line-through text-slate-400" : ""}>{it.label}</span>
                    </form>
                  ))}
                </div>

                {!isDone && (
                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    {addingTo === h.id ? (
                      <form action={addHandoverItem} className="flex items-center gap-1.5 flex-1" onSubmit={() => setAddingTo(null)}>
                        <input type="hidden" name="handoverId" value={h.id} />
                        <input name="label" required autoFocus placeholder="פריט ידני..." className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
                        <button className="text-xs bg-slate-800 text-white rounded px-3 py-1.5">הוסף</button>
                        <button type="button" onClick={() => setAddingTo(null)} className="text-xs text-slate-400">✕</button>
                      </form>
                    ) : (
                      <button onClick={() => setAddingTo(h.id)} className="text-xs text-blue-600 hover:underline">+ פריט ידני</button>
                    )}
                    <form action={completeHandover} className="mr-auto">
                      <input type="hidden" name="id" value={h.id} />
                      <button className="text-xs bg-emerald-600 text-white rounded-lg px-4 py-1.5 font-medium hover:bg-emerald-700">✅ סיים העברה</button>
                    </form>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
