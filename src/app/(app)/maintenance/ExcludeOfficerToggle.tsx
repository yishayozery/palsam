"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

export default function ExcludeOfficerToggle({ checked }: { checked: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function toggle(on: boolean) {
    const next = new URLSearchParams(params?.toString() ?? "");
    if (on) next.set("excludeOfficer", "1");
    else next.delete("excludeOfficer");
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <label className="flex items-center gap-1.5 text-xs bg-slate-100 border border-slate-300 rounded-lg px-3 py-2 cursor-pointer hover:bg-slate-200">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => toggle(e.target.checked)}
        className="w-3.5 h-3.5"
      />
      <span>החרג רכבים שנשלחו לטנא ע״י קצין הרכב</span>
    </label>
  );
}
