import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Platform,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import type { EmergencyCase } from './HospitalDashboardTab';

const TRIAGE_LEVELS = [
  { key: 'rouge', label: 'Rouge', sublabel: 'Immédiat', color: '#FF5252', icon: 'emergency' as const },
  { key: 'orange', label: 'Orange', sublabel: 'Très urgent', color: '#FF9800', icon: 'warning' as const },
  { key: 'jaune', label: 'Jaune', sublabel: 'Urgent', color: '#FFD600', icon: 'schedule' as const },
  { key: 'vert', label: 'Vert', sublabel: 'Non urgent', color: '#69F0AE', icon: 'check-circle' as const },
];

export function HospitalTriageScreen({ route, navigation }: any) {
  const { caseData } = route.params as { caseData: EmergencyCase };
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState(1);
  const [triageLevel, setTriageLevel] = useState(caseData.triageLevel || '');
  const [vitals, setVitals] = useState({
    tension: caseData.vitals?.tension || '',
    heartRate: caseData.vitals?.heartRate || '',
    temperature: caseData.vitals?.temperature || '',
    satO2: caseData.vitals?.satO2 || '',
  });
  const [symptoms, setSymptoms] = useState(caseData.symptoms || '');
  const [diagnosis, setDiagnosis] = useState(caseData.provisionalDiagnosis || '');

  const totalSteps = 3;

  const handleNext = () => {
    if (step < totalSteps) {
      setStep(step + 1);
    } else {
      handleConfirm();
    }
  };

  const handlePrev = () => {
    if (step > 1) {
      setStep(step - 1);
    } else {
      navigation.goBack();
    }
  };

  const updateVital = (key: string, val: string) => {
    setVitals(prev => ({ ...prev, [key]: val }));
  };

  const handleConfirm = () => {
    Alert.alert(
      'Confirmer le triage',
      'Valider les données et passer à la prise en charge médicale ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Valider',
          onPress: () => {
            navigation.navigate('HospitalPriseEnCharge', {
              caseData: {
                ...caseData,
                status: 'triage' as const,
                triageLevel,
                vitals,
                symptoms,
                provisionalDiagnosis: diagnosis,
              }
            });
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
            <Text style={styles.stepTitle}>Niveau de gravité</Text>
            <Text style={styles.stepSubtitle}>Évaluation initiale de l'urgence (Protocole START)</Text>
            <View style={styles.triageGrid}>
              {TRIAGE_LEVELS.map((level) => {
                const isSelected = triageLevel === level.key;
                return (
                  <TouchableOpacity
                    key={level.key}
                    style={[styles.triageCard, isSelected && { borderColor: level.color, backgroundColor: level.color + '15' }]}
                    onPress={() => {
                      setTriageLevel(level.key);
                      setTimeout(() => setStep(2), 300);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.triageDot, { backgroundColor: level.color }]} />
                    <MaterialIcons name={level.icon} color={isSelected ? level.color : colors.textMuted} size={40} />
                    <Text style={[styles.triageLabel, isSelected && { color: level.color }]}>{level.label}</Text>
                    <Text style={styles.triageSublabel}>{level.sublabel}</Text>
                    {isSelected && (
                      <View style={[styles.checkMark, { backgroundColor: level.color }]}>
                        <MaterialIcons name="check" color="#FFF" size={14} />
                      </View>
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
            <Text style={styles.stepTitle}>Signes vitaux</Text>
            <Text style={styles.stepSubtitle}>Constantes physiologiques du patient</Text>
            <View style={styles.vitalsGrid}>
              {/* 2x2 GRID of cards */}
              <View style={styles.vitalCard}>
                <View style={styles.vitalHeader}>
                  <MaterialIcons name="speed" color="#FF5252" size={20} />
                  <Text style={styles.vitalLabel}>Tension</Text>
                </View>
                <TextInput
                  style={styles.vitalInput}
                  value={vitals.tension}
                  onChangeText={v => updateVital('tension', v)}
                  placeholder="120/80"
                  placeholderTextColor="rgba(255,255,255,0.2)"
                  keyboardType="default"
                />
                <Text style={styles.vitalUnit}>mmHg</Text>
              </View>
              <View style={styles.vitalCard}>
                <View style={styles.vitalHeader}>
                  <MaterialIcons name="favorite" color="#FF5252" size={20} />
                  <Text style={styles.vitalLabel}>Fréq. card.</Text>
                </View>
                <TextInput
                  style={styles.vitalInput}
                  value={vitals.heartRate}
                  onChangeText={v => updateVital('heartRate', v)}
                  placeholder="75"
                  placeholderTextColor="rgba(255,255,255,0.2)"
                  keyboardType="numeric"
                />
                <Text style={styles.vitalUnit}>bpm</Text>
              </View>
              <View style={styles.vitalCard}>
                <View style={styles.vitalHeader}>
                  <MaterialIcons name="air" color={colors.secondary} size={20} />
                  <Text style={styles.vitalLabel}>Sat. o₂</Text>
                </View>
                <TextInput
                  style={styles.vitalInput}
                  value={vitals.satO2}
                  onChangeText={v => updateVital('satO2', v)}
                  placeholder="98"
                  placeholderTextColor="rgba(255,255,255,0.2)"
                  keyboardType="numeric"
                />
                <Text style={styles.vitalUnit}>%</Text>
              </View>
              <View style={styles.vitalCard}>
                <View style={styles.vitalHeader}>
                  <MaterialIcons name="thermostat" color="#FF9800" size={20} />
                  <Text style={styles.vitalLabel}>Temp.</Text>
                </View>
                <TextInput
                  style={styles.vitalInput}
                  value={vitals.temperature}
                  onChangeText={v => updateVital('temperature', v)}
                  placeholder="37.0"
                  placeholderTextColor="rgba(255,255,255,0.2)"
                  keyboardType="decimal-pad"
                />
                <Text style={styles.vitalUnit}>°C</Text>
              </View>
            </View>
          </View>
        );
      case 3:
        return (
          <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
            <Text style={styles.stepTitle}>Observations</Text>
            <Text style={styles.stepSubtitle}>Symptômes et diagnostic provisoire</Text>
            <View style={styles.formGroup}>
              <Text style={styles.inputLabel}>Symptômes principaux</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={symptoms}
                onChangeText={setSymptoms}
                placeholder="Description des symptômes observés..."
                placeholderTextColor="rgba(255,255,255,0.2)"
                multiline
                numberOfLines={4}
              />
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.inputLabel}>Diagnostic provisoire</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={diagnosis}
                onChangeText={setDiagnosis}
                placeholder="Entrez le diagnostic de triage..."
                placeholderTextColor="rgba(255,255,255,0.2)"
                multiline
                numberOfLines={3}
              />
            </View>
          </ScrollView>
        );
      default:
        return null;
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handlePrev} style={styles.iconBtn}>
            <MaterialIcons name="arrow-back" size={24} color="#FFF" />
          </TouchableOpacity>
          <View style={styles.progressContainer}>
            <View style={styles.progressBarBg}>
              <View style={[styles.progressBarFill, { width: `${(step / totalSteps) * 100}%` }]} />
            </View>
            <Text style={styles.progressText}>Évaluation de triage · {step}/{totalSteps}</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.content}>
          {renderStepContent()}
        </View>

        {/* Footer */}
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          <TouchableOpacity style={styles.backStepBtn} onPress={handlePrev}>
            <Text style={styles.backStepText}>{step === 1 ? 'Annuler' : 'Précédent'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.nextBtn,
              step === 1 && !triageLevel && styles.btnDisabled,
              step === 2 && (!vitals.tension || !vitals.heartRate) && styles.btnDisabled,
            ]}
            onPress={handleNext}
            disabled={(step === 1 && !triageLevel) || (step === 2 && (!vitals.tension || !vitals.heartRate))}
          >
            <Text style={styles.nextBtnText}>{step === totalSteps ? 'Confirmer le triage' : 'Suivant'}</Text>
            <MaterialIcons name={step === totalSteps ? 'assignment-turned-in' : 'chevron-right'} color="#FFF" size={22} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.mainBackground },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, height: 60 },
  iconBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  progressContainer: { flex: 1, alignItems: 'center' },
  progressBarBg: { width: '80%', height: 4, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden', marginBottom: 8 },
  progressBarFill: { height: '100%', backgroundColor: colors.secondary },
  progressText: { color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  content: { flex: 1, paddingHorizontal: 24, paddingTop: 30 },
  stepContent: { flex: 1 },
  stepTitle: { color: '#FFF', fontSize: 24, fontWeight: '900', marginBottom: 10 },
  stepSubtitle: { color: 'rgba(255,255,255,0.4)', fontSize: 16, marginBottom: 30 },
  triageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  triageCard: { width: '47%' as any, backgroundColor: '#1A1A1A', borderRadius: 24, padding: 20, alignItems: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.05)', gap: 10 },
  triageDot: { width: 8, height: 8, borderRadius: 4, position: 'absolute', top: 16, left: 16 },
  triageLabel: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  triageSublabel: { color: 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: '600' },
  checkMark: { position: 'absolute', top: 12, right: 12, width: 22, height: 22, borderRadius: 11, justifyContent: 'center', alignItems: 'center' },
  vitalsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  vitalCard: { width: '48%' as any, backgroundColor: '#1A1A1A', borderRadius: 20, padding: 20, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.05)' },
  vitalHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  vitalLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  vitalInput: { color: '#FFF', fontSize: 26, fontWeight: '900', paddingVertical: 4 },
  vitalUnit: { color: 'rgba(255,255,255,0.3)', fontSize: 12, fontWeight: '600', marginTop: 4 },
  formGroup: { marginBottom: 24 },
  inputLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 14, fontWeight: '700', marginBottom: 10, marginLeft: 4 },
  input: { backgroundColor: '#1A1A1A', borderRadius: 16, padding: 20, color: '#FFF', fontSize: 16, fontWeight: '600', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.05)' },
  textArea: { minHeight: 120, textAlignVertical: 'top' },
  footer: { flexDirection: 'row', paddingHorizontal: 20, paddingTop: 16, gap: 12, backgroundColor: colors.mainBackground },
  backStepBtn: { flex: 1, height: 60, borderRadius: 30, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center' },
  backStepText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  nextBtn: { flex: 2, height: 60, borderRadius: 30, backgroundColor: colors.secondary, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 12 },
  nextBtnText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  btnDisabled: { opacity: 0.3 },
});
