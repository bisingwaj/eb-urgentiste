import type {
  CaseStatus,
  EmergencyCase,
  UrgencyLevel,
} from '../screens/hospital/hospitalTypes';

/** Aligné sur la liste Admissions — dossiers actifs à la structure. */
export const ACTIVE_ADMISSION_STATUSES: readonly CaseStatus[] = [
  'admis',
  'triage',
  'prise_en_charge',
  'en_cours',
  'monitoring',
];

/**
 * Fermeture alignée sur le mapping dispatch / `hospital_data.status` :
 * un dispatch `completed` peut encore correspondre à un statut clinique actif
 * (voir `resolveCaseStatusFromRow` dans hospitalCaseMapping).
 */
export function isCaseClosed(c: EmergencyCase): boolean {
  if (c.status === 'termine') return true;
  if (c.dispatchStatus === 'cancelled') return true;
  if (c.dispatchStatus === 'completed') {
    return !ACTIVE_ADMISSION_STATUSES.includes(c.status);
  }
  return false;
}

export function countPendingHospital(cases: EmergencyCase[]): number {
  return cases.filter((c) => c.hospitalStatus === 'pending').length;
}

export function countCriticalOpen(cases: EmergencyCase[]): number {
  return cases.filter((c) => c.level === 'critique' && !isCaseClosed(c)).length;
}

export function countActiveAdmissions(cases: EmergencyCase[]): number {
  return cases.filter(
    (c) =>
      !isCaseClosed(c) && ACTIVE_ADMISSION_STATUSES.includes(c.status),
  ).length;
}

/** Dossiers réellement clos côté hôpital (exclut completed + statut encore actif). */
export function filterPastCases(cases: EmergencyCase[]): EmergencyCase[] {
  return cases.filter(
    (c) =>
      (c.dispatchStatus === 'completed' || c.dispatchStatus === 'cancelled') &&
      isCaseClosed(c),
  );
}

export function formatDurationMinutes(
  created?: string,
  completed?: string,
): number | null {
  if (!created || !completed) return null;
  const a = new Date(created).getTime();
  const b = new Date(completed).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return null;
  return Math.round((b - a) / 60000);
}

export type Rolling30dKpis = {
  total: number;
  avgMin: number | null;
  tauxGuerison: number;
  tauxDeces: number;
};

/**
 * KPIs sur les dispatches **complétés** dans les 30 derniers jours glissants.
 */
export function computeRolling30dKpis(
  pastCases: EmergencyCase[],
): Rolling30dKpis {
  const now = Date.now();
  const monthMs = 30 * 24 * 60 * 60 * 1000;
  const completed = pastCases.filter((c) => c.dispatchStatus === 'completed');
  const inMonth = completed.filter((c) => {
    if (!c.completedAt) return false;
    return now - new Date(c.completedAt).getTime() <= monthMs;
  });
  const total = inMonth.length;
  const durations = inMonth
    .map((c) => formatDurationMinutes(c.dispatchCreatedAt, c.completedAt))
    .filter((n): n is number => n != null);
  const avgMin =
    durations.length > 0
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : null;
  const guerisons = inMonth.filter((c) => c.dischargeType === 'guerison').length;
  const tauxGuerison = total > 0 ? Math.round((guerisons / total) * 100) : 0;
  const deces = inMonth.filter((c) => c.dischargeType === 'deces').length;
  const tauxDeces = total > 0 ? Math.round((deces / total) * 100) : 0;
  return { total, avgMin, tauxGuerison, tauxDeces };
}

export function countByLevelOpen(
  cases: EmergencyCase[],
): Record<UrgencyLevel, number> {
  const open = cases.filter((c) => !isCaseClosed(c));
  return {
    critique: open.filter((c) => c.level === 'critique').length,
    urgent: open.filter((c) => c.level === 'urgent').length,
    stable: open.filter((c) => c.level === 'stable').length,
  };
}

/** Dossiers encore ouverts, par statut métier (pour répartition UI). */
export function countByCaseStatusOpen(
  cases: EmergencyCase[],
): Partial<Record<CaseStatus, number>> {
  const open = cases.filter((c) => !isCaseClosed(c));
  const map: Partial<Record<CaseStatus, number>> = {};
  for (const c of open) {
    map[c.status] = (map[c.status] ?? 0) + 1;
  }
  return map;
}
