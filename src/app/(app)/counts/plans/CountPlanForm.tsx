"use client";

import { useState } from "react";
import { WAREHOUSE_TYPE_SHORT, WAREHOUSE_TYPE_ICON } from "@/lib/rbac";
import type { WarehouseType } from "@/generated/prisma";
import { createCountPlan } from "./actions";

type Holder = { id: string; name: string; kind: string; warehouseType: WarehouseType | null };
type Ref = { id: string; name: string; sku?: string | null };

const DOW = [
  { v: 0, l: "ראשון" }, { v: 1, l: "שני" }, { v: 2, l: "שלישי" },
  { v: 3, l: "רביעי" }, { v: 4, l: "חמישי" }, { v: 5, l: "שישי" }, { v: 6, l: "שבת" },
];
const FREQ_OPTS = [
  { v: 1, l: "יומי" }, { v: 2, l: "כל יומיים" }, { v: 7, l: "שבועי" },
  { v: 14, l: "כל שבועיים" }, { v: 30, l: "חודשי" }, { v: 0, l: "חד-פעמי" },
];
const METHODS = [
  { v: "QUANTITY", l: "כמותי" }, { v: "SERIAL", l: "סריאלי" },
  { v: "LOT", l: "אצוות" }, { v: "KIT", l: "ערכות" },
];

