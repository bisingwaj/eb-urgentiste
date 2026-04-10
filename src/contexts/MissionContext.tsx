import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { Alert, Vibration, DeviceEventEmitter } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import { Mission } from '../hooks/useActiveMission';

/** PostgREST / JSON peuvent renvoyer des nombres en string */
function toNullableNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
}

interface SupabaseIncident {
  id: string;
  citizen_id: string | null;
  caller_name: string | null;
  caller_phone: string | null;
  location_lat: number | null;
  location_lng: number | null;
  location_address: string | null;
  description: string | null;
  type: string;
  priority: Mission['priority'];
  reference: string;
  title: string;
  status: string;
  caller_realtime_lat: number | null;
  caller_realtime_lng: number | null;
  caller_realtime_updated_at: string | null;
  commune: string | null;
  recommended_facility: string | null;
  created_at: string;
}

interface SupabaseDispatch {
  id: string;
  status: string;
  unit_id: string;
  incident_id: string;
  assigned_structure_id: string | null;
  assigned_structure_name: string | null;
  assigned_structure_lat: number | null;
  assigned_structure_lng: number | null;
  assigned_structure_phone: string | null;
  assigned_structure_address: string | null;
  assigned_structure_type: string | null;
  created_at: string;
  incidents: SupabaseIncident;
}

function buildAssignedStructureFromDispatchRow(d: Partial<SupabaseDispatch>): Mission['assigned_structure'] | null {
  const id = d.assigned_structure_id;
  if (id == null || id === '') return null;
  return {
    id: String(id),
    name: d.assigned_structure_name || 'Structure',
    lat: toNullableNumber(d.assigned_structure_lat),
    lng: toNullableNumber(d.assigned_structure_lng),
    phone: d.assigned_structure_phone ?? null,
    address: d.assigned_structure_address ?? null,
    type: d.assigned_structure_type || 'hopital',
  };
}

/**
 * Filtre Metro : tape "[STRUCTURE GPS]" pour voir uniquement les coords structure en temps réel.
 */
function logStructureGps(source: string, row: Record<string, unknown>) {
  const lat = toNullableNumber(row.assigned_structure_lat);
  const lng = toNullableNumber(row.assigned_structure_lng);
  const coordsOk = lat != null && lng != null;
  console.log(
    '[STRUCTURE GPS]',
    source,
    JSON.stringify(
      {
        dispatchId: row.id != null ? String(row.id) : null,
        structureId: row.assigned_structure_id != null ? String(row.assigned_structure_id) : null,
        nom: row.assigned_structure_name ?? null,
        lat,
        lng,
        coordsOk,
      },
      null,
      0,
    ),
  );
}

export interface Hospital {
  id: string;
  name: string;
  distance?: string;
  capacity?: string;
  specialty?: string;
  address?: string;
  phone?: string;
  coords: { latitude: number; longitude: number };
}

interface MissionContextType {
  activeMission: Mission | null;
  isLoading: boolean;
  error: string | null;
  /** Recharge le dispatch depuis Supabase sans spinner (Realtime / polling) */
  refresh: () => Promise<void>;
  updateDispatchStatus: (status: 'en_route' | 'on_scene' | 'en_route_hospital' | 'arrived_hospital' | 'completed') => Promise<void>;
  updateMissionDetails: (details: Partial<Mission> & { assessment?: any }) => Promise<void>;
  fetchHospitals: () => Promise<Hospital[]>;
}

const MissionContext = createContext<MissionContextType | undefined>(undefined);

