"use client";

import { useState, useMemo, useTransition, Fragment } from "react";
import { useRouter } from "next/navigation";
import { saveSoldierLicenses, sendDrivingProcedureForSign } from "./actions";
import { toggleDriverFileApproval, sendDriverFormsToMany } from "../driver-files/actions";

type LicenseType = { id: string; name: string; kind: string };
type SoldierLicense = { licenseTypeId: string };
type Soldier = {
  id: string;
  fullName: string;
  companyName: string | null;
  squadName: string | null;
  drivingRefresherDate: string | null;
  procedureSignedAt: string | null;
  telegramLinked: boolean;
  licenses: SoldierLicense[];
  driverFile: { done: number; total: number; approved: boolean; anyExpired: boolean };
};

function refreshInfo(refresherDate: string | null, refreshDays: number): { label: string; cls: string } {
  if (!refresherDate) return { label: "לא בוצע ריענון", cls: "bg-rose-100 text-rose-700" };
  const expiry = new Date(refresherDate);
  expiry.setDate(expiry.getDate() + refreshDays);
  const daysLeft = Math.ceil((expiry.getTime() - Date.now()) / 86400000);
  const d = new Date(refresherDate).toLocaleDateString("he-IL");
  if (daysLeft < 0) return { label: `פג (${d})`, cls: "bg-rose-100 text-rose-700 font-bold" };       // אדום — עבר
  if (daysLeft <= 90) return { label: `${d} · ${daysLeft} ימים`, cls: "bg-amber-100 text-amber-800" }; // צהוב — פחות מ-90
  return { label: d, cls: "bg-emerald-50 text-emerald-700" };
}

