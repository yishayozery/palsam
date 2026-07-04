"use client";

import { useState } from "react";
import { WAREHOUSE_TYPE_ICON } from "@/lib/rbac";
import type { WarehouseType } from "@/generated/prisma";
import { createCountPlan } from "./actions";

type Holder = { id: string; name: string; kind: string; warehouseType: WarehouseType | null };
type Ref = { id: string; name: string; sku?: string | null };
type Category = { id: string; name: string; warehouseType?: WarehouseType | string | null };
type UserOption = { id: string; name: string; role: string; holderName: string | null };

const DOW = [
  { v: 0, l: "ראשון" }, { v: 1, l: "שני" }, { v: 2, l: "שלישי" },
  { v: 3, l: "רביעי" }, { v: 4, l: "חמישי" }, { v: 5, l: "שישי" }, { v: 6, l: "שבת" },
];
const FREQ_OPTS = [
  { v: 0, l: "חד-פעמי" },
  { v: 1, l: "יומי" }, { v: 2, l: "כל יומיים" }, { v: 7, l: "שבועי" },
  { v: 14, l: "כל שבועיים" }, { v: 30, l: "חודשי" },
];
// ערכות (KIT) הן להחתמה מהירה בלבד — לא רלוונטי לספירה.
const METHODS = [
  { v: "QUANTITY", l: "כמותי" }, { v: "SERIAL", l: "סריאלי" },
  { v: "LOT", l: "אצוות" },
];

