"use client";

import { useState } from "react";
import { Card, Table, Th, Td, Badge, EmptyState } from "@/components/ui";
import { saveUser, regenerateInvite, toggleUser } from "./actions";
import UsernameSuggest from "./UsernameSuggest";

type Holder = { id: string; name: string; kind: string };
type Squad = { id: string; name: string; companyName: string };
type CustomRole = { id: string; name: string; template: string };
type User = {
  id: string; fullName: string; username: string; phone: string | null; title?: string | null;
  role: string; customRoleId: string | null; roleLabel: string;
  holderId: string | null; holderNames: string[];
  active: boolean; passwordSet: boolean; inviteToken: string | null;
};

const ROLE_OPTS = ["BATTALION_ADMIN", "SHALISH", "MAGAD", "SAMAGAD", "VIEWER"] as const;
const BUILTIN_LABELS: Record<string, string> = {
  BATTALION_ADMIN: "מנהל מערכת (הכל)",
  SHALISH: "שליש גדודי (שלישות + גיוס)",
  MAGAD: 'מג"ד (צפייה + אישור נשק)',
  SAMAGAD: 'סמג"ד (צפייה + אישור נשק)',
  VIEWER: "צופה (קריאה בלבד)",
};

function InviteCell({ user, baseUrl, battalionCode }: { user: User; baseUrl: string; battalionCode: string }) {
  const [copied, setCopied] = useState(false);
  if (user.passwordSet) {
    return (
      <form action={regenerateInvite}>
        <input type="hidden" name="id" value={user.id} />
        <button className="text-xs text-slate-400 hover:text-slate-700">איפוס סיסמה (הזמנה)</button>
      </form>
    );
  }
  const link = `${baseUrl}/invite/${user.inviteToken}`;
  const inviteMsg = `הוזמנת למערכת.\n🔑 להגדרת סיסמה (כניסה ראשונה): ${link}\n🔗 כניסה למערכת: ${baseUrl}/login?b=${battalionCode}`;
  const wa = user.phone
    ? `https://wa.me/${user.phone.replace(/\D/g, "").replace(/^0/, "972")}?text=${encodeURIComponent(inviteMsg)}`
    : `https://wa.me/?text=${encodeURIComponent(inviteMsg)}`;
  return (
    <div className="flex items-center gap-2">
      <Badge className="bg-amber-100 text-amber-700">ממתין להפעלה</Badge>
      <button onClick={() => { navigator.clipboard?.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
        className="text-xs text-slate-500 hover:text-slate-800">{copied ? "הועתק ✓" : "העתק קישור"}</button>
      <a href={wa} target="_blank" rel="noreferrer" className="text-xs text-emerald-600 hover:underline">וואטסאפ</a>
    </div>
  );
}

export default function UsersManager({ users, holders, squads, customRoles, baseUrl, brigade, battalionCode }: { users: User[]; holders: Holder[]; squads: Squad[]; customRoles: CustomRole[]; baseUrl: string; brigade: string; battalionCode: string }) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<string>("BATTALION_ADMIN");

  const warehouses = holders.filter((h) => h.kind === "WAREHOUSE");
  const companies = holders.filter((h) => h.kind === "COMPANY");

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={() => setOpen(true)} className="bg-slate-800 text-white rounded-lg px-4 py-2 text-sm hover:bg-slate-900">+ הזמנת משתמש</button>
      </div>

      <Card>
        {users.length === 0 ? <EmptyState>אין משתמשים. הזמן משתמש ראשון.</EmptyState> : (
          <Table>
            <thead><tr><Th>שם</Th><Th>תואר</Th><Th>הרשאות</Th><Th>שיוך</Th><Th>טלפון</Th><Th>הזמנה / סטטוס</Th><Th></Th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className={u.active ? "" : "opacity-50"}>
                  <Td><span className="font-medium">{u.fullName}</span> <span className="text-xs text-slate-400 font-mono">@{u.username}</span></Td>
                  <Td className="text-xs">{u.title ?? <span className="text-slate-300">—</span>}</Td>
                  <Td><Badge className="bg-slate-200 text-slate-700">🔑 {u.roleLabel}</Badge></Td>
                  <Td>{u.holderNames.length > 0 ? u.holderNames.join(", ") : "—"}</Td>
                  <Td className="text-xs text-slate-500">{u.phone ?? "—"}</Td>
                  <Td><InviteCell user={u} baseUrl={baseUrl} battalionCode={battalionCode} /></Td>
                  <Td>
                    <form action={toggleUser}>
                      <input type="hidden" name="id" value={u.id} />
                      <button className="text-xs text-rose-500 hover:text-rose-700">{u.active ? "השבתה" : "הפעלה"}</button>
                    </form>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <h3 className="font-bold text-slate-800">הזמנת משתמש חדש</h3>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>
            <form action={async (fd) => { await saveUser(fd); setOpen(false); }} className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">שם מלא</label>
                  <input name="fullName" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">תואר / תפקיד (טקסט חופשי)</label>
                  <input name="title" placeholder="מפ״מ, צופה, מטה..."
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </div>
              </div>
              <UsernameSuggest brigade={brigade} code={battalionCode} />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">טלפון (לשליחת הזמנה בוואטסאפ)</label>
                  <input name="phone" placeholder="05X-XXXXXXX" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">מ.א. (מספר אישי)</label>
                  <input name="personalNumber" placeholder="1234567" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">הרשאות</label>
                  <select name="role" value={role} onChange={(e) => setRole(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                    <optgroup label="הרשאותי בסיס">
                      {ROLE_OPTS.map((r) => <option key={r} value={r}>{BUILTIN_LABELS[r]}</option>)}
                    </optgroup>
                    {customRoles.length > 0 && (
                      <optgroup label="הרשאותים מותאמים">
                        {customRoles.map((c) => <option key={c.id} value={`custom:${c.id}`}>{c.name}</option>)}
                      </optgroup>
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">פלוגה (אופציונלי)</label>
                  <select name="companyHolderId" defaultValue="" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                    <option value="">— ללא —</option>
                    {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>

              {/* שיוך גמיש — הרשאות כפולות: מחסנים + פלוגה + מחלקות בכל שילוב */}
              {warehouses.length > 0 && (
                <div>
                  <label className="block text-xs text-slate-500 mb-1">מחסנים (אופציונלי — ניתן לבחור כמה)</label>
                  <div className="rounded-lg border border-slate-300 p-2 grid grid-cols-2 sm:grid-cols-3 gap-1 max-h-32 overflow-y-auto">
                    {warehouses.map((h) => (
                      <label key={h.id} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name="holderId" value={h.id} className="w-4 h-4" /> {h.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {squads.length > 0 && (
                <div>
                  <label className="block text-xs text-slate-500 mb-1">מחלקות (אופציונלי — ריק = כל הפלוגה)</label>
                  <div className="rounded-lg border border-slate-300 p-2 space-y-1 max-h-32 overflow-y-auto">
                    {squads.map((sq) => (
                      <label key={sq.id} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name="squadId" value={sq.id} className="w-4 h-4" /> {sq.name} <span className="text-xs text-slate-400">({sq.companyName})</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {/* 🔫 הרשאה פר-משתמש: אישור חיילים לנשק */}
              <input type="hidden" name="canApproveWeaponsField" value="1" />
              <label className="flex items-center gap-2 text-sm bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 cursor-pointer">
                <input type="checkbox" name="canApproveWeapons" className="w-4 h-4 accent-rose-600" />
                <span>🔫 <b>יכול לאשר חיילים לנשק</b> — רק אם מסומן, המשתמש יראה את מסך "אישור חיילים לנשק" ויוכל לאשר.</span>
              </label>

              <p className="text-xs text-slate-400">ייווצר קישור הזמנה — שלח אותו למשתמש; הוא יגדיר סיסמה בכניסה הראשונה.</p>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">ביטול</button>
                <button className="bg-slate-800 text-white rounded-lg px-4 py-2 text-sm">יצירת הזמנה</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