export default function LicenseEditor({
  soldiers, licenseTypes, canEdit, drivingRefreshDays, hasProcedureText, procedureUpdatedAt,
}: {
  soldiers: Soldier[];
  licenseTypes: LicenseType[];
  canEdit: boolean;
  drivingRefreshDays: number;
  hasProcedureText: boolean;
  procedureUpdatedAt: string | null;
}) {
  // חתימה תקפה רק אם נחתמה אחרי העדכון האחרון של הנוסח (גרסה חדשה → נדרשת חתימה מחדש)
  const procStatus = (signedAt: string | null): "signed" | "stale" | "none" => {
    if (!signedAt) return "none";
    if (procedureUpdatedAt && new Date(signedAt) < new Date(procedureUpdatedAt)) return "stale";
    return "signed";
  };
  const router = useRouter();
  const [editingSoldier, setEditingSoldier] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [refresherDate, setRefresherDate] = useState("");
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [onlyDrivers, setOnlyDrivers] = useState(false);
  const [fileFilter, setFileFilter] = useState<"" | "approved" | "unapproved" | "incomplete" | "expired">("");
  const [sendMsg, setSendMsg] = useState<string | null>(null);

  const typeById = useMemo(() => new Map(licenseTypes.map((t) => [t.id, t])), [licenseTypes]);
  const licenseTypesL = useMemo(() => licenseTypes.filter((t) => t.kind === "LICENSE"), [licenseTypes]);
  const permitTypesL = useMemo(() => licenseTypes.filter((t) => t.kind !== "LICENSE"), [licenseTypes]);

  const filtered = useMemo(() => {
    let list = soldiers;
    // "נהג" = יש רישיון/היתר, או שבוצע לו ריענון, או שחתם על נוהל (גם לפני מתן רישיון פורמלי)
    if (onlyDrivers) list = list.filter((s) => s.licenses.length > 0 || !!s.drivingRefresherDate || !!s.procedureSignedAt);
    if (fileFilter) list = list.filter((s) => {
      const f = s.driverFile;
      if (fileFilter === "approved") return f.approved;
      if (fileFilter === "unapproved") return !f.approved;
      if (fileFilter === "incomplete") return f.done < f.total;
      if (fileFilter === "expired") return f.anyExpired;
      return true;
    });
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((s) => s.fullName.toLowerCase().includes(q) ||
        (s.companyName && s.companyName.toLowerCase().includes(q)) || (s.squadName && s.squadName.toLowerCase().includes(q)));
    }
    return list;
  }, [soldiers, search, onlyDrivers, fileFilter]);

  // דשבורד סיכום
  const dash = useMemo(() => {
    const drivers = soldiers.filter((s) => s.licenses.length > 0 || !!s.drivingRefresherDate || !!s.procedureSignedAt);
    return {
      drivers: drivers.length,
      approved: drivers.filter((s) => s.driverFile.approved).length,
      incomplete: drivers.filter((s) => s.driverFile.done < s.driverFile.total).length,
      expired: drivers.filter((s) => s.driverFile.anyExpired).length,
    };
  }, [soldiers]);

  function approveFile(id: string) { startTransition(async () => { await toggleDriverFileApproval(id); router.refresh(); }); }
  function sendFormsToFiltered() {
    const targets = filtered.filter((s) => s.telegramLinked).map((s) => s.id);
    if (targets.length === 0) { setSendMsg("אין נהגים מחוברים לבוט בבחירה הנוכחית"); setTimeout(() => setSendMsg(null), 3000); return; }
    if (!confirm(`לשלוח טפסי נהג בבוט ל-${targets.length} הנהגים הנבחרים (המסוננים כעת)?`)) return;
    startTransition(async () => { const r = await sendDriverFormsToMany(targets); setSendMsg(r.error ? "⚠️ " + r.error : `✅ נשלח ל-${r.sent} נהגים`); setTimeout(() => setSendMsg(null), 4000); });
  }

  function startEdit(s: Soldier) {
    setEditingSoldier(s.id);
    setSelected(new Set(s.licenses.map((l) => l.licenseTypeId)));
    setRefresherDate(s.drivingRefresherDate || "");
  }
  function toggle(id: string) { setSelected((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; }); }
  function handleSave(soldierId: string) {
    const fd = new FormData();
    fd.set("soldierId", soldierId);
    selected.forEach((id) => fd.append("licenseTypeId", id));
    if (refresherDate) fd.set("refresherDate", refresherDate);
    startTransition(async () => { await saveSoldierLicenses(fd); setEditingSoldier(null); router.refresh(); });
  }
  function sendProcedure(soldierId: string) {
    const fd = new FormData(); fd.set("soldierId", soldierId);
    startTransition(async () => {
      const r = await sendDrivingProcedureForSign(fd);
      setSendMsg(r.ok ? "✓ נשלח לחייל בטלגרם" : (r.error || "שגיאה"));
      setTimeout(() => setSendMsg(null), 3000);
    });
  }

  const names = (s: Soldier, kind: "LICENSE" | "PERMIT") =>
    s.licenses.map((l) => typeById.get(l.licenseTypeId)).filter((t): t is LicenseType => !!t && (kind === "LICENSE" ? t.kind === "LICENSE" : t.kind !== "LICENSE"));

  return (
    <div>
      {/* דשבורד סיכום */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        <button onClick={() => setFileFilter("")} className="rounded-xl border border-slate-200 bg-white p-2.5 text-center hover:bg-slate-50">
          <div className="text-xl font-bold text-slate-800">{dash.drivers}</div><div className="text-[11px] text-slate-500">נהגים</div>
        </button>
        <button onClick={() => setFileFilter("approved")} className={`rounded-xl border p-2.5 text-center ${fileFilter === "approved" ? "border-emerald-400 bg-emerald-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
          <div className="text-xl font-bold text-emerald-600">{dash.approved}</div><div className="text-[11px] text-slate-500">תיקים מאושרים</div>
        </button>
        <button onClick={() => setFileFilter("incomplete")} className={`rounded-xl border p-2.5 text-center ${fileFilter === "incomplete" ? "border-amber-400 bg-amber-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
          <div className="text-xl font-bold text-amber-600">{dash.incomplete}</div><div className="text-[11px] text-slate-500">תיקים חסרים</div>
        </button>
        <button onClick={() => setFileFilter("expired")} className={`rounded-xl border p-2.5 text-center ${fileFilter === "expired" ? "border-rose-400 bg-rose-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
          <div className="text-xl font-bold text-rose-600">{dash.expired}</div><div className="text-[11px] text-slate-500">פג תוקף</div>
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 חיפוש חייל / פלוגה / מחלקה..."
          className="flex-1 min-w-[180px] border border-slate-300 rounded-lg px-3 py-2 text-sm" />
        <select value={fileFilter} onChange={(e) => setFileFilter(e.target.value as typeof fileFilter)} className="border border-slate-300 rounded-lg px-2 py-2 text-sm">
          <option value="">כל התיקים</option>
          <option value="approved">מאושרים ✓</option>
          <option value="unapproved">לא מאושרים</option>
          <option value="incomplete">חסרים</option>
          <option value="expired">פג תוקף</option>
        </select>
        <label className="flex items-center gap-1.5 text-sm text-slate-600 select-none">
          <input type="checkbox" checked={onlyDrivers} onChange={(e) => setOnlyDrivers(e.target.checked)} className="rounded" />
          רק בעלי הרשאה
        </label>
        {canEdit && (
          <button onClick={sendFormsToFiltered} disabled={pending}
            className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-3 py-2 disabled:opacity-50" title="שולח טפסי נהג בבוט לכל הנהגים המסוננים כעת (המחוברים לבוט)">
            📲 שלח טפסים לנבחרים ({filtered.filter((s) => s.telegramLinked).length})
          </button>
        )}
        {sendMsg && <span className="text-sm text-emerald-600">{sendMsg}</span>}
      </div>

      <div className="overflow-x-auto border border-slate-200 rounded-xl">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-slate-100 text-slate-600 text-xs">
              <th className="px-3 py-2 text-right font-medium">חייל</th>
              <th className="px-3 py-2 text-right font-medium">פלוגה · מחלקה</th>
              <th className="px-3 py-2 text-right font-medium">🪪 רשיונות</th>
              <th className="px-3 py-2 text-right font-medium">🎖️ היתרים</th>
              <th className="px-3 py-2 text-right font-medium">🔄 ריענון</th>
              <th className="px-3 py-2 text-right font-medium">📝 נוהל נהיגה</th>
              <th className="px-3 py-2 text-right font-medium">📁 תיק נהג</th>
              {canEdit && <th className="px-3 py-2"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((s) => {
              const isEditing = editingSoldier === s.id;
              const ref = refreshInfo(s.drivingRefresherDate, drivingRefreshDays);
              return (
                <Fragment key={s.id}>
                  <tr className={isEditing ? "bg-blue-50/50" : "hover:bg-slate-50"}>
                    <td className="px-3 py-2 font-medium text-slate-800 whitespace-nowrap">
                      {s.fullName}
                      {s.telegramLinked ? <span className="text-[10px] text-sky-600 mr-1" title="מחובר לבוט">📲</span> : <span className="text-[10px] text-slate-300 mr-1">📵</span>}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-500 whitespace-nowrap">{s.companyName ?? "—"}{s.squadName ? ` · ${s.squadName}` : ""}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {names(s, "LICENSE").map((t) => <span key={t.id} className="text-[11px] bg-blue-50 text-blue-700 rounded px-1.5 py-0.5 whitespace-nowrap">{t.name}</span>)}
                        {names(s, "LICENSE").length === 0 && <span className="text-slate-300 text-xs">—</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1 max-w-md">
                        {names(s, "PERMIT").map((t) => <span key={t.id} className="text-[11px] bg-slate-100 text-slate-700 rounded px-1.5 py-0.5 whitespace-nowrap">{t.name}</span>)}
                        {names(s, "PERMIT").length === 0 && <span className="text-slate-300 text-xs">—</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {s.drivingRefresherDate || s.licenses.length > 0
                        ? <span className={`text-[11px] rounded px-2 py-0.5 ${ref.cls}`}>{ref.label}</span>
                        : <span className="text-slate-300 text-xs">—</span>}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {(() => {
                        const st = procStatus(s.procedureSignedAt);
                        if (st === "signed") return <span className="text-[11px] text-emerald-700">✓ חתם {new Date(s.procedureSignedAt!).toLocaleDateString("he-IL")}</span>;
                        return (
                          <div className="flex items-center gap-1.5">
                            {st === "stale"
                              ? <span className="text-[11px] text-amber-700" title={`חתם ${new Date(s.procedureSignedAt!).toLocaleDateString("he-IL")} — לפני עדכון הנוסח`}>🔄 עודכן — חתימה מחדש</span>
                              : <span className="text-[11px] text-slate-400">לא חתם</span>}
                            {canEdit && hasProcedureText && s.telegramLinked && (
                              <button onClick={() => sendProcedure(s.id)} disabled={pending} className="text-[11px] text-sky-600 hover:underline">📲 שלח לחתימה</button>
                            )}
                            {canEdit && hasProcedureText && !s.telegramLinked && (
                              <span className="text-[10px] text-slate-300" title="החייל אינו מחובר לבוט — לא ניתן לשלוח לחתימה">📵 לא בבוט</span>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                    {/* 📁 תיק נהג — פתיחה + סטטוס + אישור */}
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <a href={`/driver-files/${s.id}`}
                          className={`text-xs rounded-lg px-2 py-1 border font-medium ${s.driverFile.anyExpired ? "border-rose-300 bg-rose-50 text-rose-700" : s.driverFile.done >= s.driverFile.total ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-amber-300 bg-amber-50 text-amber-700"}`}
                          title="פתח תיק נהג">
                          📁 {s.driverFile.done}/{s.driverFile.total}
                        </a>
                        {canEdit && (
                          <button onClick={() => approveFile(s.id)} disabled={pending}
                            className={`text-xs rounded px-1.5 py-1 ${s.driverFile.approved ? "text-emerald-600" : "text-slate-300 hover:text-slate-500"}`}
                            title={s.driverFile.approved ? "תיק מאושר — בטל אישור" : "אשר תיק"}>
                            {s.driverFile.approved ? "☑ מאושר" : "☐ אשר"}
                          </button>
                        )}
                      </div>
                    </td>
                    {canEdit && (
                      <td className="px-3 py-2 whitespace-nowrap">
                        <button onClick={() => (isEditing ? setEditingSoldier(null) : startEdit(s))} className="text-xs text-blue-600 hover:underline">{isEditing ? "סגור" : "✏️ עריכה"}</button>
                      </td>
                    )}
                  </tr>
                  {isEditing && (
                    <tr className="bg-blue-50/30">
                      <td colSpan={canEdit ? 8 : 7} className="px-3 py-3">
                        <div className="space-y-3">
                          <div>
                            <div className="text-xs font-medium text-blue-700 mb-1.5">🪪 רשיונות נהיגה:</div>
                            <div className="flex flex-wrap gap-1.5">
                              {licenseTypesL.map((lt) => {
                                const on = selected.has(lt.id);
                                return <button key={lt.id} type="button" onClick={() => toggle(lt.id)}
                                  className={`text-xs rounded-lg border px-2.5 py-1 ${on ? "bg-blue-100 border-blue-400 text-blue-800 font-medium" : "bg-white border-slate-200 text-slate-600 hover:border-slate-400"}`}>{on ? "✓ " : ""}{lt.name}</button>;
                              })}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs font-medium text-slate-600 mb-1.5">🎖️ היתרי נהיגה:</div>
                            <div className="flex flex-wrap gap-1.5">
                              {permitTypesL.map((lt) => {
                                const on = selected.has(lt.id);
                                return <button key={lt.id} type="button" onClick={() => toggle(lt.id)}
                                  className={`text-xs rounded-lg border px-2.5 py-1 ${on ? "bg-emerald-50 border-emerald-400 text-emerald-800 font-medium" : "bg-white border-slate-200 text-slate-600 hover:border-slate-400"}`}>{on ? "✓ " : ""}{lt.name}</button>;
                              })}
                            </div>
                          </div>
                          <div className="flex items-center gap-3 flex-wrap">
                            <label className="flex items-center gap-2 text-sm">
                              <span className="text-slate-500">תאריך ריענון אחרון:</span>
                              <input type="date" value={refresherDate} onChange={(e) => setRefresherDate(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
                            </label>
                            <button onClick={() => handleSave(s.id)} disabled={pending} className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-1.5 text-sm font-medium disabled:opacity-50">{pending ? "שומר…" : "שמור"}</button>
                            <button onClick={() => setEditingSoldier(null)} className="rounded-lg border border-slate-300 px-4 py-1.5 text-sm">ביטול</button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="text-sm text-slate-400 p-4 text-center">לא נמצאו חיילים</div>}
      </div>
      <div className="text-xs text-slate-400 mt-2">{filtered.length} חיילים · ריענון תקף ל-{drivingRefreshDays} ימים</div>
    </div>
  );
}