export function MissionProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [activeMission, setActiveMission] = useState<Mission | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchActiveMission = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!profile?.assigned_unit_id) {
      if (!silent) setIsLoading(false);
      setActiveMission(null);
      return;
    }

    try {
      if (!silent) setIsLoading(true);
      /** `incidents!inner` = jointure stricte dispatch → incident ; `citizen_id` et champs UI viennent d’ici. */
      const { data, error: dispatchError } = await supabase
        .from('dispatches')
        .select(
          `
          *,
          incidents!inner(
            id,
            citizen_id,
            caller_name,
            caller_phone,
            location_lat,
            location_lng,
            location_address,
            description,
            type,
            priority,
            reference,
            title,
            status,
            caller_realtime_lat,
            caller_realtime_lng,
            caller_realtime_updated_at,
            commune,
            recommended_facility,
            created_at
          )
        `.trim()
        )
        .eq('unit_id', profile.assigned_unit_id)
        .in('status', ['dispatched', 'en_route', 'on_scene', 'en_route_hospital', 'arrived_hospital', 'mission_end'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (dispatchError) throw dispatchError;

      /** Le client TS ne déduit pas toujours `incidents!inner` + `*` — typage explicite. */
      const dispatch = data as {
        id: string;
        status: string;
        incidents?: Record<string, unknown> | null;
      } | null;

      if (dispatch && dispatch.incidents) {
        const incident = dispatch.incidents as unknown as SupabaseIncident;
        // Priorité : position temps réel > position initiale
        const lat = incident.caller_realtime_lat ?? incident.location_lat;
        const lng = incident.caller_realtime_lng ?? incident.location_lng;
        console.log(`📍 [POSITION VICTIME] lat: ${lat}, lng: ${lng}, adresse: ${incident.location_address || 'NULL'}`);

        const assignedStructure = buildAssignedStructureFromDispatchRow(dispatch as Partial<SupabaseDispatch>);

        if (assignedStructure) {
          console.log(`🏥 [STRUCTURE ASSIGNÉE] ${assignedStructure.name} — lat: ${assignedStructure.lat}, lng: ${assignedStructure.lng}`);
          logStructureGps('fetchActiveMission', dispatch as unknown as Record<string, unknown>);
        }

        setActiveMission({
          id: dispatch.id,
          incident_id: incident.id,
          citizen_id: incident.citizen_id != null ? String(incident.citizen_id) : null,
          reference: incident.reference,
          type: incident.type,
          title: incident.title,
          description: incident.description,
          priority: incident.priority,
          incident_status: incident.status,
          dispatch_status: dispatch.status as Mission['dispatch_status'],
          location: {
            lat,
            lng,
            address: incident.location_address,
            commune: incident.commune,
          },
          caller: {
            name: incident.caller_name || 'Anonyme',
            phone: incident.caller_phone || '-',
          },
          assigned_structure: assignedStructure,
          destination: incident.recommended_facility ?? undefined,
          created_at: incident.created_at,
        });
      } else {
        setActiveMission(null);
      }
    } catch (err: any) {
      console.error('[MissionProvider] Fetch error:', err.message);
      setError(err.message);
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [profile?.assigned_unit_id]);

  const scheduleSilentRefetch = useCallback(() => {
    if (fetchDebounceRef.current) clearTimeout(fetchDebounceRef.current);
    fetchDebounceRef.current = setTimeout(() => {
      fetchDebounceRef.current = null;
      fetchActiveMission({ silent: true });
    }, 120);
  }, [fetchActiveMission]);

  const mergeDispatchUpdateIntoState = useCallback((payload: { new?: Partial<SupabaseDispatch> }) => {
    const n = payload.new;
    if (!n?.id) return;
    setActiveMission((prev) => {
      if (!prev || String(prev.id) !== String(n.id)) return prev;
      const hasAssignment = n.assigned_structure_id != null && String(n.assigned_structure_id) !== '';
      return {
        ...prev,
        dispatch_status: (n.status as Mission['dispatch_status']) ?? prev.dispatch_status,
        assigned_structure: hasAssignment ? buildAssignedStructureFromDispatchRow(n) : null,
      };
    });
  }, []);

  const refresh = useCallback(() => fetchActiveMission({ silent: true }), [fetchActiveMission]);

  /** Chargement initial + changement d’unité */
  useEffect(() => {
    fetchActiveMission({ silent: false });
  }, [profile?.assigned_unit_id, fetchActiveMission]);

  /** Dispatches : INSERT / UPDATE par unité (temps réel) */
  useEffect(() => {
    if (!profile?.assigned_unit_id) return;

    const channelId = `global-mission-${profile.assigned_unit_id}`;
    const channel = supabase
      .channel(channelId)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'dispatches',
          filter: `unit_id=eq.${profile.assigned_unit_id}`,
        },
        (payload: any) => {
          console.log('[Mission] 🚨 NOUVELLE MISSION REÇUE !', payload.new?.id);
          // Déclencher l'alarme sonore continue (gérée par AlertAlarmManager)
          DeviceEventEmitter.emit('NEW_MISSION_ALERT');
          fetchActiveMission({ silent: true }).then(() => {
            Alert.alert(
              '🚨 NOUVELLE MISSION',
              'La centrale vous a assigné une intervention urgente.',
              [{ text: 'VOIR LA MISSION', style: 'default' }],
              { cancelable: false }
            );
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'dispatches',
          filter: `unit_id=eq.${profile.assigned_unit_id}`,
        },
        (payload: any) => {
          const row = (payload.new || {}) as Record<string, unknown>;
          console.log('[Mission] 📡 UPDATE dispatches (unit_id)', row.id, row.assigned_structure_id);
          if (row.assigned_structure_id != null) {
            logStructureGps('Realtime postgres_changes (unit_id)', row);
            console.log('Realtime postgres_changes (unit_id)', row);
          }
          mergeDispatchUpdateIntoState(payload);
          scheduleSilentRefetch();
        }
      );

    channel.subscribe((status) => {
      if (status === 'CHANNEL_ERROR') {
        console.warn('[Mission] Realtime canal unité en erreur — vérifie publication `dispatches` dans Supabase');
      }
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.assigned_unit_id, fetchActiveMission, mergeDispatchUpdateIntoState, scheduleSilentRefetch]);

  /** Guide §3 : même ligne dispatch — filtre par id (évite les ratés si plusieurs flux) */
  useEffect(() => {
    if (!activeMission?.id) return;

    const ch = supabase
      .channel(`dispatch-row-${activeMission.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'dispatches',
          filter: `id=eq.${activeMission.id}`,
        },
        (payload: any) => {
          const row = (payload.new || {}) as Record<string, unknown>;
          console.log('[Mission] 📡 UPDATE dispatches (id)', row.id, row.assigned_structure_id);
          if (row.assigned_structure_id != null) {
            logStructureGps('Realtime postgres_changes (dispatch id)', row);
          }
          mergeDispatchUpdateIntoState(payload);
          scheduleSilentRefetch();
        }
      );

    ch.subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [activeMission?.id, mergeDispatchUpdateIntoState, scheduleSilentRefetch]);

  /** Position victime : dépend de incident_id (corrigé : avant, jamais souscrit si mission chargée après le mount) */
  useEffect(() => {
    if (!activeMission?.incident_id) return;

    const incidentChannelId = `incident-geo-${activeMission.incident_id}`;
    const incidentChannel = supabase
      .channel(incidentChannelId)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'incidents',
          filter: `id=eq.${activeMission.incident_id}`,
        },
        (payload: any) => {
          const newData = payload.new;
          const newLat = toNullableNumber(newData.caller_realtime_lat ?? newData.location_lat);
          const newLng = toNullableNumber(newData.caller_realtime_lng ?? newData.location_lng);
          if (newLat == null || newLng == null) return;
          console.log(`📡 [MAJ POSITION VICTIME TEMPS RÉEL] : ${newLat}, ${newLng}`);
          setActiveMission((prev) =>
            prev
              ? {
                  ...prev,
                  location: {
                     ...prev.location,
                     lat: newLat,
                     lng: newLng,
                     address: newData.location_address ?? prev.location.address,
                     commune: newData.commune ?? prev.location.commune,
                  },
                }
              : null
          );
        }
      );

    incidentChannel.subscribe();

    return () => {
      supabase.removeChannel(incidentChannel);
    };
  }, [activeMission?.incident_id]);

  const updateDispatchStatus = async (status: 'en_route' | 'on_scene' | 'en_route_hospital' | 'arrived_hospital' | 'completed') => {
    if (!activeMission) return;

    try {
      const updateData: any = { status };
      if (status === 'on_scene') updateData.arrived_at = new Date().toISOString();
      if (status === 'arrived_hospital') updateData.arrived_at = new Date().toISOString();
      if (status === 'completed') updateData.completed_at = new Date().toISOString();

      // 1. Update active dispatch
      console.log(`[Mission] 🔄 Updating dispatch ${activeMission.id} → ${status}`);
      const { error: dispatchError } = await supabase
        .from('dispatches')
        .update(updateData)
        .eq('id', activeMission.id);

      if (dispatchError) {
        console.error('[Mission] ❌ STEP 1 FAILED — dispatches UPDATE:', dispatchError.message, dispatchError.details);
        throw dispatchError;
      }
      console.log('[Mission] ✅ Step 1 — dispatch updated');
      
      // 2. Update incident status for the Admin dashboard
      // dispatches uses 'on_scene' but incidents enum uses 'arrived'
      const incidentStatusMap: Record<string, string> = {
        en_route: 'en_route',
        on_scene: 'arrived',
        en_route_hospital: 'en_route_hospital',
        arrived_hospital: 'arrived_hospital',
        completed: 'resolved',
      };
      const incidentStatus = incidentStatusMap[status] || status;
      
      const { error: incidentError } = await supabase
        .from('incidents')
        .update({
          status: incidentStatus,
          ...(incidentStatus === 'resolved' ? { resolved_at: new Date().toISOString() } : {}),
        })
        .eq('id', activeMission.incident_id);

      if (incidentError) console.error('[Mission] ⚠️ Step 2 — incident update failed:', incidentError.message);
      else console.log(`[Mission] ✅ Step 2 — incident → ${incidentStatus}`);

      // 3. Sync active_rescuers.status → trigger → units.status
      const rescuerStatusMap: Record<string, string> = {
        en_route: 'en_route',
        on_scene: 'on_scene',
        en_route_hospital: 'en_route',
        arrived_hospital: 'on_scene',
        completed: 'active',
      };
      const rescuerStatus = rescuerStatusMap[status] || 'active';

      const userId = (await supabase.auth.getUser()).data.user?.id;
      if (userId) {
        const { error: rescuerError } = await supabase
          .from('active_rescuers')
          .update({ status: rescuerStatus, updated_at: new Date().toISOString() })
          .eq('user_id', userId);
        
        if (rescuerError) console.error('[MissionProvider] Error syncing rescuer status:', rescuerError.message);
        else console.log(`[Mission] ✅ Rescuer status → ${rescuerStatus}`);
      }
      // Update local state immediately
      if (status === 'completed') {
        // Mission terminée → vider immédiatement pour que le HomeTab affiche "Standby"
        setActiveMission(null);
      } else {
        setActiveMission(prev => prev ? { ...prev, dispatch_status: status } : null);
      }
    } catch (err: any) {
      console.error('[MissionProvider] Update error:', err.message);
      throw err;
    }
  };

  const updateMissionDetails = async (details: Partial<Mission> & { assessment?: any }) => {
    if (!activeMission) return;

    try {
      // Pour l'instant, on sauvegarde l'évaluation dans la description de l'incident
      if (details.assessment) {
        const assessmentText = ` [ÉVALUATION] Conscience: ${details.assessment.conscious ? 'Oui' : 'Non'}, Respiration: ${details.assessment.breathing ? 'Oui' : 'Non'}, Gravité: ${details.assessment.severity}`;
        
        const { error } = await supabase
          .from('incidents')
          .update({ 
            description: (activeMission.description || '') + assessmentText 
          })
          .eq('id', activeMission.incident_id);

        if (error) throw error;
      }
      
      setActiveMission(prev => prev ? { ...prev, ...details } : null);
    } catch (err: any) {
      console.error('[MissionProvider] Update details error:', err.message);
      throw err;
    }
  };

  const fetchHospitals = async (): Promise<Hospital[]> => {
    try {
      const { data, error } = await supabase
        .from('health_structures')
        .select('*')
        .limit(20);

      if (error) throw error;

      return (data || []).map(h => ({
        id: h.id,
        name: h.name,
        specialty: h.category,
        address: h.address,
        coords: { 
          latitude: h.location_lat || -4.32, 
          longitude: h.location_lng || 15.3 
        }
      }));
    } catch (err: any) {
      console.error('[MissionProvider] Fetch hospitals error:', err.message);
      return [];
    }
  };

  return (
    <MissionContext.Provider value={{ 
      activeMission, 
      isLoading, 
      error, 
      refresh, 
      updateDispatchStatus,
      updateMissionDetails,
      fetchHospitals
    }}>
      {children}
    </MissionContext.Provider>
  );
}

export function useMission() {
  const context = useContext(MissionContext);
  if (context === undefined) {
    throw new Error('useMission must be used within a MissionProvider');
  }
  return context;
}
