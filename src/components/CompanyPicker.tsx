"use client";

import { useRouter } from "next/navigation";

export default function CompanyPicker({
  companies,
  selectedId,
  basePath,
  extraParams,
}: {
  companies: { id: string; name: string }[];
  selectedId: string;
  basePath: string;
  extraParams?: string;
}) {
  const router = useRouter();
  return (
    <div className="flex items-center gap-2 mb-4 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
      <label className="text-sm font-medium text-blue-800">פלוגה:</label>
      <select
        value={selectedId}
        onChange={(e) => {
          const params = new URLSearchParams();
          params.set("companyId", e.target.value);
          if (extraParams) {
            for (const part of extraParams.split("&")) {
              const [k, v] = part.split("=");
              if (k && v) params.set(k, v);
            }
          }
          router.push(`${basePath}?${params.toString()}`);
        }}
        className="rounded-lg border-2 border-blue-300 px-3 py-1.5 text-sm bg-white"
      >
        {companies.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
    </div>
  );
}
