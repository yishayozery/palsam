"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, Badge } from "@/components/ui";
import {
  saveCourseType, toggleCourseType, saveCourseInstance, setCourseInstanceStatus,
  deleteCourseInstance, setCourseAllocations, enrollSoldier, dropEnrollment,
  completeEnrollment, createCourseRequest, setRequestStatus, seedDefaultCourseCatalog,
} from "./actions";

type Opt = { id: string; name: string };
type CourseType = {
  id: string; name: string; description: string | null; active: boolean; instanceCount: number;
  prereqCerts: string[]; prereqLicenses: string[]; grantCerts: string[]; grantLicenses: string[];
};
type Enrollment = { id: string; soldierId: string; soldierName: string; companyId: string | null; companyName: string | null; status: string };
type Allocation = { companyId: string; slots: number };
type Instance = {
  id: string; courseTypeId: string; courseName: string; location: string | null; startDate: string | null;
  hours: string | null; bringItems: string | null; contactName: string | null; contactPhone: string | null;
  totalSlots: number | null; notes: string | null; status: string;
  allocations: Allocation[]; enrollments: Enrollment[];
};
type Request = {
  id: string; courseTypeId: string; courseName: string; soldierId: string | null; soldierName: string | null;
  companyName: string | null; note: string | null; status: string; requestedAt: string;
};
type Soldier = { id: string; fullName: string; companyId: string | null; companyName: string | null; squadName: string | null; certIds: string[]; licenseIds: string[] };

type Props = {
  canManage: boolean; canEnroll: boolean; myCompanyId: string | null;
  companies: Opt[]; certTypes: Opt[]; licenseTypes: Opt[];
  courseTypes: CourseType[]; instances: Instance[]; requests: Request[]; soldiers: Soldier[];
};

const STATUS_LABEL: Record<string, string> = { OPEN: "פתוח", CLOSED: "סגור", DONE: "הסתיים" };
const STATUS_CLASS: Record<string, string> = { OPEN: "bg-emerald-100 text-emerald-700", CLOSED: "bg-slate-200 text-slate-600", DONE: "bg-blue-100 text-blue-700" };

export default function TrainingsClient(p: Props) {
  const [tab, setTab] = useState<"instances" | "catalog" | "requests">("instances");
  const certName = useMemo(() => new Map(p.certTypes.map((c) => [c.id, c.name])), [p.certTypes]);
  const licName = useMemo(() => new Map(p.licenseTypes.map((l) => [l.id, l.name])), [p.licenseTypes]);
  const compName = useMemo(() => new Map(p.companies.map((c) => [c.id, c.name])), [p.companies]);
  const ctById = useMemo(() => new Map(p.courseTypes.map((c) => [c.id, c])), [p.courseTypes]);

  const TABS = [
    { key: "instances" as const, label: `📆 מופעים (${p.instances.length})` },
    { key: "catalog" as const, label: `📚 קטלוג קורסים (${p.courseTypes.length})` },
    { key: "requests" as const, label: `📥 בקשות (${p.requests.length})` },
  ];

  return (
    <div>
      <div className="flex gap-1 mb-4 border-b border-slate-200 flex-wrap">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition ${tab === t.key ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "instances" && <InstancesTab p={p} certName={certName} licName={licName} compName={compName} ctById={ctById} />}
      {tab === "catalog" && <CatalogTab p={p} certName={certName} licName={licName} />}
      {tab === "requests" && <RequestsTab p={p} />}
    </div>
  );
}

// ============ פונקציית התאמה ============
function candidatesFor(ct: CourseType | undefined, soldiers: Soldier[]): Soldier[] {
  if (!ct) return [];
  return soldiers.filter((s) => {
    const meetsPrereq = ct.prereqCerts.every((c) => s.certIds.includes(c)) && ct.prereqLicenses.every((l) => s.licenseIds.includes(l));
    const hasAllGrants = ct.grantCerts.every((c) => s.certIds.includes(c)) && ct.grantLicenses.every((l) => s.licenseIds.includes(l));
    const grantsCount = ct.grantCerts.length + ct.grantLicenses.length;
    const lacksGrant = grantsCount === 0 ? true : !hasAllGrants;
    return meetsPrereq && lacksGrant;
  });
}

