import type {
  EmergencyCase,
  CaseStatus,
  UrgencyLevel,
  MonitoringPatientStatus,
  LovableDischargeType,
} from '../screens/hospital/HospitalDashboardTab';

function toNullableNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
}

function ageFromDateOfBirth(dob: string | undefined): number | null {
  if (!dob || typeof dob !== 'string') return null;
  const d = new Date(dob.trim());
  if (Number.isNaN(d.getTime())) return null;
  const t = new Date();
  let age = t.getFullYear() - d.getFullYear();
  const m = t.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < d.getDate())) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

const CASE_STATUS_VALUES: readonly CaseStatus[] = [
  'en_attente',
  'en_cours',
  'admis',
  'triage',
  'prise_en_charge',
  'monitoring',
  'termine',
];

const MONITORING_STATUS_VALUES: readonly MonitoringPatientStatus[] = ['amelioration', 'stable', 'degradation'];

function parseMonitoringStatus(v: unknown): MonitoringPatientStatus | undefined {
  return typeof v === 'string' && (MONITORING_STATUS_VALUES as readonly string[]).includes(v)
    ? (v as MonitoringPatientStatus)
    : undefined;
}

function isCaseStatus(s: unknown): s is CaseStatus {
  return typeof s === 'string' && (CASE_STATUS_VALUES as readonly string[]).includes(s);
}

export function resolveCaseStatusFromRow(d: { status?: string }, hData: { status?: unknown }): CaseStatus {
  const ds = d.status;
  if (ds === 'completed') {
    if (isCaseStatus(hData.status)) return hData.status;
    return 'handedOver';
  }
  if (ds === 'arrived_hospital') {
    if (isCaseStatus(hData.status)) return hData.status;
    return 'arrived';
  }
  if (ds === 'dispatched' || ds === 'en_route' || ds === 'on_scene') return 'en_attente';
  if (ds === 'en_route_hospital') return 'en_cours';
  if (isCaseStatus(hData.status)) return hData.status;
  return 'en_attente';
}

/** Lovable + anciennes valeurs → `outcome` UI */
export function dischargeTypeToLegacyOutcome(dischargeType: unknown): string | undefined {
  if (typeof dischargeType !== 'string') return undefined;
  const m: Record<string, string> = {
    hospitalisation: 'hospitalise',
    transfert: 'hospitalise',
    sortie: 'sorti',
    deces: 'decede',
    guerison: 'sorti',
    sortie_contre_avis: 'sorti',
  };
  return m[dischargeType];
}

function parseLovableDischargeType(v: unknown): LovableDischargeType | undefined {
  if (v !== 'guerison' && v !== 'transfert' && v !== 'deces' && v !== 'sortie_contre_avis') return undefined;
  return v;
}

function capitalizeName(name: string): string {
  if (!name) return 'Inconnu';
  return name
    .toLowerCase()
    .split(' ')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ');
}

/**
 * Mappe une ligne `dispatches` (+ embeds) vers `EmergencyCase`.
 * `unitPhoneByUnitId` : téléphone secouriste depuis `users_directory.assigned_unit_id`.
 */
