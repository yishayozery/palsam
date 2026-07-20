"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";
import { setForecastOrder, setForecastException } from "./forecast-actions";
import { useEscClose } from "@/lib/useEscClose";
import { buildForecast } from "@/lib/forecast";

export type FcEmployment = { id: string; name: string; startDate: string; endDate: string };
export type FcStatus = { id: string; name: string; icon: string | null; color: string; inService: boolean };
export type FcSoldier = { id: string; fullName: string; personalNumber: string | null; squadName: string | null };
export type FcOrder = { soldierId: string; startDate: string; endDate: string };
export type FcException = { soldierId: string; date: string; statusId: string };

type Block = { statusId: string; from: string; to: string; days: number };

const short = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const dayDiff = (a: string, b: string) =>
  Math.round((new Date(b + "T00:00:00Z").getTime() - new Date(a + "T00:00:00Z").getTime()) / 86400000) + 1;

function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (const d = new Date(from + "T00:00:00Z"); d.toISOString().slice(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
    if (out.length > 400) break;
  }
  return out;
}

/**
 * 📅 תחזית הגעה לתעסוקה — מוגדרת כאן, במסך חיילי הפלוגה.
 * ⚠️ ללא צו החייל אינו מגויס ואינו נספר. הצו נקבע קודם, החריגים אחריו.
 */