// ============ טאב מופעים ============
function InstancesTab({ p, certName, licName, compName, ctById }: {
  p: Props; certName: Map<string, string>; licName: Map<string, string>; compName: Map<string, string>; ctById: Map<string, CourseType>;
}) {
  const [showNew, setShowNew] = useState(false);
  return (
    <div className="space-y-3">
      {p.canManage && (
        <button onClick={() => setShowNew(true)} className="bg-slate-800 hover:bg-slate-900 text-white rounded-lg px-4 py-2 text-sm font-medium">+ מופע קורס חדש</button>
      )}
      {p.instances.length === 0 && <Card className="p-6 text-center text-slate-400 text-sm">אין מופעים פעילים.</Card>}
      {p.instances.map((inst) => (
        <InstanceCard key={inst.id} inst={inst} p={p} certName={certName} licName={licName} compName={compName} ct={ctById.get(inst.courseTypeId)} />
      ))}
      {showNew && <InstanceModal p={p} onClose={() => setShowNew(false)} />}
    </div>
  );
}

function InstanceCard({ inst, p, certName, licName, compName, ct }: {
  inst: Instance; p: Props; certName: Map<string, string>; licName: Map<string, string>; compName: Map<string, string>; ct: CourseType | undefined;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [showAlloc, setShowAlloc] = useState(false);
  const [showFind, setShowFind] = useState(false);
  const [enrollErr, setEnrollErr] = useState<string | null>(null);
  const [pickSoldier, setPickSoldier] = useState("");

  const enrolledIds = new Set(inst.enrollments.map((e) => e.soldierId));
  const enrolledCount = inst.enrollments.length;

  // חיילים זמינים לשיבוץ (בטווח ההרשאה, שלא משובצים)
  const available = p.soldiers.filter((s) => !enrolledIds.has(s.id));
  const candidates = candidatesFor(ct, available);

  function enroll(soldierId: string) {
    if (!soldierId) return;
    setEnrollErr(null);
    const fd = new FormData(); fd.set("instanceId", inst.id); fd.set("soldierId", soldierId);
    start(async () => { const e = await enrollSoldier(fd); if (e) { setEnrollErr(e); return; } setPickSoldier(""); router.refresh(); });
  }
  function drop(id: string) {
    if (!confirm("להסיר את החייל מהמופע?")) return;
    const fd = new FormData(); fd.set("id", id);
    start(async () => { await dropEnrollment(fd); router.refresh(); });
  }
  function complete(id: string, name: string) {
    if (!confirm(`לסמן ש${name} סיים? המערכת תוסיף אוטומטית את ההסמכה/רישיון שהקורס מקנה.`)) return;
    const fd = new FormData(); fd.set("id", id);
    start(async () => { await completeEnrollment(fd); router.refresh(); });
  }
  function setStatus(status: string) {
    const fd = new FormData(); fd.set("id", inst.id); fd.set("status", status);
    start(async () => { await setCourseInstanceStatus(fd); router.refresh(); });
  }
  function del() {
    if (!confirm("למחוק את המופע?")) return;
    const fd = new FormData(); fd.set("id", inst.id);
    start(async () => { await deleteCourseInstance(fd); router.refresh(); });
  }

  const enrolledByCompany = new Map<string, number>();
  for (const e of inst.enrollments) { if (e.companyId) enrolledByCompany.set(e.companyId, (enrolledByCompany.get(e.companyId) ?? 0) + 1); }

  return (
    <Card className="overflow-hidden">
      <div className="bg-slate-50 border-b border-slate-200 px-4 py-2.5 flex items-center justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <h3 className="font-bold text-slate-800">🎓 {inst.courseName}</h3>
          <div className="text-xs text-slate-500 flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
            {inst.startDate && <span>📅 {new Date(inst.startDate).toLocaleDateString("he-IL")}</span>}
            {inst.location && <span>📍 {inst.location}</span>}
            {inst.hours && <span>🕒 {inst.hours}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[11px] font-medium rounded-full px-2 py-0.5 ${STATUS_CLASS[inst.status]}`}>{STATUS_LABEL[inst.status]}</span>
          <span className={`text-[11px] font-medium rounded-full px-2 py-0.5 ${inst.totalSlots != null && enrolledCount >= inst.totalSlots ? "bg-rose-100 text-rose-700" : "bg-slate-200 text-slate-600"}`}>
            {enrolledCount}{inst.totalSlots != null ? `/${inst.totalSlots}` : ""} משובצים
          </span>
        </div>
      </div>

      <div className="px-4 py-3 space-y-3">
        {(inst.bringItems || inst.contactName || inst.contactPhone || inst.notes) && (
          <div className="text-xs text-slate-600 space-y-0.5">
            {inst.bringItems && <div>🎒 להביא: {inst.bringItems}</div>}
            {(inst.contactName || inst.contactPhone) && <div>☎️ איש קשר: {inst.contactName} {inst.contactPhone && <a href={`tel:${inst.contactPhone}`} className="text-blue-600">{inst.contactPhone}</a>}</div>}
            {inst.notes && <div className="text-slate-400">📝 {inst.notes}</div>}
          </div>
        )}

        {/* מכסות פר-פלוגה */}
        {inst.allocations.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {inst.allocations.map((a) => {
              const used = enrolledByCompany.get(a.companyId) ?? 0;
              const full = used >= a.slots;
              return <span key={a.companyId} className={`text-[11px] rounded px-2 py-0.5 ${full ? "bg-rose-100 text-rose-700" : "bg-indigo-50 text-indigo-700"}`}>{compName.get(a.companyId) ?? "פלוגה"}: {used}/{a.slots}</span>;
            })}
          </div>
        )}

        {/* משובצים */}
        {inst.enrollments.length > 0 && (
          <div className="border border-slate-100 rounded-lg divide-y divide-slate-100">
            {inst.enrollments.map((e) => {
              const inScope = p.canManage || (!p.myCompanyId || e.companyId === p.myCompanyId);
              return (
                <div key={e.id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                  <span className="font-medium text-slate-700">{e.soldierName}</span>
                  {e.companyName && <span className="text-[11px] text-slate-400">· {e.companyName}</span>}
                  {e.status === "COMPLETED" && <Badge className="bg-emerald-100 text-emerald-700">✓ סיים</Badge>}
                  <div className="mr-auto flex items-center gap-2">
                    {p.canManage && e.status !== "COMPLETED" && (
                      <button onClick={() => complete(e.id, e.soldierName)} disabled={pending} className="text-[11px] text-emerald-600 hover:underline">סיים ✓</button>
                    )}
                    {inScope && e.status !== "COMPLETED" && (
                      <button onClick={() => drop(e.id)} disabled={pending} className="text-[11px] text-rose-400 hover:text-rose-600">הסר</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* שיבוץ */}
        {p.canEnroll && inst.status === "OPEN" && (
          <div className="border-t border-slate-100 pt-3">
            <div className="flex flex-wrap items-center gap-2">
              <select value={pickSoldier} onChange={(e) => setPickSoldier(e.target.value)} className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white min-w-[12rem]">
                <option value="">— בחר חייל לשיבוץ —</option>
                {available.map((s) => <option key={s.id} value={s.id}>{s.fullName}{s.companyName && !p.myCompanyId ? ` (${s.companyName})` : ""}</option>)}
              </select>
              <button onClick={() => enroll(pickSoldier)} disabled={pending || !pickSoldier} className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50">שבץ</button>
              <button onClick={() => setShowFind((v) => !v)} className="text-sm text-blue-600 hover:underline">🎯 מצא התאמות ({candidates.length})</button>
            </div>
            {enrollErr && <div className="text-xs text-rose-600 mt-1">{enrollErr}</div>}
            {showFind && (
              <div className="mt-2 bg-blue-50/50 border border-blue-100 rounded-lg p-2">
                <div className="text-[11px] text-slate-500 mb-1">חיילים שעומדים בתנאי-הקדם וחסרה להם ההסמכה שהקורס מקנה:</div>
                {candidates.length === 0 ? <div className="text-xs text-slate-400">אין התאמות</div> : (
                  <div className="flex flex-wrap gap-1.5">
                    {candidates.map((s) => (
                      <button key={s.id} onClick={() => enroll(s.id)} disabled={pending}
                        className="text-[11px] bg-white border border-blue-200 text-blue-700 rounded-full px-2.5 py-1 hover:bg-blue-100">
                        + {s.fullName}{s.companyName && !p.myCompanyId ? ` (${s.companyName})` : ""}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ניהול קה"ד */}
        {p.canManage && (
          <div className="border-t border-slate-100 pt-2 flex items-center gap-3 text-[11px] text-slate-500 flex-wrap">
            <button onClick={() => setShowAlloc(true)} className="text-indigo-600 hover:underline">🎚️ מכסות לפלוגות</button>
            {inst.status !== "OPEN" && <button onClick={() => setStatus("OPEN")} className="hover:underline">פתח לשיבוץ</button>}
            {inst.status === "OPEN" && <button onClick={() => setStatus("CLOSED")} className="hover:underline">סגור שיבוץ</button>}
            {inst.status !== "DONE" && <button onClick={() => setStatus("DONE")} className="hover:underline">סמן כהסתיים</button>}
            <button onClick={del} className="text-rose-400 hover:text-rose-600 mr-auto">מחק מופע</button>
          </div>
        )}
      </div>

      {showAlloc && <AllocModal inst={inst} companies={p.companies} onClose={() => setShowAlloc(false)} />}
    </Card>
  );
}

function AllocModal({ inst, companies, onClose }: { inst: Instance; companies: Opt[]; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const slotOf = (cid: string) => inst.allocations.find((a) => a.companyId === cid)?.slots ?? 0;
  function submit(fd: FormData) { fd.set("instanceId", inst.id); start(async () => { await setCourseAllocations(fd); onClose(); router.refresh(); }); }
  return (
    <ModalShell title={`מכסות לפלוגות — ${inst.courseName}`} onClose={onClose}>
      <form action={submit} className="space-y-2">
        {companies.map((c) => (
          <label key={c.id} className="flex items-center justify-between gap-3 text-sm">
            <span className="text-slate-700">{c.name}</span>
            <input name={`alloc_${c.id}`} type="number" min={0} defaultValue={slotOf(c.id)} className="w-20 border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
          </label>
        ))}
        <div className="flex gap-2 pt-2">
          <button type="submit" disabled={pending} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50">{pending ? "שומר..." : "שמור מכסות"}</button>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">ביטול</button>
        </div>
      </form>
    </ModalShell>
  );
}

function InstanceModal({ p, onClose }: { p: Props; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  function submit(fd: FormData) { setErr(null); start(async () => { const e = await saveCourseInstance(fd); if (e) { setErr(e); return; } onClose(); router.refresh(); }); }
  return (
    <ModalShell title="מופע קורס חדש" onClose={onClose}>
      <form action={submit} className="space-y-3">
        <L label="סוג קורס">
          <select name="courseTypeId" required className="inp">
            <option value="">— בחר —</option>
            {p.courseTypes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </L>
        <div className="grid grid-cols-2 gap-2">
          <L label="תאריך"><input name="startDate" type="date" className="inp" /></L>
          <L label="שעות"><input name="hours" className="inp" placeholder="08:00-16:00" /></L>
        </div>
        <L label="מיקום"><input name="location" className="inp" /></L>
        <L label="מה להביא"><input name="bringItems" className="inp" /></L>
        <div className="grid grid-cols-2 gap-2">
          <L label="איש קשר"><input name="contactName" className="inp" /></L>
          <L label="נייד"><input name="contactPhone" className="inp" placeholder="05XXXXXXXX" /></L>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <L label='סה"כ מקומות'><input name="totalSlots" type="number" min={0} className="inp" /></L>
        </div>
        <L label="הערות"><input name="notes" className="inp" /></L>
        {err && <div className="text-sm text-rose-600 bg-rose-50 rounded-lg px-3 py-2">{err}</div>}
        <div className="flex gap-2">
          <button type="submit" disabled={pending} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50">{pending ? "שומר..." : "צור מופע"}</button>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">ביטול</button>
        </div>
      </form>
      <InpStyle />
    </ModalShell>
  );
}

// ============ טאב קטלוג ============
function CatalogTab({ p, certName, licName }: { p: Props; certName: Map<string, string>; licName: Map<string, string> }) {
  const [edit, setEdit] = useState<CourseType | "new" | null>(null);
  const [reqFor, setReqFor] = useState<CourseType | null>(null);
  const router = useRouter();
  const [pending, start] = useTransition();
  function toggle(id: string) { const fd = new FormData(); fd.set("id", id); start(async () => { await toggleCourseType(fd); router.refresh(); }); }
  return (
    <div className="space-y-3">
      {p.canManage && (
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setEdit("new")} className="bg-slate-800 hover:bg-slate-900 text-white rounded-lg px-4 py-2 text-sm font-medium">+ סוג קורס חדש</button>
          {p.courseTypes.length === 0 && (
            <button onClick={() => start(async () => { await seedDefaultCourseCatalog(); router.refresh(); })} disabled={pending}
              className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50">
              {pending ? "יוצר..." : "✨ צור קטלוג התחלתי (6 קורסים)"}
            </button>
          )}
        </div>
      )}
      {p.courseTypes.length === 0 && <Card className="p-6 text-center text-slate-400 text-sm">אין קורסים בקטלוג. {p.canManage ? "צור קטלוג התחלתי או הוסף סוג קורס." : ""}</Card>}
      {p.courseTypes.map((ct) => (
        <Card key={ct.id} className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-bold text-slate-800">📘 {ct.name} <span className="text-[11px] font-normal text-slate-400">· {ct.instanceCount} מופעים</span></div>
              {ct.description && <div className="text-xs text-slate-500 mt-0.5">{ct.description}</div>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {p.canEnroll && <button onClick={() => setReqFor(ct)} className="text-[11px] text-blue-600 hover:underline">בקש קורס</button>}
              {p.canManage && <button onClick={() => setEdit(ct)} className="text-[11px] text-slate-500 hover:underline">עריכה</button>}
              {p.canManage && <button onClick={() => toggle(ct.id)} disabled={pending} className="text-[11px] text-rose-400 hover:text-rose-600">השבת</button>}
            </div>
          </div>
          {(ct.prereqCerts.length + ct.prereqLicenses.length) > 0 && (
            <div className="mt-2 flex flex-wrap gap-1 items-center">
              <span className="text-[11px] text-slate-400">תנאי-קדם:</span>
              {ct.prereqCerts.map((c) => <Badge key={c} className="bg-amber-50 text-amber-700">🏅 {certName.get(c)}</Badge>)}
              {ct.prereqLicenses.map((l) => <Badge key={l} className="bg-amber-50 text-amber-700">🪪 {licName.get(l)}</Badge>)}
            </div>
          )}
          {(ct.grantCerts.length + ct.grantLicenses.length) > 0 && (
            <div className="mt-1 flex flex-wrap gap-1 items-center">
              <span className="text-[11px] text-slate-400">מקנה:</span>
              {ct.grantCerts.map((c) => <Badge key={c} className="bg-emerald-50 text-emerald-700">🏅 {certName.get(c)}</Badge>)}
              {ct.grantLicenses.map((l) => <Badge key={l} className="bg-emerald-50 text-emerald-700">🪪 {licName.get(l)}</Badge>)}
            </div>
          )}
        </Card>
      ))}
      {edit && <CourseTypeModal p={p} ct={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
      {reqFor && <RequestModal p={p} ct={reqFor} onClose={() => setReqFor(null)} />}
    </div>
  );
}

function CourseTypeModal({ p, ct, onClose }: { p: Props; ct: CourseType | null; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [prereqCert, setPC] = useState<Set<string>>(new Set(ct?.prereqCerts ?? []));
  const [prereqLic, setPL] = useState<Set<string>>(new Set(ct?.prereqLicenses ?? []));
  const [grantCert, setGC] = useState<Set<string>>(new Set(ct?.grantCerts ?? []));
  const [grantLic, setGL] = useState<Set<string>>(new Set(ct?.grantLicenses ?? []));

  function submit(fd: FormData) {
    setErr(null);
    if (ct) fd.set("id", ct.id);
    prereqCert.forEach((v) => fd.append("prereqCert", v));
    prereqLic.forEach((v) => fd.append("prereqLicense", v));
    grantCert.forEach((v) => fd.append("grantCert", v));
    grantLic.forEach((v) => fd.append("grantLicense", v));
    start(async () => { const e = await saveCourseType(fd); if (e) { setErr(e); return; } onClose(); router.refresh(); });
  }
  return (
    <ModalShell title={ct ? "עריכת סוג קורס" : "סוג קורס חדש"} onClose={onClose}>
      <form action={submit} className="space-y-3">
        <L label="שם הקורס"><input name="name" required defaultValue={ct?.name ?? ""} className="inp" /></L>
        <L label="תיאור"><input name="description" defaultValue={ct?.description ?? ""} className="inp" /></L>
        <QualPicker label="תנאי-קדם — הסמכות" opts={p.certTypes} sel={prereqCert} setSel={setPC} icon="🏅" />
        <QualPicker label="תנאי-קדם — רישיונות נהיגה" opts={p.licenseTypes} sel={prereqLic} setSel={setPL} icon="🪪" />
        <QualPicker label="מקנה בסיום — הסמכות" opts={p.certTypes} sel={grantCert} setSel={setGC} icon="🏅" tone="emerald" />
        <QualPicker label="מקנה בסיום — רישיונות נהיגה" opts={p.licenseTypes} sel={grantLic} setSel={setGL} icon="🪪" tone="emerald" />
        {err && <div className="text-sm text-rose-600 bg-rose-50 rounded-lg px-3 py-2">{err}</div>}
        <div className="flex gap-2">
          <button type="submit" disabled={pending} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50">{pending ? "שומר..." : "שמור"}</button>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">ביטול</button>
        </div>
      </form>
      <InpStyle />
    </ModalShell>
  );
}

function QualPicker({ label, opts, sel, setSel, icon, tone = "amber" }: {
  label: string; opts: Opt[]; sel: Set<string>; setSel: (s: Set<string>) => void; icon: string; tone?: "amber" | "emerald";
}) {
  if (opts.length === 0) return null;
  const onCls = tone === "emerald" ? "bg-emerald-50 border-emerald-400 text-emerald-800" : "bg-amber-50 border-amber-400 text-amber-800";
  return (
    <div>
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {opts.map((o) => {
          const on = sel.has(o.id);
          return (
            <button key={o.id} type="button"
              onClick={() => { const n = new Set(sel); if (n.has(o.id)) n.delete(o.id); else n.add(o.id); setSel(n); }}
              className={`text-[11px] rounded-full border px-2.5 py-1 ${on ? onCls + " font-medium" : "bg-white border-slate-200 text-slate-500"}`}>
              {on ? "✓ " : ""}{icon} {o.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function RequestModal({ p, ct, onClose }: { p: Props; ct: CourseType; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  function submit(fd: FormData) { setErr(null); fd.set("courseTypeId", ct.id); start(async () => { const e = await createCourseRequest(fd); if (e) { setErr(e); return; } onClose(); router.refresh(); }); }
  return (
    <ModalShell title={`בקשת קורס — ${ct.name}`} onClose={onClose}>
      <form action={submit} className="space-y-3">
        <L label="חייל (אופציונלי)">
          <select name="soldierId" className="inp">
            <option value="">— בקשה כללית לפלוגה —</option>
            {p.soldiers.map((s) => <option key={s.id} value={s.id}>{s.fullName}{s.companyName && !p.myCompanyId ? ` (${s.companyName})` : ""}</option>)}
          </select>
        </L>
        <L label="הערה"><input name="note" className="inp" placeholder="למשל: דחוף לקראת תרגיל" /></L>
        {err && <div className="text-sm text-rose-600 bg-rose-50 rounded-lg px-3 py-2">{err}</div>}
        <div className="flex gap-2">
          <button type="submit" disabled={pending} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50">{pending ? "שולח..." : "שלח בקשה"}</button>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">ביטול</button>
        </div>
      </form>
      <InpStyle />
    </ModalShell>
  );
}

// ============ טאב בקשות ============
function RequestsTab({ p }: { p: Props }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  function act(id: string, status: string) { const fd = new FormData(); fd.set("id", id); fd.set("status", status); start(async () => { await setRequestStatus(fd); router.refresh(); }); }
  if (p.requests.length === 0) return <Card className="p-6 text-center text-slate-400 text-sm">אין בקשות ממתינות.</Card>;
  return (
    <div className="space-y-2">
      {p.requests.map((r) => (
        <Card key={r.id} className="p-3 flex items-center gap-2 flex-wrap">
          <span className="font-medium text-slate-800">📘 {r.courseName}</span>
          {r.soldierName ? <span className="text-sm text-slate-600">· {r.soldierName}</span> : <span className="text-sm text-slate-400">· בקשה כללית</span>}
          {r.companyName && <Badge>{r.companyName}</Badge>}
          <Badge className={r.status === "APPROVED" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}>{r.status === "APPROVED" ? "אושר" : "ממתין"}</Badge>
          {r.note && <span className="text-[11px] text-slate-400">📝 {r.note}</span>}
          <div className="mr-auto flex items-center gap-2">
            {p.canManage && r.status === "PENDING" && <button onClick={() => act(r.id, "APPROVED")} disabled={pending} className="text-[11px] text-emerald-600 hover:underline">אשר</button>}
            <button onClick={() => act(r.id, "REJECTED")} disabled={pending} className="text-[11px] text-rose-400 hover:text-rose-600">{p.canManage ? "דחה" : "בטל"}</button>
          </div>
        </Card>
      ))}
    </div>
  );
}

// ============ עזרי UI ============
function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-bold text-slate-800">{title}</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}
function L({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="block text-xs text-slate-500 mb-1">{label}</span>{children}</label>;
}
function InpStyle() {
  return <style>{`.inp{width:100%;border:1px solid #cbd5e1;border-radius:0.5rem;padding:0.5rem 0.75rem;font-size:0.875rem;background:#fff}`}</style>;
}
