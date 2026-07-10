"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addFuelCard, returnFuelCard, deleteFuelCard } from "./vehicle-actions";

type Card = { id: string; cardNumber: string; soldierName: string; soldierId: string; checkoutAt: string; returnedAt: string | null; note: string | null };
type Opt = { id: string; name: string };

function fmt(d: string) { return new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", dateStyle: "short" }).format(new Date(d)); }
function daysAgo(d: string) { return Math.floor((Date.now() - new Date(d).getTime()) / 86400000); }

export default function FuelCardsManager({ cards, soldiers }: { cards: Card[]; soldiers: Opt[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const open = cards.filter((c) => !c.returnedAt);
  const closed = cards.filter((c) => c.returnedAt);
  const filteredSoldiers = q ? soldiers.filter((s) => s.name.includes(q)) : soldiers;

  function submit(fd: FormData) {
    setErr(null);
    start(async () => {
      const r = await addFuelCard(fd);
      if (r?.error) { setErr(r.error); return; }
      router.refresh();
      (document.getElementById("fuel-form") as HTMLFormElement)?.reset();
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
          <button disabled={pending} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50">
            {pending ? "…" : "➕ משיכה"}
          </button>
        </form>
        {err && <p className="text-rose-600 text-sm mt-2">{err}</p>}
      </div>

      {/* פתוחים */}
      <div>
        <h3 className="font-bold text-slate-700 text-sm mb-2">🟢 כרטיסים פתוחים ({open.length})</h3>
        {open.length === 0 ? <p className="text-slate-400 text-sm">אין כרטיסים פתוחים.</p> : (
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="min-w-full text-sm">
              <thead><tr className="bg-slate-100 text-slate-500 text-xs">
                <th className="px-3 py-2 text-right">חייל</th><th className="px-3 py-2 text-right">מספר כרטיס</th>
                <th className="px-3 py-2 text-right">נמשך</th><th className="px-3 py-2"></th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {open.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-medium text-slate-800">{c.soldierName}</td>
                    <td className="px-3 py-2 font-mono">{c.cardNumber}</td>
                    <td className="px-3 py-2 text-slate-500">{fmt(c.checkoutAt)} <span className={`text-xs ${daysAgo(c.checkoutAt) > 3 ? "text-rose-500 font-bold" : "text-slate-400"}`}>({daysAgo(c.checkoutAt)} י׳)</span></td>
                    <td className="px-3 py-2 text-left whitespace-nowrap">
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
        )}
      </div>

      {/* היסטוריה */}
      {closed.length > 0 && (
        <details>
          <summary className="text-sm font-semibold text-slate-600 cursor-pointer">📜 היסטוריה — הוחזרו ({closed.length})</summary>
          <div className="mt-2 overflow-x-auto border border-slate-200 rounded-xl">
            <table className="min-w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                {closed.slice(0, 50).map((c) => (
                  <tr key={c.id} className="text-slate-500">
                    <td className="px-3 py-1.5">{c.soldierName}</td><td className="px-3 py-1.5 font-mono">{c.cardNumber}</td>
                    <td className="px-3 py-1.5 text-xs">{fmt(c.checkoutAt)} ← {c.returnedAt && fmt(c.returnedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}
