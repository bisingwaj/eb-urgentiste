import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Platform, Modal, TouchableWithoutFeedback } from 'react-native';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { AppTouchableOpacity } from '../../../components/ui/AppTouchableOpacity';
import { colors } from '../../../theme/colors';
import { useHospital } from '../../../contexts/HospitalContext';
import { useAuth } from '../../../contexts/AuthContext';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface HospitalHeaderProps {
  title?: string;
  showBack?: boolean;
  rightComponent?: React.ReactNode;
}

export const HospitalHeader: React.FC<HospitalHeaderProps> = ({
  title,
  showBack = false,
  rightComponent,
}) => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { pendingAlertCount, hospitalCapacity, updateHospitalCapacity } = useHospital();
  const { profile } = useAuth();

  const [showCapModal, setShowCapModal] = React.useState(false);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (pendingAlertCount > 0) {
      Animated.loop(
        Animated.sequence([
          Animated.parallel([
            Animated.timing(pulseAnim, { toValue: 1.05, duration: 800, useNativeDriver: true }),
            Animated.timing(opacityAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
          ]),
          Animated.parallel([
            Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
            Animated.timing(opacityAnim, { toValue: 0.6, duration: 800, useNativeDriver: true }),
          ]),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
      opacityAnim.setValue(0);
    }
  }, [pendingAlertCount, pulseAnim, opacityAnim]);

  const getCapacityInfo = () => {
    switch (hospitalCapacity) {
      case 'fluid': return { color: '#00E676', label: 'FLUIDE' };
      case 'saturated': return { color: '#FFB74D', label: 'SATURÉ' };
      case 'diversion': return { color: '#FF5252', label: 'DÉTOUR' };
      default: return { color: 'rgba(255,255,255,0.2)', label: 'INCONNU' };
    }
  };

  const displayName = profile?.linkedStructure?.name || profile?.first_name || 'Hôpital';
  const hasAlert = pendingAlertCount > 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.leftSection}>
        {showBack ? (
          <Animated.View style={hasAlert ? { transform: [{ scale: pulseAnim }] } : undefined}>
            <AppTouchableOpacity
              style={[
                styles.backBtn,
                hasAlert && styles.backBtnAlert,
              ]}
              onPress={() => navigation.navigate('HospitalTabs')}
            >
              <MaterialIcons name="arrow-back" size={20} color={hasAlert ? '#FF5252' : '#FFF'} />
              {hasAlert && (
                <Text style={styles.alertTextInline}>NOUVELLE URGENCE</Text>
              )}
            </AppTouchableOpacity>
          </Animated.View>
        ) : (
          <View style={styles.logoRow}>
            <View style={styles.logoCircle}>
              <MaterialCommunityIcons name="shield-cross" size={22} color={colors.secondary} />
            </View>
            {hasAlert && (
              <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                <View style={styles.dashboardAlertBadge}>
                  <View style={styles.alertDotSmall} />
                  <Text style={styles.alertTextInline}>URGENCE</Text>
                </View>
              </Animated.View>
            )}
          </View>
        )}
      </View>

      {/* Hide hospital name on mobile when alert is active to prevent crowding */}
      {!hasAlert && (
        <View style={styles.centerSection}>
          <Text style={styles.titleText} numberOfLines={1}>
            {displayName.toUpperCase()}
          </Text>
        </View>
      )}
      {hasAlert && <View style={{ flex: 1 }} />}

      <View style={styles.rightSection}>
        {rightComponent ? rightComponent : (
          <AppTouchableOpacity 
            style={styles.capacityBtn}
            onPress={() => setShowCapModal(true)}
          >
            <View style={[styles.radarOrb, { backgroundColor: getCapacityInfo().color }]} />
            <Text style={[styles.radarText, { color: getCapacityInfo().color }]}>
              {getCapacityInfo().label}
            </Text>
            <MaterialIcons name="arrow-drop-down" size={16} color="rgba(255,255,255,0.3)" />
          </AppTouchableOpacity>
        )}
      </View>

      <Modal visible={showCapModal} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={() => setShowCapModal(false)}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>CAPACITÉ DE L'HÔPITAL</Text>
                
                <AppTouchableOpacity style={styles.capOption} onPress={() => { updateHospitalCapacity('fluid'); setShowCapModal(false); }}>
                  <View style={[styles.orbLarge, { backgroundColor: '#00E676' }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.capLabel}>FLUIDE (DISPONIBLE)</Text>
                    <Text style={styles.capSub}>Prise en charge immédiate possible</Text>
                  </View>
                  {hospitalCapacity === 'fluid' && <MaterialIcons name="check" size={20} color="#00E676" />}
                </AppTouchableOpacity>

                <AppTouchableOpacity style={styles.capOption} onPress={() => { updateHospitalCapacity('saturated'); setShowCapModal(false); }}>
                  <View style={[styles.orbLarge, { backgroundColor: '#FFB74D' }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.capLabel}>SATURÉ (LIMITÉ)</Text>
                    <Text style={styles.capSub}>Temps d'attente prolongé probable</Text>
                  </View>
                  {hospitalCapacity === 'saturated' && <MaterialIcons name="check" size={20} color="#FFB74D" />}
                </AppTouchableOpacity>

                <AppTouchableOpacity style={styles.capOption} onPress={() => { updateHospitalCapacity('diversion'); setShowCapModal(false); }}>
                  <View style={[styles.orbLarge, { backgroundColor: '#FF5252' }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.capLabel}>DÉTOUR (URGENCE SEULEMENT)</Text>
                    <Text style={styles.capSub}>Cas critiques uniquement accepté</Text>
                  </View>
                  {hospitalCapacity === 'diversion' && <MaterialIcons name="check" size={20} color="#FF5252" />}
                </AppTouchableOpacity>

                <AppTouchableOpacity style={styles.modalClose} onPress={() => setShowCapModal(false)}>
                  <Text style={styles.closeText}>FERMER</Text>
                </AppTouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: Platform.OS === 'ios' ? 110 : 90,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    backgroundColor: '#0A0A0A',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  leftSection: {
    justifyContent: 'center',
  },
  backBtn: {
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    paddingHorizontal: 12,
    gap: 8,
  },
  backBtnAlert: {
    backgroundColor: 'rgba(255, 82, 82, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 82, 82, 0.25)',
  },
  alertTextInline: {
    color: '#FF5252',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(56, 182, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(56, 182, 255, 0.2)',
  },
  dashboardAlertBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 82, 82, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 82, 82, 0.2)',
  },
  alertDotSmall: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FF5252',
  },
  centerSection: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  titleText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 1,
    textAlign: 'center',
  },
  rightSection: {
    minWidth: 90,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  capacityBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  radarOrb: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  radarText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },

  // MODAL STYLES
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#1A1A1A',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 48 : 32,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  modalTitle: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginBottom: 24,
    textAlign: 'center',
  },
  capOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: 'rgba(255,255,255,0.03)',
    padding: 16,
    borderRadius: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  orbLarge: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  capLabel: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '800',
  },
  capSub: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  modalClose: {
    marginTop: 12,
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeText: {
    color: colors.secondary,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1,
  },
});
