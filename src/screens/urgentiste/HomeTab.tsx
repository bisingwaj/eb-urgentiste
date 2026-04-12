import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar, Animated, Alert, ActivityIndicator, Modal } from 'react-native';
import { TabScreenSafeArea } from '../../components/layout/TabScreenSafeArea';
import { colors } from '../../theme/colors';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useActiveMission } from '../../hooks/useActiveMission';
import { supabase } from '../../lib/supabase';

// Helper component for pulsing the radar core
const PulseRadar = ({ isActive }: { isActive: boolean }) => {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    if (isActive) {
      Animated.loop(
        Animated.parallel([
          Animated.sequence([
            Animated.timing(scale, { toValue: 1.8, duration: 1500, useNativeDriver: true }),
            Animated.timing(scale, { toValue: 1, duration: 0, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.timing(opacity, { toValue: 0, duration: 1500, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0.8, duration: 0, useNativeDriver: true }),
          ])
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
        <MaterialCommunityIcons name={isActive ? "radar" : "radar-off"} size={48} color="#FFF" />
      </View>
    </View>
  );
};

export function HomeTab({ navigation }: any) {
  const { profile, refreshProfile } = useAuth();
  const { activeMission, isLoading: missionLoading } = useActiveMission();

  const [isDutyActive, setIsDutyActive] = useState(profile?.available ?? false);
  const [unitName, setUnitName] = useState<string | null>(null);

  // Status Hold Action Animation
  const holdProgress = useRef(new Animated.Value(0)).current;
  const [isHolding, setIsHolding] = useState(false);
  const [isModalMinimized, setIsModalMinimized] = useState(false);

  useEffect(() => {
    if (!activeMission || activeMission.dispatch_status === 'completed') {
      setIsModalMinimized(false);
    }
  }, [activeMission]);

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

  useEffect(() => {
    if (profile) setIsDutyActive(profile.available);
  }, [profile?.available]);

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
    Animated.timing(holdProgress, {
      toValue: 1,
      duration: 1000,
      useNativeDriver: false // width animation doesn't support native driver
    }).start(({ finished }) => {
      if (finished) {
        toggleDuty(!isDutyActive);
        holdProgress.setValue(0);
        setIsHolding(false);
      }
    });
  };

  const handlePressOut = () => {
    if (isHolding) {
      Animated.timing(holdProgress, {
        toValue: 0,
        duration: 200,
        useNativeDriver: false
      }).start();
      setIsHolding(false);
    }
  };

  const hasActiveAlert = !!activeMission && activeMission.dispatch_status !== 'completed';

  return (
    <TabScreenSafeArea style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#050505" />

      {/* EMERGENCY MODAL TAKEOVER */}
      <Modal
        visible={hasActiveAlert && !isModalMinimized}
        animationType="slide"
        presentationStyle="overFullScreen"
        transparent={false}
      >
        <View style={styles.missionModalContainer}>
          <View style={styles.missionModalHeader}>
            <TouchableOpacity
              style={styles.minimizeBtn}
              onPress={() => setIsModalMinimized(true)}
            >
              <MaterialIcons name="keyboard-arrow-down" size={36} color="#FFF" />
            </TouchableOpacity>

            <MaterialIcons name="warning" size={48} color={colors.primary} />
            <Text style={styles.missionModalPulseTxt}>APPEL D'URGENCE</Text>
          </View>

          <View style={styles.missionModalBody}>
            <Text style={styles.missionModalTitle}>{activeMission?.title}</Text>

            <View style={styles.missionModalRow}>
              <MaterialIcons name="place" size={24} color={colors.textMuted} />
              <Text style={styles.missionModalLoc}>{typeof activeMission?.location === 'string' ? activeMission.location : (activeMission?.location?.address || 'Localisation inconnue')}</Text>
            </View>

            <Text style={styles.missionModalTime}>Référence : {activeMission?.reference || 'N/A'}</Text>
            <Text style={[styles.missionModalPriority, { color: activeMission?.priority === 'critical' ? colors.primary : colors.secondary }]}>
              PRIORITÉ {activeMission?.priority === 'critical' ? 'MAXIMALE' : 'HAUTE'}
            </Text>
          </View>

          <View style={styles.missionModalFooter}>
            <Text style={styles.missionModalHint}>Votre interface de navigation va s'ouvrir. Ne fermez pas l'application.</Text>
            <TouchableOpacity
              style={styles.missionModalActionBtn}
              onPress={() => {
                setIsModalMinimized(true);
                navigation.navigate('Signalement', { mission: activeMission });
              }}
            >
              <MaterialIcons name="assignment-turned-in" size={32} color="#FFF" />
              <Text style={styles.missionModalBtnTxt}>GÉRER L'INTERVENTION</Text>
            </TouchableOpacity>

            {/* Option pour "Refuser" uniquement si pas encore accepté */}
            {activeMission?.dispatch_status === 'dispatched' && (
              <TouchableOpacity
                style={{ marginTop: 24, alignItems: 'center' }}
                onPress={() => {
                  setIsModalMinimized(true);
                  navigation.navigate('CallCenter');
                }}
              >
                <Text style={{ color: colors.primary, fontSize: 16, fontWeight: '700' }}>APPELER LA CENTRALE (REFUSER)</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      {/* STANDBY UI */}
      <View style={styles.standbyLayout}>
        <View style={styles.header}>
          <Text style={styles.unitLabel}>UNITÉ ASSIGNÉE</Text>
          <Text style={styles.unitName}>{unitName || 'Chargement...'}</Text>
        </View>

        <View style={styles.centerStage}>
          {hasActiveAlert && isModalMinimized ? (
            <View style={{ alignItems: 'center' }}>
              <MaterialIcons name="warning" size={48} color={colors.primary} style={{ marginBottom: 16 }} />
              <Text style={[styles.statusText, { color: colors.primary }]}>MISSION EN COURS</Text>
              <TouchableOpacity
                style={styles.restoreBtn}
                onPress={() => setIsModalMinimized(false)}
              >
                <Text style={styles.restoreBtnTxt}>AFFICHER L'ALERTE</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <PulseRadar isActive={isDutyActive} />
              <Text style={[styles.statusText, isDutyActive ? { color: colors.success } : { color: colors.textMuted }]}>
                {isDutyActive ? "SERVICE ACTIF" : "SERVICE DÉSACTIVÉ"}
              </Text>
              <Text style={styles.greetingText}>👤 Agent: {profile?.last_name || profile?.first_name || 'Inconnu'}</Text>
              <Text style={styles.statusSubText}>
                {isDutyActive
                  ? "Vous êtes connecté et visible par la centrale.\nEn attente d'une nouvelle mission..."
                  : "Vous êtes hors ligne.\nAucune mission ne vous sera assignée."}
              </Text>
            </>
          )}
        </View>

        <View style={styles.actionContainer}>
          <Text style={styles.actionHintText}>Maintenez appuyé pour basculer votre statut</Text>
          <TouchableOpacity
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
                width: holdProgress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] })
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
          </TouchableOpacity>

          {/* ACCÈS RAPIDES */}
          <View style={styles.quickAccessRow}>
            <TouchableOpacity style={styles.quickBtn} onPress={() => navigation.navigate('CallCenter')}>
              <View style={[styles.quickIconBox, { backgroundColor: colors.success + '15' }]}>
                <MaterialIcons name="phone" color={colors.success} size={22} />
              </View>
              <Text style={styles.quickBtnTxt}>Appeler centrale</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.quickBtn} onPress={() => navigation.navigate('Protocoles')}>
              <View style={[styles.quickIconBox, { backgroundColor: colors.secondary + '15' }]}>
                <MaterialIcons name="medical-services" color={colors.secondary} size={22} />
              </View>
              <Text style={styles.quickBtnTxt}>Protocoles</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.quickBtn} onPress={() => navigation.navigate('SignalerProbleme')}>
              <View style={[styles.quickIconBox, { backgroundColor: colors.primary + '15' }]}>
                <MaterialIcons name="campaign" color={colors.primary} size={22} />
              </View>
              <Text style={styles.quickBtnTxt}>Signalement</Text>
            </TouchableOpacity>
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
    paddingVertical: 32,
  },
  header: {
    alignItems: 'center',
    marginTop: 20,
  },
  unitLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 4,
  },
  unitName: {
    color: '#FFF',
    fontSize: 28,
    fontWeight: '900',
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
    marginBottom: 4,
  },
  greetingText: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 16,
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
    paddingBottom: 20,
  },
  actionHintText: {
    color: 'rgba(255,255,255,0.3)',
    textAlign: 'center',
    fontSize: 12,
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

  // Modal Styles
  missionModalContainer: {
    flex: 1,
    backgroundColor: '#0A0A0A',
    justifyContent: 'space-between',
    padding: 32,
  },
  missionModalHeader: {
    alignItems: 'center',
    marginTop: 60,
  },
  minimizeBtn: {
    position: 'absolute',
    top: -20,
    right: -10,
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 24,
  },
  missionModalPulseTxt: {
    color: colors.primary,
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 4,
    marginTop: 16,
  },
  missionModalBody: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  missionModalTitle: {
    color: '#FFF',
    fontSize: 32,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 24,
  },
  missionModalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 16,
    borderRadius: 16,
    gap: 12,
    marginBottom: 20,
  },
  missionModalLoc: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '600',
    flexShrink: 1,
  },
  missionModalTime: {
    color: colors.textMuted,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  missionModalPriority: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 2,
  },
  missionModalFooter: {
    paddingBottom: 40,
  },
  missionModalHint: {
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'center',
    fontSize: 14,
    marginBottom: 24,
  },
  missionModalActionBtn: {
    backgroundColor: colors.success,
    height: 80,
    borderRadius: 40,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    shadowColor: colors.success,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
  },
  missionModalBtnTxt: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 1,
  },

  // Shortcuts
  quickAccessRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 32,
    paddingHorizontal: 8,
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
