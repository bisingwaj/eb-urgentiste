import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
Platform,
  Alert,
  Linking,
  Animated,
  PanResponder,
  Dimensions,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  ActivityIndicator,
} from 'react-native';
import { AppTouchableOpacity } from '../../components/ui/AppTouchableOpacity';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Mapbox from '@rnmapbox/maps';
import { MapboxMapView } from '../../components/map/MapboxMapView';
import { FullscreenMapModal } from '../../components/map/FullscreenMapModal';
import { HospitalMarker, UnitMarker } from '../../components/map/mapMarkers';
import { useResolveHeadingFromRemotePosition } from '../../hooks/useResolveHeadingFromLocation';
import { MaterialIcons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { supabase } from '../../lib/supabase';
import {
  getRoute,
  buildRouteFeature,
  geometryToCameraBounds,
  formatDurationSeconds,
  formatDistanceMeters,
  haversineMeters,
} from '../../lib/mapbox';
import type { EmergencyCase, UrgencyLevel } from './HospitalDashboardTab';
import { POST_AMBULANCE_TRACKING_STATUSES } from '../../lib/hospitalNavigation';

const { width, height } = Dimensions.get('window');
/** Hauteur zone carte suivi : ratio écran, bornée pour petits / grands écrans */
const MAP_TRACK_HEIGHT = Math.min(500, Math.max(300, Math.round(height * 1.0)));
const SWIPE_WIDTH = width - 40;
const BUTTON_SIZE = 56;

/** Aligné sur `UnitMarker` / `mapMarkers` (carte live urgentiste) */
function mapDispatchStatusToUnitMarkerStatus(dispatchStatus?: string): string {
  if (!dispatchStatus) return '';
  if (dispatchStatus === 'en_route_hospital') return 'en_route';
  if (dispatchStatus === 'arrived_hospital' || dispatchStatus === 'on_scene') return 'on_scene';
  if (dispatchStatus === 'en_intervention') return 'en_intervention';
  return '';
}

const getLevelConfig = (level: UrgencyLevel) => {
  switch (level) {
    case 'critique':
      return { color: '#FF5252', bg: 'rgba(255, 82, 82, 0.12)', label: 'CRITIQUE' };
    case 'urgent':
      return { color: '#FF9800', bg: 'rgba(255, 152, 0, 0.12)', label: 'URGENT' };
    case 'stable':
      return { color: '#69F0AE', bg: 'rgba(105, 240, 174, 0.12)', label: 'STABLE' };
  }
};

const REFUSAL_REASONS = [
  "Indisponibilité de lits",
  "Manque de spécialiste de garde",
  "Plateau technique insuffisant",
  "Indisponibilité de bloc opératoire",
  "Maintenance en cours",
  "Autre raison"
];

import { useHospital } from '../../contexts/HospitalContext';

export function HospitalCaseDetailScreen({ route, navigation }: any) {
  const { caseData: initialCaseData } = route.params as { caseData: EmergencyCase };
  const [caseData, setCaseData] = useState(initialCaseData);
  const { updateCaseStatus, activeCases } = useHospital();
  const levelCfg = getLevelConfig(caseData.level);
  const insets = useSafeAreaInsets();

  /** Suivi ambulance : `en_route_hospital` (dispatch) ↔ `en_cours` (EmergencyCase.status) via HospitalContext */
  const isEnRoute =
    caseData.dispatchStatus === 'en_route_hospital' || caseData.status === 'en_cours';
  /** Réponse hôpital : accepté / refusé */
  const hasHospitalAccepted = caseData.hospitalStatus === 'accepted';
  const isPendingHospitalResponse =
    !caseData.hospitalStatus || caseData.hospitalStatus === 'pending';
  /** Pas de swipe Accepter/Refuser tant que l’unité est déjà en route vers la structure */
  const needsHospitalSwipe = isPendingHospitalResponse && !isEnRoute;
  /** Carte + GPS tant que le dossier n’a pas franchi l’admission administrative (statuts post-admission → CTA cliniques). */
  const showAmbulanceTracking =
    hasHospitalAccepted &&
    !!caseData.unitId &&
    !POST_AMBULANCE_TRACKING_STATUSES.includes(caseData.status);

  const hospitalCoord = useMemo((): [number, number] | null => {
    const lat = caseData.assignedStructureLat;
    const lng = caseData.assignedStructureLng;
    if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return [lng, lat];
  }, [caseData.assignedStructureLat, caseData.assignedStructureLng]);

  // Realtime / liste : garder le détail aligné sur Supabase (hospital_status, status dispatch…)
  useEffect(() => {
    const updated = activeCases.find((c) => c.id === caseData.id);
    if (!updated) return;
    setCaseData((prev) => ({ ...prev, ...updated }));
  }, [activeCases, caseData.id]);

  const [showRefusalModal, setShowRefusalModal] = useState(false);
  const [selectedReason, setSelectedReason] = useState("");
  const [otherReason, setOtherReason] = useState("");
  const [accepting, setAccepting] = useState(false);
  const [refusing, setRefusing] = useState(false);
  const acceptingRef = useRef(false);
  const refusingRef = useRef(false);

  // Swipe Animation
  const pan = useRef(new Animated.Value(0)).current;

  const handleAcceptCase = useCallback(async () => {
    if (acceptingRef.current) return;
    acceptingRef.current = true;
    setAccepting(true);
    try {
      await updateCaseStatus(caseData.id, { hospitalStatus: 'accepted' });
      setCaseData(prev => ({
        ...prev,
        hospitalStatus: 'accepted',
        hospitalNotes: prev.hospitalNotes ?? "Accepté par l'établissement",
      }));
    } catch (err) {
      Alert.alert('Erreur', 'Impossible d\'accepter le cas actuellement.');
      Animated.spring(pan, { toValue: 0, useNativeDriver: false }).start();
    } finally {
      acceptingRef.current = false;
      setAccepting(false);
    }
  }, [caseData.id, updateCaseStatus, pan]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !acceptingRef.current,
        onPanResponderMove: Animated.event([null, { dx: pan }], { useNativeDriver: false }),
        onPanResponderRelease: (e, gestureState) => {
          if (acceptingRef.current) {
            Animated.spring(pan, { toValue: 0, useNativeDriver: false }).start();
            return;
          }
          if (gestureState.dx > SWIPE_WIDTH * 0.7) {
            Animated.spring(pan, {
              toValue: SWIPE_WIDTH - BUTTON_SIZE,
              useNativeDriver: false,
            }).start(() => {
              void handleAcceptCase();
            });
          } else {
            Animated.spring(pan, {
              toValue: 0,
              useNativeDriver: false,
            }).start();
          }
        },
      }),
    [handleAcceptCase, pan]
  );

  const handleRefuseCase = useCallback(async () => {
    const finalReason = selectedReason === "Autre raison" ? otherReason : selectedReason;
    if (!finalReason) {
      Alert.alert("Action requise", "Veuillez sélectionner ou saisir une raison.");
      return;
    }
    if (refusingRef.current) return;
    refusingRef.current = true;
    setRefusing(true);
    try {
      await updateCaseStatus(caseData.id, {
        hospitalStatus: 'refused',
        hospitalNotes: finalReason
      });
      setShowRefusalModal(false);
      navigation.goBack();
      Alert.alert("Cas refusé", "Le signalement a été refusé. L'unité mobile est notifiée.");
    } catch (err) {
      Alert.alert('Erreur', 'Impossible de refuser ce cas.');
    } finally {
      refusingRef.current = false;
      setRefusing(false);
    }
  }, [selectedReason, otherReason, caseData.id, updateCaseStatus, navigation]);

  const unitDialNumber =
    caseData.urgentistePhone && caseData.urgentistePhone !== '-' ? caseData.urgentistePhone : '';

  const handleCall = () => {
    if (!unitDialNumber) {
      Alert.alert('Contact indisponible', 'Aucun numéro de téléphone n’est renseigné pour cette unité.');
      return;
    }
    const url = `tel:${unitDialNumber}`;
    Linking.canOpenURL(url).then((supported) => supported && Linking.openURL(url));
  };

  const handleMessage = () => {
    if (!unitDialNumber) {
      Alert.alert('Contact indisponible', 'Aucun numéro de téléphone n’est renseigné pour cette unité.');
      return;
    }
    const url = `sms:${unitDialNumber}`;
    Linking.canOpenURL(url).then((supported) => supported && Linking.openURL(url));
  };

  const handleGoToAdmission = () => {
    navigation.navigate('HospitalAdmission', { caseData });
  };

  const handleGoToTriage = () => {
    navigation.navigate('HospitalTriage', { caseData });
  };

  const handleGoToPriseEnCharge = () => {
    navigation.navigate('HospitalPriseEnCharge', { caseData });
  };

  const handleGoToMonitoring = () => {
    navigation.navigate('HospitalMonitoring', { caseData });
  };

  // Realtime GPS Tracking State (pas de position par défaut : évite un faux tracé avant la 1re MàJ)
  const [ambulanceLat, setAmbulanceLat] = useState<number | null>(null);
  const [ambulanceLng, setAmbulanceLng] = useState<number | null>(null);
  const [ambulanceSpeed, setAmbulanceSpeed] = useState<number | null>(null);
  /** Cap brut depuis `active_rescuers.heading` (degrés), si disponible. */
  const [ambulanceHeadingRaw, setAmbulanceHeadingRaw] = useState<number | null>(null);
  const [ambulanceBattery, setAmbulanceBattery] = useState<number | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [rescuerName, setRescuerName] = useState<string>('Unité');
  const [routeGeoJSON, setRouteGeoJSON] = useState<GeoJSON.FeatureCollection | null>(null);
  const [routeDurationSec, setRouteDurationSec] = useState<number | null>(null);
  const [routeDistanceM, setRouteDistanceM] = useState<number | null>(null);
  const lastRouteFetch = useRef(0);

  const hasAmbulancePosition = ambulanceLat != null && ambulanceLng != null;

  useEffect(() => {
    if (!hospitalCoord) {
      setRouteGeoJSON(null);
      setRouteDurationSec(null);
      setRouteDistanceM(null);
    }
  }, [hospitalCoord]);

  /** Recalcul itinéraire (throttle ~15 s comme MissionActive) : driving-traffic puis repli côté getRoute */
  useEffect(() => {
    if (!showAmbulanceTracking || !hospitalCoord) return;
    if (ambulanceLat == null || ambulanceLng == null) return;
    const now = Date.now();
    if (now - lastRouteFetch.current < 15000 && routeGeoJSON) return;
    lastRouteFetch.current = now;
    const origin: [number, number] = [ambulanceLng, ambulanceLat];
    getRoute(origin, hospitalCoord, { profile: 'driving-traffic' }).then((result) => {
      if (result) {
        setRouteGeoJSON(buildRouteFeature(result.geometry));
        setRouteDurationSec(result.duration);
        setRouteDistanceM(result.distance);
      } else {
        const straight: GeoJSON.LineString = {
          type: 'LineString',
          coordinates: [origin, hospitalCoord],
        };
        setRouteGeoJSON(buildRouteFeature(straight));
        setRouteDurationSec(null);
        setRouteDistanceM(haversineMeters(origin, hospitalCoord));
      }
    });
  }, [ambulanceLat, ambulanceLng, hospitalCoord, showAmbulanceTracking, routeGeoJSON]);

  const mapCameraBounds = useMemo(() => {
    if (routeGeoJSON?.features[0]?.geometry) {
      return geometryToCameraBounds(routeGeoJSON.features[0].geometry as GeoJSON.LineString, 80);
    }
    if (hospitalCoord && hasAmbulancePosition) {
      const padding = 80;
      return {
        ne: [Math.max(hospitalCoord[0], ambulanceLng!), Math.max(hospitalCoord[1], ambulanceLat!)] as [number, number],
        sw: [Math.min(hospitalCoord[0], ambulanceLng!), Math.min(hospitalCoord[1], ambulanceLat!)] as [number, number],
        paddingTop: padding,
        paddingBottom: padding,
        paddingLeft: padding,
        paddingRight: padding,
      };
    }
    return null;
  }, [routeGeoJSON, hospitalCoord, ambulanceLat, ambulanceLng, hasAmbulancePosition]);

  const mapFallbackCenter = useMemo((): [number, number] => {
    if (hospitalCoord) return [hospitalCoord[0], hospitalCoord[1]];
    if (hasAmbulancePosition) return [ambulanceLng!, ambulanceLat!];
    return [15.2663, -4.4419];
  }, [hospitalCoord, hasAmbulancePosition, ambulanceLng, ambulanceLat]);

  useEffect(() => {
    if (!showAmbulanceTracking || !caseData.unitId) return;

    let channel: ReturnType<typeof supabase.channel> | null = null;
    let isMounted = true;

    async function initTracking() {
      const { data: rescuers } = await supabase
        .from('users_directory')
        .select('auth_user_id, first_name, last_name')
        .eq('assigned_unit_id', caseData.unitId);

      if (!rescuers || rescuers.length === 0) return;

      const rescuerIds = rescuers
        .map((r: { auth_user_id?: string | null }) => r.auth_user_id)
        .filter((id: string | null | undefined): id is string => id != null && String(id).length > 0);

      if (rescuers[0]?.first_name) {
        setRescuerName(`${rescuers[0].first_name} ${rescuers[0].last_name || ''}`.trim());
      }

      const applyActiveRescuerRow = (data: {
        lat?: unknown;
        lng?: unknown;
        speed?: unknown;
        battery?: unknown;
        heading?: unknown;
        updated_at?: string;
      }) => {
        if (!isMounted) return;
        if (data.lat != null) setAmbulanceLat(Number(data.lat));
        if (data.lng != null) setAmbulanceLng(Number(data.lng));
        setAmbulanceSpeed(data.speed != null ? Number(data.speed) : null);
        setAmbulanceBattery(data.battery != null ? Number(data.battery) : null);
        if (data.heading != null && Number.isFinite(Number(data.heading))) {
          const hd = Number(data.heading);
          setAmbulanceHeadingRaw(hd >= 0 ? hd : null);
        }
        if (data.updated_at) setLastUpdate(new Date(data.updated_at));
      };

      let usedActiveRescuer = false;
      if (rescuerIds.length > 0) {
        const { data: activeRescuers } = await supabase
          .from('active_rescuers')
          .select('lat, lng, speed, battery, heading, updated_at')
          .in('user_id', rescuerIds)
          .order('updated_at', { ascending: false })
          .limit(1);

        const row = activeRescuers?.[0];
        if (
          row &&
          row.lat != null &&
          row.lng != null &&
          isMounted
        ) {
          applyActiveRescuerRow(row);
          usedActiveRescuer = true;
        }
      }

      if (!usedActiveRescuer) {
        const { data: unitData } = await supabase
          .from('units')
          .select('location_lat, location_lng, agent_name, last_location_update')
          .eq('id', caseData.unitId)
          .single();
        if (unitData && isMounted) {
          if (unitData.location_lat != null) setAmbulanceLat(Number(unitData.location_lat));
          if (unitData.location_lng != null) setAmbulanceLng(Number(unitData.location_lng));
          if (unitData.agent_name) setRescuerName(unitData.agent_name);
          if (unitData.last_location_update) setLastUpdate(new Date(unitData.last_location_update));
        }
      }

      /** PROMPT_CURSOR_HOPITAL_WORKFLOW §3 : un listener filtré par secouriste + repli flotte `units`. */
      let ch = supabase.channel(`hospital-track-${caseData.unitId}`);
      for (const uid of rescuerIds) {
        ch = ch.on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'active_rescuers',
            filter: `user_id=eq.${uid}`,
          },
          (payload: { new?: Record<string, unknown>; old?: Record<string, unknown> }) => {
            const data = payload.new || payload.old;
            if (!data || !isMounted) return;
            applyActiveRescuerRow(data as Parameters<typeof applyActiveRescuerRow>[0]);
          },
        );
      }
      ch = ch.on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'units',
          filter: `id=eq.${caseData.unitId}`,
        },
        (payload: { new?: Record<string, unknown> }) => {
          const row = payload.new;
          if (!row || !isMounted) return;
          if (row.location_lat != null && row.location_lng != null) {
            setAmbulanceLat(Number(row.location_lat));
            setAmbulanceLng(Number(row.location_lng));
            if (row.last_location_update) setLastUpdate(new Date(String(row.last_location_update)));
          }
        },
      );
      ch.subscribe();
      channel = ch;
    }

    void initTracking();

    return () => {
      isMounted = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, [showAmbulanceTracking, caseData.unitId, caseData.hospitalStatus]);

  const isSignalLost = lastUpdate 
    ? new Date().getTime() - lastUpdate.getTime() > 2 * 60 * 1000 
    : false;

  const etaMainDisplay =
    routeDurationSec != null
      ? formatDurationSeconds(routeDurationSec)
      : caseData.eta && String(caseData.eta).trim()
        ? caseData.eta
        : '—';

  const structureMapLabel = useMemo(
    () => (caseData.assignedStructureName?.trim() ? caseData.assignedStructureName.trim() : 'Structure'),
    [caseData.assignedStructureName],
  );

  const unitMarkerStatus = useMemo(
    () => mapDispatchStatusToUnitMarkerStatus(caseData.dispatchStatus),
    [caseData.dispatchStatus],
  );

  const ambulanceDirectionDeg = useResolveHeadingFromRemotePosition({
    lat: ambulanceLat,
    lng: ambulanceLng,
    headingFromServer: ambulanceHeadingRaw,
    speedMps: ambulanceSpeed,
  });

  const [mapFullscreenOpen, setMapFullscreenOpen] = useState(false);

  const hospitalFullscreenMapChildren = useMemo(() => {
    if (!showAmbulanceTracking) return null;
    return (
      <>
        {mapCameraBounds ? (
          <Mapbox.Camera bounds={mapCameraBounds} animationMode="flyTo" animationDuration={1000} />
        ) : (
          <Mapbox.Camera
            centerCoordinate={mapFallbackCenter}
            zoomLevel={14}
            animationMode="flyTo"
            animationDuration={800}
          />
        )}
        {hospitalCoord && (
          <Mapbox.MarkerView id="hospital-structure-mv-fs" coordinate={hospitalCoord}>
            <HospitalMarker
              label={structureMapLabel}
              beds={0}
              onPress={() => Alert.alert('Structure', structureMapLabel, [{ text: 'OK' }])}
            />
          </Mapbox.MarkerView>
        )}
        {hasAmbulancePosition && (
          <Mapbox.MarkerView id="ambulance-unit-mv-fs" coordinate={[ambulanceLng!, ambulanceLat!]}>
            <UnitMarker
              status={unitMarkerStatus}
              headingDeg={ambulanceDirectionDeg}
              onPress={() => Alert.alert('Unité', caseData.urgentisteName, [{ text: 'OK' }])}
            />
          </Mapbox.MarkerView>
        )}
        {routeGeoJSON && (
          <Mapbox.ShapeSource id="hospital-route-fs" shape={routeGeoJSON}>
            <Mapbox.LineLayer
              id="hospital-route-line-fs"
              style={{
                lineColor: colors.routePrimary,
                lineWidth: 4,
                lineOpacity: 0.85,
              }}
            />
          </Mapbox.ShapeSource>
        )}
      </>
    );
  }, [
    showAmbulanceTracking,
    mapCameraBounds,
    mapFallbackCenter,
    hospitalCoord,
    hasAmbulancePosition,
    ambulanceLng,
    ambulanceLat,
    routeGeoJSON,
    structureMapLabel,
    unitMarkerStatus,
    caseData.urgentisteName,
    ambulanceDirectionDeg,
  ]);

  const hospitalFullscreenTopOverlay = useMemo(() => {
    if (!showAmbulanceTracking) return null;
    return (
      <View style={{ gap: 10 }}>
        {!hospitalCoord && (
          <View style={styles.fullscreenBannerRow}>
            <MaterialIcons name="info-outline" size={16} color="#FFF" />
            <Text style={styles.coordsMissingText}>Coordonnées de la structure indisponibles</Text>
          </View>
        )}
        <View style={styles.fullscreenGpsBadge}>
          <View style={[styles.liveDot, isSignalLost ? { backgroundColor: '#FFF' } : {}]} />
          <Text style={styles.liveText}>{isSignalLost ? 'SIGNAL PERDU' : 'GPS EN DIRECT'}</Text>
        </View>
      </View>
    );
  }, [showAmbulanceTracking, hospitalCoord, isSignalLost]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <AppTouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color="#FFF" />
        </AppTouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.headerTitle}>
            {showAmbulanceTracking ? "Suivi de l'ambulance" : 'Détails du cas'}
          </Text>
          {caseData.incidentReference ? (
            <Text style={styles.headerRef} numberOfLines={1}>{caseData.incidentReference}</Text>
          ) : null}
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
      >
        {showAmbulanceTracking && (
          <View style={styles.trackingContainer}>
            <View style={[styles.mapFullBleed, { height: MAP_TRACK_HEIGHT }]}>
              <MapboxMapView style={styles.liveMap} styleURL={Mapbox.StyleURL.Dark} compassEnabled={false} scaleBarEnabled={false}>
                {mapCameraBounds ? (
                  <Mapbox.Camera
                    bounds={mapCameraBounds}
                    animationMode="flyTo"
                    animationDuration={1000}
                  />
                ) : (
                  <Mapbox.Camera
                    centerCoordinate={mapFallbackCenter}
                    zoomLevel={14}
                    animationMode="flyTo"
                    animationDuration={800}
                  />
                )}
                {hospitalCoord && (
                  <Mapbox.MarkerView id="hospital-structure-mv" coordinate={hospitalCoord}>
                    <HospitalMarker
                      label={structureMapLabel}
                      beds={0}
                      onPress={() =>
                        Alert.alert('Structure', structureMapLabel, [{ text: 'OK' }])
                      }
                    />
                  </Mapbox.MarkerView>
                )}
                {hasAmbulancePosition && (
                  <Mapbox.MarkerView id="ambulance-unit-mv" coordinate={[ambulanceLng!, ambulanceLat!]}>
                    <UnitMarker
                      status={unitMarkerStatus}
                      headingDeg={ambulanceDirectionDeg}
                      onPress={() =>
                        Alert.alert('Unité', caseData.urgentisteName, [{ text: 'OK' }])
                      }
                    />
                  </Mapbox.MarkerView>
                )}
                {routeGeoJSON && (
                  <Mapbox.ShapeSource id="hospital-route" shape={routeGeoJSON}>
                    <Mapbox.LineLayer
                      id="hospital-route-line"
                      style={{
                        lineColor: colors.routePrimary,
                        lineWidth: 4,
                        lineOpacity: 0.85,
                      }}
                    />
                  </Mapbox.ShapeSource>
                )}
              </MapboxMapView>
              {!hospitalCoord && (
                <View style={styles.coordsMissingBanner}>
                  <MaterialIcons name="info-outline" size={16} color="#FFF" />
                  <Text style={styles.coordsMissingText}>Coordonnées de la structure indisponibles</Text>
                </View>
              )}
              <View style={[styles.mapStatusBadge, isSignalLost ? { backgroundColor: 'rgba(255, 82, 82, 0.9)' } : {}]}>
                <View style={[styles.liveDot, isSignalLost ? { backgroundColor: '#FFF' } : {}]} />
                <Text style={styles.liveText}>{isSignalLost ? 'SIGNAL PERDU' : 'GPS EN DIRECT'}</Text>
              </View>
              <AppTouchableOpacity
                style={styles.mapFullscreenEntryBtn}
                onPress={() => setMapFullscreenOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Carte plein écran"
              >
                <MaterialIcons name="fullscreen" color="#FFF" size={22} />
              </AppTouchableOpacity>
            </View>

            <View style={styles.trackingInfoLite}>
              <View style={styles.infoLine}>
                <Text style={styles.infoLineLabel}>Arrivée estimée</Text>
                <Text style={styles.infoLineValueEta}>{etaMainDisplay}</Text>
              </View>
              <Text style={styles.infoLineHint}>
                {isEnRoute ? 'En route vers votre structure' : 'En attente de départ — suivi GPS actif'}
              </Text>
              {routeDistanceM != null ? (
                <View style={styles.infoLine}>
                  <Text style={styles.infoLineLabel}>Distance restante</Text>
                  <Text style={styles.infoLineValue}>{formatDistanceMeters(routeDistanceM)}</Text>
                </View>
              ) : null}
              <View style={styles.infoHairline} />
              <View style={styles.infoLine}>
                <Text style={styles.infoLineLabel}>Unité</Text>
                <Text style={styles.infoLineValue} numberOfLines={1}>
                  {caseData.urgentisteName}
                </Text>
              </View>
              <View style={styles.infoLine}>
                <Text style={styles.infoLineLabel}>Agent</Text>
                <Text style={styles.infoLineValue} numberOfLines={1}>
                  {rescuerName}
                </Text>
              </View>
              {ambulanceSpeed !== null ? (
                <View style={styles.infoLine}>
                  <Text style={styles.infoLineLabel}>Vitesse</Text>
                  <Text style={styles.infoLineValue}>{Math.round(ambulanceSpeed * 3.6)} km/h</Text>
                </View>
              ) : null}
              {ambulanceBattery !== null ? (
                <View style={styles.infoLine}>
                  <Text style={styles.infoLineLabel}>Batterie</Text>
                  <Text
                    style={[
                      styles.infoLineValue,
                      ambulanceBattery <= 20 && { color: colors.error },
                    ]}
                  >
                    {ambulanceBattery}%
                  </Text>
                </View>
              ) : null}
              <View style={styles.infoLine}>
                <Text style={styles.infoLineLabel}>Dernière MàJ</Text>
                <Text style={styles.infoLineValue}>
                  {lastUpdate
                    ? lastUpdate.toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })
                    : '—'}
                </Text>
              </View>
            </View>
          </View>
        )}

        <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Informations patient</Text>
              <View style={styles.infoCard}>
                <View style={styles.patientHeader}>
                  <View style={[styles.avatar, { backgroundColor: levelCfg.bg }]}><Text style={[styles.avatarText, { color: levelCfg.color }]}>{caseData.victimName.charAt(0)}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.patientName}>{caseData.victimName}</Text>
                    <View style={styles.metaRow}><Text style={styles.metaText}>{caseData.sex} · {caseData.age || '?'} ans</Text></View>
                    {caseData.callerPhone ? (
                      <Text style={styles.metaText}>Tél. signalement : {caseData.callerPhone}</Text>
                    ) : null}
                  </View>
                </View>
                {caseData.patientProfile && (
                  <>
                    <View style={styles.divider} />
                    <View style={{ gap: 8 }}>
                      <View style={styles.descSection}>
                        <Text style={styles.descText}><Text style={{ color: '#FFF' }}>Sang:</Text> {caseData.patientProfile.bloodType || 'Inconnu'}</Text>
                        <Text style={styles.descText}><Text style={{ color: '#FFF' }}>Allergies:</Text> {caseData.patientProfile.allergies?.join(', ') || 'Aucune / Inconnu'}</Text>
                        <Text style={styles.descText}><Text style={{ color: '#FFF' }}>Antécédents:</Text> {caseData.patientProfile.medicalHistory?.join(', ') || 'Aucun / Inconnu'}</Text>
                        {(caseData.patientProfile.emergencyContactName || caseData.patientProfile.emergencyContactPhone) && (
                          <Text style={styles.descText}>
                            <Text style={{ color: '#FFF' }}>Contact Urgence:</Text> {caseData.patientProfile.emergencyContactName} ({caseData.patientProfile.emergencyContactPhone})
                          </Text>
                        )}
                      </View>
                    </View>
                  </>
                )}

                <View style={styles.divider} />
                <View style={styles.descSection}>
                  <Text style={styles.label}>Motif / Description</Text>
                  <Text style={styles.descText}>{caseData.description}</Text>
                </View>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Localisation & unité terrain</Text>
              <View style={[styles.infoCard, { padding: 16, gap: 16 }]}>
                <View style={styles.unitInfoRow}>
                  <MaterialIcons name="place" color={colors.secondary} size={20} />
                  <Text style={styles.addressText}>{caseData.address}</Text>
                </View>
                <View style={styles.divider} />
                <Text style={styles.unitBlockLabel}>Équipe / unité mobile</Text>
                <View style={styles.unitInfoRow}>
                  <MaterialIcons name="local-shipping" color={colors.secondary} size={20} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.unitName}>Indicatif : {caseData.urgentisteName}</Text>
                    {(caseData.unitVehicleType || caseData.unitVehiclePlate) ? (
                      <Text style={styles.unitDetailLine}>
                        {[caseData.unitVehicleType, caseData.unitVehiclePlate].filter(Boolean).join(' · ')}
                      </Text>
                    ) : null}
                    {caseData.unitAgentName ? (
                      <Text style={styles.unitDetailLine}>Agent : {caseData.unitAgentName}</Text>
                    ) : null}
                    <Text style={styles.unitPhone}>
                      Contact unité : {caseData.urgentistePhone !== '-' ? caseData.urgentistePhone : 'Non renseigné'}
                    </Text>
                  </View>
                </View>
                <View style={styles.unitInfoRow}>
                  <MaterialIcons name="medical-services" color={colors.secondary} size={20} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.unitHint}>Appeler ou SMS l’équipe terrain (numéro unité)</Text>
                  </View>
                  <View style={styles.unitActions}>
                    <AppTouchableOpacity style={styles.unitBtn} onPress={handleCall}><MaterialIcons name="phone" color={colors.success} size={20} /></AppTouchableOpacity>
                    <AppTouchableOpacity style={[styles.unitBtn, { backgroundColor: 'rgba(68,138,255,0.1)' }]} onPress={handleMessage}><MaterialIcons name="chat" color={colors.secondary} size={20} /></AppTouchableOpacity>
                  </View>
                </View>
              </View>
            </View>

            {(caseData.sosResponses && caseData.sosResponses.length > 0) && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Triage Terrain (SOS)</Text>
                <View style={[styles.infoCard, { padding: 20, gap: 12 }]}>
                  {caseData.sosResponses.map((r, idx) => (
                    <Text key={idx} style={styles.descText}>
                      ✓ <Text style={{ color: '#FFF' }}>{r.questionText}</Text> → {r.answer}
                    </Text>
                  ))}
                  {caseData.gravityScore !== undefined && (
                    <Text style={[styles.label, { marginTop: 8, color: colors.error }]}>
                      Score gravité : {caseData.gravityScore}/20
                    </Text>
                  )}
                </View>
              </View>
            )}

            {(caseData.vitals || caseData.symptoms || (caseData.interventions && caseData.interventions.length > 0) || caseData.description) && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Actions Terrain</Text>
                <View style={[styles.infoCard, { padding: 20, gap: 16 }]}>
                  {(caseData.description || caseData.symptoms) && (
                    <View>
                      <Text style={styles.label}>Notes secouriste / Symptômes</Text>
                      <Text style={styles.descText}>
                        {caseData.description}{' '}
                        {Array.isArray(caseData.symptoms) ? caseData.symptoms.join(', ') : caseData.symptoms}
                      </Text>
                    </View>
                  )}
                  {caseData.vitals && (
                    <>
                      <View style={styles.divider} />
                      <View>
                        <Text style={styles.label}>Signes Vitaux Monitorés</Text>
                        <Text style={styles.descText}>
                          Tension: {caseData.vitals.tension || '-'} mmHg{'\n'}
                          FC: {caseData.vitals.heartRate || '-'} bpm  ·  Sat O2: {caseData.vitals.satO2 || '-'} %{'\n'}
                          Temp: {caseData.vitals.temperature || '-'} °C
                        </Text>
                      </View>
                    </>
                  )}
                  {caseData.interventions && caseData.interventions.length > 0 && (
                    <>
                      <View style={styles.divider} />
                      <View>
                        <Text style={styles.label}>Soins Prescrits / Appliqués</Text>
                        {caseData.interventions.map((int: any, idx: number) => (
                          <Text key={idx} style={styles.descText}>• {int.description || int.label || int}</Text>
                        ))}
                      </View>
                    </>
                  )}
                </View>
              </View>
            )}
          </>
      </ScrollView>

      {/* FOOTER ACTIONS — ordre : swipe → étapes cliniques (status) → route → admission pré-hospitalière */}
      {needsHospitalSwipe ? (
        <View style={[styles.stickyFooter, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          <View style={styles.swipeContainer}>
            {accepting ? (
              <View style={styles.swipeLoading}>
                <ActivityIndicator color="#FFF" />
              </View>
            ) : (
              <>
                <View style={styles.swipeBackground}><Text style={styles.swipeText}>Glisser pour accepter</Text><MaterialIcons name="chevron-right" color="rgba(255,255,255,0.3)" size={24} /></View>
                <Animated.View style={[styles.swipeThumb, { transform: [{ translateX: pan }] }]} {...panResponder.panHandlers}><MaterialIcons name="keyboard-double-arrow-right" color="#000" size={24} /></Animated.View>
              </>
            )}
          </View>
          <AppTouchableOpacity
            style={[styles.refuseBtn, (accepting || refusing) && { opacity: 0.5 }]}
            disabled={accepting || refusing}
            onPress={() => setShowRefusalModal(true)}
          >
            <Text style={styles.refuseText}>Refuser le cas</Text>
          </AppTouchableOpacity>
        </View>
      ) : caseData.status === 'admis' ? (
        <View style={[styles.stickyFooter, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          <Text style={styles.postAcceptHint}>
            Admission administrative enregistrée. Passez au triage clinique pour la suite du dossier.
          </Text>
          <AppTouchableOpacity style={styles.admissionBtn} onPress={handleGoToTriage}>
            <MaterialIcons name="assignment" color="#000" size={24} />
            <Text style={styles.admissionBtnText}>Continuer vers le triage</Text>
          </AppTouchableOpacity>
        </View>
      ) : caseData.status === 'triage' ? (
        <View style={[styles.stickyFooter, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          <Text style={styles.postAcceptHint}>
            Triage clinique enregistré. Poursuivez avec la prise en charge médicale.
          </Text>
          <AppTouchableOpacity style={styles.admissionBtn} onPress={handleGoToPriseEnCharge}>
            <MaterialIcons name="medical-services" color="#000" size={24} />
            <Text style={styles.admissionBtnText}>Continuer vers la prise en charge</Text>
          </AppTouchableOpacity>
        </View>
      ) : caseData.status === 'prise_en_charge' ? (
        <View style={[styles.stickyFooter, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          <Text style={styles.postAcceptHint}>
            Prise en charge active. Ouvrez la surveillance pour le suivi du patient.
          </Text>
          <AppTouchableOpacity style={styles.admissionBtn} onPress={handleGoToMonitoring}>
            <MaterialIcons name="monitor-heart" color="#000" size={24} />
            <Text style={styles.admissionBtnText}>Ouvrir la surveillance</Text>
          </AppTouchableOpacity>
        </View>
      ) : caseData.status === 'monitoring' ? (
        <View style={[styles.stickyFooter, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          <Text style={styles.postAcceptHint}>Surveillance en cours pour ce dossier.</Text>
          <AppTouchableOpacity style={styles.admissionBtn} onPress={handleGoToMonitoring}>
            <MaterialIcons name="visibility" color="#000" size={24} />
            <Text style={styles.admissionBtnText}>Voir la surveillance</Text>
          </AppTouchableOpacity>
        </View>
      ) : isEnRoute ? (
        <View style={[styles.stickyFooter, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          <AppTouchableOpacity style={styles.admissionBtn} onPress={handleGoToAdmission}>
            <MaterialIcons name="local-hospital" color="#000" size={24} />
            <Text style={styles.admissionBtnText}>Patient arrivé - Admettre</Text>
          </AppTouchableOpacity>
        </View>
      ) : hasHospitalAccepted ? (
        <View style={[styles.stickyFooter, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          <Text style={styles.postAcceptHint}>
            {caseData.unitId
              ? 'Cas accepté. Le suivi ambulance et l’itinéraire vers votre structure sont affichés ci-dessus. Vous pourrez admettre le patient à l’arrivée.'
              : 'Cas accepté. Le suivi GPS s’affichera lorsqu’une unité sera assignée au dispatch.'}
          </Text>
          <AppTouchableOpacity style={styles.admissionBtn} onPress={handleGoToAdmission}>
            <MaterialIcons name="arrow-forward" color="#000" size={24} />
            <Text style={styles.admissionBtnText}>Continuer vers l’admission</Text>
          </AppTouchableOpacity>
        </View>
      ) : null}

      {/* 🔴 REFUSAL MODAL */}
      <Modal visible={showRefusalModal} transparent animationType="slide" onRequestClose={() => setShowRefusalModal(false)}>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior="padding"
            enabled={true}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
            style={styles.modalKeyboardAvoiding}
          >
            <View
              style={[
                styles.modalContent,
                {
                  maxHeight: Dimensions.get('window').height * 0.92,
                  paddingBottom: Math.max(insets.bottom, 24),
                },
              ]}
            >
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Raison du refus</Text>
                <AppTouchableOpacity disabled={refusing} onPress={() => setShowRefusalModal(false)}>
                  <MaterialIcons name="close" color="rgba(255,255,255,0.4)" size={24} />
                </AppTouchableOpacity>
              </View>
              <Text style={styles.modalSub}>Veuillez indiquer pourquoi vous ne pouvez pas recevoir ce patient.</Text>

              <ScrollView
                showsVerticalScrollIndicator={false}
                style={[
                  styles.reasonsList,
                  { maxHeight: Math.min(360, Dimensions.get('window').height * 0.42) },
                ]}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                nestedScrollEnabled
              >
                {REFUSAL_REASONS.map((r, i) => (
                  <AppTouchableOpacity key={i} style={[styles.reasonItem, selectedReason === r && styles.reasonItemActive]} onPress={() => setSelectedReason(r)}>
                    <Text style={[styles.reasonText, selectedReason === r && styles.reasonTextActive]}>{r}</Text>
                    {selectedReason === r && <MaterialIcons name="check-circle" color={colors.primary} size={20} />}
                  </AppTouchableOpacity>
                ))}

                {selectedReason === 'Autre raison' && (
                  <TextInput
                    style={styles.reasonInput}
                    placeholder="Précisez la raison..."
                    placeholderTextColor="rgba(255,255,255,0.3)"
                    multiline
                    autoFocus
                    value={otherReason}
                    onChangeText={setOtherReason}
                  />
                )}
              </ScrollView>

              <AppTouchableOpacity
                style={[styles.confirmRefusalBtn, refusing && { opacity: 0.65 }]}
                disabled={refusing}
                onPress={handleRefuseCase}
              >
                {refusing ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.confirmRefusalText}>CONFIRMER LE REFUS</Text>
                )}
              </AppTouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <FullscreenMapModal
        visible={mapFullscreenOpen && hospitalFullscreenMapChildren != null}
        onClose={() => setMapFullscreenOpen(false)}
        topOverlay={hospitalFullscreenTopOverlay ?? undefined}
      >
        {hospitalFullscreenMapChildren}
      </FullscreenMapModal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.mainBackground },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, height: 60 },
  backBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { color: '#FFF', fontSize: 18, fontWeight: '800' },
  headerRef: { color: 'rgba(255,255,255,0.45)', fontSize: 11, fontWeight: '700', marginTop: 2 },
  scroll: { flex: 1 },
  section: { marginHorizontal: 20, marginTop: 24 },
  sectionTitle: { color: 'rgba(255,255,255,0.4)', fontSize: 13, fontWeight: '800', marginBottom: 12, letterSpacing: 1 },
  infoCard: { backgroundColor: '#1A1A1A', borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', overflow: 'hidden' },
  patientHeader: { flexDirection: 'row', alignItems: 'center', padding: 20, gap: 16 },
  avatar: { width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 24, fontWeight: 'bold' },
  patientName: { color: '#FFF', fontSize: 20, fontWeight: '800' },
  metaRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  metaText: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.05)', marginHorizontal: 20 },
  descSection: { padding: 20 },
  label: { color: colors.textMuted, fontSize: 12, fontWeight: '800', marginBottom: 8, letterSpacing: 0.5 },
  descText: { color: 'rgba(255,255,255,0.8)', fontSize: 15, lineHeight: 24 },
  addressText: { color: '#FFF', fontSize: 14, fontWeight: '600', flex: 1 },
  unitInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  unitName: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  unitBlockLabel: { color: 'rgba(255,255,255,0.45)', fontSize: 12, fontWeight: '800', letterSpacing: 0.5 },
  unitDetailLine: { color: colors.textMuted, fontSize: 13, marginTop: 4 },
  unitHint: { color: colors.textMuted, fontSize: 12 },
  unitPhone: { color: colors.textMuted, fontSize: 13 },
  unitActions: { flexDirection: 'row', gap: 8 },
  unitBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.03)', justifyContent: 'center', alignItems: 'center' },
  trackingContainer: { marginBottom: 8 },
  mapFullBleed: {
    width: '100%',
    alignSelf: 'stretch',
    overflow: 'hidden',
    backgroundColor: '#111',
    position: 'relative',
  },
  mapFullscreenEntryBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 21,
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  fullscreenBannerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  fullscreenGpsBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.7)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 8,
  },
  liveMap: { flex: 1 },
  /** Bloc sous la carte : infos légères, pas de « carte » UI */
  trackingInfoLite: {
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 0,
    paddingVertical: 4,
    gap: 6,
  },
  infoLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 4,
  },
  infoLineLabel: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
    fontWeight: '600',
    flexShrink: 0,
  },
  infoLineValue: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
    textAlign: 'right',
  },
  infoLineValueEta: {
    color: '#FFF',
    fontSize: 22,
    fontWeight: '800',
    flex: 1,
    textAlign: 'right',
  },
  infoLineHint: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 4,
    marginTop: -2,
  },
  infoHairline: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginVertical: 8,
  },
  coordsMissingBanner: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  coordsMissingText: { color: '#FFF', fontSize: 12, fontWeight: '700', flex: 1 },
  mapStatusBadge: { position: 'absolute', top: 16, left: 16, backgroundColor: 'rgba(0,0,0,0.7)', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, gap: 8 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF5252' },
  liveText: { color: '#FFF', fontSize: 13, fontWeight: '900' },
  stickyFooter: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 20, paddingTop: 16, backgroundColor: colors.mainBackground },
  swipeContainer: { height: 64, width: SWIPE_WIDTH, backgroundColor: '#1A1A1A', borderRadius: 32, padding: 4, justifyContent: 'center', overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  swipeLoading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  swipeBackground: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  swipeText: { color: 'rgba(255,255,255,0.4)', fontSize: 14, fontWeight: '700' },
  swipeThumb: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.success, justifyContent: 'center', alignItems: 'center' },
  refuseBtn: { alignSelf: 'center', marginTop: 12, paddingVertical: 8 },
  refuseText: { color: colors.primary, fontWeight: '800', fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5 },
  admissionBtn: { height: 64, borderRadius: 32, backgroundColor: colors.success, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 12 },
  admissionBtnText: { color: '#000', fontSize: 17, fontWeight: '800' },
  postAcceptHint: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 14,
    paddingHorizontal: 4,
    textAlign: 'center',
  },

  // Modal Style
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  modalKeyboardAvoiding: { width: '100%' },
  modalContent: {
    backgroundColor: '#1A1A1A',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: 24,
    minHeight: 450,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  modalTitle: { color: '#FFF', fontSize: 20, fontWeight: '800' },
  modalSub: { color: 'rgba(255,255,255,0.4)', fontSize: 14, marginBottom: 24 },
  reasonsList: {},
  reasonItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#000', padding: 16, borderRadius: 16, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  reasonItemActive: { borderColor: colors.primary, backgroundColor: 'rgba(255, 59, 48, 0.05)' },
  reasonText: { color: 'rgba(255,255,255,0.6)', fontSize: 15, fontWeight: '600' },
  reasonTextActive: { color: colors.primary, fontWeight: '800' },
  reasonInput: { backgroundColor: '#000', borderRadius: 16, padding: 16, color: '#FFF', fontSize: 15, marginTop: 8, minHeight: 80, textAlignVertical: 'top', borderWidth: 1, borderColor: colors.primary },
  confirmRefusalBtn: { backgroundColor: colors.primary, height: 60, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginTop: 24 },
  confirmRefusalText: { color: '#FFF', fontSize: 16, fontWeight: '900', letterSpacing: 1 }
});
