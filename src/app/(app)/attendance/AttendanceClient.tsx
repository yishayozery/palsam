"use client";

import React, { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";
import { saveAttendance, assignSquad, openCallup, closeCallup, deleteCallup } from "./actions";
import { upsertSquad, deleteSquad } from "../attendance-settings/actions";
import type { DayInfo } from "@/lib/hebrew-dates";

type SoldierRow = {
  id: string;
  fullName: string;
  personalNumber: string | null;
  companyId: string | null;
  companyName: string | null;
  squadId: string | null;
  squadName: string | null;
  companyRoleId: string | null;
  companyRoleName: string | null;
  isCommander: boolean;
  enlistedAt: string | null;
  callupClosedAt: string | null;
};
type Squad = { id: string; name: string };
type CompanyRole = { id: string; name: string; isCommander: boolean };
type Status = { id: string; name: string; color: string; icon: string | null; isPresent: boolean };
type AttEntry = { soldierId: string; date: string; statusId: string };
type EmploymentOption = { id: string; name: string; startDate: string; endDate: string; totalDays: number; mode: string };
type SelectedEmployment = EmploymentOption & {
  allocations: { companyId: string; date: string; allocated: number }[];
};
type CallupPeriod = { id: string; soldierId: string; startDate: string; endDate: string | null };

export default function AttendanceClient({
  companies, selectedCompanyId, soldiers, squads, companyRoles, statuses, days, plans, records, mode, canManage, canManageEmployment, startDate,
  selectedEmployment, callupPeriods,
}: {
  companies: { id: string; name: string }[];
  selectedCompanyId: string;
  soldiers: SoldierRow[];
  squads: Squad[];
  companyRoles: CompanyRole[];
  statuses: Status[];
  days: DayInfo[];
  plans: AttEntry[];
  records: AttEntry[];
  mode: "plan" | "record";
  canManage: boolean;
  canManageEmployment: boolean;
  startDate: string;
  employments: EmploymentOption[];
  selectedEmployment: SelectedEmployment | null;
  callupPeriods: CallupPeriod[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<Map<string, string | null>>(new Map());
  const [selectedSquadId, setSelectedSquadId] = useState<string>("");
  const [selectedRoleId, setSelectedRoleId] = useState<string>("");
  const [onlyShmap, setOnlyShmap] = useState<boolean>(false);
  const [copiedPn, setCopiedPn] = useState<string | null>(null);

  function copyPn(pn: string) {
    navigator.clipboard?.writeText(pn).then(() => {
      setCopiedPn(pn);
      setTimeout(() => setCopiedPn((cur) => (cur === pn ? null : cur)), 1200);
    }).catch(() => {});
  }
  const [showCallupModal, setShowCallupModal] = useState<{ soldierId: string; soldierName: string } | null>(null);
  const [callupDate, setCallupDate] = useState("");
  const [callupSaving, setCallupSaving] = useState(false);

  // שמ"פ helpers — build lookup maps
  const callupMap = useMemo(() => {
    const m = new Map<string, CallupPeriod[]>();
    for (const c of callupPeriods) {
      const arr = m.get(c.soldierId) ?? [];
      arr.push(c);
      m.set(c.soldierId, arr);
    }
    return m;
  }, [callupPeriods]);

  const isInShmap = useCallback((soldierId: string, date: string): boolean => {
    const periods = callupMap.get(soldierId);
    if (!periods) return false;
    return periods.some((p) => date >= p.startDate && (!p.endDate || date <= p.endDate));
  }, [callupMap]);

  const isShmapLocked = useCallback((soldierId: string, date: string): boolean => {
    const periods = callupMap.get(soldierId);
    if (!periods) return false;
    return periods.some((p) => p.endDate && date >= p.startDate && date <= p.endDate);
  }, [callupMap]);

  const getActiveCallup = useCallback((soldierId: string): CallupPeriod | null => {
    const periods = callupMap.get(soldierId);
    if (!periods) return null;
    return periods.find((p) => !p.endDate) ?? null;
  }, [callupMap]);

  // שלישות (עורך תעסוקות) — היחיד שרשאי לשנות ימים שהחייל מחוץ לשמ"פ.
  const isPersonnel = canManageEmployment;
  // חייל מנוהל-שמ"פ = יש לו לפחות תקופת שמ"פ אחת. בימים שאינו בשמ"פ פעיל — נעול ("לא בשמ"פ").
  const hasCallup = useCallback((soldierId: string): boolean => (callupMap.get(soldierId)?.length ?? 0) > 0, [callupMap]);
  const isOutsideShmap = useCallback((soldierId: string, date: string): boolean =>
    hasCallup(soldierId) && !isInShmap(soldierId, date), [hasCallup, isInShmap]);
  // נעילת "לא בשמ"פ" — חלה על כל מי שאינו שלישות (נאמן/מ"פ/מפלג לא יכולים לשנות).
  const isNoShmapLocked = useCallback((soldierId: string, date: string): boolean =>
    !isPersonnel && isOutsideShmap(soldierId, date), [isPersonnel, isOutsideShmap]);

  const data = mode === "plan" ? plans : records;

  const dataMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of data) m.set(`${d.soldierId}:${d.date}`, d.statusId);
    return m;
  }, [data]);

  // מפת התכנון (plan) — תמיד, לצורך "העתק תכנון → ביצוע"
  const planMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of plans) m.set(`${d.soldierId}:${d.date}`, d.statusId);
    return m;
  }, [plans]);

  const getStatus = useCallback(
    (soldierId: string, date: string): string | null => {
      const key = `${soldierId}:${date}`;
      if (pendingChanges.has(key)) return pendingChanges.get(key) ?? null;
      return dataMap.get(key) ?? null;
    },
    [dataMap, pendingChanges],
  );

  // דיווח ביצוע בפועל (record) — רק על היום הנוכחי ואחורה; אין דיווח עתידי.
  // תכנון (plan) עתידי מותר — זו מטרתו.
  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(new Date());
  const isFuture = (date: string) => mode === "record" && date > todayStr;

  function cycleStatus(soldierId: string, date: string) {
    if (!canManage) return;
    if (isFuture(date)) return;
    if (isShmapLocked(soldierId, date)) return;
    if (isNoShmapLocked(soldierId, date)) return;
    const current = getStatus(soldierId, date);
    const idx = current ? statuses.findIndex((s) => s.id === current) : -1;
    const next = idx + 1 < statuses.length ? statuses[idx + 1].id : null;
    setPendingChanges((prev) => {
      const m = new Map(prev);
      m.set(`${soldierId}:${date}`, next);
      return m;
    });
  }

  function setStatusDirectly(soldierId: string, date: string, statusId: string | null) {
    if (!canManage) return;
    if (isFuture(date)) return;
    if (isShmapLocked(soldierId, date)) return;
    if (isNoShmapLocked(soldierId, date)) return;
    setPendingChanges((prev) => {
      const m = new Map(prev);
      m.set(`${soldierId}:${date}`, statusId);
      return m;
    });
  }

  async function handleSave() {
    if (pendingChanges.size === 0) return;
    setSaving(true);
    const entries = Array.from(pendingChanges.entries()).map(([key, statusId]) => {
      const [soldierId, date] = key.split(":");
      return { soldierId, date, statusId, type: mode };
    });
    await saveAttendance(entries);
    setPendingChanges(new Map());
    setSaving(false);
    router.refresh();
  }

  // Filter soldiers by selected squad and role
  const filteredSoldiers = useMemo(() => {
    let list = soldiers;
    if (selectedSquadId) list = list.filter((s) => s.squadId === selectedSquadId);
    if (selectedRoleId === "__commander__") list = list.filter((s) => s.isCommander);
    else if (selectedRoleId === "__none__") list = list.filter((s) => !s.companyRoleId);
    else if (selectedRoleId) list = list.filter((s) => s.companyRoleId === selectedRoleId);
    if (onlyShmap) list = list.filter((s) => !!getActiveCallup(s.id));
    return list;
  }, [soldiers, selectedSquadId, selectedRoleId, onlyShmap, getActiveCallup]);

  // 📋 העתקת תכנון היום → ביצוע בפועל (של אותו יום) — אחרי filteredSoldiers כדי לא לשבור את React Compiler
  async function copyPlanToActual() {
    const entries = filteredSoldiers
      .filter((s) => !isShmapLocked(s.id, todayStr))
      .map((s) => ({ soldierId: s.id, date: todayStr, statusId: planMap.get(`${s.id}:${todayStr}`) ?? null, type: "record" as const }))
      .filter((e) => !!e.statusId);
    if (entries.length === 0) { alert("אין תכנון מוגדר להיום להעתקה."); return; }
    if (!confirm(`להעתיק את התכנון של ${entries.length} חיילים לביצוע בפועל של היום (${todayStr})?\nפעולה זו תדרוס דיווח קיים.`)) return;
    setSaving(true);
    await saveAttendance(entries);
    setPendingChanges(new Map());
    setSaving(false);
    router.refresh();
  }

  // Group soldiers by company → squad
  const isAllCompanies = selectedCompanyId === "__all__";
  const grouped = useMemo(() => {
    const groups: { company: { id: string; name: string } | null; squad: Squad | null; soldiers: SoldierRow[] }[] = [];

    if (isAllCompanies) {
      // Group by company first, then by squad within each company
      const companyMap = new Map<string, { name: string; soldiers: SoldierRow[] }>();
      const noCompany: SoldierRow[] = [];
      for (const s of filteredSoldiers) {
        if (s.companyId) {
          const entry = companyMap.get(s.companyId) ?? { name: s.companyName ?? "", soldiers: [] };
          entry.soldiers.push(s);
          companyMap.set(s.companyId, entry);
        } else {
          noCompany.push(s);
        }
      }
      for (const [cId, { name, soldiers: cSoldiers }] of companyMap) {
        const squadMap = new Map<string, SoldierRow[]>();
        const noSquad: SoldierRow[] = [];
        for (const s of cSoldiers) {
          if (s.squadId) {
            const arr = squadMap.get(s.squadId) ?? [];
            arr.push(s);
            squadMap.set(s.squadId, arr);
          } else {
            noSquad.push(s);
          }
        }
        for (const sq of squads) {
          const arr = squadMap.get(sq.id);
          if (arr && arr.length > 0) groups.push({ company: { id: cId, name }, squad: sq, soldiers: arr });
        }
        if (noSquad.length > 0) groups.push({ company: { id: cId, name }, squad: null, soldiers: noSquad });
      }
      if (noCompany.length > 0) groups.push({ company: null, squad: null, soldiers: noCompany });
    } else {
      // Single company: group by squad only
      const squadMap = new Map<string, SoldierRow[]>();
      const noSquad: SoldierRow[] = [];
      for (const s of filteredSoldiers) {
        if (s.squadId) {
          const arr = squadMap.get(s.squadId) ?? [];
          arr.push(s);
          squadMap.set(s.squadId, arr);
        } else {
          noSquad.push(s);
        }
      }
      for (const sq of squads) {
        const arr = squadMap.get(sq.id);
        if (arr && arr.length > 0) groups.push({ company: null, squad: sq, soldiers: arr });
      }
      if (noSquad.length > 0) groups.push({ company: null, squad: null, soldiers: noSquad });
    }
    return groups;
  }, [filteredSoldiers, squads, isAllCompanies, selectedCompanyId]);

  const today = todayStr; // שעון ישראל (מוגדר למעלה) — לא UTC

  // Context menu
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; soldierId: string; date: string } | null>(null);
  const [showSquadMgr, setShowSquadMgr] = useState(false);
  const [newSquadName, setNewSquadName] = useState("");
  const [squadError, setSquadError] = useState<string | null>(null);
  const [squadSaving, setSquadSaving] = useState(false);

  function handleContextMenu(e: React.MouseEvent, soldierId: string, date: string) {
    e.preventDefault();
    if (!canManage) return;
    setCtxMenu({ x: e.clientX, y: e.clientY, soldierId, date });
  }

  // Navigate date range
  function buildUrl(params: Record<string, string>) {
    const base: Record<string, string> = { companyId: selectedCompanyId, start: startDate, mode };
    if (selectedEmployment) base.employmentId = selectedEmployment.id;
    const merged = { ...base, ...params };
    return "?" + new URLSearchParams(merged).toString();
  }

  function shiftDays(offset: number) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + offset);
    const newStart = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    router.push(buildUrl({ start: newStart }));
  }

  const companyName = companies.find((c) => c.id === selectedCompanyId)?.name ?? "";

  // === Dashboard stats ===
  const dashStats = useMemo(() => {
    const computeForSoldiers = (list: SoldierRow[]) => {
      const total = list.length;
      let present = 0;
      let absent = 0;
      let unmarked = 0;
      for (const s of list) {
        const st = getStatus(s.id, today);
        if (!st) { unmarked++; continue; }
        const status = statuses.find((x) => x.id === st);
        if (status?.isPresent) present++;
        else absent++;
      }
      const pct = total > 0 ? Math.round((present / total) * 100) : 0;
      return { total, present, absent, unmarked, pct };
    };

    const all = computeForSoldiers(filteredSoldiers);
    const bySquad = grouped.map((g) => ({
      company: g.company,
      squad: g.squad,
      ...computeForSoldiers(g.soldiers),
    }));

    // Role breakdown
    const roleMap = new Map<string, { role: { id: string; name: string; isCommander: boolean } | null; soldiers: SoldierRow[] }>();
    for (const s of filteredSoldiers) {
      const key = s.companyRoleId ?? "__none__";
      const entry = roleMap.get(key) ?? { role: s.companyRoleId ? { id: s.companyRoleId, name: s.companyRoleName!, isCommander: s.isCommander } : null, soldiers: [] };
      entry.soldiers.push(s);
      roleMap.set(key, entry);
    }
    const byRole = [...roleMap.values()].map((r) => ({
      role: r.role,
      ...computeForSoldiers(r.soldiers),
    }));

    return { all, bySquad, byRole };
  }, [filteredSoldiers, grouped, statuses, getStatus, today]);

  // שמ"פ stats
  const shmapStats = useMemo(() => {
    let inShmap = 0;
    let shmapClosed = 0;
    const inShmapSoldiers: SoldierRow[] = [];
    for (const s of filteredSoldiers) {
      const active = getActiveCallup(s.id);
      if (active) {
        inShmap++;
        inShmapSoldiers.push(s);
      }
      const periods = callupMap.get(s.id);
      if (periods) {
        const hasClosed = periods.some((p) => p.endDate);
        if (hasClosed) shmapClosed++;
      }
    }
    return { inShmap, shmapClosed, inShmapSoldiers, total: filteredSoldiers.length, inEmployment: filteredSoldiers.length - inShmap };
  }, [filteredSoldiers, getActiveCallup, callupMap]);

  const employmentDash = useMemo(() => {
    if (!selectedEmployment) return null;
    const presentStatusIds = new Set(statuses.filter((s) => s.isPresent).map((s) => s.id));
    const allocs = selectedEmployment.allocations;

    const todayAllocs = allocs.filter((a) => a.date === today);
    const todayAllocatedTotal = todayAllocs.reduce((s, a) => s + a.allocated, 0);

    let todayActualTotal = 0;
    for (const s of filteredSoldiers) {
      const st = getStatus(s.id, today);
      if (st && presentStatusIds.has(st)) todayActualTotal++;
    }
    const todayPct = todayAllocatedTotal > 0 ? Math.round((todayActualTotal / todayAllocatedTotal) * 100) : 0;

    const allDates = [...new Set(allocs.map((a) => a.date))];
    const cumulativeAllocated = allocs.reduce((s, a) => s + a.allocated, 0);

    let cumulativeActual = 0;
    for (const d of allDates) {
      for (const s of soldiers) {
        const st = getStatus(s.id, d);
        if (st && presentStatusIds.has(st)) cumulativeActual++;
      }
    }
    const cumulativePct = cumulativeAllocated > 0 ? Math.round((cumulativeActual / cumulativeAllocated) * 100) : 0;

    const isAll = selectedCompanyId === "__all__";
    let perCompany: { name: string; todayAlloc: number; todayAct: number; todayPct: number; cumAlloc: number; cumAct: number; cumPct: number }[] = [];
    if (isAll) {
      const companyIds = [...new Set(allocs.map((a) => a.companyId))];
      perCompany = companyIds.map((cid) => {
        const cName = companies.find((c) => c.id === cid)?.name ?? cid;
        const tAlloc = todayAllocs.filter((a) => a.companyId === cid).reduce((s, a) => s + a.allocated, 0);
        const companySoldiers = soldiers.filter((s) => s.companyId === cid);
        let tAct = 0;
        for (const s of companySoldiers) {
          const st = getStatus(s.id, today);
          if (st && presentStatusIds.has(st)) tAct++;
        }
        const cAlloc = allocs.filter((a) => a.companyId === cid).reduce((s, a) => s + a.allocated, 0);
        const cDates = [...new Set(allocs.filter((a) => a.companyId === cid).map((a) => a.date))];
        let cAct = 0;
        for (const d of cDates) {
          for (const s of companySoldiers) {
            const st = getStatus(s.id, d);
            if (st && presentStatusIds.has(st)) cAct++;
          }
        }
        return {
          name: cName,
          todayAlloc: tAlloc,
          todayAct: tAct,
          todayPct: tAlloc > 0 ? Math.round((tAct / tAlloc) * 100) : 0,
          cumAlloc: cAlloc,
          cumAct: cAct,
          cumPct: cAlloc > 0 ? Math.round((cAct / cAlloc) * 100) : 0,
        };
      });
    }

    return { todayAllocatedTotal, todayActualTotal, todayPct, cumulativeAllocated, cumulativeActual, cumulativePct, perCompany };
  }, [selectedEmployment, filteredSoldiers, soldiers, statuses, getStatus, today, selectedCompanyId, companies]);

  // Daily summary: count present soldiers per day
  const dailySummary = useMemo(() => {
    return days.map((d) => {
      let present = 0;
      let marked = 0;
      for (const s of filteredSoldiers) {
        const st = getStatus(s.id, d.date);
        if (st) {
          marked++;
          const status = statuses.find((x) => x.id === st);
          if (status?.isPresent) present++;
        }
      }
      return { date: d.date, present, marked, total: filteredSoldiers.length };
    });
  }, [days, soldiers, statuses, getStatus]);

  // Squad subtotals per day
  const squadDailySummary = useMemo(() => {
    const result = new Map<string, { present: number; total: number }[]>();
    for (const g of grouped) {
      const key = `${g.company?.id ?? "nc"}-${g.squad?.id ?? "ns"}`;
      const dayCounts = days.map((d) => {
        let present = 0;
        for (const s of g.soldiers) {
          const st = getStatus(s.id, d.date);
          if (st) {
            const status = statuses.find((x) => x.id === st);
            if (status?.isPresent) present++;
          }
        }
        return { present, total: g.soldiers.length };
      });
      result.set(key, dayCounts);
    }
    return result;
  }, [grouped, days, statuses, getStatus]);

  return (
    <>
      {/* בחירת תעסוקה + ניהול תקנים עברו למסך שליטת שלישות. כאן רק תכנון/דיווח נוכחות. */}
      {selectedEmployment && (
        <div className="flex items-center gap-2 mb-4 text-sm">
          <span className="inline-flex items-center gap-1.5 bg-indigo-50 text-indigo-700 rounded-lg px-3 py-1.5 font-medium">📊 תעסוקה: {selectedEmployment.name}</span>
        </div>
      )}

      {/* Mode toggle */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex rounded-xl overflow-hidden border-2 border-slate-200 text-sm font-bold">
          <a href={buildUrl({ mode: "plan" })}
            className={`px-5 py-2.5 flex items-center gap-2 transition-colors ${mode === "plan" ? "bg-blue-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>
            📝 תוכנית עבודה
          </a>
          <a href={buildUrl({ mode: "record" })}
            className={`px-5 py-2.5 flex items-center gap-2 transition-colors ${mode === "record" ? "bg-emerald-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>
            ✅ ביצוע בפועל
          </a>
        </div>
        <div className={`text-xs rounded-lg px-3 py-1.5 ${mode === "plan" ? "bg-blue-50 text-blue-700" : "bg-emerald-50 text-emerald-700"}`}>
          {mode === "plan" ? "מתכננים מראש את מצב הנוכחות" : "מדווחים על מצב בפועל"}
        </div>
        {mode === "record" && canManage && (
          <button onClick={copyPlanToActual} disabled={saving}
            className="text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-3 py-2 font-medium disabled:opacity-50"
            title="ממלא את הביצוע של היום לפי התכנון שהוגדר">
            📋 העתק תכנון → ביצוע (היום)
          </button>
        )}
      </div>

      {/* Dashboard */}
      <div className="flex items-center gap-3 flex-wrap mb-4">
        <div className="bg-white border border-slate-200 rounded-lg px-4 py-2 text-center">
          <div className="text-xl font-bold text-slate-800">{dashStats.all.total}</div>
          <div className="text-[10px] text-slate-500">סה״כ</div>
        </div>
        {statuses.map((st) => {
          const count = filteredSoldiers.filter((s) => getStatus(s.id, today) === st.id).length;
          if (count === 0) return null;
          return (
            <div key={st.id} className={`border rounded-lg px-3 py-2 text-center ${st.isPresent ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}>
              <div className={`text-lg font-bold ${st.isPresent ? "text-emerald-700" : "text-amber-700"}`}>{count}</div>
              <div className="text-[10px] text-slate-600">{st.icon ? `${st.icon} ` : ""}{st.name}</div>
            </div>
          );
        })}
        {dashStats.all.unmarked > 0 && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-center">
            <div className="text-lg font-bold text-slate-400">{dashStats.all.unmarked}</div>
            <div className="text-[10px] text-slate-500">לא סומנו</div>
          </div>
        )}
        {shmapStats.inShmap > 0 && (
          <div className="bg-purple-50 border border-purple-200 rounded-lg px-3 py-2 text-center">
            <div className="text-lg font-bold text-purple-700">{shmapStats.inShmap}</div>
            <div className="text-[10px] text-purple-600">בשמ״פ</div>
          </div>
        )}
        <div className="bg-teal-50 border border-teal-200 rounded-lg px-3 py-2 text-center">
          <div className="text-lg font-bold text-teal-700">{shmapStats.inEmployment}</div>
          <div className="text-[10px] text-teal-600">בתעסוקה</div>
        </div>
      </div>

      {/* Per-squad present/absent */}
      {dashStats.bySquad.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {dashStats.bySquad.map((sq) => (
            <div key={sq.squad?.id ?? "none"}
              className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs flex items-center gap-3 min-w-[130px]">
              <div>
                <div className="font-bold text-slate-700">{sq.squad?.name ?? "ללא מחלקה"}</div>
                {isAllCompanies && sq.company && <div className="text-[10px] text-slate-400">{sq.company.name}</div>}
              </div>
              <div className="mr-auto flex items-center gap-1.5">
                <span className="text-emerald-600 font-bold">{sq.present}✓</span>
                {sq.total - sq.present > 0 && <span className="text-amber-600 font-bold">{sq.total - sq.present}✗</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Employment execution dashboard */}
      {selectedEmployment && employmentDash && (
        <Card className="p-4 mb-4 border-2 border-indigo-200 bg-indigo-50/30">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-indigo-800">
              📊 תעסוקה: {selectedEmployment.name}
            </h3>
            <span className="text-xs text-slate-500">
              {selectedEmployment.startDate} — {selectedEmployment.endDate}
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
            <div className={`rounded-lg p-3 text-center border ${employmentDash.todayPct >= 90 ? "bg-emerald-50 border-emerald-200" : employmentDash.todayPct >= 70 ? "bg-amber-50 border-amber-200" : "bg-rose-50 border-rose-200"}`}>
              <div className={`text-2xl font-bold ${employmentDash.todayPct >= 90 ? "text-emerald-700" : employmentDash.todayPct >= 70 ? "text-amber-700" : "text-rose-700"}`}>
                {employmentDash.todayPct}%
              </div>
              <div className="text-[10px] text-slate-500">נוכחות היום</div>
              <div className="text-xs text-slate-600">{employmentDash.todayActualTotal} / {employmentDash.todayAllocatedTotal}</div>
            </div>
            <div className={`rounded-lg p-3 text-center border ${employmentDash.cumulativePct >= 90 ? "bg-emerald-50 border-emerald-200" : employmentDash.cumulativePct >= 70 ? "bg-amber-50 border-amber-200" : "bg-rose-50 border-rose-200"}`}>
              <div className={`text-2xl font-bold ${employmentDash.cumulativePct >= 90 ? "text-emerald-700" : employmentDash.cumulativePct >= 70 ? "text-amber-700" : "text-rose-700"}`}>
                {employmentDash.cumulativePct}%
              </div>
              <div className="text-[10px] text-slate-500">מצטבר</div>
              <div className="text-xs text-slate-600">{employmentDash.cumulativeActual} / {employmentDash.cumulativeAllocated} ימי מילואים</div>
            </div>
            <div className="rounded-lg p-3 text-center border bg-slate-50 border-slate-200">
              <div className="text-2xl font-bold text-slate-700">{selectedEmployment.totalDays}</div>
              <div className="text-[10px] text-slate-500">ימי מילואים מתוכננים</div>
            </div>
            <div className="rounded-lg p-3 text-center border bg-blue-50 border-blue-200">
              <div className="text-2xl font-bold text-blue-700">{employmentDash.cumulativeActual}</div>
              <div className="text-[10px] text-slate-500">ימי מילואים שנוצלו</div>
              <div className="text-xs text-slate-600">{selectedEmployment.totalDays > 0 ? Math.round((employmentDash.cumulativeActual / selectedEmployment.totalDays) * 100) : 0}% מהמכסה</div>
            </div>
          </div>
          {employmentDash.perCompany.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-slate-600 mb-2">פירוט לפי פלוגה</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {employmentDash.perCompany.map((co) => (
                  <div key={co.name} className={`rounded-lg p-3 border border-slate-200 ${co.cumPct >= 90 ? "bg-emerald-50" : co.cumPct >= 70 ? "bg-amber-50" : "bg-rose-50"}`}>
                    <div className="font-medium text-sm text-slate-800">{co.name}</div>
                    <div className="flex gap-4 mt-1 text-xs">
                      <span className={co.todayPct >= 90 ? "text-emerald-600" : co.todayPct >= 70 ? "text-amber-600" : "text-rose-600"}>
                        היום: {co.todayAct}/{co.todayAlloc} ({co.todayPct}%)
                      </span>
                      <span className={co.cumPct >= 90 ? "text-emerald-600" : co.cumPct >= 70 ? "text-amber-600" : "text-rose-600"}>
                        מצטבר: {co.cumAct}/{co.cumAlloc} ({co.cumPct}%)
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Link to daily report */}
          {selectedEmployment && (
            <div className="mt-3 flex items-center gap-3">
              <a
                href={`/attendance/daily-report?employmentId=${selectedEmployment.id}`}
                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition"
              >
                📊 דוח הצלבה יומי
              </a>
              <span className="text-xs text-slate-500">פירוט יומי מלא עם אפשרות ייצוא לאקסל</span>
            </div>
          )}
        </Card>
      )}

      {/* Controls */}
      <Card className="p-3 mb-4">
        <div className="flex items-center gap-3 flex-wrap">
          {companies.length > 1 && (
            <form method="GET" className="flex items-center gap-2">
              <input type="hidden" name="mode" value={mode} />
              <input type="hidden" name="start" value={startDate} />
              {selectedEmployment && <input type="hidden" name="employmentId" value={selectedEmployment.id} />}
              <label className="text-sm font-medium text-slate-700">פלוגה:</label>
              <select name="companyId" defaultValue={selectedCompanyId}
                onChange={(e) => (e.target.form as HTMLFormElement).submit()}
                className="rounded-lg border-2 border-slate-300 px-3 py-1.5 text-sm">
                <option value="__all__">כל הפלוגות</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </form>
          )}

          {squads.length > 0 && (
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-slate-700">מחלקה:</label>
              <select value={selectedSquadId}
                onChange={(e) => setSelectedSquadId(e.target.value)}
                className="rounded-lg border-2 border-slate-300 px-3 py-1.5 text-sm">
                <option value="">כל המחלקות</option>
                {squads.map((sq) => <option key={sq.id} value={sq.id}>{sq.name}</option>)}
              </select>
            </div>
          )}

          {companyRoles.length > 0 && (
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-slate-700">תפקיד:</label>
              <select value={selectedRoleId}
                onChange={(e) => setSelectedRoleId(e.target.value)}
                className="rounded-lg border-2 border-slate-300 px-3 py-1.5 text-sm">
                <option value="">כל התפקידים</option>
                <option value="__commander__">⭐ פיקודיים בלבד</option>
                {companyRoles.map((r) => <option key={r.id} value={r.id}>{r.isCommander ? `⭐ ${r.name}` : r.name}</option>)}
                <option value="__none__">ללא תפקיד</option>
              </select>
            </div>
          )}

          <label className={`flex items-center gap-1.5 text-sm font-medium rounded-lg border-2 px-3 py-1.5 cursor-pointer select-none ${onlyShmap ? "border-purple-400 bg-purple-50 text-purple-800" : "border-slate-300 text-slate-600 hover:bg-slate-50"}`}>
            <input type="checkbox" checked={onlyShmap} onChange={(e) => setOnlyShmap(e.target.checked)} className="accent-purple-600" />
            🟣 רק בשמ״פ
          </label>

          <div className="flex items-center gap-1 bg-slate-50 rounded-lg p-1 border border-slate-200">
            <button onClick={() => shiftDays(-7)} className="rounded bg-white border border-slate-200 px-2 py-1 text-xs hover:bg-slate-100 font-medium">◀ שבוע</button>
            <button onClick={() => shiftDays(-1)} className="rounded bg-white border border-slate-200 px-2 py-1 text-xs hover:bg-slate-100">◀ יום</button>
            <button onClick={() => {
              const t = new Date();
              const s = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
              router.push(buildUrl({ start: s }));
            }} className="rounded bg-blue-600 text-white px-3 py-1 text-xs font-bold hover:bg-blue-700">📅 היום</button>
            <button onClick={() => shiftDays(1)} className="rounded bg-white border border-slate-200 px-2 py-1 text-xs hover:bg-slate-100">יום ▶</button>
            <button onClick={() => shiftDays(7)} className="rounded bg-white border border-slate-200 px-2 py-1 text-xs hover:bg-slate-100 font-medium">שבוע ▶</button>
          </div>

          <div className="text-sm text-slate-600 mr-auto font-medium">{companyName}</div>

          {canManage && (
            <a href="/attendance-settings"
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 hover:text-slate-800 transition-colors font-medium">
              ⚙️ הגדרות נוכחות
            </a>
          )}
        </div>
      </Card>

      {/* Squad management */}
      {canManage && (
        <div className="mb-3">
          <button onClick={() => setShowSquadMgr(!showSquadMgr)}
            className="text-xs text-slate-500 hover:text-slate-700 mb-1">
            {showSquadMgr ? "▲ הסתר ניהול מחלקות" : "▼ ניהול מחלקות"}
          </button>
          {showSquadMgr && (
            <Card className="p-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-bold text-slate-700">🪖 מחלקות — {companyName}</h3>
              </div>
              {squadError && (
                <div className="bg-rose-50 text-rose-700 rounded px-2 py-1 text-xs mb-2">{squadError}
                  <button onClick={() => setSquadError(null)} className="mr-2 text-rose-400">✕</button>
                </div>
              )}
              <div className="flex flex-wrap gap-2 mb-2">
                {squads.map((sq) => (
                  <span key={sq.id} className="inline-flex items-center gap-1 bg-slate-100 rounded-lg px-2 py-1 text-xs">
                    {sq.name}
                    <button onClick={async () => {
                      if (!confirm(`למחוק את "${sq.name}"?`)) return;
                      const res = await deleteSquad(sq.id);
                      if (res?.error) { setSquadError(res.error); return; }
                      router.refresh();
                    }} className="text-rose-400 hover:text-rose-600 text-[10px]">✕</button>
                  </span>
                ))}
                {squads.length === 0 && <span className="text-xs text-slate-400">אין מחלקות</span>}
              </div>
              <div className="flex gap-2 items-center">
                <input value={newSquadName} onChange={(e) => setNewSquadName(e.target.value)}
                  placeholder="שם מחלקה חדשה" className="rounded border border-slate-300 px-2 py-1 text-sm flex-1 max-w-48" />
                <button disabled={squadSaving || !newSquadName.trim()} onClick={async () => {
                  setSquadSaving(true); setSquadError(null);
                  const fd = new FormData();
                  fd.append("companyId", selectedCompanyId);
                  fd.append("name", newSquadName.trim());
                  fd.append("sortOrder", String(squads.length));
                  const res = await upsertSquad(fd);
                  setSquadSaving(false);
                  if (res?.error) { setSquadError(res.error); return; }
                  setNewSquadName("");
                  router.refresh();
                }} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded px-3 py-1 text-xs disabled:opacity-50">
                  ＋ הוסף
                </button>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-1.5 mb-3 bg-white rounded-lg border border-slate-200 px-3 py-2">
        <span className="text-[10px] text-slate-500 font-bold ml-2 self-center">מקרא:</span>
        {statuses.map((s) => (
          <span key={s.id} className="inline-flex items-center gap-1 text-[11px] rounded-lg px-2 py-1 font-medium"
            style={{ backgroundColor: s.color + "18", color: s.color, border: `1px solid ${s.color}40` }}>
            <span className="text-sm">{s.icon}</span> {s.name}
          </span>
        ))}
        <span className="inline-flex items-center gap-1 text-[11px] rounded-lg px-2 py-1 font-medium bg-slate-100 text-slate-500 border border-slate-200" title={'ימים שהחייל אינו בשמ"פ פעיל — נעול, שינוי רק ע"י שלישות'}>
          <span className="text-sm">⊘</span> לא בשמ״פ
        </span>
      </div>

      {/* Matrix */}
      <Card className="overflow-auto max-h-[70vh]">
        <table className="text-[11px] border-collapse w-full" onClick={() => setCtxMenu(null)}>
          <thead className="sticky top-0 z-30">
            <tr className="bg-slate-50">
              <th className="sticky right-0 bg-slate-50 z-40 text-right px-2 py-1 min-w-[140px] border-b border-slate-200" rowSpan={3}>חייל</th>
              {days.map((d) => (
                <th key={d.date + "-dow"} className={`text-center px-0.5 py-0.5 font-medium min-w-[32px] ${d.isShabbat ? "text-blue-600" : d.isHoliday ? "text-rose-600" : "text-slate-500"}`}>
                  {d.dayLabel}
                </th>
              ))}
            </tr>
            <tr className="bg-slate-50">
              {days.map((d) => (
                <th key={d.date + "-greg"} className={`text-center px-0.5 py-0.5 font-mono font-bold ${d.date === today ? "bg-blue-100 text-blue-800" : d.isShabbat || d.isHoliday ? "text-slate-400" : "text-slate-700"}`}>
                  {d.gregDay}
                </th>
              ))}
            </tr>
            <tr className="bg-slate-50 border-b-2 border-slate-200">
              {days.map((d) => (
                <th key={d.date + "-heb"} className="text-center px-0 py-0.5 text-[9px] text-slate-400 font-normal whitespace-nowrap" title={d.holiday ?? undefined}>
                  {d.holiday ? <span className="text-rose-500 font-bold" title={d.holiday}>{d.holiday.slice(0, 4)}</span> : d.hebrewDate.split(" ")[0]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grouped.map((g, gi) => {
              const groupKey = `${g.company?.id ?? "nc"}-${g.squad?.id ?? "ns"}`;
              const squadDays = squadDailySummary.get(groupKey);
              const showCompanyHeader = isAllCompanies && g.company && (gi === 0 || grouped[gi - 1].company?.id !== g.company.id);
              return (
                <React.Fragment key={groupKey}>
                  {showCompanyHeader && (
                    <tr>
                      <td className="sticky right-0 bg-blue-100 z-10 px-2 py-2 font-bold text-xs text-blue-800 border-t-2 border-blue-300" colSpan={1}>
                        🏢 {g.company!.name}
                      </td>
                      {days.map((d) => (
                        <td key={d.date} className="bg-blue-100 border-t-2 border-blue-300" />
                      ))}
                    </tr>
                  )}
                  {g.squad && (
                    <tr key={`sq-${g.squad.id}`}>
                      <td className="sticky right-0 bg-slate-100 z-10 px-2 py-1.5 font-bold text-[11px] text-slate-700 border-t-2 border-slate-300">
                        🪖 {g.squad.name} <span className="font-normal text-slate-400">({g.soldiers.length})</span>
                      </td>
                      {squadDays?.map((sc, i) => (
                        <td key={days[i].date} className={`text-center text-[10px] font-bold border-t-2 border-slate-300 ${days[i].date === today ? "bg-blue-50" : "bg-slate-100"} ${sc.present === sc.total && sc.total > 0 ? "text-emerald-600" : sc.present === 0 && sc.total > 0 ? "text-rose-400" : "text-slate-400"}`}>
                          {sc.present > 0 || sc.total > 0 ? `${sc.present}` : ""}
                        </td>
                      ))}
                    </tr>
                  )}
                  {!g.squad && g.soldiers.length > 0 && grouped.length > 1 && (
                    <tr>
                      <td className="sticky right-0 bg-slate-100 z-10 px-2 py-1.5 font-bold text-[11px] text-slate-500 border-t-2 border-slate-300">
                        ללא מחלקה <span className="font-normal text-slate-400">({g.soldiers.length})</span>
                      </td>
                      {squadDays?.map((sc, i) => (
                        <td key={days[i].date} className={`text-center text-[10px] font-bold border-t-2 border-slate-300 ${days[i].date === today ? "bg-blue-50" : "bg-slate-100"} text-slate-400`}>
                          {sc.present > 0 ? `${sc.present}` : ""}
                        </td>
                      ))}
                    </tr>
                  )}
                  {g.soldiers.map((soldier) => {
                    const isDischarged = !!soldier.callupClosedAt && soldier.callupClosedAt < today;
                    const activeCallup = getActiveCallup(soldier.id);
                    const hasShmap = !!activeCallup;
                    return (
                    <tr key={soldier.id} className={`border-b border-slate-50 ${isDischarged ? "opacity-50" : "hover:bg-blue-50/20"}`}>
                      <td className={`sticky right-0 z-10 px-2 py-1.5 border-l border-slate-100 ${isDischarged ? "bg-slate-100" : hasShmap ? "bg-purple-50" : "bg-white"}`}>
                        <div className={`font-medium truncate max-w-[160px] ${isDischarged ? "text-slate-400 line-through" : "text-slate-800"}`}>
                          {soldier.fullName}
                          {soldier.companyRoleName && (
                            <span className={`mr-1 text-[9px] font-normal ${soldier.isCommander ? "text-amber-600" : "text-slate-400"}`}>
                              ({soldier.companyRoleName})
                            </span>
                          )}
                          {isDischarged && <span className="mr-1 text-[9px] text-rose-400">שוחרר</span>}
                          {hasShmap && <span className="mr-1 text-[9px] bg-purple-100 text-purple-700 rounded px-1">בשמ״פ</span>}
                        </div>
                        <div className="flex items-center gap-1">
                          {soldier.personalNumber && (
                            <button
                              onClick={() => copyPn(soldier.personalNumber!)}
                              title="העתק מספר אישי"
                              className={`text-[9px] font-mono rounded px-1 flex items-center gap-0.5 transition-colors ${copiedPn === soldier.personalNumber ? "bg-emerald-100 text-emerald-700" : "text-slate-400 hover:bg-slate-100 hover:text-slate-600"}`}
                            >
                              {copiedPn === soldier.personalNumber ? "✓ הועתק" : <>{soldier.personalNumber} 📋</>}
                            </button>
                          )}
                          {canManage && !isDischarged && (
                            <button
                              onClick={() => {
                                setCallupDate(today);
                                setShowCallupModal({ soldierId: soldier.id, soldierName: soldier.fullName });
                              }}
                              className={`text-[9px] px-1 rounded ${hasShmap ? "bg-purple-200 text-purple-800 hover:bg-purple-300" : "text-purple-400 hover:text-purple-600"}`}
                              title={hasShmap ? "ניהול שמ\"פ" : "פתח שמ\"פ"}
                            >
                              {hasShmap ? "🟣" : "⊕"}
                            </button>
                          )}
                        </div>
                      </td>
                      {days.map((d) => {
                        const afterDischarge = isDischarged && d.date > soldier.callupClosedAt!;
                        const future = isFuture(d.date);
                        const locked = isShmapLocked(soldier.id, d.date);
                        const inShmapDay = isInShmap(soldier.id, d.date);
                        const outside = isOutsideShmap(soldier.id, d.date);   // חייל-שמ"פ ביום שאינו פעיל
                        const noShmap = isNoShmapLocked(soldier.id, d.date);  // נעול למי שאינו שלישות
                        const statusId = getStatus(soldier.id, d.date);
                        const status = statusId ? statuses.find((s) => s.id === statusId) : null;
                        const isPending = pendingChanges.has(`${soldier.id}:${d.date}`);
                        const isWeekend = d.isShabbat || d.isHoliday;
                        const blocked = afterDischarge || locked || future || noShmap;
                        return (
                          <td
                            key={d.date}
                            onClick={() => !blocked && cycleStatus(soldier.id, d.date)}
                            onContextMenu={(e) => !blocked && handleContextMenu(e, soldier.id, d.date)}
                            className={`text-center select-none transition-colors border-l border-slate-50
                              ${blocked ? "cursor-not-allowed" : "cursor-pointer hover:bg-slate-100"}
                              ${future ? "bg-slate-100/70 opacity-40" : locked ? "bg-purple-100/60" : afterDischarge ? "bg-slate-200/50" : outside ? "bg-slate-100/70" : ""}
                              ${inShmapDay && !locked && !future ? "bg-purple-50/40" : ""}
                              ${d.date === today && !afterDischarge && !locked && !outside ? "bg-blue-50" : isWeekend && !afterDischarge && !locked && !future && !outside ? "bg-slate-50/50" : ""}
                              ${isPending ? "ring-2 ring-inset ring-amber-400" : ""}`}
                            title={future ? `יום עתידי — לא ניתן לדווח (דיווח רק על היום הנוכחי)` : afterDischarge ? `${soldier.fullName} — שוחרר` : locked ? `${soldier.fullName} — נעול (שמ"פ סגור)` : outside ? `${soldier.fullName} — לא בשמ"פ — ${d.date}${isPersonnel ? " · לחץ לשינוי (שלישות)" : " · נעול — שינוי רק ע\"י שלישות"}${status ? ` — ${status.name}` : ""}` : inShmapDay ? `${soldier.fullName} — בשמ"פ — ${d.date}${status ? ` — ${status.name}` : ""}` : `${soldier.fullName} — ${d.date}${status ? ` — ${status.name}` : ""}`}
                          >
                            {afterDischarge ? (
                              <span className="text-slate-300 text-[9px]">—</span>
                            ) : locked ? (
                              <span className="text-purple-400 text-[9px]">🔒</span>
                            ) : status ? (
                              <span className="text-base md:text-sm leading-none" style={{ color: status.color }}
                                title={status.name}>
                                {status.icon || "●"}
                              </span>
                            ) : outside ? (
                              <span className="text-slate-400 text-[11px] leading-none" title="לא בשמ&quot;פ">⊘</span>
                            ) : (
                              <span className="text-slate-200">·</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </tbody>
          {/* Daily summary footer */}
          <tfoot>
            <tr className="border-t-2 border-slate-300 bg-emerald-50">
              <td className="sticky right-0 bg-emerald-50 z-10 px-2 py-2 font-bold text-xs text-emerald-800">
                סה״כ נוכחים
              </td>
              {dailySummary.map((ds) => {
                const pct = ds.total > 0 ? Math.round((ds.present / ds.total) * 100) : 0;
                return (
                  <td key={ds.date} className={`text-center font-bold text-xs py-2 ${ds.date === today ? "bg-emerald-100" : ""}`}>
                    <div className={`${pct >= 80 ? "text-emerald-700" : pct >= 50 ? "text-amber-600" : "text-rose-600"}`}>
                      {ds.present}
                    </div>
                    <div className="text-[9px] text-slate-400 font-normal">/{ds.total}</div>
                  </td>
                );
              })}
            </tr>
            <tr className="bg-slate-50">
              <td className="sticky right-0 bg-slate-50 z-10 px-2 py-1 text-[10px] text-slate-500">
                % נוכחות
              </td>
              {dailySummary.map((ds) => {
                const pct = ds.total > 0 ? Math.round((ds.present / ds.total) * 100) : 0;
                return (
                  <td key={ds.date} className={`text-center text-[10px] font-bold py-1 ${ds.date === today ? "bg-blue-50" : ""} ${pct >= 80 ? "text-emerald-600" : pct >= 50 ? "text-amber-600" : "text-rose-500"}`}>
                    {ds.marked > 0 ? `${pct}%` : "—"}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        </table>
      </Card>

      {/* Context menu */}
      {ctxMenu && (
        <div
          className="fixed z-50 bg-white shadow-xl rounded-lg border border-slate-200 py-1 min-w-[120px]"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
        >
          {statuses.map((s) => (
            <button key={s.id} onClick={() => {
              setStatusDirectly(ctxMenu.soldierId, ctxMenu.date, s.id);
              setCtxMenu(null);
            }} className="w-full text-right px-3 py-1.5 text-xs hover:bg-slate-100 flex items-center gap-1.5">
              <span style={{ color: s.color }}>{s.icon || "●"}</span> {s.name}
            </button>
          ))}
          <hr className="my-1 border-slate-200" />
          <button onClick={() => {
            setStatusDirectly(ctxMenu.soldierId, ctxMenu.date, null);
            setCtxMenu(null);
          }} className="w-full text-right px-3 py-1.5 text-xs hover:bg-slate-100 text-slate-500">
            ✕ נקה
          </button>
        </div>
      )}

      {/* Save bar */}
      {pendingChanges.size > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 bg-blue-700 text-white rounded-xl shadow-2xl px-6 py-3 flex items-center gap-4">
          <span className="text-sm">{pendingChanges.size} שינויים ממתינים</span>
          <button onClick={handleSave} disabled={saving}
            className="bg-white text-blue-700 font-bold rounded-lg px-4 py-1.5 text-sm hover:bg-blue-50 disabled:opacity-50">
            {saving ? "שומר..." : "💾 שמור"}
          </button>
          <button onClick={() => setPendingChanges(new Map())}
            className="text-blue-200 hover:text-white text-sm">
            ביטול
          </button>
        </div>
      )}

      {/* שמ"פ Modal */}
      {showCallupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setShowCallupModal(null)}>
          <div className="bg-white rounded-xl shadow-2xl p-6 min-w-[340px] max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-slate-800 mb-3">🟣 שמ״פ — {showCallupModal.soldierName}</h3>

            {/* Active callup */}
            {(() => {
              const active = getActiveCallup(showCallupModal.soldierId);
              if (active) return (
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 mb-3">
                  <div className="text-sm font-medium text-purple-800">שמ״פ פתוח</div>
                  <div className="text-xs text-purple-600 mt-1">מתאריך: {active.startDate}</div>
                  <div className="flex items-center gap-2 mt-2">
                    <input type="date" value={callupDate} onChange={(e) => setCallupDate(e.target.value)}
                      className="rounded border border-purple-300 px-2 py-1 text-sm flex-1" />
                    <button
                      disabled={callupSaving || !callupDate}
                      onClick={async () => {
                        setCallupSaving(true);
                        const res = await closeCallup(active.id, callupDate);
                        setCallupSaving(false);
                        if (res.error) alert(res.error);
                        else { setShowCallupModal(null); router.refresh(); }
                      }}
                      className="bg-purple-600 text-white rounded px-3 py-1 text-xs hover:bg-purple-700 disabled:opacity-50"
                    >
                      {callupSaving ? "..." : "סגור שמ\"פ"}
                    </button>
                  </div>
                  <button
                    onClick={async () => {
                      if (!confirm("למחוק את תקופת השמ\"פ?")) return;
                      setCallupSaving(true);
                      const res = await deleteCallup(active.id);
                      setCallupSaving(false);
                      if (res.error) alert(res.error);
                      else { setShowCallupModal(null); router.refresh(); }
                    }}
                    className="text-[10px] text-rose-400 hover:text-rose-600 mt-2"
                  >
                    מחק תקופה
                  </button>
                </div>
              );
              return (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-3">
                  <div className="text-sm text-slate-600">אין שמ״פ פתוח</div>
                  <div className="flex items-center gap-2 mt-2">
                    <input type="date" value={callupDate} onChange={(e) => setCallupDate(e.target.value)}
                      className="rounded border border-slate-300 px-2 py-1 text-sm flex-1" />
                    <button
                      disabled={callupSaving || !callupDate}
                      onClick={async () => {
                        setCallupSaving(true);
                        const res = await openCallup(showCallupModal.soldierId, callupDate);
                        setCallupSaving(false);
                        if (res.error) alert(res.error);
                        else { setShowCallupModal(null); router.refresh(); }
                      }}
                      className="bg-purple-600 text-white rounded px-3 py-1 text-xs hover:bg-purple-700 disabled:opacity-50"
                    >
                      {callupSaving ? "..." : "פתח שמ\"פ"}
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* History */}
            {(() => {
              const periods = callupMap.get(showCallupModal.soldierId)?.filter((p) => p.endDate) ?? [];
              if (periods.length === 0) return null;
              return (
                <div className="mt-3">
                  <h4 className="text-xs font-semibold text-slate-600 mb-1">היסטוריית שמ״פ</h4>
                  <div className="space-y-1 max-h-32 overflow-auto">
                    {periods.map((p) => (
                      <div key={p.id} className="flex items-center justify-between bg-slate-50 rounded px-2 py-1 text-xs">
                        <span className="text-slate-600">{p.startDate} — {p.endDate}</span>
                        <button onClick={async () => {
                          if (!confirm("למחוק?")) return;
                          await deleteCallup(p.id);
                          router.refresh();
                        }} className="text-rose-400 hover:text-rose-600 text-[10px]">✕</button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            <button onClick={() => setShowCallupModal(null)} className="mt-4 w-full text-center text-sm text-slate-500 hover:text-slate-700">
              סגור
            </button>
          </div>
        </div>
      )}
    </>
  );
}
