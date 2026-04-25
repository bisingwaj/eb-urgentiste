import type { EmergencyCase, LovableDischargeType } from "../screens/hospital/hospitalTypes";

export type { LovableDischargeType };

/** Mappe les clés UI clôture vers les valeurs Lovable (`hospital_data.dischargeType`) */
export function outcomeKeyToDischargeType(outcome: string): LovableDischargeType {
  if (outcome === 'hospitalise') return 'transfert';
  if (outcome === 'decede') return 'deces';
  if (outcome === 'sorti') return 'guerison';
  return 'guerison';
}

/** Payload `report_data` pour `hospital_reports` (contrat Lovable) */
export function buildHospitalReportPayload(caseData: EmergencyCase): Record<string, unknown> {
  const dischargeType = caseData.dischargeType;
  const outcomeType =
    dischargeType ??
    (caseData.outcome === 'hospitalise'
      ? 'transfert'
      : caseData.outcome === 'decede'
        ? 'deces'
        : 'guerison');

  const vitals = caseData.vitals;
  const vitalsFlat: Record<string, unknown> = {};
  if (vitals) {
    const v = vitals as Record<string, unknown>;
    const bp = (v.bloodPressure ?? v.tension) as string | undefined;
    if (bp != null && String(bp).trim()) vitalsFlat.bloodPressure = String(bp).trim();

    const num = (x: unknown): number | undefined => {
      if (x === undefined || x === null || x === '') return undefined;
      const n = typeof x === 'number' ? x : Number(String(x).replace(',', '.'));
      return Number.isFinite(n) ? n : undefined;
    };
    const hr = num(v.heartRate);
    if (hr !== undefined) vitalsFlat.heartRate = hr;
    const t = num(v.temperature);
    if (t !== undefined) vitalsFlat.temperature = t;
    const sp = num(v.spO2 ?? v.satO2);
    if (sp !== undefined) vitalsFlat.spO2 = sp;
    const rr = num(v.respiratoryRate);
    if (rr !== undefined) vitalsFlat.respiratoryRate = rr;
    const g = num(v.glasgowScore);
    if (g !== undefined) vitalsFlat.glasgowScore = g;
    const p = num(v.painScore);
    if (p !== undefined) vitalsFlat.painScore = p;
    const w = num(v.weight);
    if (w !== undefined) vitalsFlat.weight = w;
  }

  const timelineFromCase = (): unknown[] => {
    if (Array.isArray(caseData.timeline) && caseData.timeline.length > 0) {
      return caseData.timeline as unknown[];
    }
    if (Array.isArray(caseData.interventions) && caseData.interventions.length > 0) {
      return caseData.interventions.map((i) => ({
        time: i.time,
        action: i.detail || i.category,
        type: i.type || 'action',
      }));
    }
    return [];
  };

  return {
    patientName: caseData.victimName,
    patientAge: caseData.age,
    patientPhone: caseData.callerPhone ?? '',
    admissionDate: caseData.arrivalTime
      ? `${new Date().toISOString().slice(0, 10)}T${caseData.arrivalTime}:00`
      : undefined,
    dischargeDate: caseData.dischargedAt ?? new Date().toISOString(),
    triageLevel: caseData.triageLevel || '',
    provisionalDiagnosis: caseData.provisionalDiagnosis || '',
    finalDiagnosis: caseData.finalDiagnosis || '',
    treatmentsSummary: caseData.pecTreatmentSummary || '',
    outcomeType,
    outcomeNotes: typeof caseData.finalDiagnosis === 'string' ? caseData.finalDiagnosis : '',
    vitalsOnAdmission: vitalsFlat,
    vitalsOnDischarge: vitalsFlat,
    timeline: timelineFromCase(),
    monitoringNotes: caseData.monitoringNotes,
    transferTarget: caseData.transferTarget,
    incidentReference: caseData.incidentReference,
    dispatchId: caseData.id,
  };
}
