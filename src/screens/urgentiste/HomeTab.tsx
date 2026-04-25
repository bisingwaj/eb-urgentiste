import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, StatusBar, Animated, Alert, ActivityIndicator, Modal, Dimensions, Platform, ScrollView } from 'react-native';
import { TabScreenSafeArea } from '../../components/layout/TabScreenSafeArea';
import { colors } from '../../theme/colors';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useActiveMission } from '../../hooks/useActiveMission';
import { useLocationTracking } from '../../hooks/useLocationTracking';
import { useNotifications } from '../../hooks/useNotifications';
import { useCallSession } from '../../contexts/CallSessionContext';
import { useConnectivity } from '../../hooks/useConnectivity';
import { useDialog } from '../../contexts/GlobalDialogContext';
import { useHomeDuty } from './homeHooks/useHomeDuty';
import { useHomeMissionPreview } from './homeHooks/useHomeMissionPreview';
import { supabase } from '../../lib/supabase';
import { AppTouchableOpacity } from '../../components/ui/AppTouchableOpacity';
import { DeviceEventEmitter } from 'react-native';
import { ALARM_STOP_EVENT } from '../../services/AlarmService';
import * as Location from 'expo-location';
import Mapbox from '@rnmapbox/maps';
import { Navigation2, Activity } from 'lucide-react-native';
import {
  getRouteWithAlternatives,
  geometryToCameraBounds,
  haversineMeters,
  type RouteResult
} from '../../lib/mapbox';
import { EBMap, EBMapMarker } from '../../components/map/EBMap';
import { PulseRadar } from './components/PulseRadar';
import { AlertPulseIcon } from './components/AlertPulseIcon';
import { EmergencyDashboardModal } from './components/EmergencyDashboardModal';

const { width } = Dimensions.get('window');

