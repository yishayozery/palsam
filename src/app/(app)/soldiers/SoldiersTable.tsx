"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui";
import SoldierEquipmentButton from "./SoldierEquipmentButton";
import { saveSoldierCertifications } from "../certifications/actions";
import { saveSoldier, toggleSoldier } from "./actions";

type SignedSerial = {
  id: string; itemName: string; sku: string | null; serialNumber: string; lotQuantity: number | null;
  statusName: string; isWear: boolean; isLoss: boolean;
  signedAt: string | null; signedBy: string | null; currentHolderName: string | null;
};
type SignedQty = {
  itemTypeId: string; itemName: string; sku: string | null; unit: string;
  statusName: string; quantity: number; lastSignedAt: string | null; lastSignedBy: string | null;
};
type IssuedKit = { kitName: string; kitNumber: string | null; items: { name: string; sku: string | null; qty: number }[] };

export type SoldierRow = {
  id: string;
  fullName: string;
  personalNumber: string;
  phone: string;
  companyId: string;
  companyName: string | null;
  squadId: string;
  squadName: string | null;
  companyRoleId: string;
  roleName: string | null;
  isCommander: boolean;
  certIds: string[];
  drivingNames: string[];
  drivingStatus: "none" | "ok" | "warning" | "expired" | "missing";
  drivingRefresherDate: string | null;
  telegramLinked: boolean;
  inactive: boolean;
  signedSerials: SignedSerial[];
  signedQty: SignedQty[];
  issuedKits: IssuedKit[];
};

type Opt = { id: string; name: string; companyId?: string | null };

