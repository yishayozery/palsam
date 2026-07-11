"use client";

import { useState, useMemo } from "react";

export type WVehicle = { id: string; name: string; serial: string; typeName: string; label: string; requiredLicenseIds: string[] };
export type WSoldier = { id: string; name: string; pn: string | null; company: string | null; licenseIds: string[]; procValid: boolean; refreshValid: boolean };
export type WRole = { id: string; name: string; icon: string | null; isDriver: boolean };
export type WTemplate = { id: string; name: string; vehicleSerialUnitId: string; vehicleTypeName: string; soldiers: { soldierId: string; dispatchRoleId: string | null; isDriver: boolean }[] };
export type WData = { battalionName?: string; vehicles: WVehicle[]; soldiers: WSoldier[]; roles: WRole[]; templates: WTemplate[]; presentSoldierIds: string[] };

type Crew = { key: string; soldierId: string | null; externalName: string; externalPersonalNumber: string; isDriver: boolean; dispatchRoleId: string | null };
type Row = { key: string; source: "system" | "external"; vehicleSerialUnitId: string; externalVehicleNumber: string; externalVehicleTypeName: string; soldiers: Crew[] };

let seq = 0;
const nk = () => `k${++seq}`;

const C = { bg: "#f8fafc", card: "#fff", text: "#1e293b", muted: "#64748b", accent: "#059669", border: "#e2e8f0" };
const inp: React.CSSProperties = { width: "100%", padding: "11px 12px", borderRadius: 10, border: `1px solid ${C.border}`, background: C.card, color: C.text, fontSize: 15, boxSizing: "border-box" };
const lbl: React.CSSProperties = { fontSize: 13, fontWeight: 600, marginBottom: 4, display: "block" };

const STEPS = ["פרטים", "שיירה", "סיכום"];

