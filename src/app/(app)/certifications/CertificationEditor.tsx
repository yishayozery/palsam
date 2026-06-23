"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { saveSoldierCertifications } from "./actions";

type CertType = { id: string; name: string };
type Soldier = {
  id: string;
  fullName: string;
  companyId: string | null;
  companyName: string | null;
  squadName: string | null;
  certifications: string[];
};

export default function CertificationEditor({
  soldiers,
  certTypes,
  companies,
  canEdit,
}: {
  soldiers: Soldier[];
  certTypes: CertType[];
  companies: { id: string; name: string }[];
  canEdit: boolean;
}) {
  const [editingSoldier, setEditingSoldier] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const router = useRouter();

  const filtered = useMemo(() => {
    let list = soldiers;
    if (companyFilter) {
      list = list.filter((s) => s.companyId === companyFilter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (s) =>
          s.fullName.toLowerCase().includes(q) ||
          (s.companyName && s.companyName.toLowerCase().includes(q)) ||
          (s.squadName && s.squadName.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [soldiers, companyFilter, search]);

  const stats = useMemo(() => {
    const perCert: Record<string, number> = {};
    for (const ct of certTypes) perCert[ct.id] = 0;
    const src = companyFilter ? soldiers.filter((s) => s.companyId === companyFilter) : soldiers;
    for (const s of src) {
      for (const cid of s.certifications) {
        if (perCert[cid] !== undefined) perCert[cid]++;
      }
    }
    return { total: src.length, perCert };
  }, [soldiers, certTypes, companyFilter]);

  function startEdit(s: Soldier) {
    setEditingSoldier(s.id);
    setSelected(new Set(s.certifications));
  }

  function handleSave(soldierId: string) {
    const fd = new FormData();
    fd.set("soldierId", soldierId);
    selected.forEach((id) => fd.append("certificationTypeId", id));
    startTransition(async () => {
      await saveSoldierCertifications(fd);
      setEditingSoldier(null);
      router.refresh();
    });
  }

  if (certTypes.length === 0) {
    return (
      <div className="text-sm text-slate-500 p-4">
        לא הוגדרו סוגי הסמכות. עבור לטאב &quot;סוגי הסמכות&quot; והוסף סוגים.
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-3">
        <select
          value={companyFilter}
          onChange={(e) => setCompanyFilter(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm"
        >
          <option value="">כל הפלוגות</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 חיפוש חייל..."
          className="flex-1 min-w-[200px] border rounded-lg px-3 py-2 text-sm"
        />
      </div>

      {/* Summary bar */}
      <div className="flex flex-wrap gap-2 mb-3">
        {certTypes.map((ct) => {
          const count = stats.perCert[ct.id] ?? 0;
          const pct = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;
          return (
            <div
              key={ct.id}
              className="bg-white border rounded-lg px-3 py-1.5 text-xs flex items-center gap-2"
            >
              <span className="font-medium text-slate-700">{ct.name}</span>
              <span className={count === 0 ? "text-rose-500 font-bold" : "text-emerald-600 font-bold"}>
                {count}/{stats.total}
              </span>
              <span className="text-slate-400">({pct}%)</span>
            </div>
          );
        })}
      </div>

      <div className="overflow-x-auto bg-white rounded-xl border border-slate-200">
        <table className="min-w-full text-sm border-collapse">
          <thead>
            <tr className="bg-slate-50">
              <th className="sticky right-0 z-10 bg-slate-50 px-3 py-2 text-right font-medium text-slate-600 border-b min-w-[160px]">
                חייל
              </th>
              <th className="px-3 py-2 text-right font-medium text-slate-600 border-b">פלוגה</th>
              {certTypes.map((ct) => (
                <th
                  key={ct.id}
                  className="px-2 py-2 text-center font-medium text-slate-600 border-b min-w-[80px]"
                >
                  {ct.name}
                </th>
              ))}
              {canEdit && <th className="px-2 py-2 border-b" />}
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => {
              const isEditing = editingSoldier === s.id;
              const certSet = new Set(s.certifications);

              return (
                <tr key={s.id} className={isEditing ? "bg-blue-50/50" : "hover:bg-slate-50"}>
                  <td className="sticky right-0 z-10 bg-white px-3 py-2 border-b font-medium text-slate-700 whitespace-nowrap">
                    {s.fullName}
                  </td>
                  <td className="px-3 py-2 border-b text-xs text-slate-500 whitespace-nowrap">
                    {s.companyName}
                    {s.squadName ? ` / ${s.squadName}` : ""}
                  </td>
                  {certTypes.map((ct) => {
                    if (isEditing) {
                      return (
                        <td key={ct.id} className="px-2 py-2 border-b text-center">
                          <input
                            type="checkbox"
                            checked={selected.has(ct.id)}
                            onChange={() => {
                              setSelected((prev) => {
                                const next = new Set(prev);
                                if (next.has(ct.id)) next.delete(ct.id);
                                else next.add(ct.id);
                                return next;
                              });
                            }}
                            className="rounded"
                          />
                        </td>
                      );
                    }
                    const has = certSet.has(ct.id);
                    return (
                      <td key={ct.id} className="px-2 py-2 border-b text-center">
                        {has ? (
                          <span className="text-green-600 font-bold">✓</span>
                        ) : (
                          <span className="text-slate-200">-</span>
                        )}
                      </td>
                    );
                  })}
                  {canEdit && (
                    <td className="px-2 py-2 border-b text-center">
                      {isEditing ? (
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleSave(s.id)}
                            disabled={pending}
                            className="px-2 py-1 bg-blue-600 text-white rounded text-xs disabled:opacity-50"
                          >
                            {pending ? "..." : "שמור"}
                          </button>
                          <button
                            onClick={() => setEditingSoldier(null)}
                            className="px-2 py-1 bg-slate-200 rounded text-xs"
                          >
                            ביטול
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => startEdit(s)}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          עריכה
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="text-xs text-slate-400 mt-2">{filtered.length} חיילים</div>
    </div>
  );
}
