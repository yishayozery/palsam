"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";

type Vehicle = { id: string; label: string };
type Soldier = { id: string; name: string; pn: string | null; company: string | null };
type Role = { id: string; name: string; icon: string | null; isDriver: boolean };

declare global {
  interface Window {
    Telegram?: {
      WebApp: {
        initData: string;
        ready(): void;
        close(): void;
        MainButton: {
          text: string;
          show(): void;
          hide(): void;
          onClick(cb: () => void): void;
          offClick(cb: () => void): void;
          showProgress(leaveActive?: boolean): void;
          hideProgress(): void;
          enable(): void;
          disable(): void;
          isVisible: boolean;
        };
        themeParams: Record<string, string>;
        colorScheme: "light" | "dark";
        expand(): void;
        showAlert(msg: string): void;
        showConfirm(msg: string, cb: (ok: boolean) => void): void;
      };
    };
  }
}

export default function DispatchWebApp() {
  const { battalionId } = useParams<{ battalionId: string }>();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [soldiers, setSoldiers] = useState<Soldier[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [driverId, setDriverId] = useState("");
  const [roleBySoldier, setRoleBySoldier] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // form state
  const [vehicleId, setVehicleId] = useState("");
  const [missionDate, setMissionDate] = useState(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });
  const [departureTime, setDepartureTime] = useState("08:00");
  const [selectedSoldiers, setSelectedSoldiers] = useState<string[]>([]);
  const [soldierSearch, setSoldierSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const tg = typeof window !== "undefined" ? window.Telegram?.WebApp : undefined;
  const initData = tg?.initData ?? "";

  useEffect(() => {
    tg?.ready();
    tg?.expand();
  }, [tg]);

  useEffect(() => {
    if (!battalionId) return;
    if (!initData) {
      setError('⚠️ יש לפתוח את הטופס דרך כפתור השבצ"ק בבוט הטלגרם.\nלא ניתן לפתוח קישור זה בדפדפן רגיל.');
      setLoading(false);
      return;
    }
    fetch(`/api/telegram/${battalionId}/dispatch`, {
      headers: { "x-telegram-init-data": initData },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { setError(data.error); return; }
        setVehicles(data.vehicles ?? []);
        setSoldiers(data.soldiers ?? []);
        setRoles(data.roles ?? []);
      })
      .catch(() => setError("שגיאה בטעינה"))
      .finally(() => setLoading(false));
  }, [battalionId, initData]);

  const toggleSoldier = (id: string) => {
    setSelectedSoldiers((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const submit = useCallback(async () => {
    if (submitting || done) return;
    if (!vehicleId) { tg?.showAlert("בחר רכב"); return; }
    if (!missionDate) { tg?.showAlert("בחר תאריך"); return; }
    if (!departureTime) { tg?.showAlert("הזן שעת יציאה"); return; }
    if (selectedSoldiers.length === 0) { tg?.showAlert("הוסף לפחות חייל אחד"); return; }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/telegram/${battalionId}/dispatch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-telegram-init-data": initData,
        },
        body: JSON.stringify({
          vehicleSerialUnitId: vehicleId, missionDate, departureTime,
          soldiers: selectedSoldiers.map((id) => ({ soldierId: id, isDriver: id === (driverId || selectedSoldiers[0]), dispatchRoleId: roleBySoldier[id] || null })),
        }),
      });
      const data = await res.json();
      if (data.error) { tg?.showAlert(data.error); setSubmitting(false); return; }
      setDone(true);
      setTimeout(() => tg?.close(), 1500);
    } catch {
      tg?.showAlert("שגיאה בשמירה");
      setSubmitting(false);
    }
  }, [submitting, done, vehicleId, missionDate, departureTime, selectedSoldiers, driverId, roleBySoldier, battalionId, initData, tg]);

  // Telegram MainButton
  useEffect(() => {
    if (!tg) return;
    const canSubmit = vehicleId && missionDate && departureTime && selectedSoldiers.length > 0 && !submitting && !done;
    tg.MainButton.text = submitting ? "שומר..." : `שמור שבצ"ק (${selectedSoldiers.length} חיילים)`;
    if (canSubmit) { tg.MainButton.show(); tg.MainButton.enable(); }
    else if (submitting) { tg.MainButton.show(); tg.MainButton.showProgress(); tg.MainButton.disable(); }
    else { tg.MainButton.hide(); }
  }, [vehicleId, missionDate, departureTime, selectedSoldiers, submitting, done, tg]);

  useEffect(() => {
    if (!tg) return;
    tg.MainButton.onClick(submit);
    return () => tg.MainButton.offClick(submit);
  }, [tg, submit]);

  const filteredSoldiers = soldierSearch.trim()
    ? soldiers.filter((s) =>
        s.name.includes(soldierSearch) ||
        (s.pn && s.pn.includes(soldierSearch)) ||
        (s.company && s.company.includes(soldierSearch))
      )
    : soldiers;

  if (done) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "system-ui" }}>
        <div style={{ fontSize: 64 }}>✅</div>
        <p style={{ fontSize: 18, fontWeight: 600, marginTop: 8 }}>שבצ"ק נשמר בהצלחה!</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "system-ui" }}>
        <p>טוען...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "system-ui", padding: 24 }}>
        <p style={{ color: "red" }}>{error}</p>
      </div>
    );
  }

  const isDark = tg?.colorScheme === "dark";
  const bg = isDark ? "#1e1e1e" : "#f8fafc";
  const cardBg = isDark ? "#2d2d2d" : "#fff";
  const text = isDark ? "#e2e8f0" : "#1e293b";
  const muted = isDark ? "#94a3b8" : "#64748b";
  const accent = "#059669";
  const border = isDark ? "#404040" : "#e2e8f0";

  return (
    <div dir="rtl" style={{ fontFamily: "system-ui, -apple-system, sans-serif", background: bg, color: text, minHeight: "100vh", padding: 16, paddingBottom: 100 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, textAlign: "center" }}>🚗 שבצ"ק חדש</h2>

      {/* Vehicle */}
      <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: "block" }}>רכב</label>
      <select
        value={vehicleId}
        onChange={(e) => setVehicleId(e.target.value)}
        style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: `1px solid ${border}`, background: cardBg, color: text, fontSize: 14, marginBottom: 12, appearance: "auto" }}
      >
        <option value="">— בחר רכב —</option>
        {vehicles.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
      </select>

      {/* Date + Time row */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: "block" }}>📅 תאריך</label>
          <input
            type="date"
            value={missionDate}
            onChange={(e) => setMissionDate(e.target.value)}
            style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: `1px solid ${border}`, background: cardBg, color: text, fontSize: 14 }}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: "block" }}>⏰ שעת יציאה</label>
          <input
            type="time"
            value={departureTime}
            onChange={(e) => setDepartureTime(e.target.value)}
            style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: `1px solid ${border}`, background: cardBg, color: text, fontSize: 14 }}
          />
        </div>
      </div>

      {/* Selected soldiers — נהג + תפקיד */}
      {selectedSoldiers.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: "block" }}>👥 צוות ({selectedSoldiers.length}) — 🚗 = נהג</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {selectedSoldiers.map((sid) => {
              const s = soldiers.find((x) => x.id === sid);
              const isDriver = sid === (driverId || selectedSoldiers[0]);
              return (
                <div key={sid} style={{ display: "flex", alignItems: "center", gap: 6, background: cardBg, border: `1px solid ${border}`, borderRadius: 10, padding: "6px 8px" }}>
                  <button onClick={() => setDriverId(sid)} title="סמן כנהג"
                    style={{ fontSize: 15, background: isDriver ? accent : "transparent", color: isDriver ? "#fff" : muted, border: `1px solid ${isDriver ? accent : border}`, borderRadius: 8, padding: "3px 7px", cursor: "pointer" }}>🚗</button>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{s?.name ?? sid}{isDriver && <span style={{ color: accent, fontSize: 11 }}> · נהג</span>}</span>
                  {roles.length > 0 && (
                    <select value={roleBySoldier[sid] ?? ""}
                      onChange={(e) => { const rid = e.target.value; setRoleBySoldier((p) => ({ ...p, [sid]: rid })); const role = roles.find((r) => r.id === rid); if (role?.isDriver) setDriverId(sid); }}
                      style={{ fontSize: 12, padding: "4px 6px", borderRadius: 8, border: `1px solid ${border}`, background: cardBg, color: text }}>
                      <option value="">תפקיד…</option>
                      {roles.map((r) => <option key={r.id} value={r.id}>{r.icon} {r.name}</option>)}
                    </select>
                  )}
                  <button onClick={() => toggleSoldier(sid)} style={{ color: "#ef4444", background: "transparent", border: "none", fontSize: 15, cursor: "pointer" }}>✕</button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Soldier search */}
      <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: "block" }}>חיפוש חייל</label>
      <input
        type="text"
        placeholder="שם / מ.א. / פלוגה..."
        value={soldierSearch}
        onChange={(e) => setSoldierSearch(e.target.value)}
        style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: `1px solid ${border}`, background: cardBg, color: text, fontSize: 14, marginBottom: 8 }}
      />

      {/* Soldier list */}
      <div style={{ maxHeight: 300, overflowY: "auto", borderRadius: 12, border: `1px solid ${border}`, background: cardBg }}>
        {filteredSoldiers.length === 0 ? (
          <p style={{ padding: 16, textAlign: "center", color: muted, fontSize: 13 }}>
            {soldierSearch ? "אין תוצאות" : "אין חיילים"}
          </p>
        ) : (
          filteredSoldiers.map((s) => {
            const isSelected = selectedSoldiers.includes(s.id);
            return (
              <button
                key={s.id}
                onClick={() => toggleSoldier(s.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 10, width: "100%",
                  padding: "10px 12px", border: "none", borderBottom: `1px solid ${border}`,
                  background: isSelected ? (isDark ? "#1a3a2a" : "#ecfdf5") : "transparent",
                  color: text, cursor: "pointer", textAlign: "right", fontSize: 14,
                }}
              >
                <span style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${isSelected ? accent : border}`, background: isSelected ? accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 14, fontWeight: 700, flexShrink: 0 }}>
                  {isSelected ? "✓" : ""}
                </span>
                <span style={{ flex: 1 }}>
                  <span style={{ fontWeight: 600 }}>{s.name}</span>
                  {s.pn && <span style={{ color: muted, fontSize: 12, marginRight: 6 }}>({s.pn})</span>}
                </span>
                {s.company && <span style={{ fontSize: 11, color: muted }}>{s.company}</span>}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