export default function CountPlanForm({ holders, categories, items, users = [], buttonLabel, buttonClass }: {
  holders: Holder[]; categories: Category[]; items: Ref[]; users?: UserOption[];
  buttonLabel?: string; buttonClass?: string;
}) {
  const [responsibleUserId, setResponsibleUserId] = useState("");
  void setResponsibleUserId;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [scopeHolderIds, setScopeHolderIds] = useState<string[]>([]);
  const [scopeCategoryIds, setScopeCategoryIds] = useState<string[]>([]);
  const [scopeItemTypeIds, setScopeItemTypeIds] = useState<string[]>([]);
  const [trackingMethods, setTrackingMethods] = useState<string[]>([]);
  const [frequencyDays, setFrequencyDays] = useState(0);
  const [scheduledTimes, setScheduledTimes] = useState("08:00");
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([]);
  const [graceMinutes, setGraceMinutes] = useState(60);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [freezeState, setFreezeState] = useState(false);
  const [isBlind, setIsBlind] = useState(false);
  const [signOnComplete, setSignOnComplete] = useState(false);
  const [correctByReporter, setCorrectByReporter] = useState(false);
  const [countScope, setCountScope] = useState("WAREHOUSE_STOCK");
  const [startNow, setStartNow] = useState(true);
  const [completionHours, setCompletionHours] = useState(24);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isOneTime = frequencyDays === 0;

  const toggle = <T extends string | number>(arr: T[], v: T, set: (a: T[]) => void) =>
    arr.includes(v) ? set(arr.filter((x) => x !== v)) : set([...arr, v]);

  async function submit(fd: FormData) {
    setError(null);
    setSubmitting(true);
    try {
      await createCountPlan(fd);
      setName(""); setDescription(""); setScopeHolderIds([]); setScopeCategoryIds([]);
      setScopeItemTypeIds([]); setTrackingMethods([]); setFrequencyDays(0);
      setScheduledTimes("08:00"); setDaysOfWeek([]); setGraceMinutes(60);
      setStartDate(""); setEndDate(""); setFreezeState(false); setIsBlind(false);
      setSignOnComplete(false); setCorrectByReporter(false);
      setCountScope("WAREHOUSE_STOCK"); setStartNow(true);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className={buttonClass || "bg-slate-800 text-white rounded-lg px-5 py-2.5 text-sm font-medium hover:bg-slate-900"}>
        {buttonLabel || "+ ספירה חדשה"}
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
            <h3 className="font-bold text-lg">{isOneTime ? "ספירת מלאי חדשה" : "תכנית ספירה מחזורית"}</h3>
            <p className="text-xs text-slate-300 mt-0.5">מה לספור, איפה{isOneTime ? "" : ", מתי, וכל כמה זמן"}</p>
          </div>
          <button onClick={() => setOpen(false)} className="text-slate-300 hover:text-white text-2xl leading-none">✕</button>
        </div>

        <form action={submit} className="p-6 space-y-5">
          {error && <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 text-sm text-rose-700">{error}</div>}

          {/* תדירות — בחירה ראשונה */}
          <div className="flex gap-2 flex-wrap">
            {FREQ_OPTS.map((f) => (
              <button key={f.v} type="button"
                onClick={() => setFrequencyDays(f.v)}
                className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${frequencyDays === f.v ? "bg-slate-800 text-white border-slate-800" : "bg-white border-slate-300 hover:bg-slate-50"}`}>
                {f.l}
              </button>
            ))}
          </div>
          <input type="hidden" name="frequencyDays" value={frequencyDays} />

          {/* שם + תיאור */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">שם {isOneTime ? "הספירה" : "התכנית"} *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} name="name" required
              placeholder={isOneTime ? "ספירת רובים — ארמון" : "ספירה יומית — ארמון"} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">👤 אחראי ספירה (רואה סטטוס כל המשימות + מייצא דוח)</label>
            <select value={responsibleUserId} onChange={(e) => setResponsibleUserId(e.target.value)} name="responsibleUserId"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white mb-3">
              <option value="">— אני (ברירת מחדל) —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} · {u.role === "BATTALION_ADMIN" ? "מפ״מ" : u.role === "WAREHOUSE_MANAGER" ? "קצין מחסן" : "רס״פ"}{u.holderName ? ` · ${u.holderName}` : ""}
                </option>
              ))}
            </select>
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

              {(() => {
                const selectedWarehouseTypes = new Set(
                  scopeHolderIds.length > 0
                    ? holders.filter((h) => scopeHolderIds.includes(h.id) && h.warehouseType).map((h) => h.warehouseType as string)
                    : []
                );
                const visibleCategories = selectedWarehouseTypes.size > 0
                  ? categories.filter((c) => c.warehouseType && selectedWarehouseTypes.has(c.warehouseType as string))
                  : categories;
                return (
                  <div>
                    <div className="text-xs font-semibold text-slate-600 mb-1">
                      קטגוריות
                      {selectedWarehouseTypes.size > 0 && (
                        <span className="text-[10px] text-blue-600 font-normal mr-1">
                          (מסונן לפי {selectedWarehouseTypes.size} מחסנים שנבחרו)
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2 flex-wrap max-h-24 overflow-y-auto">
                      {visibleCategories.length === 0 ? (
                        <p className="text-xs text-slate-400 italic">אין קטגוריות תואמות למחסנים שנבחרו</p>
                      ) : visibleCategories.map((c) => (
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
                );
              })()}

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

          {/* הקפאת מצב */}
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" name="freezeState" checked={freezeState}
                onChange={(e) => setFreezeState(e.target.checked)}
                className="w-4 h-4 rounded accent-purple-600" />
              <div>
                <span className="text-sm font-semibold text-purple-900">🔒 הקפאת מצב</span>
                <p className="text-xs text-purple-700 mt-0.5">
                  מקפיא את מצב המלאי ברגע הספירה. כולל אימות חתימות חיילים + מחסנים + פלוגות.
                </p>
              </div>
            </label>
          </div>

          {/* ספירה עיוורת */}
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" name="isBlind" checked={isBlind}
                onChange={(e) => setIsBlind(e.target.checked)}
                className="w-4 h-4 rounded accent-indigo-600" />
              <div>
                <span className="text-sm font-semibold text-indigo-900">🔍 ספירה עיוורת</span>
                <p className="text-xs text-indigo-700 mt-0.5">
                  הסופר מקליד כמויות ומספרים סריאליים בלי לראות את הצפוי. המערכת משווה אחרי ההגשה.
                </p>
              </div>
            </label>
          </div>

          {/* ספירת החתמה */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" name="signOnComplete" checked={signOnComplete}
                onChange={(e) => setSignOnComplete(e.target.checked)}
                className="w-4 h-4 rounded accent-emerald-600" />
              <div>
                <span className="text-sm font-semibold text-emerald-900">✍️ ספירת החתמה</span>
                <p className="text-xs text-emerald-700 mt-0.5">
                  הדיווח מהווה החתמה — הציוד שהחייל/פלוגה מאשר/ת נחתם עליו/ה בסיום (בלי תנועת מלאי).
                </p>
              </div>
            </label>
          </div>

          {/* מי יכול לתקן */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" name="correctByReporter" checked={correctByReporter}
                onChange={(e) => setCorrectByReporter(e.target.checked)}
                className="w-4 h-4 rounded accent-slate-600" />
              <div>
                <span className="text-sm font-semibold text-slate-800">✏️ המדווח בקצה יכול לתקן</span>
                <p className="text-xs text-slate-600 mt-0.5">
                  מסומן — החייל/פלוגה יכול/ה לפתוח מחדש ולתקן את הדיווח. לא מסומן — רק מקים הספירה מתקן (במסך פערים).
                </p>
              </div>
            </label>
          </div>

          {/* מי סופר — scope */}
          <div className="bg-sky-50 border border-sky-200 rounded-lg p-4">
            <h4 className="text-sm font-bold text-sky-900 mb-2">👥 מי סופר?</h4>
            <input type="hidden" name="countScope" value={countScope} />
            <div className="flex gap-2 flex-wrap">
              {[
                { v: "WAREHOUSE_STOCK", l: "מלאי מחסן", desc: "רק פריטים שנמצאים במחסן" },
                { v: "DISTRIBUTED", l: "ציוד מפוזר", desc: "ציוד שהוחתם לפלוגות וחיילים" },
                { v: "BOTH", l: "שניהם", desc: "מחסן + ציוד מפוזר" },
              ].map((s) => (
                <button key={s.v} type="button" onClick={() => setCountScope(s.v)}
                  className={`text-right p-2.5 rounded-lg border text-xs transition flex-1 min-w-[100px] ${
                    countScope === s.v ? "border-sky-400 bg-sky-100 text-sky-900" : "border-slate-200 bg-white hover:bg-slate-50 text-slate-600"
                  }`}>
                  <div className="font-semibold">{s.l}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{s.desc}</div>
                </button>
              ))}
            </div>
            {countScope !== "WAREHOUSE_STOCK" && (
              <p className="text-xs text-sky-700 mt-2 bg-sky-100 rounded p-2">
                הספירה תרד לחיילים בקצה שהוחתמו על ציוד. הם יקבלו הודעת טלגרם עם לינק לדיווח.
                מפקד הפלוגה יראה את החלק שלו ויוכל לדווח במקום חיילים.
              </p>
            )}
          </div>

          {/* תזמון — רק אם לא חד-פעמי */}
          {!isOneTime && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <h4 className="text-sm font-bold text-amber-900 mb-3">⏰ תזמון מחזורי</h4>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">חסד עד התראה (דקות)</label>
                  <input type="number" min={0} value={graceMinutes} onChange={(e) => setGraceMinutes(parseInt(e.target.value) || 0)}
                    name="graceMinutes" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">תאריך התחלה (אופציונלי)</label>
                  <input type="date" name="startDate" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white" />
                  <p className="text-[10px] text-slate-500 mt-0.5">אם ריק — מתחיל מיד</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">תאריך סיום (אופציונלי)</label>
                  <input type="date" name="endDate" value={endDate} onChange={(e) => setEndDate(e.target.value)}
                    min={startDate || undefined}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white" />
                  <p className="text-[10px] text-slate-500 mt-0.5">אם ריק — ללא הגבלה</p>
                </div>
              </div>

              <div className="mb-3">
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  שעות ביום (מופרדות בפסיק, לדוגמה: 08:00, 14:00, 20:00)
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
          )}

          {/* חד-פעמי — התחל מיד */}
          {isOneTime && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" name="startNow" checked={startNow}
                  onChange={(e) => setStartNow(e.target.checked)}
                  className="w-4 h-4 rounded accent-emerald-600" />
                <div>
                  <span className="text-sm font-semibold text-emerald-900">🚀 התחל ספירה מיד</span>
                  <p className="text-xs text-emerald-700 mt-0.5">
                    ייצור משימות לכל מחזיק בהיקף ויפתח את הספירה הראשונה.
                  </p>
                </div>
              </label>
              <div className="mt-3 flex items-center gap-2 pt-3 border-t border-emerald-200">
                <label className="text-xs font-semibold text-emerald-900">⏰ זמן גג לביצוע:</label>
                <input type="number" min={1} value={completionHours}
                  onChange={(e) => setCompletionHours(Math.max(1, parseInt(e.target.value) || 24))}
                  className="w-20 rounded-lg border border-emerald-300 px-2 py-1 text-sm" />
                <span className="text-xs text-emerald-700">שעות (יופיע בהודעה לחיילים)</span>
              </div>
            </div>
          )}

          {/* graceMinutes לחד-פעמי = זמן הגג לביצוע */}
          {isOneTime && <input type="hidden" name="graceMinutes" value={completionHours * 60} />}

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-slate-300 px-5 py-2 text-sm hover:bg-slate-50">ביטול</button>
            <button disabled={submitting} className="bg-emerald-600 text-white rounded-lg px-5 py-2 text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
              {submitting ? "שומר..." : isOneTime && startNow ? "התחל ספירה" : "שמור תכנית"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
