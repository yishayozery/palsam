"use client";

import { useRouter } from "next/navigation";

export default function CompanySelect({
  companies,
  selectedId,
}: {
  companies: { id: string; name: string }[];
  selectedId: string;
}) {
  const router = useRouter();
  return (
    <select
      value={selectedId}
      onChange={(e) => router.push(`/permanent-items?companyId=${e.target.value}`)}
      className="rounded-lg border-2 border-slate-300 px-3 py-1.5 text-sm"
    >
      {companies.map((c) => (
        <option key={c.id} value={c.id}>{c.name}</option>
      ))}
    </select>
  );
}
