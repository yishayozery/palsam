"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import SignaturePad from "@/components/SignaturePad";
import { addFuelCard, returnFuelCard, deleteFuelCard, sendFuelSignLink } from "./vehicle-actions";

type Card = {
  id: string; cardNumber: string; soldierName: string; soldierId: string; soldierConnected: boolean;
  checkoutAt: string; returnedAt: string | null; note: string | null; signed: boolean; signLinkSentAt: string | null;
};
type Opt = { id: string; name: string };

function fmt(d: string) { return new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", dateStyle: "short" }).format(new Date(d)); }
function daysAgo(d: string) { return Math.floor((Date.now() - new Date(d).getTime()) / 86400000); }

/** תג סטטוס חתימה של כרטיס פתוח. */
function SignStatus({ c }: { c: Card }) {
  if (c.signed) return <span className="text-xs bg-emerald-100 text-emerald-700 rounded-full px-2 py-0.5 whitespace-nowrap">✍️ נחתם</span>;
  if (c.signLinkSentAt) return <span title={`נשלח ${fmt(c.signLinkSentAt)}`} className="text-xs bg-amber-100 text-amber-700 rounded-full px-2 py-0.5 whitespace-nowrap">📤 נשלח · ממתין</span>;
  return <span className="text-xs bg-slate-100 text-slate-500 rounded-full px-2 py-0.5 whitespace-nowrap">◌ טרם נחתם</span>;
}

export default function FuelCardsManager({ cards, soldiers }: { cards: Card[]; soldiers: Opt[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [sig, setSig] = useState("");
  const [tab, setTab] = useState<"open" | "returned">("open");

  const open = cards.filter((c) => !c.returnedAt);
  const returned = cards.filter((c) => c.returnedAt);
  const filteredSoldiers = q ? soldiers.filter((s) => s.name.includes(q)) : soldiers;

  function submit(fd: FormData) {
    setErr(null);
    start(async () => {
      const r = await addFuelCard(fd);
      if (r?.error) { setErr(r.error); return; }
      setSig("");
      router.refresh();
      (document.getElementById("fuel-form") as HTMLFormElement)?.reset();
    });
  }

  function sendLink(c: Card) {
    start(async () => {
      const r = await sendFuelSignLink(c.id);
      if (r.error) { alert(r.error); return; }
      if (r.telegramSent) alert("✅ נשלחה בקשת חתימה לחייל בטלגרם");
      else if (r.link) { await navigator.clipboard?.writeText(r.link).catch(() => {}); alert("החייל לא מחובר לבוט — הלינק הועתק, שלח/י בוואטסאפ:\n" + r.link); }
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      {/* משיכת כרטיס */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
        <h3 className="font-bold text-slate-700 text-sm mb-3">⛽ משיכת כרטיס דלק</h3>
        <form id="fuel-form" action={submit} className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-600 mb-1">חייל</label>
            <input list="soldier-list" name="_soldierName" onChange={(e) => setQ(e.target.value)}
              placeholder="חפש/י שם…" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <datalist id="soldier-list">{filteredSoldiers.slice(0, 30).map((s) => <option key={s.id} value={s.name} />)}</datalist>
            <select name="soldierId" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm mt-1 bg-white" required>
              <option value="">— בחר/י חייל —</option>
              {filteredSoldiers.slice(0, 50).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">מספר כרטיס</label>
            <input name="cardNumber" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono" />
          </div>
          <div className="sm:col-span-4">
            <label className="block text-xs font-semibold text-slate-600 mb-1">✍️ חתימת החייל שקיבל (על המכשיר — אופציונלי)</label>
            <SignaturePad onChange={setSig} />
            <input type="hidden" name="signatureData" value={sig} />
          </div>
          <button disabled={pending} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 sm:col-span-4">
            {pending ? "…" : sig ? "➕ משיכה + חתימה" : "➕ משיכה"}
          </button>
        </form>
        {err && <p className="text-rose-600 text-sm mt-2">{err}</p>}
      </div>

      {/* טאבים */}
      <div className="inline-flex rounded-lg border border-slate-300 overflow-hidden text-sm">
        <button onClick={() => setTab("open")}
          className={`px-4 py-2 font-medium ${tab === "open" ? "bg-slate-800 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>🟢 פעילים ({open.length})</button>
        <button onClick={() => setTab("returned")}
          className={`px-4 py-2 font-medium ${tab === "returned" ? "bg-slate-800 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>📜 הוחזרו ({returned.length})</button>
      </div>

      {/* פעילים */}
      {tab === "open" && (
        open.length === 0 ? <p className="text-slate-400 text-sm">אין כרטיסים פתוחים.</p> : (
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="min-w-full text-sm">
              <thead><tr className="bg-slate-100 text-slate-500 text-xs">
                <th className="px-3 py-2 text-right">חייל</th><th className="px-3 py-2 text-right">מספר כרטיס</th>
                <th className="px-3 py-2 text-right">נמשך</th><th className="px-3 py-2 text-right">חתימה</th><th className="px-3 py-2"></th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {open.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-medium text-slate-800 whitespace-nowrap">{c.soldierName}</td>
                    <td className="px-3 py-2 font-mono">{c.cardNumber}</td>
                    <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{fmt(c.checkoutAt)} <span className={`text-xs ${daysAgo(c.checkoutAt) > 3 ? "text-rose-500 font-bold" : "text-slate-400"}`}>({daysAgo(c.checkoutAt)} י׳)</span></td>
                    <td className="px-3 py-2"><SignStatus c={c} /></td>
                    <td className="px-3 py-2 text-left whitespace-nowrap">
                      {!c.signed && (
                        <button onClick={() => sendLink(c)} disabled={pending}
                          className="text-xs bg-indigo-600 text-white rounded px-2.5 py-1 hover:bg-indigo-700 disabled:opacity-50 ml-1">
                          {c.signLinkSentAt ? "🔁 שלח שוב" : "🔗 שלח לחתימה"}
                        </button>
                      )}
                      <button onClick={() => start(async () => { await returnFuelCard(c.id); router.refresh(); })} disabled={pending}
                        className="text-xs bg-slate-800 text-white rounded px-2.5 py-1 hover:bg-slate-900 disabled:opacity-50">↩️ החזרה</button>
                      <button onClick={() => { if (confirm("למחוק את הרשומה?")) start(async () => { await deleteFuelCard(c.id); router.refresh(); }); }} disabled={pending}
                        className="text-xs text-rose-400 hover:text-rose-600 mr-2">🗑️</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* הוחזרו */}
      {tab === "returned" && (
        returned.length === 0 ? <p className="text-slate-400 text-sm">אין כרטיסים שהוחזרו.</p> : (
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="min-w-full text-sm">
              <thead><tr className="bg-slate-100 text-slate-500 text-xs">
                <th className="px-3 py-2 text-right">חייל</th><th className="px-3 py-2 text-right">מספר כרטיס</th>
                <th className="px-3 py-2 text-right">נמשך → הוחזר</th><th className="px-3 py-2 text-right">חתימה</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {returned.slice(0, 100).map((c) => (
                  <tr key={c.id} className="text-slate-500 hover:bg-slate-50">
                    <td className="px-3 py-1.5 whitespace-nowrap">{c.soldierName}</td>
                    <td className="px-3 py-1.5 font-mono">{c.cardNumber}</td>
                    <td className="px-3 py-1.5 text-xs whitespace-nowrap">{fmt(c.checkoutAt)} ← {c.returnedAt && fmt(c.returnedAt)}</td>
                    <td className="px-3 py-1.5">{c.signed ? "✍️" : "◌"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}
