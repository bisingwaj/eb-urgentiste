import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { Alert, Vibration, DeviceEventEmitter } from 'react-native';
import { supabase } from '../lib/supabase';
import { uploadIncidentTerrainPhotoToStorage } from '../lib/incidentTerrainPhotos';
import { useAuth } from './AuthContext';
import { Mission, normalizeHospitalStatus, HospitalSuggestion, SosResponseItem } from '../types/mission';
import { readMissionCache, writeMissionCache } from '../lib/localAppCache';
import { APP_FOREGROUND_SYNC } from '../lib/syncEvents';
import { haversineMeters } from '../lib/mapbox';

/** Normalise une chaîne pour comparaison (minuscule, sans accents, sans espaces superflus) */
function normalizeStr(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v)
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

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
  incident_at?: string | null;
  incident_updated_at?: string | null;
  notes?: string | null;
  recommended_actions?: string | null;
  sos_responses?: SosResponseItem[] | null;
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
  hospital_data?: unknown;
  hospital_status?: string | null;
  hospital_notes?: string | null;
  suggested_hospitals?: any[];
  suggested_hospitals_computed_at?: string | null;
  suggested_hospitals_origin_lat?: number | null;
  suggested_hospitals_origin_lng?: number | null;
  created_at: string;
  dispatched_at?: string | null;
  arrived_at?: string | null;
  completed_at?: string | null;
  updated_at?: string | null;
  dispatch_notes?: string | null;
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

