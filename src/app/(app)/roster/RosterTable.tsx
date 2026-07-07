"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { Card, Table, Th, Td, Badge } from "@/components/ui";
import { createSoldier, updateSoldier, enlistSoldier, dischargeSoldier, deactivateSoldier, deleteSoldier } from "./actions";
import { importSoldiersRoster } from "./import-actions";
import { updateAttachmentRequestStatus } from "./attachment-actions";

type Company = { id: string; name: string };
type SquadOption = { id: string; name: string; companyId: string };
type Soldier = {
  id: string; firstName: string | null; lastName: string | null; fullName: string;
  personalNumber: string | null; phone: string | null;
  companyId: string | null; companyName: string | null; platoon: string | null;
  squadId: string | null; squadName: string | null;
  dutyRound: number | null;
  roleName: string | null; roleIsCommander: boolean;
  status: string; attached: boolean; signedCount: number;
  enlistedAt: string | null; dischargedAt: string | null;
  attachReqStatus: string | null; attachFromDate: string | null; attachToDate: string | null;
};
type StatusLogEntry = {
  status: string; note: string | null; changedBy: string; changedAt: string;
};
type AttachmentReq = {
  id: string; soldierName: string; personalNumber: string | null;
  sourceUnit: string | null; targetCompany: string | null;
  fromDate: string; toDate: string; fullEmployment: boolean; status: string;
  requestedBy: string; requestedAt: string;
  notes: string | null; statusLog: StatusLogEntry[];
};

function fmtDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function AddForm({ companies, squads, onDone }: { companies: Company[]; squads: SquadOption[]; onDone: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [selectedCompany, setSelectedCompany] = useState("");
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
      <label className="flex items-start gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg cursor-pointer">
        <input type="checkbox" name="enlistNow" className="mt-0.5" />
        <div>
          <div className="font-medium text-sm text-emerald-800">✓ התחלת שמ״פ מיידית</div>
          <div className="text-xs text-emerald-700 mt-0.5">החייל יוכל לקבל ציוד מיד עם ההקמה. ניתן לבטל בכל עת.</div>
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
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-slate-600 mb-1">מחלקה</label>
          <select name="squadId" defaultValue={soldier.squadId ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">— ללא —</option>
            {companySquads.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-600 mb-1">🔄 סבב תעסוקה</label>
          <input type="number" name="dutyRound" min={1} defaultValue={soldier.dutyRound ?? ""} placeholder="מס' סבב"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
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

const STATUS_LABELS: Record<string, string> = {
  REQUESTED: "בקשה לסיפוח",
  SUBMITTED: "הוגשה בקשה",
  REMINDED: "הוגשה תזכורת",
  APPROVED: "אושר",
  REJECTED: "לא אושר",
};
const STATUS_COLORS: Record<string, string> = {
  REQUESTED: "bg-amber-100 text-amber-700",
  SUBMITTED: "bg-blue-100 text-blue-700",
  REMINDED: "bg-orange-100 text-orange-700",
  APPROVED: "bg-emerald-100 text-emerald-700",
  REJECTED: "bg-rose-100 text-rose-700",
};

function StatusTimeline({ log }: { log: StatusLogEntry[] }) {
  if (log.length === 0) return null;
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

function daysSince(isoDate: string) {
  return Math.floor((Date.now() - new Date(isoDate).getTime()) / 86_400_000);
}

function AttachmentRequestsPanel({ requests, companies, open, onToggle }: { requests: AttachmentReq[]; companies: { id: string; name: string }[]; open: boolean; onToggle: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [noteText, setNoteText] = useState<Record<string, string>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [tab, setTab] = useState<"active" | "history">("active");
  const [filterCompany, setFilterCompany] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterQ, setFilterQ] = useState("");

  const active = requests.filter((r) => r.status !== "APPROVED" && r.status !== "REJECTED");
  const done = requests.filter((r) => r.status === "APPROVED" || r.status === "REJECTED");

  const currentList = tab === "active" ? active : done;
  const filtered = currentList.filter((r) => {
    if (filterCompany && r.targetCompany !== filterCompany) return false;
    if (filterStatus && r.status !== filterStatus) return false;
    if (filterQ) {
      const qq = filterQ.toLowerCase();
      return r.soldierName.toLowerCase().includes(qq) || (r.personalNumber ?? "").includes(qq) || (r.sourceUnit ?? "").toLowerCase().includes(qq);
    }
    return true;
  });

  async function handleStatusUpdate(id: string, status: string) {
    if (status === "REJECTED" && !confirm("לדחות את בקשת הסיפוח?")) return;
    if (status === "APPROVED" && !confirm("לאשר סיפוח? יוקם חייל חדש עם דגל מסופח.")) return;
    setBusy(id);
    const fd = new FormData();
    fd.set("id", id);
    fd.set("status", status);
    if (noteText[id]) fd.set("note", noteText[id]);
    try { await updateAttachmentRequestStatus(fd); } catch {}
    setBusy(null);
  }

  const nextStatus: Record<string, string[]> = {
    REQUESTED: ["SUBMITTED", "APPROVED", "REJECTED"],
    SUBMITTED: ["REMINDED", "APPROVED", "REJECTED"],
    REMINDED: ["APPROVED", "REJECTED"],
  };

  const allStatuses = [...new Set(currentList.map((r) => r.status))];
  const allCompanies = [...new Set(currentList.map((r) => r.targetCompany).filter(Boolean))] as string[];

  if (!open) return null;

  return (
    <Card className="p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-sm text-slate-700 flex items-center gap-2">
          📌 בקשות סיפוח
          {active.length > 0 && <Badge className="bg-amber-100 text-amber-700">{active.length} פתוחות</Badge>}
        </h3>
        <button onClick={onToggle} className="text-slate-400 hover:text-slate-700 text-lg">✕</button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-3 border-b border-slate-200">
        <button onClick={() => { setTab("active"); setFilterStatus(""); }} className={`px-3 py-1.5 text-xs font-medium rounded-t-lg -mb-px ${tab === "active" ? "bg-white border border-b-white border-slate-200 text-slate-800" : "text-slate-500 hover:text-slate-700"}`}>
          פתוחות ({active.length})
        </button>
        <button onClick={() => { setTab("history"); setFilterStatus(""); }} className={`px-3 py-1.5 text-xs font-medium rounded-t-lg -mb-px ${tab === "history" ? "bg-white border border-b-white border-slate-200 text-slate-800" : "text-slate-500 hover:text-slate-700"}`}>
          היסטוריה ({done.length})
        </button>
      </div>

      {/* Filters — always visible */}
      <div className="flex gap-2 flex-wrap items-center mb-3 bg-slate-50 rounded-lg p-2">
        <input value={filterQ} onChange={(e) => setFilterQ(e.target.value)} placeholder="חיפוש שם / מ.א. / יחידה..."
          className="flex-1 min-w-[120px] rounded border border-slate-200 px-2 py-1 text-xs" />
        <select value={filterCompany} onChange={(e) => setFilterCompany(e.target.value)}
          className="rounded border border-slate-200 px-2 py-1 text-xs">
          <option value="">כל הפלוגות</option>
          {allCompanies.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
          className="rounded border border-slate-200 px-2 py-1 text-xs">
          <option value="">כל הסטטוסים</option>
          {allStatuses.map((s) => <option key={s} value={s}>{STATUS_LABELS[s] ?? s}</option>)}
        </select>
        <span className="text-[10px] text-slate-400">{filtered.length} תוצאות</span>
      </div>

      {requests.length === 0 && (
        <p className="text-xs text-slate-400">אין בקשות סיפוח. בקשות מוגשות ממסך חיילי הפלוגה.</p>
      )}

      {filtered.length === 0 && currentList.length > 0 && (
        <p className="text-xs text-slate-400">אין בקשות התואמות לסינון.</p>
      )}

      {/* Table */}
      {filtered.length > 0 && (
        <div className="overflow-x-auto">
          <Table>
            <thead>
              <tr>
                <Th>חייל</Th>
                <Th>מ.א.</Th>
                <Th>מיחידה</Th>
                <Th>אל פלוגה</Th>
                <Th>תקופה</Th>
                <Th>סטטוס</Th>
                <Th>ימים</Th>
                {tab === "active" && <Th>הערה</Th>}
                <Th>פעולות</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const days = daysSince(r.requestedAt);
                return (
                  <tr key={r.id} className={tab === "active" && days >= 7 ? "bg-rose-50/50" : tab === "active" && days >= 3 ? "bg-amber-50/30" : ""}>
                    <Td>
                      <span className="font-medium text-sm">{r.soldierName}</span>
                      <div className="text-[10px] text-slate-400">ביקש: {r.requestedBy}</div>
                    </Td>
                    <Td className="font-mono text-xs">{r.personalNumber ?? "—"}</Td>
                    <Td className="text-xs">{r.sourceUnit ?? "—"}</Td>
                    <Td className="text-xs">{r.targetCompany ?? "—"}</Td>
                    <Td className="text-xs whitespace-nowrap">
                      {r.fullEmployment ? "מלאה" : `${new Date(r.fromDate).toLocaleDateString("he-IL")} — ${new Date(r.toDate).toLocaleDateString("he-IL")}`}
                    </Td>
                    <Td>
                      <Badge className={STATUS_COLORS[r.status] ?? "bg-slate-100"}>{STATUS_LABELS[r.status] ?? r.status}</Badge>
                    </Td>
                    <Td>
                      <span className={`text-[10px] rounded-full px-2 py-0.5 font-bold ${days >= 7 ? "bg-rose-100 text-rose-700" : days >= 3 ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"}`}>
                        {days === 0 ? "היום" : days === 1 ? "אתמול" : `${days} ימים`}
                      </span>
                    </Td>
                    {tab === "active" && (
                      <Td>
                        <input value={noteText[r.id] ?? ""} onChange={(e) => setNoteText({ ...noteText, [r.id]: e.target.value })}
                          placeholder="הערה..." className="rounded border border-slate-200 px-1.5 py-0.5 text-[11px] w-24" />
                      </Td>
                    )}
                    <Td>
                      <div className="flex items-center gap-1">
                        {tab === "active" && (nextStatus[r.status] ?? []).map((ns) => (
                          <button key={ns} onClick={() => handleStatusUpdate(r.id, ns)} disabled={busy === r.id}
                            className={`text-[11px] rounded px-2 py-0.5 disabled:opacity-50 whitespace-nowrap ${
                              ns === "APPROVED" ? "bg-emerald-600 text-white hover:bg-emerald-700" :
                              ns === "REJECTED" ? "bg-rose-100 text-rose-700 hover:bg-rose-200" :
                              "bg-slate-100 text-slate-700 hover:bg-slate-200"
                            }`}>
                            {STATUS_LABELS[ns]}
                          </button>
                        ))}
                        <button onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                          className="text-[10px] text-blue-600 hover:underline whitespace-nowrap">
                          {expandedId === r.id ? "הסתר" : "📜"}
                        </button>
                      </div>
                      {expandedId === r.id && <StatusTimeline log={r.statusLog} />}
                      {r.notes && expandedId !== r.id && <div className="text-[10px] text-slate-400 mt-0.5 truncate max-w-[120px]" title={r.notes}>{r.notes}</div>}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </div>
      )}
    </Card>
  );
}

export default function RosterTable({ soldiers, companies, squads, initialQ, initialCompany, initialStatus, initialTab, attachmentRequests = [] }: {
  soldiers: Soldier[]; companies: Company[]; squads: SquadOption[]; initialQ: string; initialCompany: string; initialStatus: string;
  initialTab?: string;
  attachmentRequests?: AttachmentReq[];
}) {
  const [q, setQ] = useState(initialQ);
  const [company, setCompany] = useState(initialCompany);
  const [squad, setSquad] = useState("");
  const [status, setStatus] = useState(initialStatus);
  const [round, setRound] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [attachOpen, setAttachOpen] = useState(initialTab === "attachments");
  const attachRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (initialTab === "attachments" && attachRef.current) {
      attachRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [initialTab]);
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
      if (squad && s.squadId !== squad) return false;
      if (round && String(s.dutyRound ?? "") !== round) return false;
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
  }, [soldiers, q, company, squad, status, round]);

  // סיכום סבבים (על התוצאה המסוננת, לפני פילטר הסבב) — כמה בכל סבב
  const roundCounts = useMemo(() => {
    const src = soldiers.filter((s) => (!company || s.companyId === company) && s.status !== "DISCHARGED" && s.status !== "INACTIVE");
    const m = new Map<string, number>();
    for (const s of src) { const k = s.dutyRound != null ? String(s.dutyRound) : "—"; m.set(k, (m.get(k) ?? 0) + 1); }
    return [...m.entries()].sort((a, b) => (a[0] === "—" ? 1 : b[0] === "—" ? -1 : parseInt(a[0]) - parseInt(b[0])));
  }, [soldiers, company]);
  const allRounds = useMemo(() => [...new Set(soldiers.map((s) => s.dutyRound).filter((r): r is number => r != null))].sort((a, b) => a - b), [soldiers]);

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
            <select value={company} onChange={(e) => { setCompany(e.target.value); setSquad(""); }} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="">כל הפלוגות</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">🪖 מחלקה</label>
            <select value={squad} onChange={(e) => setSquad(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="">כל המחלקות</option>
              {squads.filter((sq) => !company || sq.companyId === company).map((sq) => <option key={sq.id} value={sq.id}>{sq.name}</option>)}
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
          <div>
            <label className="block text-xs text-slate-500 mb-1">🔄 סבב</label>
            <select value={round} onChange={(e) => setRound(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="">כל הסבבים</option>
              {allRounds.map((r) => <option key={r} value={String(r)}>סבב {r}</option>)}
              <option value="—">ללא סבב</option>
            </select>
          </div>
          <span className="text-xs text-slate-500 self-end pb-2">{filtered.length} חיילים</span>
          <div className="flex items-center gap-2 mr-auto">
            <a href="/roster/template" className="text-xs text-blue-600 hover:underline">⬇ תבנית Excel</a>
            <label className={`text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 cursor-pointer hover:bg-slate-50 ${importBusy ? "opacity-50" : ""}`}>
              {importBusy ? "מייבא..." : "⬆ ייבוא Excel"}
              <input type="file" accept=".xlsx,.xls" className="hidden" disabled={importBusy} onChange={handleImport} />
            </label>
            <button onClick={() => { setAttachOpen(!attachOpen); setTimeout(() => attachRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100); }}
              className={`rounded-lg px-4 py-2 text-sm font-medium border ${attachOpen ? "bg-blue-600 text-white border-blue-600" : "bg-white text-blue-700 border-blue-300 hover:bg-blue-50"}`}>
              📌 מסופחים {attachmentRequests.filter((r) => r.status !== "APPROVED" && r.status !== "REJECTED").length > 0 && (
                <span className="bg-amber-400 text-white text-[10px] rounded-full px-1.5 py-0.5 mr-1 font-bold">
                  {attachmentRequests.filter((r) => r.status !== "APPROVED" && r.status !== "REJECTED").length}
                </span>
              )}
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

      <div ref={attachRef}>
        <AttachmentRequestsPanel requests={attachmentRequests} companies={companies} open={attachOpen} onToggle={() => setAttachOpen(false)} />
      </div>

      {actionError && (
        <div className="mb-3 bg-rose-50 border border-rose-300 rounded-lg p-3 text-sm text-rose-800 flex items-center justify-between">
          <span>⚠️ {actionError}</span>
          <button onClick={() => setActionError(null)} className="text-rose-500 hover:text-rose-700 text-xs">✕</button>
        </div>
      )}

      {/* סיכום סבבים — כמה חיילים בכל סבב (בפלוגה המסוננת) */}
      {roundCounts.length > 1 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {roundCounts.map(([r, n]) => (
            <button key={r} onClick={() => setRound(round === r ? "" : r)}
              className={`text-xs px-2.5 py-1 rounded-full border transition ${round === r ? "bg-purple-600 text-white border-purple-600" : "bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100"}`}>
              {r === "—" ? "ללא סבב" : `🔄 סבב ${r}`}: {n}
            </button>
          ))}
        </div>
      )}

      <Card>
        <Table>
          <thead>
            <tr>
              <Th>חייל</Th><Th>מ.א.</Th><Th>פלוגה</Th><Th>תפקיד</Th><Th>סטטוס</Th><Th>תאריך גיוס</Th><Th>חתום על</Th><Th></Th>
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
                      <Badge className="text-[10px] bg-blue-100 text-blue-700">
                        📌 מסופח {s.attachFromDate && s.attachToDate ? fmtDate(s.attachFromDate) + "—" + fmtDate(s.attachToDate) : ""}
                      </Badge>
                    )}
                  </div>
                </Td>
                <Td className="font-mono text-xs">{s.personalNumber ?? <span className="text-slate-300">—</span>}</Td>
                <Td>
                  {s.companyName ?? <span className="text-slate-300">—</span>}
                  {s.dutyRound != null && <Badge className="mr-1 text-[10px] bg-purple-100 text-purple-700">🔄 סבב {s.dutyRound}</Badge>}
                </Td>
                <Td>
                  {s.roleName ? (
                    <Badge className={s.roleIsCommander ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"}>
                      {s.roleName}{s.roleIsCommander ? " ⭐" : ""}
                    </Badge>
                  ) : <span className="text-slate-300">—</span>}
                </Td>
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
                        ✓ התחלת שמ״פ
                      </button>
                    )}
                    {s.status === "ENLISTED" && (
                      <button onClick={() => handleDischarge(s.id)}
                        className="text-xs bg-rose-100 text-rose-700 rounded-md px-2.5 py-1 hover:bg-rose-200">
                        סגירת שמ״פ
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

    </>
  );
}
