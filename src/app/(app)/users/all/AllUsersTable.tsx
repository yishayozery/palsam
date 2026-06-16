"use client";

import { useState, useMemo } from "react";
import { Card, Table, Th, Td, Badge, EmptyState } from "@/components/ui";
import { regenerateInvite, toggleUser } from "../actions";

type Role = "SUPER_ADMIN" | "BATTALION_ADMIN" | "WAREHOUSE_MANAGER" | "COMPANY_REP" | "VIEWER" | "MAGAD" | "SAMAGAD";
type User = {
  id: string;
  fullName: string;
  username: string;
  phone: string | null;
  title: string | null;
  role: Role;
  roleLabel: string;
  holderName: string | null;
  holderKind: string | null;
  extraHolders: string[];
  soldierFullName: string | null;
  soldierPN: string | null;
  active: boolean;
  passwordSet: boolean;
  inviteToken: string | null;
  createdAt: string;
};

const ROLE_OPTS: { v: Role; l: string }[] = [
  { v: "BATTALION_ADMIN", l: 'מפ״מ' },
  { v: "WAREHOUSE_MANAGER", l: "קצין מחסן" },
  { v: "COMPANY_REP", l: 'רס״פ' },
  { v: "VIEWER", l: "צופה" },
];

function InviteCell({ user, baseUrl }: { user: User; baseUrl: string }) {
  const [copied, setCopied] = useState(false);
  if (user.passwordSet) {
    return (
      <div className="flex items-center gap-2">
        <Badge className="bg-emerald-100 text-emerald-800 text-[10px]">✓ פעיל</Badge>
        <form action={regenerateInvite}>
          <input type="hidden" name="id" value={user.id} />
          <button className="text-xs text-slate-500 hover:text-slate-800 underline">שלח קישור חדש</button>
        </form>
      </div>
    );
  }
  const link = `${baseUrl}/invite/${user.inviteToken}`;
  const wa = user.phone
    ? `https://wa.me/${user.phone.replace(/\D/g, "").replace(/^0/, "972")}?text=${encodeURIComponent(`הוזמנת למערכת PALSAM. הקישור להגדרת סיסמה: ${link}`)}`
    : `https://wa.me/?text=${encodeURIComponent(`הוזמנת למערכת PALSAM. הקישור להגדרת סיסמה: ${link}`)}`;
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <Badge className="bg-amber-100 text-amber-800 text-[10px]">⏳ ממתין</Badge>
      <button onClick={() => { navigator.clipboard?.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
        className="text-xs text-slate-500 hover:text-slate-800">
        {copied ? "✓ הועתק" : "📋 העתק"}
      </button>
      <a href={wa} target="_blank" rel="noreferrer" className="text-xs text-emerald-600 hover:underline">📱 WhatsApp</a>
      <form action={regenerateInvite}>
        <input type="hidden" name="id" value={user.id} />
        <button className="text-xs text-blue-600 hover:underline">🔄 חדש</button>
      </form>
    </div>
  );
}

export default function AllUsersTable({ users, baseUrl, initialQ, initialRole, initialStatus }: {
  users: User[]; baseUrl: string; initialQ: string; initialRole: string; initialStatus: string;
}) {
  const [q, setQ] = useState(initialQ);
  const [role, setRole] = useState(initialRole);
  const [status, setStatus] = useState(initialStatus);

  const stats = useMemo(() => ({
    total: users.length,
    active: users.filter((u) => u.active && u.passwordSet).length,
    pending: users.filter((u) => !u.passwordSet).length,
    inactive: users.filter((u) => !u.active).length,
  }), [users]);

  const filtered = useMemo(() => {
    return users.filter((u) => {
      if (role && u.role !== role) return false;
      if (status === "active" && (!u.active || !u.passwordSet)) return false;
      if (status === "pending" && u.passwordSet) return false;
      if (status === "inactive" && u.active) return false;
      if (q.trim()) {
        const qq = q.trim().toLowerCase();
        return u.fullName.toLowerCase().includes(qq)
          || u.username.toLowerCase().includes(qq)
          || (u.phone ?? "").includes(qq)
          || (u.title ?? "").toLowerCase().includes(qq);
      }
      return true;
    });
  }, [users, q, role, status]);

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Card className="p-3"><div className="text-xs text-slate-500">סה״כ משתמשים</div><div className="text-2xl font-bold mt-1">{stats.total}</div></Card>
        <Card className="p-3"><div className="text-xs text-slate-500">פעילים</div><div className="text-2xl font-bold mt-1 text-emerald-600">{stats.active}</div></Card>
        <Card className="p-3"><div className="text-xs text-slate-500">ממתינים</div><div className="text-2xl font-bold mt-1 text-amber-600">{stats.pending}</div></Card>
        <Card className="p-3"><div className="text-xs text-slate-500">מושבתים</div><div className="text-2xl font-bold mt-1 text-slate-400">{stats.inactive}</div></Card>
      </div>

      <Card className="p-3 mb-3">
        <div className="flex gap-2 flex-wrap items-end">
          <div className="flex-1 min-w-40">
            <label className="block text-xs text-slate-500 mb-1">חיפוש (שם / משתמש / טלפון / תואר)</label>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="הקלד..."
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">הרשאות</label>
            <select value={role} onChange={(e) => setRole(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="">הכל</option>
              {ROLE_OPTS.map((r) => <option key={r.v} value={r.v}>{r.l}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">סטטוס</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="">הכל</option>
              <option value="active">פעילים</option>
              <option value="pending">ממתינים להזמנה</option>
              <option value="inactive">מושבתים</option>
            </select>
          </div>
          <span className="text-xs text-slate-500 self-end pb-2">{filtered.length} משתמשים</span>
        </div>
      </Card>

      <Card>
        {filtered.length === 0 ? (
          <EmptyState>לא נמצאו משתמשים</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr><Th>שם</Th><Th>תואר</Th><Th>הרשאות</Th><Th>שיוך</Th><Th>טלפון</Th><Th>סטטוס / הזמנה</Th><Th></Th></tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id} className={u.active ? "" : "opacity-50"}>
                  <Td>
                    <div className="font-medium">{u.fullName}</div>
                    <div className="text-xs text-slate-400 font-mono">@{u.username}</div>
                    {u.soldierFullName && <div className="text-[11px] text-purple-600">🔗 חייל: {u.soldierFullName}{u.soldierPN ? ` (${u.soldierPN})` : ""}</div>}
                  </Td>
                  <Td className="text-xs">{u.title ?? <span className="text-slate-300">—</span>}</Td>
                  <Td><Badge className="bg-slate-200 text-slate-700 text-[10px]">🔑 {u.roleLabel}</Badge></Td>
                  <Td className="text-xs">
                    {u.holderName ?? <span className="text-slate-300">—</span>}
                    {u.extraHolders.length > 0 && <span className="text-slate-400"> +{u.extraHolders.length}</span>}
                  </Td>
                  <Td className="text-xs text-slate-500">{u.phone ?? "—"}</Td>
                  <Td><InviteCell user={u} baseUrl={baseUrl} /></Td>
                  <Td>
                    <form action={toggleUser}>
                      <input type="hidden" name="id" value={u.id} />
                      <button className="text-xs text-rose-500 hover:text-rose-700">{u.active ? "השבת" : "הפעל"}</button>
                    </form>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}
