import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import {
  EmergencyCase,
  CaseStatus,
  HospitalStatus,
} from '../screens/hospital/HospitalDashboardTab';
import { mergeHospitalDataPartial } from '../lib/hospitalMerge';
import { mapDispatchRowToEmergencyCase } from '../lib/hospitalCaseMapping';
import { buildHospitalReportPayload } from '../lib/hospitalReportPayload';

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
  /** INSERT `hospital_reports` + fusion `reportSent` dans `hospital_data` */
  sendHospitalReport: (caseData: EmergencyCase) => Promise<void>;
}

const HospitalContext = createContext<HospitalContextType | undefined>(undefined);

/** Schéma `units` sans colonne `phone` côté Supabase ; contact unité via `users_directory` (voir `mapDispatchRowToEmergencyCase` + `unitPhoneByUnitId`). */
const UNITS_SELECT_FULL = `units (
  id,
  callsign,
  type,
  status,
  location_lat,
  location_lng,
  vehicle_type,
  vehicle_plate,
  agent_name,
  battery,
  heading,
  last_location_update
)`;

const UNITS_SELECT_MINIMAL = `units (callsign, vehicle_type, vehicle_plate, agent_name)`;

export function HospitalProvider({ children }: { children: ReactNode }) {
  const { profile, session } = useAuth();
  const [activeCases, setActiveCases] = useState<EmergencyCase[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [listBlocker, setListBlocker] = useState<HospitalListBlocker>(null);
  const [lastFetchError, setLastFetchError] = useState<string | null>(null);

  const fetchCasesRef = React.useRef<(() => Promise<void>) | null>(null);

  const sendHospitalReport = useCallback(
    async (caseData: EmergencyCase) => {
      const structureId = profile?.health_structure_id;
      const authUserId = session?.user?.id;
      if (!structureId) {
        throw new Error('Structure inconnue (health_structure_id).');
      }
      if (!authUserId) {
        throw new Error('Session requise pour envoyer le rapport.');
      }

      const report_data = buildHospitalReportPayload(caseData);
      const summary =
        typeof caseData.finalDiagnosis === 'string' && caseData.finalDiagnosis.trim()
          ? caseData.finalDiagnosis.trim().slice(0, 2000)
          : `Dispatch ${caseData.id}`;

      const { error: insertError } = await supabase.from('hospital_reports').insert({
        dispatch_id: caseData.id,
        incident_id: caseData.incidentId ?? null,
        structure_id: structureId,
        report_data,
        summary,
        sent_by: authUserId,
        sent_at: new Date().toISOString(),
      });

      if (insertError) {
        console.error('[HospitalContext] hospital_reports insert', insertError);
        throw insertError;
      }

      const { data: currentRow, error: fetchErr } = await supabase
        .from('dispatches')
        .select('hospital_data')
        .eq('id', caseData.id)
        .single();

      if (fetchErr) {
        console.warn('[HospitalContext] refresh hospital_data after report', fetchErr);
      } else {
        const merged = mergeHospitalDataPartial(currentRow?.hospital_data || {}, {
          reportSent: true,
          reportSentAt: new Date().toISOString(),
        });
        const { error: updErr } = await supabase.from('dispatches').update({ hospital_data: merged }).eq('id', caseData.id);
        if (updErr?.code === '42703') {
          console.warn('[HospitalContext] hospital_data column missing; skip reportSent merge.');
        } else if (updErr) {
          console.error('[HospitalContext] merge reportSent', updErr);
          throw updErr;
        }
      }

      await fetchCasesRef.current?.();
    },
    [profile?.health_structure_id, session?.user?.id]
  );

  const fetchCases = useCallback(async () => {
    setLastFetchError(null);

    if (profile?.role !== 'hopital') {
      setListBlocker('not_hospital_role');
      setActiveCases([]);
      setIsLoading(false);
      return;
    }

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

      let data: any[] | null = null;
      let lastError: any = null;

      for (const unitsFragment of [UNITS_SELECT_FULL, UNITS_SELECT_MINIMAL]) {
        const res = await supabase
          .from('dispatches')
          .select(
            `
          *,
          incidents (*),
          ${unitsFragment}
        `,
          )
          .eq('assigned_structure_id', structureId)
          .order('created_at', { ascending: false });

        if (!res.error && res.data) {
          data = res.data;
          break;
        }
        lastError = res.error;
        console.warn('[HospitalContext] dispatches select retry with simpler units embed:', res.error?.message);
      }

      if (!data) {
        throw lastError ?? new Error('Impossible de charger les dispatches.');
      }

      const incidentIds = data.map((d) => d.incident_id).filter(Boolean);
      const citizenIds = data.map((d) => d.incidents?.citizen_id).filter(Boolean);

      let responsesMap: Record<string, any[]> = {};
      if (incidentIds.length > 0) {
        const { data: sosData } = await supabase.from('sos_responses').select('*').in('incident_id', incidentIds);

        if (sosData) {
          sosData.forEach((r) => {
            if (!responsesMap[r.incident_id]) responsesMap[r.incident_id] = [];
            responsesMap[r.incident_id].push(r);
          });
        }
      }

      let profileMap: Record<string, any> = {};
      if (citizenIds.length > 0) {
        const { data: cData } = await supabase
          .from('users_directory')
          .select(
            'auth_user_id, blood_type, allergies, medical_history, medications, emergency_contact_name, emergency_contact_phone, date_of_birth',
          )
          .in('auth_user_id', citizenIds);

        if (cData) {
          cData.forEach((u) => {
            profileMap[u.auth_user_id] = u;
          });
        }
      }

      const unitIds = [...new Set(data.map((d) => d.unit_id).filter(Boolean))] as string[];
      let unitPhoneByUnitId: Record<string, string> = {};
      if (unitIds.length > 0) {
        const { data: rescuers } = await supabase
          .from('users_directory')
          .select('phone, assigned_unit_id')
          .in('assigned_unit_id', unitIds);

        rescuers?.forEach((r: any) => {
          const uid = r.assigned_unit_id;
          const ph = r.phone != null && String(r.phone).trim() ? String(r.phone).trim() : '';
          if (uid && ph && !unitPhoneByUnitId[uid]) {
            unitPhoneByUnitId[uid] = ph;
          }
        });
      }

      const mappedCases = data.map((d) =>
        mapDispatchRowToEmergencyCase(d, profileMap, responsesMap, unitPhoneByUnitId),
      );
      setActiveCases(mappedCases);
    } catch (err: any) {
      console.error('[HospitalContext] Fetch error:', err);
      setListBlocker('supabase_error');
      setLastFetchError(err?.message ?? String(err));
      setActiveCases([]);
    } finally {
      setIsLoading(false);
    }
  }, [profile?.health_structure_id, profile?.role]);

  fetchCasesRef.current = fetchCases;

  useEffect(() => {
    fetchCases();
  }, [fetchCases]);

  useEffect(() => {
    const structureId = profile?.health_structure_id;
    if (!structureId || profile?.role !== 'hopital') return;

    const channel = supabase
      .channel(`hospital-dashboard-${structureId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'dispatches', filter: `assigned_structure_id=eq.${structureId}` },
        () => {
          console.log('[HospitalContext] Dispatch updated, refreshing cases...');
          fetchCases();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchCases, profile?.health_structure_id, profile?.role]);

  /**
   * Transitions métier : aligné PROMPT_CURSOR_HOPITAL_WORKFLOW §12
   * (ex. `admis` → dispatches.status `arrived_hospital`, `termine` → `completed`).
   */
  const updateCaseStatus = async (caseId: string, transition: { status?: CaseStatus; data?: any; hospitalStatus?: HospitalStatus; hospitalNotes?: string }) => {
    try {
      const { data: currentDispatch, error: fetchError } = await supabase.from('dispatches').select('*').eq('id', caseId).single();

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
        updateObj.hospital_data = mergeHospitalDataPartial(currentDispatch.hospital_data || {}, dataPayload);
      }

      if (transition.hospitalStatus) {
        updateObj.hospital_status = transition.hospitalStatus;
        updateObj.hospital_responded_at = new Date().toISOString();
      }
      if (transition.hospitalNotes) {
        updateObj.hospital_notes = transition.hospitalNotes;
      } else if (transition.hospitalStatus === 'accepted') {
        /** PROMPT_CURSOR_HOPITAL_WORKFLOW §2 — note par défaut si non fournie */
        updateObj.hospital_notes = "Accepté par l'établissement";
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
        sendHospitalReport,
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
