"use client";

import { useState } from "react";
import { Badge } from "@/components/ui";
import { submitAttachmentRequest } from "../roster/attachment-actions";

type Company = { id: string; name: string };
type StatusLogEntry = { status: string; note: string | null; changedBy: string; changedAt: string };
type AttachReq = {
  id: string; soldierName: string; personalNumber: string | null;
  sourceUnit: string | null; targetCompany: string | null;
  fromDate: string; toDate: string; fullEmployment: boolean;
  status: string; requestedAt: string; notes: string | null;
  statusLog: StatusLogEntry[];
};

const STATUS_LABELS: Record<string, string> = {
  REQUESTED: "בקשה לסיפוח",
  SUBMITTED: "הוגשה בקשה",
  REMINDED: "הוגשה תזכורת",
  APPROVED: "אושר",
  REJECTED: "לא אושר",
};
const STATUS_COLORS: Record<string, string> = {
  REQUESTED: "bg-amber-100 text-amber-700 border-amber-200",
  SUBMITTED: "bg-blue-100 text-blue-700 border-blue-200",
  REMINDED: "bg-orange-100 text-orange-700 border-orange-200",
  APPROVED: "bg-emerald-100 text-emerald-700 border-emerald-200",
  REJECTED: "bg-rose-100 text-rose-700 border-rose-200",
};

