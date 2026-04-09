import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { EmergencyCase, CaseStatus, UrgencyLevel, Intervention, HospitalStatus } from '../screens/hospital/HospitalDashboardTab';

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

interface HospitalContextType {
  activeCases: EmergencyCase[];
  isLoading: boolean;
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
      status: (d.status === 'dispatched' || d.status === 'en_route' || d.status === 'on_scene' ? 'en_attente' : 
              d.status === 'en_route_hospital' ? 'en_cours' : 
              d.status === 'arrived_hospital' ? 'admis' :
              hData.status || 'en_attente') as CaseStatus, // Simplified mapping
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
      
      interventions: hData.interventions || [],
      
      outcome: hData.outcome,
      finalDiagnosis: hData.finalDiagnosis,
      closureTime: hData.closureTime,
    };
  };

  const fetchCases = useCallback(async () => {
    // Structure ID logic: use health_structure_id, fallback to assigned_unit_id if that was used.
    const structureId = profile?.health_structure_id || profile?.assigned_unit_id;
    if (!structureId || profile?.role !== 'hopital') {
      setActiveCases([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('dispatches')
        .select(`
          *,
          incidents (*),
          units (callsign, phone, vehicle_type, vehicle_plate, agent_name)
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
    } catch (err) {
      console.error('[HospitalContext] Fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [profile?.health_structure_id, profile?.assigned_unit_id, profile?.role]);

  useEffect(() => {
    fetchCases();
  }, [fetchCases]);

  // Realtime
  useEffect(() => {
    const structureId = profile?.health_structure_id || profile?.assigned_unit_id;
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
  }, [fetchCases, profile?.health_structure_id, profile?.assigned_unit_id, profile?.role]);

  const updateCaseStatus = async (caseId: string, transition: { status?: CaseStatus; data?: any; hospitalStatus?: HospitalStatus; hospitalNotes?: string }) => {
    try {
      // We store the status in hospital_data JSON column and update dispatch status if applicable
      const { data: currentDispatch, error: fetchError } = await supabase
        .from('dispatches')
        .select('*')
        .eq('id', caseId)
        .single();
        
      if (fetchError) throw fetchError;
      
      let updateObj: any = {};

      if (transition.status) {
        const newHospitalData = {
          ...(currentDispatch.hospital_data || {}),
          status: transition.status,
          ...(transition.data || {})
        };

        let newStatus = currentDispatch.status;
        // Map back to dispatch status if needed
        if (transition.status === 'en_cours') newStatus = 'en_route_hospital';
        if (transition.status === 'admis') newStatus = 'arrived_hospital';
        if (transition.status === 'termine') newStatus = 'completed';
        
        updateObj.hospital_data = newHospitalData;
        updateObj.status = newStatus;
      }

      // Explicit Hospital Status fields
      if (transition.hospitalStatus) {
        updateObj.hospital_status = transition.hospitalStatus;
        updateObj.hospital_responded_at = new Date().toISOString();
      }
      if (transition.hospitalNotes) {
        updateObj.hospital_notes = transition.hospitalNotes;
      }

      const performFullUpdate = async () => {
        const { error } = await supabase
          .from('dispatches')
          .update(updateObj)
          .eq('id', caseId);
        return error;
      };

      let updateError = await performFullUpdate();

      // If the column hospital_data hasn't been created yet on Supabase, fallback to updating just the status
      if (updateError && updateError.code === '42703') {
        console.warn('[HospitalContext] The column hospital_data does not exist yet. Only updating status.');
        // Fallback for hospital_data missing: strip it and ensure status is updated
        delete updateObj.hospital_data;
        const { error: fallbackError } = await supabase
          .from('dispatches')
          .update(updateObj)
          .eq('id', caseId);
        
        if (fallbackError) throw fallbackError;
      } else if (updateError) {
        throw updateError;
      }

      // Optimistic update
      fetchCases();
    } catch (error) {
      console.error('[HospitalContext] updateCaseStatus error', error);
      throw error;
    }
  };

  return (
    <HospitalContext.Provider value={{ activeCases, isLoading, refresh: fetchCases, updateCaseStatus }}>
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
