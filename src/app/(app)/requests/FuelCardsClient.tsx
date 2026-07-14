"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui";
import SignaturePad from "@/components/SignaturePad";
import { importFuelCards, allocateFuelCards, unallocateFuelCard, deleteFuelCard, signFuelCard } from "./fuel-actions";

export type FuelCard = {
  id: string; cardNumber: string; label: string | null; status: "AVAILABLE" | "ALLOCATED" | "SIGNED";
  allocatedBattalionId: string | null; allocatedName: string | null;
  signedByName: string | null; signedByPersonal: string | null; signedAt: string | null;
};

const STATUS_LABEL = { AVAILABLE: "במאגר", ALLOCATED: "ממתין לחתימה", SIGNED: "נחתם" } as const;
const STATUS_STYLE = { AVAILABLE: "bg-slate-100 text-slate-600", ALLOCATED: "bg-amber-100 text-amber-700", SIGNED: "bg-emerald-100 text-emerald-700" } as const;

export default function FuelCardsClient({ mode, cards, childBattalions }: {
  mode: "brigade" | "battalion";
  cards: FuelCard[];
  childBattalions: { id: string; name: string }[];
}) {
  const [pending, start] = useTransition();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [allocTo, setAllocTo] = useState("");
  const [signFor, setSignFor] = useState<string | null>(null);
  const [sig, setSig] = useState("");

  const act = (fn: (fd: FormData) => Promise<{ error?: string }>, fd: FormData, onOk?: () => void) =>
    start(async () => { const r = await fn(fd); if (r?.error) alert(r.error); else onOk?.(); });

  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  if (mode === "brigade") {
    const available = cards.filter((c) => c.status === "AVAILABLE");
    const allocated = cards.filter((c) => c.status === "ALLOCATED");
    const signed = cards.filter((c) => c.status === "SIGNED");
    return (
      <div className="space-y-3">
        {/* טעינת כרטיסים */}
        <Card className="p-3">
          <div className="font-medium text-sm mb-2">⛽ טעינת כרטיסים למאגר</div>
          <form action={(fd) => act(importFuelCards, fd, () => { (document.getElementById("fuel-import") as HTMLTextAreaElement).value = ""; })} className="space-y-2">
            <textarea id="fuel-import" name="numbers" rows={3} placeholder="מספר כרטיס בכל שורה (או מופרד בפסיקים)" className="w-full rounded border border-slate-300 px-2 py-1 text-sm" />
            <div className="flex items-center gap-2">
              <input name="label" placeholder="הערה/סוג דלק (לא חובה)" className="rounded border border-slate-300 px-2 py-1 text-sm flex-1" />
              <button disabled={pending} className="text-sm bg-indigo-600 text-white rounded px-3 py-1.5 hover:bg-indigo-700 disabled:opacity-50">טען</button>
            </div>
          </form>
        </Card>

        {/* מאגר זמין + הקצאה */}
        <Card className="p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="font-medium text-sm">במאגר · {available.length}</span>
            {sel.size > 0 && (
              <form action={(fd) => { fd.set("cardIds", [...sel].join(",")); act(allocateFuelCards, fd, () => setSel(new Set())); }} className="flex items-center gap-1">
                <select name="battalionId" value={allocTo} onChange={(e) => setAllocTo(e.target.value)} required className="text-xs rounded border border-slate-300 px-1.5 py-1">
                  <option value="">בחר גדוד…</option>
                  {childBattalions.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
                <button disabled={pending} className="text-xs bg-amber-600 text-white rounded px-2 py-1 hover:bg-amber-700 disabled:opacity-50">הקצה {sel.size} →</button>
              </form>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {available.length === 0 && <span className="text-xs text-slate-300">— אין כרטיסים פנויים —</span>}
            {available.map((c) => (
              <label key={c.id} className={`text-xs rounded-full px-2 py-0.5 cursor-pointer border flex items-center gap-1 ${sel.has(c.id) ? "bg-amber-100 border-amber-300" : "bg-slate-50 border-slate-200"}`}>
                <input type="checkbox" checked={sel.has(c.id)} onChange={() => toggle(c.id)} className="w-3 h-3" />
                {c.cardNumber}
                <form action={(fd) => act(deleteFuelCard, fd)} className="inline"><input type="hidden" name="id" value={c.id} /><button className="text-rose-400 hover:text-rose-600">×</button></form>
              </label>
            ))}
          </div>
        </Card>

        {/* מוקצים + חתומים */}
        {[["ממתינים לחתימה", allocated, "amber"], ["נחתמו", signed, "emerald"]].map(([title, list]) => {
          const arr = list as FuelCard[];
          return (
            <Card key={title as string} className="p-3">
              <div className="font-medium text-sm mb-2">{title as string} · {arr.length}</div>
              <div className="space-y-1">
                {arr.length === 0 && <span className="text-xs text-slate-300">— אין —</span>}
                {arr.map((c) => (
                  <div key={c.id} className="text-xs flex flex-wrap items-center gap-2 border-b border-slate-50 pb-1">
                    <b>{c.cardNumber}</b>
                    <span className={`rounded-full px-2 py-0.5 ${STATUS_STYLE[c.status]}`}>{STATUS_LABEL[c.status]}</span>
                    <span className="text-slate-500">→ {c.allocatedName}</span>
                    {c.status === "SIGNED" && <span className="text-emerald-700">✍️ {c.signedByName} (מ״א {c.signedByPersonal})</span>}
                    {c.status === "ALLOCATED" && (
                      <form action={(fd) => act(unallocateFuelCard, fd)} className="inline"><input type="hidden" name="id" value={c.id} /><button className="text-slate-400 hover:underline">בטל הקצאה</button></form>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          );
        })}
      </div>
    );
  }

  // מצב גדוד — קצין רכב/מפקד חותם על קבלת כרטיסים
  const toSign = cards.filter((c) => c.status === "ALLOCATED");
  const done = cards.filter((c) => c.status === "SIGNED");
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">כרטיסי דלק שהוקצו לגדוד מהחטיבה. חתום על קבלתם (שם + מ״א + חתימה).</p>
      <Card className="p-3">
        <div className="font-medium text-sm mb-2">ממתינים לחתימה · {toSign.length}</div>
        {toSign.length === 0 && <span className="text-xs text-slate-300">— אין כרטיסים לחתימה —</span>}
        <div className="space-y-2">
          {toSign.map((c) => (
            <div key={c.id} className="border-b border-slate-100 pb-2">
              <div className="flex items-center gap-2 text-sm">
                <b>{c.cardNumber}</b>{c.label && <span className="text-slate-400 text-xs">{c.label}</span>}
                <button onClick={() => { setSignFor(signFor === c.id ? null : c.id); setSig(""); }} className="text-xs bg-emerald-600 text-white rounded px-2 py-1 hover:bg-emerald-700">✍️ חתום</button>
              </div>
              {signFor === c.id && (
                <form action={(fd) => { fd.set("signatureData", sig); act(signFuelCard, fd, () => { setSignFor(null); setSig(""); }); }} className="mt-2 space-y-2 bg-emerald-50/40 rounded p-2">
                  <input type="hidden" name="id" value={c.id} />
                  <div className="flex flex-wrap gap-2">
                    <input name="signedByName" placeholder="שם החותם" required className="rounded border border-slate-300 px-2 py-1 text-sm" />
                    <input name="signedByPersonal" placeholder="מספר אישי" required className="rounded border border-slate-300 px-2 py-1 text-sm w-28" />
                  </div>
                  <div className="rounded border border-slate-300 bg-white"><SignaturePad onChange={setSig} height={140} /></div>
                  <div className="flex gap-2">
                    <button disabled={pending} className="text-sm bg-emerald-600 text-white rounded px-3 py-1.5 hover:bg-emerald-700 disabled:opacity-50">אשר חתימה</button>
                    <button type="button" onClick={() => { setSignFor(null); setSig(""); }} className="text-sm text-slate-400">ביטול</button>
                  </div>
                </form>
              )}
            </div>
          ))}
        </div>
      </Card>
      <Card className="p-3">
        <div className="font-medium text-sm mb-2">נחתמו · {done.length}</div>
        {done.length === 0 && <span className="text-xs text-slate-300">— אין —</span>}
        <div className="space-y-1">
          {done.map((c) => (
            <div key={c.id} className="text-xs flex flex-wrap items-center gap-2">
              <b>{c.cardNumber}</b>
              <span className="text-emerald-700">✍️ {c.signedByName} (מ״א {c.signedByPersonal})</span>
              {c.signedAt && <span className="text-slate-400">{new Date(c.signedAt).toLocaleDateString("he-IL")}</span>}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
