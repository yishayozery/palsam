"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { setItemLocation } from "./actions";

type Item = { id: string; name: string; sku: string | null; trackingMethod: string; warehouseType: string | null };
type Location = { id: string; column: string; row: string; label: string | null };
type Mapping = { itemTypeId: string; locationId: string };

export default function ItemLocationsTab({
  items, locations, mappings, holderName,
}: {
  items: Item[];
  locations: Location[];
  mappings: Mapping[];
  holderName: string;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ id: string; ok: boolean; msg?: string } | null>(null);

  const currentMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const x of mappings) m.set(x.itemTypeId, x.locationId);
    return m;
  }, [mappings]);

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter((i) => i.name.toLowerCase().includes(q) || (i.sku || "").toLowerCase().includes(q));
  }, [items, search]);

  async function save(itemTypeId: string, locationId: string) {
    setSavingId(itemTypeId);
    setFeedback(null);
    try {
      const fd = new FormData();
      fd.append("itemTypeId", itemTypeId);
      fd.append("locationId", locationId);
      const res = await setItemLocation(fd);
      if (res?.error) setFeedback({ id: itemTypeId, ok: false, msg: res.error });
      else {
        setFeedback({ id: itemTypeId, ok: true });
        router.refresh();
      }
    } finally {
      setSavingId(null);
      setTimeout(() => setFeedback(null), 2000);
    }
  }

  return (
    <div>
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 text-sm text-blue-900">
        💡 <b>שיוך פריטים למיקומים</b> ב-<b>{holderName}</b>: לכל פריט בחר היכן הוא יושב במידוף.
        אותו פריט (לדוגמה: סק״ש) יכול להיות במיקום שונה בכל פלוגה/מחסן — כי לכל אחד יש מידוף משלו.
      </div>

      <div className="mb-3">
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="חפש פריט / מק״ט..."
          className="w-full md:w-80 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </div>

      {locations.length === 0 ? (
        <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 text-sm text-amber-900">
          ⚠️ עדיין לא הוגדרו מדפים ב-{holderName}. הוסף קודם מדפים בלשונית "מדפים".
        </div>
      ) : (
        <div className="overflow-x-auto border border-slate-200 rounded-lg bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-600">
              <tr>
                <th className="text-right p-2.5 font-medium">פריט</th>
                <th className="text-right p-2.5 font-medium">מק״ט</th>
                <th className="text-right p-2.5 font-medium">סוג מחסן</th>
                <th className="text-right p-2.5 font-medium">מיקום במידוף</th>
                <th className="text-center p-2.5 font-medium w-24">סטטוס</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr><td colSpan={5} className="text-center text-slate-400 p-6">אין פריטים להצגה</td></tr>
              ) : filtered.map((i) => {
                const currentLocId = currentMap.get(i.id) ?? "";
                const fb = feedback?.id === i.id ? feedback : null;
                return (
                  <tr key={i.id} className={fb?.ok ? "bg-emerald-50/50" : ""}>
                    <td className="p-2.5 font-medium">{i.name}</td>
                    <td className="p-2.5 text-xs text-slate-500 font-mono">{i.sku ?? "—"}</td>
                    <td className="p-2.5 text-xs text-slate-500">{i.warehouseType ?? "—"}</td>
                    <td className="p-2.5">
                      <select
                        value={currentLocId}
                        onChange={(e) => save(i.id, e.target.value)}
                        disabled={savingId === i.id}
                        className="w-full max-w-xs rounded-lg border border-slate-300 px-2 py-1.5 text-sm bg-white disabled:opacity-50"
                      >
                        <option value="">— ללא מיקום —</option>
                        {locations.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.column}-{l.row}{l.label ? ` (${l.label})` : ""}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-2.5 text-center">
                      {savingId === i.id ? (
                        <span className="text-xs text-slate-500">שומר...</span>
                      ) : fb?.ok ? (
                        <span className="text-xs text-emerald-700">✓ נשמר</span>
                      ) : fb?.msg ? (
                        <span className="text-xs text-rose-700" title={fb.msg}>⚠️</span>
                      ) : currentLocId ? (
                        <span className="text-xs text-slate-400">✓</span>
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-slate-400 mt-3">
        💡 שמירה אוטומטית בשינוי המיקום. בחירת "— ללא מיקום —" מסירה את הקישור.
      </p>
    </div>
  );
}
