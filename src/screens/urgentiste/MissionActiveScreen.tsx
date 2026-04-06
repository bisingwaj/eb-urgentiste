import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, StatusBar, Alert, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Mapbox from '@rnmapbox/maps';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { useActiveMission } from '../../hooks/useActiveMission';
import * as Location from 'expo-location';
import { getRoute, buildRouteFeature, geometryToCameraBounds } from '../../lib/mapbox';
import { MapboxMapView } from '../../components/map/MapboxMapView';
import { openExternalDirections } from '../../utils/navigation';

const STATUS_STEPS = [
  { key: 'dispatched', label: 'Dispatché', icon: 'assignment', color: '#FF9500' },
  { key: 'en_route', label: 'En route', icon: 'local-shipping', color: colors.secondary },
  { key: 'on_scene', label: 'Sur zone', icon: 'place', color: '#FF3B30' },
  { key: 'en_route_hospital', label: 'Vers hôpital', icon: 'local-hospital', color: '#FF9500' },
  { key: 'arrived_hospital', label: 'À l\'hôpital', icon: 'domain', color: '#30D158' },
  { key: 'completed', label: 'Terminé', icon: 'check-circle', color: '#30D158' },
] as const;

export function MissionActiveScreen({ navigation }: any) {
  const { activeMission, updateDispatchStatus } = useActiveMission();
  const [noteText, setNoteText] = useState('');
  const [notes, setNotes] = useState<{ text: string; time: string }[]>([]);
  const [myLocation, setMyLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [routeGeoJSON, setRouteGeoJSON] = useState<GeoJSON.FeatureCollection | null>(null);
  const [routeDuration, setRouteDuration] = useState<number | null>(null);
  const [routeDistance, setRouteDistance] = useState<number | null>(null);
  const lastRouteFetch = useRef<number>(0);

  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        setMyLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
        sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, distanceInterval: 10 },
          (newLoc) => {
            setMyLocation({ latitude: newLoc.coords.latitude, longitude: newLoc.coords.longitude });
          }
        );
      } catch (err) {
        console.warn('[Location] Position indisponible sur cet appareil:', err);
      }
    })();
    return () => { if (sub) sub.remove(); };
  }, []);

  const missionLat = activeMission?.location?.lat;
  const missionLng = activeMission?.location?.lng;

  useEffect(() => {
    if (!myLocation || !missionLat || !missionLng) return;
    const now = Date.now();
    if (now - lastRouteFetch.current < 15000 && routeGeoJSON) return;
    lastRouteFetch.current = now;
    getRoute(
      [myLocation.longitude, myLocation.latitude],
      [missionLng, missionLat],
      { profile: 'driving-traffic' },
    ).then((result) => {
      if (result) {
        setRouteGeoJSON(buildRouteFeature(result.geometry));
        setRouteDuration(result.duration);
        setRouteDistance(result.distance);
      }
    });
  }, [myLocation?.latitude, myLocation?.longitude, missionLat, missionLng]);

  // Si pas de mission active, revenir en arrière
  useEffect(() => {
    if (!activeMission) {
      const timer = setTimeout(() => navigation.goBack(), 500);
      return () => clearTimeout(timer);
    }
  }, [activeMission]);

  const incidentCoords =
    activeMission?.location?.lat != null && activeMission?.location?.lng != null
      ? { latitude: activeMission.location.lat, longitude: activeMission.location.lng }
      : null;

  const mapCenter = incidentCoords || myLocation || { latitude: -4.3224, longitude: 15.3070 };

  const routeCameraBounds = useMemo(() => {
    if (!routeGeoJSON?.features[0]?.geometry) return null;
    return geometryToCameraBounds(routeGeoJSON.features[0].geometry as GeoJSON.LineString, 80);
  }, [routeGeoJSON]);

  const cameraBounds = useMemo(() => {
    if (!myLocation || !incidentCoords) return null;
    const padding = 80;
    return {
      ne: [Math.max(myLocation.longitude, incidentCoords.longitude), Math.max(myLocation.latitude, incidentCoords.latitude)] as [number, number],
      sw: [Math.min(myLocation.longitude, incidentCoords.longitude), Math.min(myLocation.latitude, incidentCoords.latitude)] as [number, number],
      paddingTop: padding, paddingBottom: padding, paddingLeft: padding, paddingRight: padding,
    };
  }, [myLocation?.latitude, myLocation?.longitude, incidentCoords?.latitude, incidentCoords?.longitude]);

  const mapCameraBounds = useMemo(() => routeCameraBounds ?? cameraBounds, [routeCameraBounds, cameraBounds]);

  if (!activeMission) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <StatusBar barStyle="light-content" />
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <MaterialCommunityIcons name="check-circle-outline" color="#30D158" size={64} />
          <Text style={{ color: '#FFF', fontSize: 20, fontWeight: '700', marginTop: 20 }}>Aucune mission active</Text>
          <Text style={{ color: 'rgba(255,255,255,0.4)', marginTop: 8 }}>Retour à l'accueil...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const currentStepIndex = STATUS_STEPS.findIndex(s => s.key === activeMission.dispatch_status);

  const priorityConfig = {
    critical: { label: 'URGENCE CRITIQUE', color: '#FF3B30', bg: '#FF3B3020' },
    high: { label: 'URGENCE HAUTE', color: '#FF9500', bg: '#FF950020' },
    medium: { label: 'URGENCE MOYENNE', color: '#FFCC00', bg: '#FFCC0020' },
    low: { label: 'URGENCE BASSE', color: '#30D158', bg: '#30D15820' },
  };

  const priority = priorityConfig[activeMission.priority] || priorityConfig.medium;

  // Calculer la distance approximative
  const getDistance = () => {
    if (!myLocation || !incidentCoords) return null;
    const R = 6371;
    const dLat = (incidentCoords.latitude - myLocation.latitude) * Math.PI / 180;
    const dLon = (incidentCoords.longitude - myLocation.longitude) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(myLocation.latitude * Math.PI / 180) * Math.cos(incidentCoords.latitude * Math.PI / 180) *
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return (R * c).toFixed(1);
  };

  const straightLineDistance = getDistance();
  const distance = routeDistance != null ? (routeDistance / 1000).toFixed(1) : straightLineDistance;
  const eta = routeDuration != null ? `${Math.ceil(routeDuration / 60)} min` : null;

  const handleAddNote = () => {
    if (noteText.trim() === '') return;
    const now = new Date();
    setNotes([...notes, { text: noteText, time: `${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')}` }]);
    setNoteText('');
  };

  const handleNextStatus = async () => {
    const nextStatuses: Record<string, 'en_route' | 'on_scene' | 'en_route_hospital' | 'arrived_hospital' | 'completed'> = {
      dispatched: 'en_route',
      en_route: 'on_scene',
      on_scene: 'completed',
      en_route_hospital: 'arrived_hospital',
      arrived_hospital: 'completed',
    };
    const next = nextStatuses[activeMission.dispatch_status];
    if (!next) return;

    const labels: Record<string, string> = {
      en_route: 'Confirmer le départ en route ?',
      on_scene: "Confirmer l'arrivée sur zone ?",
      completed: 'Marquer la mission comme terminée ?',
      arrived_hospital: "Confirmer l'arrivée à l'hôpital ?",
    };

    Alert.alert('Changement de statut', labels[next], [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Confirmer',
        style: 'default',
        onPress: async () => {
          setIsUpdating(true);
          try {
            await updateDispatchStatus(next);
            setNotes(prev => [...prev, { text: `Statut → ${next.toUpperCase()}`, time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) }]);
          } catch (err) {
            Alert.alert('Erreur', 'Impossible de mettre à jour le statut.');
          }
          setIsUpdating(false);
        },
      },
    ]);
  };

  const openNavigation = () => {
    if (!incidentCoords) return;
    openExternalDirections(incidentCoords.latitude, incidentCoords.longitude, activeMission?.title ?? undefined);
  };

  const callVictim = () => {
    if (activeMission.caller?.phone && activeMission.caller.phone !== '-') {
      Linking.openURL(`tel:${activeMission.caller.phone}`);
    }
  };

  const nextStatusLabel: Record<string, string> = {
    dispatched: '🚗  DÉPART EN ROUTE',
    en_route: '📍  ARRIVÉ SUR ZONE',
    on_scene: '✅  MISSION TERMINÉE',
    en_route_hospital: '🏥  ARRIVÉ À L\'HÔPITAL',
    arrived_hospital: '✅  CLÔTURER LA MISSION',
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" />
      
      <View style={styles.topHeader}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" color="#FFF" size={24} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 16 }}>
             <Text style={styles.greetingText}>MISSION {activeMission.reference}</Text>
             <Text style={styles.hospitalName}>{activeMission.type || 'Intervention'}</Text>
          </View>
          <View style={[styles.priorityChip, { backgroundColor: priority.bg }]}>
            <View style={[styles.priorityDot, { backgroundColor: priority.color }]} />
            <Text style={[styles.priorityChipText, { color: priority.color }]}>{priority.label}</Text>
          </View>
        </View>
      </View>

      <View style={{ flex: 1 }}>
        {/* MAP */}
        <View style={styles.mapContainer}>
          <MapboxMapView style={styles.map} styleURL={Mapbox.StyleURL.Dark} compassEnabled={false} scaleBarEnabled={false}>
            {mapCameraBounds ? (
              <Mapbox.Camera
                bounds={mapCameraBounds}
                animationMode="flyTo"
                animationDuration={1000}
              />
            ) : (
              <Mapbox.Camera
                centerCoordinate={[mapCenter.longitude, mapCenter.latitude]}
                zoomLevel={14}
              />
            )}

            {incidentCoords && (
              <Mapbox.PointAnnotation id="incident" coordinate={[incidentCoords.longitude, incidentCoords.latitude]}>
                <View style={styles.incidentMarker}>
                  <View style={styles.incidentMarkerDot} />
                </View>
              </Mapbox.PointAnnotation>
            )}

            {myLocation && (
              <Mapbox.PointAnnotation id="my-location" coordinate={[myLocation.longitude, myLocation.latitude]}>
                <View style={styles.myMarker}>
                  <View style={styles.myMarkerDot} />
                </View>
              </Mapbox.PointAnnotation>
            )}

            {routeGeoJSON && (
              <Mapbox.ShapeSource id="route-mission" shape={routeGeoJSON}>
                <Mapbox.LineLayer id="route-mission-line" style={{ lineColor: '#4A90D9', lineWidth: 4, lineOpacity: 0.85 }} />
              </Mapbox.ShapeSource>
            )}
          </MapboxMapView>

          {/* HUD Overlay */}
          <View style={styles.hudOverlay}>
            <View style={styles.hudLeft}>
               <Text style={styles.victimLabel}>{activeMission.caller?.name !== 'Anonyme' ? 'VICTIME IDENTIFIÉE' : 'VICTIME ANONYME'}</Text>
               <Text style={styles.victimName}>{activeMission.caller?.name || 'Inconnu'}</Text>
               {activeMission.caller?.phone && activeMission.caller.phone !== '-' && (
                 <TouchableOpacity onPress={callVictim} style={styles.phoneChip}>
                   <MaterialIcons name="phone" color="#30D158" size={12} />
                   <Text style={styles.phoneText}>{activeMission.caller.phone}</Text>
                 </TouchableOpacity>
               )}
            </View>
            <View style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
               <Text style={styles.hudDistanceText}>{distance || '—'}</Text>
               <Text style={styles.hudDistanceLabel}>{eta ? `KM • ${eta}` : 'KM'}</Text>
            </View>
          </View>
        </View>

        {/* BOTTOM PANEL */}
        <View style={styles.bottomControls}>
          {/* Status Progress */}
          <View style={styles.statusProgress}>
            {STATUS_STEPS.map((step, idx) => (
              <View key={step.key} style={styles.stepItem}>
                <View style={[
                  styles.stepDot,
                  { backgroundColor: idx <= currentStepIndex ? step.color : '#333' }
                ]}>
                  <MaterialIcons name={step.icon} color={idx <= currentStepIndex ? '#FFF' : '#666'} size={14} />
                </View>
                <Text style={[
                  styles.stepLabel,
                  { color: idx <= currentStepIndex ? '#FFF' : '#555' }
                ]}>{step.label}</Text>
                {idx < STATUS_STEPS.length - 1 && (
                  <View style={[styles.stepLine, { backgroundColor: idx < currentStepIndex ? step.color : '#333' }]} />
                )}
              </View>
            ))}
          </View>

          {/* Location info */}
          <View style={styles.locationInfo}>
            <MaterialIcons name="place" size={16} color="rgba(255,255,255,0.4)" />
            <Text style={styles.locationText} numberOfLines={2}>
              {typeof activeMission.location === 'string'
                ? activeMission.location
                : activeMission.location?.address || 'Adresse non disponible'}
            </Text>
          </View>

          {/* Description */}
          {activeMission.description && (
            <View style={styles.descriptionBox}>
              <Text style={styles.descriptionText} numberOfLines={3}>{activeMission.description}</Text>
            </View>
          )}

          {/* Journal */}
          {notes.length > 0 && (
            <View style={styles.journalContainer}>
              <Text style={styles.journalHeader}>JOURNAL</Text>
              <ScrollView style={{ maxHeight: 80 }}>
                {notes.map((n, i) => (
                  <View key={i} style={styles.noteItem}>
                    <Text style={styles.noteTime}>{n.time}</Text>
                    <Text style={styles.noteBody}>{n.text}</Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Note input */}
          <View style={styles.inputBox}>
            <TextInput
              style={styles.textInput}
              placeholder="Note d'intervention..."
              placeholderTextColor="rgba(255,255,255,0.25)"
              value={noteText}
              onChangeText={setNoteText}
            />
            <TouchableOpacity style={styles.sendBtn} onPress={handleAddNote}>
              <MaterialIcons name="send" color="#FFF" size={18} />
            </TouchableOpacity>
          </View>

          {/* Action Buttons */}
          <View style={styles.actionGrid}>
            <TouchableOpacity style={styles.roundActionBtn} onPress={callVictim}>
               <MaterialIcons name="phone" color="#30D158" size={24} />
               <Text style={styles.actionLabel}>Appeler</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.roundActionBtn} onPress={openNavigation}>
               <MaterialIcons name="navigation" color={colors.secondary} size={24} />
               <Text style={styles.actionLabel}>GPS</Text>
            </TouchableOpacity>

            {activeMission.dispatch_status !== 'completed' && (
              <TouchableOpacity
                style={[styles.mainActionBtn, isUpdating && { opacity: 0.5 }]}
                onPress={handleNextStatus}
                disabled={isUpdating}
              >
                <Text style={styles.mainActionText}>
                  {nextStatusLabel[activeMission.dispatch_status] || '✅  TERMINÉ'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.mainBackground },
  topHeader: { 
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 18,
    borderBottomLeftRadius: 32, borderBottomRightRadius: 32,
    backgroundColor: '#0A0A0A',
  },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  backBtn: { 
    width: 44, height: 44, borderRadius: 16, backgroundColor: '#1A1A1A',
    justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  greetingText: { color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  hospitalName: { color: '#FFF', fontSize: 20, fontWeight: '700', marginTop: 2 },
  priorityChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, gap: 6 },
  priorityDot: { width: 6, height: 6, borderRadius: 3 },
  priorityChipText: { fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },

  mapContainer: { flex: 3 },
  map: { width: '100%', height: '100%' },
  myMarker: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(21,100,191,0.25)',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: '#1564bf',
  },
  myMarkerDot: {
    width: 14, height: 14, borderRadius: 7, backgroundColor: '#1564bf',
  },
  incidentMarker: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(255,59,48,0.25)',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: '#FF3B30',
  },
  incidentMarkerDot: {
    width: 14, height: 14, borderRadius: 7, backgroundColor: '#FF3B30',
  },

  hudOverlay: { 
    position: 'absolute', top: 16, left: 16, right: 16, 
    backgroundColor: 'rgba(10,10,10,0.92)', padding: 18, borderRadius: 24,
    flexDirection: 'row', justifyContent: 'space-between',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  hudLeft: { flex: 1 },
  victimLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 9, fontWeight: '800', letterSpacing: 1.5, marginBottom: 4 },
  victimName: { color: '#FFF', fontWeight: '900', fontSize: 17 },
  phoneChip: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  phoneText: { color: '#30D158', fontSize: 12, fontWeight: '700' },
  hudDistanceText: { color: colors.secondary, fontSize: 30, fontWeight: '900' },
  hudDistanceLabel: { color: 'rgba(255,255,255,0.3)', fontSize: 11, fontWeight: '800', marginTop: 2 },

  bottomControls: { 
    flex: 4, backgroundColor: '#0F0F0F', 
    borderTopLeftRadius: 32, borderTopRightRadius: 32,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
    paddingTop: 16, paddingHorizontal: 16,
  },

  // Status progress
  statusProgress: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingHorizontal: 4 },
  stepItem: { alignItems: 'center', flex: 1, position: 'relative' },
  stepDot: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  stepLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  stepLine: { position: 'absolute', top: 14, left: '60%', right: '-40%', height: 2 },

  locationInfo: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 12, paddingHorizontal: 4 },
  locationText: { color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: '500', flex: 1 },

  descriptionBox: { backgroundColor: '#1A1A1A', borderRadius: 16, padding: 14, marginBottom: 12 },
  descriptionText: { color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: '500', lineHeight: 19 },

  journalContainer: { backgroundColor: '#1A1A1A', borderRadius: 16, padding: 14, marginBottom: 12 },
  journalHeader: { color: 'rgba(255,255,255,0.3)', fontSize: 9, fontWeight: '900', letterSpacing: 1.5, marginBottom: 8 },
  noteItem: { flexDirection: 'row', gap: 10, marginBottom: 6 },
  noteTime: { color: 'rgba(255,255,255,0.3)', fontSize: 11, fontWeight: '700', width: 42 },
  noteBody: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '500', flex: 1 },

  inputBox: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  textInput: { flex: 1, backgroundColor: '#1A1A1A', borderRadius: 16, paddingHorizontal: 16, height: 44, color: '#FFF', fontSize: 13, fontWeight: '600' },
  sendBtn: { width: 44, height: 44, borderRadius: 16, backgroundColor: colors.secondary, justifyContent: 'center', alignItems: 'center' },

  actionGrid: { flexDirection: 'row', gap: 10, paddingBottom: 20, alignItems: 'center' },
  roundActionBtn: { 
    width: 64, height: 64, borderRadius: 20, backgroundColor: '#1A1A1A',
    justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  actionLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 9, fontWeight: '700', marginTop: 4 },
  mainActionBtn: {
    flex: 1, height: 56, borderRadius: 20, backgroundColor: colors.secondary,
    justifyContent: 'center', alignItems: 'center',
  },
  mainActionText: { color: '#FFF', fontSize: 14, fontWeight: '900', letterSpacing: 0.5 },
});
