import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { EmergencyCase, CaseStatus, UrgencyLevel, Intervention } from '../screens/hospital/HospitalDashboardTab';

interface HospitalContextType {
  activeCases: EmergencyCase[];
  isLoading: boolean;
  refresh: () => Promise<void>;
  updateCaseStatus: (caseId: string, transition: { status: CaseStatus; data?: any }) => Promise<void>;
}

const HospitalContext = createContext<HospitalContextType | undefined>(undefined);

export function HospitalProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [activeCases, setActiveCases] = useState<EmergencyCase[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // We map the raw dispatch/incident to EmergencyCase
  const mapRowToCase = (d: any): EmergencyCase => {
    const inc = d.incidents || {};
    
    // Parse admission and triage data stored in JSON columns on dispatches (or incidents if applicable)
    // For now, we assume we might store them in a column called `hospital_data` on `dispatches`
    const hData = d.hospital_data || {};

    return {
      id: d.id, // using dispatch ID as the main case ID
      victimName: inc.caller_name || 'Inconnu',
      age: hData.age || 0, // Fallback as age isn't strictly captured in the current SOS
      sex: hData.sex || 'Inconnu',
      description: inc.description || '',
      level: (inc.priority === 'critical' ? 'critique' : inc.priority === 'high' ? 'urgent' : 'stable') as UrgencyLevel,
      urgentisteName: d.units?.name || 'Unité mobile', // Assuming unit name could be returned if joined
      urgentistePhone: d.units?.phone || '-', 
      eta: '5 min', // To be calculated or drawn from dispatches if available
      status: (d.status === 'dispatched' || d.status === 'en_route' || d.status === 'on_scene' ? 'en_attente' : 
              d.status === 'en_route_hospital' ? 'en_cours' : 
              d.status === 'arrived_hospital' ? 'admis' :
              hData.status || 'en_attente') as CaseStatus, // Simplified mapping
      address: inc.location_address || '',
      timestamp: new Date(inc.created_at || d.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
      typeUrgence: inc.type || 'Inconnu',
      
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
          units (name, phone)
        `)
        .eq('assigned_structure_id', structureId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (data) {
        const mappedCases = data.map(mapRowToCase);
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

  const updateCaseStatus = async (caseId: string, transition: { status: CaseStatus; data?: any }) => {
    try {
      // We store the status in hospital_data JSON column and update dispatch status if applicable
      const { data: currentDispatch, error: fetchError } = await supabase
        .from('dispatches')
        .select('hospital_data, status')
        .eq('id', caseId)
        .single();
        
      if (fetchError) throw fetchError;
      
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

      const { error } = await supabase
        .from('dispatches')
        .update({ 
          hospital_data: newHospitalData,
          status: newStatus 
        })
        .eq('id', caseId);

      if (error) throw error;

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
