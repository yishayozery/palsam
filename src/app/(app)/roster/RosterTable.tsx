"use client";

import { useState, useMemo } from "react";
import { Card, Table, Th, Td, Badge } from "@/components/ui";
import { createSoldier, updateSoldier, enlistSoldier, dischargeSoldier, deactivateSoldier, deleteSoldier } from "./actions";
import { importSoldiersRoster } from "./import-actions";
import { createAttachmentRequest, approveAttachmentRequest, rejectAttachmentRequest } from "./attachment-actions";

type Company = { id: string; name: string };
type SquadOption = { id: string; name: string; companyId: string };
type Soldier = {
  id: string; firstName: string | null; lastName: string | null; fullName: string;
  personalNumber: string | null; phone: string | null;
  companyId: string | null; companyName: string | null; platoon: string | null;
  squadId: string | null; squadName: string | null;
  status: string; attached: boolean; signedCount: number;
  enlistedAt: string | null; dischargedAt: string | null;
  attachReqStatus: string | null; attachFromDate: string | null; attachToDate: string | null;
};
type AttachmentReq = {
  id: string; soldierName: string; soldierPN: string | null; soldierCompany: string | null;
  fromDate: string; toDate: string; status: string;
  requestedBy: string; requestedAt: string;
  respondedBy: string | null; respondedAt: string | null;
  notes: string | null;
};

function fmtDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function AddForm({ companies, squads, onDone }: { companies: Company[]; squads: SquadOption[]; onDone: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [selectedCompany, setSelectedCompany] = useState("");
  const [isAttached, setIsAttached] = useState(false);
  const companySquads = squads.filter((s) => s.companyId === selectedCompany);
  async function submit(fd: FormData) {
    setError(null);
    try { await createSoldier(fd); onDone(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }
  return (
    <form action={submit} className="p-5 space-y-3">
      {error && <div className="bg-rose-50 border border-rose-300 rounded-lg p-2.5 text-sm text-rose-800">⚠️ {error}</div>}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-slate-600 mb-1">שם פרטי *</label>
          <input name="firstName" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-slate-600 mb-1">שם משפחה *</label>
          <input name="lastName" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-slate-600 mb-1">פלוגה *</label>
          <select name="companyId" required value={selectedCompany}
            onChange={(e) => setSelectedCompany(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">— בחר —</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-600 mb-1">מחלקה</label>
          <select name="squadId" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">— ללא —</option>
            {companySquads.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {selectedCompany && companySquads.length === 0 && (
            <p className="text-[10px] text-slate-400 mt-1">אין מחלקות מוגדרות לפלוגה זו</p>
          )}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-slate-600 mb-1">מספר אישי</label>
          <input name="personalNumber" inputMode="numeric" pattern="\d+" required
            onInput={(e) => { e.currentTarget.value = e.currentTarget.value.replace(/\D/g, ""); }}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
        </div>
        <div>
          <label className="block text-xs text-slate-600 mb-1">נייד</label>
          <input name="phone" placeholder="05X-XXXXXXX" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
      </div>
      <label className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg cursor-pointer">
        <input type="checkbox" name="attached" className="mt-0.5"
          checked={isAttached} onChange={(e) => setIsAttached(e.target.checked)} />
        <div>
          <span className="font-medium text-sm text-blue-800">📌 חייל מסופח</span>
          <span className="text-xs text-blue-700 mr-2">סיפוח מיחידה אחרת — נדרש אישור שלישות</span>
        </div>
      </label>
      {isAttached && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-3">
          <div className="text-xs text-blue-800 font-medium">טווח תאריכי סיפוח</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-600 mb-1">מתאריך *</label>
              <input name="attachFromDate" type="date" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-slate-600 mb-1">עד תאריך *</label>
              <input name="attachToDate" type="date" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-600 mb-1">הערות / סיבת סיפוח</label>
            <input name="attachNotes" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="למשל: סיפוח מגדוד X לתקופת אימון..." />
          </div>
        </div>
      )}
      <label className="flex items-start gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg cursor-pointer">
        <input type="checkbox" name="enlistNow" defaultChecked className="mt-0.5" />
        <div>
          <div className="font-medium text-sm text-emerald-800">✓ אשר גיוס מיידי</div>
          <div className="text-xs text-emerald-700 mt-0.5">החייל יוכל לקבל ציוד מיד עם ההקמה. ניתן לבטל אישור בכל עת.</div>
        </div>
      </label>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onDone} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">ביטול</button>
        <button className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-5 py-2 text-sm font-medium">הוסף חייל</button>
      </div>
    </form>
  );
}

function EditForm({ soldier, companies, squads, onDone }: { soldier: Soldier; companies: Company[]; squads: SquadOption[]; onDone: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [selectedCompany, setSelectedCompany] = useState(soldier.companyId ?? "");
  const companySquads = squads.filter((s) => s.companyId === selectedCompany);
  async function submit(fd: FormData) {
    setError(null);
    try { await updateSoldier(fd); onDone(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }

  const statusLabel = soldier.status === "ENLISTED" ? "מגויס ✓" : soldier.status === "REGISTERED" ? "ממתין לגיוס" : soldier.status === "DISCHARGED" ? "משוחרר" : "לא פעיל";
  const statusColor = soldier.status === "ENLISTED" ? "text-emerald-700" : soldier.status === "REGISTERED" ? "text-amber-700" : "text-slate-500";

  return (
    <form action={submit} className="p-5 space-y-3">
      <input type="hidden" name="id" value={soldier.id} />
      {error && <div className="bg-rose-50 border border-rose-300 rounded-lg p-2.5 text-sm text-rose-800">⚠️ {error}</div>}

      <div className="flex items-center justify-between bg-slate-50 rounded-lg p-3 text-sm">
        <div>
          <span className="text-slate-500">סטטוס: </span>
          <span className={`font-bold ${statusColor}`}>{statusLabel}</span>
        </div>
        <div className="text-xs text-slate-400 flex gap-3">
          {soldier.enlistedAt && <span>גיוס: {fmtDate(soldier.enlistedAt)}</span>}
          {soldier.dischargedAt && <span className="text-rose-500">סיום: {fmtDate(soldier.dischargedAt)}</span>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-slate-600 mb-1">שם פרטי</label>
          <input name="firstName" defaultValue={soldier.firstName ?? ""} required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs text-slate-600 mb-1">שם משפחה</label>
          <input name="lastName" defaultValue={soldier.lastName ?? ""} required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-slate-600 mb-1">פלוגה</label>
          <select name="companyId" value={selectedCompany}
            onChange={(e) => setSelectedCompany(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">— ללא —</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-600 mb-1">נייד</label>
          <input name="phone" defaultValue={soldier.phone ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
      </div>
      <div>
        <label className="block text-xs text-slate-600 mb-1">מספר אישי</label>
        <input name="personalNumber" defaultValue={soldier.personalNumber ?? ""} inputMode="numeric" pattern="\d*"
          onInput={(e) => { e.currentTarget.value = e.currentTarget.value.replace(/\D/g, ""); }}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
      </div>
      <div>
        <label className="block text-xs text-slate-600 mb-1">מחלקה</label>
        <select name="squadId" defaultValue={soldier.squadId ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="">— ללא —</option>
          {companySquads.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <label className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg cursor-pointer">
        <input type="checkbox" name="attached" defaultChecked={soldier.attached} />
        <div>
          <span className="font-medium text-sm text-blue-800">📌 מסופח</span>
          <span className="text-xs text-blue-700 mr-2">מידע בלבד — לא משפיע על הרשאות</span>
        </div>
      </label>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onDone} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">ביטול</button>
        <button className="bg-slate-800 hover:bg-slate-900 text-white rounded-lg px-5 py-2 text-sm font-medium">שמור</button>
      </div>
    </form>
  );
}

function AttachmentRequestForm({ soldiers, onDone }: { soldiers: Soldier[]; onDone: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [selectedSoldier, setSelectedSoldier] = useState<string>("");
  const activeSoldiers = soldiers.filter((s) => s.status !== "DISCHARGED" && s.status !== "INACTIVE");
  const filtered = q.trim()
    ? activeSoldiers.filter((s) => s.fullName.includes(q) || (s.personalNumber ?? "").includes(q)).slice(0, 10)
    : [];

  async function submit(fd: FormData) {
    setError(null);
    try { await createAttachmentRequest(fd); onDone(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }

  const selected = soldiers.find((s) => s.id === selectedSoldier);

  return (
    <form action={submit} className="p-5 space-y-3">
      {error && <div className="bg-rose-50 border border-rose-300 rounded-lg p-2.5 text-sm text-rose-800">{error}</div>}
      <input type="hidden" name="soldierId" value={selectedSoldier} />
      <div>
        <label className="block text-xs text-slate-600 mb-1">בחר חייל</label>
        {selected ? (
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg p-3">
            <span className="font-medium text-sm">{selected.fullName}</span>
            {selected.personalNumber && <span className="text-xs text-slate-500 font-mono">({selected.personalNumber})</span>}
            {selected.companyName && <span className="text-xs text-slate-400">{selected.companyName}</span>}
            <button type="button" onClick={() => { setSelectedSoldier(""); setQ(""); }}
              className="mr-auto text-xs text-rose-500 hover:text-rose-700">✕ שנה</button>
          </div>
        ) : (
          <div>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חפש לפי שם או מ.א..."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            {filtered.length > 0 && (
              <div className="mt-1 border border-slate-200 rounded-lg max-h-40 overflow-y-auto">
                {filtered.map((s) => (
                  <button key={s.id} type="button"
                    onClick={() => { setSelectedSoldier(s.id); setQ(""); }}
                    className="w-full text-right px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2 border-b border-slate-100 last:border-0">
                    <span className="font-medium">{s.fullName}</span>
                    {s.personalNumber && <span className="text-xs text-slate-400 font-mono">{s.personalNumber}</span>}
                    {s.companyName && <span className="text-xs text-slate-400">{s.companyName}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
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
      <div>
        <label className="block text-xs text-slate-600 mb-1">הערות</label>
        <input name="notes" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="סיבת הסיפוח..." />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onDone} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">ביטול</button>
        <button disabled={!selectedSoldier} className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-5 py-2 text-sm font-medium disabled:opacity-50">שלח בקשת סיפוח</button>
      </div>
    </form>
  );
}

function AttachmentRequestsPanel({ requests }: { requests: AttachmentReq[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const pending = requests.filter((r) => r.status === "PENDING");
  const handled = requests.filter((r) => r.status !== "PENDING");

  async function handleApprove(id: string) {
    setBusy(id);
    const fd = new FormData();
    fd.set("id", id);
    await approveAttachmentRequest(fd);
    setBusy(null);
  }

  async function handleReject(id: string) {
    if (!confirm("לדחות את בקשת הסיפוח?")) return;
    setBusy(id);
    const fd = new FormData();
    fd.set("id", id);
    await rejectAttachmentRequest(fd);
    setBusy(null);
  }

  if (requests.length === 0) return null;

  return (
    <Card className="p-4 mb-4">
      <h3 className="font-bold text-sm text-slate-700 mb-3 flex items-center gap-2">
        📌 בקשות סיפוח
        {pending.length > 0 && (
          <Badge className="bg-amber-100 text-amber-700">{pending.length} ממתינות</Badge>
        )}
      </h3>

      {pending.length > 0 && (
        <div className="space-y-2 mb-3">
          {pending.map((r) => (
            <div key={r.id} className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <div className="flex-1">
                <div className="font-medium text-sm">{r.soldierName}</div>
                <div className="text-xs text-slate-500 flex gap-3 mt-0.5">
                  {r.soldierPN && <span className="font-mono">{r.soldierPN}</span>}
                  {r.soldierCompany && <span>{r.soldierCompany}</span>}
                  <span>📅 {new Date(r.fromDate).toLocaleDateString("he-IL")} — {new Date(r.toDate).toLocaleDateString("he-IL")}</span>
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  ביקש: {r.requestedBy} · {new Date(r.requestedAt).toLocaleDateString("he-IL")}
                  {r.notes && <span> · {r.notes}</span>}
                </div>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <button onClick={() => handleApprove(r.id)} disabled={busy === r.id}
                  className="text-xs bg-emerald-600 text-white rounded-md px-3 py-1.5 hover:bg-emerald-700 disabled:opacity-50">
                  ✓ אשר
                </button>
                <button onClick={() => handleReject(r.id)} disabled={busy === r.id}
                  className="text-xs bg-rose-100 text-rose-700 rounded-md px-3 py-1.5 hover:bg-rose-200 disabled:opacity-50">
                  ✕ דחה
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {handled.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-slate-500 hover:text-slate-700">היסטוריה ({handled.length})</summary>
          <div className="mt-2 space-y-1">
            {handled.map((r) => (
              <div key={r.id} className={`flex items-center gap-3 rounded-lg p-2 ${r.status === "APPROVED" ? "bg-emerald-50" : "bg-rose-50"}`}>
                <Badge className={r.status === "APPROVED" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}>
                  {r.status === "APPROVED" ? "✓ מאושר" : "✕ נדחה"}
                </Badge>
                <span className="font-medium">{r.soldierName}</span>
                <span className="text-slate-400">{new Date(r.fromDate).toLocaleDateString("he-IL")} — {new Date(r.toDate).toLocaleDateString("he-IL")}</span>
                {r.respondedBy && <span className="text-slate-400">ע״י {r.respondedBy}</span>}
              </div>
            ))}
          </div>
        </details>
      )}
    </Card>
  );
}

export default function RosterTable({ soldiers, companies, squads, initialQ, initialCompany, initialStatus, attachmentRequests = [] }: {
  soldiers: Soldier[]; companies: Company[]; squads: SquadOption[]; initialQ: string; initialCompany: string; initialStatus: string;
  attachmentRequests?: AttachmentReq[];
}) {
  const [q, setQ] = useState(initialQ);
  const [company, setCompany] = useState(initialCompany);
  const [status, setStatus] = useState(initialStatus);
  const [addOpen, setAddOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const editSoldier = soldiers.find((s) => s.id === editId) ?? null;

  const [importBusy, setImportBusy] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; errors: string[] } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportBusy(true); setImportResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await importSoldiersRoster(fd);
      setImportResult({ created: r.created, errors: r.errors });
    } catch (err) {
      setImportResult({ created: 0, errors: [err instanceof Error ? err.message : String(err)] });
    } finally {
      setImportBusy(false);
      e.target.value = "";
    }
  }

  async function handleEnlist(id: string) {
    setActionError(null);
    try {
      const fd = new FormData();
      fd.append("id", id);
      await enlistSoldier(fd);
    } catch (e) { setActionError(e instanceof Error ? e.message : String(e)); }
  }

  async function handleDischarge(id: string) {
    if (!confirm("לשחרר את החייל? (אם יש ציוד חתום — יש לזכות קודם)")) return;
    setActionError(null);
    try {
      const fd = new FormData();
      fd.append("id", id);
      await dischargeSoldier(fd);
    } catch (e) { setActionError(e instanceof Error ? e.message : String(e)); }
  }

  const filtered = useMemo(() => {
    return soldiers.filter((s) => {
      if (company && s.companyId !== company) return false;
      if (status === "enlisted" && s.status !== "ENLISTED") return false;
      if (status === "pending" && s.status !== "REGISTERED") return false;
      if (status === "inactive" && s.status !== "DISCHARGED" && s.status !== "INACTIVE") return false;
      if (status === "attached" && !s.attached) return false;
      if (q.trim()) {
        const qq = q.trim().toLowerCase();
        return s.fullName.toLowerCase().includes(qq) || (s.personalNumber ?? "").includes(qq);
      }
      return true;
    });
  }, [soldiers, q, company, status]);

  return (
    <>
      {/* פילטרים + כפתור הוספה */}
      <Card className="p-3 mb-3">
        <div className="flex gap-2 flex-wrap items-end">
          <div className="flex-1 min-w-40">
            <label className="block text-xs text-slate-500 mb-1">חיפוש (שם / מ.א.)</label>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="הקלד..."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">פלוגה</label>
            <select value={company} onChange={(e) => setCompany(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="">כל הפלוגות</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">סטטוס</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="">הכל</option>
              <option value="enlisted">מאושרים</option>
              <option value="pending">ממתינים</option>
              <option value="inactive">לא פעילים</option>
              <option value="attached">מסופחים</option>
            </select>
          </div>
          <span className="text-xs text-slate-500 self-end pb-2">{filtered.length} חיילים</span>
          <div className="flex items-center gap-2 mr-auto">
            <a href="/roster/template" className="text-xs text-blue-600 hover:underline">⬇ תבנית Excel</a>
            <label className={`text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 cursor-pointer hover:bg-slate-50 ${importBusy ? "opacity-50" : ""}`}>
              {importBusy ? "מייבא..." : "⬆ ייבוא Excel"}
              <input type="file" accept=".xlsx,.xls" className="hidden" disabled={importBusy} onChange={handleImport} />
            </label>
            <button onClick={() => setAttachOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2 text-sm font-medium">
              📌 בקשת סיפוח
            </button>
            <button onClick={() => setAddOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4 py-2 text-sm font-medium">
              + הוסף חייל
            </button>
          </div>
        </div>
        {importResult && (
          <div className={`mt-2 rounded-lg p-2 text-xs ${importResult.created > 0 ? "bg-emerald-50 border border-emerald-200 text-emerald-800" : "bg-rose-50 border border-rose-200 text-rose-800"}`}>
            ✓ יובאו {importResult.created} חיילים.
            {importResult.errors.length > 0 && (
              <details className="mt-1">
                <summary className="cursor-pointer">⚠️ {importResult.errors.length} שגיאות / דילוגים</summary>
                <ul className="mt-1 list-disc list-inside space-y-0.5">{importResult.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
              </details>
            )}
            <button onClick={() => setImportResult(null)} className="mr-2 text-slate-500 hover:underline">נקה</button>
          </div>
        )}
      </Card>

      <AttachmentRequestsPanel requests={attachmentRequests} />

      {actionError && (
        <div className="mb-3 bg-rose-50 border border-rose-300 rounded-lg p-3 text-sm text-rose-800 flex items-center justify-between">
          <span>⚠️ {actionError}</span>
          <button onClick={() => setActionError(null)} className="text-rose-500 hover:text-rose-700 text-xs">✕</button>
        </div>
      )}

      <Card>
        <Table>
          <thead>
            <tr>
              <Th>חייל</Th><Th>מ.א.</Th><Th>פלוגה</Th><Th>סטטוס</Th><Th>תאריך גיוס</Th><Th>חתום על</Th><Th></Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s.id} className={s.status === "DISCHARGED" || s.status === "INACTIVE" ? "opacity-50" : ""}>
                <Td>
                  <div className="font-medium">{s.fullName}</div>
                  <div className="flex items-center gap-1 flex-wrap">
                    {s.squadName && <span className="text-xs text-slate-400">🪖 {s.squadName}</span>}
                    {s.attached && (
                      <Badge className={`text-[10px] ${
                        s.attachReqStatus === "PENDING" ? "bg-amber-100 text-amber-700" :
                        s.attachReqStatus === "APPROVED" ? "bg-blue-100 text-blue-700" :
                        s.attachReqStatus === "REJECTED" ? "bg-rose-100 text-rose-700" :
                        "bg-blue-100 text-blue-700"
                      }`}>
                        📌 {s.attachReqStatus === "PENDING" ? "ממתין לאישור" :
                            s.attachReqStatus === "APPROVED" ? `מסופח ${s.attachFromDate && s.attachToDate ? fmtDate(s.attachFromDate) + "—" + fmtDate(s.attachToDate) : ""}` :
                            s.attachReqStatus === "REJECTED" ? "סיפוח נדחה" : "מסופח"}
                      </Badge>
                    )}
                  </div>
                </Td>
                <Td className="font-mono text-xs">{s.personalNumber ?? <span className="text-slate-300">—</span>}</Td>
                <Td>{s.companyName ?? <span className="text-slate-300">—</span>}</Td>
                <Td>
                  {s.status === "DISCHARGED" || s.status === "INACTIVE"
                    ? <Badge className="bg-slate-100 text-slate-500">{s.status === "DISCHARGED" ? "משוחרר" : "לא פעיל"}</Badge>
                    : s.status === "ENLISTED"
                    ? <Badge className="bg-emerald-100 text-emerald-700">✓ מגויס</Badge>
                    : <Badge className="bg-amber-100 text-amber-700">ממתין</Badge>}
                </Td>
                <Td className="text-xs text-slate-500">
                  {s.status === "DISCHARGED" && s.dischargedAt ? (
                    <div>
                      {s.enlistedAt && <div>{fmtDate(s.enlistedAt)}</div>}
                      <div className="text-rose-500">סיום: {fmtDate(s.dischargedAt)}</div>
                    </div>
                  ) : s.enlistedAt ? fmtDate(s.enlistedAt) : "—"}
                </Td>
                <Td className="text-center">{s.signedCount > 0 ? <span className="font-bold text-blue-600">{s.signedCount}</span> : <span className="text-slate-300">—</span>}</Td>
                <Td>
                  <div className="flex items-center gap-1.5 justify-end">
                    {s.status === "REGISTERED" && (
                      <button onClick={() => handleEnlist(s.id)}
                        className="text-xs bg-emerald-600 text-white rounded-md px-2.5 py-1 hover:bg-emerald-700">
                        ✓ אישור גיוס
                      </button>
                    )}
                    {s.status === "ENLISTED" && (
                      <button onClick={() => handleDischarge(s.id)}
                        className="text-xs bg-rose-100 text-rose-700 rounded-md px-2.5 py-1 hover:bg-rose-200">
                        סיום גיוס
                      </button>
                    )}
                    <button onClick={() => setEditId(s.id)}
                      className="text-xs text-slate-500 hover:text-slate-800 border border-slate-300 rounded-md px-2.5 py-1 hover:bg-slate-50">
                      ✏️ עריכה
                    </button>
                    <button onClick={async () => {
                      if (!confirm(`למחוק את ${s.fullName}?`)) return;
                      if (!confirm("בטוח? כל הנתונים של החייל יימחקו לצמיתות.")) return;
                      setActionError(null);
                      try {
                        const fd = new FormData(); fd.set("id", s.id);
                        await deleteSoldier(fd);
                      } catch (e) { setActionError(e instanceof Error ? e.message : String(e)); }
                    }} className="text-xs text-rose-500 hover:text-rose-700 border border-rose-200 rounded-md px-2.5 py-1 hover:bg-rose-50">
                      🗑️
                    </button>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      {addOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h3 className="font-bold text-slate-800">הוספת חייל</h3>
              <button onClick={() => setAddOpen(false)} className="text-slate-400 hover:text-slate-700 text-xl">✕</button>
            </div>
            <AddForm companies={companies} squads={squads} onDone={() => setAddOpen(false)} />
          </div>
        </div>
      )}

      {editSoldier && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h3 className="font-bold text-slate-800">עריכת חייל — {editSoldier.fullName}</h3>
              <button onClick={() => setEditId(null)} className="text-slate-400 hover:text-slate-700 text-xl">✕</button>
            </div>
            <EditForm soldier={editSoldier} companies={companies} squads={squads} onDone={() => setEditId(null)} />
          </div>
        </div>
      )}

      {attachOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h3 className="font-bold text-slate-800">📌 בקשת סיפוח</h3>
              <button onClick={() => setAttachOpen(false)} className="text-slate-400 hover:text-slate-700 text-xl">✕</button>
            </div>
            <AttachmentRequestForm soldiers={soldiers} onDone={() => setAttachOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
