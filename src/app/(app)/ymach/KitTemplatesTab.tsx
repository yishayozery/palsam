"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, Button, Badge } from "@/components/ui";
import { saveKitTemplate, deleteKitTemplate, saveTemplateLine, deleteTemplateLine } from "./kit-template-actions";

export type TemplateItemOption = { id: string; name: string; sku: string | null; trackingMethod: string };
export type TemplateLine = {
  id: string; itemTypeId: string; itemName: string; trackingMethod: string;
  quantity: number; requiresSerial: boolean; requiresLot: boolean; requiresExpiry: boolean;
};
export type KitTemplateData = {
  id: string; name: string; description: string | null; kitCount: number; lines: TemplateLine[];
};

export default function KitTemplatesTab({
  templates, allItems,
}: {
  templates: KitTemplateData[];
  allItems: TemplateItemOption[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [showNew, setShowNew] = useState(false);
  const [openId, setOpenId] = useState<string | null>(templates[0]?.id ?? null);
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<{ error?: string } | void>) {
    setError(null);
    start(async () => {
      const res = await fn();
      if (res && "error" in res && res.error) { setError(res.error); return; }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-slate-800">תבניות ארגז</h2>
          <p className="text-xs text-slate-500">הגדרה קבועה של תכולת ארגז — לפיה מקימים ארגזים ומסמנים יש/אין</p>
        </div>
        <Button onClick={() => setShowNew((v) => !v)}>+ תבנית חדשה</Button>
      </div>

      {error && <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-2">{error}</div>}

      {showNew && (
        <Card className="p-4">
          <form action={(fd) => run(async () => { const r = await saveKitTemplate(null, fd); if (r?.ok) setShowNew(false); return r; })} className="flex flex-wrap gap-2 items-end">
            <label className="block flex-1 min-w-[160px]">
              <span className="text-xs text-slate-500">שם התבנית</span>
              <input name="name" required autoFocus className="w-full mt-1 rounded border px-2 py-1.5 text-sm" placeholder="ארגז לוחם" />
            </label>
            <label className="block flex-1 min-w-[160px]">
              <span className="text-xs text-slate-500">תיאור (רשות)</span>
              <input name="description" className="w-full mt-1 rounded border px-2 py-1.5 text-sm" placeholder="ארגז ציוד אישי ללוחם" />
            </label>
            <Button type="submit" disabled={pending}>שמור</Button>
          </form>
        </Card>
      )}

      {templates.length === 0 ? (
        <Card className="p-6 text-center text-sm text-slate-400">אין תבניות עדיין — צרו &quot;ארגז לוחם&quot; ראשון</Card>
      ) : (
        <div className="space-y-3">
          {templates.map((t) => (
            <Card key={t.id} className="p-0 overflow-hidden">
              <button
                onClick={() => setOpenId((v) => (v === t.id ? null : t.id))}
                className="w-full flex items-center justify-between gap-2 p-4 text-right hover:bg-slate-50"
              >
                <div>
                  <div className="font-bold text-slate-800">{t.name}</div>
                  {t.description && <div className="text-xs text-slate-500">{t.description}</div>}
                </div>
                <div className="flex items-center gap-2">
                  <Badge className="bg-slate-100 text-slate-600">{t.lines.length} פריטים</Badge>
                  {t.kitCount > 0 && <Badge className="bg-indigo-100 text-indigo-700">{t.kitCount} ארגזים</Badge>}
                  <span className="text-slate-400">{openId === t.id ? "▲" : "▼"}</span>
                </div>
              </button>

              {openId === t.id && (
                <div className="border-t p-4 space-y-3">
                  <TemplateLines template={t} allItems={allItems} run={run} pending={pending} />
                  <div className="flex justify-end">
                    <button
                      onClick={() => run(() => deleteKitTemplate(t.id))}
                      disabled={pending || t.kitCount > 0}
                      title={t.kitCount > 0 ? "התבנית בשימוש בארגזים" : ""}
                      className="text-xs text-rose-500 hover:underline disabled:text-slate-300"
                    >
                      מחק תבנית
                    </button>
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function TemplateLines({
  template, allItems, run, pending,
}: {
  template: KitTemplateData; allItems: TemplateItemOption[];
  run: (fn: () => Promise<{ error?: string } | void>) => void; pending: boolean;
}) {
  const [itemId, setItemId] = useState("");
  const [qty, setQty] = useState(1);
  const [q, setQ] = useState("");
  const chosen = allItems.find((i) => i.id === itemId);
  const isSerial = chosen?.trackingMethod === "SERIAL";
  const filtered = q ? allItems.filter((i) => i.name.includes(q) || (i.sku ?? "").includes(q)).slice(0, 8) : [];

  return (
    <div className="space-y-3">
      {template.lines.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 border-b">
                <th className="text-right py-1">פריט</th>
                <th className="w-14">כמות</th>
                <th className="w-40">דורש</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {template.lines.map((l) => (
                <tr key={l.id} className="border-b last:border-0">
                  <td className="py-1.5">{l.itemName}</td>
                  <td className="text-center font-semibold">{l.quantity}</td>
                  <td className="text-center">
                    <div className="flex gap-1 justify-center flex-wrap">
                      {l.requiresSerial && <Badge className="bg-amber-100 text-amber-700 text-[10px]">סריאלי</Badge>}
                      {l.requiresLot && <Badge className="bg-sky-100 text-sky-700 text-[10px]">אצווה</Badge>}
                      {l.requiresExpiry && <Badge className="bg-rose-100 text-rose-700 text-[10px]">תוקף</Badge>}
                      {!l.requiresSerial && !l.requiresLot && !l.requiresExpiry && <span className="text-xs text-slate-300">—</span>}
                    </div>
                  </td>
                  <td className="text-center">
                    <button onClick={() => run(() => deleteTemplateLine(l.id))} disabled={pending} className="text-rose-400 hover:text-rose-600 text-xs">מחק</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* הוספת שורה */}
      <form
        action={(fd) => { fd.set("templateId", template.id); fd.set("itemTypeId", itemId); run(async () => { const r = await saveTemplateLine(fd); if (r?.ok) { setItemId(""); setQ(""); setQty(1); } return r; }); }}
        className="bg-slate-50 rounded-lg p-3 space-y-2"
      >
        <div className="text-xs font-semibold text-slate-600">הוסף פריט לתבנית</div>
        {!itemId ? (
          <div className="relative">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חפש פריט…" className="w-full rounded border px-2 py-1.5 text-sm" />
            {filtered.length > 0 && (
              <div className="absolute z-10 mt-1 w-full bg-white border rounded-lg shadow max-h-52 overflow-y-auto">
                {filtered.map((i) => (
                  <button key={i.id} type="button" onClick={() => { setItemId(i.id); setQ(""); }} className="block w-full text-right px-3 py-1.5 text-sm hover:bg-indigo-50">
                    {i.name} {i.sku && <span className="text-xs text-slate-400">[{i.sku}]</span>}
                    {i.trackingMethod === "SERIAL" && <span className="text-xs text-amber-600 mr-1">סריאלי</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-[140px]">
              <span className="text-xs text-slate-500">פריט</span>
              <div className="mt-1 flex items-center gap-2 rounded border px-2 py-1.5 text-sm bg-white">
                <span className="flex-1">{chosen?.name}</span>
                <button type="button" onClick={() => setItemId("")} className="text-slate-400 text-xs">✕</button>
              </div>
            </div>
            <label className="block w-16">
              <span className="text-xs text-slate-500">כמות</span>
              <input name="quantity" type="number" min={1} value={qty} onChange={(e) => setQty(Math.max(1, +e.target.value || 1))} className="w-full mt-1 rounded border px-2 py-1.5 text-sm" />
            </label>
            <div className="flex flex-col gap-1 text-xs">
              <label className="flex items-center gap-1"><input type="checkbox" name="requiresSerial" defaultChecked={isSerial} /> סריאלי</label>
              <label className="flex items-center gap-1"><input type="checkbox" name="requiresLot" /> אצווה</label>
              <label className="flex items-center gap-1"><input type="checkbox" name="requiresExpiry" /> תוקף</label>
            </div>
            <Button type="submit" disabled={pending}>הוסף</Button>
          </div>
        )}
      </form>
    </div>
  );
}
