"use client";

import { useState } from "react";
import { Card } from "@/components/ui";
import InviteLink from "@/components/InviteLink";
import { appointSubUser, removeSubUser, setDelegateCap, setDefaultDelegateCap } from "./actions";

type SubUser = { id: string; username: string; fullName: string; phone: string | null; passwordSet: boolean; inviteToken: string | null; telegramLinked: boolean; area?: string };
type SquadCmd = SubUser & { squadName: string };
type SoldierOpt = { id: string; fullName: string; squadId: string | null; telegramLinked: boolean };
type SquadOpt = { id: string; name: string };
type Holder = {
  id: string; kind: string; name: string; cap: number; capIsDefault: boolean;
  subUsers: SubUser[]; squadCommanders: SquadCmd[]; squads: SquadOpt[]; soldiers: SoldierOpt[];
};

function suggestUsername(fullName: string) {
  return (fullName.trim().split(/\s+/)[0] || "").replace(/[^A-Za-z֐-׿0-9_.-]+/g, "").slice(0, 20);
}

// שורת בעל-תפקיד עם לינק הזמנה / הסרה
function PersonRow({ u, baseUrl, inviteRole, suffix }: { u: SubUser; baseUrl: string; inviteRole: "rep" | null; suffix?: string }) {
  return (
    <div className="flex items-center gap-2 flex-wrap px-4 py-2 text-sm">
      <span className="font-medium text-slate-800">{u.fullName}</span>
      {suffix && <span className="text-[11px] text-slate-500">· {suffix}</span>}
      <span className="text-slate-400 text-xs">@{u.username}</span>
      {u.telegramLinked && <span className="text-[10px] text-sky-600" title="מחובר לבוט">📲</span>}
      {!u.passwordSet && u.inviteToken ? (
        <InviteLink token={u.inviteToken} phone={u.phone} baseUrl={baseUrl} role={inviteRole} />
      ) : (
        <span className="text-[10px] text-emerald-600">פעיל</span>
      )}
      <form action={removeSubUser} className="mr-auto" onSubmit={(e) => { if (!confirm(`להסיר את ${u.fullName}?`)) e.preventDefault(); }}>
        <input type="hidden" name="id" value={u.id} />
        <button className="text-[11px] text-rose-400 hover:text-rose-600">🗑️ הסר</button>
      </form>
    </div>
  );
}

