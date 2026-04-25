import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { supabase } from "../../../lib/supabase";
import { haversineMeters } from "../../../lib/mapbox";

/** Rayon d’affichage et de chargement (10 km) — requêtes bbox + filtre haversine */
export const MAP_VIEW_RADIUS_M = 10_000;

export const MAX_HOSPITAL_MARKERS_MAP = 72;
export const MAX_RESCUER_MARKERS_MAP = 36;
export const MAX_INCIDENT_MARKERS_MAP = 40;

const MAP_FETCH_INTERVAL_MS = 30_000;
const INCIDENT_REFETCH_DEBOUNCE_MS = 650;
const RESCUER_REALTIME_DEBOUNCE_MS = 140;

export function takeNearestByDistance<T>(
  items: T[],
  userLngLat: [number, number],
  getLngLat: (item: T) => [number, number] | null,
  max: number,
): T[] {
  const scored = items
    .map((item) => {
      const c = getLngLat(item);
      if (!c) return null;
      return { item, d: haversineMeters(userLngLat, c) };
    })
    .filter((x): x is { item: T; d: number } => x != null)
    .sort((a, b) => a.d - b.d);
  return scored.slice(0, max).map((x) => x.item);
}

export function approximateLatLngBounds(lat: number, lng: number, radiusM: number) {
  const dLat = radiusM / 111320;
  const cos = Math.cos((lat * Math.PI) / 180);
  const dLng = radiusM / (111320 * Math.max(cos, 0.1));
  return {
    minLat: lat - dLat,
    maxLat: lat + dLat,
    minLng: lng - dLng,
    maxLng: lng + dLng,
  };
}

export const ESTABLISHMENT_TYPE_KEYS = [
  "hopital",
  "clinique",
  "pharmacie",
  "centre_sante",
  "maternite",
  "dispensaire",
  "laboratoire",
  "autre",
] as const;

export const ESTABLISHMENT_TYPE_LABELS: Record<(typeof ESTABLISHMENT_TYPE_KEYS)[number], string> = {
  hopital: "Hôpital",
  clinique: "Clinique",
  pharmacie: "Pharmacie",
  centre_sante: "Centre de santé",
  maternite: "Maternité",
  dispensaire: "Dispensaire",
  laboratoire: "Laboratoire",
  autre: "Autre",
};

export const KNOWN_ESTABLISHMENT_TYPES = new Set<string>(
  ESTABLISHMENT_TYPE_KEYS.filter((k) => k !== "autre"),
);

export function normalizeEstablishmentType(type: string | null | undefined): string {
  const raw = (type ?? "").trim().toLowerCase().replace(/-/g, "_");
  if (!raw) return "autre";
  if (KNOWN_ESTABLISHMENT_TYPES.has(raw)) return raw;
  return "autre";
}

export function defaultEstablishmentFilter(): Record<string, boolean> {
  const o: Record<string, boolean> = {};
  for (const k of ESTABLISHMENT_TYPE_KEYS) o[k] = true;
  return o;
}

export function establishmentTypeLabel(type: string | null | undefined): string {
  const k = normalizeEstablishmentType(type);
  return (
    ESTABLISHMENT_TYPE_LABELS[k as keyof typeof ESTABLISHMENT_TYPE_LABELS] ??
    "Établissement"
  );
}

export interface RescuerData {
  id: string;
  user_id: string;
  lat: number;
  lng: number;
  speed: number | null;
  heading: number | null;
  battery: number | null;
  status: string;
  updated_at: string;
}

export interface HospitalData {
  id: string;
  name: string;
  short_name: string | null;
  lat: number | null;
  lng: number | null;
  available_beds: number;
  is_open: boolean;
  type: string | null;
}

export interface IncidentData {
  id: string;
  reference: string;
  type: string;
  priority: string;
  status: string;
  location_lat: number | null;
  location_lng: number | null;
  caller_realtime_lat: number | null;
  caller_realtime_lng: number | null;
  title: string;
}

export function incidentLngLat(inc: IncidentData): [number, number] | null {
  const lat = inc.caller_realtime_lat ?? inc.location_lat;
  const lng = inc.caller_realtime_lng ?? inc.location_lng;
  if (lat == null || lng == null) return null;
  return [lng, lat];
}

export type PoiSelection =
  | { kind: "incident"; data: IncidentData }
  | { kind: "hospital"; data: HospitalData }
  | { kind: "rescuer"; data: RescuerData };

