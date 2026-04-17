import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, StatusBar, Alert, Linking, ActivityIndicator, Dimensions, Platform, LayoutAnimation, UIManager, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Mapbox from '@rnmapbox/maps';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { useActiveMission } from '../../hooks/useActiveMission';
import * as Location from 'expo-location';
import { getRoute, buildRouteFeature, geometryToCameraBounds } from '../../lib/mapbox';
import { MapboxMapView } from '../../components/map/MapboxMapView';
import { MePuck, ProximityCluster } from '../../components/map/mapMarkers';
import { useMapPuckHeading } from '../../hooks/useMapPuckHeading';
import { openExternalDirections } from '../../utils/navigation';
import { formatMissionAddress } from '../../utils/missionAddress';
import { useCallSession } from '../../contexts/CallSessionContext';
import { AppTouchableOpacity } from '../../components/ui/AppTouchableOpacity';
import { startRescuerToCitizenVoipCall, alertVoipError } from '../../lib/rescuerCallCitizen';
import { startSipCall, endSipCall } from '../../lib/sipCall';

// Enable LayoutAnimation
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { width: SCREEN_W } = Dimensions.get('window');

const STATUS_STEPS = [
  { key: 'dispatched', label: 'Dispatché', icon: 'assignment' },
  { key: 'en_route', label: 'En route', icon: 'local-shipping' },
  { key: 'on_scene', label: 'Sur zone', icon: 'place' },
  { key: 'completed', label: 'Terminé', icon: 'check-circle' },
] as const;

// Helper to calculate distance between two points in meters
function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3; // meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