// טופס מינוי משותף (רס"פ / סגן / מפקד מחלקה)
function AppointForm({ holder, apptType }: { holder: Holder; apptType: "rep" | "deputy" | "squad" }) {
  const [soldierId, setSoldierId] = useState("");
  const [username, setUsername] = useState("");
  const [manualName, setManualName] = useState("");
  const [squadId, setSquadId] = useState("");
  const [area, setArea] = useState("general");

  const label = apptType === "squad" ? "מפקד מחלקה" : apptType === "deputy" ? "סגן" : "רס״פ";
  // לטובת מפקד מחלקה — אם נבחרה מחלקה, מסנן חיילים לפיה
  const soldiers = apptType === "squad" && squadId ? holder.soldiers.filter((s) => s.squadId === squadId) : holder.soldiers;
  const selected = holder.soldiers.find((s) => s.id === soldierId);

  return (
    <form
      action={appointSubUser}
      onSubmit={() => { setSoldierId(""); setUsername(""); setManualName(""); setSquadId(""); setArea("general"); }}
      className="px-4 py-3 border-t border-slate-100 bg-slate-50/50 flex flex-wrap items-end gap-2"
    >
      <input type="hidden" name="holderId" value={holder.id} />
      <input type="hidden" name="apptType" value={apptType} />
      {apptType === "rep" && (
        <div>
          <label className="block text-[11px] text-slate-500 mb-0.5">תחום</label>
          <select name="apptArea" value={area} onChange={(e) => setArea(e.target.value)}
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm bg-white min-w-[8rem]">
            <option value="general">כללי (הכל)</option>
            <option value="equip">רס״פ מחסן</option>
            <option value="personnel">רס״פ שלישות</option>
          </select>
        </div>
      )}
      {apptType === "squad" && (
        <div>
          <label className="block text-[11px] text-slate-500 mb-0.5">מחלקה</label>
          <select name="squadId" required value={squadId} onChange={(e) => { setSquadId(e.target.value); setSoldierId(""); }}
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm bg-white min-w-[7rem]">
            <option value="">— בחר —</option>
            {holder.squads.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      )}
      <div>
        <label className="block text-[11px] text-slate-500 mb-0.5">חייל {soldiers.length === 0 && "(מלא ידנית)"}</label>
        <select name="soldierId" value={soldierId}
          onChange={(e) => { setSoldierId(e.target.value); const s = soldiers.find((x) => x.id === e.target.value); if (s) { setUsername(suggestUsername(s.fullName)); setManualName(""); } }}
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm bg-white min-w-[9rem]">
          <option value="">— ידני —</option>
          {soldiers.map((s) => <option key={s.id} value={s.id}>{s.fullName}{s.telegramLinked ? " 📲" : ""}</option>)}
        </select>
      </div>
      {!soldierId && (
        <div>
          <label className="block text-[11px] text-slate-500 mb-0.5">שם מלא</label>
          <input name="fullName" value={manualName} onChange={(e) => { setManualName(e.target.value); if (!username) setUsername(suggestUsername(e.target.value)); }}
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm w-28" />
        </div>
      )}
      <div>
        <label className="block text-[11px] text-slate-500 mb-0.5">שם משתמש</label>
        <input name="username" required value={username} onChange={(e) => setUsername(e.target.value)}
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm w-24 font-mono" />
      </div>
      <button className="bg-slate-800 hover:bg-slate-900 text-white rounded-lg px-4 py-1.5 text-sm font-medium">מנה {label}</button>
      {selected?.telegramLinked
        ? <span className="text-[11px] text-sky-600">📲 יישלח בטלגרם</span>
        : <span className="text-[11px] text-slate-400">לינק לוואטסאפ</span>}
    </form>
  );
}

function HolderCard({ holder, baseUrl, isAdmin }: { holder: Holder; baseUrl: string; isAdmin: boolean }) {
  // מציג: רספ"ים/סגנים + מפקדי מחלקות (לפלוגות) + עורך תקרה (מנהל מערכת)
  const isWarehouse = holder.kind === "WAREHOUSE";
  const roleLabel = isWarehouse ? "סגן" : "רס״פ";
  const atCap = holder.subUsers.length >= holder.cap;

  return (
    <Card className="overflow-hidden">
      <div className="bg-slate-50 border-b border-slate-200 px-4 py-2.5 flex items-center justify-between gap-2">
        <h2 className="font-bold text-sm text-slate-700">
          {isWarehouse ? "🏪" : "👥"} {holder.name}
          <span className="text-slate-400 font-normal"> · {roleLabel}ים</span>
        </h2>
        <span className={`text-[11px] font-medium rounded-full px-2 py-0.5 ${atCap ? "bg-rose-100 text-rose-700" : "bg-slate-200 text-slate-600"}`}>
          {holder.subUsers.length}/{holder.cap}
        </span>
      </div>

      {/* רספ"ים / סגנים */}
      <div className="divide-y divide-slate-100">
        {holder.subUsers.map((u) => <PersonRow key={u.id} u={u} baseUrl={baseUrl} inviteRole={isWarehouse ? null : "rep"} suffix={!isWarehouse && u.area && u.area !== "כללי" ? u.area : undefined} />)}
        {holder.subUsers.length === 0 && <div className="px-4 py-2 text-xs text-slate-400">טרם מונו {roleLabel}ים.</div>}
      </div>
      {atCap ? (
        <div className="px-4 py-2 text-xs text-rose-600 bg-rose-50 border-t border-rose-100">
          תקרה ({holder.cap}). {isAdmin ? "אפשר להעלות למטה." : "בקש ממנהל המערכת להעלות, או הסר קיים."}
        </div>
      ) : (
        <AppointForm holder={holder} apptType={isWarehouse ? "deputy" : "rep"} />
      )}

      {/* מפקדי מחלקות — רק לפלוגות */}
      {!isWarehouse && (
        <div className="border-t border-slate-200">
          <div className="bg-slate-50/70 px-4 py-1.5 text-[11px] font-bold text-slate-500">🎖️ מפקדי מחלקות</div>
          <div className="divide-y divide-slate-100">
            {holder.squadCommanders.map((u) => <PersonRow key={u.id} u={u} baseUrl={baseUrl} inviteRole={null} suffix={u.squadName} />)}
            {holder.squadCommanders.length === 0 && <div className="px-4 py-2 text-xs text-slate-400">טרם מונו מפקדי מחלקות.</div>}
          </div>
          {holder.squads.length > 0
            ? <AppointForm holder={holder} apptType="squad" />
            : <div className="px-4 py-2 text-xs text-slate-400 border-t border-slate-100">כל המחלקות מאוישות (או שאין מחלקות מוגדרות).</div>}
        </div>
      )}

      {/* עורך תקרה — מנהל מערכת בלבד */}
      {isAdmin && (
        <form action={setDelegateCap} className="px-4 py-2 border-t border-slate-200 flex items-center gap-2 text-xs text-slate-500 bg-amber-50/40">
          <input type="hidden" name="holderId" value={holder.id} />
          <span>תקרת {roleLabel}ים:</span>
          <input name="cap" type="number" min={0} max={20} defaultValue={holder.cap} className="w-16 rounded border border-slate-300 px-2 py-0.5 text-xs" />
          <button className="text-blue-600 hover:underline">שמור</button>
          {holder.capIsDefault && <span className="text-slate-400">(ברירת מחדל)</span>}
        </form>
      )}
    </Card>
  );
}

export default function TeamClient({ holders, baseUrl, isAdmin, defaultCap }: { holders: Holder[]; baseUrl: string; isAdmin: boolean; defaultCap: number }) {
  const companies = holders.filter((h) => h.kind === "COMPANY");
  const warehouses = holders.filter((h) => h.kind === "WAREHOUSE");
  return (
    <div className="space-y-4">
      {isAdmin && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-900 space-y-2">
          <div>💡 תמונת-על: כל היחידות בגדוד עם רספ״ים/סגנים/מפקדי מחלקות מול התקרה. אדום = הגעה לתקרה.</div>
          <form action={setDefaultDelegateCap} className="flex items-center gap-2 border-t border-blue-200 pt-2">
            <span className="font-medium">תקרת ברירת מחדל לגדוד:</span>
            <input name="cap" type="number" min={0} max={20} defaultValue={defaultCap} className="w-16 rounded border border-blue-300 px-2 py-0.5 text-xs" />
            <button className="text-blue-700 font-medium hover:underline">שמור</button>
            <span className="text-blue-500">חלה על יחידות ללא תקרה משלהן. אפשר לשנות פר-יחידה בכל כרטיס.</span>
          </form>
        </div>
      )}
      {companies.length > 0 && (
        <div className="space-y-3">
          {isAdmin && <h3 className="text-sm font-bold text-slate-600">🪖 פלוגות</h3>}
          {companies.map((h) => <HolderCard key={h.id} holder={h} baseUrl={baseUrl} isAdmin={isAdmin} />)}
        </div>
      )}
      {warehouses.length > 0 && (
        <div className="space-y-3">
          {isAdmin && <h3 className="text-sm font-bold text-slate-600">🏪 מחסנים</h3>}
          {warehouses.map((h) => <HolderCard key={h.id} holder={h} baseUrl={baseUrl} isAdmin={isAdmin} />)}
        </div>
      )}
    </div>
  );
}
