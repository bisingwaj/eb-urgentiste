import type { Mission } from "../hooks/useActiveMission";
import { formatIncidentType } from "./missionAddress";

/** Horodatage principal pour tri / filtre historique (missions terminées). */
export function getMissionSortTime(m: Mission): Date {
  const raw = m.completed_at ?? m.dispatched_at ?? m.created_at;
  return new Date(raw);
}

export function startOfDayLocal(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function endOfDayLocal(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

/** Lundi 00:00:00 local (semaine ISO-style lundi–dimanche). */
export function startOfWeekMondayLocal(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Dimanche 23:59:59.999 local. */
export function endOfWeekSundayLocal(d: Date): Date {
  const start = startOfWeekMondayLocal(d);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

function missionMatchesNameQuery(m: Mission, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  const hay = [
    m.caller?.name,
    m.reference,
    m.title,
    formatIncidentType(m.type),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(s);
}

function missionMatchesPeriod(
  m: Mission,
  mode: "all" | "day" | "week" | "range",
  anchor: Date,
  rangeStart: Date,
  rangeEnd: Date
): boolean {
  const t = getMissionSortTime(m);
  if (mode === "all") return true;
  if (mode === "day") {
    const d0 = startOfDayLocal(anchor);
    const d1 = endOfDayLocal(anchor);
    return t >= d0 && t <= d1;
  }
  if (mode === "week") {
    const ws = startOfWeekMondayLocal(anchor);
    const we = endOfWeekSundayLocal(anchor);
    return t >= ws && t <= we;
  }
  if (mode === "range") {
    const a = startOfDayLocal(rangeStart);
    const b = endOfDayLocal(rangeEnd);
    const lo = Math.min(a.getTime(), b.getTime());
    const hi = Math.max(a.getTime(), b.getTime());
    return t.getTime() >= lo && t.getTime() <= hi;
  }
  return true;
}

function hourInRange(h: number, minH: number, maxH: number): boolean {
  if (minH <= maxH) return h >= minH && h <= maxH;
  return h >= minH || h <= maxH;
}

function missionMatchesHourRange(
  m: Mission,
  useHourFilter: boolean,
  hourMin: number,
  hourMax: number
): boolean {
  if (!useHourFilter) return true;
  const t = getMissionSortTime(m);
  return hourInRange(t.getHours(), hourMin, hourMax);
}

export type MissionHistoryFilterOptions = {
  nameQuery: string;
  periodMode: "all" | "day" | "week" | "range";
  anchorDate: Date;
  rangeStart: Date;
  rangeEnd: Date;
  useHourFilter: boolean;
  hourMin: number;
  hourMax: number;
};

export function filterMissionHistory(
  missions: Mission[],
  opts: MissionHistoryFilterOptions
): Mission[] {
  return missions.filter((m) => {
    if (!missionMatchesNameQuery(m, opts.nameQuery)) return false;
    if (
      !missionMatchesPeriod(
        m,
        opts.periodMode,
        opts.anchorDate,
        opts.rangeStart,
        opts.rangeEnd
      )
    )
      return false;
    if (
      !missionMatchesHourRange(
        m,
        opts.useHourFilter,
        opts.hourMin,
        opts.hourMax
      )
    )
      return false;
    return true;
  });
}