export function HomeTab({ navigation }: any) {
  const { profile, refreshProfile } = useAuth();
  const { activeMission, isLoading: missionLoading, updateDispatchStatus } = useActiveMission();
  const { unreadCount } = useNotifications();
  const { minimized: activeCall } = useCallSession();
  const { isConnected } = useConnectivity();
  const { showDialog } = useDialog();

  // Initialize background location tracking (from main)
  useLocationTracking();


  const { isDutyActive, unitName, isHolding, holdProgress, handlePressIn, handlePressOut } = useHomeDuty(profile, isConnected, showDialog, refreshProfile);
  const {
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
  } = useHomeMissionPreview(activeMission, navigation, updateDispatchStatus);
  const [isCalling, setIsCalling] = useState(false);
  const [showSymptoms, setShowSymptoms] = useState(false);

  // Smooth color transitions for the duty button
  const dutyColorAnim = useRef(new Animated.Value(isDutyActive ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(dutyColorAnim, {
      toValue: isDutyActive ? 1 : 0,
      duration: 400,
      useNativeDriver: false
    }).start();
  }, [isDutyActive, dutyColorAnim]);

  const dutyBorderColor = dutyColorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(52, 199, 89, 0.4)', 'rgba(255, 69, 58, 0.4)']
  });
  const dutyFillColor = dutyColorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(52, 199, 89, 0.25)', 'rgba(255, 69, 58, 0.25)']
  });
  const dutyIconColor = dutyColorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.success, '#FF453A']
  });

  const opacityOnline = dutyColorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0]
  });

  const opacityOffline = dutyColorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1]
  });

  const isPhonePulseActive = isCalling || !!activeCall;
  const handleCallCentral = () => {
    if (isPhonePulseActive) return;

    setIsCalling(true);
    setTimeout(() => setIsCalling(false), 3000);
    navigation.navigate('CallCenter');
  };


  if (hasActiveAlert) {
    console.log("[Dashboard] Active Alert State:", {
      missionId: activeMission?.id,
      dispatchStatus: activeMission?.dispatch_status,
      incidentStatus: (activeMission as any)?.incidents?.status || (activeMission as any)?.status
    });
  }

  const mapPreviewMarkers = useMemo((): EBMapMarker[] => {
    const m: EBMapMarker[] = [];
    if (activeMission?.location?.lng != null && activeMission?.location?.lat != null) {
      m.push({
        id: 'victim',
        type: 'incident',
        coordinate: [activeMission.location.lng, activeMission.location.lat],
        priority: activeMission.priority,
      });
    }
    if (userLocation) {
      m.push({
        id: 'me',
        type: 'me',
        coordinate: [userLocation.coords.longitude, userLocation.coords.latitude],
      });
    }
    return m;
  }, [activeMission?.id, userLocation]);

  const mapPreviewRouteData = useMemo(() => {
    if (!activeRoute) return undefined;
    return {
      routes: [activeRoute],
      selectedIndex: 0,
    };
  }, [activeRoute]);

  const mapPreviewCameraConfig = useMemo(() => {
    return {
      bounds: routeBounds || undefined,
    };
  }, [routeBounds]);

  return (
    <TabScreenSafeArea style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#050505" />

      {/* MAP PREVIEW MODAL */}
      <Modal visible={showMapPreview} animationType="slide" transparent={false}>
        <View style={{ flex: 1, backgroundColor: '#FFF' }}>
          <EBMap
            mode="NAVIGATION"
            markers={mapPreviewMarkers}
            routeData={mapPreviewRouteData}
            cameraConfig={mapPreviewCameraConfig}
            showControls={true}
            style={{ flex: 1 }}
          />
          <AppTouchableOpacity style={styles.closeMapBtn} onPress={() => setShowMapPreview(false)}>
            <MaterialIcons name="close" size={28} color="#FFF" />
          </AppTouchableOpacity>
        </View>
      </Modal>

      <EmergencyDashboardModal
        hasActiveAlert={hasActiveAlert}
        isModalMinimized={isModalMinimized}
        setIsModalMinimized={setIsModalMinimized}
        activeMission={activeMission}
        getVictimMetadata={getVictimMetadata}
        calculateDistance={calculateDistance}
        setShowMapPreview={setShowMapPreview}
        getMotifDAppel={getMotifDAppel}
        capitalize={capitalize}
        handleConfirmPressIn={handleConfirmPressIn}
        handleConfirmPressOut={handleConfirmPressOut}
        confirmProgress={confirmProgress}
        navigation={navigation}
      />

      {/* MAIN UI - Using Fixed Layout (our approach) but integrating Header elements from main */}
      <View style={styles.standbyLayout}>
        <View style={styles.header}>
          <Text style={styles.unitLabel}>UNITÉ ASSIGNÉE</Text>
          <Text style={styles.unitName}>{unitName || 'Chargement...'}</Text>
        </View>

        <View style={styles.centerStage}>
          {hasActiveAlert && isModalMinimized ? (
            <View style={{ alignItems: 'center', justifyContent: 'center' }}>
              {!isConnected && (
                <View style={styles.offlineMissionBanner}>
                  <MaterialCommunityIcons name="cloud-off-outline" size={16} color="#FFF" />
                  <Text style={styles.offlineMissionText}>CONNEXION PERDUE</Text>
                </View>
              )}
              <AlertPulseIcon />
              <Text style={[styles.statusText, { color: colors.primary, marginTop: 16 }]}>MISSION EN COURS</Text>
              <AppTouchableOpacity
                style={styles.restoreBtn}
                onPress={() => {
                  if (isMissionAccepted) {
                    const status = activeMission?.dispatch_status || 'dispatched';
                    // If we are already on scene or arrived hospital, go to Signalement
                    // If we are currently en route to patient OR en route to hospital, go to Map (MissionActive)
                    if (status === 'on_scene' || status === 'arrived_hospital') {
                      navigation.navigate('Signalement', { mission: activeMission });
                    } else {
                      navigation.navigate('MissionActive', { mission: activeMission });
                    }
                  } else {
                    // STOP THE ALARM ONLY WHEN THE USER CLICKS TO SEE THE ALERT
                    DeviceEventEmitter.emit('STOP_URGENTIST_ALARM');
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
                <Text style={styles.agentInfoText}>Agent: {profile?.last_name || profile?.first_name || 'Inconnu'}</Text>
              </View>
            </View>
          ) : (
            <>
              <PulseRadar isActive={isDutyActive} isConnected={isConnected} />
              <Text style={[
                styles.statusText,
                !isConnected ? { color: '#FB8C00' } : (isDutyActive ? { color: colors.success } : { color: colors.textMuted })
              ]}>
                {!isConnected ? "HORS LIGNE" : (isDutyActive ? "SERVICE ACTIF" : "SERVICE DÉSACTIVÉ")}
              </Text>
              <View style={styles.agentInfoRow}>
                <MaterialIcons name="person" size={14} color="rgba(255,255,255,0.4)" />
                <Text style={styles.agentInfoText}>Agent: {profile?.last_name || profile?.first_name || 'Inconnu'}</Text>
              </View>
              <Text style={styles.statusSubText}>
                {!isConnected
                  ? "Votre connexion internet est interrompue.\nLe suivi GPS et les missions sont suspendus."
                  : (isDutyActive
                    ? "Vous êtes connecté et visible par la centrale.\nEn attente d'une nouvelle mission..."
                    : "Vous êtes hors ligne.\nAucune mission ne vous sera assignée.")
                }
              </Text>
            </>
          )}
        </View>

        <View style={styles.bottomControlsContainer}>
          {!hasActiveAlert && (
            <View style={styles.actionContainer}>
              <Text style={styles.actionHintText}>Maintenez appuyé pour basculer votre statut</Text>
              <AppTouchableOpacity
                activeOpacity={1}
                onPressIn={handlePressIn}
                onPressOut={handlePressOut}
              >
                <Animated.View style={[
                  styles.dutyButton,
                  { borderColor: dutyBorderColor as any }
                ]}>
                  <Animated.View style={[
                    styles.dutyButtonProgress,
                    {
                      width: '100%',
                      transform: [
                        { translateX: -((width - 48) / 2) },
                        { scaleX: holdProgress },
                        { translateX: ((width - 48) / 2) }
                      ]
                    }
                  ]}>
                    <Animated.View style={[
                      StyleSheet.absoluteFill,
                      { backgroundColor: dutyFillColor as any }
                    ]} />
                  </Animated.View>

                  <View style={styles.dutyButtonContext}>
                    {/* ONLINE STATE (Green) */}
                    <Animated.View style={[styles.dutyButtonAbsoluteContent, { opacity: opacityOnline as any }]}>
                      <MaterialIcons name="play-circle-filled" size={28} color={colors.success} />
                      <Text style={[styles.dutyButtonTxt, { color: colors.success }]}>
                        ACTIVER LE SERVICE
                      </Text>
                    </Animated.View>

                    {/* OFFLINE STATE (Red) */}
                    <Animated.View style={[styles.dutyButtonAbsoluteContent, { opacity: opacityOffline as any }]}>
                      <MaterialIcons name="power-settings-new" size={28} color="#FF453A" />
                      <Text style={[styles.dutyButtonTxt, { color: '#FF453A' }]}>
                        DÉSACTIVER LE SERVICE
                      </Text>
                    </Animated.View>
                  </View>
                </Animated.View>
              </AppTouchableOpacity>
            </View>
          )}

          <View style={[styles.quickAccessRow, hasActiveAlert && { marginTop: 0, paddingBottom: 10 }]}>
            <AppTouchableOpacity
              style={[styles.quickBtn, isPhonePulseActive && { opacity: 0.5 }]}
              onPress={handleCallCentral}
              disabled={isPhonePulseActive}
            >
              <View style={[
                styles.quickIconBox,
                { backgroundColor: isPhonePulseActive ? 'rgba(255,255,255,0.05)' : colors.success + '15' }
              ]}>
                <MaterialIcons
                  name="phone"
                  color={isPhonePulseActive ? 'rgba(255,255,255,0.3)' : colors.success}
                  size={22}
                />
              </View>
              <Text style={[styles.quickBtnTxt, isPhonePulseActive && { color: 'rgba(255,255,255,0.3)' }]}>
                Appeler centrale
              </Text>
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
    paddingTop: 32,
    paddingBottom: 24,
  },
  header: {
    marginTop: 10,
    alignItems: 'center',
  },
  bottomControlsContainer: {
    width: '100%',
    gap: 4, // Spacing between the button and the quick access bar
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
  agentInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    justifyContent: 'center',
    marginBottom: 16,
  },
  agentInfoText: {
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
    borderWidth: 1.5,
    justifyContent: 'center',
    backgroundColor: 'rgba(15,15,15,0.85)',
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
    width: '100%',
    height: '100%',
  },
  dutyButtonAbsoluteContent: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
    gap: 12,
  },
  dutyButtonTxt: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 1,
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

  quickAccessRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingHorizontal: 8,
  },
  offlineMissionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FB8C00',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 12,
    position: 'absolute',
    top: -60,
  },
  offlineMissionText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '900',
    marginLeft: 6,
    letterSpacing: 1,
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
  },
});
