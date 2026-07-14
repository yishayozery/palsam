"use client";

import { useState, useTransition, useMemo } from "react";
import { PageHeader, Card, Badge } from "@/components/ui";
import { REQUEST_TYPE_LABEL, REQUEST_PRIORITY_LABEL, REQUEST_STATUS_LABEL, REQUEST_STATUS_STYLE, REQUEST_TYPES, REQUEST_PRIORITIES } from "@/lib/request-labels";
import type { RequestType, RequestPriority, RequestStatus } from "@/generated/prisma";
import { createRequest, approveAndEscalate, cancelRequest, addRequestUpdate, setRequestStatus } from "./actions";

type Upd = { id: string; authorName: string | null; text: string; statusFrom: RequestStatus | null; statusTo: RequestStatus | null; createdAt: string };
type Req = {
  id: string; type: RequestType; title: string; description: string | null; priority: RequestPriority; status: RequestStatus;
  openerName: string; openedByName: string | null; assignedName: string | null; createdAt: string; escalatedAt: string | null; updates: Upd[];
};

export default function RequestsClient({ mode, unitName, parentName, isCommander, companies, requests }: {
  mode: "brigade" | "battalion";
  unitName: string; parentName: string | null; isCommander: boolean;
  companies: { id: string; name: string }[];
  requests: Req[];
}) {
  const [pending, start] = useTransition();
  const [showNew, setShowNew] = useState(false);
  const [fStatus, setFStatus] = useState<RequestStatus | "all" | "open">("open");
  const [fType, setFType] = useState<RequestType | "all">("all");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");

  const OPEN_STATUSES: RequestStatus[] = ["PENDING_APPROVAL", "IN_PROGRESS", "NEEDS_INFO"];
  const filtered = useMemo(() => requests.filter((r) => {
    if (fType !== "all" && r.type !== fType) return false;
    if (fStatus === "open") return OPEN_STATUSES.includes(r.status);
    if (fStatus !== "all" && r.status !== fStatus) return false;
    return true;
  }), [requests, fStatus, fType]);

  const counts = useMemo(() => ({
    total: requests.length,
    pending: requests.filter((r) => r.status === "PENDING_APPROVAL").length,
    inProgress: requests.filter((r) => r.status === "IN_PROGRESS").length,
    needsInfo: requests.filter((r) => r.status === "NEEDS_INFO").length,
    resolved: requests.filter((r) => r.status === "RESOLVED").length,
  }), [requests]);

  const act = (fn: (fd: FormData) => Promise<{ error?: string; ok?: boolean }>, fd: FormData) =>
    start(async () => { const r = await fn(fd); if (r.error) alert(r.error); });

  const submitNew = (fd: FormData) => start(async () => { const r = await createRequest(fd); if (r.error) alert(r.error); else setShowNew(false); });
  const sendReply = (id: string) => { const fd = new FormData(); fd.set("id", id); fd.set("text", replyText); start(async () => { const r = await addRequestUpdate(fd); if (r.error) alert(r.error); else { setReplyTo(null); setReplyText(""); } }); };
  const setStatus = (id: string, status: RequestStatus) => { const note = prompt(`דיווח טיפול (${REQUEST_STATUS_LABEL[status]}):`, ""); if (note === null) return; const fd = new FormData(); fd.set("id", id); fd.set("status", status); fd.set("note", note); act(setRequestStatus, fd); };

  return (
    <div>
      <PageHeader
        title={mode === "brigade" ? "🏛️ דרישות נכנסות — חטיבה" : "📨 דרישות ליחידה הממונה"}
        subtitle={mode === "brigade" ? `${unitName} · ${counts.total} דרישות` : parentName ? `${unitName} → חטיבה: ${parentName}` : `${unitName} · ⚠️ לא משויך לחטיבה`}
        action={mode === "battalion" && parentName ? <button onClick={() => setShowNew((v) => !v)} className="text-sm bg-blue-600 text-white rounded-lg px-3 py-1.5 hover:bg-blue-700">➕ דרישה חדשה</button> : undefined}
      />

      {mode === "battalion" && !parentName && (
        <Card className="mb-4 p-4 bg-amber-50 border border-amber-200 text-amber-800 text-sm">היחידה אינה משויכת לחטיבה. פנה לאדמין-על לשיוך (הגדרות גדודים) כדי לפתוח דרישות.</Card>
      )}

      {/* דשבורד חריגות — חטיבה */}
      {mode === "brigade" && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
          {([["ממתין לאישור", counts.pending, "text-amber-600"], ["בטיפול", counts.inProgress, "text-blue-600"], ["דרוש מידע", counts.needsInfo, "text-orange-600"], ["נפתרו", counts.resolved, "text-emerald-600"]] as const).map(([label, n, cls]) => (
            <Card key={label} className="p-3 text-center">
              <div className={`text-2xl font-bold ${cls}`}>{n}</div>
              <div className="text-xs text-slate-500">{label}</div>
            </Card>
          ))}
        </div>
      )}

      {/* טופס דרישה חדשה */}
      {mode === "battalion" && showNew && parentName && (
        <Card className="mb-4 p-4">
          <form action={submitNew} className="space-y-3">
            <div className="flex flex-wrap gap-3">
              <div><label className="text-xs text-slate-500 block mb-1">סוג</label>
                <select name="type" className="rounded border border-slate-300 px-2 py-1 text-sm">
                  {REQUEST_TYPES.map((t) => <option key={t} value={t}>{REQUEST_TYPE_LABEL[t]}</option>)}
                </select></div>
              <div><label className="text-xs text-slate-500 block mb-1">עדיפות</label>
                <select name="priority" className="rounded border border-slate-300 px-2 py-1 text-sm">
                  {REQUEST_PRIORITIES.map((p) => <option key={p} value={p}>{REQUEST_PRIORITY_LABEL[p]}</option>)}
                </select></div>
              {companies.length > 0 && (
                <div><label className="text-xs text-slate-500 block mb-1">פלוגה (לא חובה)</label>
                  <select name="companyId" className="rounded border border-slate-300 px-2 py-1 text-sm"><option value="">—</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
              )}
            </div>
            <input name="title" placeholder="כותרת הדרישה" required className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
            <textarea name="description" placeholder="פירוט (לא חובה)" rows={3} className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
            <button disabled={pending} className="bg-blue-600 text-white rounded px-4 py-1.5 text-sm hover:bg-blue-700 disabled:opacity-50">שלח דרישה (ממתין לאישור מפקד)</button>
          </form>
        </Card>
      )}

      {/* פילטרים */}
      <div className="flex flex-wrap gap-2 mb-3 text-sm">
        <select value={fStatus} onChange={(e) => setFStatus(e.target.value as typeof fStatus)} className="rounded border border-slate-300 px-2 py-1">
          <option value="open">פתוחות</option><option value="all">הכל</option>
          {(Object.keys(REQUEST_STATUS_LABEL) as RequestStatus[]).map((s) => <option key={s} value={s}>{REQUEST_STATUS_LABEL[s]}</option>)}
        </select>
        <select value={fType} onChange={(e) => setFType(e.target.value as typeof fType)} className="rounded border border-slate-300 px-2 py-1">
          <option value="all">כל הסוגים</option>{REQUEST_TYPES.map((t) => <option key={t} value={t}>{REQUEST_TYPE_LABEL[t]}</option>)}
        </select>
      </div>

      {/* רשימת דרישות */}
      <div className="space-y-3">
        {filtered.length === 0 && <Card className="p-6 text-center text-slate-400">אין דרישות</Card>}
        {filtered.map((r) => (
          <Card key={r.id} className="p-4">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold">{REQUEST_TYPE_LABEL[r.type]} · {r.title}</span>
                  {r.priority !== "ROUTINE" && <span className="text-xs">{REQUEST_PRIORITY_LABEL[r.priority]}</span>}
                  <Badge className={REQUEST_STATUS_STYLE[r.status]}>{REQUEST_STATUS_LABEL[r.status]}</Badge>
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {mode === "brigade" && <span className="font-medium text-slate-600">מ: {r.openerName} · </span>}
                  פתח: {r.openedByName ?? "—"} · {new Date(r.createdAt).toLocaleDateString("he-IL")}
                  {r.assignedName && ` · מטפל: ${r.assignedName}`}
                </div>
                {r.description && <div className="text-sm text-slate-700 mt-1 whitespace-pre-wrap">{r.description}</div>}
              </div>
            </div>

            {/* thread דיווחי טיפול */}
            {r.updates.length > 0 && (
              <div className="mt-3 border-t border-slate-100 pt-2 space-y-1.5">
                {r.updates.map((u) => (
                  <div key={u.id} className="text-xs flex gap-2">
                    <span className="text-slate-400 whitespace-nowrap">{new Date(u.createdAt).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                    <span className="flex-1"><b className="text-slate-600">{u.authorName ?? "—"}:</b> {u.text}
                      {u.statusTo && <span className="text-slate-400"> ({u.statusFrom ? REQUEST_STATUS_LABEL[u.statusFrom] + " → " : ""}{REQUEST_STATUS_LABEL[u.statusTo]})</span>}</span>
                  </div>
                ))}
              </div>
            )}

            {/* פעולות */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {/* גדוד: אישור מפקד / ביטול */}
              {mode === "battalion" && r.status === "PENDING_APPROVAL" && isCommander && (
                <form action={(fd) => act(approveAndEscalate, fd)}><input type="hidden" name="id" value={r.id} /><button className="text-xs bg-emerald-600 text-white rounded px-3 py-1 hover:bg-emerald-700">✅ אשר והסלם לחטיבה</button></form>
              )}
              {mode === "battalion" && !["RESOLVED", "CANCELLED"].includes(r.status) && (
                <form action={(fd) => act(cancelRequest, fd)} onSubmit={(e) => { if (!confirm("לבטל את הדרישה?")) e.preventDefault(); }}><input type="hidden" name="id" value={r.id} /><button className="text-xs text-rose-500 hover:underline">בטל</button></form>
              )}
              {/* חטיבה: סטטוס טיפול */}
              {mode === "brigade" && !["RESOLVED", "REJECTED", "CANCELLED"].includes(r.status) && (
                <>
                  <button onClick={() => setStatus(r.id, "NEEDS_INFO")} className="text-xs bg-orange-50 border border-orange-200 text-orange-700 rounded px-2 py-1 hover:bg-orange-100">דרוש מידע</button>
                  <button onClick={() => setStatus(r.id, "RESOLVED")} className="text-xs bg-emerald-600 text-white rounded px-2 py-1 hover:bg-emerald-700">✅ נפתר</button>
                  <button onClick={() => setStatus(r.id, "REJECTED")} className="text-xs bg-rose-50 border border-rose-200 text-rose-700 rounded px-2 py-1 hover:bg-rose-100">נדחה</button>
                </>
              )}
              {/* עדכון/מענה — שני הצדדים */}
              {!["CANCELLED"].includes(r.status) && (
                replyTo === r.id ? (
                  <span className="flex items-center gap-1">
                    <input value={replyText} onChange={(e) => setReplyText(e.target.value)} placeholder="דיווח/מענה" className="rounded border border-slate-300 px-2 py-1 text-xs w-48" />
                    <button disabled={pending || !replyText.trim()} onClick={() => sendReply(r.id)} className="text-xs bg-blue-600 text-white rounded px-2 py-1 disabled:opacity-50">שלח</button>
                    <button onClick={() => { setReplyTo(null); setReplyText(""); }} className="text-xs text-slate-400">ביטול</button>
                  </span>
                ) : (
                  <button onClick={() => { setReplyTo(r.id); setReplyText(""); }} className="text-xs text-blue-600 hover:underline">💬 {mode === "brigade" ? "דיווח טיפול" : "הוסף עדכון"}</button>
                )
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
