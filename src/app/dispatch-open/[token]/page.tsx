"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import MissionWizard, { type WData } from "../../bot/dispatch/MissionWizard";

export default function DispatchOpenPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<WData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    fetch(`/api/dispatch-open/${token}`)
      .then((r) => r.json())
      .then((d) => { if (d.error) { setError(d.error); return; } setData(d); })
      .catch(() => setError("שגיאה בטעינת הנתונים"))
      .finally(() => setLoading(false));
  }, [token]);

  async function onSubmit(payload: unknown) {
    const res = await fetch(`/api/dispatch-open/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    return res.json();
  }

  if (loading) return <Center>⏳ טוען…</Center>;
  if (error) return <Center><div style={{ fontSize: 48, marginBottom: 12 }}>🔒</div><p style={{ color: "#dc2626", fontWeight: 600 }}>{error}</p><p style={{ color: "#64748b", fontSize: 13, marginTop: 6 }}>אם הקישור פג תוקף, בקש/י קישור חדש</p></Center>;
  if (!data) return <Center>—</Center>;
  return <MissionWizard data={data} onSubmit={onSubmit} />;
}

function Center({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "system-ui", textAlign: "center", padding: 24 }}>{children}</div>;
}
