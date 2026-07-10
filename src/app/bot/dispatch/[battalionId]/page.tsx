"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";

type Vehicle = { id: string; name: string; serial: string; typeName: string; label: string; requiredLicenseIds: string[] };
type Soldier = { id: string; name: string; pn: string | null; company: string | null; licenseIds: string[]; procValid: boolean; refreshValid: boolean };
type Role = { id: string; name: string; icon: string | null; isDriver: boolean };
type Template = { id: string; name: string; vehicleSerialUnitId: string; vehicleTypeName: string; soldiers: { soldierId: string; dispatchRoleId: string | null; isDriver: boolean }[] };

type Crew = { key: string; soldierId: string | null; externalName: string; externalPersonalNumber: string; isDriver: boolean; dispatchRoleId: string | null };
type Row = { key: string; source: "system" | "external"; vehicleSerialUnitId: string; externalVehicleNumber: string; externalVehicleTypeName: string; soldiers: Crew[] };

declare global {
  interface Window {
    Telegram?: { WebApp: {
      initData: string; ready(): void; close(): void; expand(): void;
      colorScheme: "light" | "dark"; showAlert(msg: string): void;
      MainButton: { text: string; show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void; showProgress(l?: boolean): void; hideProgress(): void; enable(): void; disable(): void; isVisible: boolean };
    } };
  }
}

let seq = 0;
const nk = () => `k${++seq}`;

