import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, StatusBar, Animated, Alert, ActivityIndicator, Modal, Dimensions, Platform, ScrollView } from 'react-native';
import { TabScreenSafeArea } from '../../components/layout/TabScreenSafeArea';
import { colors } from '../../theme/colors';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useActiveMission } from '../../hooks/useActiveMission';
import { useLocationTracking } from '../../hooks/useLocationTracking';
import { useNotifications } from '../../hooks/useNotifications';
import { useCallSession } from '../../contexts/CallSessionContext';
import { supabase } from '../../lib/supabase';
import { AppTouchableOpacity } from '../../components/ui/AppTouchableOpacity';
import * as Location from 'expo-location';
import Mapbox from '@rnmapbox/maps';
import { Navigation2, Activity } from 'lucide-react-native';
import {
  getRouteWithAlternatives,
  buildRouteFeature,
  geometryToCameraBounds
} from '../../lib/mapbox';

const { width } = Dimensions.get('window');

// Helper component for pulsing the radar core
const PulseRadar = ({ isActive }: { isActive: boolean }) => {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    if (isActive) {
      Animated.loop(
        Animated.parallel([
          Animated.timing(scale, {
            toValue: 2.2,
            duration: 2000,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0,
            duration: 2000,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      scale.stopAnimation();
      opacity.stopAnimation();
      scale.setValue(1);
      opacity.setValue(0);
    }
  }, [isActive]);

  return (
    <View style={styles.radarContainer}>
      {isActive && (
        <Animated.View style={[styles.radarWave, { transform: [{ scale }], opacity }]} />
      )}
      <View style={[styles.radarCore, isActive ? { backgroundColor: colors.success } : { backgroundColor: colors.textMuted }]}>
        {isActive ? (
          <MaterialCommunityIcons name="radar" size={48} color="#FFF" />
        ) : (
          <MaterialIcons name="portable-wifi-off" size={44} color="#FFF" />
        )}
      </View>
    </View>
  );
};

// Minimal Alert Pulse for Minimized Dashboard
const AlertPulseIcon = () => {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    Animated.loop(
      Animated.parallel([
        Animated.timing(scale, { toValue: 2.2, duration: 2000, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 2000, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <View style={styles.alertIconPulseContainer}>
      <Animated.View style={[styles.alertRadarWave, { transform: [{ scale }], opacity }]} />
      <MaterialIcons
        name="warning"
        size={46}
        color={colors.primary}
        style={{ marginTop: -5 }} // Nudge up for optical centering
      />
    </View>
  );
};

export function HomeTab({ navigation }: any) {
  const { profile, refreshProfile } = useAuth();
  const { activeMission, isLoading: missionLoading, updateDispatchStatus } = useActiveMission();
  const { unreadCount } = useNotifications();
  const { minimized: activeCall } = useCallSession();

  // Initialize background location tracking (from main)
  useLocationTracking();

  const [isDutyActive, setIsDutyActive] = useState(profile?.available ?? false);
  const [unitName, setUnitName] = useState<string | null>(null);

  // Status Hold Action Animation
  const holdProgress = useRef(new Animated.Value(0)).current;
  const confirmProgress = useRef(new Animated.Value(0)).current; // For mission confirmation
  const [isHolding, setIsHolding] = useState(false);
  const [isCalling, setIsCalling] = useState(false);
  const callPulseAnim = useRef(new Animated.Value(0)).current;
  const [isModalMinimized, setIsModalMinimized] = useState(false);
  const [userLocation, setUserLocation] = useState<Location.LocationObject | null>(null);
  const [showMapPreview, setShowMapPreview] = useState(false);
  const [showSymptoms, setShowSymptoms] = useState(false);
  const [routeFeature, setRouteFeature] = useState<GeoJSON.FeatureCollection | null>(null);
  const [routeBounds, setRouteBounds] = useState<any>(null);

  useEffect(() => {
    if (profile) setIsDutyActive(profile.available);
  }, [profile?.available]);

  useEffect(() => {
    if (!activeMission || activeMission.dispatch_status === 'completed') {
      setIsModalMinimized(false);
    }
  }, [activeMission?.id, activeMission?.dispatch_status]);

  useEffect(() => {
    let cancelled = false;
    async function loadUnitName() {
      if (!profile?.assigned_unit_id) {
        setUnitName('Non assignée');
        return;
      }
      const { data, error } = await supabase
        .from('units')
        .select('callsign, vehicle_type, type')
        .eq('id', profile.assigned_unit_id)
        .maybeSingle();

      if (cancelled) return;
      if (error || !data) {
        setUnitName('Non assignée');
        return;
      }
      setUnitName(data.callsign || data.vehicle_type || data.type || 'Unité');
    }
    void loadUnitName();
    return () => { cancelled = true; };
  }, [profile?.assigned_unit_id]);

  const toggleDuty = async (newVal: boolean) => {
    setIsDutyActive(newVal);
    if (profile?.id) {
      const { error } = await supabase
        .from('users_directory')
        .update({ available: newVal, status: newVal ? 'active' : 'offline' })
        .eq('id', profile.id);

      if (error) {
        Alert.alert('Erreur', 'Impossible de modifier le statut de service.');
        setIsDutyActive(!newVal);
      } else {
        refreshProfile();
      }
    }
  };

  const handlePressIn = () => {
    setIsHolding(true);
    holdProgress.setValue(0);
    Animated.timing(holdProgress, {
      toValue: 1,
      duration: 1000,
      useNativeDriver: true
    }).start();
    // Logic is now centralized in handlePressOut to avoid race conditions
  };

  const handlePressOut = () => {
    setIsHolding(false);
    holdProgress.stopAnimation((val) => {
      if (val >= 0.98) {
        // Success: threshold reached
        toggleDuty(!isDutyActive);
        // Reset immediately to 0
        holdProgress.setValue(0);
      } else if (val > 0) {
        // Failure: release before 100%, smooth bounce back
        Animated.timing(holdProgress, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true
        }).start();
      } else {
        // Already at 0
        holdProgress.setValue(0);
      }
    });
  };

  const handleConfirmPressIn = () => {
    confirmProgress.setValue(0);
    Animated.timing(confirmProgress, {
      toValue: 1,
      duration: 800, // Slightly faster than duty toggle for better responsiveness
      useNativeDriver: true
    }).start();
  };

  const handleConfirmPressOut = () => {
    confirmProgress.stopAnimation((val) => {
      if (val >= 0.95) {
        // SUCCESS
        confirmProgress.setValue(0);
        setIsModalMinimized(true);
        navigation.navigate('Signalement', { mission: activeMission });
      } else {
        // RESET
        Animated.timing(confirmProgress, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true
        }).start();
      }
    });
  };

  // Fetch user location for distance calculation
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

  // Fetch itinerary route for map preview
  useEffect(() => {
    if (showMapPreview && userLocation && activeMission?.location?.lat && activeMission?.location?.lng) {
      let cancelled = false;
      const origin: [number, number] = [userLocation.coords.longitude, userLocation.coords.latitude];
      const destination: [number, number] = [activeMission.location.lng, activeMission.location.lat];

      (async () => {
        try {
          const result = await getRouteWithAlternatives(origin, destination);
          if (cancelled || !result) return;

          const feature = buildRouteFeature(result.primary.geometry);
          const bounds = geometryToCameraBounds(result.primary.geometry, 80);

          setRouteFeature(feature);
          setRouteBounds(bounds);
        } catch (err) {
          console.error('[MapRoute] Error fetching route:', err);
        }
      })();

      return () => { cancelled = true; };
    } else if (!showMapPreview) {
      setRouteFeature(null);
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
      activeMission.sos_responses?.find(r =>
        keys.includes(r.question_key) ||
        r.question_text?.toLowerCase().includes(textMatch.toLowerCase())
      )?.answer;

    const age = findResp(['age', 'age_approx', 'Tranche d’âge'], 'âge');
    const gender = findResp(['sexe', 'gender', 'Sexe'], 'sexe');
    const height = findResp(['taille', 'height', 'Taille'], 'taille');

    return {
      age: age && age !== '—' ? age : null,
      gender: gender && gender !== '—' ? gender : null,
      height: height && height !== '—' ? height : null
    };
  };

  const capitalize = (str?: string) => {
    if (!str) return 'ANONYME';
    return str.toUpperCase();
  };

  const isPhonePulseActive = isCalling || !!activeCall;

  useEffect(() => {
    let anim: Animated.CompositeAnimation | null = null;
    if (isPhonePulseActive) {
      anim = Animated.loop(
        Animated.sequence([
          Animated.timing(callPulseAnim, { toValue: 1, duration: 1000, useNativeDriver: false }),
          Animated.timing(callPulseAnim, { toValue: 0, duration: 1000, useNativeDriver: false })
        ])
      );
      anim.start();
    } else {
      callPulseAnim.setValue(0);
    }
    return () => {
      if (anim) anim.stop();
    };
  }, [isPhonePulseActive]);

  const callBgPulse = callPulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.success + '15', '#000000']
  });

  const handleCallCentral = () => {
    if (isPhonePulseActive) return;
    setIsCalling(true);
    
    // Safety timeout to reset isCalling if navigation fails, 
    // but the pulse will continue anyway if activeCall is set.
    setTimeout(() => setIsCalling(false), 3000);

    if (activeCall) {
      navigation.navigate('CallCenter', { resume: true });
    } else {
      navigation.navigate('CallCenter');
    }
  };

  const hasActiveAlert = !!activeMission && activeMission.dispatch_status !== 'completed';

  const isMissionAccepted = hasActiveAlert && activeMission?.dispatch_status !== 'dispatched';

  return (
    <TabScreenSafeArea style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#050505" />

      {/* MAP PREVIEW MODAL */}
      <Modal visible={showMapPreview} animationType="slide" transparent={false}>
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <Mapbox.MapView style={{ flex: 1 }} styleURL={Mapbox.StyleURL.Dark}>
            {routeBounds ? (
              <Mapbox.Camera
                bounds={routeBounds}
                animationDuration={1000}
              />
            ) : (
              <Mapbox.Camera
                zoomLevel={14}
                centerCoordinate={
                  activeMission?.location?.lng != null && activeMission?.location?.lat != null
                    ? [activeMission.location.lng, activeMission.location.lat]
                    : [15.3070, -4.3224]
                }
              />
            )}

            {routeFeature && (
              <Mapbox.ShapeSource id="previewRouteSource" shape={routeFeature}>
                <Mapbox.LineLayer
                  id="previewRouteLayer"
                  style={{
                    lineColor: colors.secondary,
                    lineWidth: 4,
                    lineCap: 'round',
                    lineJoin: 'round',
                    lineOpacity: 0.8
                  }}
                />
              </Mapbox.ShapeSource>
            )}

            {activeMission?.location?.lng != null && activeMission?.location?.lat != null && (
              <Mapbox.PointAnnotation id="victim" coordinate={[activeMission.location.lng, activeMission.location.lat]}>
                <View style={[styles.victimMarker, { backgroundColor: colors.markerIncident }]}>
                  <Activity size={18} color="#FFF" />
                </View>
              </Mapbox.PointAnnotation>
            )}
            {userLocation && (
              <Mapbox.PointAnnotation id="me" coordinate={[userLocation.coords.longitude, userLocation.coords.latitude]}>
                <View style={[styles.meMarker, { backgroundColor: colors.markerMe }]}>
                  <Navigation2 size={16} color="#FFF" style={{ transform: [{ rotate: '45deg' }] }} />
                </View>
              </Mapbox.PointAnnotation>
            )}
          </Mapbox.MapView>
          <AppTouchableOpacity style={styles.closeMapBtn} onPress={() => setShowMapPreview(false)}>
            <MaterialIcons name="close" size={28} color="#FFF" />
          </AppTouchableOpacity>
        </View>
      </Modal>

      {/* EMERGENCY DASHBOARD MODAL */}
      <Modal
        visible={hasActiveAlert && !isModalMinimized}
        animationType="fade"
        presentationStyle="overFullScreen"
        transparent={false}
      >
        <View style={styles.missionModalContainer}>
          <View style={styles.missionModalHeader}>
            <View style={styles.headerTopRow}>
              <View style={styles.refBadge}>
                <Text style={styles.refBadgeTxt}>REF: {activeMission?.reference || '---'}</Text>
              </View>
              <AppTouchableOpacity
                style={styles.minimizeBtnDashboard}
                onPress={() => setIsModalMinimized(true)}
              >
                <MaterialIcons name="keyboard-arrow-down" size={28} color="#FFF" />
              </AppTouchableOpacity>
            </View>

            <View style={styles.urgentHeaderRow}>
              <MaterialIcons name="warning" size={28} color={colors.primary} />
              <Text style={styles.urgentTitle}>MISSION ASSIGNÉE</Text>
            </View>
          </View>

          <ScrollView style={styles.dashboardScroll} showsVerticalScrollIndicator={false}>
            {/* CARD 1: WHO (Identity) */}
            <View style={styles.dashboardCard}>
              <View style={styles.cardHeaderRow}>
                <MaterialIcons name="person" size={20} color={colors.secondary} />
                <Text style={styles.cardLabel}>IDENTITÉ PATIENT</Text>
              </View>
              <Text style={styles.victimNamePrimary}>{capitalize(activeMission?.caller?.name)}</Text>

              {(getVictimMetadata().age || getVictimMetadata().gender || getVictimMetadata().height) && (
                <View style={styles.victimMetaRow}>
                  {getVictimMetadata().age && (
                    <View style={styles.metaBadge}>
                      <Text style={styles.metaBadgeLbl}>ÂGE</Text>
                      <Text style={styles.metaBadgeVal}>{getVictimMetadata().age}</Text>
                    </View>
                  )}
                  {getVictimMetadata().gender && (
                    <View style={styles.metaBadge}>
                      <Text style={styles.metaBadgeLbl}>SEXE</Text>
                      <Text style={styles.metaBadgeVal}>{getVictimMetadata().gender}</Text>
                    </View>
                  )}
                  {getVictimMetadata().height && (
                    <View style={styles.metaBadge}>
                      <Text style={styles.metaBadgeLbl}>TAILLE</Text>
                      <Text style={styles.metaBadgeVal}>{getVictimMetadata().height}</Text>
                    </View>
                  )}
                </View>
              )}
            </View>

            {/* CARD 2: WHERE (Location) */}
            <View style={styles.dashboardCard}>
              <View style={styles.cardHeaderRow}>
                <MaterialIcons name="place" size={20} color={colors.secondary} />
                <Text style={styles.cardLabel}>LOCALISATION & NAVIGATION</Text>
              </View>
              <Text style={styles.locationAddrTxt}>{activeMission?.location?.address || 'Adresse non disponible'}</Text>

              <View style={styles.distRow}>
                <View style={styles.distInfo}>
                  <Text style={styles.distVal}>{calculateDistance() || '---'}</Text>
                  <Text style={styles.distUnit}>KM</Text>
                </View>
                <AppTouchableOpacity style={styles.mapPreviewBtn} onPress={() => setShowMapPreview(true)}>
                  <MaterialIcons name="map" size={20} color="#FFF" />
                  <Text style={styles.mapPreviewBtnTxt}>VOIR CARTE</Text>
                </AppTouchableOpacity>
              </View>
            </View>

            {/* CARD 3: WHY (Incident Motif) */}
            <View style={[styles.dashboardCard, { paddingVertical: 16 }]}>
              <View style={styles.cardHeaderRow}>
                <MaterialIcons name="medical-services" size={18} color="rgba(255,255,255,0.4)" />
                <Text style={[styles.cardLabel, { color: 'rgba(255,255,255,0.2)' }]}>MOTIF D'APPEL</Text>
              </View>
              <Text style={styles.incidentMotifTxtSmall}>{activeMission?.title}</Text>

              <AppTouchableOpacity
                style={styles.symptomsToggle}
                onPress={() => setShowSymptoms(!showSymptoms)}
              >
                <Text style={styles.symptomsToggleTxt}>
                  {showSymptoms ? "Masquer les détails" : "Détails & Symptômes"}
                </Text>
                <MaterialIcons name={showSymptoms ? "expand-less" : "expand-more"} size={20} color={colors.secondary} />
              </AppTouchableOpacity>

              {showSymptoms && (
                <View style={styles.symptomsList}>
                  {activeMission?.sos_responses && activeMission.sos_responses.length > 0 ? (
                    activeMission.sos_responses.map((resp, i) => (
                      <View key={i} style={styles.symptomItem}>
                        <Text style={styles.symptomQuest}>{resp.question_text || resp.question_key}:</Text>
                        <Text style={styles.symptomAns}>{resp.answer || '---'}</Text>
                      </View>
                    ))
                  ) : (
                    <Text style={styles.noSymptomsTxt}>Aucune donnée supplémentaire.</Text>
                  )}
                  {activeMission?.description && (
                    <Text style={styles.incidentDescTxt}>Note: {activeMission.description}</Text>
                  )}
                </View>
              )}
            </View>
          </ScrollView>

          <View style={styles.missionModalFooter}>
            <View style={styles.emergencyActionsRow}>
              <Text style={styles.actionHintTextModal}>Maintenez appuyé pour accepter</Text>
              <AppTouchableOpacity
                activeOpacity={1}
                style={styles.btnDashboardPrimary}
                onPressIn={handleConfirmPressIn}
                onPressOut={handleConfirmPressOut}
              >
                <Animated.View
                  style={[
                    styles.confirmButtonProgress,
                    {
                      transform: [
                        { translateX: - (width - 48) }, // Start off-screen left
                        {
                          translateX: confirmProgress.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0, width - 48]
                          })
                        }
                      ]
                    }
                  ]}
                />
                <Text style={styles.btnDashboardPrimaryTxt}>ACCEPTER LA MISSION</Text>
              </AppTouchableOpacity>
            </View>

            <AppTouchableOpacity
              style={styles.refuseBtn}
              onPress={() => {
                setIsModalMinimized(true);
                navigation.navigate('CallCenter');
              }}
            >
              <Text style={styles.refuseBtnTxtLabel}>APPELER LA CENTRALE / REFUSER</Text>
            </AppTouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MAIN UI - Using Fixed Layout (our approach) but integrating Header elements from main */}
      <View style={styles.standbyLayout}>
        <View style={styles.header}>
          <Text style={styles.unitLabel}>UNITÉ ASSIGNÉE</Text>
          <Text style={styles.unitName}>{unitName || 'Chargement...'}</Text>
        </View>

        <View style={styles.centerStage}>
          {hasActiveAlert && isModalMinimized ? (
            <View style={{ alignItems: 'center', justifyContent: 'center' }}>
              <AlertPulseIcon />
              <Text style={[styles.statusText, { color: colors.primary, marginTop: 16 }]}>MISSION EN COURS</Text>
              <AppTouchableOpacity
                style={styles.restoreBtn}
                onPress={() => {
                  if (isMissionAccepted) {
                    navigation.navigate('Signalement', { mission: activeMission });
                  } else {
                    setIsModalMinimized(false);
                  }
                }}
              >
                <Text style={styles.restoreBtnTxt}>
                  {isMissionAccepted ? "CONTINUER LE PROCESSUS" : "AFFICHER L'ALERTE"}
                </Text>
              </AppTouchableOpacity>

              <View style={[styles.agentInfoRow, { marginTop: 12 }]}>
                <MaterialIcons name="person" size={14} color="rgba(255,255,255,0.4)" />
                <Text style={styles.agentInfo}>Agent: {profile?.last_name || profile?.first_name || 'Inconnu'}</Text>
              </View>
            </View>
          ) : (
            <>
              <PulseRadar isActive={isDutyActive} />
              <Text style={[styles.statusText, isDutyActive ? { color: colors.success } : { color: colors.textMuted }]}>
                {isDutyActive ? "SERVICE ACTIF" : "SERVICE DÉSACTIVÉ"}
              </Text>
              <View style={styles.agentInfoRow}>
                <MaterialIcons name="person" size={14} color="rgba(255,255,255,0.4)" />
                <Text style={styles.agentInfo}>Agent: {profile?.last_name || profile?.first_name || 'Inconnu'}</Text>
              </View>
              <Text style={styles.statusSubText}>
                {isDutyActive
                  ? "Vous êtes connecté et visible par la centrale.\nEn attente d'une nouvelle mission..."
                  : "Vous êtes hors ligne.\nAucune mission ne vous sera assignée."}
              </Text>
            </>
          )}
        </View>

        {!hasActiveAlert && (
          <View style={styles.actionContainer}>
            <Text style={styles.actionHintText}>Maintenez appuyé pour basculer votre statut</Text>
            <AppTouchableOpacity
              activeOpacity={1}
              onPressIn={handlePressIn}
              onPressOut={handlePressOut}
              style={[
                styles.dutyButton,
                isDutyActive ? styles.dutyButtonOffline : styles.dutyButtonOnline
              ]}
            >
              <Animated.View style={[
                styles.dutyButtonProgress,
                isDutyActive ? { backgroundColor: 'rgba(0,0,0,0.3)' } : { backgroundColor: 'rgba(255,255,255,0.2)' },
                {
                  width: '100%',
                  transform: [
                    { translateX: -((width - 48) / 2) },
                    { scaleX: holdProgress },
                    { translateX: ((width - 48) / 2) }
                  ]
                }
              ]} />

              <View style={styles.dutyButtonContext}>
                <MaterialIcons
                  name={isDutyActive ? "power-settings-new" : "play-circle-filled"}
                  size={28}
                  color={isDutyActive ? "#FFF" : colors.success}
                />
                <Text style={[styles.dutyButtonTxt, !isDutyActive && { color: colors.success }]}>
                  {isDutyActive ? "DÉSACTIVER LE SERVICE" : "ACTIVER LE SERVICE"}
                </Text>
              </View>
            </AppTouchableOpacity>
          </View>
        )}

        <View style={[styles.quickAccessRow, hasActiveAlert && { marginTop: 0, paddingBottom: 20 }]}>
          <AppTouchableOpacity 
            style={[styles.quickBtn, isPhonePulseActive && { opacity: 0.8 }]} 
            onPress={handleCallCentral}
            disabled={isPhonePulseActive}
          >
            <Animated.View style={[styles.quickIconBox, { backgroundColor: callBgPulse }]}>
              <MaterialIcons name="phone" color={colors.success} size={22} />
            </Animated.View>
            <Text style={styles.quickBtnTxt}>Appeler centrale</Text>
          </AppTouchableOpacity>

          <AppTouchableOpacity style={styles.quickBtn} onPress={() => navigation.navigate('Protocoles')}>
            <View style={[styles.quickIconBox, { backgroundColor: colors.secondary + '15' }]}>
              <MaterialIcons name="medical-services" color={colors.secondary} size={22} />
            </View>
            <Text style={styles.quickBtnTxt}>Protocoles</Text>
          </AppTouchableOpacity>

          <AppTouchableOpacity style={styles.quickBtn} onPress={() => navigation.navigate('SignalerProbleme')}>
            <View style={[styles.quickIconBox, { backgroundColor: colors.primary + '15' }]}>
              <MaterialIcons name="campaign" color={colors.primary} size={22} />
            </View>
            <Text style={styles.quickBtnTxt}>Signalement</Text>
          </AppTouchableOpacity>
        </View>
      </View>
    </TabScreenSafeArea>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050505',
  },
  standbyLayout: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  header: {
    marginTop: 10,
    alignItems: 'center',
  },
  unitLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 4,
    textAlign: 'center',
  },
  unitName: {
    color: '#FFF',
    fontSize: 28,
    fontWeight: '900',
    textAlign: 'center',
  },
  centerStage: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radarContainer: {
    width: 160,
    height: 160,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 40,
  },
  radarWave: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: colors.success,
  },
  radarCore: {
    width: 90,
    height: 90,
    borderRadius: 45,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  restoreBtn: {
    marginTop: 20,
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 16,
  },
  restoreBtnTxt: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1,
  },
  statusText: {
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 1,
    textAlign: 'center',
    marginBottom: 8,
  },
  agentInfo: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  statusSubText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 20,
  },
  actionContainer: {
    paddingBottom: 10,
  },
  actionHintText: {
    color: 'rgba(255,255,255,0.3)',
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  dutyButton: {
    height: 72,
    borderRadius: 36,
    overflow: 'hidden',
    borderWidth: 2,
    justifyContent: 'center',
  },
  dutyButtonOnline: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  dutyButtonOffline: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  dutyButtonProgress: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
  },
  dutyButtonContext: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  dutyButtonTxt: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 1,
  },
  missionModalContainer: {
    flex: 1,
    backgroundColor: '#050505',
    padding: 24,
  },
  missionModalHeader: {
    marginTop: 40,
    marginBottom: 20,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  refBadge: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  refBadgeTxt: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  minimizeBtnDashboard: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  urgentHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginVertical: 24, // ADDED MARGIN
  },
  urgentTitle: {
    color: colors.primary,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 2,
    textAlign: 'center',
  },
  dashboardScroll: {
    flex: 1,
  },
  dashboardCard: {
    backgroundColor: '#111',
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  cardLabel: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  victimNamePrimary: {
    color: '#FFF',
    fontSize: 20, // REDUCED FROM 24
    fontWeight: '900',
    marginBottom: 16,
  },
  victimMetaRow: {
    flexDirection: 'row',
    gap: 12,
  },
  metaBadge: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.03)',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  metaBadgeLbl: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 9,
    fontWeight: '800',
    marginBottom: 4,
  },
  metaBadgeVal: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
  },
  incidentMotifTxtSmall: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
  },
  symptomsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    gap: 4,
  },
  symptomsToggleTxt: {
    color: colors.secondary,
    fontSize: 13,
    fontWeight: '700',
  },
  symptomsList: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
  },
  symptomItem: {
    marginBottom: 10,
  },
  symptomQuest: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 2,
  },
  symptomAns: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  noSymptomsTxt: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 13,
    fontStyle: 'italic',
  },
  incidentDescTxt: {
    marginTop: 12,
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    lineHeight: 18,
    backgroundColor: 'rgba(255,255,255,0.02)',
    padding: 10,
    borderRadius: 8,
  },
  locationAddrTxt: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
    marginBottom: 16,
  },
  distRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.03)',
    padding: 12,
    borderRadius: 16,
  },
  distInfo: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  distVal: {
    color: colors.secondary,
    fontSize: 20,
    fontWeight: '900',
  },
  distUnit: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
    fontWeight: '700',
  },
  mapPreviewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#333',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  mapPreviewBtnTxt: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '800',
  },
  missionModalFooter: {
    paddingTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 20 : 10,
  },
  emergencyActionsRow: {
    marginBottom: 12,
  },
  btnDashboardPrimary: {
    backgroundColor: colors.success,
    height: 64,
    borderRadius: 32, // PILL SHAPE
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    shadowColor: colors.success,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  actionHintTextModal: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 12,
  },
  confirmButtonProgress: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '100%',
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  btnDashboardPrimaryTxt: {
    color: '#000',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 1,
  },
  refuseBtn: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  refuseBtnTxtLabel: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '800',
    textDecorationLine: 'underline',
  },
  closeMapBtn: {
    position: 'absolute',
    top: 60,
    right: 20,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  victimMarker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  meMarker: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },

  alertIconPulseContainer: {
    width: 64,
    height: 64,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  alertRadarWave: {
    position: 'absolute',
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primary + '44', // Increased visibility (27% opacity)
  },
  quickAccessRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 32,
    paddingHorizontal: 8,
  },
  agentInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    justifyContent: 'center',
    marginBottom: 16, // MOVED FROM agentInfo
  },
  quickBtn: {
    alignItems: 'center',
    width: '30%',
  },
  quickIconBox: {
    width: 56,
    height: 56,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  quickBtnTxt: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.5,
  }
});
