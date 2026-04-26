import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { DeviceEventEmitter } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import {
  EmergencyCase,
  CaseStatus,
  HospitalStatus,
  HealthStructure,
  isCaseClosed,
} from '../screens/hospital/hospitalTypes';
import { mergeHospitalDataPartial } from '../lib/hospitalMerge';
import { mapDispatchRowToEmergencyCase } from '../lib/hospitalCaseMapping';
import { buildHospitalReportPayload } from '../lib/hospitalReportPayload';
import { readHospitalCasesCache, writeHospitalCasesCache } from '../lib/localAppCache';
import { APP_FOREGROUND_SYNC } from '../lib/syncEvents';

/** Émis quand un dispatch assigné à la structure exige une réponse hôpital (alignement urgentiste → HospitalAlertManager). */
export const NEW_HOSPITAL_ALERT = 'NEW_HOSPITAL_ALERT';

/**
 * Détermine si l’événement Realtime correspond à une **nouvelle** alerte à traiter (évite spam sur chaque UPDATE).
 */
function getDispatchIdForHospitalAlert(structureId: string, payload: {
  eventType?: string;
  new?: Record<string, unknown> | null;
  old?: Record<string, unknown> | null;
}): string | null {
  const n = payload.new;
  if (!n || String(n.assigned_structure_id ?? '') !== structureId) return null;

  const hs = n.hospital_status;
  const isPending = hs === 'pending' || hs == null || hs === undefined;
  if (!isPending) return null;

  const id = typeof n.id === 'string' ? n.id : null;
  if (!id) return null;

  if (payload.eventType === 'INSERT') return id;

  if (payload.eventType === 'UPDATE') {
    const o = payload.old ?? {};
    if (Object.keys(o).length === 0) return null;

    const oldStruct = String(o.assigned_structure_id ?? '');
    const oldHs = o.hospital_status;

    if (oldStruct !== structureId) return id;

    const wasPending = oldHs === 'pending' || oldHs == null || oldHs === undefined;
    if (!wasPending) return id;
    return null;
  }

  return null;
}

/** Pourquoi la liste peut être vide malgré une affectation côté centrale */
type HospitalListBlocker =
  | null
  | 'not_hospital_role'
  | 'no_structure_link'
  | 'supabase_error';

export type HospitalCapacityStatus = 'fluid' | 'saturated' | 'diversion';

interface HospitalContextType {
  activeCases: EmergencyCase[];
  isLoading: boolean;
  /** État de saturation déclaré par l’hôpital */
  hospitalCapacity: HospitalCapacityStatus;
  isUpdatingCapacity: boolean;
  /** Raison métier / config si aucun dispatch n’est chargé (diagnostic) */
  listBlocker: HospitalListBlocker;
  lastFetchError: string | null;
  /** Nombre d'alertes en attente (hospitalStatus === 'pending') */
  pendingAlertCount: number;
  refresh: () => Promise<void>;
  updateHospitalCapacity: (status: HospitalCapacityStatus) => Promise<void>;
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
  structureInfo: HealthStructure | null;
  updateStructureInfo: (updates: Partial<HealthStructure>) => Promise<void>;
  refreshStructureInfo: () => Promise<void>;
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
  const [isLoading, setIsLoading] = useState(false);
  const [structureInfo, setStructureInfo] = useState<HealthStructure | null>(null);
  const [hospitalCapacity, setHospitalCapacity] = useState<HospitalCapacityStatus>('fluid');
  const [isUpdatingCapacity, setIsUpdatingCapacity] = useState(false);
  const [listBlocker, setListBlocker] = useState<HospitalListBlocker>(null);
  const [lastFetchError, setLastFetchError] = useState<string | null>(null);
  const [pendingAlertCount, setPendingAlertCount] = useState(0);

  const activeCasesRef = useRef(activeCases);
  useEffect(() => {
    activeCasesRef.current = activeCases;
  }, [activeCases]);

  const fetchCasesRef = React.useRef<((opts?: { silent?: boolean }) => Promise<void>) | null>(null);