export default function CountPlanForm({ holders, categories, items }: {
  holders: Holder[]; categories: Ref[]; items: Ref[];
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [scopeHolderIds, setScopeHolderIds] = useState<string[]>([]);
  const [scopeCategoryIds, setScopeCategoryIds] = useState<string[]>([]);
  const [scopeItemTypeIds, setScopeItemTypeIds] = useState<string[]>([]);
  const [trackingMethods, setTrackingMethods] = useState<string[]>([]);
  const [frequencyDays, setFrequencyDays] = useState(1);
  const [scheduledTimes, setScheduledTimes] = useState("08:00");
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([]);
  const [graceMinutes, setGraceMinutes] = useState(60);
  const [error, setError] = useState<string | null>(null);

  const toggle = <T extends string | number>(arr: T[], v: T, set: (a: T[]) => void) =>
    arr.includes(v) ? set(arr.filter((x) => x !== v)) : set([...arr, v]);

  async function submit(fd: FormData) {
    setError(null);
    try {
      await createCountPlan(fd);
      // reset
      setName(""); setDescription(""); setScopeHolderIds([]); setScopeCategoryIds([]);
      setScopeItemTypeIds([]); setTrackingMethods([]); setFrequencyDays(1);
      setScheduledTimes("08:00"); setDaysOfWeek([]); setGraceMinutes(60);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="bg-slate-800 text-white rounded-lg px-5 py-2.5 text-sm font-medium hover:bg-slate-900">
        + תכנית ספירה חדשה
      </button>
    );
  }

  const warehouses = holders.filter((h) => h.kind === "WAREHOUSE");
  const companies = holders.filter((h) => h.kind === "COMPANY");

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto">
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 text-white p-5 rounded-t-2xl flex items-center justify-between">
          <div>
            <h3 className="font-bold text-lg">תכנית ספירת מלאי חדשה</h3>
            <p className="text-xs text-slate-300 mt-0.5">מה לספור, איפה, מתי, וכל כמה זמן</p>
          </div>
          <button onClick={() => setOpen(false)} className="text-slate-300 hover:text-white text-2xl leading-none">✕</button>
        </div>

        <form action={submit} className="p-6 space-y-5">
          {error && <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 text-sm text-rose-700">{error}</div>}

          {/* פרטי תכנית */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">שם התכנית *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} name="name" required
              placeholder="ספירה יומית - ארמון" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">תיאור (אופציונלי)</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} name="description"
              placeholder="ספירת רובים יומית בארמון" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>

          {/* היקף — מחסנים/פלוגות */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
            <h4 className="text-sm font-bold text-slate-700 mb-2">📍 איפה? — מחסנים ופלוגות בהיקף</h4>
            <p className="text-xs text-slate-500 mb-3">ריק = כל המחסנים+הפלוגות הפעילים. בחר ספציפיים אם תרצה לצמצם.</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs font-semibold text-slate-600 mb-1">מחסנים</div>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {warehouses.map((h) => (
                    <label key={h.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="scopeHolderIds" value={h.id}
                        checked={scopeHolderIds.includes(h.id)}
                        onChange={() => toggle(scopeHolderIds, h.id, setScopeHolderIds)} />
                      <span>{h.warehouseType ? WAREHOUSE_TYPE_ICON[h.warehouseType] + " " : ""}{h.name}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-600 mb-1">פלוגות</div>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {companies.map((h) => (
                    <label key={h.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="scopeHolderIds" value={h.id}
                        checked={scopeHolderIds.includes(h.id)}
                        onChange={() => toggle(scopeHolderIds, h.id, setScopeHolderIds)} />
                      <span>🪖 {h.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* היקף — מה סופרים */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
            <h4 className="text-sm font-bold text-slate-700 mb-2">📦 מה? — היקף הפריטים</h4>
            <p className="text-xs text-slate-500 mb-3">ריק בכל השלוש = כל הפריטים. אפשר לחתוך לפי קטגוריה, פריטים ספציפיים, או שיטת מעקב.</p>

            <div className="space-y-3">
              <div>
                <div className="text-xs font-semibold text-slate-600 mb-1">שיטת מעקב</div>
                <div className="flex gap-3 flex-wrap">
                  {METHODS.map((m) => (
                    <label key={m.v} className="flex items-center gap-1.5 text-sm">
                      <input type="checkbox" name="trackingMethods" value={m.v}
                        checked={trackingMethods.includes(m.v)}
                        onChange={() => toggle(trackingMethods, m.v, setTrackingMethods)} />
                      {m.l}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-slate-600 mb-1">קטגוריות</div>
                <div className="flex gap-2 flex-wrap max-h-24 overflow-y-auto">
                  {categories.map((c) => (
                    <label key={c.id} className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full border cursor-pointer ${scopeCategoryIds.includes(c.id) ? "bg-blue-100 border-blue-400 text-blue-800" : "bg-white border-slate-300"}`}>
                      <input type="checkbox" name="scopeCategoryIds" value={c.id}
                        checked={scopeCategoryIds.includes(c.id)}
                        onChange={() => toggle(scopeCategoryIds, c.id, setScopeCategoryIds)}
                        className="hidden" />
                      {c.name}
                    </label>
                  ))}
                </div>
              </div>

              <details>
                <summary className="text-xs font-semibold text-slate-600 cursor-pointer hover:text-slate-800">פריטים ספציפיים (אופציונלי) — לחץ להרחבה</summary>
                <div className="mt-2 max-h-40 overflow-y-auto border border-slate-200 rounded p-2 bg-white space-y-1">
                  {items.map((i) => (
                    <label key={i.id} className="flex items-center gap-2 text-xs">
                      <input type="checkbox" name="scopeItemTypeIds" value={i.id}
                        checked={scopeItemTypeIds.includes(i.id)}
                        onChange={() => toggle(scopeItemTypeIds, i.id, setScopeItemTypeIds)} />
                      <span>{i.name}</span>
                      {i.sku && <span className="font-mono text-slate-400">{i.sku}</span>}
                    </label>
                  ))}
                </div>
              </details>
            </div>
          </div>

          {/* תזמון */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <h4 className="text-sm font-bold text-amber-900 mb-3">⏰ מתי? — תזמון מחזורי</h4>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">תדירות</label>
                <select value={frequencyDays} onChange={(e) => setFrequencyDays(parseInt(e.target.value))}
                  name="frequencyDays" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
                  {FREQ_OPTS.map((f) => <option key={f.v} value={f.v}>{f.l}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">חסד עד התראה (דקות)</label>
                <input type="number" min={0} value={graceMinutes} onChange={(e) => setGraceMinutes(parseInt(e.target.value) || 0)}
                  name="graceMinutes" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
            </div>

            <div className="mb-3">
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                שעות ביום (מופרדות בפסיק, ניתן יותר מאחת לדוגמה: 08:00, 14:00, 20:00)
              </label>
              <input value={scheduledTimes} onChange={(e) => setScheduledTimes(e.target.value)}
                name="scheduledTimes" placeholder="08:00, 20:00"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
            </div>

            <div>
              <div className="text-xs font-semibold text-slate-600 mb-1">ימי שבוע (ריק = כל הימים)</div>
              <div className="flex gap-1.5 flex-wrap">
                {DOW.map((d) => (
                  <label key={d.v} className={`px-3 py-1 rounded-full text-xs border cursor-pointer ${daysOfWeek.includes(d.v) ? "bg-amber-200 border-amber-400 text-amber-900" : "bg-white border-slate-300"}`}>
                    <input type="checkbox" name="daysOfWeek" value={d.v}
                      checked={daysOfWeek.includes(d.v)}
                      onChange={() => toggle(daysOfWeek, d.v, setDaysOfWeek)}
                      className="hidden" />
                    {d.l}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-slate-300 px-5 py-2 text-sm hover:bg-slate-50">ביטול</button>
            <button className="bg-emerald-600 text-white rounded-lg px-5 py-2 text-sm font-medium hover:bg-emerald-700">
              שמור תכנית
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
