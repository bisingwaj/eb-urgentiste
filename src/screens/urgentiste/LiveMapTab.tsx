import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import { AppTouchableOpacity } from '../../components/ui/AppTouchableOpacity';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  StatusBar,
  ActivityIndicator,
ScrollView,
  Switch} from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { TabScreenSafeArea } from "../../components/layout/TabScreenSafeArea";
import { useTabScreenBottomPadding } from "../../navigation/tabBarLayout";
import Mapbox from "@rnmapbox/maps";
import { speakFrench, stopSpeech } from "../../lib/speechSafe";
import { colors } from "../../theme/colors";
import { spacing, radius } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { MaterialIcons, MaterialCommunityIcons } from "@expo/vector-icons";
import { Ambulance, Hospital, TriangleAlert } from "lucide-react-native";
import * as Location from "expo-location";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import {
  getRouteWithAlternatives,
  buildRouteFeature,
  formatDistanceMeters,
  formatDurationSeconds,
  geometryToCameraBounds,
  pickBestRoute,
  haversineMeters,
  type RouteResult,
  type RouteCriterion,
} from "../../lib/mapbox";
import {
  openExternalDirections,
  openWazeDirections,
} from "../../utils/navigation";
import { spreadOverlappingMarkers } from "../../utils/mapMarkerLayout";
import { EBMap, EBMapMarker } from "../../components/map/EBMap";
import { useMapPuckHeading } from "../../hooks/useMapPuckHeading";

const DEFAULT_COORDS = { latitude: -4.3224, longitude: 15.307 };

/** Rayon d’affichage et de chargement (10 km) — requêtes bbox + filtre haversine */
const MAP_VIEW_RADIUS_M = 10_000;

/** MarkerView Mapbox = coûteux : on plafonne les pastilles (tri par distance). */
const MAX_HOSPITAL_MARKERS_MAP = 72;
const MAX_RESCUER_MARKERS_MAP = 36;
const MAX_INCIDENT_MARKERS_MAP = 40;

const MAP_FETCH_INTERVAL_MS = 30_000;
const INCIDENT_REFETCH_DEBOUNCE_MS = 650;
const RESCUER_REALTIME_DEBOUNCE_MS = 140;

