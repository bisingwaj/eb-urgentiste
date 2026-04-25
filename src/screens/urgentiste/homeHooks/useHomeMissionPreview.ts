import { useState, useEffect, useRef, useCallback } from 'react';
import { Animated, DeviceEventEmitter } from 'react-native';
import * as Location from 'expo-location';
import { getRouteWithAlternatives, geometryToCameraBounds } from '../../../lib/mapbox';
import type { RouteResult } from '../../../lib/mapbox';

export function useHomeMissionPreview(
  activeMission: any,
  navigation: any,
  updateDispatchStatus: (status: any) => Promise<void>
) {
  const confirmProgress = useRef(new Animated.Value(0)).current;
  const refuseProgress = useRef(new Animated.Value(0)).current;
  const isConfirming = useRef(false);
  const isRefusing = useRef(false);
  const [isModalMinimized, setIsModalMinimized] = useState(false);
  const [userLocation, setUserLocation] = useState<Location.LocationObject | null>(null);
  const [showMapPreview, setShowMapPreview] = useState(false);
  const [acceptedMissionIds, setAcceptedMissionIds] = useState<Set<string>>(new Set());

  // Route cache — persists across modal opens/closes, only invalidated on new mission
  const [allRoutes, setAllRoutes] = useState<RouteResult[]>([]);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const [routeBounds, setRouteBounds] = useState<any>(null);
  const [isRouteLoading, setIsRouteLoading] = useState(false);
  const lastFetchedDestRef = useRef<string | null>(null);

  const isHandoverStarted = !!activeMission?.admission_recorded_at || 
    ['admis', 'triage', 'prise_en_charge', 'monitoring', 'cloture'].includes(activeMission?.hospital_data?.status as string);

  const hasActiveAlert = !!activeMission &&
    !['completed', 'mission_end'].includes(activeMission.dispatch_status || '') &&
    !isHandoverStarted;

  const isLocallyAccepted = !!activeMission && (acceptedMissionIds.has(activeMission.id) || isHandoverStarted);

  const isMissionAccepted = !!activeMission && (
    !['pending', 'dispatched', 'mission_end', 'completed'].includes(activeMission.dispatch_status || '') ||
    isLocallyAccepted
  );

  useEffect(() => {
    const isFinished = !activeMission ||
      activeMission.dispatch_status === 'completed' ||
      activeMission.dispatch_status === 'mission_end' ||
      isHandoverStarted;

    if (isFinished) {
      setIsModalMinimized(false);
    } else if (activeMission.dispatch_status === 'dispatched' && !isLocallyAccepted) {
      setIsModalMinimized(false);
    } else {
      setIsModalMinimized(true);
    }
  }, [activeMission?.id, activeMission?.dispatch_status, isLocallyAccepted, activeMission?.hospital_data?.status]);

  // When mission changes, clear the route cache
  useEffect(() => {
    setAllRoutes([]);
    setSelectedRouteIndex(0);
    setRouteBounds(null);
    lastFetchedDestRef.current = null;
  }, [activeMission?.id]);

  const handleConfirmPressIn = () => {
    isConfirming.current = true;
    Animated.timing(confirmProgress, {
      toValue: 1,
      duration: 1200,
      useNativeDriver: true
    }).start();
  };

  const handleConfirmPressOut = () => {
    isConfirming.current = false;
    confirmProgress.stopAnimation((val) => {
      if (val >= 0.98) {
        confirmProgress.setValue(1);
        
        if (activeMission?.id) {
          setAcceptedMissionIds(prev => new Set(prev).add(activeMission.id));
        }
        
        setIsModalMinimized(true);
        DeviceEventEmitter.emit('STOP_URGENTIST_ALARM');
        void updateDispatchStatus('en_route');
        navigation.navigate('MissionActive', { mission: activeMission });
      } else {
        Animated.timing(confirmProgress, {
          toValue: 0,
          duration: val * 800,
          useNativeDriver: true
        }).start();
      }
    });
  };

  const handleRefusePressIn = () => {
    isRefusing.current = true;
    Animated.timing(refuseProgress, {
      toValue: 1,
      duration: 1200,
      useNativeDriver: true
    }).start();
  };

  const handleRefusePressOut = () => {
    isRefusing.current = false;
    refuseProgress.stopAnimation((val) => {
      if (val >= 0.98) {
        refuseProgress.setValue(1);
        setIsModalMinimized(true);
        navigation.navigate('CallCenter');
      } else {
        Animated.timing(refuseProgress, {
          toValue: 0,
          duration: val * 800,
          useNativeDriver: true
        }).start();
      }
    });
  };

  // Fetch GPS once when modal opens
  useEffect(() => {
    if (activeMission && !isModalMinimized) {
      (async () => {
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        let loc = await Location.getCurrentPositionAsync({});
        setUserLocation(loc);
      })();
    }
  }, [activeMission?.id, isModalMinimized]);

  // Route fetch — cached by destination coords, pre-fetches as soon as location is known
  const fetchRoute = useCallback(async () => {
    if (!userLocation || !activeMission?.location?.lat || !activeMission?.location?.lng) return;
    const destKey = `${activeMission.location.lat},${activeMission.location.lng}`;
    if (lastFetchedDestRef.current === destKey && allRoutes.length > 0) return; // cache hit

    const origin: [number, number] = [userLocation.coords.longitude, userLocation.coords.latitude];
    const destination: [number, number] = [activeMission.location.lng, activeMission.location.lat];

    setIsRouteLoading(true);
    try {
      const result = await getRouteWithAlternatives(origin, destination, { alternatives: true });
      if (!result) return;
      const bounds = geometryToCameraBounds(result.primary.geometry, 80);
      setAllRoutes(result.routes);
      setRouteBounds(bounds);
      lastFetchedDestRef.current = destKey;
    } catch (err) {
      console.error('[MapRoute] Error fetching route:', err);
    } finally {
      setIsRouteLoading(false);
    }
  }, [userLocation, activeMission?.location?.lat, activeMission?.location?.lng, allRoutes.length]);

  // Pre-fetch eagerly as soon as we have location (even before map preview opens)
  useEffect(() => {
    if (userLocation && activeMission?.location?.lat) {
      fetchRoute();
    }
  }, [userLocation, fetchRoute]);

  // Re-confirm fetch when map opens (in case location wasn't ready before)
  useEffect(() => {
    if (showMapPreview && userLocation) {
      fetchRoute();
    }
    // Intentionally NOT clearing route on close — that is the cache
  }, [showMapPreview]);

  const calculateDistance = () => {
    if (!userLocation || !activeMission?.location?.lat || !activeMission?.location?.lng) return null;
    const R = 6371;
    const dLat = (activeMission.location.lat - userLocation.coords.latitude) * (Math.PI / 180);
    const dLon = (activeMission.location.lng - userLocation.coords.longitude) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(userLocation.coords.latitude * (Math.PI / 180)) *
      Math.cos(activeMission.location.lat * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return (R * c).toFixed(1);
  };

  const getVictimMetadata = () => {
    if (!activeMission) return { age: null, gender: null, height: null };
    const findResp = (keys: string[], textMatch: string) =>
      activeMission.sos_responses?.find((r: any) => {
        const k = r.question_key?.toLowerCase() || '';
        const t = r.question_text?.toLowerCase() || '';
        return keys.some(key => k.includes(key)) || t.includes(textMatch.toLowerCase());
      })?.answer;
    const age = findResp(['age', 'ans', 'old'], 'âge') || activeMission.caller?.age;
    const gender = findResp(['sexe', 'gender', 'genre'], 'sexe') || activeMission.caller?.gender || activeMission.incident?.caller_gender;
    const height = findResp(['taille', 'height'], 'taille');
    return {
      age: age && age !== '—' ? age : (activeMission.incident?.age_approx || null),
      gender: gender && gender !== '—' ? gender : null,
      height: height && height !== '—' ? height : null
    };
  };

  const getMotifDAppel = () => {
    if (!activeMission) return '---';
    return activeMission.type ? activeMission.type.toUpperCase().replace(/_/g, ' ') : 'URGENCE MÉDICALE';
  };

  const capitalize = (str?: string) => {
    if (!str) return 'ANONYME';
    return str.toUpperCase();
  };

  return {
    confirmProgress,
    refuseProgress,
    isModalMinimized,
    setIsModalMinimized,
    userLocation,
    showMapPreview,
    setShowMapPreview,
    allRoutes,
    selectedRouteIndex,
    setSelectedRouteIndex,
    activeRoute: allRoutes[selectedRouteIndex] ?? null,
    routeBounds,
    isRouteLoading,
    hasActiveAlert,
    isMissionAccepted,
    handleConfirmPressIn,
    handleConfirmPressOut,
    handleRefusePressIn,
    handleRefusePressOut,
    calculateDistance,
    getVictimMetadata,
    getMotifDAppel,
    capitalize
  };
}