export function MissionActiveScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { activeMission, updateDispatchStatus } = useActiveMission();
  const { minimized: activeCall } = useCallSession();
  
  const [myLocation, setMyLocation] = useState<Location.LocationObject | null>(null);
  const myHeadingDeg = useMapPuckHeading(myLocation);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isCalling, setIsCalling] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isAddressExpanded, setIsAddressExpanded] = useState(false);
  const [mapMode, setMapMode] = useState<'2D' | '3D'>('2D');
  const [zoomLevel, setZoomLevel] = useState(15);
  
  const [routeGeoJSON, setRouteGeoJSON] = useState<GeoJSON.FeatureCollection | null>(null);
  const [routeDuration, setRouteDuration] = useState<number | null>(null);
  const [routeDistance, setRouteDistance] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState('00:00:00');
  const [showCallModal, setShowCallModal] = useState(false);
  
  const lastRouteCoords = useRef<number[][]>([]);
  const lastFetchPos = useRef<[number, number] | null>(null);
  const initialFetchDone = useRef(false);

  const isPhonePulseActive = isCalling || !!activeCall;

  // Real-time Elapsed Time
  useEffect(() => {
    const startTimestamp = activeMission?.dispatched_at || activeMission?.created_at;
    if (!startTimestamp) return;
    const startTime = new Date(startTimestamp).getTime();
    const interval = setInterval(() => {
      const diff = Math.max(0, Date.now() - startTime);
      const hrs = Math.floor(diff / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setElapsedTime(`${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [activeMission?.dispatched_at, activeMission?.created_at]);

  // GPS Tracking
  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 10 },
        (loc) => setMyLocation(loc)
      );
    })();
    return () => sub?.remove();
  }, []);

  // Safety check: if mission is already on_scene, redirect to Signalement
  useEffect(() => {
    if (activeMission?.dispatch_status === 'on_scene' || 
        activeMission?.dispatch_status === 'en_route_hospital' || 
        activeMission?.dispatch_status === 'arrived_hospital' ||
        activeMission?.dispatch_status === 'completed') {
      console.log('[MissionActive] Status is already', activeMission.dispatch_status, '-> Redirecting to Signalement');
      navigation.replace('Signalement', { mission: activeMission });
    }
  }, [activeMission?.dispatch_status]);

  const missionCoords = useMemo(() => {
    if (activeMission?.location?.lat && activeMission?.location?.lng) {
      return [activeMission.location.lng, activeMission.location.lat] as [number, number];
    }
    return null;
  }, [activeMission]);

  // Dynamic Routing Logic (Auto Re-route)
  const fetchRoute = async (force = false) => {
    if (!myLocation || !missionCoords) return;
    const currentPos: [number, number] = [myLocation.coords.longitude, myLocation.coords.latitude];
    
    // Deviation check
    if (!force && lastRouteCoords.current.length > 0) {
      let minD = Infinity;
      for (let i=0; i < lastRouteCoords.current.length; i+=5) { // Sample every 5 pts for perf
        const d = getDistanceMeters(currentPos[1], currentPos[0], lastRouteCoords.current[i][1], lastRouteCoords.current[i][0]);
        if (d < minD) minD = d;
      }
      if (minD < 40) return; // Still on track
    }

    try {
      const result = await getRoute(currentPos, missionCoords, { profile: 'driving-traffic' });
      if (result) {
        setRouteGeoJSON(buildRouteFeature(result.geometry));
        setRouteDuration(result.duration);
        setRouteDistance(result.distance);
        lastRouteCoords.current = result.geometry.coordinates;
        lastFetchPos.current = currentPos;
      }
    } catch (e) { console.error('Route error', e); }
  };

  useEffect(() => { 
    if (myLocation && !initialFetchDone.current) {
      initialFetchDone.current = true;
      fetchRoute(true);
    } else if (myLocation) {
      fetchRoute(); 
    }
  }, [myLocation?.coords.latitude, missionCoords]);

  // Proximity Logic
  const distanceToIncident = useMemo(() => {
    if (!myLocation || !missionCoords) return Infinity;
    return getDistanceMeters(myLocation.coords.latitude, myLocation.coords.longitude, missionCoords[1], missionCoords[0]);
  }, [myLocation, missionCoords]);

  const showProximityCluster = distanceToIncident < 25 && zoomLevel < 18;

  const currentStepIndex = STATUS_STEPS.findIndex(s => s.key === activeMission?.dispatch_status);

  const isLocalNumber = (phone: string | undefined): boolean => {
    if (!phone) return false;
    const clean = phone.replace(/\s/g, '').replace(/-/g, '');
    // DRC prefixes: +243, 00243, or local operators 081, 082, 084, 085, 089, 09
    return clean.startsWith('+243') || clean.startsWith('00243') || /^(081|082|084|085|089|09)/.test(clean);
  };

  const handleNextStatus = async () => {
    const nextStatuses: Record<string, string> = { dispatched: 'en_route', en_route: 'on_scene', on_scene: 'completed' };
    const next = nextStatuses[activeMission?.dispatch_status || ''];
    // No more manual confirmation needed for on-scene transition
    setIsUpdating(true);
    try {
      await updateDispatchStatus(next as any);
      
      if (next === 'on_scene') {
        // Step 1: Force Mapbox to unmount by setting transitioning state
        setIsTransitioning(true);
        // Step 2: Delay to allow Mapbox native engine to cleanup
        await new Promise(r => setTimeout(r, 150));
        // Step 3: Navigate - pass the updated status so it doesn't use stale context
        navigation.replace('Signalement', { mission: { ...activeMission, dispatch_status: 'on_scene' } });
      }
    } catch (err) {
      Alert.alert('Erreur', 'Mise à jour échouée.');
      setIsTransitioning(false);
    } finally {
      setIsUpdating(false);
    }
  };

  const toggleMapMode = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setMapMode(prev => prev === '2D' ? '3D' : '2D');
  };

  const formatDistanceValue = (m: number | null) => {
    if (m === null) return '--';
    return m < 1000 ? `${Math.round(m)} M` : `${(m/1000).toFixed(1)} KM`;
  };

  const formatTimeValue = (seconds: number | null) => {
    if (seconds === null) return '--';
    return `${Math.ceil(seconds / 60)}'`;
  };

  if (!activeMission) return null;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* MAP BOX PRO */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }]}>
        {!isTransitioning && (
          <MapboxMapView 
          style={styles.map} 
          styleURL={Mapbox.StyleURL.Dark} 
          compassEnabled={false}
          scaleBarEnabled={true}
          scaleBarPosition={{ top: 120, left: 16 }}
          onCameraChanged={(e) => {
            if (!isTransitioning) {
              setZoomLevel(e.properties.zoom);
            }
          }}
        >
          <Mapbox.Camera
            followUserLocation={mapMode === '3D'}
            followUserMode={Mapbox.UserTrackingMode.FollowWithCourse}
            pitch={mapMode === '3D' ? 62 : 0}
            heading={mapMode === '3D' ? myHeadingDeg : 0}
            zoomLevel={mapMode === '3D' ? 16.5 : zoomLevel}
            animationMode="flyTo"
            animationDuration={isTransitioning ? 0 : 600}
            defaultSettings={{
              centerCoordinate: missionCoords || undefined,
              zoomLevel: 15,
            }}
            centerCoordinate={
              mapMode === '3D' 
                ? undefined 
                : (distanceToIncident < 400 && myLocation)
                  ? [myLocation.coords.longitude, myLocation.coords.latitude] 
                  : (missionCoords || undefined)
            }
            padding={{ paddingLeft: 40, paddingRight: 40, paddingTop: 180, paddingBottom: 120 }}
            bounds={
              mapMode === '2D' && distanceToIncident > 400 && myLocation && missionCoords
                ? {
                    ne: [
                      Math.max(myLocation.coords.longitude, missionCoords[0]),
                      Math.max(myLocation.coords.latitude, missionCoords[1]),
                    ],
                    sw: [
                      Math.min(myLocation.coords.longitude, missionCoords[0]),
                      Math.min(myLocation.coords.latitude, missionCoords[1]),
                    ],
                  }
                : undefined
            }
          />

          {/* 3D BUILDINGS & SKY */}
          {mapMode === '3D' && (
            <>
              <Mapbox.FillExtrusionLayer
                id="3d-buildings"
                sourceID="composite"
                sourceLayerID="building"
                minZoomLevel={15}
                maxZoomLevel={22}
                filter={['>', 'height', 0]}
                style={{
                  fillExtrusionHeight: ['get', 'height'],
                  fillExtrusionBase: ['get', 'min_height'],
                  fillExtrusionColor: '#333',
                  fillExtrusionOpacity: 0.8,
                }}
              />
              <Mapbox.SkyLayer 
                id="sky" 
                style={{
                  skyType: 'atmosphere',
                  skyAtmosphereColor: '#111',
                }} 
              />
            </>
          )}

          {/* TRAFFIC LAYER */}
          <Mapbox.VectorSource id="traffic" url="mapbox://mapbox.mapbox-traffic-v1" />

          {/* MARKERS */}
          {showProximityCluster && missionCoords ? (
             <Mapbox.PointAnnotation id="proximity" coordinate={missionCoords}>
               <ProximityCluster priority={activeMission.priority || 'medium'} />
             </Mapbox.PointAnnotation>
          ) : (
            <>
              {missionCoords && (
                <Mapbox.PointAnnotation id="incident" coordinate={missionCoords}>
                   <View style={styles.incidentMarkerPulse} />
                </Mapbox.PointAnnotation>
              )}
              {myLocation && (
                <Mapbox.PointAnnotation id="me" coordinate={[myLocation.coords.longitude, myLocation.coords.latitude]}>
                  <MePuck headingDeg={myHeadingDeg} size={36} />
                </Mapbox.PointAnnotation>
              )}
            </>
          )}

          {routeGeoJSON && (
            <Mapbox.ShapeSource id="route-line" shape={routeGeoJSON}>
              <Mapbox.LineLayer id="route-layer" style={{ lineColor: colors.secondary, lineWidth: 6, lineOpacity: 0.9, lineCap: 'round' }} />
            </Mapbox.ShapeSource>
          )}
          </MapboxMapView>
        )}
      </View>

      {/* TOP CONTROLS */}
      <View style={[styles.topControls, { paddingTop: insets.top + 10 }]}>
        <View style={styles.glassStepBar}>
          {STATUS_STEPS.map((step, idx) => (
            <View key={step.key} style={styles.stepCell}>
              <View style={[styles.stepIcon, idx <= currentStepIndex ? { backgroundColor: colors.secondary } : { backgroundColor: '#333' }]}>
                <MaterialIcons name={step.icon} size={13} color="#FFF" />
              </View>
              <Text style={[styles.stepLabel, idx <= currentStepIndex && { color: '#FFF', opacity: 1 }]} numberOfLines={1}>
                {step.label}
              </Text>
              {idx < STATUS_STEPS.length - 1 && <View style={[styles.stepLink, idx < currentStepIndex && { backgroundColor: colors.secondary }]} />}
            </View>
          ))}
        </View>

        {/* ONE ROW INFO PILL: Address | Time | Distance */}
        <AppTouchableOpacity 
          style={styles.unifiedPill} 
          activeOpacity={0.9}
          onPress={() => {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setIsAddressExpanded(!isAddressExpanded);
          }}
        >
          <View style={styles.pillRow}>
            {/* Address Part */}
            <View style={styles.addrSection}>
              <MaterialIcons name="map" size={16} color={colors.secondary} />
              <Text style={styles.pillAddr} numberOfLines={isAddressExpanded ? 0 : 1}>
                {formatMissionAddress(activeMission.location)}
              </Text>
            </View>
            
            <View style={styles.pillSep} />

            {/* Time Part */}
            <View style={styles.statSection}>
              <MaterialIcons name="schedule" size={15} color="#FFF" style={{ opacity: 0.8 }} />
              <Text style={styles.statVal}>{formatTimeValue(routeDuration)}</Text>
            </View>

            <View style={styles.pillSep} />

            {/* Distance Part */}
            <View style={styles.statSection}>
              <MaterialIcons name="straighten" size={15} color="#FFF" style={{ opacity: 0.8 }} />
              <Text style={styles.statVal}>{formatDistanceValue(routeDistance)}</Text>
            </View>
          </View>
        </AppTouchableOpacity>

        {/* ACTION BUTTONS: X above 2D/3D - ALIGNED RIGHT */}
        <View style={styles.actionStack}>
          <AppTouchableOpacity style={styles.sqBtn} onPress={() => navigation.goBack()}>
            <MaterialIcons name="close" size={22} color="#FFF" />
          </AppTouchableOpacity>
          <AppTouchableOpacity style={[styles.sqBtn, mapMode === '3D' && { backgroundColor: colors.secondary }]} onPress={toggleMapMode}>
            <MaterialIcons name={mapMode === '3D' ? 'view-in-ar' : 'map'} size={22} color="#FFF" />
          </AppTouchableOpacity>
        </View>
      </View>

      {/* BOTTOM ACTION PANEL */}
      <View style={[styles.bottomPanel, { paddingBottom: Math.max(insets.bottom, 20) }]}>
        <View style={styles.mainRow}>
          <View style={styles.timeBlock}>
            <Text style={styles.tLabel}>TEMPS ÉCOULÉ</Text>
            <Text style={styles.tValue}>{elapsedTime}</Text>
          </View>
          <AppTouchableOpacity 
            style={[styles.bigBtn, isUpdating && { opacity: 0.6 }]} 
            onPress={handleNextStatus} 
            disabled={isUpdating}
          >
            <Text style={styles.bigBtnText}>
              {activeMission.dispatch_status === 'dispatched' ? 'DÉPART ROUTE' : 
               activeMission.dispatch_status === 'en_route' ? 'ARRIVÉ SUR SITE' : 'TERMINER'}
            </Text>
            <MaterialIcons name="chevron-right" size={24} color="#000" />
          </AppTouchableOpacity>
        </View>

        <View style={styles.callRow}>
          <AppTouchableOpacity style={[styles.callBtn, isPhonePulseActive && { opacity: 0.4 }]} onPress={() => {
             if (isPhonePulseActive) return;
             setIsCalling(true);
             setTimeout(() => setIsCalling(false), 3000);
             navigation.navigate('CallCenter', { target: 'central' });
          }} disabled={isPhonePulseActive}>
            <MaterialIcons name="headset-mic" size={20} color={colors.secondary} />
            <Text style={styles.callBtnText}>CENTRALE</Text>
          </AppTouchableOpacity>
          <AppTouchableOpacity style={[styles.callBtn, isPhonePulseActive && { opacity: 0.4 }]} onPress={async () => {
            if (isPhonePulseActive || !activeMission.caller?.phone || !activeMission.citizen_id) return;
            if (isLocalNumber(activeMission.caller.phone)) {
              setShowCallModal(true);
            } else {
              // High performance direct App Call via Edge Function
              setIsCalling(true);
              try {
                await startRescuerToCitizenVoipCall({
                  incidentId: activeMission.incident_id,
                  citizenId: activeMission.citizen_id,
                  callType: 'audio',
                  patientName: activeMission.caller?.name || 'Patient'
                });
              } catch (err) {
                alertVoipError(err);
              } finally {
                setIsCalling(false);
              }
            }
          }} disabled={isPhonePulseActive}>
            <MaterialIcons name="person" size={20} color={colors.success} />
            <Text style={styles.callBtnText}>PATIENT</Text>
          </AppTouchableOpacity>
        </View>
      </View>

      {/* CALL SELECTION MODAL */}
      <Modal
        visible={showCallModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCallModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <MaterialIcons name="contact-phone" size={32} color={colors.secondary} />
              <Text style={styles.modalTitle}>Appeler le patient</Text>
              <Text style={styles.patientNum}>{activeMission.caller?.phone}</Text>
            </View>

            <View style={styles.modalBody}>
              <AppTouchableOpacity 
                style={[styles.modalBtn, styles.primaryBtn]} 
                onPress={async () => {
                  setShowCallModal(false);
                  if (!activeMission.caller?.phone) {
                    Alert.alert('Erreur', 'Numéro de téléphone non disponible.');
                    return;
                  }
                  navigation.navigate('CallCenter', { 
                    target: 'pbx', 
                    phoneNumber: activeMission.caller.phone,
                    patientName: activeMission.caller.name
                  });
                }}
              >
                <MaterialIcons name="phone" size={24} color="#000" />
                <View style={styles.btnTextSet}>
                  <Text style={[styles.btnTitle, { color: '#000' }]}>Appel Normal</Text>
                  <Text style={[styles.btnSub, { color: 'rgba(0,0,0,0.6)' }]}>Passer par le réseau GSM</Text>
                </View>
              </AppTouchableOpacity>

              <AppTouchableOpacity 
                style={[styles.modalBtn, styles.secondaryBtn]} 
                onPress={async () => {
                  setShowCallModal(false);
                  setIsCalling(true);
                  try {
                    if (!activeMission.citizen_id) {
                      Alert.alert('Erreur', 'Impossible d\'identifier le patient pour l\'appel VoIP.');
                      return;
                    }
                    await startRescuerToCitizenVoipCall({
                      incidentId: activeMission.incident_id,
                      citizenId: activeMission.citizen_id,
                      callType: 'audio',
                      patientName: activeMission.caller?.name || 'Patient'
                    });
                  } catch (err) {
                    alertVoipError(err);
                  } finally {
                    setIsCalling(false);
                  }
                }}
              >
                <MaterialIcons name="headset-mic" size={24} color={colors.secondary} />
                <View style={styles.btnTextSet}>
                  <Text style={[styles.btnTitle, { color: '#FFF' }]}>Appel via App</Text>
                  <Text style={[styles.btnSub, { color: 'rgba(255,255,255,0.6)' }]}>Passer par la VoIP</Text>
                </View>
              </AppTouchableOpacity>

              <AppTouchableOpacity 
                style={styles.cancelBtn} 
                onPress={() => setShowCallModal(false)}
              >
                <Text style={styles.cancelText}>ANNULER L'APPEL</Text>
              </AppTouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  map: { flex: 1 },
  topControls: { position: 'absolute', top: 0, left: 16, right: 16, zIndex: 10 },
  
  // Step Bar
  glassStepBar: { 
    flexDirection: 'row', backgroundColor: 'rgba(20,20,20,0.85)', 
    paddingVertical: 12, paddingHorizontal: 8, borderRadius: 18, marginBottom: 16, 
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 10, elevation: 5
  },
  stepCell: { flex: 1, alignItems: 'center', position: 'relative' },
  stepIcon: { width: 22, height: 22, borderRadius: 7, justifyContent: 'center', alignItems: 'center', zIndex: 2, marginBottom: 4 },
  stepLabel: { color: '#888', fontSize: 9, fontWeight: '700', opacity: 0.7 },
  stepLink: { position: 'absolute', top: 11, left: '50%', right: '-50%', height: 2, backgroundColor: '#333', zIndex: 1 },
  
  // ONE ROW INFO PILL
  unifiedPill: { 
    width: '100%', backgroundColor: 'rgba(15,15,15,0.95)', 
    borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
    shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 15, elevation: 8,
    minHeight: 52, justifyContent: 'center'
  },
  pillRow: { 
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12 
  },
  addrSection: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  pillAddr: { color: '#FFF', fontSize: 13, fontWeight: '700', flex: 1 },
  statSection: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statVal: { color: colors.secondary, fontSize: 12, fontWeight: '900' },
  pillSep: { width: 1, height: 16, backgroundColor: 'rgba(255,255,255,0.2)', marginHorizontal: 12 },
  
  // Vertical Button Stack
  actionStack: { alignItems: 'flex-end', gap: 10, marginTop: 12 },
  sqBtn: { 
    width: 48, height: 48, borderRadius: 16, backgroundColor: 'rgba(30,30,30,0.95)', 
    justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 10, elevation: 6
  },

  bottomPanel: { 
    position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#0A0A0A', 
    padding: 20, borderTopLeftRadius: 30, borderTopRightRadius: 30, borderTopWidth: 1, borderTopColor: '#222' 
  },
  mainRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 15, gap: 15 },
  timeBlock: { flex: 0.8 },
  tLabel: { color: '#666', fontSize: 10, fontWeight: '900' },
  tValue: { color: '#FFF', fontSize: 24, fontWeight: '900', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  bigBtn: { 
    flex: 1.2, height: 56, backgroundColor: colors.success, borderRadius: 16, 
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 15 
  },
  bigBtnText: { fontWeight: '900', fontSize: 13 },
  callRow: { flexDirection: 'row', gap: 10 },
  callBtn: { 
    flex: 1, height: 48, borderRadius: 14, borderWidth: 1, borderColor: '#333', 
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 
  },
  callBtnText: { color: '#FFF', fontSize: 12, fontWeight: '800' },

  incidentMarkerPulse: {
    width: 14, height: 14, borderRadius: 7, backgroundColor: colors.primary,
    borderWidth: 2, borderColor: '#FFF',
    shadowColor: colors.primary, shadowOpacity: 0.8, shadowRadius: 10, elevation: 10
  },

  // Modal Styles
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', 
    justifyContent: 'center', alignItems: 'center', padding: 20 
  },
  modalContent: {
    width: '100%', maxWidth: 340, backgroundColor: '#1A1A1A', 
    borderRadius: 28, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    padding: 24, shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 30, elevation: 15
  },
  modalHeader: { alignItems: 'center', marginBottom: 24, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)', paddingBottom: 20 },
  modalTitle: { color: '#FFF', fontSize: 22, fontWeight: '900', marginTop: 12 },
  patientNum: { color: colors.secondary, fontSize: 18, fontWeight: '900', marginTop: 4, letterSpacing: 1 },
  modalBody: { gap: 14 },
  modalBtn: { 
    flexDirection: 'row', alignItems: 'center', padding: 18, borderRadius: 20, gap: 16 
  },
  primaryBtn: { backgroundColor: colors.success },
  secondaryBtn: { backgroundColor: 'rgba(68, 138, 255, 0.15)', borderWidth: 1, borderColor: 'rgba(68, 138, 255, 0.3)' },
  btnTextSet: { flex: 1 },
  btnTitle: { fontSize: 16, fontWeight: '900', color: '#000' },
  btnSub: { fontSize: 12, color: 'rgba(0,0,0,0.7)', fontWeight: '700', marginTop: 1 },
  cancelBtn: { 
    paddingVertical: 14, alignItems: 'center', marginTop: 8, 
    borderRadius: 16, backgroundColor: 'rgba(211, 47, 47, 0.12)', borderWidth: 1, borderColor: 'rgba(211, 47, 47, 0.3)' 
  },
  cancelText: { color: '#FF5252', fontSize: 13, fontWeight: '900', letterSpacing: 2, opacity: 0.9 },
});
