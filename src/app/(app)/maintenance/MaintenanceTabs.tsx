"use client";

import { useState, useMemo, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, Badge, EmptyState } from "@/components/ui";
import { saveVehicleMaintenance, reportVehicleFault, advanceVehicleFault, addVehicleFaultNote, sendFaultToSoldier } from "./actions";
import { FAULT_STAGES, stageInfo, stageIndex, CLOSED_STAGE } from "@/lib/vehicleFault";

export type Maint = { serviceType: string | null; location: string | null; hours: string | null; contactName: string | null; contactPhone: string | null; notes: string | null };
export type FaultEvent = { stage: string; note: string | null; by: string | null; at: string };
export type Fault = { id: string; faultNumber: number; stage: string; description: string; categoryName: string | null; hasSignedSoldier: boolean; events: FaultEvent[] };
export type FaultCat = { id: string; name: string };
export type VehRow = {
  id: string; num: number; typeName: string; serial: string;
  statusName: string; statusTone: "ok" | "wear" | "loss";
  holderLabel: string; atTana: boolean; sentByOfficer: boolean;
  signedSoldier: string | null; physicalLocation: string | null; reason: string | null;
  recurringDays: number | null;
  nextMaintDate: string | null; maint: Maint | null; fault: Fault | null;
};
export type TypeRow = { typeName: string; total: number; ok: number; defectiveAtTana: number; signedToSoldier: number };
export type HistEvent = { date: string; kind: "in" | "out"; from: string; to: string; reason: string | null; transferId: string; gapDays: number | null };
export type VehHist = { id: string; num: number; typeName: string; serial: string; events: HistEvent[]; hasRecurring: boolean };

const toneCls = { ok: "bg-emerald-100 text-emerald-800", wear: "bg-amber-100 text-amber-800", loss: "bg-rose-100 text-rose-800" };
function fmt(d: string) { return new Date(d).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); }

function daysUntil(d: string) { return Math.ceil((new Date(d + "T00:00:00").getTime() - Date.now()) / 86400000); }

