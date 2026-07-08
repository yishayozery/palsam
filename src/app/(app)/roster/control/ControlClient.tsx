"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";
import { toggleCompanyLock } from "../../attendance/actions";

type Company = { id: string; name: string; total: number; reported: number; locked: boolean };
type StatusCard = { id: string; name: string; color: string; icon: string; isPresent: boolean; count: number; pns: string[] };
type SoldierRow = { id: string; name: string; pn: string; company: string; statusName: string | null };

export default function ControlClient({
  date, companies, statuses, notReported, soldierRows, totals,
}: {
  date: string;
  companies: Company[];
  statuses: StatusCard[];
  notReported: { count: number; pns: string[] };
  soldierRows: SoldierRow[];
  totals: { soldiers: number; reported: number; companiesReported: number; companiesTotal: number };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState<string | null>(null);
  const [showTable, setShowTable] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterCompany, setFilterCompany] = useState<string>("");

  function shiftDay(delta: number) {
    const d = new Date(date + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + delta);
    router.push(`/roster/control?date=${d.toISOString().slice(0, 10)}`);
  }
  function copyPns(key: string, pns: string[]) {
    navigator.clipboard?.writeText(pns.join("\n")).then(() => {
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    }).catch(() => {});
  }
  function lock(companyId: string, val: boolean) {
    start(async () => { await toggleCompanyLock(companyId, date, val); router.refresh(); });
  }
  function lockAll(val: boolean) {
    start(async () => { for (const c of companies) { if (c.locked !== val) await toggleCompanyLock(c.id, date, val); } router.refresh(); });
  }

  const filteredRows = useMemo(() => soldierRows.filter((r) =>
    (!filterStatus || (filterStatus === "__none__" ? !r.statusName : r.statusName === filterStatus)) &&
    (!filterCompany || r.company === filterCompany)
  ), [soldierRows, filterStatus, filterCompany]);

  const companyNames = [...new Set(soldierRows.map((r) => r.company))];

  return (
    <div className="space-y-5">
      {/* סרגל תאריך + סיכום */}
      <Card className="p-3 flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 bg-slate-50 rounded-lg p-1 border border-slate-200">
          <button onClick={() => shiftDay(-1)} className="rounded bg-white border border-slate-200 px-2 py-1 text-xs hover:bg-slate-100">◀ יום</button>
          <input type="date" value={date} onChange={(e) => e.target.value && router.push(`/roster/control?date=${e.target.value}`)}
            className="rounded border border-slate-300 px-2 py-1 text-sm" />
          <button onClick={() => shiftDay(1)} className="rounded bg-white border border-slate-200 px-2 py-1 text-xs hover:bg-slate-100">יום ▶</button>
        </div>
        <div className="text-sm text-slate-600">
          דיווחו: <b>{totals.reported}</b>/{totals.soldiers} חיילים · <b>{totals.companiesReported}</b>/{totals.companiesTotal} פלוגות
        </div>
        <div className="mr-auto flex gap-2">
          <button onClick={() => lockAll(true)} disabled={pending} className="text-xs bg-rose-600 text-white rounded-lg px-3 py-1.5 hover:bg-rose-700 disabled:opacity-50">🔒 נעל הכל</button>
          <button onClick={() => lockAll(false)} disabled={pending} className="text-xs border border-slate-300 text-slate-600 rounded-lg px-3 py-1.5 hover:bg-slate-50 disabled:opacity-50">🔓 פתח הכל</button>
        </div>
      </Card>

      {/* בלוק 1 — סטטוס פלוגות */}
      <div>
        <h3 className="font-bold text-slate-700 text-sm mb-2">1️⃣ סטטוס דיווח פלוגות</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {companies.filter((c) => c.total > 0).map((c) => {
            const full = c.reported >= c.total;
            const bg = c.locked ? "bg-purple-50 border-purple-300" : full ? "bg-emerald-50 border-emerald-300" : c.reported > 0 ? "bg-amber-50 border-amber-300" : "bg-slate-50 border-slate-200";
            return (
              <div key={c.id} className={`rounded-xl border p-3 ${bg}`}>
                <div className="flex items-center justify-between gap-1">
                  <span className="font-bold text-sm text-slate-800">{c.name}</span>
                  <span className="text-lg">{c.locked ? "🔒" : full ? "🟢" : c.reported > 0 ? "🟡" : "⚪"}</span>
                </div>
                <div className="text-xs text-slate-500 mt-1">{c.reported}/{c.total} דיווחו</div>
                <button onClick={() => lock(c.id, !c.locked)} disabled={pending}
                  className={`mt-2 w-full text-xs rounded-lg py-1 disabled:opacity-50 ${c.locked ? "bg-white border border-slate-300 text-slate-600 hover:bg-slate-50" : "bg-rose-600 text-white hover:bg-rose-700"}`}>
                  {c.locked ? "🔓 פתח עדכון" : "🔒 נעל עדכון"}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* בלוק 2 — פילוח לפי סטטוס + העתקה */}
      <div>
        <h3 className="font-bold text-slate-700 text-sm mb-2">2️⃣ פילוח לפי סטטוס — העתקת מ.א</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {statuses.map((st) => (
            <div key={st.id} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex items-center gap-1.5 text-sm font-medium text-slate-800">
                <span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: st.color }} />
                {st.icon} {st.name}
              </div>
              <div className="text-2xl font-bold text-slate-800 mt-1">{st.count}</div>
              <button onClick={() => copyPns(st.id, st.pns)} disabled={st.pns.length === 0}
                className="mt-1 w-full text-xs rounded-lg py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 disabled:opacity-40">
                {copied === st.id ? "✓ הועתק" : `📋 העתק מ.א (${st.pns.length})`}
              </button>
            </div>
          ))}
          {/* לא דיווחו */}
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
            <div className="text-sm font-medium text-amber-800">⚠️ טרם דיווחו</div>
            <div className="text-2xl font-bold text-amber-800 mt-1">{notReported.count}</div>
            <button onClick={() => copyPns("__none__", notReported.pns)} disabled={notReported.pns.length === 0}
              className="mt-1 w-full text-xs rounded-lg py-1 bg-amber-100 hover:bg-amber-200 text-amber-800 disabled:opacity-40">
              {copied === "__none__" ? "✓ הועתק" : `📋 העתק מ.א (${notReported.pns.length})`}
            </button>
          </div>
        </div>
      </div>

      {/* בלוק 3 — טבלת חיילים (מתקפל) */}
      <div>
        <button onClick={() => setShowTable((v) => !v)} className="font-bold text-slate-700 text-sm flex items-center gap-2 hover:text-slate-900">
          {showTable ? "▼" : "◀"} 3️⃣ טבלת חיילים ({soldierRows.length})
        </button>
        {showTable && (
          <Card className="p-3 mt-2">
            <div className="flex gap-2 flex-wrap mb-2">
              <select value={filterCompany} onChange={(e) => setFilterCompany(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1 text-sm">
                <option value="">כל הפלוגות</option>
                {companyNames.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1 text-sm">
                <option value="">כל הסטטוסים</option>
                {statuses.map((st) => <option key={st.id} value={st.name}>{st.name}</option>)}
                <option value="__none__">טרם דיווחו</option>
              </select>
              <span className="text-xs text-slate-400 self-center">{filteredRows.length} תוצאות</span>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead><tr className="bg-slate-100 text-slate-600 text-xs">
                  <th className="px-3 py-1.5 text-right">חייל</th><th className="px-3 py-1.5 text-right">מ.א</th>
                  <th className="px-3 py-1.5 text-right">פלוגה</th><th className="px-3 py-1.5 text-right">סטטוס</th>
                </tr></thead>
                <tbody>
                  {filteredRows.map((r) => (
                    <tr key={r.id} className="border-b border-slate-50">
                      <td className="px-3 py-1.5">{r.name}</td>
                      <td className="px-3 py-1.5 font-mono text-xs text-slate-500">{r.pn}</td>
                      <td className="px-3 py-1.5 text-slate-500">{r.company}</td>
                      <td className="px-3 py-1.5">{r.statusName ?? <span className="text-amber-600 text-xs">טרם דיווח</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
