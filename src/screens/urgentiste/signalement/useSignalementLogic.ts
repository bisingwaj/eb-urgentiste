import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Alert, Animated, PanResponder, Platform, Linking, Dimensions } from "react-native";
import * as Location from "expo-location";
import * as ImagePicker from "expo-image-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../../../lib/supabase";
import { getRoute, buildRouteFeature, geometryToCameraBounds } from "../../../lib/mapbox";
import { useActiveMission } from "../../../hooks/useActiveMission";
import { useMission } from "../../../contexts/MissionContext";
import { useMapPuckHeading } from "../../../hooks/useMapPuckHeading";
import { alertVoipError, startRescuerToCitizenVoipCall } from "../../../lib/rescuerCallCitizen";
import { formatMissionAddress, formatIncidentType } from "../../../utils/missionAddress";
import { MissionStep, TimelineEvent, AlertData, STEP_ORDER, AssessmentSchema } from "./types";
import { getAssessmentSchema } from "./constants/assessmentSchemas";
import { HospitalSuggestion } from "../../../types/mission";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export function useSignalementLogic(navigation: any, route: any) {
   const { activeMission, isLoading: missionLoading, updateDispatchStatus, refresh } = useActiveMission();
   const { updateMissionDetails, appendIncidentTerrainPhoto, fetchHospitals, requestHospitalAssignment, cancelHospitalAssignment } = useMission();
   const initialMission = route?.params?.mission || activeMission;

   const getInitialStep = useCallback((): MissionStep => {
      // 1. Explicitly forced step via navigation params (highest priority)
      const forced = route?.params?.forcedStep as MissionStep;
      if (forced) {
         console.log("[Signalement] Using forced step from params:", forced);
         return forced;
      }

      // 2. Fallback to status-based logic (Prioritize navigation params mission)
      const m = initialMission || activeMission;
      if (!m || !m.dispatch_status) return "standby";
      
      console.log("[Signalement] Initializing step for status:", m.dispatch_status);
      
      switch (m.dispatch_status) {
         // The 'reception' step (Slider) is being removed per user request.
         // If a mission is dispatched, we show the arrival (navigation) view instead.
         case 'dispatched': return 'arrival';
         case 'en_route': return 'arrival';
         case 'on_scene': return 'assessment';
         // If we are en route or arrived at hospital, skip to closure (Map handled externally)
         case 'en_route_hospital': 
         case 'arrived_hospital': 
         case 'mission_end': 
         case 'completed': 
            return 'closure';
         default: return 'arrival';
      }
   }, [route?.params?.forcedStep, activeMission?.dispatch_status, initialMission?.dispatch_status]);

   const [step, setStep] = useState<MissionStep>(getInitialStep);
   const [mapFullscreenOpen, setMapFullscreenOpen] = useState(false);
   const [stateRestored, setStateRestored] = useState(false);
   const [selectedMission, setSelectedMission] = useState<any>(initialMission);
   
   // --- DYNAMIC QUESTIONNAIRE LOGIC ---
   const [assessmentSchema, setAssessmentSchema] = useState<AssessmentSchema>(() => 
      getAssessmentSchema(activeMission?.type || initialMission?.type)
   );

   // Placeholder for future API fetch
   const fetchAssessmentSchemas = async () => {
      // logic to fetch from backend and setAssessmentSchema
      console.log("[Questionnaire] Placeholder for API fetch");
   };
   const prevMissionIdRef = useRef<string | null>(activeMission?.id || null);

   const resetStates = useCallback(() => {
      console.log("[Signalement] 🔄 Resetting all local states.");
      setStep(getInitialStep());
      setTimeline([]);
      setAssessment({ conscious: null, breathing: null, severity: null });
      setCareChecklist([]);
      setDecision(null);
      setTargetHospital(null);
      setPendingStructureInfo(null);
      setTransportMode(null);
      setElapsedSeconds(0);
      setIsAssigned(false);
      setRouteGeoJSON(null);
      setRouteDuration(null);
      setRouteDistance(null);
      setHospitalRouteGeoJSON(null);
      setHospitalRouteDuration(null);
      setHospitalRouteDistance(null);
      setNearbyHospitals([]);
      setStateRestored(false);
   }, [getInitialStep]);

   useEffect(() => {
      if (activeMission) {
         setSelectedMission(activeMission);
         
         // If mission ID changed, reset all local states to avoid leakage
         if (prevMissionIdRef.current !== activeMission.id) {
            prevMissionIdRef.current = activeMission.id;
            resetStates();
            // Re-fill assessment if provided by backend
            setAssessment(activeMission.medical_assessment || { conscious: null, breathing: null, severity: null });
         }
      } else if (prevMissionIdRef.current !== null) {
         // Mission disappeared (completed or cancelled)
         console.log("[Signalement] ⏹ Mission disappeared. Cleaning up.");
         prevMissionIdRef.current = null;
         resetStates();
      }
   }, [activeMission?.id, getInitialStep, resetStates]);

   useEffect(() => {
      if (activeMission?.type || initialMission?.type) {
         setAssessmentSchema(getAssessmentSchema(activeMission?.type || initialMission?.type));
      }
   }, [activeMission?.type, initialMission?.type]);

   // Core Mission States
   const [assessment, setAssessment] = useState<any>(() => {
      // Try to pre-fill from mission data if available
      return activeMission?.medical_assessment || { conscious: null, breathing: null, severity: null };
   });
   const [careChecklist, setCareChecklist] = useState<string[]>([]);
   const [decision, setDecision] = useState<string | null>(null);
   const [targetHospital, setTargetHospital] = useState<any>(null);
   const [pendingStructureInfo, setPendingStructureInfo] = useState<any>(null);
   const [transportMode, setTransportMode] = useState<string | null>(null);
   
   const missionRef = useRef<any>(null);
   const closureFinalizeRef = useRef(false);

   useEffect(() => {
      missionRef.current = selectedMission;
   }, [selectedMission]);

   const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
   const [isAssigned, setIsAssigned] = useState(false);
   const [elapsedSeconds, setElapsedSeconds] = useState(0);
   const [urgentisteLoc, setUrgentisteLoc] = useState<Location.LocationObject | null>(null);
   const urgentisteHeadingDeg = useMapPuckHeading(urgentisteLoc);
   const [routeGeoJSON, setRouteGeoJSON] = useState<GeoJSON.FeatureCollection | null>(null);
   const [routeDuration, setRouteDuration] = useState<number | null>(null);
   const [routeDistance, setRouteDistance] = useState<number | null>(null);
   const lastRouteFetch = useRef<number>(0);
   const [voipLoading, setVoipLoading] = useState(false);
   const [terrainPhotoBusy, setTerrainPhotoBusy] = useState(false);
   const [isFinishing, setIsFinishing] = useState(false);

   // --- HOSPITAL SELECTION STATE ---
   const [nearbyHospitals, setNearbyHospitals] = useState<HospitalSuggestion[]>([]);
   const [hospitalsLoading, setHospitalsLoading] = useState(false);
   const [isRecalculating, setIsRecalculating] = useState(false);

   const handleRecalculateHospitals = async () => {
      if (!selectedMission?.id) return;
      setIsRecalculating(true);
      try {
         console.log(`[Signalement] 🚀 Invoking compute-mission-hospitals for ID: ${selectedMission.id}`);
         
         const response = await supabase.functions.invoke('compute-mission-hospitals', {
            body: { dispatch_id: selectedMission.id }
         });

         console.log("[Signalement] 📡 Server Response Data:", JSON.stringify(response.data, null, 2));
         console.log("[Signalement] 📡 Server Response Error:", JSON.stringify(response.error, null, 2));

         if (response.error) throw response.error;
         
         // On force un rafraîchissement de la mission pour voir le nouveau snapshot
         await refresh();
         const newList = await fetchNearbyHospitals();
         console.log("[Signalement] ✅ List refreshed, count:", newList?.length || 0);
      } catch (err: any) {
         console.error("[Signalement] ❌ Recalculate server failed:", err);
         Alert.alert("Erreur Serveur", `Le calcul a échoué. L'erreur a été loggée pour analyse.`);
      } finally {
         setIsRecalculating(false);
      }
   };


   // Animations for Standby
   const radarAnim = useRef(new Animated.Value(0.4)).current;
   const notifyAnim = useRef(new Animated.Value(0)).current;

   useEffect(() => {
      Animated.loop(
         Animated.sequence([
            Animated.timing(radarAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
            Animated.timing(radarAnim, { toValue: 0.4, duration: 1500, useNativeDriver: true }),
         ]),
      ).start();
   }, [step]);

   // Notify animation when selected mission changes in standby
   useEffect(() => {
      if (step === 'standby' && selectedMission) {
         Animated.spring(notifyAnim, { toValue: 1, useNativeDriver: true }).start();
      } else {
         notifyAnim.setValue(0);
      }
   }, [selectedMission, step]);

   // Transition Logic
   const [fadeAnim] = useState(new Animated.Value(1));
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

   // Location & Routing
   useEffect(() => {
      if (!missionLoading && !activeMission && step !== 'standby' && !isFinishing) {
         console.log("[Signalement] Active mission gone from context -> Auto-exiting screen");
         navigation.replace('MainTabs');
      }
   }, [activeMission, missionLoading, step, isFinishing]);

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
      if (!routeGeoJSON?.features[0]?.geometry) return undefined;
      return geometryToCameraBounds(routeGeoJSON.features[0].geometry as GeoJSON.LineString, 80);
   }, [routeGeoJSON]);

   const cameraBounds = useMemo(() => {
      if (!urgentisteLoc || !selectedMission) return undefined;
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

   const arrivalCameraBounds = useMemo(
      () => routeCameraBounds ?? cameraBounds,
      [routeCameraBounds, cameraBounds],
   );

   // Hospital routing logic
   const [hospitalRouteGeoJSON, setHospitalRouteGeoJSON] = useState<any>(null);
   const [hospitalRouteDuration, setHospitalRouteDuration] = useState<number | null>(null);
   const [hospitalRouteDistance, setHospitalRouteDistance] = useState<number | null>(null);

   useEffect(() => {
      if (!urgentisteLoc || !targetHospital?.coords) {
         setHospitalRouteGeoJSON(null);
         return;
      }
      const fetchHospitalRoute = async () => {
         try {
            const start: [number, number] = [urgentisteLoc.coords.longitude, urgentisteLoc.coords.latitude];
            const end: [number, number] = [targetHospital.coords.longitude, targetHospital.coords.latitude];
            const result = await getRoute(start, end);
            if (result) {
               setHospitalRouteGeoJSON(buildRouteFeature(result.geometry));
               setHospitalRouteDuration(result.duration);
               setHospitalRouteDistance(result.distance);
            }
         } catch (e) {
            console.error("Hospital route error", e);
         }
      };
      fetchHospitalRoute();
   }, [urgentisteLoc?.coords.latitude, urgentisteLoc?.coords.longitude, targetHospital?.coords]);

   const hospitalRouteCameraBounds = useMemo(() => {
      if (!hospitalRouteGeoJSON?.features[0]?.geometry) return undefined;
      return geometryToCameraBounds(hospitalRouteGeoJSON.features[0].geometry, 80);
   }, [hospitalRouteGeoJSON]);

   useEffect(() => {
      let locationSub: Location.LocationSubscription | null = null;
      (async () => {
         try {
            let { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') return;
            let loc = await Location.getCurrentPositionAsync({});
            setUrgentisteLoc(loc);
            locationSub = await Location.watchPositionAsync(
               { accuracy: Location.Accuracy.High, distanceInterval: 10 },
               (newLoc) => {
                  setUrgentisteLoc(newLoc);
               }
            );
         } catch (err) {
            console.warn('[Location] Position indisponible:', err);
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
                  if (geocodeData && geocodeData.length > 0) {
                     const a = geocodeData[0];
                     const streetPart = [a.streetNumber, a.street].filter(Boolean).join(" ");
                     const namePart = a.name && a.name !== a.street ? a.name : "";
                     const districtPart = a.district || "";
                     const cityPart = a.city || "";
                     const subregionPart = a.subregion && a.subregion !== a.city ? a.subregion : "";
                     const regionPart = a.region && a.region !== a.city && a.region !== a.subregion ? a.region : "";
                     const postalPart = a.postalCode || "";

                     const parts = [namePart, streetPart, districtPart, cityPart, subregionPart, regionPart, postalPart].filter(Boolean);
                     const uniqueParts = parts.filter((part, index) => parts.indexOf(part) === index);
                     setResolvedAddress(uniqueParts.join(", ") || `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
                  }
               } catch (e) {
                  setResolvedAddress(`GPS: ${lat.toFixed(5)}, ${lng.toFixed(5)}`);
               }
            }
         }
      };
      fetchAddress();
   }, [selectedMission?.location?.lat, selectedMission?.location?.lng]);

   const displayAddress = useMemo(
      () => selectedMission ? formatMissionAddress(selectedMission.location, resolvedAddress) : "Adresse inconnue",
      [selectedMission, resolvedAddress]
   );

   const distanceInfo = useMemo(() => {
      if (!urgentisteLoc || !selectedMission) return { dist: "Calcul...", eta: "--" };
      const R = 6371;
      const lat1 = urgentisteLoc.coords.latitude;
      const lon1 = urgentisteLoc.coords.longitude;
      const lat2 = selectedMission.location?.lat || -4.322447;
      const lon2 = selectedMission.location?.lng || 15.307045;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const distKm = R * c;

      const speedKmh = 40;
      const totalSeconds = Math.floor((distKm / speedKmh) * 3600);
      const etaFormat = totalSeconds < 60 ? `${Math.max(1, totalSeconds)} s` : `${Math.ceil(totalSeconds / 60)} min`;
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

   const fetchNearbyHospitals = useCallback(async (): Promise<HospitalSuggestion[]> => {
      setHospitalsLoading(true);
      try {
         const list = await fetchHospitals();
         console.log("list", JSON.stringify(list));
         if (list.length > 0) {
            console.log(`\n[Signalement] 🏥 ${list.length} Hôpitaux suggérés par le serveur :`);
            console.table(list.map(h => ({
               Rang: h.rank,
               Nom: h.name,
               Dist: `${h.distanceKm} km`,
               ETA: `${h.etaMin} min`,
               Lits: h.availableBeds,
               Score: h.score,
               Choisi: h.isSelected ? '✅' : ' '
            })));
         }

         // Tri par distance (du plus proche au plus loin)
         const sortedList = [...list].sort((a, b) => (a.distanceKm || 0) - (b.distanceKm || 0));
         setNearbyHospitals(sortedList);
         return sortedList;
      } catch (err) {
         console.warn("[Signalement] fetchNearbyHospitals failed:", err);
         return [];
      } finally {
         setHospitalsLoading(false);
      }
   }, [fetchHospitals]);

   // Les rafraîchissements Realtime sont désormais gérés par le MissionContext
   useEffect(() => {
      if (step === 'assignment') {
         fetchNearbyHospitals();
      }
   }, [step, fetchNearbyHospitals, selectedMission?.suggested_hospitals]);

   // State Restoration
   const missionStorageKey = selectedMission?.id ? `@mission_state_${selectedMission.id}` : null;

   const saveMissionState = useCallback(async () => {
      if (!missionStorageKey || !stateRestored) return;
      if (step === "standby" || step === "closure") return;
      try {
         const payload = JSON.stringify({
            step, assessment, careChecklist, decision, targetHospital, transportMode, timeline, elapsedSeconds, isAssigned, savedAt: Date.now(),
         });
         await AsyncStorage.setItem(missionStorageKey, payload);
      } catch (e) {
         console.warn("[State] Save failed:", e);
      }
   }, [missionStorageKey, stateRestored, step, assessment, careChecklist, decision, targetHospital, transportMode, timeline, elapsedSeconds, isAssigned]);

   useEffect(() => { saveMissionState(); }, [saveMissionState]);

   // Timer for elapsed mission time
   useEffect(() => {
      if (step === "standby" || step === "closure") {
         setElapsedSeconds(0);
         return;
      }
      const interval = setInterval(() => {
         setElapsedSeconds((prev) => prev + 1);
      }, 1000);
      return () => clearInterval(interval);
   }, [step]);

   useEffect(() => {
      if (!missionStorageKey) { setStateRestored(true); return; }
      (async () => {
         try {
            const json = await AsyncStorage.getItem(missionStorageKey);
            if (json) {
               const saved = JSON.parse(json);
               if (saved.step) {
                  // Safety: Only restore saved step if mission status hasn't moved beyond it
                  const currentStatus = initialMission?.dispatch_status;
                  const isPastAssignment = currentStatus === 'en_route_hospital' || currentStatus === 'arrived_hospital';
                  
                  if (isPastAssignment && saved.step === 'assignment') {
                     // Mission is already ahead, don't regress to assignment screen
                     console.log("[Signalement] Skipping stale 'assignment' step from storage");
                  } else {
                     const stepToRestore = saved.step === 'reception' ? 'arrival' : (saved.step as MissionStep);
                     setStep(stepToRestore);
                  }
                  if (saved.assessment) setAssessment(saved.assessment);
                  if (saved.careChecklist) setCareChecklist(saved.careChecklist);
                  if (saved.decision !== undefined) setDecision(saved.decision);
                  if (saved.targetHospital) setTargetHospital(saved.targetHospital);
                  if (saved.transportMode !== undefined) setTransportMode(saved.transportMode);
                  if (saved.timeline) setTimeline(saved.timeline);
                  if (saved.elapsedSeconds) setElapsedSeconds(saved.elapsedSeconds);
                  if (saved.isAssigned !== undefined) setIsAssigned(saved.isAssigned);
               }
            }
         } finally { setStateRestored(true); }
      })();
   }, [missionStorageKey]);

   const clearMissionState = useCallback(async () => {
      if (!missionStorageKey) return;
      try { await AsyncStorage.removeItem(missionStorageKey); } catch (e) { }
   }, [missionStorageKey]);

   // Handlers
   const addTimelineEvent = (label: string, icon: string, status?: string) => {
      const now = new Date();
      const timeStr = `${now.getHours()}:${now.getMinutes().toString().padStart(2, "0")}`;
      setTimeline((prev) => [{ id: Math.random().toString(), time: timeStr, label, icon, status }, ...prev]);
   };

   const handleStartMission = async (mission: any) => {
      try {
         await updateDispatchStatus('en_route');
         transitionTo("arrival", mission);
         addTimelineEvent("Acceptation mission", "assignment-turned-in");
      } catch (err) { }
   };

   const handleArrivalOnScene = async () => {
      try {
         await updateDispatchStatus('on_scene');
         transitionTo("assessment");
         addTimelineEvent("Arrivée sur les lieux", "place");
      } catch (err: any) {
         Alert.alert("Erreur", "Impossible de mettre à jour le statut: " + (err.message || "Erreur inconnue"));
      }
   };

   const handleConfirmAssessment = async () => {
      try {
         // Persist structured assessment to DB
         await updateMissionDetails({ assessment });
         transitionTo("aid");
         addTimelineEvent("Évaluation terminée", "analytics", assessment.severity || "Stable");
      } catch (err) { }
   };

   const handleToggleCare = (careId: string) => {
      setCareChecklist((prev) => {
         const exists = prev.includes(careId);
         if (!exists) addTimelineEvent(`${careId} administré`, "medical-services");
         return exists ? prev.filter((c) => c !== careId) : [...prev, careId];
      });
   };

   const handleConfirmAid = async () => {
      try {
         // Sync careChecklist to DB so hospital can see "Premiers Soins"
         await updateMissionDetails({ 
            assessment: { ...assessment, careChecklist } 
         });
         transitionTo("decision");
         addTimelineEvent("Soins prodigués", "favorite");
      } catch (err) { }
   };

   const handleDecideTransport = async (choice: string) => {
      setDecision(choice);
      if (choice === "Stable") {
         try {
            await updateDispatchStatus('completed');
            clearMissionState();
            transitionTo("closure");
            addTimelineEvent("Traité sur place", "check-circle");
         } catch (err) { }
      } else {
         void refresh();
         transitionTo("assignment");
         addTimelineEvent(`Décision d'évacuation`, "local-shipping", choice);
         fetchNearbyHospitals(); // Load hospitals as soon as transport is decided
      }
   };

   const handleSelectTransportMode = async (mode: any) => {
      setTransportMode(mode);
      try { 
         await updateDispatchStatus('en_route_hospital'); 
         navigation.goBack(); // Return to map
      } catch (err) { }
      addTimelineEvent("Mode de transport choisi", "local-shipping", mode);
   };

   const handleSelectHospital = async (hosp: HospitalSuggestion) => {
      try {
         // requestHospitalAssignment: (hospitalId, hospitalObj)
         await requestHospitalAssignment(hosp.id, hosp);
         addTimelineEvent("Demande d'affectation hospitalière", "local-hospital", hosp.name);
      } catch (err) {
         Alert.alert("Erreur", "Impossible d'envoyer la demande à cet établissement.");
      }
   };

   const handleCancelHospitalAssignment = async () => {
      try {
         await cancelHospitalAssignment();
         addTimelineEvent("Demande d'affectation annulée par l'unite", "cancel");
      } catch (err) {
         Alert.alert("Erreur", "Impossible d'annuler la demande.");
      }
   };

   const handleArrivedAtHospital = async () => {
      try {
         await updateDispatchStatus('arrived_hospital');
         addTimelineEvent("Arrivée à l'hôpital", "local-hospital");
         transitionTo("closure");
      } catch (err) { }
   };

   const [departingEnRoute, setDepartingEnRoute] = useState(false);
   useEffect(() => {
      if (isFinishing) return;

      const status = activeMission?.dispatch_status;
      const isAtHospitalStage = status === 'en_route_hospital' || status === 'arrived_hospital';

      // Auto-trigger departure when hospital accepts (which now automatically updates status)
      // OR if someone manually updated it. We avoid the intermediate "Depart" click.
      if (isAtHospitalStage && step === 'assignment') {
         console.log("[Signalement] Remote Status Updated to En Route Hospital -> Auto-Navigating to Map");
         // Use a small delay to ensure the user sees the confirmation if they were watching
         const timer = setTimeout(() => {
            navigation.navigate('MissionActive', { mission: activeMission || selectedMission });
         }, 500);
         return () => clearTimeout(timer);
      }
   }, [activeMission?.dispatch_status, step, isFinishing]);

   const handleDepartVersStructure = async () => {
      if (departingEnRoute || !targetHospital?.coords) return;
      setDepartingEnRoute(true);
      try {
         await updateDispatchStatus("en_route_hospital");
         addTimelineEvent("Départ vers la structure", "local-shipping", targetHospital?.name);
         // Explicitly navigate to the map view instead of goBack() to avoid dashboard loops
         navigation.navigate('MissionActive', { mission: selectedMission });
      } catch (err) { } finally {
         setDepartingEnRoute(false);
      }
   };

   const handleCompleteMission = useCallback(async () => {
      try {
         setIsFinishing(true);
         // Use 'mission_end' to release the unit while keeping the incident open for hospital
         await updateDispatchStatus('mission_end');
         
         // Clear local cache for this mission
         if (missionStorageKey) {
            await AsyncStorage.removeItem(missionStorageKey);
         }
         
         // Navigate back to Dashboard - use popToTop or specific route to be safe
         navigation.replace('MainTabs'); 
      } catch (err) {
         console.error("[Signalement] Error during mission completion:", err);
         navigation.replace('MainTabs');
      }
   }, [missionStorageKey, navigation, updateDispatchStatus]);

   // Sync structure/hospital updates
   const structureTimelineLoggedRef = useRef<string | null>(null);
   useEffect(() => {
      const mergedHs = activeMission?.hospital_status ?? selectedMission?.hospital_status ?? null;
      const struct = activeMission?.assigned_structure || selectedMission?.assigned_structure;
      const missionKey = activeMission?.id ?? selectedMission?.id ?? "";

      if (mergedHs === "refused" && struct?.id) {
         setTargetHospital(null);
         setPendingStructureInfo({ id: struct.id, name: struct.name, specialty: struct.type, address: struct.address, phone: struct.phone, refused: true, refusalNotes: activeMission?.hospital_notes ?? selectedMission?.hospital_notes });
         const tlKey = `${missionKey}:${struct.id}:refused`;
         if (structureTimelineLoggedRef.current !== tlKey) {
            structureTimelineLoggedRef.current = tlKey;
            addTimelineEvent("Structure a refusé la prise en charge", "cancel", struct.name);
         }
         return;
      }

      if (!struct?.id) {
         setPendingStructureInfo(null);
         if (activeMission != null && !activeMission.assigned_structure?.id) setTargetHospital(null);
         return;
      }

      const latN = struct.lat != null ? Number(struct.lat) : NaN;
      const lngN = struct.lng != null ? Number(struct.lng) : NaN;
      if (!Number.isFinite(latN) || !Number.isFinite(lngN)) {
         setPendingStructureInfo({ id: struct.id, name: struct.name, specialty: struct.type, address: struct.address, phone: struct.phone, refused: false });
         setTargetHospital(null);
         const tlKey = `${missionKey}:${struct.id}:pending`;
         if (structureTimelineLoggedRef.current !== tlKey) {
            structureTimelineLoggedRef.current = tlKey;
            addTimelineEvent("En attente de réponse", "local-hospital", struct.name);
         }
         return;
      }

      setPendingStructureInfo(null);
      setTargetHospital({ id: struct.id, name: struct.name, specialty: struct.type, address: struct.address, phone: struct.phone, distance: "", coords: { latitude: latN, longitude: lngN } });
      const tlKey = `${missionKey}:${struct.id}:accepted`;
      if (structureTimelineLoggedRef.current !== tlKey) {
         structureTimelineLoggedRef.current = tlKey;
         addTimelineEvent("Établissement accepté", "local-hospital", struct.name);
      }
   }, [activeMission?.assigned_structure, activeMission?.hospital_status, selectedMission?.assigned_structure, selectedMission?.hospital_status]);

   // Terrain Photos
   const pickAndUploadTerrainPhoto = async (source: "camera" | "library") => {
      if (terrainPhotoBusy) return;
      const incidentId = activeMission?.incident_id ?? selectedMission?.incident_id;
      if (!incidentId) { Alert.alert("Erreur", "Incident non identifié"); return; }
      
      try {
         const permission = source === "camera" ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
         if (permission.status !== "granted") return;

         const result = source === "camera" ? await ImagePicker.launchCameraAsync({ quality: 0.75 }) : await ImagePicker.launchImageLibraryAsync({ quality: 0.75 });
         if (result.canceled || !result.assets?.[0]) return;

         setTerrainPhotoBusy(true);
         const asset = result.assets[0];
         const previousUrls = Array.isArray(activeMission?.media_urls ?? selectedMission?.media_urls) ? (activeMission?.media_urls ?? selectedMission?.media_urls) : [];
         await appendIncidentTerrainPhoto(asset.uri, asset.mimeType ?? "image/jpeg", { incidentId, previousUrls });
      } catch (e) {
         Alert.alert("Photo terrain", "Échec de l'envoi.");
      } finally { setTerrainPhotoBusy(false); }
   };

   // VOIP & PSTN Calls
   const runVictimVoip = async () => {
      const m = selectedMission;
      if (!m?.citizen_id || !m?.incident_id || voipLoading) return;
      setVoipLoading(true);
      try { await startRescuerToCitizenVoipCall({ incidentId: m.incident_id, citizenId: m.citizen_id, callType: "audio" }); }
      catch (e) { alertVoipError(e); }
      finally { setVoipLoading(false); }
   };

   const runVictimPstn = () => {
      const phone = selectedMission?.caller?.phone;
      if (phone && phone !== "-") {
         Linking.openURL(`tel:${phone}`);
      } else {
         Alert.alert("Erreur", "Numéro de téléphone non disponible");
      }
   };

   // Swipe
   const pan = useRef(new Animated.Value(0)).current;
   const panResponder = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: Animated.event([null, { dx: pan }], { useNativeDriver: false }),
      onPanResponderRelease: (e, gestureState) => {
         const SWIPE_WIDTH_PX = SCREEN_WIDTH - 48;
         if (gestureState.dx > SWIPE_WIDTH_PX * 0.6) {
            Animated.spring(pan, { toValue: SWIPE_WIDTH_PX - 72, useNativeDriver: false }).start(() => {
               handleStartMission(selectedMission);
               setTimeout(() => pan.setValue(0), 500);
            });
         } else {
            Animated.spring(pan, { toValue: 0, useNativeDriver: false }).start();
         }
      },
   });

   return {
      step, setStep, selectedMission, setSelectedMission, timeline, setTimeline, elapsedSeconds,
      urgentisteLoc, urgentisteHeadingDeg, routeGeoJSON, routeDuration, routeDistance, routeCameraBounds,
      hospitalRouteGeoJSON, hospitalRouteDuration, hospitalRouteDistance, hospitalRouteCameraBounds,
      resolvedAddress, displayAddress, distanceInfo, routeInfoText,
      assessment, setAssessment, careChecklist, setCareChecklist, decision, setDecision,
      targetHospital, setTargetHospital, pendingStructureInfo, setPendingStructureInfo,
      transportMode, setTransportMode, departingEnRoute,
      arrivalCameraBounds, fadeAnim, mapFullscreenOpen, setMapFullscreenOpen,
      voipLoading, terrainPhotoBusy, radarAnim, notifyAnim, isAssigned,
      nearbyHospitals, hospitalsLoading,
      isRecalculating, handleRecalculateHospitals,
      handleStartMission, handleArrivalOnScene, handleConfirmAssessment, handleToggleCare, handleConfirmAid,
      handleDecideTransport, handleSelectTransportMode, handleArrivedAtHospital, handleDepartVersStructure, handleCompleteMission,
      handleSelectHospital, fetchNearbyHospitals, handleCancelHospitalAssignment,
      pickAndUploadTerrainPhoto, runVictimVoip, runVictimPstn,
      pan, panResponder,
      transitionTo,
      assessmentSchema,
      formatTime: (s: number) => {
         const h = Math.floor(s / 3600);
         const m = Math.floor((s % 3600) / 60);
         const sec = s % 60;
         return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
      }
   };
}