  const refreshStructureInfo = useCallback(async () => {
    const structureId = profile?.health_structure_id;
    if (!structureId) return;

    try {
      const { data, error } = await supabase
        .from('health_structures')
        .select('*')
        .eq('id', structureId)
        .single();

      if (!error && data) {
        // Mapping flexible pour s'adapter au schéma réel
        const rawSpecialties = data.specialties || data.specialities || data.specialites || data.specialty || data.hospital_data?.specialties || [];
        const rawEquipments = data.equipments || data.equipements || data.equipment || data.technical_plateau || data.equipment_list || data.hospital_data?.equipments || [];

        const normalizeList = (val: any): string[] => {
          if (Array.isArray(val)) return val;
          if (typeof val === 'string' && val.trim()) return val.split(',').map(s => s.trim());
          return [];
        };

        const normalized: HealthStructure = {
          id: data.id,
          name: data.name || data.nom || '',
          official_name: data.official_name || data.nom_officiel || null,
          short_name: data.short_name || data.nom_court || data.code || null,
          type: data.type || data.categorie || data.category || data.structure_type || data.kind || null,
          address: data.address || data.adresse || null,
          phone: data.phone || data.telephone || null,
          email: data.email || data.courriel || null,
          operating_hours: data.operating_hours || data.operating_hours || data.horaires || data.horaire_ouverture || data.opening_hours || null,
          contact_person: data.contact_person || data.contact || data.responsable || data.primary_contact || null,
          capacity: data.capacity || data.capacite_totale || data.hospital_data?.capacity || 0,
          available_beds: data.available_beds || data.lits_disponibles || data.dispo || data.hospital_data?.available_beds || 0,
          is_open: data.is_open ?? data.ouvert ?? true,
          lat: data.lat ?? data.latitude ?? data.location_lat,
          lng: data.lng ?? data.longitude ?? data.location_lng,
          specialties: normalizeList(rawSpecialties),
          equipment: normalizeList(rawEquipments),
          capacity_status: data.capacity_status,
        };

        setStructureInfo(normalized);
        if (normalized.capacity_status) {
          setHospitalCapacity(normalized.capacity_status as HospitalCapacityStatus);
        }
      }
    } catch (err) {
      console.error('[HospitalContext] refreshStructureInfo error:', err);
    }
  }, [profile?.health_structure_id]);

