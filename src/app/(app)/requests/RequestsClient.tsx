"use client";

import { useState, useTransition, useMemo } from "react";
import { PageHeader, Card, Badge } from "@/components/ui";
import { REQUEST_TYPE_LABEL, REQUEST_PRIORITY_LABEL, REQUEST_STATUS_LABEL, REQUEST_STATUS_STYLE, REQUEST_TYPES, REQUEST_PRIORITIES } from "@/lib/request-labels";
import type { RequestType, RequestPriority, RequestStatus } from "@/generated/prisma";
import { createRequest, approveAndEscalate, cancelRequest, addRequestUpdate, setRequestStatus, assignTypeHandler, removeTypeHandler, setTypeConfig, addFieldDef, removeFieldDef, saveHandlerFields, addResponsible, removeResponsible, ensureTransportParties } from "./actions";

type TransportLink = { role: "LOADER" | "UNLOADER"; label: string; name: string | null; link: string | null; reportText: string | null; reportedAt: string | null };

type Upd = { id: string; authorName: string | null; text: string; statusFrom: RequestStatus | null; statusTo: RequestStatus | null; createdAt: string };
type DynField = { fieldKey: string; label: string; fieldType: string; options: string[]; required: boolean };
type Req = {
  id: string; type: RequestType; title: string; description: string | null; priority: RequestPriority; status: RequestStatus;
  openerName: string; openedByName: string | null; assignedName: string | null; data: Record<string, string> | null; createdAt: string; escalatedAt: string | null; updates: Upd[];
};

function DynFieldInput({ f, defaultValue, namePrefix = "f_" }: { f: DynField; defaultValue?: string; namePrefix?: string }) {
  const cls = "w-full rounded border border-slate-300 px-2 py-1 text-sm";
  const name = `${namePrefix}${f.fieldKey}`;
  const dv = defaultValue ?? "";
  if (f.fieldType === "TEXTAREA") return <textarea name={name} required={f.required} placeholder={f.label} rows={2} defaultValue={dv} className={cls} />;
  if (f.fieldType === "NUMBER") return <input type="number" name={name} required={f.required} placeholder={f.label} defaultValue={dv} className={cls} />;
  if (f.fieldType === "DATE") return <input type="date" name={name} required={f.required} defaultValue={dv} className={cls} />;
  if (f.fieldType === "TIME") return <input type="time" name={name} required={f.required} defaultValue={dv} className={cls} />;
  if (f.fieldType === "SELECT") return <select name={name} required={f.required} defaultValue={dv} className={cls}><option value="">— {f.label} —</option>{f.options.map((o) => <option key={o} value={o}>{o}</option>)}</select>;
  return <input name={name} required={f.required} placeholder={f.fieldType === "CONTACT" ? `${f.label} (שם + טלפון)` : f.label} defaultValue={dv} className={cls} />;
}

type SettingsDef = { id: string; type: RequestType; side: string; label: string; fieldType: string; options: string[]; required: boolean };
type TypeConfig = { type: RequestType; requiresApproval: boolean; requestDays: string | null; requestHours: string | null; supplyTiming: string | null };

type Responsible = { id: string; type: RequestType; name: string; phone: string | null; hasAccount: boolean; bound: boolean; token: string };

