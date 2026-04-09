import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import {
  EmergencyCase,
  CaseStatus,
  UrgencyLevel,
  Intervention,
  HospitalStatus,
  MonitoringPatientStatus,
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

/** Priorise `hospital_data.status` quand le dispatch est à l’hôpital ou clôturé (spec Lovable). */
function resolveCaseStatusFromRow(d: { status?: string }, hData: { status?: unknown }): CaseStatus {
  const ds = d.status;
  if (ds === 'completed') {
    if (isCaseStatus(hData.status)) return hData.status;
    return 'termine';
  }
  if (ds === 'arrived_hospital') {
    if (isCaseStatus(hData.status)) return hData.status;
    return 'admis';
  }
  if (ds === 'dispatched' || ds === 'en_route' || ds === 'on_scene') return 'en_attente';
  if (ds === 'en_route_hospital') return 'en_cours';
  if (isCaseStatus(hData.status)) return hData.status;
  return 'en_attente';
}

/** Fusion partielle de `hospital_data` (ex. vitaux seuls) sans écraser les clés imbriquées de `vitals`. */
function mergeHospitalDataPartial(existing: Record<string, unknown> | null | undefined, partial: Record<string, unknown>): Record<string, unknown> {
  const base: Record<string, unknown> = { ...(existing || {}) };
  for (const key of Object.keys(partial)) {
    const pv = partial[key];
    if (key === 'vitals' && pv != null && typeof pv === 'object' && !Array.isArray(pv)) {
      const prev = base.vitals;
      base.vitals = {
        ...(prev != null && typeof prev === 'object' && !Array.isArray(prev) ? (prev as Record<string, unknown>) : {}),
        ...(pv as Record<string, unknown>),
      };
    } else {
      base[key] = pv;
    }
  }
  return base;
}

/** Aligne les issues Lovable (`dischargeType`) sur le champ `outcome` utilisé par l’UI mobile. */
function dischargeTypeToLegacyOutcome(dischargeType: unknown): string | undefined {
  if (typeof dischargeType !== 'string') return undefined;
  const m: Record<string, string> = {
    hospitalisation: 'hospitalise',
    transfert: 'hospitalise',
    sortie: 'sorti',
    deces: 'decede',
  };
  return m[dischargeType];
}

/** Pourquoi la liste peut être vide malgré une affectation côté centrale */
export type HospitalListBlocker =
  | null
  | 'not_hospital_role'
  | 'no_structure_link'
  | 'supabase_error';

interface HospitalContextType {
  activeCases: EmergencyCase[];
  isLoading: boolean;
  /** Raison métier / config si aucun dispatch n’est chargé (diagnostic) */
  listBlocker: HospitalListBlocker;
  lastFetchError: string | null;
  refresh: () => Promise<void>;
  updateCaseStatus: (
    caseId: string,
    transition: {
      status?: CaseStatus;
      data?: any;
      hospitalStatus?: HospitalStatus;
      hospitalNotes?: string;
    }
  ) => Promise<void>;
}

const HospitalContext = createContext<HospitalContextType | undefined>(undefined);

export function HospitalProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [activeCases, setActiveCases] = useState<EmergencyCase[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [listBlocker, setListBlocker] = useState<HospitalListBlocker>(null);
  const [lastFetchError, setLastFetchError] = useState<string | null>(null);

  // We map the raw dispatch/incident to EmergencyCase.
  // Lovable: quand `dispatches.status` passe à `en_route_hospital`, le backend peut aussi
  // poser `hospital_status = accepted`. Ici `en_route_hospital` est reflété en `status` UI `en_cours` (suivi ambulance).
  const mapRowToCase = (d: any, profileMap: Record<string, any>, responsesMap: Record<string, any[]>): EmergencyCase => {
    const inc = d.incidents || {};
    const hData = d.hospital_data || {};
    
    const patientProfileRaw = inc.citizen_id ? profileMap[inc.citizen_id] : undefined;
    const patientProfile = patientProfileRaw ? {
      bloodType: patientProfileRaw.blood_type,
      allergies: patientProfileRaw.allergies,
      medicalHistory: patientProfileRaw.medical_history,
      medications: patientProfileRaw.medications,
      emergencyContactName: patientProfileRaw.emergency_contact_name,
      emergencyContactPhone: patientProfileRaw.emergency_contact_phone,
      dateOfBirth: patientProfileRaw.date_of_birth,
    } : undefined;

    const hDataAge = typeof hData.age === 'number' && hData.age > 0 ? hData.age : 0;
    const dobAge = patientProfile?.dateOfBirth ? ageFromDateOfBirth(patientProfile.dateOfBirth) : null;
    const resolvedAge = hDataAge > 0 ? hDataAge : dobAge ?? 0;

    const u = d.units || {};
    const unitCallsign = typeof u.callsign === 'string' && u.callsign.trim() ? u.callsign.trim() : 'Unité mobile';
    const unitPhoneRaw = u.phone != null && String(u.phone).trim() ? String(u.phone).trim() : '';
    const unitPhone = unitPhoneRaw || undefined;

    const sosResponsesRaw = responsesMap[inc.id] || [];
    const gravityScore = sosResponsesRaw.reduce((acc: number, curr: any) => acc + (curr.gravity_score || 0), 0) || undefined;

    return {
      id: d.id, // using dispatch ID as the main case ID
      dispatchStatus: typeof d.status === 'string' ? d.status : undefined,
      victimName: inc.caller_name || 'Inconnu',
      age: resolvedAge,
      sex: hData.sex || 'Inconnu',
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
      eta: '5 min', // To be calculated or drawn from dispatches if available
      status: resolveCaseStatusFromRow(d, hData),
      address: inc.location_address || '',
      timestamp: new Date(inc.created_at || d.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
      typeUrgence: inc.type || 'Inconnu',
      unitId: d.unit_id,
      assignedStructureLat: toNullableNumber(d.assigned_structure_lat) ?? undefined,
      assignedStructureLng: toNullableNumber(d.assigned_structure_lng) ?? undefined,
      assignedStructureName:
        typeof d.assigned_structure_name === 'string' && d.assigned_structure_name.trim()
          ? d.assigned_structure_name.trim()
          : undefined,

      // Hospital spec mapping
      hospitalStatus: d.hospital_status || 'pending',
      hospitalNotes: d.hospital_notes,
      hospitalRespondedAt: d.hospital_responded_at,
      patientProfile,
      sosResponses: sosResponsesRaw.length > 0 ? sosResponsesRaw.map((r: any) => ({
        questionText: r.question_text,
        answer: r.answer,
        gravityScore: r.gravity_score,
        gravityLevel: r.gravity_level,
      })) : undefined,
      gravityScore,

      // Clinical data
      arrivalTime: hData.arrivalTime,
      arrivalMode: hData.arrivalMode,
      arrivalState: hData.arrivalState,
      admissionService: hData.admissionService,
      
      triageLevel: hData.triageLevel,
      vitals: hData.vitals,
      symptoms: hData.symptoms,
      provisionalDiagnosis: hData.provisionalDiagnosis,

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
      finalDiagnosis: hData.finalDiagnosis ?? hData.dischargeNotes,
      closureTime: hData.closureTime,
    };
  };

  const fetchCases = useCallback(async () => {
    setLastFetchError(null);

    if (profile?.role !== 'hopital') {
      setListBlocker('not_hospital_role');
      setActiveCases([]);
      setIsLoading(false);
      return;
    }

    // Doit correspondre à dispatches.assigned_structure_id (= health_structures.id).
    // Résolu dans AuthContext via health_structures.linked_user_id = users_directory.id
    const structureId = profile.health_structure_id;
    if (!structureId) {
      setListBlocker('no_structure_link');
      setActiveCases([]);
      setIsLoading(false);
      console.warn(
        '[HospitalContext] Compte hôpital sans structure liée : health_structures.linked_user_id doit pointer vers users_directory.id de ce compte. ' +
          'Sans cela, assigned_structure_id ne peut pas être filtré correctement.',
      );
      return;
    }

    setListBlocker(null);

    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('dispatches')
        .select(`
          *,
          incidents (*),
          units (callsign, vehicle_type, vehicle_plate, agent_name)
        `)
        .eq('assigned_structure_id', structureId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (data) {
        const incidentIds = data.map(d => d.incident_id).filter(Boolean);
        const citizenIds = data.map(d => d.incidents?.citizen_id).filter(Boolean);
        
        let responsesMap: Record<string, any[]> = {};
        if (incidentIds.length > 0) {
          const { data: sosData } = await supabase
            .from('sos_responses')
            .select('*')
            .in('incident_id', incidentIds);
            
          if (sosData) {
            sosData.forEach(r => {
              if (!responsesMap[r.incident_id]) responsesMap[r.incident_id] = [];
              responsesMap[r.incident_id].push(r);
            });
          }
        }

        let profileMap: Record<string, any> = {};
        if (citizenIds.length > 0) {
          const { data: cData } = await supabase
            .from('users_directory')
            .select('auth_user_id, blood_type, allergies, medical_history, medications, emergency_contact_name, emergency_contact_phone, date_of_birth')
            .in('auth_user_id', citizenIds);
            
          if (cData) {
            cData.forEach(u => {
              profileMap[u.auth_user_id] = u;
            });
          }
        }

        const mappedCases = data.map(d => mapRowToCase(d, profileMap, responsesMap));
        // Maybe sort active cases first
        setActiveCases(mappedCases);
      }
    } catch (err: any) {
      console.error('[HospitalContext] Fetch error:', err);
      setListBlocker('supabase_error');
      setLastFetchError(err?.message ?? String(err));
      setActiveCases([]);
    } finally {
      setIsLoading(false);
    }
  }, [profile?.health_structure_id, profile?.role]);

  useEffect(() => {
    fetchCases();
  }, [fetchCases]);

  // Realtime
  useEffect(() => {
    const structureId = profile?.health_structure_id;
    if (!structureId || profile?.role !== 'hopital') return;

    const channel = supabase.channel(`hospital-dashboard-${structureId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'dispatches', filter: `assigned_structure_id=eq.${structureId}` },
        () => {
          console.log('[HospitalContext] Dispatch updated, refreshing cases...');
          fetchCases();
        }
      )
      // Note: we might also want to listen to incidents for vitals/details updates, but fetching on dispatch change is a robust default.
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchCases, profile?.health_structure_id, profile?.role]);

  const updateCaseStatus = async (caseId: string, transition: { status?: CaseStatus; data?: any; hospitalStatus?: HospitalStatus; hospitalNotes?: string }) => {
    try {
      const { data: currentDispatch, error: fetchError } = await supabase
        .from('dispatches')
        .select('*')
        .eq('id', caseId)
        .single();

      if (fetchError) throw fetchError;

      const updateObj: Record<string, unknown> = {};
      const dataPayload =
        transition.data != null && typeof transition.data === 'object' && !Array.isArray(transition.data)
          ? (transition.data as Record<string, unknown>)
          : null;

      if (transition.status) {
        const newHospitalData = mergeHospitalDataPartial(currentDispatch.hospital_data || {}, {
          ...(dataPayload || {}),
          status: transition.status,
        });

        let newStatus = currentDispatch.status;
        if (transition.status === 'en_cours') newStatus = 'en_route_hospital';
        if (transition.status === 'admis') newStatus = 'arrived_hospital';
        if (transition.status === 'termine') newStatus = 'completed';

        updateObj.hospital_data = newHospitalData;
        updateObj.status = newStatus;

        if (transition.status === 'admis') {
          updateObj.admission_recorded_at = new Date().toISOString();
          if (profile?.id) {
            updateObj.admission_recorded_by = profile.id;
          }
        }
        if (transition.status === 'termine') {
          updateObj.completed_at = new Date().toISOString();
        }
      } else if (dataPayload && Object.keys(dataPayload).length > 0) {
        // Mise à jour partielle (ex. vitaux seuls) — ne modifie pas dispatches.status
        updateObj.hospital_data = mergeHospitalDataPartial(currentDispatch.hospital_data || {}, dataPayload);
      }

      if (transition.hospitalStatus) {
        updateObj.hospital_status = transition.hospitalStatus;
        updateObj.hospital_responded_at = new Date().toISOString();
      }
      if (transition.hospitalNotes) {
        updateObj.hospital_notes = transition.hospitalNotes;
      }

      if (Object.keys(updateObj).length === 0) {
        return;
      }

      const performUpdate = async (payload: Record<string, unknown>) => {
        const { error } = await supabase.from('dispatches').update(payload).eq('id', caseId);
        return error;
      };

      let updateError = await performUpdate(updateObj);

      if (updateError?.code === '42703') {
        const stripped = { ...updateObj };
        delete stripped.hospital_data;
        console.warn('[HospitalContext] hospital_data missing; retrying without JSON.');
        updateError = await performUpdate(stripped);
      }
      if (updateError?.code === '42703') {
        const stripped = { ...updateObj };
        delete stripped.hospital_data;
        delete stripped.admission_recorded_at;
        delete stripped.admission_recorded_by;
        console.warn('[HospitalContext] admission_recorded_* missing; retrying without.');
        updateError = await performUpdate(stripped);
      }
      if (updateError?.code === '42703') {
        const stripped = { ...updateObj };
        delete stripped.hospital_data;
        delete stripped.admission_recorded_at;
        delete stripped.admission_recorded_by;
        delete stripped.completed_at;
        console.warn('[HospitalContext] completed_at missing; retrying without.');
        updateError = await performUpdate(stripped);
      }

      if (updateError) throw updateError;

      fetchCases();
    } catch (error) {
      console.error('[HospitalContext] updateCaseStatus error', error);
      throw error;
    }
  };

  return (
    <HospitalContext.Provider
      value={{
        activeCases,
        isLoading,
        listBlocker,
        lastFetchError,
        refresh: fetchCases,
        updateCaseStatus,
      }}
    >
      {children}
    </HospitalContext.Provider>
  );
}

export function useHospital() {
  const context = useContext(HospitalContext);
  if (context === undefined) {
    throw new Error('useHospital must be used within a HospitalProvider');
  }
  return context;
}
