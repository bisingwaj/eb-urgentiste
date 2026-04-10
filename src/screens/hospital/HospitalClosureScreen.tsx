import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Platform,
  Alert,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import type { EmergencyCase } from './HospitalDashboardTab';
import { useHospital } from '../../contexts/HospitalContext';
import { outcomeKeyToDischargeType } from '../../lib/hospitalReportPayload';

const OUTCOME_OPTIONS = [
  { key: 'hospitalise', label: 'Hospitalisé', icon: 'local-hospital' as const, color: colors.secondary },
  { key: 'sorti', label: 'Sorti (RAD)', icon: 'home' as const, color: colors.success },
  { key: 'decede', label: 'Décédé', icon: 'sentiment-very-dissatisfied' as const, color: colors.primary },
];

export function HospitalClosureScreen({ route, navigation }: any) {
  const { caseData } = route.params as { caseData: EmergencyCase };
  const { updateCaseStatus, sendHospitalReport } = useHospital();
  const insets = useSafeAreaInsets();
  const [outcome, setOutcome] = useState('');
  const [finalDiagnosis, setFinalDiagnosis] = useState('');
  const [closureTime] = useState(new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }));

  const handleClose = () => {
    if (!outcome || !finalDiagnosis) {
      Alert.alert('Champs requis', 'Veuillez sélectionner une issue et entrer le diagnostic final.');
      return;
    }

    Alert.alert(
      'Fermer le cas',
      'Le cas va être archivé et un rapport automatique sera généré.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Clôturer',
          onPress: async () => {
            try {
              const dischargeType = outcomeKeyToDischargeType(outcome);
              const dischargedAt = new Date().toISOString();
              await updateCaseStatus(caseData.id, {
                status: 'termine',
                data: {
                  dischargeType,
                  dischargeNotes: finalDiagnosis,
                  dischargedAt,
                  outcome,
                  finalDiagnosis,
                  closureTime,
                },
              });
              const mergedCase: EmergencyCase = {
                ...caseData,
                status: 'termine',
                dischargeType,
                dischargedAt,
                finalDiagnosis,
                outcome,
                closureTime,
              };
              let reportAlreadySent = false;
              try {
                await sendHospitalReport(mergedCase);
                reportAlreadySent = true;
              } catch (repErr) {
                console.warn('[HospitalClosure] Rapport non envoyé, réessai possible depuis l’écran suivant.', repErr);
              }
              navigation.navigate('HospitalReport', {
                reportAlreadySent,
                caseData: {
                  ...mergedCase,
                  ...(reportAlreadySent ? { reportSent: true, reportSentAt: new Date().toISOString() } : {}),
                },
              });
            } catch {
              Alert.alert('Erreur', 'Impossible de clôturer le dossier sur le serveur.');
            }
          },
        },
      ]
    );
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* App bar */}
      <View style={styles.appBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.appBarTitle}>Clôture du cas</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 140 }}
      >
        {/* Outcome Selector */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Issue du cas</Text>
          <View style={styles.outcomeGrid}>
            {OUTCOME_OPTIONS.map((opt) => {
              const isSelected = outcome === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[
                    styles.outcomeCard,
                    isSelected && { borderColor: opt.color, backgroundColor: opt.color + '15' },
                  ]}
                  onPress={() => setOutcome(opt.key)}
                >
                  <MaterialIcons name={opt.icon} color={isSelected ? opt.color : colors.textMuted} size={32} />
                  <Text style={[styles.outcomeLabel, isSelected && { color: opt.color }]}>{opt.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Final Diagnosis */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Diagnostic final (CIM-10)</Text>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              value={finalDiagnosis}
              onChangeText={setFinalDiagnosis}
              placeholder="Ex: Infarctus du myocarde avec élévation du segment ST"
              placeholderTextColor="rgba(255,255,255,0.2)"
              multiline
            />
          </View>
        </View>

        {/* Time of Closure */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Heure de clôture</Text>
          <View style={styles.timeCard}>
            <MaterialIcons name="schedule" color={colors.textMuted} size={20} />
            <Text style={styles.timeText}>{closureTime}</Text>
          </View>
        </View>
      </ScrollView>

      {/* Primary Action */}
      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 20) }]}>
        <TouchableOpacity
          style={[styles.closeBtn, (!outcome || !finalDiagnosis) && styles.disabledBtn]}
          onPress={handleClose}
        >
          <Text style={styles.closeBtnText}>Générer le Rapport Final</Text>
          <MaterialIcons name="description" color="#FFF" size={24} />
        </TouchableOpacity>
      </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.mainBackground },
  appBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, height: 52 },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  appBarTitle: { color: '#FFF', fontSize: 17, fontWeight: '700' },
  scroll: { flex: 1 },
  section: { marginHorizontal: 20, marginTop: 24 },
  sectionTitle: { color: '#FFF', fontSize: 16, fontWeight: '700', marginBottom: 16 },
  outcomeGrid: { flexDirection: 'row', gap: 10 },
  outcomeCard: { flex: 1, backgroundColor: '#1A1A1A', borderRadius: 16, padding: 16, alignItems: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.08)', gap: 8 },
  outcomeLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  inputContainer: { backgroundColor: '#1A1A1A', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', padding: 16 },
  input: { color: '#FFF', fontSize: 14, minHeight: 80, lineHeight: 22 },
  timeCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1A1A', borderRadius: 14, padding: 16, gap: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  timeText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 20, paddingTop: 14, backgroundColor: colors.mainBackground, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' },
  closeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 16, borderRadius: 28, backgroundColor: colors.primary },
  closeBtnText: { color: '#FFF', fontWeight: '800', fontSize: 16 },
  disabledBtn: { opacity: 0.5 },
});
