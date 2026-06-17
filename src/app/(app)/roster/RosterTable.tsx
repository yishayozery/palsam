"use client";

import { useState, useMemo } from "react";
import { Card, Table, Th, Td, Badge } from "@/components/ui";
import { createSoldier, updateSoldier, enlistSoldier, unenlistSoldier, deactivateSoldier } from "./actions";
import { importSoldiersRoster, seedSampleSoldiers } from "./import-actions";

type Company = { id: string; name: string };
type SquadOption = { id: string; name: string; companyId: string };
type Soldier = {
  id: string; firstName: string | null; lastName: string | null; fullName: string;
  personalNumber: string | null; phone: string | null;
  companyId: string | null; companyName: string | null; platoon: string | null;
  squadId: string | null; squadName: string | null;
  enlisted: boolean; active: boolean; signedCount: number; enlistedAt: string | null;
};

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
          <label className="block text-xs text-slate-600 mb-1">מספר אישי (אופציונלי — ספרות)</label>
          <input name="personalNumber" inputMode="numeric" pattern="\d*"
            onInput={(e) => { e.currentTarget.value = e.currentTarget.value.replace(/\D/g, ""); }}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
        </div>
        <div>
          <label className="block text-xs text-slate-600 mb-1">נייד (אופציונלי)</label>
          <input name="phone" placeholder="05X-XXXXXXX" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
      </div>
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
  return (
    <form action={submit} className="p-5 space-y-3">
      <input type="hidden" name="id" value={soldier.id} />
      {error && <div className="bg-rose-50 border border-rose-300 rounded-lg p-2.5 text-sm text-rose-800">⚠️ {error}</div>}
      <div className="text-xs text-slate-500 font-mono">מ.א.: {soldier.personalNumber}</div>
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
        <label className="block text-xs text-slate-600 mb-1">מחלקה</label>
        <select name="squadId" defaultValue={soldier.squadId ?? ""} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="">— ללא —</option>
          {companySquads.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onDone} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">ביטול</button>
        <button className="bg-slate-800 hover:bg-slate-900 text-white rounded-lg px-5 py-2 text-sm font-medium">שמור</button>
      </div>
    </form>
  );
}

