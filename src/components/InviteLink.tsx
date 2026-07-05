"use client";

import { useState } from "react";
import { buildInviteText, type InviteRole } from "@/lib/goliveTasks";

export default function InviteLink({
  token,
  phone,
  baseUrl,
  label = "ממתין להפעלה",
  role,
}: {
  token: string;
  phone?: string | null;
  baseUrl: string;
  label?: string;
  role?: InviteRole | null;
}) {
  const [copied, setCopied] = useState(false);
  const link = `${baseUrl}/invite/${token}`;
  const text = buildInviteText(link, role);
  const wa = phone
    ? `https://wa.me/${phone.replace(/\D/g, "").replace(/^0/, "972")}?text=${encodeURIComponent(text)}`
    : `https://wa.me/?text=${encodeURIComponent(text)}`;
  return (
    <div className="flex items-center gap-2">
      <span className="inline-block rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 text-xs font-medium">{label}</span>
      <button onClick={() => { navigator.clipboard?.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
        className="text-xs text-slate-500 hover:text-slate-800">{copied ? "הועתק ✓" : "העתק קישור"}</button>
      <a href={wa} target="_blank" rel="noreferrer" className="text-xs text-emerald-600 hover:underline">וואטסאפ</a>
    </div>
  );
}