export function mapDispatchRowToEmergencyCase(
  d: any,
  profileMap: Record<string, any>,
  responsesMap: Record<string, any[]>,
  unitPhoneByUnitId?: Record<string, string>
): EmergencyCase {
  const inc = d.incidents || {};
  const hData = d.hospital_data || {};
  const medicalAssessmentRaw = d.medical_assessment || {};

  const patientProfileRaw = inc.citizen_id ? profileMap[inc.citizen_id] : undefined;
  const patientProfile = patientProfileRaw
    ? {
        bloodType: patientProfileRaw.blood_type,
        allergies: patientProfileRaw.allergies,
        medicalHistory: patientProfileRaw.medical_history,
        medications: patientProfileRaw.medications,
        emergencyContactName: patientProfileRaw.emergency_contact_name,
        emergencyContactPhone: patientProfileRaw.emergency_contact_phone,
        dateOfBirth: patientProfileRaw.date_of_birth,
      }
    : undefined;

  const hDataAge = typeof hData.age === 'number' && hData.age > 0 ? hData.age : 0;
  const dobAge = patientProfile?.dateOfBirth ? ageFromDateOfBirth(patientProfile.dateOfBirth) : null;
  const resolvedAge = hDataAge > 0 ? hDataAge : dobAge ?? 0;

  const u = d.units || {};
  const unitCallsign = typeof u.callsign === 'string' && u.callsign.trim() ? u.callsign.trim() : 'Unité mobile';
  const unitPhoneRaw =
    u.phone != null && String(u.phone).trim()
      ? String(u.phone).trim()
      : d.unit_id && unitPhoneByUnitId?.[d.unit_id]
        ? unitPhoneByUnitId[d.unit_id]!
        : '';
  const unitPhone = unitPhoneRaw || undefined;

  const sosResponsesRaw = responsesMap[inc.id] || [];
  const gravityScore =
    sosResponsesRaw.reduce((acc: number, curr: any) => acc + (curr.gravity_score || 0), 0) || undefined;

  const dischargeTypeParsed =
    parseLovableDischargeType(hData.dischargeType) ??
    (hData.dischargeType === 'hospitalisation' ? 'transfert' : undefined) ??
    (hData.dischargeType === 'sortie' ? 'guerison' : undefined) ??
    (hData.dischargeType === 'deces' ? 'deces' : undefined);

  return {
    id: d.id,
    dispatchStatus: typeof d.status === 'string' ? d.status : undefined,
    completedAt: typeof d.completed_at === 'string' ? d.completed_at : undefined,
    dispatchCreatedAt: typeof d.created_at === 'string' ? d.created_at : undefined,
    incidentId: typeof inc.id === 'string' ? inc.id : undefined,
    victimName: capitalizeName(inc.caller_name || 'Inconnu'),
    age: resolvedAge,
    sex: hData.sex === 'M' || hData.sex === 'F' ? hData.sex : 'Inconnu',
    description: inc.description || '',
    level: (inc.priority === 'critical' ? 'critique' : inc.priority === 'high' ? 'urgent' : 'stable') as UrgencyLevel,
    urgentisteName: unitCallsign,
    urgentistePhone: unitPhoneRaw || '-',
    incidentReference: typeof inc.reference === 'string' ? inc.reference : undefined,
    callerPhone: inc.caller_phone != null && String(inc.caller_phone).trim() ? String(inc.caller_phone).trim() : undefined,
    unitPhone,
    unitVehicleType: typeof u.vehicle_type === 'string' ? u.vehicle_type : undefined,
    unitVehiclePlate: typeof u.vehicle_plate === 'string' ? u.vehicle_plate : undefined,
    unitAgentName: typeof u.agent_name === 'string' && u.agent_name.trim() ? u.agent_name.trim() : undefined,
    eta: '5 min',
    distance: '1.2 KM',
    status: resolveCaseStatusFromRow(d, hData),
    address: inc.location_address || '',
    timestamp: new Date(inc.created_at || d.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    typeUrgence: (inc.type || 'Inconnu').replace(/_/g, ' ').toUpperCase(),
    unitId: d.unit_id,
    assignedStructureLat: toNullableNumber(d.assigned_structure_lat) ?? undefined,
    assignedStructureLng: toNullableNumber(d.assigned_structure_lng) ?? undefined,
    assignedStructureName:
      typeof d.assigned_structure_name === 'string' && d.assigned_structure_name.trim()
        ? d.assigned_structure_name.trim()
        : undefined,

    hospitalStatus:
      d.hospital_status === 'pending' || d.hospital_status === 'accepted' || d.hospital_status === 'refused'
        ? d.hospital_status
        : 'pending',
    hospitalNotes: d.hospital_notes,
    hospitalRespondedAt: d.hospital_responded_at,
    patientProfile,
    sosResponses:
      sosResponsesRaw.length > 0
        ? sosResponsesRaw.map((r: any) => ({
            questionText: r.question_text,
            answer: r.answer,
            gravityScore: r.gravity_score,
            gravityLevel: r.gravity_level,
          }))
        : undefined,
    gravityScore,

    medicalAssessment: hData.medicalAssessment || medicalAssessmentRaw,
    careChecklist: Array.isArray(hData.medicalAssessment?.careChecklist) 
      ? hData.medicalAssessment.careChecklist 
      : Array.isArray(medicalAssessmentRaw.careChecklist) 
        ? medicalAssessmentRaw.careChecklist 
        : undefined,

    arrivalTime: hData.arrivalTime,
    arrivalMode: hData.arrivalMode,
    arrivalState: hData.arrivalState,
    admissionService: hData.admissionService,

    triageLevel: hData.triageLevel,
    vitals: hData.vitals,
    symptoms: hData.symptoms,
    provisionalDiagnosis: hData.provisionalDiagnosis,
    triageNotes: typeof hData.triageNotes === 'string' ? hData.triageNotes : undefined,
    triageRecordedAt: typeof hData.triageRecordedAt === 'string' ? hData.triageRecordedAt : undefined,

    observations: Array.isArray(hData.observations) ? hData.observations : undefined,
    treatments: Array.isArray(hData.treatments) ? hData.treatments : undefined,
    exams: Array.isArray(hData.exams) ? hData.exams : undefined,
    timeline: Array.isArray(hData.timeline) ? hData.timeline : undefined,
    pecTreatmentSummary: typeof hData.treatment === 'string' ? hData.treatment : undefined,
    pecNotesSummary: typeof hData.notes === 'string' ? hData.notes : undefined,

    monitoringStatus: parseMonitoringStatus(hData.monitoringStatus),
    monitoringNotes: typeof hData.monitoringNotes === 'string' ? hData.monitoringNotes : undefined,
    transferTarget:
      hData.transferTarget === null
        ? null
        : typeof hData.transferTarget === 'string' && hData.transferTarget.trim()
          ? hData.transferTarget.trim()
          : undefined,

    interventions: hData.interventions || [],

    outcome: hData.outcome ?? dischargeTypeToLegacyOutcome(hData.dischargeType),
    dischargeType: dischargeTypeParsed,
    dischargedAt: typeof hData.dischargedAt === 'string' ? hData.dischargedAt : undefined,
    finalDiagnosis: hData.finalDiagnosis ?? hData.dischargeNotes,
    closureTime: hData.closureTime,
    reportSent: hData.reportSent === true,
    reportSentAt: typeof hData.reportSentAt === 'string' ? hData.reportSentAt : undefined,
    hospitalDetailStatus: typeof hData.status === 'string' ? hData.status : undefined,
  };
}
