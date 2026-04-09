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
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import type { EmergencyCase, MonitoringPatientStatus } from './HospitalDashboardTab';
import { useHospital } from '../../contexts/HospitalContext';

const STATUS_OPTIONS = [
  { key: 'amelioration' as const, label: 'Amélioration', icon: 'trending-up' as const, color: colors.success },
  { key: 'stable' as const, label: 'Stable', icon: 'trending-flat' as const, color: colors.secondary },
  { key: 'degradation' as const, label: 'Dégradation', icon: 'trending-down' as const, color: colors.primary },
];

const TRANSFER_OPTIONS = [
  { key: 'reanimation', label: 'Soins Intensifs', type: 'interne' as const },
  { key: 'chirurgie', label: 'Chirurgie', type: 'interne' as const },
  { key: 'autre_hospital', label: 'Autre Hôpital', type: 'externe' as const },
];

function initialFromCase(c: EmergencyCase): {
  patientStatus: MonitoringPatientStatus;
  notes: string;
  transferKey: string | null;
  otherHospitalText: string;
} {
  const patientStatus: MonitoringPatientStatus = c.monitoringStatus ?? 'stable';
  const notes = c.monitoringNotes ?? '';
  const tt = c.transferTarget;
  if (tt == null || String(tt).trim() === '') {
    return { patientStatus, notes, transferKey: null, otherHospitalText: '' };
  }
  const s = String(tt).trim();
  const byLabel = TRANSFER_OPTIONS.find((o) => o.label === s);
  if (byLabel && byLabel.key !== 'autre_hospital') {
    return { patientStatus, notes, transferKey: byLabel.key, otherHospitalText: '' };
  }
  const byKey = TRANSFER_OPTIONS.find((o) => o.key === s);
  if (byKey && byKey.key !== 'autre_hospital') {
    return { patientStatus, notes, transferKey: byKey.key, otherHospitalText: '' };
  }
  return { patientStatus, notes, transferKey: 'autre_hospital', otherHospitalText: s };
}

function resolveTransferTarget(transferKey: string | null, otherText: string): string | null {
  if (transferKey == null) return null;
  if (transferKey === 'autre_hospital') {
    const t = otherText.trim();
    return t.length > 0 ? t : null;
  }
  return TRANSFER_OPTIONS.find((o) => o.key === transferKey)?.label ?? null;
}