export default function RequestsClient({ mode, unitName, parentName, isCommander, isMalka, myTypes, companies, requests, fieldsByType, handlerFieldsByType, brigadeUsers, handlers, settingsDefs, typeConfigs, responsibles, battalionUsers, botUsername, foodMetric }: {
  mode: "brigade" | "battalion";
  unitName: string; parentName: string | null; isCommander: boolean; isMalka: boolean;
  myTypes: RequestType[] | null;
  companies: { id: string; name: string }[];
  requests: Req[];
  fieldsByType: Record<string, DynField[]>;
  handlerFieldsByType: Record<string, DynField[]>;
  brigadeUsers: { id: string; name: string }[];
  handlers: { id: string; type: RequestType; userId: string }[];
  settingsDefs: SettingsDef[];
  typeConfigs: TypeConfig[];
  responsibles: Responsible[];
  battalionUsers: { id: string; name: string }[];
  botUsername: string | null;
  foodMetric: { unit: string; total: number; diets: { type: string; count: number }[] }[];
}) {
  const [pending, start] = useTransition();
  const [showNew, setShowNew] = useState(false);
  const [newType, setNewType] = useState<RequestType>("SUPPLY");
  const [tab, setTab] = useState<"list" | "settings" | "food">("list");
  const [fStatus, setFStatus] = useState<RequestStatus | "all" | "open">("open");
  const [fType, setFType] = useState<RequestType | "all">("all");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [handlerFor, setHandlerFor] = useState<string | null>(null);
  const [transportLinks, setTransportLinks] = useState<Record<string, TransportLink[]>>({});

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
  const loadTransport = (id: string) => start(async () => { const res = await ensureTransportParties(id); if (res.error) alert(res.error); else setTransportLinks((m) => ({ ...m, [id]: res.links ?? [] })); });

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

      {/* טאבים: דרישות / הגדרות / מזון */}
      {(isMalka || (mode === "battalion" && isCommander)) && (
        <div className="flex rounded-lg border border-slate-200 overflow-hidden w-fit mb-3 text-sm">
          <button onClick={() => setTab("list")} className={`px-3 py-1 ${tab === "list" ? "bg-indigo-600 text-white" : "bg-white text-slate-600"}`}>דרישות</button>
          <button onClick={() => setTab("settings")} className={`px-3 py-1 ${tab === "settings" ? "bg-indigo-600 text-white" : "bg-white text-slate-600"}`}>{isMalka ? "⚙️ בעלי תפקיד" : "⚙️ אחראי-תחום"}</button>
          <button onClick={() => setTab("food")} className={`px-3 py-1 ${tab === "food" ? "bg-indigo-600 text-white" : "bg-white text-slate-600"}`}>🍽️ מזון</button>
        </div>
      )}
      {myTypes && (
        <div className="text-xs text-slate-500 mb-2">בעל תפקיד — סוגים באחריותך: <b>{myTypes.length ? myTypes.map((t) => REQUEST_TYPE_LABEL[t]).join(", ") : "טרם הוקצו סוגים"}</b></div>
      )}

      {/* הגדרות בעלי-תפקיד — מלכ"א */}
      {isMalka && tab === "settings" && (
        <div className="space-y-2">
          <p className="text-sm text-slate-500">הקצה משתמש/ים לכל סוג דרישה. בעל תפקיד יראה ויטפל רק בסוגים שהוקצו לו.</p>
          {REQUEST_TYPES.map((t) => {
            const assigned = handlers.filter((h) => h.type === t);
            return (
              <Card key={t} className="p-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="font-medium text-sm">{REQUEST_TYPE_LABEL[t]}</span>
                  <form action={(fd) => start(async () => { const r = await assignTypeHandler(fd); if (r.error) alert(r.error); })} className="flex items-center gap-1">
                    <input type="hidden" name="type" value={t} />
                    <select name="userId" className="text-xs rounded border border-slate-300 px-1.5 py-0.5" defaultValue="">
                      <option value="" disabled>+ הוסף אחראי</option>
                      {brigadeUsers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                    <button className="text-xs bg-indigo-600 text-white rounded px-2 py-0.5 hover:bg-indigo-700">הוסף</button>
                  </form>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {assigned.length === 0 && <span className="text-xs text-slate-300">— אין אחראי —</span>}
                  {assigned.map((h) => {
                    const u = brigadeUsers.find((x) => x.id === h.userId);
                    return (
                      <span key={h.id} className="text-xs bg-slate-100 rounded-full px-2 py-0.5 flex items-center gap-1">
                        {u?.name ?? "—"}
                        <form action={(fd) => start(async () => { await removeTypeHandler(fd); })} className="inline">
                          <input type="hidden" name="id" value={h.id} />
                          <button className="text-rose-500 hover:text-rose-700">×</button>
                        </form>
                      </span>
                    );
                  })}
                </div>

                {/* הגדרת סוג — אישור מפמ + חלון בקשה */}
                <form action={(fd) => start(async () => { const r = await setTypeConfig(fd); if (r.error) alert(r.error); })} className="flex flex-wrap items-center gap-2 text-xs mt-3 border-t border-slate-100 pt-2">
                  <input type="hidden" name="type" value={t} />
                  <label className="flex items-center gap-1"><input type="checkbox" name="requiresApproval" defaultChecked={typeConfigs.find((c) => c.type === t)?.requiresApproval ?? false} /> אישור מפמ</label>
                  <input name="requestDays" defaultValue={typeConfigs.find((c) => c.type === t)?.requestDays ?? ""} placeholder="ימי בקשה" className="rounded border border-slate-300 px-1.5 py-0.5 w-20" />
                  <input name="requestHours" defaultValue={typeConfigs.find((c) => c.type === t)?.requestHours ?? ""} placeholder="שעות" className="rounded border border-slate-300 px-1.5 py-0.5 w-24" />
                  <input name="supplyTiming" defaultValue={typeConfigs.find((c) => c.type === t)?.supplyTiming ?? ""} placeholder="מתי אספקה" className="rounded border border-slate-300 px-1.5 py-0.5 w-28" />
                  <button className="bg-slate-700 text-white rounded px-2 py-0.5">שמור</button>
                </form>

                {/* עריכת שדות דינמיים — מבקש/מטפל */}
                {(["REQUESTER", "HANDLER"] as const).map((side) => {
                  const fs = settingsDefs.filter((d) => d.type === t && d.side === side);
                  return (
                    <div key={side} className="mt-2">
                      <div className="text-[11px] font-semibold text-slate-500">{side === "REQUESTER" ? "שדות מבקש" : "שדות מטפל"}</div>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {fs.length === 0 && <span className="text-xs text-slate-300">— אין —</span>}
                        {fs.map((f) => (
                          <span key={f.id} className="text-xs bg-blue-50 border border-blue-100 rounded px-2 py-0.5 flex items-center gap-1">
                            {f.label}<span className="text-slate-400">{f.options.length ? `(${f.options.join("/")})` : ""}</span>
                            <form action={(fd) => start(async () => { await removeFieldDef(fd); })} className="inline"><input type="hidden" name="id" value={f.id} /><button className="text-rose-500">×</button></form>
                          </span>
                        ))}
                      </div>
                      <form action={(fd) => start(async () => { const r = await addFieldDef(fd); if (r.error) alert(r.error); })} className="flex flex-wrap items-center gap-1 mt-1 text-xs">
                        <input type="hidden" name="type" value={t} /><input type="hidden" name="side" value={side} />
                        <input name="label" placeholder="שם שדה" className="rounded border border-slate-300 px-1.5 py-0.5 w-24" />
                        <select name="fieldType" className="rounded border border-slate-300 px-1 py-0.5" defaultValue="TEXT"><option value="TEXT">טקסט</option><option value="TEXTAREA">ארוך</option><option value="NUMBER">מספר</option><option value="SELECT">בחירה</option><option value="DATE">תאריך</option><option value="TIME">שעה</option><option value="CONTACT">איש קשר</option></select>
                        <input name="options" placeholder="אופציות (פסיק)" className="rounded border border-slate-300 px-1.5 py-0.5 w-28" />
                        <label className="flex items-center gap-0.5"><input type="checkbox" name="required" /> חובה</label>
                        <button className="bg-indigo-600 text-white rounded px-2 py-0.5">+</button>
                      </form>
                    </div>
                  );
                })}
              </Card>
            );
          })}
        </div>
      )}

      {/* הגדרות אחראי-תחום — מפקד גדוד */}
      {mode === "battalion" && isCommander && tab === "settings" && (
        <div className="space-y-2">
          <p className="text-sm text-slate-500">הגדר מי אחראי על כל סוג דרישה בגדוד. אפשר לבחור משתמש קיים במערכת, או להוסיף חייל ללא חשבון שיקבל התראות דרך הבוט (עם קישור אישי). האחראי מקבל התראה על כל עדכון סטטוס/טיפול בדרישות מהסוג שלו.</p>
          {REQUEST_TYPES.map((t) => {
            const rs = responsibles.filter((r) => r.type === t);
            return (
              <Card key={t} className="p-3">
                <div className="font-medium text-sm mb-2">{REQUEST_TYPE_LABEL[t]}</div>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {rs.length === 0 && <span className="text-xs text-slate-300">— אין אחראי —</span>}
                  {rs.map((r) => {
                    const link = !r.hasAccount && botUsername ? `https://t.me/${botUsername}?start=resp_${r.token}` : null;
                    return (
                      <span key={r.id} className="text-xs bg-slate-100 rounded-full px-2 py-0.5 flex items-center gap-1">
                        {r.hasAccount ? "👤" : r.bound ? "🤖✅" : "🤖"} {r.name}{r.phone ? ` · ${r.phone}` : ""}
                        {link && !r.bound && <a href={link} target="_blank" rel="noreferrer" className="text-sky-600 underline">קישור בוט</a>}
                        <form action={(fd) => start(async () => { await removeResponsible(fd); })} className="inline"><input type="hidden" name="id" value={r.id} /><button className="text-rose-500 hover:text-rose-700">×</button></form>
                      </span>
                    );
                  })}
                </div>
                <form action={(fd) => start(async () => { const res = await addResponsible(fd); if (res.error) alert(res.error); })} className="flex flex-wrap items-end gap-1.5 text-xs border-t border-slate-100 pt-2">
                  <input type="hidden" name="type" value={t} />
                  <div><label className="block text-[11px] text-slate-400">משתמש במערכת</label>
                    <select name="userId" defaultValue="" className="rounded border border-slate-300 px-1.5 py-0.5">
                      <option value="">— חייל ללא חשבון —</option>
                      {battalionUsers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select></div>
                  <div><label className="block text-[11px] text-slate-400">או שם (ללא חשבון)</label>
                    <input name="name" placeholder="שם מלא" className="rounded border border-slate-300 px-1.5 py-0.5 w-28" /></div>
                  <div><label className="block text-[11px] text-slate-400">טלפון</label>
                    <input name="phone" placeholder="טלפון" className="rounded border border-slate-300 px-1.5 py-0.5 w-24" /></div>
                  <button className="bg-indigo-600 text-white rounded px-2 py-1 hover:bg-indigo-700">➕ הוסף</button>
                </form>
              </Card>
            );
          })}
        </div>
      )}

      {/* 🍽️ מדד מזון מיוחד */}
      {tab === "food" && (
        <div className="space-y-2">
          <p className="text-sm text-slate-500">כמות חיילים עם דרישת מזון מיוחד (דיווח עצמי בבוט), לפי {mode === "brigade" ? "גדוד" : "פלוגה"}. סה״כ מיוחדים: <b>{foodMetric.reduce((s, r) => s + r.total, 0)}</b>.</p>
          {foodMetric.length === 0 && <Card className="p-6 text-center text-slate-400">אין דיווחי מזון מיוחד</Card>}
          <div className="grid sm:grid-cols-2 gap-2">
            {foodMetric.map((r) => (
              <Card key={r.unit} className="p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-sm">{r.unit}</span>
                  <span className="text-lg font-bold text-emerald-600">{r.total}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {r.diets.map((d) => (
                    <span key={d.type} className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-full px-2 py-0.5">{d.type}: <b>{d.count}</b></span>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {tab !== "list" ? null : (<>

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
                <select name="type" value={newType} onChange={(e) => setNewType(e.target.value as RequestType)} className="rounded border border-slate-300 px-2 py-1 text-sm">
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
            {/* שדות דינמיים פר-סוג */}
            {(fieldsByType[newType] ?? []).length > 0 && (
              <div className="grid sm:grid-cols-2 gap-2 border-t border-slate-100 pt-2">
                {(fieldsByType[newType] ?? []).map((f) => (
                  <div key={f.fieldKey}><label className="text-xs text-slate-500 block mb-0.5">{f.label}{f.required ? " *" : ""}</label><DynFieldInput f={f} /></div>
                ))}
              </div>
            )}
            <textarea name="description" placeholder="פירוט/הערות (לא חובה)" rows={2} className="w-full rounded border border-slate-300 px-3 py-2 text-sm" />
            <button disabled={pending} className="bg-blue-600 text-white rounded px-4 py-1.5 text-sm hover:bg-blue-700 disabled:opacity-50">שלח דרישה</button>
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
          <option value="all">{myTypes ? "כל הסוגים שלי" : "כל הסוגים"}</option>{(myTypes ?? REQUEST_TYPES).map((t) => <option key={t} value={t}>{REQUEST_TYPE_LABEL[t]}</option>)}
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
                {r.data && Object.keys(r.data).filter((k) => !k.startsWith("h:")).length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-600">
                    {Object.entries(r.data).filter(([k]) => !k.startsWith("h:")).map(([k, v]) => {
                      const label = (fieldsByType[r.type] ?? []).find((f) => f.fieldKey === k)?.label ?? k;
                      return <span key={k}><b className="text-slate-500">{label}:</b> {v}</span>;
                    })}
                  </div>
                )}
                {r.data && Object.keys(r.data).some((k) => k.startsWith("h:")) && (
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-emerald-700 bg-emerald-50 rounded px-2 py-1">
                    <span className="text-emerald-500 font-medium">טיפול:</span>
                    {Object.entries(r.data).filter(([k]) => k.startsWith("h:")).map(([k, v]) => {
                      const key = k.slice(2);
                      const label = (handlerFieldsByType[r.type] ?? []).find((f) => f.fieldKey === key)?.label ?? key;
                      return <span key={k}><b className="text-emerald-600">{label}:</b> {v}</span>;
                    })}
                  </div>
                )}
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
              {/* חטיבה: מילוי שדות טיפול דינמיים */}
              {mode === "brigade" && (handlerFieldsByType[r.type] ?? []).length > 0 && !["CANCELLED", "REJECTED"].includes(r.status) && (
                <button onClick={() => setHandlerFor((v) => (v === r.id ? null : r.id))} className="text-xs bg-teal-50 border border-teal-200 text-teal-700 rounded px-2 py-1 hover:bg-teal-100">📝 שדות טיפול</button>
              )}
              {/* הובלה: קישורי מעמיס/פורק לעדכון דרך הבוט */}
              {r.type === "TRANSPORT" && !["CANCELLED", "REJECTED"].includes(r.status) && (
                <button disabled={pending} onClick={() => loadTransport(r.id)} className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded px-2 py-1 hover:bg-amber-100 disabled:opacity-50">🚚 מעמיס/פורק</button>
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

            {/* טופס שדות טיפול — חטיבה */}
            {mode === "brigade" && handlerFor === r.id && (handlerFieldsByType[r.type] ?? []).length > 0 && (
              <form
                action={(fd) => { fd.set("id", r.id); start(async () => { const res = await saveHandlerFields(fd); if (res.error) alert(res.error); else setHandlerFor(null); }); }}
                className="mt-3 border-t border-teal-100 pt-3 grid sm:grid-cols-2 gap-2 bg-teal-50/40 rounded p-2"
              >
                {(handlerFieldsByType[r.type] ?? []).map((f) => (
                  <div key={f.fieldKey}>
                    <label className="text-xs text-slate-500 block mb-0.5">{f.label}{f.required ? " *" : ""}</label>
                    <DynFieldInput f={f} namePrefix="fh_" defaultValue={r.data?.[`h:${f.fieldKey}`]} />
                  </div>
                ))}
                <div className="sm:col-span-2 flex gap-2">
                  <button disabled={pending} className="text-xs bg-teal-600 text-white rounded px-3 py-1.5 hover:bg-teal-700 disabled:opacity-50">שמור שדות טיפול</button>
                  <button type="button" onClick={() => setHandlerFor(null)} className="text-xs text-slate-400">ביטול</button>
                </div>
              </form>
            )}

            {/* הובלה: קישורי מעמיס/פורק + דיווחים */}
            {transportLinks[r.id] && (
              <div className="mt-3 border-t border-amber-100 pt-3 space-y-2 bg-amber-50/40 rounded p-2">
                <div className="text-xs font-semibold text-amber-800">🚚 עדכון מעמיס/פורק דרך הבוט</div>
                {transportLinks[r.id].map((p) => (
                  <div key={p.role} className="text-xs flex flex-wrap items-center gap-2">
                    <b className="text-slate-600">{p.label}{p.name ? ` · ${p.name}` : ""}:</b>
                    {p.reportedAt ? (
                      <span className="text-emerald-700">✅ דיווח ({new Date(p.reportedAt).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}): {p.reportText}</span>
                    ) : p.link ? (
                      <>
                        <a href={p.link} target="_blank" rel="noreferrer" className="text-sky-600 underline">קישור בוט</a>
                        <a href={`https://wa.me/?text=${encodeURIComponent(`עדכון ${p.label} להובלה — לחצו לחיבור ודיווח: ${p.link}`)}`} target="_blank" rel="noreferrer" className="text-emerald-600 underline">שלח ב-WhatsApp</a>
                        <span className="text-slate-400">טרם דיווח</span>
                      </>
                    ) : (
                      <span className="text-slate-400">⚠️ אין בוט מוגדר לגדוד</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        ))}
      </div>
      </>)}
    </div>
  );
}
