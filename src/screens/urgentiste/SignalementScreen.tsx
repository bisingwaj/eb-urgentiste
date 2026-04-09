import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
   View,
   Text,
   StyleSheet,
   ScrollView,
   TouchableOpacity,
   Animated,
   Dimensions,
   Platform,
   StatusBar,
   Alert,
   TextInput,
   ActivityIndicator,
   FlatList,
   PanResponder,
   Linking,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import Mapbox from "@rnmapbox/maps";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { colors } from "../../theme/colors";
import { MaterialIcons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { getRoute, buildRouteFeature, geometryToCameraBounds } from "../../lib/mapbox";
import { MapboxMapView } from "../../components/map/MapboxMapView";
import { openExternalDirections } from "../../utils/navigation";
import { formatMissionAddress, formatIncidentType, formatDescriptionLines } from "../../utils/missionAddress";
import { HeartPulse, Ambulance, Hospital as HospitalIcon } from "lucide-react-native";

// Helper for ETA and distance
function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;  
  const dLon = (lon2 - lon1) * Math.PI / 180; 
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
            Math.sin(dLon/2) * Math.sin(dLon/2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  return R * c; 
}
import { useFocusEffect } from "@react-navigation/native";
import { useActiveMission } from "../../hooks/useActiveMission";
import { useMission, Hospital } from "../../contexts/MissionContext";
import { alertVoipError, startRescuerToCitizenVoipCall } from "../../lib/rescuerCallCitizen";
import { canOfferVictimContactCalls } from "../../lib/missionVictimCall";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const IS_TABLET = SCREEN_WIDTH > 600;

// ── Types ──
type MissionStep =
   | "standby"
   | "reception"
   | "arrival"
   | "assessment"
   | "aid"
   | "decision"
   | "assignment"
   | "transport_mode"
   | "transport"
   | "closure";

const STEP_LABELS: Record<MissionStep, string> = {
   standby: "Attente",
   reception: "Réception",
   arrival: "En route",
   assessment: "Évaluation initiale",
   aid: "Premiers soins",
   decision: "Plan d'évacuation",
   assignment: "Affectation",
   transport_mode: "Mode de transport",
   transport: "Transport en cours",
   closure: "Clôture",
};

interface TimelineEvent {
   id: string;
   time: string;
   label: string;
   icon: string;
   status?: string;
}

interface AlertData {
   id: string;
   time: string;
   type: string;
   typeIcon: string;
   location: string;
   description: string;
   priority: "CRITIQUE" | "URGENTE" | "MODÉRÉE";
   coordinates: { latitude: number; longitude: number };
   patient: {
      nom: string;
      age: number;
      sexe: string;
      groupeSanguin: string;
   };
}

// ── Mock Data ──
const MOCK_ALERTS: AlertData[] = [
   {
      id: "AL-902",
      time: "2 min",
      type: "ACCIDENT ROUTE",
      typeIcon: "directions-car",
      location: "Limete, Boulevard Lumumba",
      description:
         "Collision deux véhicules. Victime coincée. Fracture ouverte jambe gauche suspectée.",
      priority: "CRITIQUE",
      coordinates: { latitude: -4.34, longitude: 15.33 },
      patient: {
         nom: "JEAN KABEYA",
         age: 42,
         sexe: "Masculin",
         groupeSanguin: "O+",
      },
   },
];

const HOSPITALS = [
   {
      id: "H1",
      name: "Hôpital HJ Kinshasa",
      distance: "1.2 km",
      capacity: "Haute",
      specialty: "Cardiologie",
      coords: { latitude: -4.32, longitude: 15.3 },
   },
];

export function SignalementScreen({ navigation, route }: any) {
   const insets = useSafeAreaInsets();
   const { activeMission, isLoading: missionLoading, updateDispatchStatus, refresh } = useActiveMission();
   const { fetchHospitals, updateMissionDetails } = useMission();
   const initialMission = route?.params?.mission || activeMission;
   
   const getInitialStep = (): MissionStep => {
      const m = initialMission;
      if (!m || !m.dispatch_status) return "standby";
      switch (m.dispatch_status) {
         case 'dispatched': return 'reception';
         case 'en_route': return 'arrival';
         case 'on_scene': return 'assessment';
         case 'en_route_hospital': return 'transport';
         case 'arrived_hospital': return 'closure';
         default: return 'reception';
      }
   };

   const [step, setStep] = useState<MissionStep>(getInitialStep);
   const [stateRestored, setStateRestored] = useState(false);
   const [selectedMission, setSelectedMission] = useState<any>(initialMission);
   const [hospitals, setHospitals] = useState<Hospital[]>([]);
   const missionRef = useRef<any>(null);

   useEffect(() => {
      missionRef.current = selectedMission;
   }, [selectedMission]);

   const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
   const [isLoading, setIsLoading] = useState(true);
   const [isAssigned, setIsAssigned] = useState(false);
   const [elapsedSeconds, setElapsedSeconds] = useState(0);
   const [urgentisteLoc, setUrgentisteLoc] = useState<Location.LocationObject | null>(null);
   const [routeGeoJSON, setRouteGeoJSON] = useState<GeoJSON.FeatureCollection | null>(null);
   const [routeDuration, setRouteDuration] = useState<number | null>(null);
   const [routeDistance, setRouteDistance] = useState<number | null>(null);
   const lastRouteFetch = useRef<number>(0);
   const [voipLoading, setVoipLoading] = useState(false);

   useEffect(() => {
      if (!urgentisteLoc || !selectedMission) return;
      const now = Date.now();
      if (now - lastRouteFetch.current < 15000 && routeGeoJSON) return;
      lastRouteFetch.current = now;
      const pLat = selectedMission.location?.lat || -4.322447;
      const pLng = selectedMission.location?.lng || 15.307045;
      getRoute(
         [urgentisteLoc.coords.longitude, urgentisteLoc.coords.latitude],
         [pLng, pLat],
         { profile: "driving-traffic" },
      ).then((result) => {
         if (result) {
            setRouteGeoJSON(buildRouteFeature(result.geometry));
            setRouteDuration(result.duration);
            setRouteDistance(result.distance);
         }
      });
   }, [urgentisteLoc?.coords.latitude, urgentisteLoc?.coords.longitude, selectedMission?.location?.lat, selectedMission?.location?.lng]);

   const routeCameraBounds = useMemo(() => {
      if (!routeGeoJSON?.features[0]?.geometry) return null;
      return geometryToCameraBounds(routeGeoJSON.features[0].geometry as GeoJSON.LineString, 80);
   }, [routeGeoJSON]);

   const cameraBounds = useMemo(() => {
      if (!urgentisteLoc || !selectedMission) return null;
      const pLat = selectedMission.location?.lat || -4.322447;
      const pLng = selectedMission.location?.lng || 15.307045;
      const uLat = urgentisteLoc.coords.latitude;
      const uLng = urgentisteLoc.coords.longitude;
      const padding = 80;
      return {
         ne: [Math.max(pLng, uLng), Math.max(pLat, uLat)] as [number, number],
         sw: [Math.min(pLng, uLng), Math.min(pLat, uLat)] as [number, number],
         paddingTop: padding,
         paddingBottom: padding,
         paddingLeft: padding,
         paddingRight: padding,
      };
   }, [urgentisteLoc?.coords.latitude, urgentisteLoc?.coords.longitude, selectedMission?.location?.lat, selectedMission?.location?.lng]);

   const receptionCameraBounds = useMemo(
      () => routeCameraBounds ?? cameraBounds,
      [routeCameraBounds, cameraBounds],
   );

   useEffect(() => {
      let locationSub: Location.LocationSubscription | null = null;
      (async () => {
         try {
            let { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') return;
            let loc = await Location.getCurrentPositionAsync({});
            console.log(`📍 [POSITION INITIALE URGENTISTE] : ${loc.coords.latitude}, ${loc.coords.longitude}`);
            setUrgentisteLoc(loc);
            locationSub = await Location.watchPositionAsync(
               { accuracy: Location.Accuracy.High, distanceInterval: 10 },
               (newLoc) => {
                  console.log(`🚶‍♂️ [NOUVELLE POSITION URGENTISTE] : ${newLoc.coords.latitude}, ${newLoc.coords.longitude}`);
                  setUrgentisteLoc(newLoc);
               }
            );
         } catch (err) {
            console.warn('[Location] Position indisponible sur cet appareil:', err);
         }
      })();
      return () => {
         if (locationSub) locationSub.remove();
      };
   }, []);

   const [resolvedAddress, setResolvedAddress] = useState<string | null>(null);

   useEffect(() => {
      const fetchAddress = async () => {
         if (selectedMission && !selectedMission.location?.address) {
            const lat = selectedMission.location?.lat;
            const lng = selectedMission.location?.lng;
            if (lat && lng) {
               try {
                  const geocodeData = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
                  console.log("🏠 [GEOCODE COMPLET] :", JSON.stringify(geocodeData, null, 2));
                  if (geocodeData && geocodeData.length > 0) {
                     const a = geocodeData[0];
                     const streetPart = [a.streetNumber, a.street].filter(Boolean).join(" ");
                     const namePart = a.name && a.name !== a.street ? a.name : "";
                     const districtPart = a.district || "";
                     const cityPart = a.city || "";
                     const subregionPart = a.subregion && a.subregion !== a.city ? a.subregion : "";
                     const regionPart = a.region && a.region !== a.city && a.region !== a.subregion ? a.region : "";
                     const postalPart = a.postalCode || "";

                     const parts = [
                        namePart,
                        streetPart,
                        districtPart,
                        cityPart,
                        subregionPart,
                        regionPart,
                        postalPart,
                     ].filter(Boolean);

                     // Supprimer les doublons (ex: "Kinshasa" répété)
                     const uniqueParts = parts.filter((part, index) => 
                        parts.indexOf(part) === index
                     );

                     const formattedAddress = uniqueParts.join(", ");
                     setResolvedAddress(formattedAddress || `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
                  }
               } catch (e) {
                  console.log("Erreur de reverse geocoding:", e);
                  setResolvedAddress(`GPS: ${lat.toFixed(5)}, ${lng.toFixed(5)}`);
               }
            }
         }
      };
      fetchAddress();
   }, [selectedMission?.location?.lat, selectedMission?.location?.lng]);

   const displayAddress = useMemo(
      () =>
         selectedMission
            ? formatMissionAddress(selectedMission.location, resolvedAddress)
            : "Adresse inconnue",
      [selectedMission, resolvedAddress]
   );

   const distanceInfo = useMemo(() => {
      if (!urgentisteLoc || !selectedMission) return { dist: "Calcul...", eta: "--" };
      const plat = selectedMission.location?.lat || -4.322447;
      const plon = selectedMission.location?.lng || 15.307045;
      const distKm = getDistanceFromLatLonInKm(
         urgentisteLoc.coords.latitude, 
         urgentisteLoc.coords.longitude,
         plat, plon
      );
      
      const speedKmh = 40;
      const totalSeconds = Math.floor((distKm / speedKmh) * 3600);
      
      let etaFormat = "";
      if (totalSeconds < 60) {
         etaFormat = `${Math.max(1, totalSeconds)} s`;
      } else {
         const mins = Math.ceil(totalSeconds / 60);
         etaFormat = `${mins} min`;
      }

      const distFormat = distKm < 1 ? `${Math.floor(distKm * 1000)} m` : `${distKm.toFixed(1)} km`;

      return { dist: distFormat, eta: etaFormat };
   }, [urgentisteLoc, selectedMission]);

   const routeInfoText = useMemo(() => {
      if (routeDistance != null && routeDuration != null) {
         const km = routeDistance < 1000 ? `${Math.round(routeDistance)} m` : `${(routeDistance / 1000).toFixed(1)} km`;
         const mins = Math.ceil(routeDuration / 60);
         return `${km} • ${mins} min`;
      }
      return distanceInfo.dist + " • " + distanceInfo.eta;
   }, [routeDistance, routeDuration, distanceInfo]);

   const STEP_ORDER: MissionStep[] = ["standby", "reception", "arrival", "assessment", "aid", "decision", "assignment", "transport_mode", "transport", "closure"];

   const dispatchToMinStep = (status: string): MissionStep => {
      switch (status) {
         case 'dispatched': return 'reception';
         case 'en_route': return 'arrival';
         case 'on_scene': return 'assessment';
         case 'en_route_hospital': return 'transport_mode';
         case 'arrived_hospital': return 'closure';
         case 'mission_end': return 'closure';
         default: return 'reception';
      }
   };

   useEffect(() => {
      const mission = activeMission || selectedMission;
      if (!mission) return;

      if (activeMission) {
         setSelectedMission(activeMission);
      }

      if (!stateRestored) return;

      const currentIdx = STEP_ORDER.indexOf(step);
      const minStep = dispatchToMinStep(mission.dispatch_status);
      const minIdx = STEP_ORDER.indexOf(minStep);

      if (currentIdx < minIdx) {
         setStep(minStep);
      } else if (step === 'standby' && mission.dispatch_status) {
         setStep(minStep);
      }
   }, [activeMission, stateRestored]);

   useEffect(() => {
      let interval: NodeJS.Timeout | null = null;
      if (step !== "standby" && step !== "reception" && step !== "closure") {
         interval = setInterval(() => {
            setElapsedSeconds((prev) => prev + 1);
         }, 1000);
      }
      return () => {
         if (interval) clearInterval(interval);
      };
   }, [step]);

   const formatTime = (totalSeconds: number) => {
      const h = Math.floor(totalSeconds / 3600);
      const m = Math.floor((totalSeconds % 3600) / 60);
      const s = totalSeconds % 60;
      return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
   };

   const [fadeAnim] = useState(new Animated.Value(1));
   const [assessment, setAssessment] = useState<any>({
      conscious: null,
      breathing: null,
      severity: null,
   });
   const [careChecklist, setCareChecklist] = useState<string[]>([]);
   const [decision, setDecision] = useState<string | null>(null);
   const [targetHospital, setTargetHospital] = useState<any>(null);
   const [pendingStructureInfo, setPendingStructureInfo] = useState<{
      id: string;
      name: string;
      specialty?: string;
      address?: string;
      phone?: string;
   } | null>(null);
   const [departingEnRoute, setDepartingEnRoute] = useState(false);
   const structureTimelineLoggedRef = useRef<string | null>(null);
   const [transportMode, setTransportMode] = useState<
      "AMBULANCE" | "SMUR" | "PERSONNEL" | "MOTO" | null
   >(null);
   const [hospitalRouteGeoJSON, setHospitalRouteGeoJSON] = useState<GeoJSON.FeatureCollection | null>(null);
   const [hospitalRouteDuration, setHospitalRouteDuration] = useState<number | null>(null);
   const [hospitalRouteDistance, setHospitalRouteDistance] = useState<number | null>(null);
   const lastHospitalRouteFetch = useRef<number>(0);

   const hospitalRouteCameraBounds = useMemo(() => {
      if (!hospitalRouteGeoJSON?.features[0]?.geometry) return null;
      return geometryToCameraBounds(hospitalRouteGeoJSON.features[0].geometry as GeoJSON.LineString, 80);
   }, [hospitalRouteGeoJSON]);

   const missionStorageKey = selectedMission?.id
      ? `@mission_state_${selectedMission.id}`
      : null;

   const saveMissionState = useCallback(async () => {
      if (!missionStorageKey || !stateRestored) return;
      if (step === "standby" || step === "closure") return;
      try {
         const payload = JSON.stringify({
            step,
            assessment,
            careChecklist,
            decision,
            targetHospital,
            transportMode,
            timeline,
            elapsedSeconds,
            isAssigned,
            savedAt: Date.now(),
         });
         await AsyncStorage.setItem(missionStorageKey, payload);
      } catch (e) {
         console.warn("[State] Failed to save mission state:", e);
      }
   }, [missionStorageKey, stateRestored, step, assessment, careChecklist, decision, targetHospital, transportMode, timeline, elapsedSeconds, isAssigned]);

   useEffect(() => {
      saveMissionState();
   }, [saveMissionState]);

   useEffect(() => {
      if (!missionStorageKey) {
         setStateRestored(true);
         return;
      }
      (async () => {
         try {
            const raw = await AsyncStorage.getItem(missionStorageKey);
            if (raw) {
               const saved = JSON.parse(raw);
               if (saved.step && saved.step !== "standby" && saved.step !== "closure") {
                  setStep(saved.step);
                  if (saved.assessment) setAssessment(saved.assessment);
                  if (saved.careChecklist) setCareChecklist(saved.careChecklist);
                  if (saved.decision !== undefined) setDecision(saved.decision);
                  if (saved.targetHospital) setTargetHospital(saved.targetHospital);
                  if (saved.transportMode !== undefined) setTransportMode(saved.transportMode);
                  if (saved.timeline) setTimeline(saved.timeline);
                  if (saved.elapsedSeconds) setElapsedSeconds(saved.elapsedSeconds);
                  if (saved.isAssigned !== undefined) setIsAssigned(saved.isAssigned);
                  console.log(`[State] Restored mission state at step "${saved.step}"`);
               }
            }
         } catch (e) {
            console.warn("[State] Failed to restore mission state:", e);
         } finally {
            setStateRestored(true);
         }
      })();
   }, [missionStorageKey]);

   const clearMissionState = useCallback(async () => {
      if (!missionStorageKey) return;
      try {
         await AsyncStorage.removeItem(missionStorageKey);
      } catch (e) {
         console.warn("[State] Failed to clear mission state:", e);
      }
   }, [missionStorageKey]);

   const radarAnim = useRef(new Animated.Value(0.4)).current;
   const notifyAnim = useRef(new Animated.Value(0)).current;

   const SWIPE_WIDTH = SCREEN_WIDTH - 48;
   const BUTTON_SIZE = 64;
   const pan = useRef(new Animated.Value(0)).current;
   const panResponder = useRef(
      PanResponder.create({
         onStartShouldSetPanResponder: () => true,
         onPanResponderMove: Animated.event([null, { dx: pan }], {
            useNativeDriver: false,
         }),
         onPanResponderRelease: (e, gestureState) => {
            if (gestureState.dx > SWIPE_WIDTH * 0.6) {
               Animated.spring(pan, {
                  toValue: SWIPE_WIDTH - BUTTON_SIZE - 8,
                  useNativeDriver: false,
               }).start(() => {
                  if (missionRef.current) {
                     handleStartMission(missionRef.current);
                     setTimeout(() => pan.setValue(0), 500);
                  }
               });
            } else {
               Animated.spring(pan, { toValue: 0, useNativeDriver: false }).start();
            }
         },
      }),
   ).current;

    useEffect(() => {
       const loadHospitals = async () => {
         const data = await fetchHospitals();
         setHospitals(data);
       };
       loadHospitals();

       setTimeout(() => setIsLoading(false), 1000);
      Animated.loop(
         Animated.sequence([
            Animated.timing(radarAnim, {
               toValue: 1,
               duration: 1500,
               useNativeDriver: true,
            }),
            Animated.timing(radarAnim, {
               toValue: 0.4,
               duration: 1500,
               useNativeDriver: true,
            }),
         ]),
      ).start();

      const timer = setTimeout(() => {
         if (step === "standby" && !activeMission && !selectedMission && !missionLoading) {
            setSelectedMission(MOCK_ALERTS[0]);
            setIsAssigned(true);
            Animated.spring(notifyAnim, {
               toValue: 1,
               useNativeDriver: true,
               tension: 50,
               friction: 7,
            }).start();
         }
      }, 4000);

      return () => clearTimeout(timer);
   }, [step]);

   const addTimelineEvent = (label: string, icon: string, status?: string) => {
      const now = new Date();
      const timeStr = `${now.getHours()}:${now.getMinutes().toString().padStart(2, "0")}`;
      setTimeline((prev) => [
         { id: Math.random().toString(), time: timeStr, label, icon, status },
         ...prev,
      ]);
   };

   /** Affectation structure (STRUCTURE_ASSIGNMENT_MOBILE_GUIDE.md) — temps réel + fetch */
   useEffect(() => {
      const struct = activeMission?.assigned_structure || selectedMission?.assigned_structure;
      const missionKey = activeMission?.id ?? selectedMission?.id ?? "";
      if (!struct?.id) {
         setPendingStructureInfo(null);
         if (activeMission != null && !activeMission.assigned_structure?.id) {
            setTargetHospital(null);
         }
         return;
      }
      const latN = struct.lat != null ? Number(struct.lat) : NaN;
      const lngN = struct.lng != null ? Number(struct.lng) : NaN;
      const hasCoords = Number.isFinite(latN) && Number.isFinite(lngN);

      if (!hasCoords) {
         setPendingStructureInfo({
            id: struct.id,
            name: struct.name,
            specialty: struct.type,
            address: struct.address ?? undefined,
            phone: struct.phone ?? undefined,
         });
         setTargetHospital(null);
         const tlKey = `${missionKey}:${struct.id}`;
         if (structureTimelineLoggedRef.current !== tlKey) {
            structureTimelineLoggedRef.current = tlKey;
            addTimelineEvent("Structure assignée par la centrale", "local-hospital", struct.name);
         }
         return;
      }

      setPendingStructureInfo(null);
      setTargetHospital((prev: Hospital | null) => {
         const next: Hospital = {
            id: struct.id,
            name: struct.name,
            specialty: struct.type,
            address: struct.address ?? undefined,
            phone: struct.phone ?? undefined,
            distance: "",
            coords: { latitude: latN, longitude: lngN },
         };
         if (
            prev &&
            prev.id === next.id &&
            prev.coords?.latitude === next.coords.latitude &&
            prev.coords?.longitude === next.coords.longitude &&
            prev.name === next.name
         ) {
            return prev;
         }
         return next;
      });

      const tlKey = `${missionKey}:${struct.id}`;
      if (structureTimelineLoggedRef.current !== tlKey) {
         structureTimelineLoggedRef.current = tlKey;
         addTimelineEvent("Structure assignée par la centrale", "local-hospital", struct.name);
      }
   }, [
      step,
      activeMission?.assigned_structure,
      activeMission?.id,
      selectedMission?.assigned_structure,
      selectedMission?.id,
   ]);

   useEffect(() => {
      if (!urgentisteLoc || !targetHospital?.coords) return;
      const now = Date.now();
      if (now - lastHospitalRouteFetch.current < 15000 && hospitalRouteGeoJSON) return;
      lastHospitalRouteFetch.current = now;
      getRoute(
         [urgentisteLoc.coords.longitude, urgentisteLoc.coords.latitude],
         [targetHospital.coords.longitude, targetHospital.coords.latitude],
         { profile: "driving-traffic" },
      ).then((result) => {
         if (result) {
            setHospitalRouteGeoJSON(buildRouteFeature(result.geometry));
            setHospitalRouteDuration(result.duration);
            setHospitalRouteDistance(result.distance);
         }
      });
   }, [urgentisteLoc?.coords.latitude, urgentisteLoc?.coords.longitude, targetHospital?.coords?.latitude, targetHospital?.coords?.longitude]);

   useEffect(() => {
      if (step !== "assignment") return;
      refresh();
      const id = setInterval(() => refresh(), 8000);
      return () => clearInterval(id);
   }, [step, refresh]);

   useFocusEffect(
      useCallback(() => {
         if (step !== "assignment") return;
         refresh();
      }, [step, refresh]),
   );

   const transitionTo = (nextStep: MissionStep, data?: AlertData) => {
      Animated.timing(fadeAnim, {
         toValue: 0,
         duration: 200,
         useNativeDriver: true,
      }).start(() => {
         if (data) setSelectedMission(data);
         setStep(nextStep);
         Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 200,
            useNativeDriver: true,
         }).start();
      });
   };

   const handleDepartVersStructure = async () => {
      if (departingEnRoute || !targetHospital?.coords) return;
      setDepartingEnRoute(true);
      try {
         await updateDispatchStatus("en_route_hospital");
         transitionTo("transport_mode");
         addTimelineEvent("Départ vers la structure", "local-shipping", targetHospital?.name);
      } catch (err) {
         console.error("Failed to depart to structure", err);
      } finally {
         setDepartingEnRoute(false);
      }
   };

   const handleStartMission = async (mission: any) => {
      try {
         await updateDispatchStatus('en_route');
         transitionTo("arrival", mission);
         addTimelineEvent("Acceptation mission", "assignment-turned-in");
      } catch (err) {
         console.error("Failed to start mission", err);
      }
   };
   const handleArrivalOnScene = async () => {
      try {
         await updateDispatchStatus('on_scene');
         transitionTo("assessment");
         addTimelineEvent("Arrivée sur les lieux", "place");
      } catch (err) {
         console.error("Failed to mark arrival", err);
      }
   };
    const handleConfirmAssessment = async () => {
       try {
          await updateMissionDetails({ assessment });
          transitionTo("aid");
          addTimelineEvent(
             "Évaluation terminée",
             "analytics",
             assessment.severity || "Stable",
          );
       } catch (err) {
          console.error("Failed to save assessment", err);
       }
    };
   const handleToggleCare = (careId: string) => {
      setCareChecklist((prev) => {
         const exists = prev.includes(careId);
         if (!exists) addTimelineEvent(`${careId} administré`, "medical-services");
         return exists ? prev.filter((c) => c !== careId) : [...prev, careId];
      });
   };
   const handleConfirmAid = () => {
      transitionTo("decision");
      addTimelineEvent("Soins prodigués", "favorite");
   };
    const handleDecideTransport = async (choice: string) => {
       setDecision(choice);
       if (choice === "Stable") {
          try {
             await updateDispatchStatus('completed');
             clearMissionState();
             transitionTo("closure");
             addTimelineEvent("Traité sur place", "check-circle");
          } catch (err) {
             console.error("Failed to complete mission", err);
          }
       } else {
          void refresh();
          transitionTo("assignment");
          addTimelineEvent(`Décision d'évacuation`, "local-shipping", choice);
       }
    };
   const handleSelectTransportMode = async (
      mode: "AMBULANCE" | "SMUR" | "PERSONNEL" | "MOTO",
   ) => {
      setTransportMode(mode);
      try {
         await updateDispatchStatus('en_route_hospital');
      } catch (err) {
         console.error("Failed to update en_route_hospital", err);
      }
      transitionTo("transport");
      let icon = "local-shipping";
      if (mode === "SMUR") icon = "fire-truck";
      if (mode === "PERSONNEL") icon = "directions-car";
      if (mode === "MOTO") icon = "two-wheeler";
      addTimelineEvent("Mode de transport choisi", icon, mode);
   };
    const handleArrivedAtHospital = async () => {
       try {
          await updateDispatchStatus('arrived_hospital');
          await updateDispatchStatus('completed');
          clearMissionState();
          transitionTo("closure");
          addTimelineEvent("Arrivée à l'hôpital — Mission terminée", "check-circle");
       } catch (err) {
          console.error("Failed to arrive at hospital", err);
       }
    };

   const renderTimeline = () => (
      <View style={styles.timelineContainer}>
          <Text style={styles.timelineHeader}>JOURNAL DE BORD (TIMELINE)</Text>
          <FlatList
             data={timeline}
             keyExtractor={(item) => item.id}
             nestedScrollEnabled
             showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
               <View style={styles.timelineItem}>
                  <View style={styles.timelinePointRow}>
                     <View style={styles.timelineLine} />
                     <View
                        style={[
                           styles.timelineIconBox,
                           { backgroundColor: colors.secondary + "20" },
                        ]}
                     >
                        <MaterialIcons
                           name={item.icon as any}
                           size={14}
                           color={colors.secondary}
                        />
                     </View>
                  </View>
                  <View style={styles.timelineContent}>
                     <View style={styles.timelineTextRow}>
                        <Text style={styles.timelineTime}>{item.time}</Text>
                        <Text style={styles.timelineLabel}>{item.label}</Text>
                     </View>
                     {item.status && (
                        <View style={styles.itemStatusBadge}>
                           <Text style={styles.itemStatusText}>
                              {item.status.toUpperCase()}
                           </Text>
                        </View>
                     )}
                  </View>
               </View>
            )}
         />
      </View>
   );

   const missionTypeLabel = formatIncidentType(selectedMission?.type);

   const runVictimVoipFromSignalement = async () => {
      const m = selectedMission;
      if (!m?.citizen_id || !m?.incident_id || voipLoading) {
         if (m && !m.citizen_id) {
            Alert.alert(
               "Appel (application)",
               "Aucun compte citoyen lié à cet incident (incidents.citizen_id). L’appel in-app n’est pas disponible.",
            );
         }
         return;
      }
      setVoipLoading(true);
      try {
         await startRescuerToCitizenVoipCall({
            incidentId: m.incident_id,
            citizenId: m.citizen_id,
            callType: "audio",
         });
      } catch (e) {
         alertVoipError(e);
      } finally {
         setVoipLoading(false);
      }
   };

   const callVictimPstnFromSignalement = () => {
      const m = selectedMission;
      const phone = m?.caller?.phone;
      if (phone && phone !== "-") {
         Linking.openURL(`tel:${phone}`);
      } else {
         Alert.alert("Téléphone", "Aucun numéro renseigné pour cette victime.");
      }
   };

   /** Bandeau contacter victime — uniquement avant arrivée sur les lieux (dispatché / en route). Vidéo via l’écran d’appel. */
   const renderVictimContactStripContent = () => {
      if (!selectedMission || !canOfferVictimContactCalls(selectedMission.dispatch_status)) {
         return null;
      }
      const hasPhone = !!(selectedMission.caller?.phone && selectedMission.caller.phone !== "-");
      const hasCitizen = !!selectedMission.citizen_id;
      return (
         <View style={styles.victimContactStrip}>
            <Text style={styles.victimContactStripTitle}>Contacter la victime (avant arrivée sur place)</Text>
            <View style={styles.victimContactRow}>
               <TouchableOpacity
                  style={[styles.victimContactChip, !hasPhone && styles.victimContactChipDisabled]}
                  onPress={callVictimPstnFromSignalement}
               >
                  <MaterialIcons
                     name="phone"
                     size={20}
                     color={hasPhone ? "#30D158" : "rgba(255,255,255,0.25)"}
                  />
                  <Text
                     style={[
                        styles.victimContactChipText,
                        !hasPhone && styles.victimContactChipTextDisabled,
                     ]}
                  >
                     Téléphone
                  </Text>
               </TouchableOpacity>
               <TouchableOpacity
                  style={[
                     styles.victimContactChip,
                     (!hasCitizen || voipLoading) && styles.victimContactChipDisabled,
                  ]}
                  onPress={() => void runVictimVoipFromSignalement()}
                  disabled={voipLoading || !hasCitizen}
               >
                  {voipLoading ? (
                     <ActivityIndicator color={colors.secondary} size="small" />
                  ) : (
                     <>
                        <MaterialIcons name="phone-in-talk" size={20} color={colors.secondary} />
                        <Text style={styles.victimContactChipText}>App audio</Text>
                     </>
                  )}
               </TouchableOpacity>
            </View>
            {!hasCitizen && (
               <Text style={styles.victimContactHint}>
                  App in-app : identifiant citoyen absent (vérifiez incidents.citizen_id en base).
               </Text>
            )}
            {!hasPhone && hasCitizen && (
               <Text style={styles.victimContactHint}>Pas de numéro de téléphone sur la fiche.</Text>
            )}
         </View>
      );
   };

   const renderStepInlineHeader = () => (
      <View style={[styles.stepInlineHeader, { paddingTop: Math.max(insets.top, 12) }]}>
         <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.stepInlineBack}
            accessibilityRole="button"
            accessibilityLabel="Retour"
         >
            <MaterialIcons name="arrow-back" color="#FFF" size={24} />
         </TouchableOpacity>
         <View style={styles.stepInlineTextCol}>
            <Text style={styles.stepInlineLabel}>{STEP_LABELS[step]}</Text>
            <Text style={styles.stepInlineTitle} numberOfLines={2}>{missionTypeLabel}</Text>
         </View>
      </View>
   );

   return (
      <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
         <StatusBar barStyle="light-content" />
         {step === "standby" && (
            <View style={styles.topHeader}>
               <View style={styles.headerRow}>
                  <TouchableOpacity
                     onPress={() => navigation.goBack()}
                     style={styles.backBtn}
                  >
                     <MaterialIcons name="arrow-back" color="#FFF" size={24} />
                  </TouchableOpacity>
                  <View style={{ flex: 1, paddingHorizontal: 15 }}>
                     <Text style={styles.greetingText}>Centrale régulation</Text>
                     <Text style={styles.hospitalName} numberOfLines={1}>
                        Attente d'affectation...
                     </Text>
                  </View>
               </View>
            </View>
         )}

         <View style={styles.mainWrapper}>
            <Animated.View style={[styles.contentArea, { opacity: fadeAnim }]}>
               {step === "standby" && (
                  <View style={styles.standbyView}>
                     <View style={styles.radarWrapper}>
                        <Animated.View
                           style={[
                              styles.radarCircle,
                              {
                                 transform: [{ scale: radarAnim }],
                                 opacity: Animated.subtract(1, radarAnim),
                              },
                           ]}
                        />
                        <MaterialIcons
                           name="wifi-tethering"
                           size={60}
                           color={colors.secondary}
                        />
                     </View>
                     <Text style={styles.standbyText}>
                        En attente d'une mission...
                     </Text>
                     <Text style={styles.standbySub}>
                        Votre unité est disponible pour affectation prioritaire par la
                        centrale.
                     </Text>
                     {isAssigned && selectedMission && (
                        <Animated.View
                           style={[
                              styles.assignmentPopup,
                              {
                                 transform: [
                                    {
                                       translateY: notifyAnim.interpolate({
                                          inputRange: [0, 1],
                                          outputRange: [200, 0],
                                       }),
                                    },
                                 ],
                              },
                           ]}
                        >
                           <View style={styles.assignRow}>
                              <View style={styles.priorityDot} />
                              <Text style={styles.assignHeader}>
                                 Nouvelle mission affectée
                              </Text>
                           </View>
                           <Text style={styles.assignType}>{selectedMission.type}</Text>
                           <Text style={styles.assignLoc}>
                              {displayAddress}
                           </Text>
                           <TouchableOpacity
                              style={styles.assignAction}
                              onPress={() => {
                                 setSelectedMission(selectedMission);
                                 transitionTo("reception");
                              }}
                           >
                              <Text style={styles.assignActionText}>
                                 Consulter l'alerte
                              </Text>
                              <MaterialIcons
                                 name="chevron-right"
                                 size={24}
                                 color="#FFF"
                              />
                           </TouchableOpacity>
                        </Animated.View>
                     )}
                  </View>
               )}

               {step === "reception" && selectedMission && (
                  <View style={[styles.receptionView, { padding: 0 }]}>
                     <View style={styles.receptionMapWrapper}>
                        <TouchableOpacity
                           onPress={() => navigation.goBack()}
                           style={[styles.floatingBackSignalement, { top: insets.top + 10 }]}
                           accessibilityRole="button"
                           accessibilityLabel="Retour"
                        >
                           <MaterialIcons name="arrow-back" color="#FFF" size={24} />
                        </TouchableOpacity>
                        <MapboxMapView style={styles.receptionMap} styleURL={Mapbox.StyleURL.Dark} compassEnabled={false} scaleBarEnabled={false}>
                           {receptionCameraBounds ? (
                              <Mapbox.Camera
                                 bounds={receptionCameraBounds}
                                 animationMode="flyTo"
                                 animationDuration={1000}
                              />
                           ) : (
                              <Mapbox.Camera
                                 centerCoordinate={[selectedMission.location?.lng || 15.307045, selectedMission.location?.lat || -4.322447]}
                                 zoomLevel={13}
                              />
                           )}

                           <Mapbox.PointAnnotation id="victim-reception" coordinate={[selectedMission.location?.lng || 15.307045, selectedMission.location?.lat || -4.322447]}>
                             <View style={styles.victimMarker}>
                                <HeartPulse size={16} color="#FFF" strokeWidth={2.5} />
                             </View>
                           </Mapbox.PointAnnotation>

                           {urgentisteLoc && (
                              <Mapbox.PointAnnotation id="my-unit-reception" coordinate={[urgentisteLoc.coords.longitude, urgentisteLoc.coords.latitude]}>
                                 <View style={styles.urgentisteMarker}>
                                    <Ambulance size={16} color="#FFF" strokeWidth={2.5} />
                                 </View>
                              </Mapbox.PointAnnotation>
                           )}

                           {routeGeoJSON && (
                              <Mapbox.ShapeSource id="route-reception" shape={routeGeoJSON}>
                                 <Mapbox.LineLayer id="route-reception-line" style={{ lineColor: '#4A90D9', lineWidth: 4, lineOpacity: 0.85 }} />
                              </Mapbox.ShapeSource>
                           )}
                       </MapboxMapView>
                       <View style={styles.mapDistOverlay}>
                          <MaterialIcons name="navigation" size={14} color="#FFF" />
                          <Text style={styles.mapDistText}>{routeInfoText}</Text>
                       </View>
                    </View>

                     <View style={styles.receptionBottomPanel}>
                        <ScrollView
                           showsVerticalScrollIndicator={false}
                           contentContainerStyle={{ padding: 24, paddingBottom: 120 }}
                        >
                           <View style={styles.detailBox}>
                              <View style={styles.receptionHeaderStrip}>
                                 <MaterialIcons
                                    name={
                                       selectedMission.priority === "CRITIQUE"
                                          ? "priority-high"
                                          : "info"
                                    }
                                    color={
                                       selectedMission.priority === "CRITIQUE"
                                          ? colors.primary
                                          : colors.secondary
                                    }
                                    size={32}
                                 />
                                 <View style={{ flex: 1, minWidth: 0 }}>
                                    <Text style={styles.detailMissionType} numberOfLines={2}>
                                       {formatIncidentType(selectedMission.type)}
                                    </Text>
                                    <Text style={styles.priorityStatusText}>
                                       {selectedMission.priority} • {selectedMission.time}{" "}
                                       d'attente
                                    </Text>
                                 </View>
                              </View>
                              <View style={styles.divider} />
                              <Text style={styles.detailLabel}>Site d'affectation</Text>
                               <Text style={styles.detailVal}>
                                 {displayAddress}
                               </Text>
                              <View style={styles.divider} />
                              <Text style={styles.detailLabel}>Descriptif central</Text>
                              {formatDescriptionLines(selectedMission.description).map((line, i) => (
                                 <Text key={i} style={styles.detailDesc}>{"\u2022  "}{line}</Text>
                              ))}
                           </View>
                        </ScrollView>

                        {selectedMission &&
                           canOfferVictimContactCalls(selectedMission.dispatch_status) && (
                              <View style={styles.victimStripReceptionWrap}>
                                 {renderVictimContactStripContent()}
                              </View>
                           )}

                        <View style={styles.stickySwipeWrapper}>
                           <View style={styles.swipeContainer}>
                              <View style={styles.swipeBackground}>
                                 <Text style={styles.swipeText}>
                                    Glisser pour débuter l'intervention
                                 </Text>
                                 <MaterialIcons
                                    name="chevron-right"
                                    color="rgba(255,255,255,0.3)"
                                    size={24}
                                 />
                              </View>
                              <Animated.View
                                 style={[
                                    styles.swipeThumb,
                                    { transform: [{ translateX: pan }] },
                                 ]}
                                 {...panResponder.panHandlers}
                              >
                                 <MaterialIcons
                                    name="keyboard-double-arrow-right"
                                    color="#000"
                                    size={28}
                                 />
                              </Animated.View>
                           </View>
                        </View>
                     </View>
                  </View>
               )}

               {step === "arrival" && selectedMission && (
                  <View
                     style={[
                        styles.stepBase,
                        { paddingHorizontal: 0, paddingBottom: 0 },
                     ]}
                  >
                      <View
                         style={[
                            styles.trackingMapWrapper,
                            { flex: 1, borderRadius: 0, borderWidth: 0 },
                         ]}
                      >
                         <TouchableOpacity
                            onPress={() => navigation.goBack()}
                            style={[styles.floatingBackSignalement, { top: insets.top + 10 }]}
                            accessibilityRole="button"
                            accessibilityLabel="Retour"
                         >
                            <MaterialIcons name="arrow-back" color="#FFF" size={24} />
                         </TouchableOpacity>
                         <MapboxMapView style={styles.trackingMap} styleURL={Mapbox.StyleURL.Dark} compassEnabled={false} scaleBarEnabled={false}>
                            {receptionCameraBounds ? (
                               <Mapbox.Camera
                                  bounds={receptionCameraBounds}
                                  animationMode="flyTo"
                                  animationDuration={1000}
                               />
                            ) : (
                               <Mapbox.Camera
                                  centerCoordinate={[selectedMission.location?.lng || 15.307045, selectedMission.location?.lat || -4.322447]}
                                  zoomLevel={15}
                               />
                            )}

                            <Mapbox.PointAnnotation id="victim-arrival" coordinate={[selectedMission.location?.lng || 15.307045, selectedMission.location?.lat || -4.322447]}>
                              <View style={styles.victimMarker}>
                                 <HeartPulse size={16} color="#FFF" strokeWidth={2.5} />
                              </View>
                            </Mapbox.PointAnnotation>

                            {urgentisteLoc && (
                               <Mapbox.PointAnnotation id="my-unit-arrival" coordinate={[urgentisteLoc.coords.longitude, urgentisteLoc.coords.latitude]}>
                                  <View style={styles.urgentisteMarker}>
                                     <Ambulance size={16} color="#FFF" strokeWidth={2.5} />
                                  </View>
                               </Mapbox.PointAnnotation>
                            )}

                            {routeGeoJSON && (
                               <Mapbox.ShapeSource id="route-arrival" shape={routeGeoJSON}>
                                  <Mapbox.LineLayer id="route-arrival-line" style={{ lineColor: '#4A90D9', lineWidth: 4, lineOpacity: 0.85 }} />
                               </Mapbox.ShapeSource>
                            )}
                        </MapboxMapView>
                        <View style={styles.mapAddressOverlay}>
                           <MaterialIcons
                              name="place"
                              size={14}
                              color="rgba(255,255,255,0.6)"
                           />
                           <View style={{ flex: 1, minWidth: 0 }}>
                              <Text style={styles.mapAddressOverlayLabel}>Site d'affectation</Text>
                              <Text style={styles.smallAddressText} numberOfLines={4}>
                                 {displayAddress}
                              </Text>
                           </View>
                        </View>
                     </View>
                     <View style={styles.arrivalFooter}>
                        <View style={styles.footerTimerBox}>
                           <Text style={styles.footerTimerVal}>
                              {formatTime(elapsedSeconds)}
                           </Text>
                           <Text style={styles.footerTimerLab}>Temps écoulé</Text>
                        </View>
                        <TouchableOpacity
                           style={[
                              styles.footerBtn,
                              { backgroundColor: colors.success },
                           ]}
                           onPress={handleArrivalOnScene}
                        >
                           <MaterialIcons name="place" size={20} color="#FFF" />
                           <Text style={styles.footerBtnText}>Arrivée sur site</Text>
                        </TouchableOpacity>
                     </View>
                  </View>
               )}

               {step === "assessment" && (
                  <View style={styles.stepBase}>
                     {renderStepInlineHeader()}
                     <Text style={styles.stepSectionHeading}>Évaluation initiale</Text>
                     <ScrollView
                        style={{ flex: 1 }}
                        showsVerticalScrollIndicator={false}
                     >
                        <View style={styles.assessmentMainCard}>
                           <View style={styles.assessmentRow}>
                              <View style={styles.assessmentIconBox}>
                                 <MaterialIcons
                                    name="psychology"
                                    size={24}
                                    color={colors.secondary}
                                 />
                              </View>
                              <View style={{ flex: 1 }}>
                                 <Text style={styles.assessmentRowTitle}>Conscience</Text>
                                 <Text style={styles.assessmentRowSub}>
                                    {assessment.conscious === false
                                       ? "Inconscient"
                                       : assessment.conscious === true
                                          ? "Conscient"
                                          : "À évaluer"}
                                 </Text>
                              </View>
                              <View style={styles.miniToggleGroup}>
                                 <TouchableOpacity
                                    style={[
                                       styles.miniToggle,
                                       assessment.conscious === true &&
                                       styles.miniToggleActive,
                                    ]}
                                    onPress={() =>
                                       setAssessment({ ...assessment, conscious: true })
                                    }
                                 >
                                    <Text
                                       style={[
                                          styles.miniToggleText,
                                          assessment.conscious === true &&
                                          styles.miniToggleTextActive,
                                       ]}
                                    >
                                       Oui
                                    </Text>
                                 </TouchableOpacity>
                                 <TouchableOpacity
                                    style={[
                                       styles.miniToggle,
                                       assessment.conscious === false &&
                                       styles.miniToggleCrit,
                                    ]}
                                    onPress={() =>
                                       setAssessment({ ...assessment, conscious: false })
                                    }
                                 >
                                    <Text
                                       style={[
                                          styles.miniToggleText,
                                          assessment.conscious === false &&
                                          styles.miniToggleTextCrit,
                                       ]}
                                    >
                                       Non
                                    </Text>
                                 </TouchableOpacity>
                              </View>
                           </View>
                           <View style={styles.divider} />
                           <View style={styles.assessmentRow}>
                              <View style={styles.assessmentIconBox}>
                                 <MaterialIcons
                                    name="air"
                                    size={24}
                                    color={colors.secondary}
                                 />
                              </View>
                              <View style={{ flex: 1 }}>
                                 <Text style={styles.assessmentRowTitle}>Respiration</Text>
                                 <Text style={styles.assessmentRowSub}>
                                    {assessment.breathing === false
                                       ? "Absente"
                                       : assessment.breathing === true
                                          ? "Présente"
                                          : "À évaluer"}
                                 </Text>
                              </View>
                              <View style={styles.miniToggleGroup}>
                                 <TouchableOpacity
                                    style={[
                                       styles.miniToggle,
                                       assessment.breathing === true &&
                                       styles.miniToggleActive,
                                    ]}
                                    onPress={() =>
                                       setAssessment({ ...assessment, breathing: true })
                                    }
                                 >
                                    <Text
                                       style={[
                                          styles.miniToggleText,
                                          assessment.breathing === true &&
                                          styles.miniToggleTextActive,
                                       ]}
                                    >
                                       Oui
                                    </Text>
                                 </TouchableOpacity>
                                 <TouchableOpacity
                                    style={[
                                       styles.miniToggle,
                                       assessment.breathing === false &&
                                       styles.miniToggleCrit,
                                    ]}
                                    onPress={() =>
                                       setAssessment({ ...assessment, breathing: false })
                                    }
                                 >
                                    <Text
                                       style={[
                                          styles.miniToggleText,
                                          assessment.breathing === false &&
                                          styles.miniToggleTextCrit,
                                       ]}
                                    >
                                       Non
                                    </Text>
                                 </TouchableOpacity>
                              </View>
                           </View>
                        </View>
                        <Text style={styles.sectionHeader}>Niveau de gravité</Text>
                        <View style={styles.severityGrid}>
                           {[
                              { id: "Critique", color: colors.primary, icon: "warning" },
                              { id: "Urgent", color: "#FF9800", icon: "error-outline" },
                              {
                                 id: "Stable",
                                 color: colors.success,
                                 icon: "check-circle-outline",
                              },
                           ].map((s) => (
                              <TouchableOpacity
                                 key={s.id}
                                 style={[
                                    styles.severityItem,
                                    assessment.severity === s.id && {
                                       backgroundColor: s.color + "15",
                                       borderColor: s.color,
                                    },
                                 ]}
                                 onPress={() =>
                                    setAssessment({ ...assessment, severity: s.id })
                                 }
                              >
                                 <MaterialIcons
                                    name={s.icon as any}
                                    size={28}
                                    color={
                                       assessment.severity === s.id
                                          ? s.color
                                          : "rgba(255,255,255,0.2)"
                                    }
                                 />
                                 <Text
                                    style={[
                                       styles.severityItemText,
                                       assessment.severity === s.id && { color: s.color },
                                    ]}
                                 >
                                    {s.id}
                                 </Text>
                              </TouchableOpacity>
                           ))}
                        </View>
                        {assessment.conscious === false && (
                           <View style={styles.smartAlertBox}>
                              <MaterialIcons name="info" size={20} color="#FFF" />
                              <Text style={styles.smartAlertBoxText}>
                                 Conseil : Commencer RCR & appel renfort
                              </Text>
                           </View>
                        )}
                     </ScrollView>
                     <TouchableOpacity
                        style={[
                           styles.bigActionBtn,
                           (assessment.conscious === null || !assessment.severity) && {
                              opacity: 0.5,
                           },
                        ]}
                        disabled={assessment.conscious === null || !assessment.severity}
                        onPress={handleConfirmAssessment}
                     >
                        <MaterialIcons name="done-all" size={24} color="#FFF" />
                        <Text style={styles.bigActionText}>Valider l'évaluation</Text>
                     </TouchableOpacity>
                  </View>
               )}

               {step === "aid" && (
                  <View style={styles.stepBase}>
                     {renderStepInlineHeader()}
                     <Text style={styles.stepSectionHeading}>Premiers soins</Text>
                     <ScrollView
                        style={{ flex: 1 }}
                        showsVerticalScrollIndicator={false}
                     >
                        <View style={styles.aidGrid}>
                           {[
                              {
                                 id: "Hémorragie",
                                 label: "Contrôler hémorragie",
                                 icon: "opacity",
                              },
                              { id: "Oxygène", label: "Soutien Oxygène", icon: "air" },
                              {
                                 id: "Immobilisation",
                                 label: "Immobilisation",
                                 icon: "accessibility",
                              },
                              { id: "RCR", label: "RCR / Défib", icon: "bolt" },
                              { id: "Perfusion", label: "IV Access", icon: "colorize" },
                              {
                                 id: "Monitor",
                                 label: "Monitoring ECG",
                                 icon: "favorite",
                              },
                           ].map((care) => {
                              const isActive = careChecklist.includes(care.id);
                              return (
                                 <TouchableOpacity
                                    key={care.id}
                                    style={[
                                       styles.aidCardGrid,
                                       isActive && {
                                          borderColor: colors.secondary,
                                          backgroundColor: colors.secondary + "15",
                                       },
                                    ]}
                                    onPress={() => handleToggleCare(care.id)}
                                 >
                                    <View
                                       style={[
                                          styles.aidIconWrapper,
                                          isActive && { backgroundColor: colors.secondary },
                                       ]}
                                    >
                                       <MaterialIcons
                                          name={care.icon as any}
                                          size={22}
                                          color={isActive ? "#000" : "rgba(255,255,255,0.4)"}
                                       />
                                    </View>
                                    <Text
                                       style={[
                                          styles.aidLabelGrid,
                                          isActive && { color: "#FFF" },
                                       ]}
                                    >
                                       {care.label}
                                    </Text>
                                    {isActive && (
                                       <View style={styles.aidCheckBadge}>
                                          <MaterialIcons
                                             name="check"
                                             size={12}
                                             color="#000"
                                          />
                                       </View>
                                    )}
                                 </TouchableOpacity>
                              );
                           })}
                        </View>
                     </ScrollView>
                     <TouchableOpacity
                        style={styles.bigActionBtn}
                        onPress={handleConfirmAid}
                     >
                        <Text style={styles.bigActionText}>Valider les soins</Text>
                     </TouchableOpacity>
                  </View>
               )}

               {step === "decision" && (
                  <View style={styles.stepBase}>
                     {renderStepInlineHeader()}
                     <Text style={styles.stepSectionHeading}>Plan d'évacuation</Text>
                     <View style={styles.decisionGrid}>
                        <TouchableOpacity
                           style={styles.decisionCardGrid}
                           onPress={() => handleDecideTransport("Stable")}
                        >
                           <View
                              style={[
                                 styles.decisionIconBox,
                                 { backgroundColor: colors.success + "10" },
                              ]}
                           >
                              <MaterialCommunityIcons
                                 name="home-heart"
                                 size={28}
                                 color={colors.success}
                              />
                           </View>
                           <Text style={styles.decisionLabel}>Traité sur place</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                           style={styles.decisionCardGrid}
                           onPress={() => handleDecideTransport("Transport")}
                        >
                           <View
                              style={[
                                 styles.decisionIconBox,
                                 { backgroundColor: colors.secondary + "10" },
                              ]}
                           >
                              <MaterialCommunityIcons
                                 name="ambulance"
                                 size={28}
                                 color={colors.secondary}
                              />
                           </View>
                           <Text style={styles.decisionLabel}>Évacuation base</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                           style={[
                              styles.decisionCardGrid,
                              { borderColor: colors.primary + "40" },
                           ]}
                           onPress={() => handleDecideTransport("Critique")}
                        >
                           <View
                              style={[
                                 styles.decisionIconBox,
                                 { backgroundColor: colors.primary + "10" },
                              ]}
                           >
                              <MaterialCommunityIcons
                                 name="alarm-light-outline"
                                 size={28}
                                 color={colors.primary}
                              />
                           </View>
                           <Text
                              style={[styles.decisionLabel, { color: colors.primary }]}
                           >
                              Urgence vitale
                           </Text>
                        </TouchableOpacity>
                     </View>
                  </View>
               )}

               {step === "assignment" && (
                  <View style={[styles.stepBase, { paddingHorizontal: 0, paddingBottom: 0 }]}>
                     <View style={{ paddingHorizontal: 24 }}>{renderStepInlineHeader()}</View>
                     {!targetHospital && !pendingStructureInfo ? (
                        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
                           <ActivityIndicator size="large" color={colors.secondary} />
                           <Text style={[styles.standbyText, { marginTop: 20 }]}>
                              Attente du régulateur...
                           </Text>
                           <Text style={styles.standbySub}>
                              La centrale recherche l'établissement le plus adapté.
                           </Text>
                        </View>
                     ) : pendingStructureInfo && !targetHospital ? (
                        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 28 }}>
                           <MaterialIcons name="local-hospital" size={48} color={colors.secondary} />
                           <Text style={[styles.standbyText, { marginTop: 16, textAlign: "center" }]}>
                              {pendingStructureInfo.name}
                           </Text>
                           <Text style={[styles.standbySub, { marginTop: 12, textAlign: "center" }]}>
                              Structure reçue — en attente des coordonnées GPS (centrale).
                           </Text>
                           <ActivityIndicator size="small" color={colors.secondary} style={{ marginTop: 20 }} />
                        </View>
                     ) : (
                        <View style={{ flex: 1 }}>
                           <View style={{ flex: 1, borderRadius: 0, overflow: "hidden" }}>
                              <MapboxMapView style={{ flex: 1 }} styleURL={Mapbox.StyleURL.Dark} compassEnabled={false} scaleBarEnabled={false}>
                                 {urgentisteLoc ? (
                                    <Mapbox.Camera
                                       bounds={
                                          hospitalRouteCameraBounds ?? {
                                             ne: [
                                                Math.max(targetHospital.coords.longitude, urgentisteLoc.coords.longitude),
                                                Math.max(targetHospital.coords.latitude, urgentisteLoc.coords.latitude),
                                             ],
                                             sw: [
                                                Math.min(targetHospital.coords.longitude, urgentisteLoc.coords.longitude),
                                                Math.min(targetHospital.coords.latitude, urgentisteLoc.coords.latitude),
                                             ],
                                             paddingTop: 80,
                                             paddingBottom: 200,
                                             paddingLeft: 60,
                                             paddingRight: 60,
                                          }
                                       }
                                       animationMode="flyTo"
                                       animationDuration={1000}
                                    />
                                 ) : (
                                    <Mapbox.Camera
                                       centerCoordinate={[targetHospital.coords.longitude, targetHospital.coords.latitude]}
                                       zoomLevel={13}
                                    />
                                 )}

                                 <Mapbox.PointAnnotation id="hospital-assign" coordinate={[targetHospital.coords.longitude, targetHospital.coords.latitude]}>
                                    <View style={styles.hospitalMarker}>
                                       <HospitalIcon size={16} color="#FFF" strokeWidth={2.5} />
                                    </View>
                                 </Mapbox.PointAnnotation>

                                 {urgentisteLoc && (
                                    <Mapbox.PointAnnotation id="my-unit-assign" coordinate={[urgentisteLoc.coords.longitude, urgentisteLoc.coords.latitude]}>
                                       <View style={styles.urgentisteMarker}>
                                          <Ambulance size={16} color="#FFF" strokeWidth={2.5} />
                                       </View>
                                    </Mapbox.PointAnnotation>
                                 )}

                                 {hospitalRouteGeoJSON && (
                                    <Mapbox.ShapeSource id="route-hospital-assign" shape={hospitalRouteGeoJSON}>
                                       <Mapbox.LineLayer id="route-hospital-assign-line" style={{ lineColor: '#34C759', lineWidth: 4, lineOpacity: 0.85 }} />
                                    </Mapbox.ShapeSource>
                                 )}
                              </MapboxMapView>

                              <TouchableOpacity
                                 style={styles.assignmentEnRouteFab}
                                 onPress={handleDepartVersStructure}
                                 disabled={departingEnRoute}
                                 accessibilityRole="button"
                                 accessibilityLabel="Nous sommes en route vers la structure"
                              >
                                 {departingEnRoute ? (
                                    <ActivityIndicator color="#FFF" size="small" />
                                 ) : (
                                    <>
                                       <MaterialIcons name="directions-run" color="#FFF" size={22} />
                                       <Text style={styles.assignmentEnRouteFabText}>En route</Text>
                                    </>
                                 )}
                              </TouchableOpacity>

                              <TouchableOpacity
                                 style={styles.assignmentNavFab}
                                 onPress={() =>
                                    openExternalDirections(
                                       targetHospital.coords.latitude,
                                       targetHospital.coords.longitude,
                                       targetHospital.name,
                                    )
                                 }
                                 accessibilityRole="button"
                                 accessibilityLabel="Ouvrir la navigation"
                              >
                                 <MaterialIcons name="navigation" color="#FFF" size={22} />
                              </TouchableOpacity>

                              {hospitalRouteDistance != null && hospitalRouteDuration != null && (
                                 <View style={styles.mapDistOverlay}>
                                    <MaterialIcons name="navigation" size={14} color="#FFF" />
                                    <Text style={styles.mapDistText}>
                                       {hospitalRouteDistance < 1000 ? `${Math.round(hospitalRouteDistance)} m` : `${(hospitalRouteDistance / 1000).toFixed(1)} km`} • {Math.ceil(hospitalRouteDuration / 60)} min
                                    </Text>
                                 </View>
                              )}
                           </View>

                           <View style={styles.assignmentBottomPanel}>
                              <View style={styles.assignmentStructureCard}>
                                 <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                    <View style={styles.structureIconBox}>
                                       <MaterialIcons
                                          name={targetHospital.specialty === 'pharmacie' ? 'local-pharmacy' : targetHospital.specialty === 'maternite' ? 'pregnant-woman' : 'local-hospital'}
                                          size={24}
                                          color={colors.secondary}
                                       />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                       <Text style={styles.structureName}>{targetHospital.name}</Text>
                                       {targetHospital.address && (
                                          <Text style={styles.structureAddress}>{targetHospital.address}</Text>
                                       )}
                                       <Text style={styles.structureCoords}>
                                          {targetHospital.coords.latitude.toFixed(5)}, {targetHospital.coords.longitude.toFixed(5)}
                                       </Text>
                                    </View>
                                 </View>
                                 <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                                    {targetHospital.phone && (
                                       <TouchableOpacity
                                          style={styles.structureCallBtn}
                                          onPress={() => Linking.openURL(`tel:${targetHospital.phone}`)}
                                       >
                                          <MaterialIcons name="phone" size={16} color="#30D158" />
                                          <Text style={styles.structureCallText}>Appeler</Text>
                                       </TouchableOpacity>
                                    )}
                                    <View style={styles.hospResBadge}>
                                       <MaterialIcons name="verified" size={12} color={colors.secondary} />
                                       <Text style={styles.hospResBadgeText}>Confirmé par centrale</Text>
                                    </View>
                                 </View>
                              </View>
                              <TouchableOpacity
                                 style={[styles.bigActionBtn, { marginHorizontal: 20, marginBottom: 20 }]}
                                 onPress={handleDepartVersStructure}
                                 disabled={departingEnRoute}
                              >
                                 <Text style={styles.bigActionText}>
                                    {departingEnRoute ? "Mise à jour…" : "Choisir le transport"}
                                 </Text>
                              </TouchableOpacity>
                           </View>
                        </View>
                     )}
                  </View>
               )}

               {step === "transport_mode" && (
                  <View style={styles.stepBase}>
                     {renderStepInlineHeader()}
                     <Text style={styles.stepSectionHeading}>Mode de transport</Text>
                     <View style={styles.aidGrid}>
                        <TouchableOpacity
                           style={styles.aidCardGrid}
                           onPress={() => handleSelectTransportMode("AMBULANCE")}
                        >
                           <View
                              style={[
                                 styles.aidIconWrapper,
                                 { backgroundColor: colors.secondary + "10" },
                              ]}
                           >
                              <MaterialCommunityIcons
                                 name="ambulance"
                                 size={22}
                                 color={colors.secondary}
                              />
                           </View>
                           <Text style={styles.aidLabelGrid}>Ambulance standard</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                           style={[
                              styles.aidCardGrid,
                              { borderColor: colors.primary + "40" },
                           ]}
                           onPress={() => handleSelectTransportMode("SMUR")}
                        >
                           <View
                              style={[
                                 styles.aidIconWrapper,
                                 { backgroundColor: colors.primary + "10" },
                              ]}
                           >
                              <MaterialCommunityIcons
                                 name="truck-plus"
                                 size={22}
                                 color={colors.primary}
                              />
                           </View>
                           <Text
                              style={[styles.aidLabelGrid, { color: colors.primary }]}
                           >
                              Unité SMUR / Réa
                           </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                           style={styles.aidCardGrid}
                           onPress={() => handleSelectTransportMode("MOTO")}
                        >
                           <View
                              style={[
                                 styles.aidIconWrapper,
                                 { backgroundColor: colors.secondary + "10" },
                              ]}
                           >
                              <MaterialCommunityIcons
                                 name="moped"
                                 size={22}
                                 color={colors.secondary}
                              />
                           </View>
                           <Text style={styles.aidLabelGrid}>Moto intervention</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                           style={styles.aidCardGrid}
                           onPress={() => handleSelectTransportMode("PERSONNEL")}
                        >
                           <View
                              style={[
                                 styles.aidIconWrapper,
                                 { backgroundColor: colors.success + "10" },
                              ]}
                           >
                              <MaterialCommunityIcons
                                 name="car-side"
                                 size={22}
                                 color={colors.success}
                              />
                           </View>
                           <Text style={styles.aidLabelGrid}>Transport perso</Text>
                        </TouchableOpacity>
                     </View>
                  </View>
               )}

               {step === "transport" && targetHospital && (
                  <View style={[styles.stepBase, { paddingHorizontal: 0, paddingBottom: 0 }]}>
                     <View style={{ flex: 1, borderRadius: 0, overflow: "hidden" }}>
                        <TouchableOpacity
                           onPress={() => navigation.goBack()}
                           style={[styles.floatingBackSignalement, { top: insets.top + 10 }]}
                           accessibilityRole="button"
                           accessibilityLabel="Retour"
                        >
                           <MaterialIcons name="arrow-back" color="#FFF" size={24} />
                        </TouchableOpacity>
                        <MapboxMapView style={{ flex: 1 }} styleURL={Mapbox.StyleURL.Dark} compassEnabled={false} scaleBarEnabled={false}>
                           {urgentisteLoc ? (
                              <Mapbox.Camera
                                 bounds={
                                    hospitalRouteCameraBounds ?? {
                                       ne: [
                                          Math.max(targetHospital.coords.longitude, urgentisteLoc.coords.longitude),
                                          Math.max(targetHospital.coords.latitude, urgentisteLoc.coords.latitude),
                                       ],
                                       sw: [
                                          Math.min(targetHospital.coords.longitude, urgentisteLoc.coords.longitude),
                                          Math.min(targetHospital.coords.latitude, urgentisteLoc.coords.latitude),
                                       ],
                                       paddingTop: 80,
                                       paddingBottom: 180,
                                       paddingLeft: 60,
                                       paddingRight: 60,
                                    }
                                 }
                                 animationMode="flyTo"
                                 animationDuration={1000}
                              />
                           ) : (
                              <Mapbox.Camera
                                 centerCoordinate={[targetHospital.coords.longitude, targetHospital.coords.latitude]}
                                 zoomLevel={13}
                              />
                           )}

                           <Mapbox.PointAnnotation id="hospital-dest" coordinate={[targetHospital.coords.longitude, targetHospital.coords.latitude]}>
                              <View style={styles.hospitalMarker}>
                                 <HospitalIcon size={16} color="#FFF" strokeWidth={2.5} />
                              </View>
                           </Mapbox.PointAnnotation>

                           {urgentisteLoc && (
                              <Mapbox.PointAnnotation id="my-unit-transport" coordinate={[urgentisteLoc.coords.longitude, urgentisteLoc.coords.latitude]}>
                                 <View style={styles.urgentisteMarker}>
                                    <Ambulance size={16} color="#FFF" strokeWidth={2.5} />
                                 </View>
                              </Mapbox.PointAnnotation>
                           )}

                           {hospitalRouteGeoJSON && (
                              <Mapbox.ShapeSource id="route-hospital-transport" shape={hospitalRouteGeoJSON}>
                                 <Mapbox.LineLayer id="route-hospital-transport-line" style={{ lineColor: '#34C759', lineWidth: 4, lineOpacity: 0.85 }} />
                              </Mapbox.ShapeSource>
                           )}
                        </MapboxMapView>

                        {hospitalRouteDistance != null && hospitalRouteDuration != null && (
                           <View style={styles.mapDistOverlay}>
                              <MaterialIcons name="navigation" size={14} color="#FFF" />
                              <Text style={styles.mapDistText}>
                                 {hospitalRouteDistance < 1000 ? `${Math.round(hospitalRouteDistance)} m` : `${(hospitalRouteDistance / 1000).toFixed(1)} km`} • {Math.ceil(hospitalRouteDuration / 60)} min
                              </Text>
                           </View>
                        )}
                     </View>

                     <View style={styles.transportBottomPanel}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 16 }}>
                           <View style={styles.structureIconBox}>
                              <MaterialIcons name="local-hospital" size={22} color={colors.secondary} />
                           </View>
                           <View style={{ flex: 1 }}>
                              <Text style={styles.structureName}>{targetHospital.name}</Text>
                              {targetHospital.address && (
                                 <Text style={styles.structureAddress} numberOfLines={1}>{targetHospital.address}</Text>
                              )}
                           </View>
                           {transportMode && (
                              <View style={{ backgroundColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
                                 <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: '700' }}>{transportMode}</Text>
                              </View>
                           )}
                        </View>
                        <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16 }}>
                           <TouchableOpacity
                              style={[styles.bigActionBtn, { flex: 1, backgroundColor: colors.success }]}
                              onPress={handleArrivedAtHospital}
                           >
                              <MaterialIcons name="check-circle" size={24} color="#FFF" />
                              <Text style={styles.bigActionText}>Arrivée à l'hôpital</Text>
                           </TouchableOpacity>
                        </View>
                     </View>
                  </View>
               )}

               {step === "closure" && (
                  <View style={styles.stepBase}>
                     {renderStepInlineHeader()}
                     <View style={styles.closureView}>
                        <View style={styles.successHalo}>
                           <MaterialIcons
                              name="check"
                              size={50}
                              color={colors.secondary}
                           />
                        </View>
                        <Text style={styles.closureTitle}>Mission terminée</Text>
                        <Text style={styles.closureSubtitle}>
                           Toutes les étapes ont été enregistrées avec succès dans le
                           journal de bord.
                        </Text>
                        <TouchableOpacity
                           style={styles.largeReturnBtn}
                           onPress={() => navigation.goBack()}
                        >
                           <Text style={styles.largeReturnBtnText}>
                              Retour au tableau
                           </Text>
                        </TouchableOpacity>
                     </View>
                  </View>
               )}
            </Animated.View>
            {selectedMission &&
               step !== "standby" &&
               step !== "reception" &&
               step !== "closure" &&
               canOfferVictimContactCalls(selectedMission.dispatch_status) && (
                  <View style={styles.victimStripGlobalWrap}>{renderVictimContactStripContent()}</View>
               )}
            {step !== "standby" && step !== "reception" && (
               <View style={{ height: 250 }}>{renderTimeline()}</View>
            )}
         </View>
      </SafeAreaView>
   );
}