export default function DispatchWebApp() {
  const { battalionId } = useParams<{ battalionId: string }>();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [soldiers, setSoldiers] = useState<Soldier[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [presentIds, setPresentIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // form
  const [title, setTitle] = useState("");
  const [commanderSoldierId, setCommanderSoldierId] = useState("");
  const [commanderName, setCommanderName] = useState("");
  const [missionDate, setMissionDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [departureTime, setDepartureTime] = useState("08:00");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [soldierSearch, setSoldierSearch] = useState("");

  const tg = typeof window !== "undefined" ? window.Telegram?.WebApp : undefined;
  const initData = tg?.initData ?? "";
  const presentSet = useMemo(() => new Set(presentIds), [presentIds]);

  useEffect(() => { tg?.ready(); tg?.expand(); }, [tg]);

  useEffect(() => {
    if (!battalionId) return;
    if (!initData) { setError('⚠️ יש לפתוח את הטופס דרך כפתור המשימות בבוט הטלגרם.\nלא ניתן לפתוח קישור זה בדפדפן רגיל.'); setLoading(false); return; }
    fetch(`/api/telegram/${battalionId}/dispatch`, { headers: { "x-telegram-init-data": initData } })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setError(d.error); return; }
        setVehicles(d.vehicles ?? []); setSoldiers(d.soldiers ?? []); setRoles(d.roles ?? []); setTemplates(d.templates ?? []); setPresentIds(d.presentSoldierIds ?? []);
      })
      .catch(() => setError("שגיאה בטעינה")).finally(() => setLoading(false));
  }, [battalionId, initData]);

  const soldierName = (id: string) => soldiers.find((s) => s.id === id)?.name ?? id;

  // הסמכת נהג לרכב מערכת: רישיון לסוג + נוהל + ריענון
  function driverReasons(soldierId: string | null, row: Row): string[] {
    if (!soldierId || row.source === "external") return [];
    const s = soldiers.find((x) => x.id === soldierId); if (!s) return [];
    const veh = vehicles.find((v) => v.id === row.vehicleSerialUnitId);
    const req = veh?.requiredLicenseIds ?? []; const has = new Set(s.licenseIds);
    const rz: string[] = [];
    if (req.some((id) => !has.has(id))) rz.push("חסר רישיון/היתר לסוג הרכב");
    if (!s.procValid) rz.push("לא חתם על נוהל נהיגה בתוקף");
    if (!s.refreshValid) rz.push("ריענון נהיגה לא בתוקף");
    return rz;
  }

  function addSystemVehicle() { const k = nk(); setRows((r) => [...r, { key: k, source: "system", vehicleSerialUnitId: "", externalVehicleNumber: "", externalVehicleTypeName: "", soldiers: [] }]); setActiveKey(k); }
  function addExternalVehicle() { const k = nk(); setRows((r) => [...r, { key: k, source: "external", vehicleSerialUnitId: "", externalVehicleNumber: "", externalVehicleTypeName: "", soldiers: [] }]); setActiveKey(k); }
  function addFromTemplate(tid: string) {
    const t = templates.find((x) => x.id === tid); if (!t) return;
    const k = nk();
    const crew: Crew[] = t.soldiers.length
      ? t.soldiers.map((s) => ({ key: nk(), soldierId: s.soldierId, externalName: "", externalPersonalNumber: "", isDriver: s.isDriver, dispatchRoleId: s.dispatchRoleId }))
      : [];
    if (crew.length && !crew.some((c) => c.isDriver)) crew[0].isDriver = true;
    setRows((r) => [...r, { key: k, source: "system", vehicleSerialUnitId: t.vehicleSerialUnitId, externalVehicleNumber: "", externalVehicleTypeName: "", soldiers: crew }]); setActiveKey(k);
  }
  function removeRow(key: string) { setRows((r) => { const n = r.filter((x) => x.key !== key); setActiveKey((c) => c === key ? (n[n.length - 1]?.key ?? null) : c); return n; }); }
  function patchRow(key: string, p: Partial<Row>) { setRows((r) => r.map((x) => x.key === key ? { ...x, ...p } : x)); }

  function addSoldier(rowKey: string, soldierId: string, roleId: string | null) {
    if (!soldierId) return;
    const role = roleId ? roles.find((r) => r.id === roleId) : null;
    setRows((r) => r.map((x) => {
      if (x.key !== rowKey) return x;
      if (x.soldiers.some((s) => s.soldierId === soldierId)) return x;
      const isDriver = role ? role.isDriver : x.soldiers.length === 0;
      const others = isDriver ? x.soldiers.map((s) => ({ ...s, isDriver: false })) : x.soldiers;
      return { ...x, soldiers: [...others, { key: nk(), soldierId, externalName: "", externalPersonalNumber: "", isDriver, dispatchRoleId: roleId }] };
    }));
  }
  function addExternalSoldier(rowKey: string) { setRows((r) => r.map((x) => x.key === rowKey ? { ...x, soldiers: [...x.soldiers, { key: nk(), soldierId: null, externalName: "", externalPersonalNumber: "", isDriver: x.soldiers.length === 0, dispatchRoleId: null }] } : x)); }
  function removeSoldier(rowKey: string, sKey: string) { setRows((r) => r.map((x) => x.key === rowKey ? { ...x, soldiers: x.soldiers.filter((s) => s.key !== sKey) } : x)); }
  function setDriver(rowKey: string, sKey: string) { setRows((r) => r.map((x) => x.key === rowKey ? { ...x, soldiers: x.soldiers.map((s) => ({ ...s, isDriver: s.key === sKey })) } : x)); }
  function setRole(rowKey: string, sKey: string, roleId: string) {
    const role = roles.find((r) => r.id === roleId);
    setRows((r) => r.map((x) => x.key !== rowKey ? x : { ...x, soldiers: x.soldiers.map((s) => s.key === sKey ? { ...s, dispatchRoleId: roleId || null, isDriver: role ? role.isDriver : s.isDriver } : (role?.isDriver ? { ...s, isDriver: false } : s)) }));
  }
  function patchSoldier(rowKey: string, sKey: string, p: Partial<Crew>) { setRows((r) => r.map((x) => x.key === rowKey ? { ...x, soldiers: x.soldiers.map((s) => s.key === sKey ? { ...s, ...p } : s) } : x)); }

  const totalSoldiers = rows.reduce((n, r) => n + r.soldiers.length, 0);
  const canSubmit = rows.length > 0 && missionDate && /^\d{2}:\d{2}$/.test(departureTime) && rows.every((r) => (r.source === "system" ? r.vehicleSerialUnitId : r.externalVehicleNumber.trim()) && r.soldiers.length > 0);

  const submit = useCallback(async () => {
    if (submitting || done) return;
    if (!canSubmit) { tg?.showAlert("מלא/י תאריך, שעה, רכב אחד לפחות עם חייל"); return; }
    setSubmitting(true);
    const payload = {
      title: title.trim() || null,
      commanderSoldierId: commanderSoldierId || null,
      commanderName: commanderSoldierId ? null : (commanderName.trim() || null),
      missionDate, departureTime, notes: notes.trim() || null,
      vehicles: rows.map((row) => ({
        vehicleSerialUnitId: row.source === "system" ? (row.vehicleSerialUnitId || null) : null,
        isExternal: row.source === "external",
        externalVehicleNumber: row.source === "external" ? row.externalVehicleNumber.trim() : null,
        externalVehicleTypeName: row.source === "external" ? row.externalVehicleTypeName.trim() : null,
        soldiers: row.soldiers.map((s) => s.soldierId
          ? { soldierId: s.soldierId, isDriver: s.isDriver, dispatchRoleId: s.dispatchRoleId }
          : { externalName: s.externalName.trim(), externalPersonalNumber: s.externalPersonalNumber.trim(), isDriver: s.isDriver, dispatchRoleId: s.dispatchRoleId }),
      })),
    };
    try {
      const res = await fetch(`/api/telegram/${battalionId}/dispatch`, { method: "POST", headers: { "Content-Type": "application/json", "x-telegram-init-data": initData }, body: JSON.stringify(payload) });
      const d = await res.json();
      if (d.error) { tg?.showAlert(d.error); setSubmitting(false); return; }
      setDone(true); setTimeout(() => tg?.close(), 1500);
    } catch { tg?.showAlert("שגיאה בשמירה"); setSubmitting(false); }
  }, [submitting, done, canSubmit, title, commanderSoldierId, commanderName, missionDate, departureTime, notes, rows, battalionId, initData, tg]);

  useEffect(() => {
    if (!tg) return;
    tg.MainButton.text = submitting ? "שומר..." : `צור משימה (${rows.length} רכבים · ${totalSoldiers} חיילים)`;
    if (canSubmit && !submitting && !done) { tg.MainButton.show(); tg.MainButton.enable(); }
    else if (submitting) { tg.MainButton.show(); tg.MainButton.showProgress(); tg.MainButton.disable(); }
    else tg.MainButton.hide();
  }, [canSubmit, submitting, done, rows.length, totalSoldiers, tg]);
  useEffect(() => { if (!tg) return; tg.MainButton.onClick(submit); return () => tg.MainButton.offClick(submit); }, [tg, submit]);

  if (done) return <Center><div style={{ fontSize: 64 }}>✅</div><p style={{ fontSize: 18, fontWeight: 600, marginTop: 8 }}>המשימה נוצרה!</p></Center>;
  if (loading) return <Center><p>טוען...</p></Center>;
  if (error) return <Center><p style={{ color: "#ef4444", padding: 24, textAlign: "center" }}>{error}</p></Center>;

  const isDark = tg?.colorScheme === "dark";
  const bg = isDark ? "#1e1e1e" : "#f8fafc", cardBg = isDark ? "#2d2d2d" : "#fff", text = isDark ? "#e2e8f0" : "#1e293b", muted = isDark ? "#94a3b8" : "#64748b", accent = "#059669", border = isDark ? "#404040" : "#e2e8f0";
  const inp = { width: "100%", padding: "9px 11px", borderRadius: 10, border: `1px solid ${border}`, background: cardBg, color: text, fontSize: 14 } as const;
  const lbl = { fontSize: 12, fontWeight: 600, marginBottom: 3, display: "block" } as const;
  const activeRow = rows.find((r) => r.key === activeKey) ?? rows[0];
  const availSoldiers = (row: Row) => {
    const q = soldierSearch.trim();
    let list = soldiers.filter((s) => !row.soldiers.some((rs) => rs.soldierId === s.id));
    if (q) list = list.filter((s) => s.name.includes(q) || (s.pn ?? "").includes(q));
    return list.sort((a, b) => (presentSet.has(a.id) ? 0 : 1) - (presentSet.has(b.id) ? 0 : 1) || a.name.localeCompare(b.name, "he"));
  };

  return (
    <div dir="rtl" style={{ fontFamily: "system-ui, sans-serif", background: bg, color: text, minHeight: "100vh", padding: 14, paddingBottom: 90 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 14, textAlign: "center" }}>🚗 משימה חדשה</h2>

      {/* פרטי משימה */}
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <div style={{ flex: 1 }}><label style={lbl}>📅 תאריך</label><input type="date" value={missionDate} onChange={(e) => setMissionDate(e.target.value)} style={inp} /></div>
        <div style={{ flex: 1 }}><label style={lbl}>⏰ שעת יציאה</label><input type="time" value={departureTime} onChange={(e) => setDepartureTime(e.target.value)} style={inp} /></div>
      </div>
      <div style={{ marginBottom: 10 }}><label style={lbl}>שם המשימה (אופציונלי)</label><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="למשל: פינוי בוקר / ליווי שיירה" style={inp} /></div>
      <div style={{ marginBottom: 10 }}>
        <label style={lbl}>מפקד אחראי</label>
        <select value={commanderSoldierId} onChange={(e) => { setCommanderSoldierId(e.target.value); if (e.target.value) setCommanderName(""); }} style={{ ...inp, appearance: "auto" }}>
          <option value="">— בחר חייל —</option>
          {soldiers.map((s) => <option key={s.id} value={s.id}>{s.name}{s.pn ? ` (${s.pn})` : ""}</option>)}
        </select>
        {!commanderSoldierId && <input value={commanderName} onChange={(e) => setCommanderName(e.target.value)} placeholder="או שם מפקד חוץ (חופשי)" style={{ ...inp, marginTop: 6 }} />}
      </div>

      {/* הוספת רכבים */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        <button onClick={addSystemVehicle} style={{ fontSize: 13, background: "#1e293b", color: "#fff", border: "none", borderRadius: 9, padding: "8px 12px" }}>+ רכב מהמערכת</button>
        <button onClick={addExternalVehicle} style={{ fontSize: 13, background: "#d97706", color: "#fff", border: "none", borderRadius: 9, padding: "8px 12px" }}>+ רכב חוץ</button>
        {templates.length > 0 && (
          <select value="" onChange={(e) => { addFromTemplate(e.target.value); e.target.value = ""; }} style={{ fontSize: 13, borderRadius: 9, border: `1px solid ${border}`, background: cardBg, color: text, padding: "8px 10px" }}>
            <option value="">+ משבצ&quot;ק קבוע</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.vehicleTypeName}</option>)}
          </select>
        )}
      </div>

      {rows.length === 0 && <p style={{ color: muted, fontSize: 13, textAlign: "center", padding: "16px 0" }}>הוסף/י רכב אחד או יותר למשימה 👆</p>}

      {/* טאבים לרכבים */}
      {rows.length > 0 && (
        <>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
            {rows.map((row, i) => {
              const active = row.key === activeRow.key;
              const unq = row.soldiers.some((s) => s.isDriver && driverReasons(s.soldierId, row).length > 0);
              return (
                <button key={row.key} onClick={() => setActiveKey(row.key)} style={{ fontSize: 12, borderRadius: 9, padding: "6px 10px", border: `1px solid ${active ? accent : border}`, background: active ? accent : cardBg, color: active ? "#fff" : text, display: "flex", alignItems: "center", gap: 4 }}>
                  {row.source === "external" ? "🔶" : "🚗"} רכב {i + 1}
                  <span style={{ background: active ? "rgba(255,255,255,.25)" : (isDark ? "#404040" : "#f1f5f9"), borderRadius: 8, padding: "0 6px", fontSize: 10 }}>{row.soldiers.length}</span>
                  {unq && <span title="נהג לא מוסמך">🔴</span>}
                </button>
              );
            })}
          </div>

          {/* פאנל רכב פעיל */}
          {(() => {
            const row = activeRow; const ri = rows.findIndex((r) => r.key === row.key);
            return (
              <div style={{ border: `1px solid ${border}`, borderRadius: 12, background: cardBg, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <b style={{ fontSize: 14 }}>רכב {ri + 1} {row.source === "external" && <span style={{ color: "#d97706" }}>· חוץ</span>}</b>
                  <button onClick={() => removeRow(row.key)} style={{ fontSize: 12, color: "#ef4444", background: "none", border: "none" }}>הסר רכב</button>
                </div>
                {row.source === "system" ? (
                  <select value={row.vehicleSerialUnitId} onChange={(e) => patchRow(row.key, { vehicleSerialUnitId: e.target.value })} style={{ ...inp, appearance: "auto", marginBottom: 8 }}>
                    <option value="">— בחר רכב —</option>
                    {vehicles.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                  </select>
                ) : (
                  <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                    <input value={row.externalVehicleNumber} onChange={(e) => patchRow(row.key, { externalVehicleNumber: e.target.value })} placeholder="מספר רכב (חובה)" style={{ ...inp, borderColor: row.externalVehicleNumber.trim() ? border : "#f87171" }} />
                    <input value={row.externalVehicleTypeName} onChange={(e) => patchRow(row.key, { externalVehicleTypeName: e.target.value })} placeholder="סוג (האמר…)" style={inp} />
                  </div>
                )}

                {/* צוות */}
                {row.soldiers.map((s) => {
                  const rz = s.isDriver ? driverReasons(s.soldierId, row) : [];
                  return (
                    <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", background: isDark ? "#1e1e1e" : "#f8fafc", borderRadius: 9, padding: "6px 8px", marginBottom: 5 }}>
                      <button onClick={() => setDriver(row.key, s.key)} title="נהג" style={{ fontSize: 14, background: s.isDriver ? accent : "transparent", color: s.isDriver ? "#fff" : muted, border: `1px solid ${s.isDriver ? accent : border}`, borderRadius: 7, padding: "2px 6px" }}>🚗</button>
                      {s.soldierId ? (
                        <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{soldierName(s.soldierId)}{!presentSet.has(s.soldierId) && <span style={{ fontSize: 9, color: "#d97706" }}> ⚠️ לא נוכח</span>}</span>
                      ) : (
                        <span style={{ display: "flex", gap: 4, flex: 1 }}>
                          <input value={s.externalName} onChange={(e) => patchSoldier(row.key, s.key, { externalName: e.target.value })} placeholder="שם חוץ" style={{ ...inp, padding: "4px 6px", fontSize: 12 }} />
                          <input value={s.externalPersonalNumber} onChange={(e) => patchSoldier(row.key, s.key, { externalPersonalNumber: e.target.value })} placeholder="מ.א" style={{ ...inp, padding: "4px 6px", fontSize: 12, width: 70 }} />
                        </span>
                      )}
                      {roles.length > 0 && (
                        <select value={s.dispatchRoleId ?? ""} onChange={(e) => setRole(row.key, s.key, e.target.value)} style={{ fontSize: 12, borderRadius: 7, border: `1px solid ${border}`, background: cardBg, color: text, padding: "3px 5px" }}>
                          <option value="">תפקיד…</option>
                          {roles.map((r) => <option key={r.id} value={r.id}>{r.icon} {r.name}</option>)}
                        </select>
                      )}
                      {rz.length > 0 && <span title={rz.join(" · ")} style={{ fontSize: 10, background: "#dc2626", color: "#fff", borderRadius: 6, padding: "2px 5px", fontWeight: 700 }}>🔴</span>}
                      <button onClick={() => removeSoldier(row.key, s.key)} style={{ color: "#ef4444", background: "none", border: "none", fontSize: 15 }}>✕</button>
                    </div>
                  );
                })}
                {row.soldiers.length === 0 && <div style={{ fontSize: 12, color: muted, padding: "4px 0" }}>אין חיילים משובצים ברכב זה</div>}

                {/* הוספת חייל */}
                <div style={{ background: isDark ? "#1e1e1e" : "#f8fafc", borderRadius: 9, padding: 8, marginTop: 6 }}>
                  <input value={soldierSearch} onChange={(e) => setSoldierSearch(e.target.value)} placeholder="🔍 חיפוש חייל…" style={{ ...inp, marginBottom: 6 }} />
                  <select value="" onChange={(e) => { addSoldier(row.key, e.target.value, null); e.target.value = ""; }} style={{ ...inp, appearance: "auto" }}>
                    <option value="">+ הוסף חייל</option>
                    {availSoldiers(row).slice(0, 60).map((s) => <option key={s.id} value={s.id}>{presentSet.has(s.id) ? "" : "⚠️ "}{s.name}{s.pn ? ` (${s.pn})` : ""}</option>)}
                  </select>
                  <button onClick={() => addExternalSoldier(row.key)} style={{ fontSize: 12, color: "#b45309", background: "none", border: `1px solid #fcd34d`, borderRadius: 8, padding: "5px 9px", marginTop: 6 }}>+ חייל חוץ</button>
                </div>
              </div>
            );
          })()}
        </>
      )}

      <div style={{ marginTop: 10 }}><label style={lbl}>הערות</label><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} style={{ ...inp, resize: "vertical" }} /></div>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "system-ui" }}>{children}</div>;
}