// HospitalSuggestion est déjà importé de '../types/mission'
function normalizeHospitalSuggestions(raw: any[] | null | undefined): HospitalSuggestion[] {
  if (!raw || !Array.isArray(raw)) return [];
  return raw.map((h: any, idx: number) => ({
    rank: h.rank ?? (idx + 1),
    id: h.id || String(idx),
    name: h.name || 'Hôpital Inconnu',
    type: h.type || 'Hopital',
    lat: h.lat ?? h.latitude ?? 0,
    lng: h.lng ?? h.longitude ?? 0,
    address: h.address || null,
    phone: h.phone || null,
    capacity: h.capacity ?? h.capacite_totale ?? null,
    availableBeds: h.availableBeds ?? h.available_beds ?? h.lits_disponibles ?? 0,
    specialties: Array.isArray(h.specialties) ? h.specialties : [],
    distanceKm: h.distanceKm ?? h.distance_km ?? 0,
    etaMin: h.etaMin ?? h.eta_min ?? 0,
    score: h.score ?? 0,
    isSelected: !!h.isSelected,
  }));
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
  /** Récupérant les hôpitaux depuis le snapshot serveur de la mission */
  fetchHospitals: () => Promise<HospitalSuggestion[]>;
  /** Demande d'affectation à une structure par l'urgentiste */
  requestHospitalAssignment: (hospitalId: string, hospital: HospitalSuggestion) => Promise<void>;
  /** Annule la demande d'affectation en cours */
  cancelHospitalAssignment: () => Promise<void>;
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
          suggested_hospitals,
          suggested_hospitals_computed_at,
          suggested_hospitals_origin_lat,
          suggested_hospitals_origin_lng,
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
            media_urls,
            sos_responses(*),
            notes
          )
        `.trim()
        )
        .eq('unit_id', unitId)
        .in('status', ['dispatched', 'en_route', 'on_scene', 'en_route_hospital', 'arrived_hospital', 'mission_end'])
        .neq('incidents.status', 'resolved')
        .neq('incidents.status', 'archived')
        .neq('incidents.status', 'ended')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (dispatchError) throw dispatchError;

      if (data) {
        const d = data as any;
        console.log(`[MissionContext] 🔍 Mission Detected:`, {
          id: d.id,
          status: d.status,
          has_suggestions: !!d.suggested_hospitals?.length,
          suggestions_count: d.suggested_hospitals?.length || 0,
          computed_at: d.suggested_hospitals_computed_at
        });
      }

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

        const row = dispatch as unknown as SupabaseDispatch;
        const hospital_status = normalizeHospitalStatus(row.hospital_status);
        const hospital_notes = row.hospital_notes || null;

        if (row.assigned_structure_id != null) {
          logStructureGps('fetchActiveMission', row as unknown as Record<string, unknown>);
        }

        const mission: Mission = {
          id: String(row.id),
          incident_id: String(row.incident_id),
          reference: incident.reference,
          type: incident.type,
          title: incident.title,
          description: incident.description,
          priority: incident.priority,
          incident_status: incident.status,
          dispatch_status: row.status as Mission['dispatch_status'],
          location: {
            lat: incident.location_lat,
            lng: incident.location_lng,
            address: incident.location_address,
            commune: incident.commune,
          },
          caller: {
            name: incident.caller_name || 'Anonyme',
            phone: incident.caller_phone || '',
            age: (incident as any).age || null,
            gender: (incident as any).gender || (incident as any).caller_gender || null,
            height: (incident as any).height || null,
          },
          citizen_id: incident.citizen_id,
          created_at: row.created_at,
          dispatched_at: row.dispatched_at || undefined,
          arrived_at: row.arrived_at || undefined,
          completed_at: row.completed_at || undefined,
          dispatch_notes: row.dispatch_notes,
          incident_notes: incident.notes,
          incident_at: incident.incident_at,
          incident_updated_at: incident.incident_updated_at,
          recommended_actions: incident.recommended_actions,
          caller_realtime_lat: incident.caller_realtime_lat,
          caller_realtime_lng: incident.caller_realtime_lng,
          caller_realtime_updated_at: incident.caller_realtime_updated_at,
          sos_responses: incident.sos_responses || [],
          media_urls: incident.media_urls,
          hospital_status,
          hospital_notes,
          hospital_data: row.hospital_data as Record<string, unknown> | null,
          suggested_hospitals: normalizeHospitalSuggestions(row.suggested_hospitals),
          suggested_hospitals_computed_at: row.suggested_hospitals_computed_at || null,
          suggested_hospitals_origin_lat: row.suggested_hospitals_origin_lat || null,
          suggested_hospitals_origin_lng: row.suggested_hospitals_origin_lng || null,
          updated_at: row.updated_at || null,
          assigned_structure: buildAssignedStructureFromDispatchRow(row),
          incident,
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
    const n = (payload.new || {}) as any;
    if (!n.id) return;
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
        hospital_data: hospital_data ?? prev.hospital_data,
        suggested_hospitals: normalizeHospitalSuggestions(n.suggested_hospitals ?? prev.suggested_hospitals),
        suggested_hospitals_computed_at: (n.suggested_hospitals_computed_at as string) ?? prev.suggested_hospitals_computed_at,
        dispatched_at: (n.dispatched_at as string) ?? prev.dispatched_at,
        arrived_at: (n.arrived_at as string) ?? prev.arrived_at,
        completed_at: (n.completed_at as string) ?? prev.completed_at,
        dispatch_notes: (n.dispatch_notes as string) ?? prev.dispatch_notes,
        updated_at: (n.updated_at as string) ?? prev.updated_at,
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

  /** Surveillance Réactive : Clôture de l'incident parent (Backend Safety) */
  useEffect(() => {
    if (!activeMission?.incident_id) return;

    const channelId = `incident-sync-${activeMission.incident_id}`;
    const channel = supabase
      .channel(channelId)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'incidents',
          filter: `id=eq.${activeMission.incident_id}`,
        },
        (payload) => {
          const newStatus = payload.new?.status;
          if (['resolved', 'ended', 'archived', 'declasse'].includes(newStatus)) {
            console.log(`[MissionContext] 🛑 Closure detected on incident level (${newStatus}) -> Clearing state.`);
            setActiveMission(null);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeMission?.incident_id]);

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
      // CRITICAL: Per architecture docs, DO NOT touch incident status on 'completed'.
      // The incident must remain in its current state (likely arrived_hospital) for the hospital to process.
      if (status !== 'completed') {
        const incidentStatusMap: Record<string, string> = {
          en_route: 'en_route',
          on_scene: 'arrived',
          en_route_hospital: 'en_route_hospital',
          arrived_hospital: 'arrived_hospital',
          mission_end: 'arrived_hospital', // DO NOT use ended/resolved here
          mission_finished: 'resolved',
        };
        const incidentStatus = incidentStatusMap[status];

        if (incidentStatus) {
          console.log(`[MissionContext] 🛠 Updating incident ${activeMission.incident_id} to status: ${incidentStatus}`);
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
        } else {
          console.log(`[MissionContext] ℹ️ Skipping incident update for status: ${status} (No valid mapping)`);
        }
      } else {
        console.log(`[MissionContext] 🛡 Architecture Guard: Skipping incident update on 'completed' status.`);
      }

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

      // 4. Update units table status for dashboard visibility
      const unitStatusMap: Record<string, string> = {
        en_route: 'en_route',
        on_scene: 'on_scene',
        en_route_hospital: 'en_route',
        arrived_hospital: 'on_scene',
        mission_end: 'available',
        completed: 'available',
      };
      const nextUnitStatus = unitStatusMap[status];
      if (nextUnitStatus && profile?.assigned_unit_id) {
        console.log(`[MissionContext] 🚑 Updating unit ${profile.assigned_unit_id} status to: ${nextUnitStatus}`);
        promises.push(
          supabase
            .from('units')
            .update({ status: nextUnitStatus })
            .eq('id', profile.assigned_unit_id)
            .then(({ error }) => {
              if (error) console.error('[Mission] ⚠️ Unit status sync failed:', error.message);
              return { type: 'unit', error };
            })
        );
      }

      // Execute all updates in parallel
      const results = await Promise.all(promises);
      const criticalError = results.find(r => r.type === 'dispatch' && r.error);
      if (criticalError?.error) {
        throw criticalError.error;
      }

      console.log('[Mission] ✅ All parallel updates triggered');
      // Update local state immediately
      if (status === 'completed' || status === 'mission_end') {
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
          .filter(([key]) => key !== 'assessment_completed_at' && key !== 'careChecklist')
          .map(([key, val]) => `${key}: ${val === true ? 'Oui' : val === false ? 'Non' : val}`);

        const assessmentText = ` [ÉVALUATION] ${assessmentFields.join(', ')}`;

        // Exécution en parallèle pour performance
        const p1 = supabase
          .from('incidents')
          .update({
            description: (activeMission.description || '') + assessmentText
          })
          .eq('id', activeMission.incident_id);

        // 2. Version structurée persistée dans hospital_data (pour être sûr que la colonne existe)
        const medicalAssessment = {
          ...details.assessment,
          assessment_completed_at: new Date().toISOString()
        };

        const p2 = supabase
          .from('dispatches')
          .update({
            hospital_data: {
              ...(activeMission.hospital_data || {}),
              medicalAssessment
            }
          })
          .eq('id', activeMission.id);

        const [r1, r2] = await Promise.all([p1, p2]);
        if (r1.error) console.error('[MissionContext] Legacy description update error:', r1.error.message);
        if (r2.error) console.error('[MissionContext] hospital_data sync error:', r2.error.message);
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

  const fetchHospitals = async (): Promise<HospitalSuggestion[]> => {
    if (!activeMission) return [];
    return activeMission.suggested_hospitals || [];
  };

  const requestHospitalAssignment = async (hospitalId: string, hospital: HospitalSuggestion) => {
    if (!activeMission) return;

    try {
      console.log(`[MissionContext] 🏥 Finalizing assignment to: ${hospital.name}`);

      const { error } = await supabase
        .from('dispatches')
        .update({
          assigned_structure_id: hospitalId,
          assigned_structure_name: hospital.name,
          assigned_structure_lat: hospital.lat,
          assigned_structure_lng: hospital.lng,
          assigned_structure_phone: hospital.phone,
          assigned_structure_address: hospital.address ?? null,
          assigned_structure_type: hospital.type ?? null,
          hospital_status: 'pending',
          hospital_notes: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', activeMission.id);

      if (error) throw error;
      refresh();
    } catch (err: any) {
      console.error('[MissionContext] requestHospitalAssignment error:', err.message);
      throw err;
    }
  };

  const cancelHospitalAssignment = async () => {
    if (!activeMission) return;

    try {
      console.log(`[MissionContext] 🚫 Cancelling assignment request for mission: ${activeMission.id}`);

      const { error } = await supabase
        .from('dispatches')
        .update({
          assigned_structure_id: null,
          assigned_structure_name: null,
          assigned_structure_lat: null,
          assigned_structure_lng: null,
          assigned_structure_phone: null,
          assigned_structure_address: null,
          assigned_structure_type: null,
          hospital_status: null,
          hospital_notes: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', activeMission.id);

      if (error) throw error;
      refresh();
    } catch (err: any) {
      console.error('[MissionContext] cancelHospitalAssignment error:', err.message);
      throw err;
    }
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
      fetchHospitals,
      requestHospitalAssignment,
      cancelHospitalAssignment
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