function fmtDate(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function StatusTimeline({ log }: { log: StatusLogEntry[] }) {
  return (
    <div className="mt-2 border-r-2 border-slate-200 pr-3 space-y-1.5">
      {log.map((entry, i) => (
        <div key={i} className="flex items-start gap-2 text-[11px]">
          <div className="w-2 h-2 rounded-full mt-1 shrink-0" style={{
            backgroundColor: entry.status === "APPROVED" ? "#059669" : entry.status === "REJECTED" ? "#e11d48" : "#f59e0b",
          }} />
          <div>
            <span className="font-medium">{STATUS_LABELS[entry.status] ?? entry.status}</span>
            <span className="text-slate-400 mx-1">·</span>
            <span className="text-slate-400">{new Date(entry.changedAt).toLocaleDateString("he-IL")} {new Date(entry.changedAt).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}</span>
            <span className="text-slate-400 mx-1">·</span>
            <span className="text-slate-500">{entry.changedBy}</span>
            {entry.note && <span className="text-slate-400 mr-1">— {entry.note}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AttachmentRequestSection({ companies, requests }: {
  companies: Company[];
  requests: AttachReq[];
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fullEmployment, setFullEmployment] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);

  const active = requests.filter((r) => r.status !== "APPROVED" && r.status !== "REJECTED");
  const done = requests.filter((r) => r.status === "APPROVED" || r.status === "REJECTED");

  async function submit(fd: FormData) {
    setError(null);
    try {
      await submitAttachmentRequest(fd);
      setFormOpen(false);
      setFullEmployment(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={() => active.length > 0 && setListOpen((v) => !v)}
          className={`font-bold text-slate-800 flex items-center gap-2 ${active.length > 0 ? "cursor-pointer" : "cursor-default"}`}
        >
          📌 בקשות סיפוח
          {active.length > 0 && <Badge className="bg-amber-100 text-amber-700">{active.length} פתוחות</Badge>}
          {active.length > 0 && <span className="text-xs font-normal text-slate-400">{listOpen ? "▾ הסתר" : "▸ הצג"}</span>}
        </button>
        <button
          onClick={() => setFormOpen(!formOpen)}
          className="text-sm bg-blue-600 text-white rounded-lg px-3 py-1.5 hover:bg-blue-700"
        >
          {formOpen ? "ביטול" : "+ בקשת סיפוח"}
        </button>
      </div>

      {formOpen && (
        <form action={submit} className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-3">
          {error && <div className="bg-rose-50 border border-rose-300 rounded-lg p-2.5 text-sm text-rose-800">{error}</div>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-600 mb-1">שם חייל *</label>
              <input name="soldierName" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-slate-600 mb-1">מספר אישי</label>
              <input name="personalNumber" inputMode="numeric"
                onInput={(e) => { e.currentTarget.value = e.currentTarget.value.replace(/\D/g, ""); }}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-600 mb-1">טלפון</label>
              <input name="phone" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-slate-600 mb-1">יחידת מקור</label>
              <input name="sourceUnit" placeholder="מאיפה מגיע?" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-600 mb-1">פלוגת יעד</label>
            <select name="targetCompanyId" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="">— בחר —</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <label className="flex items-center gap-2 p-3 bg-white border border-blue-200 rounded-lg cursor-pointer">
            <input type="checkbox" name="fullEmployment" checked={fullEmployment}
              onChange={(e) => setFullEmployment(e.target.checked)} className="w-4 h-4" />
            <div>
              <span className="font-medium text-sm text-blue-800">כל התעסוקה</span>
              <span className="text-xs text-blue-600 mr-2">ללא הגבלת תאריכים</span>
            </div>
          </label>

          {!fullEmployment && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-600 mb-1">מתאריך *</label>
                <input name="fromDate" type="date" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-slate-600 mb-1">עד תאריך *</label>
                <input name="toDate" type="date" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs text-slate-600 mb-1">הערות / סיבת סיפוח</label>
            <input name="notes" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="למשל: סיפוח מגדוד X לתקופת אימון..." />
          </div>

          <div className="flex justify-end pt-1">
            <button className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-5 py-2 text-sm font-medium">
              שלח בקשה
            </button>
          </div>
        </form>
      )}

      {requests.length === 0 && !formOpen && (
        <p className="text-xs text-slate-400">אין בקשות סיפוח. לחץ &quot;+ בקשת סיפוח&quot; להגשת בקשה חדשה.</p>
      )}

      {active.length > 0 && listOpen && (
        <div className="space-y-2 mb-3">
          {active.map((r) => (
            <div key={r.id} className={`border rounded-lg p-3 ${STATUS_COLORS[r.status] ?? "border-slate-200"}`}>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm">{r.soldierName}</span>
                {r.personalNumber && <span className="text-xs text-slate-500 font-mono">{r.personalNumber}</span>}
                <Badge className={STATUS_COLORS[r.status]}>{STATUS_LABELS[r.status] ?? r.status}</Badge>
              </div>
              <div className="text-xs text-slate-600 mt-1 flex gap-3 flex-wrap">
                {r.sourceUnit && <span>מ: {r.sourceUnit}</span>}
                {r.targetCompany && <span>אל: {r.targetCompany}</span>}
                <span>
                  {r.fullEmployment ? "כל התעסוקה" : `${fmtDate(r.fromDate)} — ${fmtDate(r.toDate)}`}
                </span>
              </div>
              {r.notes && <div className="text-[10px] text-slate-500 mt-0.5">{r.notes}</div>}
              <button onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                className="text-[10px] text-blue-600 hover:underline mt-1">
                {expandedId === r.id ? "הסתר היסטוריה" : "היסטוריית טיפול"}
              </button>
              {expandedId === r.id && <StatusTimeline log={r.statusLog} />}
            </div>
          ))}
        </div>
      )}

      {done.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-slate-500 hover:text-slate-700">בקשות שטופלו ({done.length})</summary>
          <div className="mt-2 space-y-2">
            {done.map((r) => (
              <div key={r.id} className={`rounded-lg p-3 border ${STATUS_COLORS[r.status]}`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className={STATUS_COLORS[r.status]}>{STATUS_LABELS[r.status]}</Badge>
                  <span className="font-medium text-sm">{r.soldierName}</span>
                  <span className="text-slate-500">
                    {r.fullEmployment ? "כל התעסוקה" : `${fmtDate(r.fromDate)} — ${fmtDate(r.toDate)}`}
                  </span>
                </div>
                <button onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                  className="text-[10px] text-blue-600 hover:underline mt-1">
                  {expandedId === r.id ? "הסתר" : "היסטוריית טיפול"}
                </button>
                {expandedId === r.id && <StatusTimeline log={r.statusLog} />}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