  const updateStructureInfo = useCallback(async (updates: Partial<HealthStructure>) => {
    const structureId = profile?.health_structure_id;
    if (!structureId) return;

    try {
      const performUpdate = async (obj: Record<string, any>) => {
        return await supabase
          .from('health_structures')
          .update(obj)
          .eq('id', structureId);
      };

      let { error } = await performUpdate(updates);

      // Si erreur de colonne manquante, on essaie de filtrer
      if (error && (error.code === 'PGRST204' || error.code === '42703')) {
        console.warn('[HospitalContext] Some columns missing, attempting resilient update...');

        // On garde uniquement les colonnes "sûres" et on tente le reste une par une
        const safeUpdates: Record<string, any> = {};
        const knownSafe = ['name', 'official_name', 'short_name', 'address', 'phone', 'capacity_status', 'operating_hours', 'contact_person', 'lat', 'lng', 'equipment'];

        for (const key of Object.keys(updates)) {
          if (knownSafe.includes(key)) {
            safeUpdates[key] = (updates as any)[key];
          }
        }

        // Tenter d'abord le bloc "sûr"
        if (Object.keys(safeUpdates).length > 0) {
          const { error: safeErr } = await performUpdate(safeUpdates);
          if (safeErr) console.error('[HospitalContext] Safe update failed:', safeErr);
        }

        // Tenter les autres un par un pour voir ce qui passe
        for (const key of Object.keys(updates)) {
          if (!knownSafe.includes(key)) {
            const singleUpdate = { [key]: (updates as any)[key] };
            const { error: singleErr } = await performUpdate(singleUpdate);
            if (singleErr) {
              console.warn(`[HospitalContext] Column "${key}" likely missing in DB, skipping.`);
            }
          }
        }
      } else if (error) {
        throw error;
      }

      await refreshStructureInfo();
    } catch (err) {
      console.error('[HospitalContext] updateStructureInfo error:', err);
      throw err;
    }
  }, [profile?.health_structure_id, refreshStructureInfo]);

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
        if (updErr?.code === '42703' || updErr?.code === 'PGRST204') {
          console.warn('[HospitalContext] hospital_data column missing; skip reportSent merge.');
        } else if (updErr) {
          console.error('[HospitalContext] merge reportSent', updErr);
          throw updErr;
        }
      }

      await fetchCasesRef.current?.({ silent: true });
    },
    [profile?.health_structure_id, session?.user?.id]
  );

  const updateHospitalCapacity = useCallback(
    async (status: HospitalCapacityStatus) => {
      const structureId = profile?.health_structure_id;
      if (!structureId) return;

      setIsUpdatingCapacity(true);
      try {
        // En local d'abord pour réactivité
        setHospitalCapacity(status);

        // Sync Supabase
        const { error } = await supabase
          .from('health_structures')
          .update({ capacity_status: status })
          .eq('id', structureId);

        if (error) {
          if (error.code === '42703' || error.code === 'PGRST204') {
            console.warn('[HospitalContext] capacity_status column missing in health_structures table. Keeping local state.');
          } else {
            throw error;
          }
        }
      } catch (err) {
        console.error('[HospitalContext] updateHospitalCapacity error:', err);
      } finally {
        setIsUpdatingCapacity(false);
      }
    },
    [profile?.health_structure_id]
  );

  const fetchCases = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
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
      const hasData = activeCasesRef.current.length > 0;
      if (!silent && !hasData) {
        setIsLoading(true);
      }

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

      const pendingCount = mappedCases.filter(c => c.hospitalStatus === 'pending' && !isCaseClosed(c)).length;
      setPendingAlertCount(pendingCount);

      setActiveCases(mappedCases);
      void writeHospitalCasesCache(structureId, mappedCases);
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
    let cancelled = false;
    (async () => {
      if (profile?.role !== 'hopital' || !profile.health_structure_id) {
        return;
      }
      const sid = profile.health_structure_id;
      const cached = await readHospitalCasesCache(sid);
      if (cancelled) return;
      if (cached) {
        setActiveCases(cached);
        setListBlocker(null);
      }
      await fetchCases({ silent: true });
      await refreshStructureInfo();
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchCases, refreshStructureInfo, profile?.health_structure_id, profile?.role]);

  useEffect(() => {
    const structureId = profile?.health_structure_id;
    if (!structureId || profile?.role !== 'hopital') return;

    const channel = supabase
      .channel(`hospital-dashboard-${structureId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'dispatches', filter: `assigned_structure_id=eq.${structureId}` },
        (payload: { eventType?: string; new?: Record<string, unknown> | null; old?: Record<string, unknown> | null }) => {
          console.log('[HospitalContext] Dispatch updated, refreshing cases...');
          const dispatchId = getDispatchIdForHospitalAlert(structureId, payload);
          if (dispatchId) {
            DeviceEventEmitter.emit(NEW_HOSPITAL_ALERT, { dispatchId });
          }
          void fetchCases({ silent: true });
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

        // If hospital accepts, we immediately move to en_route_hospital status
        // Only if we haven't already moved past this stage (safety check)
        const canAdvanceStatus = !['en_route_hospital', 'arrived_hospital', 'completed', 'mission_end'].includes(currentDispatch.status);
        if (transition.hospitalStatus === 'accepted' && canAdvanceStatus) {
          updateObj.status = 'en_route_hospital';
        }
      }
      if (transition.hospitalNotes) {
        updateObj.hospital_notes = transition.hospitalNotes;
      } else if (transition.hospitalStatus === 'accepted') {
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

      if (updateError?.code === '42703' || updateError?.code === 'PGRST204') {
        const stripped = { ...updateObj };
        delete stripped.hospital_data;
        console.warn('[HospitalContext] hospital_data missing; retrying without JSON.');
        updateError = await performUpdate(stripped);
      }
      if (updateError?.code === '42703' || updateError?.code === 'PGRST204') {
        const stripped = { ...updateObj };
        delete stripped.hospital_data;
        delete stripped.admission_recorded_at;
        delete stripped.admission_recorded_by;
        console.warn('[HospitalContext] admission_recorded_* missing; retrying without.');
        updateError = await performUpdate(stripped);
      }
      if (updateError?.code === '42703' || updateError?.code === 'PGRST204') {
        const stripped = { ...updateObj };
        delete stripped.hospital_data;
        delete stripped.admission_recorded_at;
        delete stripped.admission_recorded_by;
        delete stripped.completed_at;
        console.warn('[HospitalContext] completed_at missing; retrying without.');
        updateError = await performUpdate(stripped);
      }

      // Optimistic update
      setActiveCases(prev => {
        const next = prev.map(c => {
          if (c.id !== caseId) return c;
          const updated = { ...c };
          if (transition.hospitalStatus) updated.hospitalStatus = transition.hospitalStatus;
          // Note: we don't update c.status here for complexity, 
          // but hospitalStatus change is enough to flip the pendingCount filter.
          return updated;
        });
        const pendingCount = next.filter(c => c.hospitalStatus === 'pending' && !isCaseClosed(c)).length;
        setPendingAlertCount(pendingCount);
        return next;
      });

      if (updateError) throw updateError;

      void fetchCases({ silent: true });
    } catch (error) {
      console.error('[HospitalContext] updateCaseStatus error', error);
      throw error;
    }
  };

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(APP_FOREGROUND_SYNC, () => {
      void fetchCases({ silent: true });
    });
    return () => sub.remove();
  }, [fetchCases]);

  return (
    <HospitalContext.Provider
      value={{
        activeCases,
        isLoading,
        hospitalCapacity,
        isUpdatingCapacity,
        listBlocker,
        lastFetchError,
        pendingAlertCount,
        refresh: fetchCases,
        updateHospitalCapacity,
        updateCaseStatus,
        sendHospitalReport,
        structureInfo,
        updateStructureInfo,
        refreshStructureInfo,
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