export function useLiveMapData(
  isFocused: boolean,
  myCoords: { latitude: number; longitude: number },
  selection: PoiSelection | null,
  authUserId?: string
) {
  const [rescuers, setRescuers] = useState<RescuerData[]>([]);
  const [hospitals, setHospitals] = useState<HospitalData[]>([]);
  const [incidents, setIncidents] = useState<IncidentData[]>([]);
  const [rescuerNames, setRescuerNames] = useState<Record<string, string>>({});

  const [establishmentTypeFilter, setEstablishmentTypeFilter] = useState<
    Record<string, boolean>
  >(() => defaultEstablishmentFilter());

  const incidentFetchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rescuerRealtimeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchData = useCallback(async () => {
    const lat = myCoords.latitude;
    const lng = myCoords.longitude;
    const b = approximateLatLngBounds(lat, lng, MAP_VIEW_RADIUS_M);

    const { data: r } = await supabase
      .from("active_rescuers")
      .select("id, user_id, lat, lng, speed, heading, battery, status, updated_at")
      .neq("status", "offline")
      .not("lat", "is", null)
      .not("lng", "is", null)
      .gte("lat", b.minLat)
      .lte("lat", b.maxLat)
      .gte("lng", b.minLng)
      .lte("lng", b.maxLng);
    
    if (r) {
      setRescuers(r as RescuerData[]);
      const uids = r.map(x => x.user_id).filter(Boolean);
      if (uids.length > 0) {
        const { data: names } = await supabase
          .from('users_directory')
          .select('auth_user_id, first_name, last_name')
          .in('auth_user_id', uids);
        
        if (names) {
          const map: Record<string, string> = {};
          names.forEach(n => {
            const full = `${n.first_name || ''} ${n.last_name || ''}`.trim();
            if (full) map[n.auth_user_id] = full;
          });
          setRescuerNames(map);
        }
      }
    }

    const { data: h } = await supabase
      .from("health_structures")
      .select("id, name, short_name, lat, lng, available_beds, is_open, type")
      .eq("is_open", true)
      .not("lat", "is", null)
      .not("lng", "is", null)
      .gte("lat", b.minLat)
      .lte("lat", b.maxLat)
      .gte("lng", b.minLng)
      .lte("lng", b.maxLng);
    if (h) setHospitals(h as HospitalData[]);

    const { data: inc } = await supabase
      .from("incidents")
      .select("id, reference, type, priority, status, location_lat, location_lng, caller_realtime_lat, caller_realtime_lng, title")
      .in("status", ["new", "dispatched", "in_progress", "en_route", "on_scene"])
      .not("location_lat", "is", null)
      .not("location_lng", "is", null)
      .gte("location_lat", b.minLat)
      .lte("location_lat", b.maxLat)
      .gte("location_lng", b.minLng)
      .lte("location_lng", b.maxLng);
    if (inc) setIncidents(inc as IncidentData[]);
  }, [myCoords.latitude, myCoords.longitude]);

  useEffect(() => {
    if (!isFocused) return;
    fetchData();
    const interval = setInterval(fetchData, MAP_FETCH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchData, isFocused]);

  useEffect(() => {
    if (!isFocused) return;

    const rescuerPending: any[] = [];
    const flushRescuers = () => {
      if (rescuerPending.length === 0) return;
      const batch = rescuerPending.splice(0, rescuerPending.length);
      setRescuers((prev) => {
        let next = prev;
        for (const payload of batch) {
          if (payload.eventType === "DELETE") {
            next = next.filter((r) => r.id !== payload.old.id);
          } else {
            const row = payload.new;
            const idx = next.findIndex((r) => r.id === row.id);
            if (idx >= 0) {
              const updated = [...next];
              updated[idx] = row;
              next = updated;
            } else {
              next = [...next, row];
            }
          }
        }
        return next;
      });
    };

    const scheduleRescuerFlush = () => {
      if (rescuerRealtimeDebounceRef.current) {
        clearTimeout(rescuerRealtimeDebounceRef.current);
      }
      rescuerRealtimeDebounceRef.current = setTimeout(() => {
        rescuerRealtimeDebounceRef.current = null;
        flushRescuers();
      }, RESCUER_REALTIME_DEBOUNCE_MS);
    };

    const scheduleIncidentRefetch = () => {
      if (incidentFetchDebounceRef.current) {
        clearTimeout(incidentFetchDebounceRef.current);
      }
      incidentFetchDebounceRef.current = setTimeout(() => {
        incidentFetchDebounceRef.current = null;
        fetchData();
      }, INCIDENT_REFETCH_DEBOUNCE_MS);
    };

    const channel = supabase
      .channel("telemetry-rescuers-v2")
      .on("postgres_changes", { event: "*", schema: "public", table: "active_rescuers" }, (payload: any) => {
        rescuerPending.push(payload);
        scheduleRescuerFlush();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "incidents" }, () => {
        scheduleIncidentRefetch();
      })
      .subscribe();

    return () => {
      if (rescuerRealtimeDebounceRef.current) clearTimeout(rescuerRealtimeDebounceRef.current);
      if (incidentFetchDebounceRef.current) clearTimeout(incidentFetchDebounceRef.current);
      rescuerPending.length = 0;
      supabase.removeChannel(channel);
    };
  }, [fetchData, isFocused]);

  const userLngLat = useMemo(
    (): [number, number] => [myCoords.longitude, myCoords.latitude],
    [myCoords.latitude, myCoords.longitude],
  );

  const rescuersInView = useMemo(() => {
    return rescuers.filter((r) => {
      if (r.lat == null || r.lng == null) return false;
      return haversineMeters(userLngLat, [r.lng, r.lat]) <= MAP_VIEW_RADIUS_M;
    });
  }, [rescuers, userLngLat]);

  const hospitalsInView = useMemo(() => {
    return hospitals.filter((h) => {
      if (h.lat == null || h.lng == null) return false;
      return haversineMeters(userLngLat, [h.lng, h.lat]) <= MAP_VIEW_RADIUS_M;
    });
  }, [hospitals, userLngLat]);

  const incidentsInView = useMemo(() => {
    return incidents.filter((inc) => {
      const c = incidentLngLat(inc);
      if (!c) return false;
      return haversineMeters(userLngLat, c) <= MAP_VIEW_RADIUS_M;
    });
  }, [incidents, userLngLat]);

  const hospitalsFiltered = useMemo(() => {
    return hospitalsInView.filter((h) => {
      const key = normalizeEstablishmentType(h.type);
      return establishmentTypeFilter[key] === true;
    });
  }, [hospitalsInView, establishmentTypeFilter]);

  const toggleEstablishmentType = useCallback((key: string) => {
    setEstablishmentTypeFilter((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  }, []);

  const selectAllEstablishmentTypes = useCallback(() => {
    setEstablishmentTypeFilter(defaultEstablishmentFilter());
  }, []);

  const clearEstablishmentTypeFilter = useCallback(() => {
    const o: Record<string, boolean> = {};
    for (const k of ESTABLISHMENT_TYPE_KEYS) o[k] = false;
    setEstablishmentTypeFilter(o);
  }, []);

  const hospitalsForMap = useMemo(() => {
    let list = takeNearestByDistance(
      hospitalsFiltered,
      userLngLat,
      (h) => (h.lat != null && h.lng != null ? [h.lng, h.lat] : null),
      MAX_HOSPITAL_MARKERS_MAP,
    );
    if (selection?.kind === "hospital" && !list.some((h) => h.id === selection.data.id)) {
      list = [selection.data, ...list].slice(0, MAX_HOSPITAL_MARKERS_MAP);
    }
    return list;
  }, [hospitalsFiltered, userLngLat, selection]);

  const rescuersOthers = useMemo(
    () => rescuersInView.filter((r) => r.user_id !== authUserId),
    [rescuersInView, authUserId],
  );

  const rescuersForMap = useMemo(() => {
    let list = takeNearestByDistance(
      rescuersOthers,
      userLngLat,
      (r) => (r.lat != null && r.lng != null ? [r.lng, r.lat] : null),
      MAX_RESCUER_MARKERS_MAP,
    );
    if (selection?.kind === "rescuer" && !list.some((r) => r.id === selection.data.id)) {
      list = [selection.data, ...list].slice(0, MAX_RESCUER_MARKERS_MAP);
    }
    return list;
  }, [rescuersOthers, userLngLat, selection]);

  const incidentsForMap = useMemo(() => {
    let list = takeNearestByDistance(
      incidentsInView,
      userLngLat,
      (inc) => incidentLngLat(inc),
      MAX_INCIDENT_MARKERS_MAP,
    );
    if (selection?.kind === "incident" && !list.some((i) => i.id === selection.data.id)) {
      list = [selection.data, ...list].slice(0, MAX_INCIDENT_MARKERS_MAP);
    }
    return list;
  }, [incidentsInView, userLngLat, selection]);

  return {
    rescuersForMap,
    hospitalsForMap,
    incidentsForMap,
    rescuersOthers,
    hospitalsFiltered,
    incidentsInView,
    rescuerNames,
    establishmentTypeFilter,
    toggleEstablishmentType,
    selectAllEstablishmentTypes,
    clearEstablishmentTypeFilter,
    fetchData,
  };
}
