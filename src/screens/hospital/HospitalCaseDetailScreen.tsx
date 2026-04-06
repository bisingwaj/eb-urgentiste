import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  Alert,
  Linking,
  Animated,
  PanResponder,
  Dimensions,
  Modal,
  TextInput,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Mapbox from '@rnmapbox/maps';
import { MapboxMapView } from '../../components/map/MapboxMapView';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import type { EmergencyCase, UrgencyLevel, CaseStatus } from './HospitalDashboardTab';

const { width, height } = Dimensions.get('window');
const SWIPE_WIDTH = width - 40;
const BUTTON_SIZE = 56;

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

export function HospitalCaseDetailScreen({ route, navigation }: any) {
  const { caseData: initialCaseData } = route.params as { caseData: EmergencyCase };
  const [caseData, setCaseData] = useState(initialCaseData);
  const levelCfg = getLevelConfig(caseData.level);
  const insets = useSafeAreaInsets();

  const isAccepted = caseData.status !== 'en_attente';
  const isEnRoute = caseData.status === 'en_cours';

  const [showRefusalModal, setShowRefusalModal] = useState(false);
  const [selectedReason, setSelectedReason] = useState("");
  const [otherReason, setOtherReason] = useState("");

  // Swipe Animation
  const pan = useRef(new Animated.Value(0)).current;
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: Animated.event([null, { dx: pan }], { useNativeDriver: false }),
      onPanResponderRelease: (e, gestureState) => {
        if (gestureState.dx > SWIPE_WIDTH * 0.7) {
          Animated.spring(pan, {
            toValue: SWIPE_WIDTH - BUTTON_SIZE,
            useNativeDriver: false,
          }).start(() => handleAcceptCase());
        } else {
          Animated.spring(pan, {
            toValue: 0,
            useNativeDriver: false,
          }).start();
        }
      },
    })
  ).current;

  const handleAcceptCase = () => {
    setCaseData(prev => ({ ...prev, status: 'en_cours' }));
  };

  const handleRefuseCase = () => {
    const finalReason = selectedReason === "Autre raison" ? otherReason : selectedReason;
    if (!finalReason) {
      Alert.alert("Action requise", "Veuillez sélectionner ou saisir une raison.");
      return;
    }

    // logic to update DB would go here
    setShowRefusalModal(false);
    navigation.goBack();
    Alert.alert("Cas refusé", "Le signalement a été refusé. L'unité mobile est notifiée.");
  };

  const handleCall = () => {
    const url = `tel:${caseData.urgentistePhone}`;
    Linking.canOpenURL(url).then(supported => supported && Linking.openURL(url));
  };

  const handleMessage = () => {
    const url = `sms:${caseData.urgentistePhone}`;
    Linking.canOpenURL(url).then(supported => supported && Linking.openURL(url));
  };

  const handleGoToAdmission = () => {
    navigation.navigate('HospitalAdmission', { caseData });
  };

  // Mocking movement
  const [ambLat, setAmbLat] = useState(-4.4450);
  useEffect(() => {
    if (isEnRoute) {
      const interval = setInterval(() => {
        setAmbLat(prev => prev + 0.0001);
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [isEnRoute]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {isEnRoute ? "Suivi de l'ambulance" : "Détails du cas"}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
      >
        {isEnRoute ? (
          <View style={styles.trackingContainer}>
            <View style={styles.etaCard}>
              <Text style={styles.etaLabel}>ARRIVÉE ESTIMÉE DANS</Text>
              <Text style={styles.etaValue}>{caseData.eta}</Text>
              <View style={styles.etaProgress}>
                <View style={styles.etaProgressFill} />
              </View>
            </View>

            <View style={styles.liveMapContainer}>
              <MapboxMapView style={styles.liveMap} styleURL={Mapbox.StyleURL.Dark} compassEnabled={false} scaleBarEnabled={false}>
                <Mapbox.Camera centerCoordinate={[15.2663, -4.4419]} zoomLevel={15} />
                <Mapbox.PointAnnotation id="hospital" coordinate={[15.2663, -4.4419]}>
                  <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: colors.secondary, justifyContent: 'center', alignItems: 'center' }}>
                    <MaterialIcons name="local-hospital" color="#FFF" size={12} />
                  </View>
                </Mapbox.PointAnnotation>
                <Mapbox.PointAnnotation id="ambulance" coordinate={[15.2663, ambLat]}>
                  <View style={styles.ambulanceMarker}>
                    <MaterialIcons name="local-shipping" color="#FFF" size={20} />
                  </View>
                </Mapbox.PointAnnotation>
                <Mapbox.ShapeSource
                  id="amb-route"
                  shape={{
                    type: 'FeatureCollection',
                    features: [{
                      type: 'Feature',
                      properties: {},
                      geometry: { type: 'LineString', coordinates: [[15.2663, ambLat], [15.2663, -4.4419]] },
                    }],
                  }}
                >
                  <Mapbox.LineLayer id="amb-route-line" style={{ lineColor: colors.secondary, lineWidth: 3, lineDasharray: [2, 2] }} />
                </Mapbox.ShapeSource>
              </MapboxMapView>
              <View style={styles.mapStatusBadge}><View style={styles.liveDot} /><Text style={styles.liveText}>GPS EN DIRECT</Text></View>
            </View>

            <View style={styles.horizontalScroll}>
              <View style={styles.miniCard}><MaterialIcons name="person" color={colors.secondary} size={20} /><View><Text style={styles.miniLabel}>PATIENT</Text><Text style={styles.miniValue}>{caseData.victimName}</Text></View></View>
              <View style={styles.miniCard}><MaterialIcons name="medical-services" color={colors.success} size={20} /><View><Text style={styles.miniLabel}>UNITÉ</Text><Text style={styles.miniValue}>{caseData.urgentisteName}</Text></View></View>
            </View>
          </View>
        ) : (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Informations patient</Text>
              <View style={styles.infoCard}>
                <View style={styles.patientHeader}>
                  <View style={[styles.avatar, { backgroundColor: levelCfg.bg }]}><Text style={[styles.avatarText, { color: levelCfg.color }]}>{caseData.victimName.charAt(0)}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.patientName}>{caseData.victimName}</Text>
                    <View style={styles.metaRow}><Text style={styles.metaText}>{caseData.sex} · {caseData.age} ans</Text></View>
                  </View>
                </View>
                <View style={styles.divider} />
                <View style={styles.descSection}>
                  <Text style={styles.label}>Motif / Description</Text>
                  <Text style={styles.descText}>{caseData.description}</Text>
                </View>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Localisation & Unité</Text>
              <View style={[styles.infoCard, { padding: 16, gap: 16 }]}>
                <View style={styles.unitInfoRow}>
                  <MaterialIcons name="place" color={colors.secondary} size={20} />
                  <Text style={styles.addressText}>{caseData.address}</Text>
                </View>
                <View style={styles.divider} />
                <View style={styles.unitInfoRow}>
                  <MaterialIcons name="medical-services" color={colors.secondary} size={20} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.unitName}>{caseData.urgentisteName}</Text>
                    <Text style={styles.unitPhone}>{caseData.urgentistePhone}</Text>
                  </View>
                  <View style={styles.unitActions}>
                    <TouchableOpacity style={styles.unitBtn} onPress={handleCall}><MaterialIcons name="phone" color={colors.success} size={20} /></TouchableOpacity>
                    <TouchableOpacity style={[styles.unitBtn, { backgroundColor: 'rgba(68,138,255,0.1)' }]} onPress={handleMessage}><MaterialIcons name="chat" color={colors.secondary} size={20} /></TouchableOpacity>
                  </View>
                </View>
              </View>
            </View>
          </>
        )}
      </ScrollView>

      {/* FOOTER ACTIONS */}
      {!isAccepted ? (
        <View style={[styles.stickyFooter, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          <View style={styles.swipeContainer}>
            <View style={styles.swipeBackground}><Text style={styles.swipeText}>Glisser pour accepter</Text><MaterialIcons name="chevron-right" color="rgba(255,255,255,0.3)" size={24} /></View>
            <Animated.View style={[styles.swipeThumb, { transform: [{ translateX: pan }] }]} {...panResponder.panHandlers}><MaterialIcons name="keyboard-double-arrow-right" color="#000" size={24} /></Animated.View>
          </View>
          <TouchableOpacity style={styles.refuseBtn} onPress={() => setShowRefusalModal(true)}>
            <Text style={styles.refuseText}>Refuser le cas</Text>
          </TouchableOpacity>
        </View>
      ) : isEnRoute && (
        <View style={[styles.stickyFooter, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          <TouchableOpacity style={styles.admissionBtn} onPress={handleGoToAdmission}>
            <MaterialIcons name="local-hospital" color="#000" size={24} />
            <Text style={styles.admissionBtnText}>Patient arrivé - Admettre</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 🔴 REFUSAL MODAL */}
      <Modal visible={showRefusalModal} transparent animationType="slide" onRequestClose={() => setShowRefusalModal(false)}>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Raison du refus</Text>
              <TouchableOpacity onPress={() => setShowRefusalModal(false)}><MaterialIcons name="close" color="rgba(255,255,255,0.4)" size={24} /></TouchableOpacity>
            </View>
            <Text style={styles.modalSub}>Veuillez indiquer pourquoi vous ne pouvez pas recevoir ce patient.</Text>

            <ScrollView showsVerticalScrollIndicator={false} style={styles.reasonsList}>
              {REFUSAL_REASONS.map((r, i) => (
                <TouchableOpacity key={i} style={[styles.reasonItem, selectedReason === r && styles.reasonItemActive]} onPress={() => setSelectedReason(r)}>
                  <Text style={[styles.reasonText, selectedReason === r && styles.reasonTextActive]}>{r}</Text>
                  {selectedReason === r && <MaterialIcons name="check-circle" color={colors.primary} size={20} />}
                </TouchableOpacity>
              ))}

              {selectedReason === "Autre raison" && (
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

            <TouchableOpacity style={styles.confirmRefusalBtn} onPress={handleRefuseCase}>
              <Text style={styles.confirmRefusalText}>CONFIRMER LE REFUS</Text>
            </TouchableOpacity>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.mainBackground },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, height: 60 },
  backBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { color: '#FFF', fontSize: 18, fontWeight: '800' },
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
  unitPhone: { color: colors.textMuted, fontSize: 13 },
  unitActions: { flexDirection: 'row', gap: 8 },
  unitBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.03)', justifyContent: 'center', alignItems: 'center' },
  trackingContainer: { paddingVertical: 20 },
  etaCard: { alignItems: 'center', marginBottom: 24 },
  etaLabel: { color: colors.secondary, fontSize: 12, fontWeight: '900', letterSpacing: 2, marginBottom: 8 },
  etaValue: { color: '#FFF', fontSize: 56, fontWeight: '900' },
  etaProgress: { width: 240, height: 6, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 3, marginTop: 16, overflow: 'hidden' },
  etaProgressFill: { width: '40%', height: '100%', backgroundColor: colors.secondary },
  liveMapContainer: { height: 350, marginHorizontal: 20, borderRadius: 30, overflow: 'hidden', borderWidth: 2, borderColor: 'rgba(68,138,255,0.2)' },
  liveMap: { flex: 1 },
  ambulanceMarker: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: '#FFF' },
  mapStatusBadge: { position: 'absolute', top: 16, left: 16, backgroundColor: 'rgba(0,0,0,0.7)', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, gap: 8 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF5252' },
  liveText: { color: '#FFF', fontSize: 11, fontWeight: '900' },
  horizontalScroll: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, marginTop: 24 },
  miniCard: { flex: 1, backgroundColor: '#1A1A1A', borderRadius: 18, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  miniLabel: { color: colors.textMuted, fontSize: 10, fontWeight: '800' },
  miniValue: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  stickyFooter: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 20, paddingTop: 16, backgroundColor: colors.mainBackground },
  swipeContainer: { height: 64, width: SWIPE_WIDTH, backgroundColor: '#1A1A1A', borderRadius: 32, padding: 4, justifyContent: 'center', overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  swipeBackground: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  swipeText: { color: 'rgba(255,255,255,0.4)', fontSize: 14, fontWeight: '700' },
  swipeThumb: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.success, justifyContent: 'center', alignItems: 'center' },
  refuseBtn: { alignSelf: 'center', marginTop: 12, paddingVertical: 8 },
  refuseText: { color: colors.primary, fontWeight: '800', fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5 },
  admissionBtn: { height: 64, borderRadius: 32, backgroundColor: colors.success, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 12 },
  admissionBtnText: { color: '#000', fontSize: 17, fontWeight: '800' },

  // Modal Style
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#1A1A1A', borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24, minHeight: 450 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  modalTitle: { color: '#FFF', fontSize: 20, fontWeight: '800' },
  modalSub: { color: 'rgba(255,255,255,0.4)', fontSize: 14, marginBottom: 24 },
  reasonsList: { maxHeight: 300 },
  reasonItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#000', padding: 16, borderRadius: 16, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  reasonItemActive: { borderColor: colors.primary, backgroundColor: 'rgba(255, 59, 48, 0.05)' },
  reasonText: { color: 'rgba(255,255,255,0.6)', fontSize: 15, fontWeight: '600' },
  reasonTextActive: { color: colors.primary, fontWeight: '800' },
  reasonInput: { backgroundColor: '#000', borderRadius: 16, padding: 16, color: '#FFF', fontSize: 15, marginTop: 8, minHeight: 80, textAlignVertical: 'top', borderWidth: 1, borderColor: colors.primary },
  confirmRefusalBtn: { backgroundColor: colors.primary, height: 60, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginTop: 24 },
  confirmRefusalText: { color: '#FFF', fontSize: 16, fontWeight: '900', letterSpacing: 1 }
});
