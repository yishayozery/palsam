"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";

type Vehicle = { id: string; label: string };
type Soldier = { id: string; name: string; pn: string | null; company: string | null };

export default function DispatchOpenPage() {
  const { token } = useParams<{ token: string }>();
  const [battalionName, setBattalionName] = useState("");
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [soldiers, setSoldiers] = useState<Soldier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [vehicleId, setVehicleId] = useState("");
  const [missionDate, setMissionDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [departureTime, setDepartureTime] = useState("08:00");
  const [selectedSoldiers, setSelectedSoldiers] = useState<string[]>([]);
  const [soldierSearch, setSoldierSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/dispatch-open/${token}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { setError(data.error); return; }
        setBattalionName(data.battalionName ?? "");
        setVehicles(data.vehicles ?? []);
        setSoldiers(data.soldiers ?? []);
      })
      .catch(() => setError("שגיאה בטעינת הנתונים"))
      .finally(() => setLoading(false));
  }, [token]);

  const toggleSoldier = (id: string) => {
    setSelectedSoldiers((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const submit = useCallback(async () => {
    if (submitting || done) return;
    if (!vehicleId) { alert("בחר רכב"); return; }
    if (!missionDate) { alert("בחר תאריך"); return; }
    if (!departureTime) { alert("הזן שעת יציאה"); return; }
    if (selectedSoldiers.length === 0) { alert("הוסף לפחות חייל אחד"); return; }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/dispatch-open/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vehicleSerialUnitId: vehicleId, missionDate, departureTime, soldierIds: selectedSoldiers }),
      });
      const data = await res.json();
      if (data.error) { alert(data.error); setSubmitting(false); return; }
      setDone(true);
    } catch {
      alert("שגיאה בשמירה");
      setSubmitting(false);
    }
  }, [submitting, done, vehicleId, missionDate, departureTime, selectedSoldiers, token]);

  const filteredSoldiers = soldierSearch.trim()
    ? soldiers.filter((s) =>
        s.name.includes(soldierSearch) ||
        (s.pn && s.pn.includes(soldierSearch)) ||
        (s.company && s.company.includes(soldierSearch))
      )
    : soldiers;

  if (done) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "system-ui", background: "#f0fdf4" }}>
        <div style={{ fontSize: 64 }}>✅</div>
        <p style={{ fontSize: 20, fontWeight: 700, marginTop: 12, color: "#166534" }}>שבצ&quot;ק נשמר בהצלחה!</p>
        <p style={{ fontSize: 14, color: "#64748b", marginTop: 8 }}>ניתן לסגור את הדף</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "system-ui" }}>
        <p style={{ fontSize: 16 }}>⏳ טוען...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "system-ui", padding: 24, textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
        <p style={{ color: "#dc2626", fontSize: 16, fontWeight: 600 }}>{error}</p>
        <p style={{ color: "#64748b", fontSize: 13, marginTop: 8 }}>אם הקישור פג תוקף, בקש קישור חדש מהמפקד</p>
      </div>
    );
  }

  const accent = "#059669";
  const border = "#e2e8f0";

  return (
    <div dir="rtl" style={{ fontFamily: "system-ui, -apple-system, sans-serif", background: "#f8fafc", color: "#1e293b", minHeight: "100vh", padding: 16, paddingBottom: 100, maxWidth: 480, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>🚗 שבצ&quot;ק חדש</h2>
        {battalionName && <p style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>{battalionName}</p>}
        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
          <span>🔒</span> קישור מאובטח
        </div>
      </div>

      {/* Vehicle */}
      <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: "block" }}>🚗 רכב *</label>
      <select
        value={vehicleId}
        onChange={(e) => setVehicleId(e.target.value)}
        style={{ width: "100%", padding: "12px", borderRadius: 10, border: `1px solid ${border}`, background: "#fff", color: "#1e293b", fontSize: 14, marginBottom: 12 }}
      >
        <option value="">— בחר רכב —</option>
        {vehicles.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
      </select>

      {/* Date + Time */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: "block" }}>📅 תאריך *</label>
          <input
            type="date"
            value={missionDate}
            onChange={(e) => setMissionDate(e.target.value)}
            style={{ width: "100%", padding: "12px", borderRadius: 10, border: `1px solid ${border}`, background: "#fff", fontSize: 14 }}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: "block" }}>⏰ שעת יציאה *</label>
          <input
            type="time"
            value={departureTime}
            onChange={(e) => setDepartureTime(e.target.value)}
            style={{ width: "100%", padding: "12px", borderRadius: 10, border: `1px solid ${border}`, background: "#fff", fontSize: 14 }}
          />
        </div>
      </div>

      {/* Selected chips */}
      {selectedSoldiers.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: "block" }}>👥 נבחרו ({selectedSoldiers.length})</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {selectedSoldiers.map((sid) => {
              const s = soldiers.find((x) => x.id === sid);
              return (
                <button
                  key={sid}
                  onClick={() => toggleSoldier(sid)}
                  style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 16, background: accent, color: "#fff", border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                >
                  {s?.name ?? sid} ✕
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Search */}
      <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: "block" }}>🔍 חיפוש חייל</label>
      <input
        type="text"
        placeholder="שם / מ.א. / פלוגה..."
        value={soldierSearch}
        onChange={(e) => setSoldierSearch(e.target.value)}
        style={{ width: "100%", padding: "12px", borderRadius: 10, border: `1px solid ${border}`, background: "#fff", fontSize: 14, marginBottom: 8 }}
      />

      {/* Soldier list */}
      <div style={{ maxHeight: 300, overflowY: "auto", borderRadius: 12, border: `1px solid ${border}`, background: "#fff" }}>
        {filteredSoldiers.length === 0 ? (
          <p style={{ padding: 16, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
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
                  background: isSelected ? "#ecfdf5" : "transparent",
                  color: "#1e293b", cursor: "pointer", textAlign: "right", fontSize: 14,
                }}
              >
                <span style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${isSelected ? accent : border}`, background: isSelected ? accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 14, fontWeight: 700, flexShrink: 0 }}>
                  {isSelected ? "✓" : ""}
                </span>
                <span style={{ flex: 1 }}>
                  <span style={{ fontWeight: 600 }}>{s.name}</span>
                  {s.pn && <span style={{ color: "#64748b", fontSize: 12, marginRight: 6 }}>({s.pn})</span>}
                </span>
                {s.company && <span style={{ fontSize: 11, color: "#64748b" }}>{s.company}</span>}
              </button>
            );
          })
        )}
      </div>

      {/* Submit */}
      <button
        onClick={submit}
        disabled={submitting || !vehicleId || !missionDate || !departureTime || selectedSoldiers.length === 0}
        style={{
          position: "fixed", bottom: 0, left: 0, right: 0,
          padding: "16px", background: vehicleId && selectedSoldiers.length > 0 ? accent : "#94a3b8",
          color: "#fff", border: "none", fontSize: 16, fontWeight: 700,
          cursor: vehicleId && selectedSoldiers.length > 0 ? "pointer" : "default",
          opacity: submitting ? 0.7 : 1,
        }}
      >
        {submitting ? "שומר..." : `שמור שבצ"ק (${selectedSoldiers.length} חיילים)`}
      </button>
    </div>
  );
}