export default function SoldiersTable({
  soldiers, certTypes, companyRoles, squads, companies,
  showCompany, canEditCerts,
}: {
  soldiers: SoldierRow[];
  certTypes: Opt[];
  companyRoles: (Opt & { isCommander: boolean })[];
  squads: Opt[];
  companies: Opt[];
  showCompany: boolean;
  canEditCerts: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // ---- Filters ----
  const [search, setSearch] = useState("");
  const [fCompany, setFCompany] = useState("");
  const [fSquad, setFSquad] = useState("");
  const [fRole, setFRole] = useState("");
  const [fCert, setFCert] = useState("");

  const certName = useMemo(() => new Map(certTypes.map((c) => [c.id, c.name])), [certTypes]);

  const filtered = useMemo(() => {
    let list = soldiers;
    if (fCompany) list = list.filter((s) => s.companyId === fCompany);
    if (fSquad) list = list.filter((s) => s.squadId === fSquad);
    if (fRole) list = list.filter((s) => s.companyRoleId === fRole);
    if (fCert) list = list.filter((s) => s.certIds.includes(fCert));
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((s) =>
        s.fullName.toLowerCase().includes(q) ||
        s.personalNumber.includes(q) ||
        (s.squadName || "").toLowerCase().includes(q) ||
        (s.roleName || "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [soldiers, fCompany, fSquad, fRole, fCert, search]);

  const anyFilter = fCompany || fSquad || fRole || fCert || search.trim();

  // squads/roles filtered for the current filter-company (nicer dropdowns)
  const squadOpts = fCompany ? squads.filter((s) => s.companyId === fCompany) : squads;
  const roleOpts = fCompany ? companyRoles.filter((r) => r.companyId === fCompany) : companyRoles;

  // ---- Cert popup ----
  const [certSoldier, setCertSoldier] = useState<SoldierRow | null>(null);
  const [certSel, setCertSel] = useState<Set<string>>(new Set());
  function openCerts(s: SoldierRow) {
    if (!canEditCerts) { setCertSoldier(s); setCertSel(new Set(s.certIds)); return; }
    setCertSoldier(s); setCertSel(new Set(s.certIds));
  }
  function saveCerts() {
    if (!certSoldier) return;
    const fd = new FormData();
    fd.set("soldierId", certSoldier.id);
    certSel.forEach((id) => fd.append("certificationTypeId", id));
    startTransition(async () => {
      await saveSoldierCertifications(fd);
      setCertSoldier(null);
      router.refresh();
    });
  }

  // ---- Edit / add soldier modal ----
  const [editRow, setEditRow] = useState<SoldierRow | "new" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  function submitEdit(fd: FormData) {
    setErr(null);
    startTransition(async () => {
      const res = await saveSoldier(fd);
      if (res) { setErr(res); return; }
      setEditRow(null);
      router.refresh();
    });
  }
  function toggleActive(id: string, inactive: boolean) {
    if (!confirm(inactive ? "להפעיל מחדש את החייל?" : "להשבית את החייל? (יוסתר מרשימות פעילות)")) return;
    const fd = new FormData();
    fd.set("id", id);
    startTransition(async () => {
      await toggleSoldier(fd);
      setEditRow(null);
      router.refresh();
    });
  }

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input
          value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 שם / מ.א..."
          className="flex-1 min-w-[160px] border border-slate-300 rounded-lg px-3 py-2 text-sm"
        />
        {showCompany && companies.length > 1 && (
          <select value={fCompany} onChange={(e) => { setFCompany(e.target.value); setFSquad(""); setFRole(""); }}
            className="border border-slate-300 rounded-lg px-2 py-2 text-sm bg-white">
            <option value="">כל הפלוגות</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        <select value={fSquad} onChange={(e) => setFSquad(e.target.value)}
          className="border border-slate-300 rounded-lg px-2 py-2 text-sm bg-white">
          <option value="">כל המחלקות</option>
          {squadOpts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={fRole} onChange={(e) => setFRole(e.target.value)}
          className="border border-slate-300 rounded-lg px-2 py-2 text-sm bg-white">
          <option value="">כל התפקידים</option>
          {roleOpts.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        {certTypes.length > 0 && (
          <select value={fCert} onChange={(e) => setFCert(e.target.value)}
            className="border border-slate-300 rounded-lg px-2 py-2 text-sm bg-white">
            <option value="">כל ההסמכות</option>
            {certTypes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        {anyFilter && (
          <button onClick={() => { setSearch(""); setFCompany(""); setFSquad(""); setFRole(""); setFCert(""); }}
            className="text-xs text-slate-500 hover:text-slate-700 underline">נקה</button>
        )}
        <button onClick={() => { setErr(null); setEditRow("new"); }}
          className="mr-auto bg-slate-800 hover:bg-slate-900 text-white rounded-lg px-3 py-2 text-sm font-medium">
          + חייל
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto bg-white rounded-xl border border-slate-200">
        <table className="min-w-full text-sm border-collapse">
          <thead>
            <tr className="bg-slate-50 text-slate-600">
              <th className="sticky right-0 z-10 bg-slate-50 px-3 py-2 text-right font-medium border-b min-w-[170px]">חייל</th>
              <th className="px-2 py-2 text-right font-medium border-b">מ.א</th>
              {showCompany && <th className="px-2 py-2 text-right font-medium border-b">פלוגה</th>}
              <th className="px-2 py-2 text-right font-medium border-b">מחלקה</th>
              <th className="px-2 py-2 text-right font-medium border-b">תפקיד</th>
              <th className="px-2 py-2 text-center font-medium border-b">הסמכות</th>
              <th className="px-2 py-2 text-center font-medium border-b">ציוד חתום</th>
              <th className="px-2 py-2 text-center font-medium border-b min-w-[110px]">נהיגה</th>
              <th className="px-2 py-2 border-b" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s.id} className={`border-b last:border-0 ${s.inactive ? "opacity-50" : "hover:bg-slate-50"}`}>
                <td className="sticky right-0 z-10 bg-white px-3 py-2 font-medium text-slate-800 whitespace-nowrap">
                  {s.isCommander && <span title="מפקד">⭐ </span>}
                  {s.fullName}
                  {s.telegramLinked && <span className="text-[10px] text-sky-600 mr-1" title="מחובר לבוט">📲</span>}
                  {s.inactive && <span className="text-[10px] text-rose-500 mr-1">(לא פעיל)</span>}
                </td>
                <td className="px-2 py-2 font-mono text-xs text-slate-500 whitespace-nowrap">{s.personalNumber}</td>
                {showCompany && <td className="px-2 py-2 text-xs text-slate-600 whitespace-nowrap">{s.companyName || "—"}</td>}
                <td className="px-2 py-2 whitespace-nowrap">
                  {s.squadName ? <Badge className="bg-indigo-100 text-indigo-700">{s.squadName}</Badge> : <span className="text-slate-300">—</span>}
                </td>
                <td className="px-2 py-2 whitespace-nowrap">
                  {s.roleName
                    ? <Badge className={s.isCommander ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"}>{s.roleName}</Badge>
                    : <span className="text-slate-300">—</span>}
                </td>
                <td className="px-2 py-2 text-center whitespace-nowrap">
                  <button onClick={() => openCerts(s)}
                    className={`text-[11px] rounded px-2 py-0.5 border ${s.certIds.length > 0 ? "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100" : "bg-slate-50 border-slate-200 text-slate-400 hover:bg-slate-100"}`}>
                    🏅 {s.certIds.length > 0 ? `${s.certIds.length} הסמכות` : (canEditCerts ? "הוסף" : "—")}
                  </button>
                </td>
                <td className="px-2 py-2 text-center whitespace-nowrap">
                  <SoldierEquipmentButton
                    soldierId={s.id} soldierName={s.fullName}
                    signedSerials={s.signedSerials} signedQty={s.signedQty} issuedKits={s.issuedKits}
                  />
                </td>
                <td className="px-2 py-2 text-center whitespace-nowrap">
                  {s.drivingStatus === "none" ? (
                    <span className="text-slate-300">—</span>
                  ) : (
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-[11px] text-slate-600">🪪 {s.drivingNames.join(", ")}</span>
                      {(s.drivingStatus === "expired" || s.drivingStatus === "missing") && (
                        <span className="text-[10px] font-bold bg-rose-100 text-rose-700 rounded px-1.5">ריענון פג</span>
                      )}
                      {s.drivingStatus === "warning" && (
                        <span className="text-[10px] font-bold bg-amber-100 text-amber-700 rounded px-1.5">ריענון עומד לפוג</span>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-2 py-2 text-center whitespace-nowrap">
                  <button onClick={() => { setErr(null); setEditRow(s); }} className="text-xs text-blue-600 hover:underline">עריכה</button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={9} className="px-3 py-6 text-center text-sm text-slate-400">לא נמצאו חיילים</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="text-xs text-slate-400 mt-2">{filtered.length} חיילים</div>

      {/* ---- Cert popup ---- */}
      {certSoldier && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setCertSoldier(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-bold text-slate-800">🏅 הסמכות — {certSoldier.fullName}</h3>
              <button onClick={() => setCertSoldier(null)} className="text-slate-400 hover:text-slate-700 text-xl">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {certTypes.length === 0 ? (
                <p className="text-sm text-slate-500">לא הוגדרו סוגי הסמכות. הגדר במסך ״סוגי הסמכות״.</p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {certTypes.map((c) => {
                    const on = certSel.has(c.id);
                    return (
                      <button key={c.id} type="button" disabled={!canEditCerts}
                        onClick={() => setCertSel((prev) => { const n = new Set(prev); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; })}
                        className={`text-sm rounded-lg border px-3 py-2 text-right transition ${on ? "bg-emerald-50 border-emerald-400 text-emerald-800 font-medium" : "bg-white border-slate-200 text-slate-600"} ${canEditCerts ? "hover:border-slate-400" : "cursor-default"}`}>
                        {on ? "✓ " : ""}{c.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            {canEditCerts && (
              <div className="border-t border-slate-200 p-3 flex gap-2">
                <button onClick={saveCerts} disabled={pending}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50">
                  {pending ? "שומר..." : "שמור הסמכות"}
                </button>
                <button onClick={() => setCertSoldier(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">ביטול</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---- Edit / Add soldier modal ---- */}
      {editRow && (
        <SoldierEditModal
          row={editRow === "new" ? null : editRow}
          squads={squads} companyRoles={companyRoles} companies={companies}
          showCompany={showCompany} pending={pending} err={err}
          onClose={() => setEditRow(null)} onSubmit={submitEdit} onToggleActive={toggleActive}
        />
      )}
    </div>
  );
}

function SoldierEditModal({
  row, squads, companyRoles, companies, showCompany, pending, err, onClose, onSubmit, onToggleActive,
}: {
  row: SoldierRow | null;
  squads: Opt[]; companyRoles: (Opt & { isCommander: boolean })[]; companies: Opt[];
  showCompany: boolean; pending: boolean; err: string | null;
  onClose: () => void; onSubmit: (fd: FormData) => void; onToggleActive: (id: string, inactive: boolean) => void;
}) {
  const [companyId, setCompanyId] = useState(row?.companyId || (showCompany ? "" : companies[0]?.id || ""));
  const squadOpts = companyId ? squads.filter((s) => s.companyId === companyId) : squads;
  const roleOpts = companyId ? companyRoles.filter((r) => r.companyId === companyId) : companyRoles;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        action={(fd) => onSubmit(fd)}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden"
      >
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-bold text-slate-800">{row ? "עריכת חייל" : "הוספת חייל"}</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {row && <input type="hidden" name="id" value={row.id} />}
          <Field label="שם מלא"><input name="fullName" required defaultValue={row?.fullName || ""} className="inp" /></Field>
          <Field label="מספר אישי"><input name="personalNumber" required defaultValue={row?.personalNumber || ""} className="inp font-mono" /></Field>
          <Field label="טלפון"><input name="phone" defaultValue={row?.phone || ""} className="inp" placeholder="05XXXXXXXX" /></Field>
          {showCompany && (
            <Field label="פלוגה">
              <select name="companyId" value={companyId} onChange={(e) => setCompanyId(e.target.value)} className="inp">
                <option value="">— בחר —</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
          )}
          <Field label="מחלקה">
            <select name="squadId" defaultValue={row?.squadId || ""} className="inp">
              <option value="">— ללא —</option>
              {squadOpts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="תפקיד">
            <select name="companyRoleId" defaultValue={row?.companyRoleId || ""} className="inp">
              <option value="">— ללא —</option>
              {roleOpts.map((r) => <option key={r.id} value={r.id}>{r.name}{r.isCommander ? " ⭐" : ""}</option>)}
            </select>
          </Field>
          {err && <div className="text-sm text-rose-600 bg-rose-50 rounded-lg px-3 py-2">{err}</div>}
          {row && (
            <button type="button" onClick={() => onToggleActive(row.id, row.inactive)}
              className={`text-xs ${row.inactive ? "text-emerald-600 hover:text-emerald-700" : "text-rose-500 hover:text-rose-700"}`}>
              {row.inactive ? "↩︎ הפעל חייל מחדש" : "🗑️ השבת חייל"}
            </button>
          )}
        </div>
        <div className="border-t border-slate-200 p-3 flex gap-2">
          <button type="submit" disabled={pending} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50">
            {pending ? "שומר..." : "שמור"}
          </button>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">ביטול</button>
        </div>
      </form>
      <style>{`.inp{width:100%;border:1px solid #cbd5e1;border-radius:0.5rem;padding:0.5rem 0.75rem;font-size:0.875rem;background:#fff}`}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-slate-500 mb-1">{label}</span>
      {children}
    </label>
  );
}