function takeNearestByDistance<T>(
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

/** Boîte englobante ~ carrée autour du point (réduit le volume renvoyé par Supabase) */
function approximateLatLngBounds(lat: number, lng: number, radiusM: number) {
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

/** Types `health_structures.type` (cf. schéma projet) — les valeurs inconnues sont regroupées sous `autre`. */
const ESTABLISHMENT_TYPE_KEYS = [
  "hopital",
  "clinique",
  "pharmacie",
  "centre_sante",
  "maternite",
  "dispensaire",
  "laboratoire",
  "autre",
] as const;

const ESTABLISHMENT_TYPE_LABELS: Record<(typeof ESTABLISHMENT_TYPE_KEYS)[number], string> = {
  hopital: "Hôpital",
  clinique: "Clinique",
  pharmacie: "Pharmacie",
  centre_sante: "Centre de santé",
  maternite: "Maternité",
  dispensaire: "Dispensaire",
  laboratoire: "Laboratoire",
  autre: "Autre",
};

const KNOWN_ESTABLISHMENT_TYPES = new Set<string>(
  ESTABLISHMENT_TYPE_KEYS.filter((k) => k !== "autre"),
);

function normalizeEstablishmentType(type: string | null | undefined): string {
  const raw = (type ?? "").trim().toLowerCase().replace(/-/g, "_");
  if (!raw) return "autre";
  if (KNOWN_ESTABLISHMENT_TYPES.has(raw)) return raw;
  return "autre";
}

function defaultEstablishmentFilter(): Record<string, boolean> {
  const o: Record<string, boolean> = {};
  for (const k of ESTABLISHMENT_TYPE_KEYS) o[k] = true;
  return o;
}

function establishmentTypeLabel(type: string | null | undefined): string {
  const k = normalizeEstablishmentType(type);
  return (
    ESTABLISHMENT_TYPE_LABELS[k as keyof typeof ESTABLISHMENT_TYPE_LABELS] ??
    "Établissement"
  );
}

interface RescuerData {
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

interface HospitalData {
  id: string;
  name: string;
  short_name: string | null;
  lat: number | null;
  lng: number | null;
  available_beds: number;
  is_open: boolean;
  /** hopital | clinique | pharmacie | centre_sante | … (voir health_structures.type) */
  type: string | null;
}

interface IncidentData {
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

function incidentLngLat(inc: IncidentData): [number, number] | null {
  const lat = inc.caller_realtime_lat ?? inc.location_lat;
  const lng = inc.caller_realtime_lng ?? inc.location_lng;
  if (lat == null || lng == null) return null;
  return [lng, lat];
}

type PoiSelection =
  | { kind: "incident"; data: IncidentData }
  | { kind: "hospital"; data: HospitalData }
  | { kind: "rescuer"; data: RescuerData };

export function LiveMapTab() {
  const { session } = useAuth();
  const isFocused = useIsFocused();
  const mapRef = useRef<Mapbox.MapView | null>(null);
  const incidentFetchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const rescuerRealtimeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const lastAnnouncedStepRef = useRef(-1);
  const radarAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(0.6)).current;
  const cameraThrottle = useRef<number>(0);

  const [myLocation, setMyLocation] = useState<Location.LocationObject | null>(
    null,
  );
  const [gpsReady, setGpsReady] = useState(false);

  const [rescuers, setRescuers] = useState<RescuerData[]>([]);
  const [hospitals, setHospitals] = useState<HospitalData[]>([]);
  const [incidents, setIncidents] = useState<IncidentData[]>([]);

  const [speed, setSpeed] = useState(0);
  const [accuracy, setAccuracy] = useState(0);
  const headingResolved = useMapPuckHeading(myLocation);
  const [battery] = useState(87);

  const [selection, setSelection] = useState<PoiSelection | null>(null);
  const [routeList, setRouteList] = useState<RouteResult[]>([]);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const [routeCriterion, setRouteCriterion] =
    useState<RouteCriterion>("fastest");
  const [routeInfo, setRouteInfo] = useState<{
    distance: number;
    duration: number;
  } | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [ttsStepIndex, setTtsStepIndex] = useState(0);
  const [autoTts, setAutoTts] = useState(false);
  /** Filtre multi-sélection : types d’établissements visibles sur la carte */
  const [establishmentTypeFilter, setEstablishmentTypeFilter] = useState<
    Record<string, boolean>
  >(() => defaultEstablishmentFilter());

  const [rescuerNames, setRescuerNames] = useState<Record<string, string>>({});

  const routeCriterionRef = useRef(routeCriterion);
  routeCriterionRef.current = routeCriterion;

  /** Réserve bas (pill + nav) : appliquée sur un View autour de la carte pour qu’Android contraindre bien les overlays au-dessus du Mapbox. */
  const tabBottomPad = useTabScreenBottomPadding();

  const myCoords = useMemo(
    () =>
      myLocation
        ? {
            latitude: myLocation.coords.latitude,
            longitude: myLocation.coords.longitude,
          }
        : DEFAULT_COORDS,
    [myLocation],
  );

  const userLngLat = useMemo(
    (): [number, number] => [myCoords.longitude, myCoords.latitude],
    [myCoords.latitude, myCoords.longitude],
  );

  /** Filtre cercle 10 km (la bbox SQL peut inclure des coins hors rayon) */
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

  const rescuersOthers = useMemo(
    () => rescuersInView.filter((r) => r.user_id !== session?.user?.id),
    [rescuersInView, session?.user?.id],
  );

  const hospitalsForMap = useMemo(() => {
    let list = takeNearestByDistance(
      hospitalsFiltered,
      userLngLat,
      (h) =>
        h.lat != null && h.lng != null ? [h.lng, h.lat] : null,
      MAX_HOSPITAL_MARKERS_MAP,
    );
    if (
      selection?.kind === "hospital" &&
      !list.some((h) => h.id === selection.data.id)
    ) {
      list = [selection.data, ...list].slice(0, MAX_HOSPITAL_MARKERS_MAP);
    }
    return list;
  }, [hospitalsFiltered, userLngLat, selection]);

  const rescuersForMap = useMemo(() => {
    let list = takeNearestByDistance(
      rescuersOthers,
      userLngLat,
      (r) => (r.lat != null && r.lng != null ? [r.lng, r.lat] : null),
      MAX_RESCUER_MARKERS_MAP,
    );
    if (
      selection?.kind === "rescuer" &&
      !list.some((r) => r.id === selection.data.id)
    ) {
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
    if (
      selection?.kind === "incident" &&
      !list.some((i) => i.id === selection.data.id)
    ) {
      list = [selection.data, ...list].slice(0, MAX_INCIDENT_MARKERS_MAP);
    }
    return list;
  }, [incidentsInView, userLngLat, selection]);

  const rescuersForMapDisplay = useMemo(
    () =>
      spreadOverlappingMarkers(rescuersForMap, (r) =>
        r.lat != null && r.lng != null ? [r.lng, r.lat] : null,
      ),
    [rescuersForMap],
  );

  const hospitalsForMapDisplay = useMemo(
    () =>
      spreadOverlappingMarkers(hospitalsForMap, (h) =>
        h.lat != null && h.lng != null ? [h.lng, h.lat] : null,
      ),
    [hospitalsForMap],
  );

  const incidentsForMapDisplay = useMemo(
    () =>
      spreadOverlappingMarkers(incidentsForMap, (inc) => incidentLngLat(inc)),
    [incidentsForMap],
  );

  const rescuerTruncLegend = rescuersOthers.length > rescuersForMap.length;
  const hospTruncLegend = hospitalsFiltered.length > hospitalsForMap.length;
  const incTruncLegend = incidentsInView.length > incidentsForMap.length;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1600,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.55,
          duration: 1600,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  useEffect(() => {
    if (!isFocused) return;
    const loop = Animated.loop(
      Animated.timing(radarAnim, {
        toValue: 1,
        duration: 12000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [isFocused, radarAnim]);

  const spin = radarAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  const updateTelemetry = useCallback((loc: Location.LocationObject) => {
    setSpeed(Math.max(0, (loc.coords.speed || 0) * 3.6));
    setAccuracy(loc.coords.accuracy || 0);
  }, []);

  useEffect(() => {
    if (!isFocused) return;
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted" || cancelled) return;

        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (cancelled) return;
        setMyLocation(loc);
        setGpsReady(true);
        updateTelemetry(loc);

        sub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 6000,
            distanceInterval: 25,
          },
          (location) => {
            if (cancelled) return;
            setMyLocation(location);
            updateTelemetry(location);
          },
        );
      } catch (err) {
        console.warn("[Location] Position indisponible sur cet appareil:", err);
      }
    })();

    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [isFocused, updateTelemetry]);

  const fetchData = useCallback(async () => {
    const lat = myCoords.latitude;
    const lng = myCoords.longitude;
    const b = approximateLatLngBounds(lat, lng, MAP_VIEW_RADIUS_M);

    const { data: r } = await supabase
      .from("active_rescuers")
      .select(
        "id, user_id, lat, lng, speed, heading, battery, status, updated_at",
      )
      .neq("status", "offline")
      .not("lat", "is", null)
      .not("lng", "is", null)
      .gte("lat", b.minLat)
      .lte("lat", b.maxLat)
      .gte("lng", b.minLng)
      .lte("lng", b.maxLng);
    
    if (r) {
      setRescuers(r as RescuerData[]);
      // Resolve names for these rescuers
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
      .select(
        "id, name, short_name, lat, lng, available_beds, is_open, type",
      )
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
      .select(
        "id, reference, type, priority, status, location_lat, location_lng, caller_realtime_lat, caller_realtime_lng, title",
      )
      .in("status", [
        "new",
        "dispatched",
        "in_progress",
        "en_route",
        "on_scene",
      ])
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
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "active_rescuers" },
        (payload: any) => {
          rescuerPending.push(payload);
          scheduleRescuerFlush();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "incidents" },
        () => {
          scheduleIncidentRefetch();
        },
      )
      .subscribe();

    return () => {
      if (rescuerRealtimeDebounceRef.current) {
        clearTimeout(rescuerRealtimeDebounceRef.current);
        rescuerRealtimeDebounceRef.current = null;
      }
      if (incidentFetchDebounceRef.current) {
        clearTimeout(incidentFetchDebounceRef.current);
        incidentFetchDebounceRef.current = null;
      }
      rescuerPending.length = 0;
      supabase.removeChannel(channel);
    };
  }, [fetchData, isFocused]);

  const destLngLat = useMemo((): [number, number] | null => {
    if (!selection) return null;
    if (selection.kind === "incident") {
      return incidentLngLat(selection.data);
    }
    if (selection.kind === "hospital") {
      const { lng, lat } = selection.data;
      if (lng == null || lat == null) return null;
      return [lng, lat];
    }
    return [selection.data.lng, selection.data.lat];
  }, [selection]);

  useEffect(() => {
    if (!selection || !gpsReady || !destLngLat) {
      setRouteList([]);
      setSelectedRouteIndex(0);
      setRouteInfo(null);
      setTtsStepIndex(0);
      lastAnnouncedStepRef.current = -1;
      return;
    }

    const origin: [number, number] = [myCoords.longitude, myCoords.latitude];
    let cancelled = false;
    setRouteLoading(true);

    (async () => {
      const result = await getRouteWithAlternatives(origin, destLngLat);
      if (cancelled) return;
      if (!result) {
        setRouteList([]);
        setRouteInfo(null);
        setRouteLoading(false);
        return;
      }
      const idx = pickBestRoute(result.routes, routeCriterionRef.current);
      setRouteList(result.routes);
      setSelectedRouteIndex(idx);
      setTtsStepIndex(0);
      lastAnnouncedStepRef.current = -1;
      setRouteLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [selection, destLngLat, myCoords.latitude, myCoords.longitude, gpsReady]);

  useEffect(() => {
    const r = routeList[selectedRouteIndex];
    if (!r) {
      setRouteInfo(null);
      return;
    }
    setRouteInfo({ distance: r.distance, duration: r.duration });
  }, [selectedRouteIndex, routeList]);

  useEffect(() => {
    setTtsStepIndex(0);
    lastAnnouncedStepRef.current = -1;
  }, [selectedRouteIndex, selection]);

  const selectedRoute = routeList[selectedRouteIndex] ?? null;

  const cameraBounds = useMemo(() => {
    if (!gpsReady || !selection || !destLngLat) return null;
    if (selectedRoute?.geometry?.coordinates?.length) {
      return geometryToCameraBounds(selectedRoute.geometry, 110);
    }
    const ne: [number, number] = [
      Math.max(myCoords.longitude, destLngLat[0]),
      Math.max(myCoords.latitude, destLngLat[1]),
    ];
    const sw: [number, number] = [
      Math.min(myCoords.longitude, destLngLat[0]),
      Math.min(myCoords.latitude, destLngLat[1]),
    ];
    return {
      ne,
      sw,
      paddingTop: 100,
      paddingBottom: 220,
      paddingLeft: 48,
      paddingRight: 48,
    };
  }, [
    gpsReady,
    selection,
    destLngLat,
    selectedRoute,
    myCoords.longitude,
    myCoords.latitude,
  ]);

  const cameraCenter = useMemo(() => {
    if (selection && destLngLat) {
      return [
        (myCoords.longitude + destLngLat[0]) / 2,
        (myCoords.latitude + destLngLat[1]) / 2,
      ] as [number, number];
    }
    return [myCoords.longitude, myCoords.latitude] as [number, number];
  }, [selection, destLngLat, myCoords.longitude, myCoords.latitude]);

  const cameraZoom = selection && destLngLat ? 12.2 : 13;

  useEffect(() => {
    const now = Date.now();
    if (now - cameraThrottle.current < 900) return;
    cameraThrottle.current = now;
  }, [cameraCenter, cameraZoom, cameraBounds]);

  useEffect(() => {
    if (!autoTts || !myLocation || !selectedRoute?.steps?.length) return;
    const user: [number, number] = [
      myLocation.coords.longitude,
      myLocation.coords.latitude,
    ];
    const steps = selectedRoute.steps;
    const nextIdx = lastAnnouncedStepRef.current + 1;
    if (nextIdx >= steps.length) return;
    const coord = steps[nextIdx].coordinate;
    if (!coord) {
      lastAnnouncedStepRef.current = nextIdx;
      return;
    }
    if (haversineMeters(user, coord) < 72) {
      speakFrench(steps[nextIdx].instruction);
      lastAnnouncedStepRef.current = nextIdx;
    }
  }, [myLocation, autoTts, selectedRoute]);

  const clearSelection = useCallback(() => {
    setSelection(null);
    setRouteList([]);
    setSelectedRouteIndex(0);
    setRouteInfo(null);
    setTtsStepIndex(0);
    stopSpeech();
  }, []);

  const speakTtsRepeat = useCallback(() => {
    if (!selectedRoute?.steps.length) return;
    const i = Math.min(ttsStepIndex, selectedRoute.steps.length - 1);
    speakFrench(selectedRoute.steps[i].instruction);
  }, [selectedRoute, ttsStepIndex]);

  const speakTtsNext = useCallback(() => {
    if (!selectedRoute?.steps.length) return;
    const n = Math.min(ttsStepIndex + 1, selectedRoute.steps.length - 1);
    setTtsStepIndex(n);
    speakFrench(selectedRoute.steps[n].instruction);
  }, [selectedRoute, ttsStepIndex]);

  const onApplyCriterion = useCallback((c: RouteCriterion) => {
    setRouteCriterion(c);
    setRouteList((prev) => {
      if (prev.length === 0) return prev;
      const idx = pickBestRoute(prev, c);
      setSelectedRouteIndex(idx);
      return prev;
    });
  }, []);

  const onSelectRouteIndex = useCallback((idx: number) => {
    setSelectedRouteIndex(idx);
  }, []);

  const selectionTitle = selection
    ? selection.kind === "incident"
      ? selection.data.title || selection.data.reference
      : selection.kind === "hospital"
        ? selection.data.name
        : `Unité`
    : "";

  const selectionSubtitle = selection
    ? selection.kind === "incident"
      ? `${selection.data.type} · ${selection.data.reference}`
      : selection.kind === "hospital"
        ? `${establishmentTypeLabel(selection.data.type)} · ${selection.data.available_beds} lits`
        : `Statut : ${selection.data.status}`
    : "";

  const [filterOpen, setFilterOpen] = useState(false);
  const [telemetryExpanded, setTelemetryExpanded] = useState(false);
  const [legendExpanded, setLegendExpanded] = useState(false);

  const activeFilterCount = ESTABLISHMENT_TYPE_KEYS.filter(
    (k) => establishmentTypeFilter[k] === true,
  ).length;

  const mapRouteData = useMemo(() => {
    if (routeList.length === 0) return undefined;
    return {
      routes: routeList,
      selectedIndex: selectedRouteIndex,
      showAlternatives: true,
    };
  }, [routeList, selectedRouteIndex]);

  const allMarkers = useMemo((): EBMapMarker[] => {
    const list: EBMapMarker[] = [];

    // Units
    rescuersForMapDisplay.forEach(({ item: r, displayCoord }) => {
      list.push({
        id: `unit-${r.id}`,
        type: 'unit',
        coordinate: displayCoord,
        status: r.status,
        headingDeg: r.heading != null && r.heading >= 0 ? r.heading : undefined,
        label: rescuerNames[r.user_id],
        data: r
      });
    });

    // Hospitals
    hospitalsForMapDisplay.forEach(({ item: h, displayCoord }) => {
      list.push({
        id: `hosp-${h.id}`,
        type: 'hospital',
        coordinate: displayCoord,
        label: h.short_name || h.name,
        beds: h.available_beds,
        data: h
      });
    });

    // Incidents
    incidentsForMapDisplay.forEach(({ item: inc, displayCoord }) => {
      list.push({
        id: `inc-${inc.id}`,
        type: 'incident',
        coordinate: displayCoord,
        priority: inc.priority,
        label: inc.reference?.slice(-6).toUpperCase(),
        data: inc
      });
    });

    return list;
  }, [rescuersForMapDisplay, hospitalsForMapDisplay, incidentsForMapDisplay, rescuerNames]);

  return (
    <TabScreenSafeArea style={[styles.container, styles.tabScreenNoBottomPad]}>
      <StatusBar barStyle="light-content" />

      <View style={[styles.mapAreaShell, { paddingBottom: tabBottomPad }]}>
      <View style={styles.mapWrapper}>
        {!gpsReady ? (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={colors.secondary} />
            <Text style={styles.loadingText}>Acquisition du signal GPS…</Text>
          </View>
        ) : (
          <EBMap
            ref={mapRef as any}
            mode="TRACKING"
            style={StyleSheet.absoluteFillObject}
            markers={allMarkers}
            myLocation={[myCoords.longitude, myCoords.latitude]}
            myHeading={headingResolved}
            routeData={mapRouteData}
            cameraConfig={selection ? {
              bounds: cameraBounds || undefined,
            } : {
              center: cameraCenter,
              zoom: cameraZoom,
            }}
            onMarkerPress={(m) => {
              if (m.type === 'unit') setSelection({ kind: "rescuer", data: m.data });
              else if (m.type === 'hospital') setSelection({ kind: "hospital", data: m.data });
              else if (m.type === 'incident') setSelection({ kind: "incident", data: m.data });
            }}
            onMapPress={() => setSelection(null)}
            onRoutePress={(idx) => setSelectedRouteIndex(idx)}
            showControls={true}
          />
        )}

        {gpsReady && isFocused && (
          <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
            <Animated.View
              style={[styles.radarLine, { transform: [{ rotate: spin }] }]}
            />
          </View>
        )}

        {/* ── Top overlay : Live + counts + filter dropdown ── */}
        {gpsReady && (
          <View style={styles.topOverlay}>
            <View style={styles.topOverlayRow}>
              <View style={styles.liveBadge}>
                <Animated.View style={[styles.liveDot, { opacity: pulseAnim }]} />
                <Text style={styles.liveText}>Live</Text>
              </View>
              <View style={styles.statusChip}>
                <Ambulance size={13} color={colors.success} strokeWidth={2.5} />
                <Text style={styles.statusChipText}>{rescuersForMap.length}{rescuerTruncLegend ? "+" : ""}</Text>
              </View>
              <View style={styles.statusChip}>
                <Hospital size={13} color={colors.success} strokeWidth={2.5} />
                <Text style={styles.statusChipText}>{hospitalsForMap.length}{hospTruncLegend ? "+" : ""}</Text>
              </View>
              <View style={styles.statusChip}>
                <TriangleAlert size={13} color="#FF453A" strokeWidth={2.5} />
                <Text style={styles.statusChipText}>{incidentsForMap.length}{incTruncLegend ? "+" : ""}</Text>
              </View>
              <AppTouchableOpacity
                style={[styles.filterBtn, filterOpen && styles.filterBtnOpen]}
                onPress={() => setFilterOpen((v) => !v)}
                activeOpacity={0.85}
              >
                <MaterialIcons name="filter-list" size={18} color={filterOpen ? "#FFF" : colors.secondary} />
                <Text style={[styles.filterBtnText, filterOpen && { color: "#FFF" }]}>
                  {activeFilterCount}/{ESTABLISHMENT_TYPE_KEYS.length}
                </Text>
              </AppTouchableOpacity>
            </View>

            {filterOpen && (
              <View style={styles.filterDropdown}>
                <AppTouchableOpacity
                  style={styles.filterDropdownChipAll}
                  onPress={() => { selectAllEstablishmentTypes(); }}
                  activeOpacity={0.85}
                >
                  <Text style={styles.filterDropdownChipAllText}>Tout cocher</Text>
                </AppTouchableOpacity>
                {ESTABLISHMENT_TYPE_KEYS.map((key) => {
                  const on = establishmentTypeFilter[key] === true;
                  return (
                    <AppTouchableOpacity
                      key={key}
                      style={[styles.filterDropdownItem, on && styles.filterDropdownItemOn]}
                      onPress={() => toggleEstablishmentType(key)}
                      activeOpacity={0.85}
                    >
                      <View style={[styles.filterDot, on && styles.filterDotOn]} />
                      <Text style={[styles.filterDropdownText, on && styles.filterDropdownTextOn]} numberOfLines={1}>
                        {ESTABLISHMENT_TYPE_LABELS[key]}
                      </Text>
                    </AppTouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* ── Bottom-left: Telemetry HUD (collapsible) ── */}
        {telemetryExpanded && (
          <View style={[styles.hudExpandedLeft, { bottom: spacing.sm + 44 }]}>
            <View style={styles.hudExpandedCard}>
              <View style={styles.telRow}>
                <MaterialIcons name="speed" color={colors.secondary} size={14} />
                <Text style={styles.telLabel}>Vitesse</Text>
                <Text style={styles.telValue} numberOfLines={1}>{speed.toFixed(0)} km/h</Text>
              </View>
              <View style={styles.telRow}>
                <MaterialIcons name="explore" color={colors.secondary} size={14} />
                <Text style={styles.telLabel}>Cap</Text>
                <Text style={styles.telValue} numberOfLines={1}>{headingResolved.toFixed(0)}°</Text>
              </View>
              <View style={styles.telRow}>
                <MaterialIcons name="gps-fixed" color={accuracy < 25 ? colors.success : "#FF9F0A"} size={14} />
                <Text style={styles.telLabel}>Précision</Text>
                <Text style={[styles.telValue, { color: accuracy < 25 ? colors.success : "#FF9F0A" }]} numberOfLines={1}>±{accuracy.toFixed(0)} m</Text>
              </View>
              <View style={[styles.telRow, { marginBottom: 0 }]}>
                <MaterialIcons name="battery-std" color={battery > 20 ? colors.success : "#FF453A"} size={14} />
                <Text style={styles.telLabel}>Batterie</Text>
                <Text style={[styles.telValue, { color: battery > 20 ? colors.success : "#FF453A" }]} numberOfLines={1}>{battery}%</Text>
              </View>
            </View>
          </View>
        )}
        <View style={[styles.telemetryHUD, { bottom: spacing.sm }]}>
          <AppTouchableOpacity
            style={styles.hudPill}
            onPress={() => { setTelemetryExpanded((v) => !v); setLegendExpanded(false); }}
            activeOpacity={0.85}
          >
            <MaterialIcons name="speed" color={colors.secondary} size={16} />
            <Text style={styles.hudPillValue}>{speed.toFixed(0)} km/h</Text>
            <MaterialIcons name={telemetryExpanded ? "expand-more" : "expand-less"} color="rgba(255,255,255,0.5)" size={18} />
          </AppTouchableOpacity>
        </View>

        {/* ── Bottom-right: Legend HUD (collapsible) ── */}
        {legendExpanded && (
          <View style={[styles.hudExpandedRight, { bottom: spacing.sm + 44 }]}>
            <View style={styles.hudExpandedCard}>
              {[
                { color: colors.secondary, label: "Votre position" },
                { color: colors.success, label: `Unités (${rescuersForMap.length}${rescuerTruncLegend ? "+" : ""})` },
                { color: "#2E7D32", label: `Établ. (${hospitalsForMap.length}${hospTruncLegend ? "+" : ""})` },
                { color: "#FF453A", label: `Signal. (${incidentsForMap.length}${incTruncLegend ? "+" : ""})` },
              ].map((item, i) => (
                <View key={i} style={[styles.legendRow, i === 3 && { marginBottom: 0 }]}>
                  <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                  <Text style={styles.legendText} numberOfLines={1}>{item.label}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
        <View style={[styles.legendHUD, { bottom: spacing.sm }]}>
          <AppTouchableOpacity
            style={styles.hudPill}
            onPress={() => { setLegendExpanded((v) => !v); setTelemetryExpanded(false); }}
            activeOpacity={0.85}
          >
            <MaterialIcons name="layers" color={colors.secondary} size={16} />
            <Text style={styles.hudPillValue}>Légende</Text>
            <MaterialIcons name={legendExpanded ? "expand-more" : "expand-less"} color="rgba(255,255,255,0.5)" size={18} />
          </AppTouchableOpacity>
        </View>

        {selection && destLngLat && (
          <View style={styles.floatingInfoContainer}>
            <View style={styles.tacticalCard}>
              <View style={styles.cardHeader}>
                <View style={[styles.statusDot, { backgroundColor: selection.kind === 'incident' ? '#FF453A' : colors.success }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.unitName} numberOfLines={1}>{selectionTitle}</Text>
                  <Text style={styles.caseRef} numberOfLines={1}>{selectionSubtitle}</Text>
                </View>
                <AppTouchableOpacity onPress={clearSelection} hitSlop={12}>
                  <MaterialIcons name="close" size={22} color="rgba(255,255,255,0.4)" />
                </AppTouchableOpacity>
              </View>

              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <MaterialIcons name="timer" size={20} color={colors.secondary} />
                  <View>
                    <Text style={styles.statLabel}>TEMPS ESTIMÉ</Text>
                    <Text style={styles.statValue}>
                      {routeLoading ? '...' : (selectedRoute ? formatDurationSeconds(selectedRoute.duration) : '—')}
                    </Text>
                  </View>
                </View>

                <View style={styles.statDivider} />

                <View style={styles.statItem}>
                  <MaterialIcons name="straighten" size={20} color="#34A853" />
                  <View>
                    <Text style={styles.statLabel}>DISTANCE</Text>
                    <Text style={styles.statValue}>
                      {routeLoading ? '...' : (selectedRoute ? formatDistanceMeters(selectedRoute.distance) : '—')}
                    </Text>
                  </View>
                </View>
              </View>

              {routeList.length > 1 && (
                <View style={styles.routePickSection}>
                  <Text style={styles.routePickLabel}>ITINÉRAIRES ALTERNATIFS</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.routeChipsRow}>
                    {routeList.map((r, idx) => (
                      <AppTouchableOpacity
                        key={`route-chip-${idx}`}
                        style={[styles.routeChip, idx === selectedRouteIndex && styles.routeChipActive]}
                        onPress={() => onSelectRouteIndex(idx)}
                      >
                        <Text style={styles.routeChipTitle}>MODÈLE {idx + 1}</Text>
                        <Text style={styles.routeChipMeta}>{formatDurationSeconds(r.duration)}</Text>
                      </AppTouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

              <View style={styles.destActions}>
                <AppTouchableOpacity
                  style={styles.destBtnPrimary}
                  onPress={() => openExternalDirections(destLngLat[1], destLngLat[0])}
                >
                  <MaterialIcons name="map" size={18} color="#fff" />
                  <Text style={styles.destBtnPrimaryText}>Google Maps</Text>
                </AppTouchableOpacity>
                <AppTouchableOpacity
                  style={styles.destBtnSecondary}
                  onPress={() => openWazeDirections(destLngLat[1], destLngLat[0])}
                >
                  <MaterialCommunityIcons name="waze" size={18} color={colors.secondary} />
                  <Text style={styles.destBtnSecondaryText}>Waze</Text>
                </AppTouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </View>
      </View>
    </TabScreenSafeArea>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.mainBackground },
  tabScreenNoBottomPad: { paddingBottom: 0 },
  mapAreaShell: { flex: 1, minHeight: 0 },

  mapWrapper: { flex: 1, minHeight: 0, position: "relative" },

  loadingOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.tabBar,
  },
  loadingText: { ...typography.bodyMuted, marginTop: spacing.md },

  radarLine: {
    position: "absolute",
    top: "50%",
    left: "50%",
    width: 900,
    height: 1,
    backgroundColor: "rgba(68, 138, 255, 0.1)",
    transformOrigin: "0% 0%",
  },

  /* ── Top overlay (Live + counts + filter) ── */
  topOverlay: {
    position: "absolute",
    top: spacing.sm,
    left: spacing.sm,
    right: spacing.sm,
    zIndex: 25,
    elevation: 25,
  },
  topOverlayRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(18,18,18,0.92)",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderHairline,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.success,
    marginRight: 6,
  },
  liveText: { color: colors.success, fontSize: 13, fontWeight: "800" },
  statusChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(18,18,18,0.92)",
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderHairline,
  },
  statusChipText: { color: "#FFF", fontSize: 13, fontWeight: "700" },
  filterBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(18,18,18,0.92)",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderHairline,
    marginLeft: "auto",
  },
  filterBtnOpen: {
    backgroundColor: colors.secondary,
    borderColor: colors.secondary,
  },
  filterBtnText: { color: colors.secondary, fontSize: 13, fontWeight: "800" },

  /* ── Filter dropdown ── */
  filterDropdown: {
    marginTop: 6,
    backgroundColor: "rgba(14,14,14,0.96)",
    borderRadius: radius.lg,
    padding: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderHairline,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  filterDropdownChipAll: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.secondary + "55",
    backgroundColor: colors.secondary + "18",
  },
  filterDropdownChipAllText: { color: colors.secondary, fontSize: 13, fontWeight: "800" },
  filterDropdownItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  filterDropdownItemOn: {
    borderColor: colors.secondary,
    backgroundColor: colors.secondary + "22",
  },
  filterDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.2)" },
  filterDotOn: { backgroundColor: colors.secondary },
  filterDropdownText: { color: "rgba(255,255,255,0.45)", fontSize: 13, fontWeight: "700" },
  filterDropdownTextOn: { color: "#FFF" },

  /* ── Collapsible HUDs ── */
  telemetryHUD: {
    position: "absolute",
    left: spacing.sm,
    zIndex: 20,
    elevation: 20,
  },
  legendHUD: {
    position: "absolute",
    right: spacing.sm,
    zIndex: 20,
    elevation: 20,
  },
  hudPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(18,18,18,0.94)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderHairline,
  },
  hudPillValue: { color: "#FFF", fontSize: 13, fontWeight: "700" },
  hudExpandedLeft: {
    position: "absolute",
    left: spacing.sm,
    zIndex: 21,
    elevation: 21,
  },
  hudExpandedRight: {
    position: "absolute",
    right: spacing.sm,
    zIndex: 21,
    elevation: 21,
  },
  hudExpandedCard: {
    backgroundColor: "rgba(14,14,14,0.96)",
    borderRadius: radius.lg,
    padding: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderHairline,
    minWidth: 185,
  },
  telRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  telLabel: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 12,
    fontWeight: "600",
    marginLeft: 8,
    flex: 1,
  },
  telValue: { color: "#FFF", fontSize: 14, fontWeight: "800" },
  telUnit: { fontSize: 13, fontWeight: "600", color: "rgba(255,255,255,0.5)" },

  legendRow: { flexDirection: "row", alignItems: "center", marginBottom: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  legendText: { fontSize: 12, fontWeight: "600", color: "rgba(255,255,255,0.7)" },

  floatingInfoContainer: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    alignItems: 'center',
    zIndex: 100,
  },
  tacticalCard: {
    width: '100%',
    backgroundColor: 'rgba(20, 20, 20, 0.95)',
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 10,
  },
  unitName: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  caseRef: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
  },
  statItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginHorizontal: 12,
  },
  statLabel: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  statValue: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  routePickSection: { marginBottom: spacing.md },
  routePickLabel: { ...typography.sectionLabel, marginBottom: spacing.sm },
  routeChipsRow: { flexDirection: "row", gap: spacing.sm, paddingVertical: 4 },
  routeChip: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderHairline,
    minWidth: 88,
  },
  routeChipActive: {
    borderColor: colors.secondary,
    backgroundColor: colors.secondary + "18",
  },
  routeChipTitle: { color: colors.text, fontWeight: "800", fontSize: 13 },
  routeChipMeta: {
    color: colors.text,
    fontWeight: "600",
    fontSize: 12,
    marginTop: 2,
  },
  routeChipMetaSmall: { ...typography.bodyMuted, fontSize: 12, marginTop: 2 },
  destActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  destBtnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.secondary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 16,
  },
  destBtnPrimaryText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  destBtnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  destBtnSecondaryText: {
    color: colors.secondary,
    fontSize: 14,
    fontWeight: '700',
  },
  criterionRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  criterionBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderHairline,
    alignItems: "center",
  },
  criterionBtnOn: {
    borderColor: colors.secondary,
    backgroundColor: colors.secondary + "14",
  },
  criterionBtnText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "600",
  },
  ttsSection: {
    marginBottom: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderHairline,
  },
  ttsHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.sm,
    gap: 8,
  },
  ttsTitle: { color: colors.text, fontWeight: "700", fontSize: 13 },
  ttsAutoLabel: { ...typography.bodyMuted, fontSize: 12 },
  ttsButtons: { flexDirection: "row", gap: spacing.sm },
  ttsBtn: {
    flex: 1,
    backgroundColor: colors.secondary + "33",
    paddingVertical: 10,
    borderRadius: radius.md,
    alignItems: "center",
  },
  ttsBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  ttsBtnOutline: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.secondary + "55",
    paddingVertical: 10,
    borderRadius: radius.md,
    alignItems: "center",
  },
  ttsBtnTextOutline: {
    color: colors.secondary,
    fontWeight: "700",
    fontSize: 13,
  },
});
