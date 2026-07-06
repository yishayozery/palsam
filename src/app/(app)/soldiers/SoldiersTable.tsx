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
  dutyRound: number | null;
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
  const [fRound, setFRound] = useState(""); // "", "1".."3", "none"

  const filtered = useMemo(() => {
    let list = soldiers;
    if (fCompany) list = list.filter((s) => (fCompany === "none" ? !s.companyId : s.companyId === fCompany));
    if (fSquad) list = list.filter((s) => (fSquad === "none" ? !s.squadId : s.squadId === fSquad));
    if (fRole) list = list.filter((s) => (fRole === "none" ? !s.companyRoleId : s.companyRoleId === fRole));
    if (fCert) list = list.filter((s) => s.certIds.includes(fCert));
    if (fRound) list = list.filter((s) => (fRound === "none" ? s.dutyRound == null : String(s.dutyRound) === fRound));
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
  }, [soldiers, fCompany, fSquad, fRole, fCert, fRound, search]);

  const anyFilter = fCompany || fSquad || fRole || fCert || fRound || search.trim();

  // squads/roles filtered for the current filter-company (nicer dropdowns)
  const squadOpts = fCompany ? squads.filter((s) => s.companyId === fCompany) : squads;
  const roleOpts = fCompany ? companyRoles.filter((r) => r.companyId === fCompany) : companyRoles;

  // ספירת חיילים פר-אפשרות סינון (facet counts) — לפי הסקופ הנוכחי, למעט הפילטר שנספר
  const counts = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = (exclude: "company" | "squad" | "role" | "cert" | "round") => {
      let list = soldiers;
      if (exclude !== "company" && fCompany) list = list.filter((s) => (fCompany === "none" ? !s.companyId : s.companyId === fCompany));
      if (exclude !== "squad" && fSquad) list = list.filter((s) => (fSquad === "none" ? !s.squadId : s.squadId === fSquad));
      if (exclude !== "role" && fRole) list = list.filter((s) => (fRole === "none" ? !s.companyRoleId : s.companyRoleId === fRole));
      if (exclude !== "cert" && fCert) list = list.filter((s) => s.certIds.includes(fCert));
      if (exclude !== "round" && fRound) list = list.filter((s) => (fRound === "none" ? s.dutyRound == null : String(s.dutyRound) === fRound));
      if (q) list = list.filter((s) => s.fullName.toLowerCase().includes(q) || s.personalNumber.includes(q) || (s.squadName || "").toLowerCase().includes(q) || (s.roleName || "").toLowerCase().includes(q));
      return list;
    };
    const single = (list: SoldierRow[], key: (s: SoldierRow) => string) => {
      const m = new Map<string, number>();
      for (const s of list) { const v = key(s) || "none"; m.set(v, (m.get(v) ?? 0) + 1); }
      return m;
    };
    const multi = (list: SoldierRow[], key: (s: SoldierRow) => string[]) => {
      const m = new Map<string, number>();
      for (const s of list) for (const v of key(s)) m.set(v, (m.get(v) ?? 0) + 1);
      return m;
    };
    return {
      company: single(base("company"), (s) => s.companyId),
      squad: single(base("squad"), (s) => s.squadId),
      role: single(base("role"), (s) => s.companyRoleId),
      cert: multi(base("cert"), (s) => s.certIds),
      round: single(base("round"), (s) => (s.dutyRound != null ? String(s.dutyRound) : "none")),
    };
  }, [soldiers, fCompany, fSquad, fRole, fCert, fRound, search]);

  // ---- Cert popup ----
  const [certSoldier, setCertSoldier] = useState<SoldierRow | null>(null);
  const [certSel, setCertSel] = useState<Set<string>>(new Set());
  const [certEdit, setCertEdit] = useState(false);
  function openCerts(s: SoldierRow) {
    setCertSoldier(s); setCertSel(new Set(s.certIds)); setCertEdit(false);
  }
  // ---- Driving popup (תצוגה בלבד — מנוהל ע"י קצין הרכב) ----
  const [drivingSoldier, setDrivingSoldier] = useState<SoldierRow | null>(null);
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
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name} ({counts.company.get(c.id) ?? 0})</option>)}
            {(counts.company.get("none") ?? 0) > 0 && <option value="none">(ללא פלוגה) ({counts.company.get("none")})</option>}
          </select>
        )}
        <select value={fSquad} onChange={(e) => setFSquad(e.target.value)}
          className="border border-slate-300 rounded-lg px-2 py-2 text-sm bg-white">
          <option value="">כל המחלקות</option>
          {squadOpts.map((s) => <option key={s.id} value={s.id}>{s.name} ({counts.squad.get(s.id) ?? 0})</option>)}
          {(counts.squad.get("none") ?? 0) > 0 && <option value="none">(ללא מחלקה) ({counts.squad.get("none")})</option>}
        </select>
        <select value={fRole} onChange={(e) => setFRole(e.target.value)}
          className="border border-slate-300 rounded-lg px-2 py-2 text-sm bg-white">
          <option value="">כל התפקידים</option>
          {roleOpts.map((r) => <option key={r.id} value={r.id}>{r.name} ({counts.role.get(r.id) ?? 0})</option>)}
          {(counts.role.get("none") ?? 0) > 0 && <option value="none">(ללא תפקיד) ({counts.role.get("none")})</option>}
        </select>
        {certTypes.length > 0 && (
          <select value={fCert} onChange={(e) => setFCert(e.target.value)}
            className="border border-slate-300 rounded-lg px-2 py-2 text-sm bg-white">
            <option value="">כל ההסמכות</option>
            {certTypes.map((c) => <option key={c.id} value={c.id}>{c.name} ({counts.cert.get(c.id) ?? 0})</option>)}
          </select>
        )}
        <select value={fRound} onChange={(e) => setFRound(e.target.value)}
          className="border border-slate-300 rounded-lg px-2 py-2 text-sm bg-white">
          <option value="">כל הסבבים</option>
          {[1, 2, 3].map((r) => <option key={r} value={String(r)}>🔄 סבב {r} ({counts.round.get(String(r)) ?? 0})</option>)}
          <option value="none">ללא סבב ({counts.round.get("none") ?? 0})</option>
        </select>
        {anyFilter && (
          <button onClick={() => { setSearch(""); setFCompany(""); setFSquad(""); setFRole(""); setFCert(""); setFRound(""); }}
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
              <th className="sticky right-0 z-20 bg-slate-50 px-3 py-2 text-right font-medium border-b min-w-[150px] shadow-[-4px_0_6px_-4px_rgba(0,0,0,0.1)]">חייל / מ.א</th>
              {showCompany && <th className="px-2 py-2 text-right font-medium border-b">פלוגה</th>}
              <th className="px-2 py-2 text-right font-medium border-b">מחלקה</th>
              <th className="px-2 py-2 text-right font-medium border-b">תפקיד</th>
              <th className="px-2 py-2 text-center font-medium border-b">סבב</th>
              <th className="px-2 py-2 text-center font-medium border-b">הסמכות</th>
              <th className="px-2 py-2 text-center font-medium border-b">ציוד חתום</th>
              <th className="px-2 py-2 text-center font-medium border-b">נהיגה</th>
              <th className="px-2 py-2 border-b" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s.id} className={`border-b last:border-0 ${s.inactive ? "opacity-50" : "hover:bg-slate-50"}`}>
                <td className={`sticky right-0 z-10 px-3 py-2 whitespace-nowrap shadow-[-4px_0_6px_-4px_rgba(0,0,0,0.1)] ${s.inactive ? "bg-slate-50" : "bg-white"}`}>
                  <div className="font-medium text-slate-800">
                    {s.isCommander && <span title="מפקד">⭐ </span>}
                    {s.fullName}
                    {s.telegramLinked && <span className="text-[10px] text-sky-600 mr-1" title="מחובר לבוט">📲</span>}
                    {s.inactive && <span className="text-[10px] text-rose-500 mr-1">(לא פעיל)</span>}
                  </div>
                  <div className="font-mono text-[11px] text-slate-400">{s.personalNumber}</div>
                </td>
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
                  {s.dutyRound != null ? <Badge className="bg-purple-100 text-purple-700">🔄 {s.dutyRound}</Badge> : <span className="text-slate-300">—</span>}
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
                    <button onClick={() => setDrivingSoldier(s)}
                      className={`text-[11px] rounded px-2 py-0.5 border inline-flex items-center gap-1 ${
                        s.drivingStatus === "expired" || s.drivingStatus === "missing" ? "bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100"
                          : s.drivingStatus === "warning" ? "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100"
                            : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"}`}>
                      🪪 {s.drivingNames.length}
                      {(s.drivingStatus === "expired" || s.drivingStatus === "missing") && <span className="w-1.5 h-1.5 rounded-full bg-rose-500" title="ריענון פג" />}
                      {s.drivingStatus === "warning" && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" title="ריענון עומד לפוג" />}
                    </button>
                  )}
                </td>
                <td className="px-2 py-2 text-center whitespace-nowrap">
                  <button onClick={() => { setErr(null); setEditRow(s); }} className="text-xs text-blue-600 hover:underline">עריכה</button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={showCompany ? 9 : 8} className="px-3 py-6 text-center text-sm text-slate-400">לא נמצאו חיילים</td></tr>
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
              ) : certEdit ? (
                // ---- מצב עריכה: בחירת הסמכות להוספה/הסרה ----
                <div>
                  <div className="text-xs text-slate-500 mb-2">סמן/בטל סימון להוספה או הסרה של הסמכה:</div>
                  <div className="grid grid-cols-2 gap-2">
                    {certTypes.map((c) => {
                      const on = certSel.has(c.id);
                      return (
                        <button key={c.id} type="button"
                          onClick={() => setCertSel((prev) => { const n = new Set(prev); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; })}
                          className={`text-sm rounded-lg border px-3 py-2 text-right transition hover:border-slate-400 ${on ? "bg-emerald-50 border-emerald-400 text-emerald-800 font-medium" : "bg-white border-slate-200 text-slate-600"}`}>
                          {on ? "✓ " : "＋ "}{c.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                // ---- מצב תצוגה: הסמכות החייל ----
                <div className="flex flex-wrap gap-2">
                  {certSel.size === 0 ? (
                    <p className="text-sm text-slate-400">אין הסמכות לחייל זה.</p>
                  ) : (
                    Array.from(certSel).map((id) => (
                      <Badge key={id} className="bg-emerald-50 text-emerald-700 text-sm">🏅 {certTypes.find((c) => c.id === id)?.name ?? "—"}</Badge>
                    ))
                  )}
                </div>
              )}
            </div>
            <div className="border-t border-slate-200 p-3 flex gap-2">
              {certEdit ? (
                <>
                  <button onClick={saveCerts} disabled={pending}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50">
                    {pending ? "שומר..." : "שמור הסמכות"}
                  </button>
                  <button onClick={() => { setCertSel(new Set(certSoldier.certIds)); setCertEdit(false); }} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">ביטול</button>
                </>
              ) : (
                <>
                  {canEditCerts && certTypes.length > 0 && (
                    <button onClick={() => setCertEdit(true)} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2 text-sm font-medium">✏️ עריכה — הוסף / הסר הסמכה</button>
                  )}
                  <button onClick={() => setCertSoldier(null)} className={`rounded-lg border border-slate-300 px-4 py-2 text-sm ${canEditCerts ? "" : "flex-1"}`}>סגור</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ---- Driving popup (תצוגה בלבד — מנוהל ע"י קצין הרכב) ---- */}
      {drivingSoldier && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setDrivingSoldier(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-bold text-slate-800">🪪 נהיגה — {drivingSoldier.fullName}</h3>
              <button onClick={() => setDrivingSoldier(null)} className="text-slate-400 hover:text-slate-700 text-xl">✕</button>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {drivingSoldier.drivingNames.map((n, i) => <Badge key={i} className="bg-slate-100 text-slate-700 text-sm">🪪 {n}</Badge>)}
              </div>
              {(() => {
                const d = drivingSoldier.drivingRefresherDate ? new Date(drivingSoldier.drivingRefresherDate).toLocaleDateString("he-IL") : null;
                if (drivingSoldier.drivingStatus === "missing") return <div className="text-sm font-medium text-rose-600 bg-rose-50 rounded-lg px-3 py-2">⚠️ לא בוצע ריענון נהיגה</div>;
                if (drivingSoldier.drivingStatus === "expired") return <div className="text-sm font-medium text-rose-600 bg-rose-50 rounded-lg px-3 py-2">⚠️ ריענון נהיגה פג ({d})</div>;
                if (drivingSoldier.drivingStatus === "warning") return <div className="text-sm font-medium text-amber-600 bg-amber-50 rounded-lg px-3 py-2">ריענון נהיגה עומד לפוג ({d})</div>;
                return <div className="text-sm text-emerald-600">✓ ריענון בתוקף{d ? ` (${d})` : ""}</div>;
              })()}
              <p className="text-[11px] text-slate-400">הרשאות הנהיגה והריענון מנוהלים ע״י קצין הרכב (מסך ״קצין רכב״).</p>
            </div>
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
          <Field label="🔄 סבב תעסוקה">
            <select name="dutyRound" defaultValue={row?.dutyRound != null ? String(row.dutyRound) : ""} className="inp">
              <option value="">— ללא —</option>
              <option value="1">סבב 1</option>
              <option value="2">סבב 2</option>
              <option value="3">סבב 3</option>
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
