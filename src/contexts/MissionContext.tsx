import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { Alert, Vibration, DeviceEventEmitter } from 'react-native';
import { supabase } from '../lib/supabase';
import { uploadIncidentTerrainPhotoToStorage } from '../lib/incidentTerrainPhotos';
import { useAuth } from './AuthContext';
import { Mission, normalizeHospitalStatus } from '../types/mission';
import { readMissionCache, writeMissionCache } from '../lib/localAppCache';
import { APP_FOREGROUND_SYNC } from '../lib/syncEvents';

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
  /** URLs Storage / HTTPS — photos terrain ajoutées par l’urgentiste */
  media_urls?: string[] | null;
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
  hospital_status?: string | null;
  hospital_notes?: string | null;
  hospital_data?: unknown;
  created_at: string;
  incidents: SupabaseIncident;
}

/** Coordonnées structure : seulement si `hospital_status === 'accepted'` (contrat Lovable). */
function buildAssignedStructureFromDispatchRow(d: Partial<SupabaseDispatch>): Mission['assigned_structure'] | null {
  const id = d.assigned_structure_id;
  if (id == null || id === '') return null;
  const hs = normalizeHospitalStatus(d.hospital_status);
  const revealCoords = hs === 'accepted';
  return {
    id: String(id),
    name: d.assigned_structure_name || 'Structure',
    lat: revealCoords ? toNullableNumber(d.assigned_structure_lat) : null,
    lng: revealCoords ? toNullableNumber(d.assigned_structure_lng) : null,
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
  updateDispatchStatus: (
    status: 'en_route' | 'on_scene' | 'en_route_hospital' | 'arrived_hospital' | 'mission_end' | 'completed',
  ) => Promise<void>;
  updateMissionDetails: (details: Partial<Mission> & { assessment?: any }) => Promise<void>;
  /** Photo terrain : upload Storage + append `incidents.media_urls`. Passer `meta` si `activeMission` peut être absent (ex. état restauré). */
  appendIncidentTerrainPhoto: (
    localUri: string,
    mimeType: string,
    meta?: { incidentId: string; previousUrls?: string[] | null },
  ) => Promise<void>;
  /** Désactivé pour l’urgentiste (affectation via `dispatches.assigned_structure_*` uniquement). */
  fetchHospitals: () => Promise<Hospital[]>;
}

const MissionContext = createContext<MissionContextType | undefined>(undefined);

export function MissionProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [activeMission, setActiveMission] = useState<Mission | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeMissionRef = useRef<Mission | null>(null);
  /** Un seul « chargement » visible par unité : premier fetch sans cache, pas les refetch Realtime. */
  const firstSilentFetchForUnitRef = useRef(true);
  useEffect(() => {
    activeMissionRef.current = activeMission;
  }, [activeMission]);

  const fetchActiveMission = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    const unitId = profile?.assigned_unit_id;
    if (!unitId) {
      setIsLoading(false);
      setActiveMission(null);
      return;
    }

    try {
      if (!silent) setIsLoading(true);
      else if (firstSilentFetchForUnitRef.current && !activeMissionRef.current) setIsLoading(true);
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
            created_at,
            media_urls
          )
        `.trim()
        )
        .eq('unit_id', unitId)
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

        const row = dispatch as unknown as Record<string, unknown>;
        const hospital_status = normalizeHospitalStatus(row.hospital_status);
        const hospital_notes =
          row.hospital_notes === null || typeof row.hospital_notes === 'string'
            ? (row.hospital_notes as string | null)
            : null;
        const hospital_data =
          row.hospital_data !== null &&
          typeof row.hospital_data === 'object' &&
          !Array.isArray(row.hospital_data)
            ? (row.hospital_data as Record<string, unknown>)
            : null;

        const assignedStructure = buildAssignedStructureFromDispatchRow({
          ...(dispatch as Partial<SupabaseDispatch>),
          hospital_status: hospital_status ?? undefined,
        });

        if (assignedStructure) {
          console.log(
            `🏥 [STRUCTURE ASSIGNÉE] ${assignedStructure.name} — hospital_status=${hospital_status ?? 'null'} — coords ${assignedStructure.lat != null ? 'visibles' : 'masquées'}`,
          );
          logStructureGps('fetchActiveMission', dispatch as unknown as Record<string, unknown>);
        }

        const mission: Mission = {
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
          hospital_status,
          hospital_notes,
          hospital_data,
        };
        setActiveMission(mission);
        void writeMissionCache(unitId, mission);
      } else {
        setActiveMission(null);
        void writeMissionCache(unitId, null);
      }
    } catch (err: any) {
      console.error('[MissionProvider] Fetch error:', err.message);
      setError(err.message);
    } finally {
      setIsLoading(false);
      firstSilentFetchForUnitRef.current = false;
    }
  }, [profile?.assigned_unit_id]);

  const scheduleSilentRefetch = useCallback(() => {
    if (fetchDebounceRef.current) clearTimeout(fetchDebounceRef.current);
    fetchDebounceRef.current = setTimeout(() => {
      fetchDebounceRef.current = null;
      fetchActiveMission({ silent: true });
    }, 120);
  }, [fetchActiveMission]);

  /** Fusion légère : statuts / hôpital : `assigned_structure` est recalculé au `scheduleSilentRefetch` (évite payloads partiels). */
  const mergeDispatchUpdateIntoState = useCallback((payload: { new?: Record<string, unknown> }) => {
    const n = payload.new;
    if (!n?.id) return;
    setActiveMission((prev) => {
      if (!prev || String(prev.id) !== String(n.id)) return prev;
      const hospital_status =
        n.hospital_status !== undefined ? normalizeHospitalStatus(n.hospital_status) : prev.hospital_status;
      const hospital_notes =
        n.hospital_notes !== undefined
          ? n.hospital_notes === null || typeof n.hospital_notes === 'string'
            ? (n.hospital_notes as string | null)
            : prev.hospital_notes
          : prev.hospital_notes;
      const hospital_data =
        n.hospital_data !== undefined
          ? n.hospital_data !== null &&
            typeof n.hospital_data === 'object' &&
            !Array.isArray(n.hospital_data)
            ? (n.hospital_data as Record<string, unknown>)
            : null
          : prev.hospital_data;
      const dispatch_status = (n.status as Mission['dispatch_status']) ?? prev.dispatch_status;
      return {
        ...prev,
        dispatch_status,
        hospital_status: hospital_status ?? prev.hospital_status,
        hospital_notes,
        hospital_data,
      };
    });
  }, []);

  const refresh = useCallback(() => fetchActiveMission({ silent: true }), [fetchActiveMission]);

  /** Hydratation cache locale puis sync silencieuse (pas de spinner bloquant). */
  useEffect(() => {
    let cancelled = false;
    firstSilentFetchForUnitRef.current = true;
    (async () => {
      if (!profile?.assigned_unit_id) {
        setActiveMission(null);
        return;
      }
      const uid = profile.assigned_unit_id;
      const cached = await readMissionCache(uid);
      if (cancelled) return;
      if (cached) {
        activeMissionRef.current = cached;
        setActiveMission(cached);
      }
      await fetchActiveMission({ silent: true });
    })();
    return () => {
      cancelled = true;
    };
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
          void fetchActiveMission({ silent: true });
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
          const hasGeo = newLat != null && newLng != null;
          const mediaPatch =
            newData.media_urls !== undefined && Array.isArray(newData.media_urls)
              ? (newData.media_urls as string[]).filter((u) => typeof u === 'string' && u.length > 0)
              : null;

          if (hasGeo) {
            console.log(`📡 [MAJ POSITION VICTIME TEMPS RÉEL] : ${newLat}, ${newLng}`);
          }
          if (!hasGeo && !mediaPatch) return;

          setActiveMission((prev) => {
            if (!prev) return null;
            return {
              ...prev,
              ...(hasGeo
                ? {
                    location: {
                      ...prev.location,
                      lat: newLat!,
                      lng: newLng!,
                      address: newData.location_address ?? prev.location.address,
                      commune: newData.commune ?? prev.location.commune,
                    },
                  }
                : {}),
              ...(mediaPatch ? { media_urls: mediaPatch } : {}),
            };
          });
        }
      );

    incidentChannel.subscribe();

    return () => {
      supabase.removeChannel(incidentChannel);
    };
  }, [activeMission?.incident_id]);

  const updateDispatchStatus = async (
    status: 'en_route' | 'on_scene' | 'en_route_hospital' | 'arrived_hospital' | 'mission_end' | 'completed',
  ) => {
    if (!activeMission) return;

    if (status === 'en_route_hospital' && activeMission.hospital_status !== 'accepted') {
      Alert.alert(
        'Hôpital non confirmé',
        "L'établissement doit d'abord accepter la prise en charge avant le départ vers l'hôpital.",
      );
      return;
    }

    try {
      const updateData: Record<string, unknown> = { status };
      if (status === 'on_scene') updateData.arrived_at = new Date().toISOString();
      if (status === 'arrived_hospital') updateData.arrived_at = new Date().toISOString();
      if (status === 'completed') updateData.completed_at = new Date().toISOString();

      // Prepare promises for parallel execution
      const promises = [];

      // 1. Update active dispatch
      console.log(`[Mission] 🔄 Parallelizing update: dispatch ${activeMission.id} → ${status}`);
      promises.push(
        supabase
          .from('dispatches')
          .update(updateData)
          .eq('id', activeMission.id)
          .then(({ error }) => {
            if (error) console.error('[Mission] ❌ Dispatch update failed:', error.message);
            return { type: 'dispatch', error };
          })
      );

      // 2. incidents.status
      const incidentStatusMap: Record<string, string> = {
        en_route: 'en_route',
        on_scene: 'arrived',
        en_route_hospital: 'en_route_hospital',
        arrived_hospital: 'arrived_hospital',
        mission_end: 'ended',
        completed: 'resolved',
      };
      const incidentStatus = incidentStatusMap[status] || status;
      promises.push(
        supabase
          .from('incidents')
          .update({
            status: incidentStatus,
            ...(incidentStatus === 'resolved' ? { resolved_at: new Date().toISOString() } : {}),
          })
          .eq('id', activeMission.incident_id)
          .then(({ error }) => {
            if (error) console.error('[Mission] ⚠️ Incident update failed:', error.message);
            return { type: 'incident', error };
          })
      );

      // 3. Sync active_rescuers.status
      const rescuerStatusMap: Record<string, string> = {
        en_route: 'en_route',
        on_scene: 'on_scene',
        en_route_hospital: 'en_route',
        arrived_hospital: 'on_scene',
        mission_end: 'active',
        completed: 'active',
      };
      const rescuerStatus = rescuerStatusMap[status] || 'active';

      promises.push(
        (async () => {
          const uData = await supabase.auth.getUser();
          const userId = uData.data.user?.id;
          if (userId) {
            const { error } = await supabase
              .from('active_rescuers')
              .update({ status: rescuerStatus, updated_at: new Date().toISOString() })
              .eq('user_id', userId);
            if (error) console.error('[Mission] ⚠️ Rescuer status sync failed:', error.message);
            return { type: 'rescuer', error };
          }
          return { type: 'rescuer', error: null };
        })()
      );

      // Execute all updates in parallel
      const results = await Promise.all(promises);
      const criticalError = results.find(r => r.type === 'dispatch' && r.error);
      if (criticalError?.error) {
        throw criticalError.error;
      }

      console.log('[Mission] ✅ All parallel updates triggered');
      // Update local state immediately
      if (status === 'completed') {
        // Mission terminée → vider immédiatement pour que le HomeTab affiche "Standby"
        setActiveMission(null);
      } else {
        setActiveMission(prev => (prev ? { ...prev, dispatch_status: status } : null));
      }
    } catch (err: any) {
      console.error('[MissionProvider] Update error:', err.message);
      throw err;
    }
  };

  const updateMissionDetails = async (details: Partial<Mission> & { assessment?: any }) => {
    if (!activeMission) return;

    try {
      // SAUVEGARDE DU BILAN MÉDICAL
      if (details.assessment) {
        // 1. Version texte pour compatibilité héritée (Incidents.description)
        const assessmentFields = Object.entries(details.assessment)
          .filter(([key]) => key !== 'assessment_completed_at')
          .map(([key, val]) => `${key}: ${val === true ? 'Oui' : val === false ? 'Non' : val}`);
        
        const assessmentText = ` [ÉVALUATION] ${assessmentFields.join(', ')}`;
        
        // Exécution en parallèle pour performance
        const p1 = supabase
          .from('incidents')
          .update({ 
            description: (activeMission.description || '') + assessmentText 
          })
          .eq('id', activeMission.incident_id);

        // 2. Version structurée pour le futur (Dispatches.medical_assessment)
        const p2 = supabase
          .from('dispatches')
          .update({ 
            medical_assessment: {
              ...details.assessment,
              assessment_completed_at: new Date().toISOString()
            } 
          })
          .eq('id', activeMission.id);

        const [r1, r2] = await Promise.all([p1, p2]);
        if (r1.error) console.error('[MissionContext] Legacy description update error:', r1.error.message);
        if (r2.error) {
          console.warn('[MissionContext] Medical assessment JSONB update error (column might not exist yet):', r2.error.message);
          // On ne bloque pas si la colonne n'est pas encore là
        }
      }
      
      setActiveMission(prev => prev ? { ...prev, ...details } : null);
    } catch (err: any) {
      console.error('[MissionProvider] Update details error:', err.message);
      throw err;
    }
  };

  const appendIncidentTerrainPhoto = async (
    localUri: string,
    mimeType: string,
    meta?: { incidentId: string; previousUrls?: string[] | null },
  ) => {
    const incidentId = meta?.incidentId ?? activeMission?.incident_id;
    if (!incidentId) {
      throw new Error('Aucun incident lié à cette mission.');
    }

    try {
      const publicUrl = await uploadIncidentTerrainPhotoToStorage(incidentId, localUri, mimeType);
      const prevUrls =
        meta?.previousUrls != null
          ? meta.previousUrls.filter((u) => typeof u === 'string' && u.length > 0)
          : activeMission?.incident_id === incidentId
            ? activeMission.media_urls ?? []
            : [];
      const nextUrls = [...prevUrls, publicUrl];

      const { error } = await supabase
        .from('incidents')
        .update({ media_urls: nextUrls })
        .eq('id', incidentId);

      if (error) throw error;

      setActiveMission((p) =>
        p && p.incident_id === incidentId ? { ...p, media_urls: nextUrls } : p,
      );
      await fetchActiveMission({ silent: true });
    } catch (err: any) {
      console.error('[MissionProvider] appendIncidentTerrainPhoto:', err.message);
      throw err;
    }
  };

  const fetchHospitals = async (): Promise<Hospital[]> => {
    /** L’urgentiste n’utilise pas `health_structures` pour l’affectation (voir workflow Lovable). */
    return [];
  };

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(APP_FOREGROUND_SYNC, () => {
      void fetchActiveMission({ silent: true });
    });
    return () => sub.remove();
  }, [fetchActiveMission]);

  return (
    <MissionContext.Provider value={{ 
      activeMission, 
      isLoading, 
      error, 
      refresh, 
      updateDispatchStatus,
      updateMissionDetails,
      appendIncidentTerrainPhoto,
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
