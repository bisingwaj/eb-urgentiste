import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { getTransportModeLabel } from '../../lib/transportMode';
import type { EmergencyCase } from './HospitalDashboardTab';
import { useHospital } from '../../contexts/HospitalContext';

export function HospitalReportScreen({ route, navigation }: any) {
  const { caseData, reportAlreadySent: reportAlreadySentParam } = route.params as {
    caseData: EmergencyCase;
    reportAlreadySent?: boolean;
  };
  const { sendHospitalReport } = useHospital();
  const [sending, setSending] = useState(false);
  const alreadySent = reportAlreadySentParam === true || caseData.reportSent === true;

  const finishToTabs = () => navigation.getParent()?.reset({ index: 0, routes: [{ name: 'HospitalTabs' }] });

  const handleSendReport = async () => {
    if (alreadySent) {
      finishToTabs();
      return;
    }
    setSending(true);
    try {
      await sendHospitalReport(caseData);
      Alert.alert('Rapport transmis', 'Le rapport a été enregistré et transmis au centre.', [
        { text: 'Terminer', onPress: finishToTabs },
      ]);
    } catch (e: any) {
      Alert.alert('Erreur', e?.message ?? 'Impossible d’envoyer le rapport. Réessayez.');
    } finally {
      setSending(false);
    }
  };

  const SummaryItem = ({ label, value, icon, color }: any) => (
    <View style={styles.reportRow}>
      <View style={styles.reportLeft}>
        <MaterialIcons name={icon} color={color || colors.textMuted} size={18} />
        <Text style={styles.reportLabel}>{label}</Text>
      </View>
      <Text style={[styles.reportValue, color && { color }]}>{value}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      {/* App bar */}
      <View style={styles.appBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.appBarTitle}>Rapport Médical Automatisé</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        <View style={styles.headerSection}>
          <View style={styles.reportBadge}>
            <MaterialIcons name="check-circle" color={colors.success} size={32} />
            <Text style={styles.reportStatus}>Dossier Clôturé</Text>
          </View>
          <Text style={styles.reportId}>CAS ID: {caseData.id}</Text>
        </View>

        {/* Case Info Summary */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <MaterialIcons name="person" color={colors.secondary} size={20} />
            <Text style={styles.sectionTitle}>Identification & Information</Text>
          </View>
          <View style={styles.reportCard}>
            <SummaryItem label="Patient" value={caseData.victimName} icon="account-circle" />
            <SummaryItem label="Âge / Sexe" value={`${caseData.age} ans · ${caseData.sex}`} icon="info" />
            <SummaryItem label="Type d'urgence" value={caseData.typeUrgence} icon="medical-services" color={colors.primary} />
            <SummaryItem label="Heure d'arrivée" value={caseData.arrivalTime} icon="schedule" />
            <SummaryItem label="Mode d'arrivée" value={getTransportModeLabel(caseData.arrivalMode)} icon="local-shipping" />
          </View>
        </View>

        {/* Medical Summary */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <MaterialIcons name="analytics" color={colors.secondary} size={20} />
            <Text style={styles.sectionTitle}>Résumé Médical</Text>
          </View>
          <View style={styles.reportCard}>
            <SummaryItem label="Triage" value={caseData.triageLevel?.toUpperCase()} icon="assignment" />
            <SummaryItem label="Issue finale" value={caseData.outcome} icon="output" color={colors.success} />
            <SummaryItem label="Heure de clôture" value={caseData.closureTime} icon="timer-off" />

            <View style={styles.diagnosisSection}>
              <Text style={styles.diagnosisLabel}>DIAGNOSTIC FINAL :</Text>
              <Text style={styles.diagnosisText}>{caseData.finalDiagnosis}</Text>
            </View>
          </View>
        </View>

        {/* Treatment Timeline Summary */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <MaterialIcons name="history" color={colors.secondary} size={20} />
            <Text style={styles.sectionTitle}>Chronologie des interventions</Text>
          </View>
          <View style={styles.timelineSummary}>
            {caseData.interventions?.map((item, idx) => (
              <View key={item.id} style={styles.itemRow}>
                <View style={styles.itemDot} />
                <View style={styles.itemContent}>
                  <View style={styles.row}>
                    <Text style={styles.itemTime}>{item.time}</Text>
                    <Text style={styles.itemCategory}>{item.category}</Text>
                  </View>
                  <Text style={styles.itemDetail}>{item.detail}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      {/* Primary Action */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.sendBtn, sending && styles.sendBtnDisabled]}
          onPress={handleSendReport}
          disabled={sending}
        >
          {sending ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <>
              <Text style={styles.sendBtnText}>
                {alreadySent ? 'Terminer' : 'Transmettre au Centre Central'}
              </Text>
              <MaterialIcons name={alreadySent ? 'check' : 'send'} color="#FFF" size={24} />
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.mainBackground },
  appBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, height: 52 },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  appBarTitle: { color: '#FFF', fontSize: 17, fontWeight: '700' },
  scroll: { flex: 1 },
  headerSection: { alignItems: 'center', paddingVertical: 24, paddingHorizontal: 20 },
  reportBadge: { alignItems: 'center', marginBottom: 12 },
  reportStatus: { color: colors.success, fontSize: 18, fontWeight: '800', marginTop: 8 },
  reportId: { color: colors.textMuted, fontSize: 13, letterSpacing: 1.5, marginTop: 4 },
  section: { marginHorizontal: 20, marginTop: 24 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  sectionTitle: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  reportCard: { backgroundColor: '#1A1A1A', borderRadius: 16, paddingVertical: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  reportRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  reportLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  reportLabel: { color: colors.textMuted, fontSize: 14 },
  reportValue: { color: '#FFF', fontSize: 14, fontWeight: '600' },
  diagnosisSection: { padding: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)', marginTop: 8 },
  diagnosisLabel: { color: colors.secondary, fontSize: 12, fontWeight: '900', letterSpacing: 1, marginBottom: 8 },
  diagnosisText: { color: '#FFF', fontSize: 15, fontWeight: '600', lineHeight: 22 },
  timelineSummary: { backgroundColor: '#1A1A1A', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  itemRow: { flexDirection: 'row', gap: 12, paddingBottom: 16 },
  itemDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.secondary, marginTop: 6 },
  itemContent: { flex: 1 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  itemTime: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },
  itemCategory: { color: colors.secondary, fontSize: 13, fontWeight: '700' },
  itemDetail: { color: 'rgba(255,255,255,0.7)', fontSize: 13 },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 20, paddingBottom: Platform.OS === 'ios' ? 34 : 20, paddingTop: 14, backgroundColor: colors.mainBackground, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' },
  sendBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 16, borderRadius: 28, backgroundColor: colors.secondary },
  sendBtnDisabled: { opacity: 0.7 },
  sendBtnText: { color: '#FFF', fontWeight: '800', fontSize: 16 },
});
