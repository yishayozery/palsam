"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import MissionWizard, { type WData } from "../MissionWizard";

declare global {
  interface Window { Telegram?: { WebApp: { initData: string; ready(): void; expand(): void; close(): void } }; }
}

export default function DispatchWebApp() {
  const { battalionId } = useParams<{ battalionId: string }>();
  const [data, setData] = useState<WData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const tg = typeof window !== "undefined" ? window.Telegram?.WebApp : undefined;
  const initData = tg?.initData ?? "";

  useEffect(() => { tg?.ready(); tg?.expand(); }, [tg]);

  useEffect(() => {
    if (!battalionId) return;
    if (!initData) { setError("⚠️ יש לפתוח את הטופס דרך כפתור המשימות בבוט הטלגרם."); setLoading(false); return; }
    fetch(`/api/telegram/${battalionId}/dispatch`, { headers: { "x-telegram-init-data": initData } })
      .then((r) => r.json())
      .then((d) => { if (d.error) { setError(d.error); return; } setData(d); })
      .catch(() => setError("שגיאה בטעינה"))
      .finally(() => setLoading(false));
  }, [battalionId, initData]);

  async function onSubmit(payload: unknown) {
    const res = await fetch(`/api/telegram/${battalionId}/dispatch`, { method: "POST", headers: { "Content-Type": "application/json", "x-telegram-init-data": initData }, body: JSON.stringify(payload) });
    return res.json();
  }

  if (loading) return <Center>⏳ טוען…</Center>;
  if (error) return <Center><p style={{ color: "#dc2626", fontWeight: 600 }}>{error}</p></Center>;
  if (!data) return <Center>—</Center>;
  return <MissionWizard data={data} onSubmit={onSubmit} />;
}

function Center({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "system-ui", textAlign: "center", padding: 24 }}>{children}</div>;
}
