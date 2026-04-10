import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Alert,
  StatusBar,
  ScrollView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import type { EmergencyCase } from './HospitalDashboardTab';
import {
  TRANSPORT_MODE_OPTIONS,
  normalizeLegacyTransportMode,
  transportModeAccentColor,
  type TransportModeCode,
} from '../../lib/transportMode';

const ARRIVAL_STATES = [
  { key: 'stable', label: 'Stable', icon: 'check-circle-outline' as const, color: '#69F0AE' },
  { key: 'critique', label: 'Critique', icon: 'alert-decagram-outline' as const, color: '#FF5252' },
  { key: 'inconscient', label: 'Inconscient', icon: 'eye-off-outline' as const, color: '#FF9800' },
];

const SERVICES = [
  { key: 'urgence_generale', label: 'Urgence Générale', icon: 'hospital-building' as const, color: colors.secondary },
  { key: 'trauma', label: 'Traumatologie', icon: 'bone' as const, color: '#FF5252' },
  { key: 'pediatrie', label: 'Pédiatrie', icon: 'baby-face-outline' as const, color: '#AB47BC' },
];

import { useHospital } from '../../contexts/HospitalContext';

export function HospitalAdmissionScreen({ route, navigation }: any) {
  const { caseData } = route.params as { caseData: EmergencyCase };
  const { updateCaseStatus } = useHospital();
  const insets = useSafeAreaInsets();

  const now = new Date();
  const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

  const [step, setStep] = useState(1);
  const [arrivalTime] = useState(caseData.arrivalTime || timeStr);
  const [arrivalMode, setArrivalMode] = useState<TransportModeCode | ''>(() =>
    normalizeLegacyTransportMode(caseData.arrivalMode),
  );
  const [arrivalState, setArrivalState] = useState(caseData.arrivalState || '');
  const [admissionService, setAdmissionService] = useState(caseData.admissionService || '');

  const totalSteps = 3;

  const handleNext = () => {
    if (step < totalSteps) {
      setStep(step + 1);
    } else {
      handleValidate();
    }
  };

  const handlePrev = () => {
    if (step > 1) {
      setStep(step - 1);
    } else {
      navigation.goBack();
    }
  };

  const handleValidate = () => {
    Alert.alert(
      'Admission Patient',
      `Confirmer l'admission de ${caseData.victimName} ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'CONFIRMER',
          onPress: async () => {
            try {
              await updateCaseStatus(caseData.id, {
                status: 'admis',
                data: {
                  arrivalTime,
                  arrivalMode,
                  arrivalState,
                  admissionService,
                }
              });

              navigation.navigate('HospitalTriage', {
                caseData: {
                  ...caseData,
                  status: 'admis',
                  arrivalTime,
                  arrivalMode,
                  arrivalState,
                  admissionService,
                }
              });
            } catch (err) {
              Alert.alert('Erreur', 'Impossible d\'enregistrer l\'admission.');
            }
          },
        },
      ]
    );
  };

  const renderStepContent = () => {
    switch (step) {
      case 1:
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Mode d'arrivée</Text>
            <Text style={styles.stepSubtitle}>
              Même codification que le mode de transport côté urgentiste (mission).
            </Text>
            <View style={styles.transportModeGrid}>
              {TRANSPORT_MODE_OPTIONS.map((mode) => {
                const isSelected = arrivalMode === mode.key;
                const accent = transportModeAccentColor(mode.accent);
                return (
                  <TouchableOpacity
                    key={mode.key}
                    style={[
                      styles.transportModeCard,
                      mode.emphasizeBorder && { borderColor: colors.primary + '40' },
                      isSelected && { borderColor: accent, backgroundColor: accent + '12' },
                    ]}
                    onPress={() => {
                      setArrivalMode(mode.key);
                      setTimeout(() => setStep(2), 350);
                    }}
                    activeOpacity={0.8}
                  >
                    <View
                      style={[
                        styles.transportModeIconWrap,
                        { backgroundColor: accent + '18' },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={mode.icon as any}
                        color={isSelected ? accent : 'rgba(255,255,255,0.35)'}
                        size={26}
                      />
                    </View>
                    <Text
                      style={[
                        styles.transportModeLabel,
                        mode.accent === 'primary' && { color: colors.primary },
                        isSelected && { color: '#FFF' },
                      ]}
                      numberOfLines={2}
                    >
                      {mode.label}
                    </Text>
                    {isSelected && (
                      <MaterialIcons name="check-circle" color={accent} size={20} style={styles.cardCheck} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        );
      case 2:
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>État global</Text>
            <Text style={styles.stepSubtitle}>Évaluation rapide de l'état clinique à l'entrée.</Text>
            <View style={styles.verticalList}>
              {ARRIVAL_STATES.map((state) => {
                const isSelected = arrivalState === state.key;
                return (
                  <TouchableOpacity
                    key={state.key}
                    style={[styles.premiumRow, isSelected && { borderColor: state.color, backgroundColor: state.color + '08' }]}
                    onPress={() => {
                      setArrivalState(state.key);
                      setTimeout(() => setStep(3), 350);
                    }}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.rowIconBox, { backgroundColor: state.color + '15' }]}>
                      <MaterialCommunityIcons name={state.icon as any} color={state.color} size={24} />
                    </View>
                    <Text style={[styles.rowLabel, isSelected && { color: '#FFF' }]}>{state.label}</Text>
                    <View style={[styles.customRadio, isSelected && { backgroundColor: state.color }]}>
                      {isSelected && <MaterialIcons name="check" color="#000" size={14} />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        );
      case 3:
        return (
          <View style={styles.stepContent}>
            <Text style={styles.stepTitle}>Orientation</Text>
            <Text style={styles.stepSubtitle}>Vers quel service orienter l'admission ?</Text>
            <View style={styles.verticalList}>
              {SERVICES.map((service) => {
                const isSelected = admissionService === service.key;
                return (
                  <TouchableOpacity
                    key={service.key}
                    style={[styles.premiumRow, isSelected && { borderColor: service.color, backgroundColor: service.color + '08' }]}
                    onPress={() => setAdmissionService(service.key)}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.rowIconBox, { backgroundColor: service.color + '15' }]}>
                      <MaterialCommunityIcons name={service.icon as any} color={service.color} size={24} />
                    </View>
                    <Text style={[styles.rowLabel, isSelected && { color: '#FFF' }]}>{service.label}</Text>
                    <View style={[styles.customRadio, isSelected && { backgroundColor: service.color }]}>
                      {isSelected && <MaterialIcons name="check" color="#000" size={14} />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        );
      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" />

      {/* Premium Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handlePrev} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerSub}>PROCESSUS D'ADMISSION</Text>
          <View style={styles.progressRow}>
            {[1, 2, 3].map((s) => (
              <View key={s} style={[styles.progressDot, s <= step && styles.progressDotActive, s < step && { backgroundColor: colors.success }]} />
            ))}
          </View>
        </View>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        {/* Patient Context Card */}
        <View style={styles.patientContext}>
          <View style={styles.patientMain}>
            <View style={styles.avatarBox}>
              <Text style={styles.avatarText}>{caseData.victimName.charAt(0)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.patientTitle}>{caseData.victimName}</Text>
              <Text style={styles.patientMeta}>{caseData.sex} · {caseData.age} ans · ID: {caseData.id}</Text>
            </View>
            <View style={styles.timeTag}>
              <MaterialIcons name="schedule" color={colors.secondary} size={14} />
              <Text style={styles.timeText}>{arrivalTime}</Text>
            </View>
          </View>
        </View>

        <View style={styles.mainContent}>
          {renderStepContent()}
        </View>
      </ScrollView>

      {/* Footer Actions */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 20) }]}>
        <TouchableOpacity
          style={[
            styles.primaryBtn,
            step === 1 && !arrivalMode && styles.btnDisabled,
            step === 2 && !arrivalState && styles.btnDisabled,
            step === 3 && !admissionService && styles.btnDisabled,
          ]}
          onPress={handleNext}
          disabled={(step === 1 && !arrivalMode) || (step === 2 && !arrivalState) || (step === 3 && !admissionService)}
        >
          <Text style={styles.primaryBtnText}>
            {step === totalSteps ? 'ADMETTRE LE PATIENT' : 'CONTINUER'}
          </Text>
          <MaterialIcons name={step === totalSteps ? 'check-circle' : 'east'} color="#000" size={20} />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.mainBackground },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, height: 70 },
  backBtn: { width: 44, height: 44, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.05)', justifyContent: 'center', alignItems: 'center' },
  headerInfo: { alignItems: 'center' },
  headerSub: { color: 'rgba(255,255,255,0.3)', fontSize: 12, fontWeight: '900', letterSpacing: 1.5, marginBottom: 8 },
  progressRow: { flexDirection: 'row', gap: 6 },
  progressDot: { width: 24, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.1)' },
  progressDotActive: { backgroundColor: colors.secondary, width: 32 },

  scrollContainer: { paddingBottom: 120 },

  patientContext: { marginHorizontal: 20, marginTop: 10 },
  patientMain: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1A1A', borderRadius: 24, padding: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  avatarBox: { width: 44, height: 44, borderRadius: 16, backgroundColor: 'rgba(56, 182, 255, 0.1)', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  avatarText: { color: colors.secondary, fontSize: 18, fontWeight: '800' },
  patientTitle: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  patientMeta: { color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 2 },
  timeTag: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(56, 182, 255, 0.1)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  timeText: { color: colors.secondary, fontSize: 13, fontWeight: '900' },

  mainContent: { paddingHorizontal: 20, paddingTop: 32 },
  stepContent: { flex: 1 },
  stepTitle: { color: '#FFF', fontSize: 24, fontWeight: '900', marginBottom: 6 },
  stepSubtitle: { color: 'rgba(255,255,255,0.4)', fontSize: 14, marginBottom: 32, lineHeight: 20 },

  transportModeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
    paddingBottom: 8,
  },
  transportModeCard: {
    width: '48%',
    backgroundColor: '#161616',
    borderRadius: 20,
    paddingVertical: 18,
    paddingHorizontal: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    minHeight: 128,
  },
  transportModeIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  transportModeLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
  cardCheck: { position: 'absolute', top: 10, right: 10 },

  verticalList: { gap: 12 },
  premiumRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1A1A', padding: 20, borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', gap: 16 },
  rowIconBox: { width: 48, height: 48, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  rowLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 16, fontWeight: '700', flex: 1 },
  customRadio: { width: 22, height: 22, borderRadius: 8, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' },

  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 20, paddingTop: 16, backgroundColor: colors.mainBackground },
  primaryBtn: { height: 64, borderRadius: 24, backgroundColor: colors.success, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 12, shadowColor: colors.success, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 16 },
  primaryBtnText: { color: '#000', fontSize: 15, fontWeight: '900', letterSpacing: 0.5 },
  btnDisabled: { opacity: 0.2 },
});