export default function RosterTable({ soldiers, companies, squads, initialQ, initialCompany, initialStatus }: {
  soldiers: Soldier[]; companies: Company[]; squads: SquadOption[]; initialQ: string; initialCompany: string; initialStatus: string;
}) {
  const [q, setQ] = useState(initialQ);
  const [company, setCompany] = useState(initialCompany);
  const [status, setStatus] = useState(initialStatus);
  const [addOpen, setAddOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const editSoldier = soldiers.find((s) => s.id === editId) ?? null;

  const [importBusy, setImportBusy] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; errors: string[] } | null>(null);
  const [seedBusy, setSeedBusy] = useState(false);
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

  async function handleSeed() {
    if (!confirm("יוצר 5 חיילי דוגמה לכל פלוגה (מאושרים לחתימה). להמשיך?")) return;
    setSeedBusy(true);
    try {
      const r = await seedSampleSoldiers();
      const errStr = r.errors && r.errors.length > 0 ? `\n\nשגיאות:\n${r.errors.join("\n")}` : "";
      alert(`✓ נוצרו ${r.created} חיילים${errStr}`);
    } catch (e) {
      alert(`שגיאה: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSeedBusy(false);
    }
  }

  const filtered = useMemo(() => {
    return soldiers.filter((s) => {
      if (company && s.companyId !== company) return false;
      if (status === "enlisted" && !s.enlisted) return false;
      if (status === "pending" && (s.enlisted || !s.active)) return false;
      if (status === "inactive" && s.active) return false;
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
            </select>
          </div>
          <span className="text-xs text-slate-500 self-end pb-2">{filtered.length} חיילים</span>
          <div className="flex items-center gap-2 mr-auto">
            <a href="/roster/template" className="text-xs text-blue-600 hover:underline">⬇ תבנית Excel</a>
            <label className={`text-xs bg-white border border-slate-300 rounded-lg px-3 py-2 cursor-pointer hover:bg-slate-50 ${importBusy ? "opacity-50" : ""}`}>
              {importBusy ? "מייבא..." : "⬆ ייבוא Excel"}
              <input type="file" accept=".xlsx,.xls" className="hidden" disabled={importBusy} onChange={handleImport} />
            </label>
            <button onClick={handleSeed} disabled={seedBusy}
              className="text-xs bg-amber-100 border border-amber-300 text-amber-800 rounded-lg px-3 py-2 hover:bg-amber-200 disabled:opacity-50"
              title="הקמה מהירה: 5 חיילי דוגמה לכל פלוגה — לבדיקה">
              {seedBusy ? "יוצר..." : "🌱 5 לכל פלוגה (בדיקה)"}
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
              <Th>חייל</Th><Th>מ.א.</Th><Th>פלוגה</Th><Th>נייד</Th><Th>סטטוס</Th><Th>חתום על</Th><Th></Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s.id} className={!s.active ? "opacity-50" : ""}>
                <Td>
                  <div className="font-medium">{s.fullName}</div>
                  {s.squadName && <div className="text-xs text-slate-400">🪖 {s.squadName}</div>}
                </Td>
                <Td className="font-mono text-xs">{s.personalNumber ?? <span className="text-slate-300">—</span>}</Td>
                <Td>{s.companyName ?? <span className="text-slate-300">—</span>}</Td>
                <Td className="text-xs text-slate-500">{s.phone ?? "—"}</Td>
                <Td>
                  {!s.active
                    ? <Badge className="bg-slate-100 text-slate-500">לא פעיל</Badge>
                    : s.enlisted
                    ? <Badge className="bg-emerald-100 text-emerald-700">✓ מאושר</Badge>
                    : <Badge className="bg-amber-100 text-amber-700">ממתין</Badge>}
                </Td>
                <Td className="text-center">{s.signedCount > 0 ? <span className="font-bold text-blue-600">{s.signedCount}</span> : <span className="text-slate-300">—</span>}</Td>
                <Td>
                  <div className="flex items-center gap-2 justify-end">
                    {!s.enlisted && s.active && (
                      <form action={enlistSoldier}>
                        <input type="hidden" name="id" value={s.id} />
                        <button className="text-xs bg-emerald-600 text-white rounded-md px-2 py-1 hover:bg-emerald-700">✓ אשר גיוס</button>
                      </form>
                    )}
                    {s.enlisted && (
                      <form action={async (fd) => {
                        try { await unenlistSoldier(fd); setActionError(null); }
                        catch (e) { setActionError(e instanceof Error ? e.message : String(e)); }
                      }}>
                        <input type="hidden" name="id" value={s.id} />
                        <button className="text-xs text-amber-600 hover:text-amber-800">בטל אישור</button>
                      </form>
                    )}
                    <button onClick={() => setEditId(s.id)} className="text-xs text-slate-500 hover:text-slate-800">✎</button>
                    <form action={async (fd) => {
                      try { await deactivateSoldier(fd); setActionError(null); }
                      catch (e) { setActionError(e instanceof Error ? e.message : String(e)); }
                    }}>
                      <input type="hidden" name="id" value={s.id} />
                      <button className="text-xs text-rose-500 hover:text-rose-700" title={s.active ? "השבת" : "הפעל"}>{s.active ? "🚫" : "↻"}</button>
                    </form>
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
              <h3 className="font-bold text-slate-800">עריכת חייל</h3>
              <button onClick={() => setEditId(null)} className="text-slate-400 hover:text-slate-700 text-xl">✕</button>
            </div>
            <EditForm soldier={editSoldier} companies={companies} squads={squads} onDone={() => setEditId(null)} />
          </div>
        </div>
      )}
    </>
  );
}