export default function ForecastPanel({
  employment, soldiers, orders, exceptions, statuses, canEdit,
}: {
  employment: FcEmployment | null;
  soldiers: FcSoldier[]; orders: FcOrder[]; exceptions: FcException[]; statuses: FcStatus[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "ordered" | "unordered" | "absent">("all");
  const [modal, setModal] = useState<{ kind: "order" | "exception"; ids: string[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const statusById = useMemo(() => new Map(statuses.map((s) => [s.id, s])), [statuses]);
  const orderBy = useMemo(() => new Map(orders.map((o) => [o.soldierId, o])), [orders]);
  const fc = useMemo(() => buildForecast(orders, exceptions, statuses), [orders, exceptions, statuses]);

  /** פרקי היעדרות בתוך הצו, מקובצים לרצפים */
  function blocksOf(soldierId: string): Block[] {
    const o = orderBy.get(soldierId);
    if (!o) return [];
    const out: Block[] = [];
    let cur: Block | null = null;
    for (const d of datesBetween(o.startDate, o.endDate)) {
      const absent = fc.exceptionOf(soldierId, d);
      if (absent && cur && cur.statusId === absent) { cur.to = d; cur.days++; continue; }
      if (cur) out.push(cur);
      cur = absent ? { statusId: absent, from: d, to: d, days: 1 } : null;
    }
    if (cur) out.push(cur);
    return out;
  }

  const rows = useMemo(() => soldiers.map((s) => {
    const o = orderBy.get(s.id) ?? null;
    const blocks = blocksOf(s.id);
    const absentDays = blocks.reduce((n, b) => n + b.days, 0);
    const orderDays = o ? dayDiff(o.startDate, o.endDate) : 0;
    return { s, o, blocks, absentDays, inServiceDays: orderDays - absentDays, orderDays };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [soldiers, orderBy, fc, statusById]);

  const filtered = rows.filter((r) => {
    if (search && !r.s.fullName.includes(search) && !(r.s.personalNumber ?? "").includes(search)) return false;
    if (filter === "ordered") return !!r.o;
    if (filter === "unordered") return !r.o;
    if (filter === "absent") return r.absentDays > 0;
    return true;
  });

  const totals = {
    ordered: rows.filter((r) => r.o).length,
    unordered: rows.filter((r) => !r.o).length,
    absent: rows.filter((r) => r.absentDays > 0).length,
    manDays: rows.reduce((n, r) => n + Math.max(0, r.inServiceDays), 0),
  };

  function toggle(id: string) { setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; }); }
  function toggleAll() { setPicked((p) => p.size === filtered.length ? new Set() : new Set(filtered.map((r) => r.s.id))); }

  if (!employment) {
    return <Card className="p-6 text-center text-slate-500 text-sm">לא הוגדרה תעסוקה פעילה — לא ניתן להגדיר תחזית הגעה.</Card>;
  }

  return (
    <>
      <Card className="p-3 mb-3">
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <span className="text-sm font-bold text-slate-800">📅 תחזית הגעה — {employment.name}</span>
          <span className="text-[11px] text-slate-500">{employment.startDate} → {employment.endDate}</span>
        </div>
        <div className="flex gap-2 flex-wrap mb-2">
          <Stat n={totals.ordered} label="עם צו" tone="emerald" onClick={() => setFilter("ordered")} />
          <Stat n={totals.unordered} label="ללא צו" tone="slate" onClick={() => setFilter("unordered")} />
          <Stat n={totals.absent} label="עם היעדרות" tone="amber" onClick={() => setFilter("absent")} />
          <Stat n={totals.manDays} label="ימי-חייל בשמ״פ" tone="blue" />
        </div>
        <p className="text-[11px] text-slate-500">
          ⚠️ חייל <b>ללא צו אינו מגויס</b> ואינו נספר בתחזית. קודם קובעים צו, ואז מסמנים חריגים בתוכו.
        </p>
      </Card>

      <Card className="p-3 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 חיפוש חייל…"
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm flex-1 min-w-[150px]" />
          <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}
            className="border border-slate-300 rounded-lg px-2 py-2 text-sm bg-white">
            <option value="all">הכל ({rows.length})</option>
            <option value="ordered">עם צו ({totals.ordered})</option>
            <option value="unordered">ללא צו ({totals.unordered})</option>
            <option value="absent">עם היעדרות ({totals.absent})</option>
          </select>
          {canEdit && (
            <>
              <button onClick={toggleAll} className="border border-slate-300 rounded-lg px-3 py-2 text-xs hover:bg-slate-50 whitespace-nowrap">
                {picked.size === filtered.length && filtered.length > 0 ? "נקה בחירה" : `בחר הכל (${filtered.length})`}
              </button>
              <button onClick={() => { setPicked(new Set(filtered.map((r) => r.s.id))); setModal({ kind: "order", ids: filtered.map((r) => r.s.id) }); }}
                className="bg-blue-700 hover:bg-blue-800 text-white rounded-lg px-3 py-2 text-xs font-medium whitespace-nowrap">
                📜 צו לכל המסוננים
              </button>
            </>
          )}
        </div>
        {canEdit && picked.size > 0 && (
          <div className="flex items-center gap-2 flex-wrap mt-2 pt-2 border-t border-slate-200">
            <span className="text-xs text-slate-600">{picked.size} נבחרו:</span>
            <button onClick={() => setModal({ kind: "order", ids: [...picked] })}
              className="bg-blue-700 hover:bg-blue-800 text-white rounded-lg px-3 py-1.5 text-xs font-medium">📜 קבע צו</button>
            <button onClick={() => setModal({ kind: "exception", ids: [...picked] })}
              className="bg-rose-600 hover:bg-rose-700 text-white rounded-lg px-3 py-1.5 text-xs font-medium">🚫 סמן היעדרות</button>
            <button onClick={() => setPicked(new Set())} className="text-xs text-slate-500 hover:underline mr-auto">בטל בחירה</button>
          </div>
        )}
      </Card>

      {err && <p className="text-rose-600 text-sm text-center mb-2">{err}</p>}

      <div className="space-y-2">
        {filtered.map(({ s, o, blocks, absentDays, inServiceDays, orderDays }) => (
          <Card key={s.id} className={`p-3 ${!o ? "opacity-70 border-r-4 border-r-slate-300" : absentDays > 0 ? "border-r-4 border-r-amber-400" : "border-r-4 border-r-emerald-400"}`}>
            <div className="flex items-center gap-2 flex-wrap">
              {canEdit && (
                <input type="checkbox" checked={picked.has(s.id)} onChange={() => toggle(s.id)} className="w-4 h-4 accent-blue-600 shrink-0" />
              )}
              <div className="min-w-0">
                <div className="font-medium text-sm">{s.fullName} <span className="font-mono text-[10px] text-slate-400">{s.personalNumber ?? ""}</span></div>
                <div className="text-[11px] text-slate-500">{s.squadName ?? "ללא מחלקה"}</div>
              </div>

              {o ? (
                <div className="text-xs rounded-lg px-2 py-1 bg-slate-100 text-slate-700" title="תאריכי הצו">
                  📜 {short(o.startDate)}–{short(o.endDate)} <span className="text-slate-400">({orderDays} י׳)</span>
                </div>
              ) : (
                <div className="text-xs rounded-lg px-2 py-1 bg-slate-100 text-slate-500">📜 ללא צו — לא מגויס</div>
              )}

              {o && (
                <div className={`text-xs rounded-lg px-2 py-1 ${absentDays === 0 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>
                  בשמ״פ {inServiceDays}/{orderDays}
                </div>
              )}

              {canEdit && (
                <div className="mr-auto flex gap-1.5">
                  <button onClick={() => setModal({ kind: "order", ids: [s.id] })}
                    className="border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs hover:bg-slate-50">📜 צו</button>
                  {o && (
                    <button onClick={() => setModal({ kind: "exception", ids: [s.id] })}
                      className="border border-rose-300 text-rose-700 rounded-lg px-2.5 py-1.5 text-xs hover:bg-rose-50">🚫 היעדרות</button>
                  )}
                </div>
              )}
            </div>

            {o && (
              <div className="overflow-x-auto mt-2">
                <div className="flex gap-px min-w-max">
                  {datesBetween(employment.startDate, employment.endDate).map((d) => {
                    const inOrder = d >= o.startDate && d <= o.endDate;
                    const ex = fc.exceptionOf(s.id, d);
                    const bg = !inOrder ? "#e2e8f0" : ex ? statusById.get(ex)!.color : "#10b981";
                    return <div key={d} className="w-1.5 h-4 rounded-sm shrink-0" style={{ background: bg }}
                      title={`${d} · ${!inOrder ? "מחוץ לצו" : ex ? statusById.get(ex)!.name : "בשמ״פ"}`} />;
                  })}
                </div>
              </div>
            )}

            {blocks.length > 0 && (
              <div className="flex gap-1.5 flex-wrap mt-2">
                {blocks.map((b, i) => {
                  const st = statusById.get(b.statusId)!;
                  return (
                    <span key={i} className="text-[11px] rounded-full px-2 py-1 border" style={{ borderColor: st.color, color: st.color }}>
                      {st.icon} {st.name} · {short(b.from)}{b.days > 1 ? `–${short(b.to)}` : ""} ({b.days})
                    </span>
                  );
                })}
              </div>
            )}
          </Card>
        ))}
        {filtered.length === 0 && <Card className="p-6 text-center text-slate-400 text-sm">אין חיילים תואמים.</Card>}
      </div>

      {modal && (
        <ForecastModal
          kind={modal.kind}
          soldierIds={modal.ids}
          soldierLabel={modal.ids.length === 1 ? (soldiers.find((x) => x.id === modal.ids[0])?.fullName ?? "") : `${modal.ids.length} חיילים`}
          currentOrder={modal.ids.length === 1 ? orderBy.get(modal.ids[0]) ?? null : null}
          employment={employment}
          statuses={statuses}
          onClose={() => setModal(null)}
          onDone={(msg) => { setModal(null); setPicked(new Set()); setErr(msg ?? null); router.refresh(); }}
        />
      )}
    </>
  );
}

function Stat({ n, label, tone, onClick }: { n: number; label: string; tone: "emerald" | "slate" | "amber" | "blue"; onClick?: () => void }) {
  const tones = {
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-700",
    slate: "bg-slate-50 border-slate-200 text-slate-600",
    amber: "bg-amber-50 border-amber-200 text-amber-700",
    blue: "bg-blue-50 border-blue-200 text-blue-700",
  }[tone];
  return (
    <button onClick={onClick} disabled={!onClick} className={`border rounded-lg px-3 py-1.5 text-center ${tones} ${onClick ? "hover:brightness-95" : ""}`}>
      <div className="text-base font-bold leading-tight">{n}</div>
      <div className="text-[10px]">{label}</div>
    </button>
  );
}

function ForecastModal({ kind, soldierIds, soldierLabel, currentOrder, employment, statuses, onClose, onDone }: {
  kind: "order" | "exception";
  soldierIds: string[]; soldierLabel: string; currentOrder: FcOrder | null;
  employment: FcEmployment; statuses: FcStatus[];
  onClose: () => void; onDone: (msg?: string | null) => void;
}) {
  const isOrder = kind === "order";
  const [from, setFrom] = useState(isOrder ? (currentOrder?.startDate ?? employment.startDate) : (currentOrder?.startDate ?? employment.startDate));
  const [to, setTo] = useState(isOrder ? (currentOrder?.endDate ?? employment.endDate) : (currentOrder?.endDate ?? employment.endDate));
  const reasons = statuses.filter((s) => !s.inService);
  const [statusId, setStatusId] = useState(reasons[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEscClose(true, onClose);

  async function save() {
    setErr(null); setBusy(true);
    const r = isOrder
      ? await setForecastOrder({ soldierIds, employmentId: employment.id, startDate: from, endDate: to })
      : await setForecastException({ soldierIds, employmentId: employment.id, startDate: from, endDate: to, statusId });
    setBusy(false);
    if (r.error) { setErr(r.error); return; }
    const skipped = !isOrder && "skippedOutsideOrder" in r && r.skippedOutsideOrder ? r.skippedOutsideOrder : 0;
    onDone(skipped ? `⚠️ ${skipped} חיילים דולגו — אין להם צו חופף לטווח` : null);
  }

  async function clearOrder() {
    if (!confirm(`למחוק את הצו? ${soldierLabel} יירדו מהתחזית לגמרי.`)) return;
    setErr(null); setBusy(true);
    const r = await setForecastOrder({ soldierIds, employmentId: employment.id, startDate: null, endDate: null });
    setBusy(false);
    if (r.error) { setErr(r.error); return; }
    onDone(null);
  }

  async function clearException() {
    setErr(null); setBusy(true);
    const r = await setForecastException({ soldierIds, employmentId: employment.id, startDate: from, endDate: to, statusId: null });
    setBusy(false);
    if (r.error) { setErr(r.error); return; }
    onDone(null);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" dir="rtl">
      <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl flex flex-col overflow-hidden">
        <div className={`text-white p-4 flex items-center justify-between shrink-0 ${isOrder ? "bg-gradient-to-r from-blue-700 to-blue-800" : "bg-gradient-to-r from-rose-600 to-rose-700"}`}>
          <div>
            <h3 className="font-bold">{isOrder ? "📜 קביעת צו" : "🚫 סימון היעדרות"}</h3>
            <p className="text-xs opacity-80 mt-0.5">{soldierLabel}</p>
          </div>
          <button onClick={onClose} className="opacity-80 hover:opacity-100 text-2xl">✕</button>
        </div>

        <div className="p-3 space-y-3">
          {!isOrder && (
            <div>
              <label className="block text-[11px] text-slate-600 mb-1.5">סיבה</label>
              <div className="grid grid-cols-2 gap-1.5">
                {reasons.map((r) => (
                  <button key={r.id} onClick={() => setStatusId(r.id)}
                    className={`rounded-lg px-2 py-2 text-sm border text-right ${statusId === r.id ? "border-2 font-medium" : "border-slate-200 bg-slate-50"}`}
                    style={statusId === r.id ? { borderColor: r.color, color: r.color, background: `${r.color}12` } : undefined}>
                    {r.icon} {r.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] text-slate-600 mb-1">מתאריך</label>
              <input type="date" value={from} min={employment.startDate} max={employment.endDate}
                onChange={(e) => setFrom(e.target.value)} className="w-full border border-slate-300 rounded-lg px-2 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-[11px] text-slate-600 mb-1">עד תאריך</label>
              <input type="date" value={to} min={employment.startDate} max={employment.endDate}
                onChange={(e) => setTo(e.target.value)} className="w-full border border-slate-300 rounded-lg px-2 py-2 text-sm" />
            </div>
          </div>
          <p className="text-[11px] text-slate-500 text-center">
            {to >= from ? `${dayDiff(from, to)} ימים` : "טווח לא תקין"}
            {isOrder ? " · חייב להיות בתוך תאריכי התעסוקה" : " · יחתך אוטומטית לתוך הצו"}
          </p>

          {err && <p className="text-rose-600 text-sm text-center">{err}</p>}
        </div>

        <div className="border-t border-slate-200 p-3 flex items-center gap-2">
          <button onClick={onClose} className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm">ביטול</button>
          <button onClick={isOrder ? clearOrder : clearException} disabled={busy}
            className="rounded-lg border border-slate-300 text-slate-600 px-3 py-2.5 text-sm hover:bg-slate-50">
            {isOrder ? "מחק צו" : "נקה טווח"}
          </button>
          <button onClick={save} disabled={busy || to < from || (!isOrder && !statusId)}
            className={`flex-1 disabled:opacity-50 text-white rounded-lg px-4 py-2.5 text-sm font-bold ${isOrder ? "bg-blue-700 hover:bg-blue-800" : "bg-rose-600 hover:bg-rose-700"}`}>
            {busy ? "שומר…" : isOrder ? "📜 שמור צו" : "🚫 שמור היעדרות"}
          </button>
        </div>
      </div>
    </div>
  );
}