export default function MissionWizard({ data, onSubmit }: { data: WData; onSubmit: (payload: unknown) => Promise<{ error?: string; ok?: boolean }> }) {
  const { vehicles, soldiers, roles, templates } = data;
  const presentSet = useMemo(() => new Set(data.presentSoldierIds), [data.presentSoldierIds]);

  const [step, setStep] = useState(0);
  const [topErr, setTopErr] = useState("");
  const [title, setTitle] = useState("");
  const [commanderSoldierId, setCommanderSoldierId] = useState("");
  const [commanderName, setCommanderName] = useState("");
  const [missionDate, setMissionDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [departureTime, setDepartureTime] = useState("08:00");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [vehIdx, setVehIdx] = useState(0);
  const [search, setSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const soldierName = (id: string) => soldiers.find((s) => s.id === id)?.name ?? id;
  function driverReasons(soldierId: string | null, row: Row): string[] {
    if (!soldierId || row.source === "external") return [];
    const s = soldiers.find((x) => x.id === soldierId); if (!s) return [];
    const veh = vehicles.find((v) => v.id === row.vehicleSerialUnitId);
    const req = veh?.requiredLicenseIds ?? []; const has = new Set(s.licenseIds); const rz: string[] = [];
    if (req.some((id) => !has.has(id))) rz.push("חסר רישיון/היתר לסוג הרכב");
    if (!s.procValid) rz.push("לא חתם על נוהל נהיגה בתוקף");
    if (!s.refreshValid) rz.push("ריענון נהיגה לא בתוקף");
    return rz;
  }

  function addSystem() { const k = nk(); setRows((r) => { setVehIdx(r.length); return [...r, { key: k, source: "system", vehicleSerialUnitId: "", externalVehicleNumber: "", externalVehicleTypeName: "", soldiers: [] }]; }); setTopErr(""); }
  function addExternal() { const k = nk(); setRows((r) => { setVehIdx(r.length); return [...r, { key: k, source: "external", vehicleSerialUnitId: "", externalVehicleNumber: "", externalVehicleTypeName: "", soldiers: [] }]; }); setTopErr(""); }
  function addTemplate(tid: string) {
    const t = templates.find((x) => x.id === tid); if (!t) return;
    const crew: Crew[] = t.soldiers.map((s) => ({ key: nk(), soldierId: s.soldierId, externalName: "", externalPersonalNumber: "", isDriver: s.isDriver, dispatchRoleId: s.dispatchRoleId }));
    if (crew.length && !crew.some((c) => c.isDriver)) crew[0].isDriver = true;
    setRows((r) => { setVehIdx(r.length); return [...r, { key: nk(), source: "system", vehicleSerialUnitId: t.vehicleSerialUnitId, externalVehicleNumber: "", externalVehicleTypeName: "", soldiers: crew }]; }); setTopErr("");
  }
  function removeRow(key: string) { setRows((r) => { const n = r.filter((x) => x.key !== key); setVehIdx((i) => Math.max(0, Math.min(i, n.length - 1))); return n; }); }
  function patchRow(key: string, p: Partial<Row>) { setRows((r) => r.map((x) => x.key === key ? { ...x, ...p } : x)); }
  function addSoldier(rowKey: string, soldierId: string) {
    if (!soldierId) return;
    setRows((r) => r.map((x) => x.key !== rowKey ? x : (x.soldiers.some((s) => s.soldierId === soldierId) ? x : { ...x, soldiers: [...x.soldiers, { key: nk(), soldierId, externalName: "", externalPersonalNumber: "", isDriver: x.soldiers.length === 0, dispatchRoleId: null }] })));
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
  const availSoldiers = (row: Row) => {
    const q = search.trim();
    let list = soldiers.filter((s) => !row.soldiers.some((rs) => rs.soldierId === s.id));
    if (q) list = list.filter((s) => s.name.includes(q) || (s.pn ?? "").includes(q));
    return list.sort((a, b) => (presentSet.has(a.id) ? 0 : 1) - (presentSet.has(b.id) ? 0 : 1) || a.name.localeCompare(b.name, "he"));
  };

  // ולידציה עם הודעה ברורה (למעלה)
  function validateStep0(): string | null {
    if (!missionDate) return "בחר/י תאריך משימה";
    if (!/^\d{2}:\d{2}$/.test(departureTime)) return "בחר/י שעת יציאה";
    return null;
  }
  function validateStep1(): string | null {
    if (rows.length === 0) return "הוסף/י לפחות רכב אחד למשימה";
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (r.source === "system" && !r.vehicleSerialUnitId) return `רכב ${i + 1}: יש לבחור רכב`;
      if (r.source === "external" && !r.externalVehicleNumber.trim()) return `רכב ${i + 1} (חוץ): חסר מספר רכב`;
      if (r.soldiers.length === 0) return `רכב ${i + 1}: יש להוסיף לפחות חייל אחד`;
      const extNoName = r.soldiers.find((s) => !s.soldierId && !s.externalName.trim());
      if (extNoName) return `רכב ${i + 1}: חייל חוץ ללא שם`;
    }
    return null;
  }

  function goNext() {
    if (step === 0) { const e = validateStep0(); if (e) { setTopErr(e); return; } setTopErr(""); setStep(1); return; }
    if (step === 1) { const e = validateStep1(); if (e) { setTopErr(e); const m = e.match(/רכב (\d+)/); if (m) setVehIdx(parseInt(m[1]) - 1); return; } setTopErr(""); setStep(2); return; }
  }
  function goBack() { setTopErr(""); setStep((s) => Math.max(0, s - 1)); }

  async function submit() {
    const e = validateStep1(); if (e) { setTopErr(e); setStep(1); return; }
    setTopErr(""); setSubmitting(true);
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
        soldiers: row.soldiers.map((s) => s.soldierId ? { soldierId: s.soldierId, isDriver: s.isDriver, dispatchRoleId: s.dispatchRoleId } : { externalName: s.externalName.trim(), externalPersonalNumber: s.externalPersonalNumber.trim(), isDriver: s.isDriver, dispatchRoleId: s.dispatchRoleId }),
      })),
    };
    const r = await onSubmit(payload);
    if (r.error) { setTopErr(r.error); setSubmitting(false); return; }
    setDone(true);
  }

  if (done) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "80vh", fontFamily: "system-ui" }}>
      <div style={{ fontSize: 64 }}>✅</div>
      <p style={{ fontSize: 20, fontWeight: 700, marginTop: 12, color: "#166534" }}>המשימה נוצרה!</p>
      <p style={{ fontSize: 13, color: C.muted, marginTop: 6 }}>{rows.length} רכבים · {totalSoldiers} חיילים · ניתן לסגור</p>
    </div>
  );

  const addButtons = (label = "") => (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
      {label && <span style={{ fontSize: 13, color: C.muted, fontWeight: 600 }}>{label}</span>}
      <button onClick={addSystem} style={{ fontSize: 13, background: "#1e293b", color: "#fff", border: "none", borderRadius: 9, padding: "9px 12px" }}>+ רכב מהמערכת</button>
      <button onClick={addExternal} style={{ fontSize: 13, background: "#d97706", color: "#fff", border: "none", borderRadius: 9, padding: "9px 12px" }}>+ רכב חוץ</button>
      {templates.length > 0 && (
        <select value="" onChange={(e) => { addTemplate(e.target.value); e.target.value = ""; }} style={{ fontSize: 13, borderRadius: 9, border: `1px solid ${C.border}`, background: C.card, padding: "9px 10px" }}>
          <option value="">+ שבצ&quot;ק קבוע</option>
          {templates.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.vehicleTypeName}</option>)}
        </select>
      )}
    </div>
  );

  const row = rows[Math.min(vehIdx, rows.length - 1)];

  return (
    <div dir="rtl" style={{ fontFamily: "system-ui, sans-serif", background: C.bg, color: C.text, minHeight: "100vh", maxWidth: 480, margin: "0 auto", padding: 16, paddingBottom: 88 }}>
      <div style={{ textAlign: "center", marginBottom: 12 }}>
        <h2 style={{ fontSize: 19, fontWeight: 700, margin: 0 }}>🚗 פתיחת משימה</h2>
        {data.battalionName && <p style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{data.battalionName}</p>}
      </div>

      {/* מחוון שלבים */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {STEPS.map((s, i) => (
          <div key={s} style={{ flex: 1, textAlign: "center" }}>
            <div style={{ height: 6, borderRadius: 3, background: i <= step ? C.accent : C.border, marginBottom: 4 }} />
            <span style={{ fontSize: 11, fontWeight: i === step ? 700 : 400, color: i === step ? C.accent : C.muted }}>{i + 1}. {s}</span>
          </div>
        ))}
      </div>

      {/* 🔴 באנר שגיאה — למעלה, בולט */}
      {topErr && (
        <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", color: "#b91c1c", borderRadius: 10, padding: "10px 12px", marginBottom: 12, fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 16 }}>⚠️</span> {topErr}
        </div>
      )}

      {/* שלב 1 — פרטים */}
      {step === 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}><label style={lbl}>📅 תאריך</label><input type="date" value={missionDate} onChange={(e) => setMissionDate(e.target.value)} style={inp} /></div>
            <div style={{ flex: 1 }}><label style={lbl}>⏰ שעת יציאה</label><input type="time" value={departureTime} onChange={(e) => setDepartureTime(e.target.value)} style={inp} /></div>
          </div>
          <div><label style={lbl}>שם המשימה (אופציונלי)</label><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="פינוי בוקר / ליווי שיירה…" style={inp} /></div>
          <div>
            <label style={lbl}>מפקד אחראי (אופציונלי)</label>
            <select value={commanderSoldierId} onChange={(e) => { setCommanderSoldierId(e.target.value); if (e.target.value) setCommanderName(""); }} style={{ ...inp, appearance: "auto" }}>
              <option value="">— בחר חייל —</option>
              {soldiers.map((s) => <option key={s.id} value={s.id}>{s.name}{s.pn ? ` (${s.pn})` : ""}</option>)}
            </select>
            {!commanderSoldierId && <input value={commanderName} onChange={(e) => setCommanderName(e.target.value)} placeholder="או שם מפקד חוץ" style={{ ...inp, marginTop: 6 }} />}
          </div>
        </div>
      )}

      {/* שלב 2 — שיירה (רכב אחד במסך, מעבר בין רכבים) */}
      {step === 1 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {rows.length === 0 ? (
            <>
              <p style={{ color: C.muted, fontSize: 14, textAlign: "center", paddingTop: 8 }}>הוסף/י רכב ראשון למשימה:</p>
              {addButtons()}
            </>
          ) : (
            <>
              {/* טאבים לרכבים */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                {rows.map((r, i) => (
                  <button key={r.key} onClick={() => setVehIdx(i)} style={{ fontSize: 12, borderRadius: 9, padding: "6px 10px", border: `1px solid ${i === vehIdx ? C.accent : C.border}`, background: i === vehIdx ? C.accent : C.card, color: i === vehIdx ? "#fff" : C.text, display: "flex", alignItems: "center", gap: 4 }}>
                    {r.source === "external" ? "🔶" : "🚗"} רכב {i + 1}
                    <span style={{ background: i === vehIdx ? "rgba(255,255,255,.25)" : "#f1f5f9", borderRadius: 8, padding: "0 6px", fontSize: 10, color: i === vehIdx ? "#fff" : C.muted }}>{r.soldiers.length}</span>
                  </button>
                ))}
              </div>

              {/* כרטיס הרכב הפעיל */}
              <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, background: C.card, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <b style={{ fontSize: 15 }}>{row.source === "external" ? "🔶" : "🚗"} רכב {vehIdx + 1} מתוך {rows.length}</b>
                  <button onClick={() => removeRow(row.key)} style={{ fontSize: 12, color: "#ef4444", background: "none", border: "none" }}>הסר רכב</button>
                </div>
                {row.source === "system" ? (
                  <select value={row.vehicleSerialUnitId} onChange={(e) => patchRow(row.key, { vehicleSerialUnitId: e.target.value })} style={{ ...inp, appearance: "auto", marginBottom: 8 }}>
                    <option value="">— בחר רכב —</option>
                    {vehicles.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                  </select>
                ) : (
                  <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                    <input value={row.externalVehicleNumber} onChange={(e) => patchRow(row.key, { externalVehicleNumber: e.target.value })} placeholder="מספר רכב (חובה)" style={{ ...inp, borderColor: row.externalVehicleNumber.trim() ? C.border : "#f87171" }} />
                    <input value={row.externalVehicleTypeName} onChange={(e) => patchRow(row.key, { externalVehicleTypeName: e.target.value })} placeholder="סוג" style={inp} />
                  </div>
                )}
                {row.soldiers.map((s) => {
                  const rz = s.isDriver ? driverReasons(s.soldierId, row) : [];
                  return (
                    <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", background: C.bg, borderRadius: 9, padding: "6px 8px", marginBottom: 5 }}>
                      <button onClick={() => setDriver(row.key, s.key)} title="נהג" style={{ fontSize: 14, background: s.isDriver ? C.accent : "transparent", color: s.isDriver ? "#fff" : C.muted, border: `1px solid ${s.isDriver ? C.accent : C.border}`, borderRadius: 7, padding: "2px 6px" }}>🚗</button>
                      {s.soldierId ? (
                        <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{soldierName(s.soldierId)}{!presentSet.has(s.soldierId) && <span style={{ fontSize: 9, color: "#d97706" }}> ⚠️</span>}</span>
                      ) : (
                        <span style={{ display: "flex", gap: 4, flex: 1 }}>
                          <input value={s.externalName} onChange={(e) => patchSoldier(row.key, s.key, { externalName: e.target.value })} placeholder="שם חוץ" style={{ ...inp, padding: "5px 7px", fontSize: 12 }} />
                          <input value={s.externalPersonalNumber} onChange={(e) => patchSoldier(row.key, s.key, { externalPersonalNumber: e.target.value })} placeholder="מ.א" style={{ ...inp, padding: "5px 7px", fontSize: 12, width: 66 }} />
                        </span>
                      )}
                      {roles.length > 0 && (
                        <select value={s.dispatchRoleId ?? ""} onChange={(e) => setRole(row.key, s.key, e.target.value)} style={{ fontSize: 12, borderRadius: 7, border: `1px solid ${C.border}`, background: C.card, padding: "4px 5px" }}>
                          <option value="">תפקיד…</option>
                          {roles.map((r) => <option key={r.id} value={r.id}>{r.icon} {r.name}</option>)}
                        </select>
                      )}
                      {rz.length > 0 && <span title={rz.join(" · ")} style={{ fontSize: 10, background: "#dc2626", color: "#fff", borderRadius: 6, padding: "2px 5px", fontWeight: 700 }}>🔴</span>}
                      <button onClick={() => removeSoldier(row.key, s.key)} style={{ color: "#ef4444", background: "none", border: "none", fontSize: 15 }}>✕</button>
                    </div>
                  );
                })}
                {row.soldiers.length === 0 && <div style={{ fontSize: 12, color: "#dc2626", padding: "4px 0" }}>⚠️ אין חיילים ברכב זה — הוסף/י לפחות אחד</div>}
                <div style={{ background: C.bg, borderRadius: 9, padding: 8, marginTop: 6 }}>
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 חיפוש חייל…" style={{ ...inp, marginBottom: 6 }} />
                  <select value="" onChange={(e) => { addSoldier(row.key, e.target.value); e.target.value = ""; }} style={{ ...inp, appearance: "auto" }}>
                    <option value="">+ הוסף חייל</option>
                    {availSoldiers(row).slice(0, 60).map((s) => <option key={s.id} value={s.id}>{presentSet.has(s.id) ? "" : "⚠️ "}{s.name}{s.pn ? ` (${s.pn})` : ""}</option>)}
                  </select>
                  <button onClick={() => addExternalSoldier(row.key)} style={{ fontSize: 12, color: "#b45309", background: "none", border: "1px solid #fcd34d", borderRadius: 8, padding: "6px 10px", marginTop: 6 }}>+ חייל חוץ</button>
                </div>
              </div>

              {/* רכב נוסף / הבא */}
              {addButtons("➕ רכב נוסף:")}
            </>
          )}
        </div>
      )}

      {/* שלב 3 — סיכום */}
      {step === 2 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12, fontSize: 14 }}>
            <div>📅 <b>{missionDate}</b> · ⏰ <b>{departureTime}</b></div>
            {title && <div style={{ marginTop: 4 }}>📋 {title}</div>}
            {(commanderSoldierId || commanderName) && <div style={{ marginTop: 4 }}>👤 מפקד: {commanderSoldierId ? soldierName(commanderSoldierId) : commanderName}</div>}
            <div style={{ marginTop: 4, color: C.muted }}>{rows.length} רכבים · {totalSoldiers} חיילים</div>
          </div>
          {rows.map((r, ri) => (
            <div key={r.key} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12 }}>
              <b style={{ fontSize: 13 }}>{r.source === "external" ? "🔶" : "🚗"} רכב {ri + 1} — {r.source === "system" ? (vehicles.find((v) => v.id === r.vehicleSerialUnitId)?.label ?? "—") : `${r.externalVehicleTypeName || "חוץ"} ${r.externalVehicleNumber}`}</b>
              <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
                {r.soldiers.map((s) => <span key={s.key} style={{ fontSize: 12, background: C.bg, borderRadius: 6, padding: "3px 7px" }}>{s.isDriver ? "🚗 " : ""}{s.soldierId ? soldierName(s.soldierId) : s.externalName || "חוץ"}</span>)}
              </div>
            </div>
          ))}
          <div><label style={lbl}>הערות</label><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} style={{ ...inp, resize: "vertical" }} /></div>
        </div>
      )}

      {/* ניווט */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, maxWidth: 480, margin: "0 auto", display: "flex", gap: 8, padding: 12, background: C.bg, borderTop: `1px solid ${C.border}` }}>
        {step > 0 && <button onClick={goBack} style={{ flex: 1, padding: 14, borderRadius: 10, border: `1px solid ${C.border}`, background: C.card, color: C.text, fontSize: 15, fontWeight: 600 }}>← חזרה</button>}
        {step < 2
          ? <button onClick={goNext} style={{ flex: 2, padding: 14, borderRadius: 10, border: "none", background: C.accent, color: "#fff", fontSize: 15, fontWeight: 700 }}>{step === 1 ? "לסיכום →" : "המשך →"}</button>
          : <button onClick={submit} disabled={submitting} style={{ flex: 2, padding: 14, borderRadius: 10, border: "none", background: C.accent, color: "#fff", fontSize: 15, fontWeight: 700, opacity: submitting ? 0.7 : 1 }}>{submitting ? "שומר…" : "✅ צור משימה"}</button>}
      </div>
    </div>
  );
}
