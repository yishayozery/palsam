"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Card, Badge, EmptyState } from "@/components/ui";

export type VehRow = {
  id: string; num: number; typeName: string; serial: string;
  statusName: string; statusTone: "ok" | "wear" | "loss";
  holderLabel: string; atTana: boolean; sentByOfficer: boolean;
  signedSoldier: string | null; physicalLocation: string | null; reason: string | null;
  recurringDays: number | null;
};
export type TypeRow = { typeName: string; total: number; ok: number; defectiveAtTana: number; signedToSoldier: number };
export type HistEvent = { date: string; kind: "in" | "out"; from: string; to: string; reason: string | null; transferId: string; gapDays: number | null };
export type VehHist = { id: string; num: number; typeName: string; serial: string; events: HistEvent[]; hasRecurring: boolean };

const toneCls = { ok: "bg-emerald-100 text-emerald-800", wear: "bg-amber-100 text-amber-800", loss: "bg-rose-100 text-rose-800" };
function fmt(d: string) { return new Date(d).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); }

export default function MaintenanceTabs({ vehicles, byType, history }: { vehicles: VehRow[]; byType: TypeRow[]; history: VehHist[] }) {
  const [tab, setTab] = useState<"all" | "type" | "history">("all");
  const [q, setQ] = useState("");
  const [hq, setHq] = useState("");

  const filtered = useMemo(() => {
    const s = q.trim();
    if (!s) return vehicles;
    return vehicles.filter((v) => v.typeName.includes(s) || v.serial.includes(s) || v.holderLabel.includes(s) || (v.signedSoldier ?? "").includes(s) || v.statusName.includes(s));
  }, [vehicles, q]);

  const filteredHist = useMemo(() => {
    const s = hq.trim();
    if (!s) return history;
    return history.filter((h) => h.typeName.includes(s) || h.serial.includes(s));
  }, [history, hq]);

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
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 חיפוש לפי סוג / מ.ס. / שייכות / חייל / סטטוס…"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-3" />
          <Card>
            {filtered.length === 0 ? <EmptyState>אין רכבים תואמים</EmptyState> : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead><tr className="bg-slate-100 text-slate-500 text-xs">
                    <th className="px-2 py-2 text-center w-10">#</th><th className="px-3 py-2 text-right">רכב</th><th className="px-3 py-2 text-right">מ.ס.</th>
                    <th className="px-3 py-2 text-right">סטטוס</th><th className="px-3 py-2 text-right">שייכות</th><th className="px-3 py-2 text-right">חייל חתום</th>
                    <th className="px-3 py-2 text-right">מיקום</th><th className="px-3 py-2 text-right">תקלה אחרונה</th>
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
                        <td className="px-3 py-2 text-xs whitespace-nowrap">{v.atTana ? <span className="text-orange-700 font-medium">🔧 בטנא{v.sentByOfficer && <span className="text-[10px] text-blue-700 mr-1">(קצין רכב)</span>}</span> : v.holderLabel}</td>
                        <td className="px-3 py-2 text-xs text-blue-700 whitespace-nowrap">{v.signedSoldier ?? "—"}</td>
                        <td className="px-3 py-2 text-xs text-slate-600 whitespace-nowrap">{v.physicalLocation ?? "—"}</td>
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
          <input value={hq} onChange={(e) => setHq(e.target.value)} placeholder="🔍 חיפוש רכב לפי סוג / מ.ס.…"
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-3" />
          {filteredHist.length === 0 ? <Card><EmptyState>אין היסטוריית טיפולים</EmptyState></Card> : (
            <div className="space-y-3">
              {filteredHist.map((h) => (
                <Card key={h.id} className="overflow-hidden">
                  <div className={`px-4 py-2 border-b flex items-center justify-between ${h.hasRecurring ? "bg-rose-50 border-rose-100" : "bg-slate-50 border-slate-100"}`}>
                    <div className="font-bold text-slate-700 text-sm">
                      <span className="text-slate-400 font-mono ml-1">#{h.num}</span> 🚙 {h.typeName} · <span className="font-mono">{h.serial}</span>
                    </div>
                    {h.hasRecurring && <span className="text-[10px] bg-rose-600 text-white rounded px-2 py-0.5 font-bold">🔁 חזרה מהירה</span>}
                    <span className="text-xs text-slate-400">{h.events.length} אירועים</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <tbody className="divide-y divide-slate-100">
                        {h.events.map((e, i) => (
                          <tr key={i} className={e.gapDays != null ? "bg-rose-50" : ""}>
                            <td className="px-3 py-1.5 text-xs text-slate-500 whitespace-nowrap">{fmt(e.date)}</td>
                            <td className="px-3 py-1.5 whitespace-nowrap"><Badge className={e.kind === "in" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}>{e.kind === "in" ? "🔧 כניסה לטנא" : "✓ יציאה"}</Badge>
                              {e.gapDays != null && <span title="חזרה לטנא זמן קצר אחרי תיקון" className="mr-1 text-[10px] bg-rose-600 text-white rounded px-1.5 py-0.5 font-bold">חזר תוך {e.gapDays}י׳</span>}
                            </td>
                            <td className="px-3 py-1.5 text-xs text-slate-600 max-w-[220px] truncate"><span title={e.reason ?? ""}>{e.reason ?? "—"}</span></td>
                            <td className="px-3 py-1.5"><Link href={`/transfers/${e.transferId}/document`} className="text-xs text-blue-600 hover:underline">תעודה</Link></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
