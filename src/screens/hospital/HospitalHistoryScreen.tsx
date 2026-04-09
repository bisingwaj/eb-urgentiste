import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { MOCK_CASES } from './HospitalDashboardTab';

export function HospitalHistoryScreen({ navigation }: any) {
  const [filter, setFilter] = useState('all');
  const pastCases = MOCK_CASES.filter(c => c.status === 'termine');

  const StatTile = ({ label, value, color, icon }: any) => (
    <View style={styles.statTile}>
      <View style={[styles.statIcon, { backgroundColor: color + '20' }]}>
        <MaterialIcons name={icon} color={color} size={20} />
      </View>
      <View>
        <Text style={styles.statValue}>{value}</Text>
        <Text style={styles.statLabel}>{label}</Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      {/* App bar */}
      <View style={styles.appBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.appBarTitle}>Historique & Analyses</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        {/* Analytics Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Performance mensuelle (KPIs)</Text>
          <View style={styles.statsGrid}>
            <StatTile label="Cases" value="128" color={colors.secondary} icon="equalizer" />
            <StatTile label="Response" value="8m" color={colors.primary} icon="speed" />
            <StatTile label="Taux RAD" value="82%" color={colors.success} icon="trending-up" />
            <StatTile label="Décès" value="2%" color="#FFF" icon="remove-circle-outline" />
          </View>
        </View>

        {/* History List */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Derniers dossiers traités</Text>
            <TouchableOpacity style={styles.filterBtn}>
              <MaterialIcons name="filter-list" color={colors.secondary} size={20} />
              <Text style={styles.filterText}>Filtrer</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.historyList}>
            {pastCases.length === 0 ? (
              <View style={styles.emptyState}>
                <MaterialIcons name="history" color="rgba(255,255,255,0.05)" size={64} />
                <Text style={styles.emptyText}>Aucun historique disponible</Text>
              </View>
            ) : (
              pastCases.map((item) => (
                <TouchableOpacity key={item.id} style={styles.historyCard} onPress={() => navigation.navigate('HospitalReport', { caseData: item })}>
                  <View style={styles.historyTop}>
                    <View style={styles.historyPatient}>
                      <View style={styles.avatar}>
                        <Text style={styles.avatarText}>{item.victimName.charAt(0)}</Text>
                      </View>
                      <View>
                        <Text style={styles.nameText}>{item.victimName}</Text>
                        <Text style={styles.idText}>{item.id} · {item.timestamp}</Text>
                      </View>
                    </View>
                    <View style={[styles.outcomePill, { backgroundColor: item.outcome === 'sorti' ? colors.success + '20' : colors.primary + '20' }]}>
                      <Text style={[styles.outcomeText, { color: item.outcome === 'sorti' ? colors.success : colors.primary }]}>{item.outcome?.toUpperCase()}</Text>
                    </View>
                  </View>
                  <View style={styles.divider} />
                  <View style={styles.historyBottom}>
                    <Text style={styles.diagnosisPreview} numberOfLines={1}>{item.finalDiagnosis}</Text>
                    <MaterialIcons name="chevron-right" color="rgba(255,255,255,0.2)" size={20} />
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>
        </View>
      </ScrollView>
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
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  statTile: { width: '47%' as any, backgroundColor: '#1A1A1A', borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  statIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  statValue: { color: '#FFF', fontSize: 18, fontWeight: '800' },
  statLabel: { color: colors.textMuted, fontSize: 12 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  filterBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  filterText: { color: colors.secondary, fontSize: 14, fontWeight: '600' },
  historyList: { gap: 12 },
  historyCard: { backgroundColor: '#1A1A1A', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  historyTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  historyPatient: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.08)', justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  nameText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  idText: { color: colors.textMuted, fontSize: 13 },
  outcomePill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  outcomeText: { fontSize: 12, fontWeight: '800' },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.03)', marginBottom: 12 },
  historyBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  diagnosisPreview: { color: 'rgba(255,255,255,0.5)', fontSize: 13, flex: 1 },
  emptyState: { alignItems: 'center', paddingVertical: 60, gap: 16 },
  emptyText: { color: 'rgba(255,255,255,0.1)', fontSize: 16 },
});