const styles = StyleSheet.create({
   container: { flex: 1, backgroundColor: "#000" },
   topHeader: {
      paddingVertical: 15,
      paddingHorizontal: 20,
      borderBottomWidth: 1,
      borderColor: "rgba(255,255,255,0.05)",
   },
   headerRow: { flexDirection: "row", alignItems: "center" },
   backBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: "rgba(255,255,255,0.05)",
      justifyContent: "center",
      alignItems: "center",
   },
   greetingText: {
      color: "rgba(255,255,255,0.4)",
      fontSize: 12,
      fontWeight: "900",
      letterSpacing: 1,
   },
   hospitalName: {
      color: "#FFF",
      fontSize: 18,
      fontWeight: "900",
      marginTop: 2,
   },
   mainWrapper: { flex: 1 },
   contentArea: { flex: 1 },
   stepBase: { flex: 1, padding: 24 },
   stepInlineHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      marginBottom: 14,
      gap: 12,
   },
   stepInlineBack: {
      width: 44,
      height: 44,
      borderRadius: 16,
      backgroundColor: "#1A1A1A",
      justifyContent: "center",
      alignItems: "center",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.1)",
   },
   stepInlineTextCol: {
      flex: 1,
      minWidth: 0,
      paddingTop: 2,
   },
   stepInlineLabel: {
      color: "rgba(255,255,255,0.45)",
      fontSize: 13,
      fontWeight: "800",
      letterSpacing: 1.2,
      marginBottom: 6,
      textTransform: "uppercase",
   },
   stepInlineTitle: {
      color: "#FFF",
      fontSize: 22,
      fontWeight: "900",
      letterSpacing: -0.3,
      lineHeight: 28,
   },
   stepSectionHeading: {
      color: "rgba(255,255,255,0.9)",
      fontSize: 17,
      fontWeight: "800",
      marginBottom: 14,
   },
   divider: {
      height: 1,
      backgroundColor: "rgba(255,255,255,0.05)",
      marginVertical: 15,
   },
   bigActionBtn: {
      height: 64,
      borderRadius: 20,
      backgroundColor: colors.secondary,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
      marginTop: 20,
   },
   bigActionText: {
      color: "#FFF",
      fontSize: 16,
      fontWeight: "900",
      letterSpacing: 1,
   },
   assignmentEnRouteFab: {
      position: "absolute",
      bottom: 200,
      right: 16,
      zIndex: 5,
      minWidth: 112,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 28,
      backgroundColor: colors.primary,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      shadowColor: "#000",
      shadowOpacity: 0.35,
      shadowRadius: 8,
      elevation: 6,
   },
   assignmentEnRouteFabText: {
      color: "#FFF",
      fontSize: 14,
      fontWeight: "800",
   },
   assignmentNavFab: {
      position: "absolute",
      bottom: 132,
      right: 16,
      zIndex: 4,
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: colors.secondary,
      justifyContent: "center",
      alignItems: "center",
      shadowColor: "#000",
      shadowOpacity: 0.35,
      shadowRadius: 8,
      elevation: 6,
   },
   standbyView: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      padding: 30,
   },
   radarWrapper: {
      width: 200,
      height: 200,
      justifyContent: "center",
      alignItems: "center",
      marginBottom: 40,
   },
   radarCircle: {
      position: "absolute",
      width: 200,
      height: 200,
      borderRadius: 100,
      borderWidth: 2,
      borderColor: colors.secondary,
      backgroundColor: colors.secondary + "10",
   },
   standbyText: {
      color: "#FFF",
      fontSize: 18,
      fontWeight: "900",
      textAlign: "center",
   },
   standbySub: {
      color: "rgba(255,255,255,0.4)",
      fontSize: 14,
      textAlign: "center",
      marginTop: 10,
      lineHeight: 20,
   },
   assignmentPopup: {
      position: "absolute",
      bottom: 20,
      left: 20,
      right: 20,
      backgroundColor: "#1A1A1A",
      borderRadius: 24,
      padding: 20,
      borderWidth: 1,
      borderColor: colors.secondary + "40",
   },
   assignRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginBottom: 10,
   },
   priorityDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.primary,
   },
   assignHeader: {
      color: "rgba(255,255,255,0.5)",
      fontSize: 12,
      fontWeight: "900",
      letterSpacing: 1,
   },
   assignType: { color: "#FFF", fontSize: 20, fontWeight: "900" },
   assignLoc: { color: "rgba(255,255,255,0.4)", fontSize: 14, marginTop: 4 },
   assignAction: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: 20,
      backgroundColor: colors.secondary,
      padding: 15,
      borderRadius: 15,
   },
   assignActionText: { color: "#FFF", fontSize: 14, fontWeight: "900" },
   victimStripReceptionWrap: {
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 4,
      backgroundColor: "rgba(0,0,0,0.55)",
   },
   victimStripGlobalWrap: {
      paddingHorizontal: 12,
      paddingTop: 10,
      paddingBottom: 6,
      backgroundColor: colors.mainBackground,
   },
   victimContactStrip: {
      backgroundColor: "#161616",
      borderRadius: 16,
      padding: 12,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.12)",
   },
   victimContactStripTitle: {
      color: "rgba(255,255,255,0.5)",
      fontSize: 11,
      fontWeight: "900",
      letterSpacing: 0.8,
      marginBottom: 10,
   },
   victimContactRow: { flexDirection: "row", gap: 8, alignItems: "stretch" },
   victimContactChip: {
      flex: 1,
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
      paddingVertical: 10,
      paddingHorizontal: 6,
      borderRadius: 12,
      backgroundColor: "#222",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.08)",
      minHeight: 72,
   },
   victimContactChipDisabled: { opacity: 0.45 },
   victimContactChipText: { color: "#FFF", fontSize: 11, fontWeight: "800", textAlign: "center" },
   victimContactChipTextDisabled: { color: "rgba(255,255,255,0.35)" },
   victimContactHint: {
      color: "rgba(255,255,255,0.35)",
      fontSize: 11,
      marginTop: 10,
      lineHeight: 15,
   },
   receptionView: { flex: 1, flexDirection: "column", padding: 0 },
   receptionBottomPanel: { flex: 1, minHeight: 180 },
   floatingBackSignalement: {
      position: "absolute",
      left: 12,
      zIndex: 20,
      width: 44,
      height: 44,
      borderRadius: 16,
      backgroundColor: "rgba(0,0,0,0.55)",
      justifyContent: "center",
      alignItems: "center",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.12)",
   },
   detailMissionType: { color: "#FFF", fontSize: 18, fontWeight: "800" },
   detailBox: {
      flex: 1,
      backgroundColor: "#111",
      borderRadius: 30,
      padding: 25,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.05)",
   },
   receptionHeaderStrip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 15,
      marginBottom: 10,
   },
   detailLabel: {
      color: "rgba(255,255,255,0.3)",
      fontSize: 12,
      fontWeight: "900",
      letterSpacing: 1.5,
      marginBottom: 4,
   },
   detailVal: { color: "#FFF", fontSize: 18, fontWeight: "800" },
   detailDesc: { color: "rgba(255,255,255,0.7)", fontSize: 15, lineHeight: 24 },
   priorityStatusText: { color: "#FFF", fontSize: 14, fontWeight: "700" },

   // New Reception Map Styles
   receptionMapWrapper: {
      flex: 1,
      minHeight: 220,
      width: "100%",
      backgroundColor: "#1A1A1A",
      overflow: "hidden",
      borderBottomWidth: 1,
      borderColor: "rgba(255,255,255,0.05)",
   },
   receptionMap: {
      flex: 1,
   },
   mapDistOverlay: {
      position: "absolute",
      bottom: 20,
      right: 20,
      backgroundColor: "rgba(0,0,0,0.8)",
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 12,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.1)",
   },
   mapDistText: {
      color: "#FFF",
      fontSize: 12,
      fontWeight: "800",
   },

   stickySwipeWrapper: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      paddingHorizontal: 24,
      paddingBottom: 24,
      paddingTop: 20,
      backgroundColor: "rgba(0,0,0,0.7)",
   },

   swipeContainer: {
      height: 72,
      width: "100%",
      backgroundColor: "#1A1A1A",
      borderRadius: 36,
      padding: 4,
      justifyContent: "center",
      overflow: "hidden",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.1)",
   },
   swipeBackground: {
      position: "absolute",
      left: 0,
      right: 0,
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      gap: 12,
   },
   swipeText: {
      color: "rgba(255,255,255,0.4)",
      fontSize: 15,
      fontWeight: "800",
   },
   swipeThumb: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: colors.secondary,
      justifyContent: "center",
      alignItems: "center",
   },
   trackingMapWrapper: { flex: 1, borderRadius: 0, overflow: "hidden" },
   trackingMap: { flex: 1 },
   markerHalo: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: "rgba(255,59,48,0.2)",
      justifyContent: "center",
      alignItems: "center",
      borderWidth: 2,
      borderColor: colors.primary,
   },
   victimMarker: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.primary,
      justifyContent: "center",
      alignItems: "center",
      borderWidth: 2,
      borderColor: "#FFFFFF",
      shadowColor: colors.primary,
      shadowOpacity: 0.5,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
      elevation: 6,
   },
   urgentisteMarker: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.secondary,
      justifyContent: "center",
      alignItems: "center",
      borderWidth: 2,
      borderColor: "#FFFFFF",
      shadowColor: colors.secondary,
      shadowOpacity: 0.5,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
      elevation: 6,
   },
   hospitalMarker: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: "#2E7D32",
      justifyContent: "center",
      alignItems: "center",
      borderWidth: 2,
      borderColor: "#FFFFFF",
      shadowColor: "#2E7D32",
      shadowOpacity: 0.5,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
      elevation: 6,
   },
   assignmentBottomPanel: {
      backgroundColor: colors.mainBackground,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      marginTop: -16,
      paddingTop: 4,
   },
   assignmentStructureCard: {
      marginHorizontal: 20,
      marginVertical: 12,
      backgroundColor: 'rgba(255,255,255,0.05)',
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.08)',
   },
   structureIconBox: {
      width: 44,
      height: 44,
      borderRadius: 14,
      backgroundColor: colors.secondary + '15',
      justifyContent: 'center',
      alignItems: 'center',
   },
   structureName: {
      color: '#FFF',
      fontSize: 16,
      fontWeight: '700',
   },
   structureAddress: {
      color: 'rgba(255,255,255,0.5)',
      fontSize: 12,
      marginTop: 2,
   },
   structureCoords: {
      color: 'rgba(255,255,255,0.3)',
      fontSize: 12,
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
      marginTop: 4,
   },
   structureCallBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: 'rgba(48,209,88,0.1)',
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: 'rgba(48,209,88,0.2)',
   },
   structureCallText: {
      color: '#30D158',
      fontSize: 13,
      fontWeight: '600',
   },
   transportBottomPanel: {
      backgroundColor: colors.mainBackground,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      marginTop: -16,
   },
   mapAddressOverlay: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: "rgba(0,0,0,0.8)",
      padding: 12,
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
   },
   mapAddressOverlayLabel: {
      fontSize: 12,
      fontWeight: "800",
      color: "rgba(255,255,255,0.45)",
      letterSpacing: 1,
      marginBottom: 4,
      textTransform: "uppercase",
   },
   smallAddressText: {
      color: "rgba(255,255,255,0.9)",
      fontSize: 13,
      fontWeight: "600",
      lineHeight: 18,
   },
   arrivalFooter: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: "#0A0A0A",
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderTopWidth: 1,
      borderColor: "rgba(255,255,255,0.05)",
      gap: 16,
   },
   footerTimerBox: { flex: 1 },
   footerTimerVal: { color: "#FFF", fontSize: 24, fontWeight: "900" },
   footerTimerLab: {
      color: "rgba(255,255,255,0.3)",
      fontSize: 10,
      fontWeight: "900",
      marginTop: 2,
   },
   footerBtn: {
      flex: 1.5,
      height: 56,
      borderRadius: 16,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
   },
   footerBtnText: { color: "#FFF", fontSize: 14, fontWeight: "900" },
   assessmentMainCard: {
      backgroundColor: "#1A1A1A",
      borderRadius: 32,
      padding: 8,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.05)",
      marginBottom: 20,
   },
   assessmentRow: {
      flexDirection: "row",
      alignItems: "center",
      padding: 5,
      gap: 15,
   },
   assessmentIconBox: {
      width: 44,
      height: 44,
      borderRadius: 14,
      backgroundColor: "rgba(255,255,255,0.03)",
      justifyContent: "center",
      alignItems: "center",
   },
   assessmentRowTitle: {
      color: "rgba(255,255,255,0.4)",
      fontSize: 13,
      fontWeight: "900",
      letterSpacing: 1,
   },
   assessmentRowSub: {
      color: "#FFF",
      fontSize: 14,
      fontWeight: "700",
      marginTop: 2,
   },
   miniToggleGroup: {
      flexDirection: "row",
      gap: 8,
      backgroundColor: "#000",
      padding: 4,
      borderRadius: 12,
   },
   miniToggle: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: "transparent",
   },
   miniToggleActive: {
      backgroundColor: colors.secondary + "20",
      borderColor: colors.secondary,
   },
   miniToggleCrit: {
      backgroundColor: colors.primary + "20",
      borderColor: colors.primary,
   },
   miniToggleText: {
      color: "rgba(255,255,255,0.3)",
      fontSize: 13,
      fontWeight: "900",
   },
   miniToggleTextActive: { color: colors.secondary },
   miniToggleTextCrit: { color: colors.primary },
   sectionHeader: {
      color: "rgba(255,255,255,0.3)",
      fontSize: 13,
      fontWeight: "900",
      letterSpacing: 1.5,
      marginBottom: 16,
      marginLeft: 4,
   },
   severityGrid: { flexDirection: "row", gap: 10, marginBottom: 20 },
   severityItem: {
      flex: 1,
      backgroundColor: "#1A1A1A",
      borderRadius: 24,
      paddingVertical: 20,
      alignItems: "center",
      borderWidth: 2,
      borderColor: "transparent",
      gap: 8,
   },
   severityItemText: {
      fontSize: 13,
      fontWeight: "900",
      color: "rgba(255,255,255,0.3)",
   },
   smartAlertBox: {
      backgroundColor: colors.primary,
      borderRadius: 20,
      padding: 16,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      marginTop: 10,
      marginBottom: 30,
   },
   smartAlertBoxText: {
      color: "#FFF",
      fontSize: 13,
      fontWeight: "900",
      flex: 1,
   },
   aidGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 12,
      justifyContent: "space-between",
      paddingBottom: 15,
   },
   aidCardGrid: {
      width: "48%",
      backgroundColor: "#161616",
      borderRadius: 20,
      paddingVertical: 14,
      paddingHorizontal: 8,
      alignItems: "center",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.06)",
   },
   aidIconWrapper: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: "rgba(255,255,255,0.03)",
      justifyContent: "center",
      alignItems: "center",
      marginBottom: 8,
   },
   aidLabelGrid: {
      color: "rgba(255,255,255,0.5)",
      fontSize: 13,
      fontWeight: "800",
      textAlign: "center",
   },

   aidCheckBadge: {
      position: "absolute",
      top: 12,
      right: 12,
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: colors.secondary,
      justifyContent: "center",
      alignItems: "center",
   },
   decisionGrid: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: 20,
      gap: 8,
   },
   decisionCardGrid: {
      width: "32%",
      backgroundColor: "#161616",
      borderRadius: 20,
      paddingVertical: 20,
      paddingHorizontal: 4,
      alignItems: "center",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.06)",
   },
   assessmentCard: {
      flex: 1,
      backgroundColor: "#161616",
      borderRadius: 24,
      paddingVertical: 18,
      paddingHorizontal: 12,
      alignItems: "center",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.06)",
   },
   decisionIconBox: {
      width: 44,
      height: 44,
      borderRadius: 14,
      justifyContent: "center",
      alignItems: "center",
      marginBottom: 12,
   },
   decisionLabel: {
      color: "rgba(255,255,255,0.5)",
      fontSize: 13,
      fontWeight: "900",
      textAlign: "center",
      letterSpacing: 0.3,
   },
   hospitalResultCard: {
      backgroundColor: "#111",
      borderRadius: 30,
      padding: 40,
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.secondary,
   },
   hospResTitle: {
      color: "#FFF",
      fontSize: 22,
      fontWeight: "900",
      marginTop: 20,
      textAlign: "center",
   },
   hospResDetail: { color: "rgba(255,255,255,0.4)", fontSize: 14, marginTop: 8 },
   hospResBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: colors.secondary + "15",
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 10,
   },
   hospResBadgeText: {
      color: colors.secondary,
      fontSize: 12,
      fontWeight: "900",
   },
   transportChoiceCard: {
      height: 100,
      backgroundColor: "#111",
      borderRadius: 25,
      flexDirection: "row",
      alignItems: "center",
      padding: 25,
      gap: 20,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.05)",
   },
   transportChoiceTitle: { color: "#FFF", fontSize: 18, fontWeight: "900" },
   closureView: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      padding: 40,
   },
   successHalo: {
      width: 100,
      height: 100,
      borderRadius: 40,
      backgroundColor: colors.secondary + "15",
      justifyContent: "center",
      alignItems: "center",
      marginBottom: 40,
   },
   closureTitle: {
      fontSize: 32,
      fontWeight: "900",
      color: "#FFF",
      marginBottom: 15,
      textAlign: "center",
   },
   closureSubtitle: {
      fontSize: 16,
      color: colors.textMuted,
      textAlign: "center",
      lineHeight: 24,
   },
   largeReturnBtn: {
      backgroundColor: colors.secondary,
      height: 64,
      paddingHorizontal: 40,
      borderRadius: 32,
      justifyContent: "center",
      alignItems: "center",
      marginTop: 40,
   },
   largeReturnBtnText: {
      color: "#FFF",
      fontSize: 16,
      fontWeight: "900",
      letterSpacing: 1,
   },
   timelineContainer: {
      flex: 1,
      backgroundColor: "#0A0A0A",
      borderTopWidth: 1,
      borderColor: "rgba(255,255,255,0.05)",
      padding: 20,
   },
   timelineHeader: {
      color: "rgba(255,255,255,0.3)",
      fontSize: 16,
      fontWeight: "900",
      marginBottom: 15,
      letterSpacing: 1,
   },
   timelineItem: { flexDirection: "row", gap: 15, marginBottom: 20 },
   timelinePointRow: { alignItems: "center" },
   timelineLine: {
      position: "absolute",
      top: 20,
      bottom: -20,
      width: 1,
      backgroundColor: "rgba(255,255,255,0.05)",
   },
   timelineIconBox: {
      width: 28,
      height: 28,
      borderRadius: 14,
      justifyContent: "center",
      alignItems: "center",
   },
   timelineContent: { flex: 1 },
   timelineTextRow: { flexDirection: "row", alignItems: "center", gap: 8 },
   timelineTime: {
      color: "rgba(255,255,255,0.3)",
      fontSize: 14,
      fontWeight: "900",
   },
   timelineLabel: { color: "#FFF", fontSize: 15, fontWeight: "700" },
   itemStatusBadge: {
      backgroundColor: "rgba(255,255,255,0.05)",
      alignSelf: "flex-start",
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
      marginTop: 4,
   },
   itemStatusText: { color: colors.secondary, fontSize: 12, fontWeight: "900" },
});