export default function MaintenanceTabs({ vehicles, byType, history, canEdit, faultCategories }: { vehicles: VehRow[]; byType: TypeRow[]; history: VehHist[]; canEdit: boolean; faultCategories: FaultCat[] }) {
  const [tab, setTab] = useState<"all" | "type" | "history">("all");
  const [q, setQ] = useState("");
  const [hq, setHq] = useState("");
  const [onlyRepair, setOnlyRepair] = useState(false);
  const [compFilter, setCompFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [editVeh, setEditVeh] = useState<VehRow | null>(null);
  const [faultVeh, setFaultVeh] = useState<VehRow | null>(null);
  const [reportVeh, setReportVeh] = useState<VehRow | null>(null);

  const compOptions = useMemo(() => [...new Set(vehicles.map((v) => v.holderLabel))].sort((a, b) => a.localeCompare(b, "he")), [vehicles]);
  const statusOptions = useMemo(() => [...new Set(vehicles.map((v) => v.statusName))].sort((a, b) => a.localeCompare(b, "he")), [vehicles]);
  // "בטיפול" = נמצא בטנא וגם לא תקין
  const isInRepair = (v: VehRow) => v.atTana && v.statusTone !== "ok";
  const inRepairCount = useMemo(() => vehicles.filter(isInRepair).length, [vehicles]);
  const filtered = useMemo(() => {
    const s = q.trim();
    return vehicles.filter((v) =>
      (!onlyRepair || isInRepair(v)) &&
      (!compFilter || v.holderLabel === compFilter) &&
      (!statusFilter || v.statusName === statusFilter) &&
      (!catFilter || v.fault?.categoryName === catFilter) &&
      (!s || v.typeName.includes(s) || v.serial.includes(s) || v.holderLabel.includes(s) || (v.signedSoldier ?? "").includes(s) || v.statusName.includes(s) || (v.fault ? `#${v.fault.faultNumber}`.includes(s) || v.fault.description.includes(s) : false)),
    );
  }, [vehicles, q, onlyRepair, compFilter, statusFilter, catFilter]);

  const [histOnlyRecurring, setHistOnlyRecurring] = useState(false);
  // שיטוח היסטוריה לשורות + סינון (מ.ס./סוג/סיבה + חזרות מהירות)
  const histRows = useMemo(() => {
    const s = hq.trim();
    const rows = history.flatMap((h) => h.events.map((e) => ({ num: h.num, typeName: h.typeName, serial: h.serial, ...e })));
    return rows
      .filter((r) => (!histOnlyRecurring || r.gapDays != null) && (!s || r.serial.includes(s) || r.typeName.includes(s) || (r.reason ?? "").includes(s)))
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [history, hq, histOnlyRecurring]);

  const tabCls = (id: typeof tab) => `px-4 py-2 text-sm font-medium whitespace-nowrap ${tab === id ? "bg-slate-800 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`;

  return (
    <div>
      <div className="inline-flex rounded-lg border border-slate-300 overflow-hidden mb-3 max-w-full overflow-x-auto">
        <button onClick={() => setTab("all")} className={tabCls("all")}>🚙 כל הרכבים ({vehicles.length})</button>
        <button onClick={() => setTab("type")} className={tabCls("type")}>📊 לפי סוג</button>
        <button onClick={() => setTab("history")} className={tabCls("history")}>📜 היסטוריית טיפולים</button>
      </div>

      {/* ===== כל הרכבים ===== */}
      {tab === "all" && (
        <>
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 חיפוש חופשי…"
              className="flex-1 min-w-[150px] border border-slate-300 rounded-lg px-3 py-2 text-sm" />
            <select value={compFilter} onChange={(e) => setCompFilter(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-2 text-sm bg-white">
              <option value="">כל השייכות</option>
              {compOptions.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-2 text-sm bg-white">
              <option value="">כל הסטטוסים</option>
              {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-2 text-sm bg-white">
              <option value="">כל קטגוריות התקלה</option>
              {faultCategories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
            <label className={`inline-flex items-center gap-1.5 text-sm rounded-lg px-3 py-2 cursor-pointer border ${onlyRepair ? "bg-orange-100 border-orange-300 text-orange-800 font-medium" : "bg-white border-slate-300 text-slate-600"}`}>
              <input type="checkbox" checked={onlyRepair} onChange={(e) => setOnlyRepair(e.target.checked)} className="accent-orange-600" />
              🔧 רק בטיפול ({inRepairCount})
            </label>
            {(compFilter || statusFilter || catFilter || onlyRepair || q) && <button onClick={() => { setQ(""); setCompFilter(""); setStatusFilter(""); setCatFilter(""); setOnlyRepair(false); }} className="text-xs text-slate-500 hover:text-rose-600 underline">נקה</button>}
            <span className="text-xs text-slate-400">{filtered.length} רכבים</span>
          </div>
          <Card>
            {filtered.length === 0 ? <EmptyState>אין רכבים תואמים</EmptyState> : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 z-10"><tr className="bg-slate-100 text-slate-500 text-xs [&>th]:sticky [&>th]:top-0 [&>th]:bg-slate-100">
                    <th className="px-2 py-2 text-center w-10">#</th><th className="px-3 py-2 text-right">רכב</th><th className="px-3 py-2 text-right">מ.ס.</th>
                    <th className="px-3 py-2 text-right">סטטוס</th><th className="px-3 py-2 text-right">🔧 תקלה/טיפול</th><th className="px-3 py-2 text-right">שייכות</th><th className="px-3 py-2 text-right">חייל חתום</th>
                    <th className="px-3 py-2 text-right">מיקום</th><th className="px-3 py-2 text-right">🗓️ טיפול הבא</th><th className="px-3 py-2 text-right">תקלה אחרונה</th>
                  </tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {filtered.map((v) => (
                      <tr key={v.id} className={v.atTana ? "bg-orange-50" : ""}>
                        <td className="px-2 py-2 text-center text-slate-400 font-mono">{v.num}</td>
                        <td className="px-3 py-2 font-medium whitespace-nowrap">🚙 {v.typeName}
                          {v.recurringDays != null && <span title={`חזר לטנא תוך ${v.recurringDays} ימים מהתיקון הקודם`} className="mr-1 text-[10px] bg-rose-600 text-white rounded px-1.5 py-0.5 font-bold">🔁 חזרה {v.recurringDays}י׳</span>}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">{v.serial}</td>
                        <td className="px-3 py-2"><Badge className={toneCls[v.statusTone]}>{v.statusName}</Badge></td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {v.fault ? (
                            <button onClick={() => setFaultVeh(v)} className="inline-flex items-center gap-1 hover:opacity-80">
                              <span className="text-[10px] font-mono text-slate-400">#{v.fault.faultNumber}</span>
                              <Badge className={stageInfo(v.fault.stage).tone}>{stageInfo(v.fault.stage).short}</Badge>
                            </button>
                          ) : canEdit ? (
                            <button onClick={() => setReportVeh(v)} className="text-xs text-rose-600 border border-rose-200 rounded px-2 py-0.5 hover:bg-rose-50">＋ דיווח תקלה</button>
                          ) : <span className="text-slate-300 text-xs">—</span>}
                        </td>
                        <td className="px-3 py-2 text-xs whitespace-nowrap">{v.atTana ? <span className="text-orange-700 font-medium">🔧 בטנא{v.sentByOfficer && <span className="text-[10px] text-blue-700 mr-1">(קצין רכב)</span>}</span> : v.holderLabel}</td>
                        <td className="px-3 py-2 text-xs text-blue-700 whitespace-nowrap">{v.signedSoldier ?? "—"}</td>
                        <td className="px-3 py-2 text-xs text-slate-600 whitespace-nowrap">{v.physicalLocation ?? "—"}</td>
                        <td className="px-3 py-2 text-xs whitespace-nowrap">
                          {(() => {
                            const du = v.nextMaintDate ? daysUntil(v.nextMaintDate) : null;
                            const tone = du == null ? "text-slate-400" : du < 0 ? "text-rose-600 font-bold" : du <= 5 ? "text-amber-600 font-bold" : "text-slate-600";
                            return (
                              <button onClick={() => canEdit && setEditVeh(v)} disabled={!canEdit} className={`${tone} ${canEdit ? "hover:underline" : "cursor-default"}`}
                                title={v.maint?.location ? `מוסך: ${v.maint.location}${v.maint.contactName ? ` · ${v.maint.contactName}` : ""}` : ""}>
                                {v.nextMaintDate ? <>{v.nextMaintDate}{du != null && <span className="text-[10px]"> ({du < 0 ? `${-du}י׳ באיחור` : du === 0 ? "היום" : `עוד ${du}י׳`})</span>}</> : (canEdit ? "＋ הגדר" : "—")}
                              </button>
                            );
                          })()}
                        </td>
                        <td className="px-3 py-2 text-xs text-rose-700 max-w-[220px] truncate"><span title={v.reason ?? ""}>{v.reason ?? (v.statusTone === "wear" ? "סומן תקול ללא הסבר" : "—")}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      {/* ===== לפי סוג ===== */}
      {tab === "type" && (
        <Card>
          {byType.length === 0 ? <EmptyState>אין רכבים צבאיים בגדוד</EmptyState> : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead><tr className="bg-slate-100 text-slate-500 text-xs"><th className="px-3 py-2 text-right">סוג רכב</th><th className="px-3 py-2 text-center">סה״כ</th><th className="px-3 py-2 text-center">תקין (בשטח)</th><th className="px-3 py-2 text-center">בטנא</th><th className="px-3 py-2 text-center">חתום על חייל</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {byType.map((s) => (
                    <tr key={s.typeName}>
                      <td className="px-3 py-2 font-medium whitespace-nowrap">🚙 {s.typeName}</td>
                      <td className="px-3 py-2 text-center font-bold">{s.total}</td>
                      <td className="px-3 py-2 text-center text-emerald-700">{s.ok}</td>
                      <td className="px-3 py-2 text-center text-orange-700">{s.defectiveAtTana}</td>
                      <td className="px-3 py-2 text-center text-blue-700">{s.signedToSoldier}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* ===== היסטוריית טיפולים — מקושרת למספר הרכב ===== */}
      {tab === "history" && (
        <>
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <input value={hq} onChange={(e) => setHq(e.target.value)} placeholder="🔍 חיפוש לפי מ.ס. / סוג / סיבת תקלה…"
              className="flex-1 min-w-[180px] border border-slate-300 rounded-lg px-3 py-2 text-sm" />
            <label className={`inline-flex items-center gap-1.5 text-sm rounded-lg px-3 py-2 cursor-pointer border ${histOnlyRecurring ? "bg-rose-100 border-rose-300 text-rose-800 font-medium" : "bg-white border-slate-300 text-slate-600"}`}>
              <input type="checkbox" checked={histOnlyRecurring} onChange={(e) => setHistOnlyRecurring(e.target.checked)} className="accent-rose-600" />
              🔁 רק חזרות מהירות
            </label>
          </div>
          {histRows.length === 0 ? <Card><EmptyState>אין היסטוריית טיפולים</EmptyState></Card> : (
            <Card>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 z-10"><tr className="bg-slate-100 text-slate-500 text-xs [&>th]:sticky [&>th]:top-0 [&>th]:bg-slate-100">
                    <th className="px-2 py-2 text-center w-10">#</th><th className="px-3 py-2 text-right">רכב</th><th className="px-3 py-2 text-right">מ.ס.</th>
                    <th className="px-3 py-2 text-right">תאריך</th><th className="px-3 py-2 text-right">אירוע</th><th className="px-3 py-2 text-right">סיבה / תקלה</th><th className="px-3 py-2"></th>
                  </tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {histRows.map((r, i) => (
                      <tr key={i} className={r.gapDays != null ? "bg-rose-50" : "hover:bg-slate-50"}>
                        <td className="px-2 py-1.5 text-center text-slate-400 font-mono">{r.num}</td>
                        <td className="px-3 py-1.5 whitespace-nowrap">🚙 {r.typeName}</td>
                        <td className="px-3 py-1.5 font-mono text-xs">{r.serial}</td>
                        <td className="px-3 py-1.5 text-xs text-slate-500 whitespace-nowrap">{fmt(r.date)}</td>
                        <td className="px-3 py-1.5 whitespace-nowrap"><Badge className={r.kind === "in" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}>{r.kind === "in" ? "🔧 כניסה לטנא" : "✓ יציאה"}</Badge>
                          {r.gapDays != null && <span title="חזרה לטנא זמן קצר אחרי תיקון" className="mr-1 text-[10px] bg-rose-600 text-white rounded px-1.5 py-0.5 font-bold">חזר תוך {r.gapDays}י׳</span>}
                        </td>
                        <td className="px-3 py-1.5 text-xs text-slate-600 max-w-[240px] truncate"><span title={r.reason ?? ""}>{r.reason ?? "—"}</span></td>
                        <td className="px-3 py-1.5"><Link href={`/transfers/${r.transferId}/document`} className="text-xs text-blue-600 hover:underline">תעודה</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}

      {editVeh && <MaintModal veh={editVeh} onClose={() => setEditVeh(null)} />}
      {reportVeh && <ReportFaultModal veh={reportVeh} cats={faultCategories} onClose={() => setReportVeh(null)} />}
      {faultVeh?.fault && <FaultModal veh={faultVeh} onClose={() => setFaultVeh(null)} />}
    </div>
  );
}

/** דיווח תקלה חדשה — פותח תיק עם מספר רץ. */
function ReportFaultModal({ veh, cats, onClose }: { veh: VehRow; cats: FaultCat[]; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [catId, setCatId] = useState("");
  function submit(fd: FormData) {
    setErr(null); fd.set("vehicleSerialUnitId", veh.id);
    start(async () => { const r = await reportVehicleFault(fd); if (r?.error) { setErr(r.error); return; } onClose(); router.refresh(); });
  }
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md my-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b"><h3 className="font-bold text-slate-800">🔴 דיווח תקלה — {veh.typeName} · {veh.serial}</h3><button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl">✕</button></div>
        <form action={submit} className="p-4 space-y-3">
          <label className="text-sm block">קטגוריית תקלה
            <select name="categoryId" value={catId} onChange={(e) => setCatId(e.target.value)} className="mt-1 w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white">
              <option value="">— בחר/י קטגוריה —</option>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              <option value="__other__">➕ אחר (קטגוריה חדשה)…</option>
            </select>
          </label>
          {catId === "__other__" && <input name="newCategory" placeholder="שם קטגוריה חדשה" className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />}
          <label className="text-sm block">תיאור התקלה
            <textarea name="description" rows={3} required placeholder="מה התקלה?" className="mt-1 w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
          </label>
          {veh.signedSoldier && (
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" name="notify" className="w-4 h-4 accent-sky-600" /> 📤 לשלוח לחייל החתום ({veh.signedSoldier}) בטלגרם
            </label>
          )}
          {err && <p className="text-rose-600 text-sm">{err}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="text-sm text-slate-600 px-4 py-2 hover:bg-slate-50 rounded-lg">ביטול</button>
            <button disabled={pending} className="text-sm bg-rose-600 text-white rounded-lg px-5 py-2 font-medium hover:bg-rose-700 disabled:opacity-50">{pending ? "…" : "🔴 פתח תקלה"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** ניהול תיק תקלה — מחזור סטטוסים, הערות, שליחה לחייל, היסטוריה. */
function FaultModal({ veh, onClose }: { veh: VehRow; onClose: () => void }) {
  const router = useRouter();
  const f = veh.fault!;
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const curIdx = stageIndex(f.stage);
  const nextStage = FAULT_STAGES[curIdx + 1];

  const run = (fn: () => Promise<{ error?: string }>) => start(async () => { setMsg(null); const r = await fn(); if (r?.error) { setMsg(r.error); return; } setNote(""); router.refresh(); onClose(); });
  function advance(stageKey: string) { const fd = new FormData(); fd.set("faultId", f.id); fd.set("stage", stageKey); if (note.trim()) fd.set("note", note.trim()); run(() => advanceVehicleFault(fd)); }
  function saveNote() { if (!note.trim()) return; const fd = new FormData(); fd.set("faultId", f.id); fd.set("note", note.trim()); run(() => addVehicleFaultNote(fd)); }
  async function sendSoldier() { setMsg(null); const fd = new FormData(); fd.set("faultId", f.id); start(async () => { const r = await sendFaultToSoldier(fd); setMsg(r.error ?? (r.sent ? "✅ נשלח לחייל בטלגרם" : "החייל לא מחובר לבוט")); }); }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg my-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-bold text-slate-800">🔧 תקלה #{f.faultNumber} — {veh.typeName} · {veh.serial}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl">✕</button>
        </div>
        <div className="p-4 space-y-4">
          <div className="bg-slate-50 rounded-lg p-3 text-sm">
            {f.categoryName && <div className="mb-1"><span className="text-[11px] bg-slate-200 text-slate-700 rounded px-2 py-0.5">{f.categoryName}</span></div>}
            <b>תיאור:</b> {f.description}
          </div>

          {/* מחוון שלבים */}
          <div className="flex flex-wrap gap-1">
            {FAULT_STAGES.map((s, i) => (
              <span key={s.key} className={`text-[10px] rounded px-1.5 py-0.5 ${i === curIdx ? s.tone + " font-bold ring-2 ring-offset-1 ring-slate-300" : i < curIdx ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-400"}`}>{i < curIdx ? "✓ " : ""}{s.short}</span>
            ))}
          </div>

          {/* הערה + פעולות */}
          <div>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="הערה / פירוט (אופציונלי)…" className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm mb-2" />
            <div className="flex flex-wrap gap-2">
              {nextStage && <button onClick={() => advance(nextStage.key)} disabled={pending} className="text-sm bg-slate-800 text-white rounded-lg px-3 py-1.5 hover:bg-slate-900 disabled:opacity-50">➡️ {nextStage.short}</button>}
              {f.stage !== CLOSED_STAGE && <button onClick={() => advance(CLOSED_STAGE)} disabled={pending} className="text-sm bg-emerald-600 text-white rounded-lg px-3 py-1.5 hover:bg-emerald-700 disabled:opacity-50">✅ סגור (נמסר)</button>}
              <button onClick={saveNote} disabled={pending || !note.trim()} className="text-sm bg-white border border-slate-300 text-slate-700 rounded-lg px-3 py-1.5 hover:bg-slate-50 disabled:opacity-50">💬 הוסף הערה</button>
              {f.hasSignedSoldier && <button onClick={sendSoldier} disabled={pending} className="text-sm bg-indigo-600 text-white rounded-lg px-3 py-1.5 hover:bg-indigo-700 disabled:opacity-50">📤 שלח לחייל</button>}
            </div>
            {msg && <p className="text-xs mt-2 text-slate-600">{msg}</p>}
          </div>

          {/* היסטוריית התיק */}
          <div>
            <div className="text-xs font-bold text-slate-500 mb-1">📜 יומן התיק</div>
            <div className="space-y-1 max-h-52 overflow-y-auto">
              {[...f.events].reverse().map((e, i) => (
                <div key={i} className="text-xs border-r-2 border-slate-200 pr-2 py-0.5">
                  <span className="text-slate-400">{new Date(e.at).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                  {e.stage !== "note" && <span className="font-medium text-slate-700"> · {stageInfo(e.stage).short}</span>}
                  {e.note && <span className="text-slate-600"> — {e.note}</span>}
                  {e.by && <span className="text-slate-400"> ({e.by})</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** מודאל הגדרת תוכנית טיפול לרכב (קצין רכב / טנא). */
function MaintModal({ veh, onClose }: { veh: VehRow; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const m = veh.maint;

  function submit(fd: FormData) {
    setErr(null);
    fd.set("vehicleSerialUnitId", veh.id);
    start(async () => {
      const r = await saveVehicleMaintenance(fd);
      if (r?.error) { setErr(r.error); return; }
      onClose();
      router.refresh();
    });
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md my-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-bold text-slate-800">🗓️ תוכנית טיפול — {veh.typeName} · {veh.serial}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl">✕</button>
        </div>
        <form action={submit} className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">תאריך טיפול הבא
              <input type="date" name="nextDate" defaultValue={veh.nextMaintDate ?? ""} className="mt-1 w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
            </label>
            <label className="text-sm">סוג טיפול
              <input name="serviceType" defaultValue={m?.serviceType ?? ""} placeholder="למשל: 10,000 ק״מ" className="mt-1 w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
            </label>
          </div>
          <label className="text-sm block">מיקום (מוסך)
            <input name="location" defaultValue={m?.location ?? ""} className="mt-1 w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">שעות
              <input name="hours" defaultValue={m?.hours ?? ""} placeholder="08:00–16:00" className="mt-1 w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
            </label>
            <label className="text-sm">איש קשר
              <input name="contactName" defaultValue={m?.contactName ?? ""} className="mt-1 w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
            </label>
          </div>
          <label className="text-sm block">טלפון איש קשר
            <input name="contactPhone" defaultValue={m?.contactPhone ?? ""} className="mt-1 w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm font-mono" />
          </label>
          <label className="text-sm block">הערות
            <textarea name="notes" defaultValue={m?.notes ?? ""} rows={2} className="mt-1 w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
          </label>
          <p className="text-[11px] text-slate-400">אפשר למלא עכשיו או בהמשך. שמירה ריקה מוחקת את התוכנית.</p>
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
