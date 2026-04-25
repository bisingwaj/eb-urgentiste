import { useState, useEffect, useRef } from 'react';
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
  const [isModalMinimized, setIsModalMinimized] = useState(false);
  const [userLocation, setUserLocation] = useState<Location.LocationObject | null>(null);
  const [showMapPreview, setShowMapPreview] = useState(false);
  const [activeRoute, setActiveRoute] = useState<RouteResult | null>(null);
  const [routeBounds, setRouteBounds] = useState<any>(null);

  const hasActiveAlert = !!activeMission &&
    activeMission.dispatch_status !== 'completed' &&
    activeMission.dispatch_status !== 'mission_end';

  const isMissionAccepted = hasActiveAlert && activeMission?.dispatch_status !== 'dispatched';

  useEffect(() => {
    if (!activeMission || activeMission.dispatch_status === 'completed') {
      setIsModalMinimized(false);
    } else if (activeMission.dispatch_status === 'dispatched') {
      setIsModalMinimized(false);
    } else {
      setIsModalMinimized(true);
    }
  }, [activeMission?.id, activeMission?.dispatch_status]);

  const handleConfirmPressIn = () => {
    confirmProgress.setValue(0);
    Animated.timing(confirmProgress, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true
    }).start();
  };

  const handleConfirmPressOut = () => {
    confirmProgress.stopAnimation((val) => {
      if (val >= 0.95) {
        confirmProgress.setValue(0);
        setIsModalMinimized(true);
        DeviceEventEmitter.emit('STOP_URGENTIST_ALARM');
        void updateDispatchStatus('en_route');
        navigation.navigate('MissionActive', { mission: activeMission });
      } else {
        Animated.timing(confirmProgress, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true
        }).start();
      }
    });
  };

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

  useEffect(() => {
    if (showMapPreview && userLocation && activeMission?.location?.lat && activeMission?.location?.lng) {
      let cancelled = false;
      const origin: [number, number] = [userLocation.coords.longitude, userLocation.coords.latitude];
      const destination: [number, number] = [activeMission.location.lng, activeMission.location.lat];

      (async () => {
        try {
          const result = await getRouteWithAlternatives(origin, destination);
          if (cancelled || !result) return;
          const bounds = geometryToCameraBounds(result.primary.geometry, 80);
          setActiveRoute(result.primary);
          setRouteBounds(bounds);
        } catch (err) {
          console.error('[MapRoute] Error fetching route:', err);
        }
      })();

      return () => { cancelled = true; };
    } else if (!showMapPreview) {
      setActiveRoute(null);
      setRouteBounds(null);
    }
  }, [showMapPreview, userLocation, activeMission?.location]);

  const calculateDistance = () => {
    if (!userLocation || !activeMission?.location?.lat || !activeMission?.location?.lng) return null;
    const R = 6371; // km
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
    const typeLabel = activeMission.type ? activeMission.type.toUpperCase().replace(/_/g, ' ') : 'URGENCE MÉDICALE';
    return typeLabel;
  };

  const capitalize = (str?: string) => {
    if (!str) return 'ANONYME';
    return str.toUpperCase();
  };

  return {
    confirmProgress,
    isModalMinimized,
    setIsModalMinimized,
    userLocation,
    showMapPreview,
    setShowMapPreview,
    activeRoute,
    routeBounds,
    hasActiveAlert,
    isMissionAccepted,
    handleConfirmPressIn,
    handleConfirmPressOut,
    calculateDistance,
    getVictimMetadata,
    getMotifDAppel,
    capitalize
  };
}
