"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";
import { setBaselinesBulk } from "./actions";

type Row = {
  id: string;
  name: string;
  sku: string | null;
  unit: string;
  trackingMethod: string;
  categoryName: string | null;
  categoryWarehouseType: string | null;
  currentQuantity: number;
  baseline: number;
};

const WH_LABELS: Record<string, string> = {
  EQUIPMENT: "ציוד",
  COMMS: "קשר",
  AMMO: "תחמושת",
  ARMORY: "נשק",
  VEHICLES: "רכב",
  MEDICAL: "רפואי",
  GENERAL: "כללי",
};

export default function PermanentItemsClient({
  companyId, companyName, rows,
}: {
  companyId: string;
  companyName: string;
  rows: Row[];
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [showOnly, setShowOnly] = useState<"all" | "with_stock" | "with_baseline" | "diff">("with_stock");
  const [edits, setEdits] = useState<Map<string, number>>(new Map());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const filtered = useMemo(() => {
    let list = rows;
    if (q.trim()) {
      const s = q.toLowerCase();
      list = list.filter((r) =>
        r.name.toLowerCase().includes(s) ||
        (r.sku ?? "").toLowerCase().includes(s) ||
        (r.categoryName ?? "").toLowerCase().includes(s)
      );
    }
    if (showOnly === "with_stock") list = list.filter((r) => r.currentQuantity > 0);
    else if (showOnly === "with_baseline") list = list.filter((r) => r.baseline > 0);
    else if (showOnly === "diff") list = list.filter((r) => r.currentQuantity !== r.baseline);
    return list;
  }, [rows, q, showOnly]);

  const dirty = edits.size;

  function setEdit(itemId: string, value: number) {
    const orig = rows.find((r) => r.id === itemId)?.baseline ?? 0;
    const v = Math.max(0, Math.floor(value || 0));
    const next = new Map(edits);
    if (v === orig) next.delete(itemId);
    else next.set(itemId, v);
    setEdits(next);
  }

  function applyToAll(value: number | "current") {
    const next = new Map(edits);
    for (const r of filtered) {
      const v = value === "current" ? r.currentQuantity : value;
      if (v === r.baseline) next.delete(r.id);
      else next.set(r.id, v);
    }
    setEdits(next);
  }

  async function save() {
    if (dirty === 0) return;
    setBusy(true); setMsg(null);
    try {
      const payload = Array.from(edits.entries()).map(([itemTypeId, permanentQuantity]) => ({ itemTypeId, permanentQuantity }));
      const fd = new FormData();
      fd.append("companyId", companyId);
      fd.append("rows", JSON.stringify(payload));
      const res = await setBaselinesBulk(fd);
      if (res?.error) setMsg({ ok: false, text: res.error });
      else {
        setMsg({ ok: true, text: `✓ ${res?.updated ?? 0} פריטים עודכנו` });
        setEdits(new Map());
        router.refresh();
      }
    } finally { setBusy(false); }
  }

  return (
    <>
      {/* פס פעולה צף */}
      {dirty > 0 && (
        <div className="sticky top-0 z-20 bg-amber-50 border-2 border-amber-300 rounded-lg p-3 mb-3 flex items-center gap-3 shadow-md">
          <span className="text-sm font-medium text-amber-900">
            ✏️ {dirty} שינויים לא שמורים
          </span>
          <button onClick={save} disabled={busy}
            className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4 py-1.5 text-sm font-medium disabled:opacity-50">
            {busy ? "שומר..." : "💾 שמור הכל"}
          </button>
          <button onClick={() => setEdits(new Map())} disabled={busy}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">ביטול</button>
          {msg && (
            <span className={`text-xs mr-auto ${msg.ok ? "text-emerald-700" : "text-rose-700"}`}>
              {msg.text}
            </span>
          )}
        </div>
      )}
      {msg && dirty === 0 && (
        <div className={`mb-3 rounded-lg p-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-rose-50 text-rose-800 border border-rose-200"}`}>
          {msg.text}
        </div>
      )}

      <Card className="p-3 mb-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
          <input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="🔍 חפש פריט / קטגוריה / מק״ט"
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
          <select value={showOnly} onChange={(e) => setShowOnly(e.target.value as typeof showOnly)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">
            <option value="all">הכל ({rows.length})</option>
            <option value="with_stock">📦 עם מלאי נוכחי ({rows.filter((r) => r.currentQuantity > 0).length})</option>
            <option value="with_baseline">📌 בסיס &gt; 0 ({rows.filter((r) => r.baseline > 0).length})</option>
            <option value="diff">⚠️ נוכחי ≠ בסיס ({rows.filter((r) => r.currentQuantity !== r.baseline).length})</option>
          </select>
          <div className="text-xs text-slate-500 sm:text-right">
            {filtered.length} מתוך {rows.length}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="text-slate-500">פעולה על כל המסונן:</span>
          <button onClick={() => applyToAll("current")}
            className="bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 rounded px-2.5 py-1">
            ⇆ בסיס = נוכחי (לכל המסונן)
          </button>
          <button onClick={() => applyToAll(0)}
            className="bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 rounded px-2.5 py-1">
            ↺ בסיס = 0 (כל הציוד חוזר)
          </button>
        </div>
      </Card>

      <Card className="overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">אין פריטים מתאימים לסינון</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-right p-2.5 font-medium text-xs text-slate-600">פריט</th>
                  <th className="text-right p-2.5 font-medium text-xs text-slate-600">מק״ט</th>
                  <th className="text-right p-2.5 font-medium text-xs text-slate-600">קטגוריה</th>
                  <th className="text-right p-2.5 font-medium text-xs text-slate-600">📦 כמות נוכחית</th>
                  <th className="text-right p-2.5 font-medium text-xs text-slate-600">📌 בסיס (קבוע)</th>
                  <th className="text-right p-2.5 font-medium text-xs text-slate-600">הפרש</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((r) => {
                  const edited = edits.get(r.id);
                  const newBaseline = edited ?? r.baseline;
                  const diff = r.currentQuantity - newBaseline;
                  return (
                    <tr key={r.id} className={edited !== undefined ? "bg-amber-50" : "hover:bg-slate-50"}>
                      <td className="p-2.5 font-medium">{r.name}</td>
                      <td className="p-2.5 font-mono text-xs text-slate-500">{r.sku ?? "—"}</td>
                      <td className="p-2.5 text-xs text-slate-600">
                        {r.categoryName ?? "—"}
                        {r.categoryWarehouseType && (
                          <span className="text-[10px] text-slate-400 mr-1">({WH_LABELS[r.categoryWarehouseType] ?? r.categoryWarehouseType})</span>
                        )}
                      </td>
                      <td className="p-2.5 font-mono">
                        <span className={r.currentQuantity > 0 ? "bg-blue-50 text-blue-700 rounded px-2 py-0.5" : "text-slate-400"}>
                          {r.currentQuantity} {r.unit}
                        </span>
                      </td>
                      <td className="p-2.5">
                        <input type="number" min={0} value={newBaseline}
                          onChange={(e) => setEdit(r.id, parseInt(e.target.value) || 0)}
                          className={`w-20 rounded-lg border-2 px-2 py-1 text-center font-mono text-sm ${
                            edited !== undefined ? "border-amber-400 bg-white" : "border-slate-200"
                          }`} />
                        <span className="text-xs text-slate-400 mr-1">{r.unit}</span>
                      </td>
                      <td className="p-2.5 font-mono text-xs">
                        {diff > 0 && <span className="text-emerald-700">+{diff} (זמין לזיכוי)</span>}
                        {diff === 0 && <span className="text-slate-400">0</span>}
                        {diff < 0 && <span className="text-rose-700">{diff} (חסר!)</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="text-xs text-slate-500 mt-3 leading-relaxed">
        💡 <b>בסיס</b> = הכמות שנשארת אצל <b>{companyName}</b> גם אחרי תעסוקה.
        בזיכוי, הפלוגה תוכל לזכות רק את ההפרש החיובי (כמות נוכחית − בסיס).
        כדי לזכות מתחת לבסיס, עליך לעדכן את הבסיס פה קודם.
      </p>
    </>
  );
}