export function HospitalMonitoringScreen({ route, navigation }: any) {
  const { caseData } = route.params as { caseData: EmergencyCase };
  const { updateCaseStatus } = useHospital();
  const init = initialFromCase(caseData);

  const [patientStatus, setPatientStatus] = useState<MonitoringPatientStatus>(init.patientStatus);
  const [transferKey, setTransferKey] = useState<string | null>(init.transferKey);
  const [otherHospitalText, setOtherHospitalText] = useState(init.otherHospitalText);
  const [notes, setNotes] = useState(init.notes);
  const [saving, setSaving] = useState(false);

  const handleConfirm = async () => {
    const resolvedTransfer = resolveTransferTarget(transferKey, otherHospitalText);
    if (transferKey === 'autre_hospital' && !otherHospitalText.trim()) {
      Alert.alert('Transfert', 'Indiquez le nom de la structure pour un transfert externe, ou choisissez « Aucun transfert ».');
      return;
    }

    setSaving(true);
    try {
      await updateCaseStatus(caseData.id, {
        status: 'monitoring',
        data: {
          monitoringStatus: patientStatus,
          monitoringNotes: notes.trim(),
          transferTarget: resolvedTransfer,
        },
      });

      const nextCase: EmergencyCase = {
        ...caseData,
        status: 'monitoring',
        monitoringStatus: patientStatus,
        monitoringNotes: notes.trim(),
        transferTarget: resolvedTransfer,
      };

      navigation.navigate('HospitalClosure', { caseData: nextCase });
    } catch (e) {
      console.error(e);
      Alert.alert('Erreur', 'Impossible d’enregistrer le suivi sur le serveur.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.appBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.appBarTitle}>Monitoring Patient</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>État actuel du patient</Text>
          <View style={styles.statusGrid}>
            {STATUS_OPTIONS.map((status) => {
              const isSelected = patientStatus === status.key;
              return (
                <TouchableOpacity
                  key={status.key}
                  style={[
                    styles.statusCard,
                    isSelected && { borderColor: status.color, backgroundColor: status.color + '15' },
                  ]}
                  onPress={() => setPatientStatus(status.key)}
                >
                  <MaterialIcons name={status.icon} color={isSelected ? status.color : colors.textMuted} size={32} />
                  <Text style={[styles.statusLabel, isSelected && { color: status.color }]}>{status.label}</Text>
                  {isSelected && (
                    <View style={[styles.checkMark, { backgroundColor: status.color }]}>
                      <MaterialIcons name="check" color="#FFF" size={12} />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Transfert / Destination</Text>
          <View style={styles.transferList}>
            <TouchableOpacity
              style={[
                styles.transferCard,
                transferKey === null && { borderColor: colors.secondary, backgroundColor: 'rgba(68,138,255,0.08)' },
              ]}
              onPress={() => {
                setTransferKey(null);
                setOtherHospitalText('');
              }}
            >
              <View style={styles.transferLeft}>
                <MaterialIcons name="block" color={transferKey === null ? colors.secondary : colors.textMuted} size={20} />
                <View>
                  <Text style={[styles.transferLabel, transferKey === null && { color: '#FFF' }]}>Aucun transfert</Text>
                  <Text style={styles.transferType}>Patient suivi sur place</Text>
                </View>
              </View>
              <View style={[styles.radio, transferKey === null && { borderColor: colors.secondary, borderWidth: 6 }]} />
            </TouchableOpacity>

            {TRANSFER_OPTIONS.map((option) => {
              const isSelected = transferKey === option.key;
              return (
                <TouchableOpacity
                  key={option.key}
                  style={[
                    styles.transferCard,
                    isSelected && { borderColor: colors.secondary, backgroundColor: 'rgba(68,138,255,0.08)' },
                  ]}
                  onPress={() => setTransferKey(option.key)}
                >
                  <View style={styles.transferLeft}>
                    <MaterialIcons
                      name={option.type === 'interne' ? 'input' : 'output'}
                      color={isSelected ? colors.secondary : colors.textMuted}
                      size={20}
                    />
                    <View>
                      <Text style={[styles.transferLabel, isSelected && { color: '#FFF' }]}>{option.label}</Text>
                      <Text style={styles.transferType}>{option.type === 'interne' ? 'Transfert Interne' : 'Transfert Externe'}</Text>
                    </View>
                  </View>
                  <View style={[styles.radio, isSelected && { borderColor: colors.secondary, borderWidth: 6 }]} />
                </TouchableOpacity>
              );
            })}
          </View>

          {transferKey === 'autre_hospital' && (
            <View style={styles.otherHospitalBox}>
              <Text style={styles.otherHospitalLabel}>Nom de la structure cible</Text>
              <TextInput
                style={styles.otherHospitalInput}
                value={otherHospitalText}
                onChangeText={setOtherHospitalText}
                placeholder="Ex. CHU de Kinshasa"
                placeholderTextColor="rgba(255,255,255,0.25)"
              />
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notes cliniques complémentaires</Text>
          <View style={styles.noteContainer}>
            <TextInput
              style={styles.noteInput}
              value={notes}
              onChangeText={setNotes}
              placeholder="Saisissez vos observations ici..."
              placeholderTextColor="rgba(255,255,255,0.2)"
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>
        </View>
      </ScrollView>

      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.submitBtn, saving && styles.submitBtnDisabled]}
          onPress={handleConfirm}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <>
              <Text style={styles.submitBtnText}>Confirmer le Monitoring</Text>
              <MaterialIcons name="done-all" color="#FFF" size={24} />
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
  section: { marginHorizontal: 20, marginTop: 24 },
  sectionTitle: { color: '#FFF', fontSize: 16, fontWeight: '700', marginBottom: 16 },
  statusGrid: { flexDirection: 'row', gap: 10 },
  statusCard: { flex: 1, backgroundColor: '#1A1A1A', borderRadius: 16, padding: 16, alignItems: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.08)', gap: 8 },
  statusLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  checkMark: { position: 'absolute', top: 8, right: 8, width: 20, height: 20, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  transferList: { gap: 8 },
  transferCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#1A1A1A', borderRadius: 14, padding: 16, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.08)' },
  transferLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  transferLabel: { color: colors.textMuted, fontSize: 15, fontWeight: '600' },
  transferType: { color: 'rgba(255,255,255,0.3)', fontSize: 12 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: 'rgba(255,255,255,0.2)' },
  otherHospitalBox: { marginTop: 12 },
  otherHospitalLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: '600', marginBottom: 8 },
  otherHospitalInput: {
    backgroundColor: '#1A1A1A',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    color: '#FFF',
    fontSize: 15,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  noteContainer: { backgroundColor: '#1A1A1A', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', marginTop: 8 },
  noteInput: { color: '#FFF', fontSize: 14, padding: 16, minHeight: 120, lineHeight: 22 },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 20, paddingBottom: Platform.OS === 'ios' ? 34 : 20, paddingTop: 14, backgroundColor: colors.mainBackground, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' },
  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 16, borderRadius: 28, backgroundColor: colors.secondary },
  submitBtnDisabled: { opacity: 0.7 },
  submitBtnText: { color: '#FFF', fontWeight: '800', fontSize: 16 },
});
