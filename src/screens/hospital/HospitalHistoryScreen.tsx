import React, { useMemo, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { useAuth } from '../../contexts/AuthContext';
import { useHospital } from '../../contexts/HospitalContext';
import { supabase } from '../../lib/supabase';
type ReportRow = {
  id: string;
  dispatch_id: string;
  summary: string | null;
  sent_at: string;
};

function formatDurationMinutes(created?: string, completed?: string): number | null {
  if (!created || !completed) return null;
  const a = new Date(created).getTime();
  const b = new Date(completed).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return null;
  return Math.round((b - a) / 60000);
}

export function HospitalHistoryScreen({ navigation }: any) {
  const { profile } = useAuth();
  const { activeCases, isLoading: casesLoading, refresh } = useHospital();
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const structureId = profile?.health_structure_id;

  const pastCases = useMemo(() => {
    const list = activeCases.filter(
      (c) => c.dispatchStatus === 'completed' || c.dispatchStatus === 'cancelled',
    );
    return [...list].sort((a, b) => {
      const ta = a.completedAt ? new Date(a.completedAt).getTime() : 0;
      const tb = b.completedAt ? new Date(b.completedAt).getTime() : 0;
      return tb - ta;
    });
  }, [activeCases]);

  const kpis = useMemo(() => {
    const now = Date.now();
    const monthMs = 30 * 24 * 60 * 60 * 1000;
    const completed = pastCases.filter((c) => c.dispatchStatus === 'completed');
    const inMonth = completed.filter((c) => {
      if (!c.completedAt) return false;
      return now - new Date(c.completedAt).getTime() <= monthMs;
    });
    const total = inMonth.length;
    const durations = inMonth
      .map((c) => formatDurationMinutes(c.dispatchCreatedAt, c.completedAt))
      .filter((n): n is number => n != null);
    const avgMin =
      durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null;
    const guerisons = inMonth.filter((c) => c.dischargeType === 'guerison').length;
    const tauxGuerison = total > 0 ? Math.round((guerisons / total) * 100) : 0;
    const deces = inMonth.filter((c) => c.dischargeType === 'deces').length;
    const tauxDeces = total > 0 ? Math.round((deces / total) * 100) : 0;
    return { total, avgMin, tauxGuerison, tauxDeces };
  }, [pastCases]);

  const loadReports = useCallback(async () => {
    if (!structureId) return;
    setReportsLoading(true);
    try {
      const { data, error } = await supabase
        .from('hospital_reports')
        .select('id, dispatch_id, summary, sent_at')
        .eq('structure_id', structureId)
        .order('sent_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      setReports((data as ReportRow[]) || []);
    } catch (e) {
      console.warn('[HospitalHistory] hospital_reports', e);
      setReports([]);
    } finally {
      setReportsLoading(false);
    }
  }, [structureId]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
      await loadReports();
    } finally {
      setRefreshing(false);
    }
  }, [refresh, loadReports]);

  const loading = casesLoading && pastCases.length === 0;

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
      <View style={styles.appBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.appBarTitle}>Historique & Analyses</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.secondary} />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FFF" />}
        >
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Performance (30 jours glissants)</Text>
            <View style={styles.statsGrid}>
              <StatTile label="Cas clôturés" value={String(kpis.total)} color={colors.secondary} icon="equalizer" />
              <StatTile
                label="Durée moy."
                value={kpis.avgMin != null ? `${kpis.avgMin} min` : '—'}
                color={colors.primary}
                icon="speed"
              />
              <StatTile label="Taux RAD (guérison)" value={`${kpis.tauxGuerison}%`} color={colors.success} icon="trending-up" />
              <StatTile label="Décès" value={`${kpis.tauxDeces}%`} color="#FFF" icon="remove-circle-outline" />
            </View>
          </View>

          {structureId && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Rapports envoyés (récent)</Text>
              {reportsLoading ? (
                <ActivityIndicator color={colors.secondary} style={{ marginVertical: 12 }} />
              ) : reports.length === 0 ? (
                <Text style={styles.mutedSmall}>Aucun rapport enregistré pour cette structure.</Text>
              ) : (
                reports.slice(0, 8).map((r) => (
                  <View key={r.id} style={styles.reportRow}>
                    <MaterialIcons name="description" color={colors.textMuted} size={18} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.reportSummary} numberOfLines={2}>
                        {r.summary || `Dispatch ${r.dispatch_id.slice(0, 8)}…`}
                      </Text>
                      <Text style={styles.reportMeta}>
                        {new Date(r.sent_at).toLocaleString('fr-FR')}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          )}

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Derniers dossiers traités</Text>
            </View>

            <View style={styles.historyList}>
              {pastCases.length === 0 ? (
                <View style={styles.emptyState}>
                  <MaterialIcons name="history" color="rgba(255,255,255,0.05)" size={64} />
                  <Text style={styles.emptyText}>Aucun dossier clôturé pour le moment</Text>
                </View>
              ) : (
                pastCases.map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.historyCard}
                    onPress={() =>
                      navigation.navigate('HospitalReport', {
                        caseData: item,
                        reportAlreadySent: item.reportSent === true,
                      })
                    }
                  >
                    <View style={styles.historyTop}>
                      <View style={styles.historyPatient}>
                        <View style={styles.avatar}>
                          <Text style={styles.avatarText}>{item.victimName.charAt(0)}</Text>
                        </View>
                        <View>
                          <Text style={styles.nameText}>{item.victimName}</Text>
                          <Text style={styles.idText}>
                            {item.incidentReference || item.id.slice(0, 8)} ·{' '}
                            {item.completedAt
                              ? new Date(item.completedAt).toLocaleString('fr-FR')
                              : item.timestamp}
                          </Text>
                        </View>
                      </View>
                      <View
                        style={[
                          styles.outcomePill,
                          {
                            backgroundColor:
                              item.dischargeType === 'guerison' || item.outcome === 'sorti'
                                ? colors.success + '20'
                                : colors.primary + '20',
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.outcomeText,
                            {
                              color:
                                item.dischargeType === 'guerison' || item.outcome === 'sorti'
                                  ? colors.success
                                  : colors.primary,
                            },
                          ]}
                        >
                          {(item.dischargeType || item.outcome || '—').toString().toUpperCase()}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.divider} />
                    <View style={styles.historyBottom}>
                      <Text style={styles.diagnosisPreview} numberOfLines={1}>
                        {item.finalDiagnosis || '—'}
                      </Text>
                      <MaterialIcons name="chevron-right" color="rgba(255,255,255,0.2)" size={20} />
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </View>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.mainBackground },
  appBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 52,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  appBarTitle: { color: '#FFF', fontSize: 17, fontWeight: '700' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { flex: 1 },
  section: { marginHorizontal: 20, marginTop: 24 },
  sectionTitle: { color: '#FFF', fontSize: 16, fontWeight: '700', marginBottom: 16 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  statTile: {
    width: '47%' as any,
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  statIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  statValue: { color: '#FFF', fontSize: 18, fontWeight: '800' },
  statLabel: { color: colors.textMuted, fontSize: 12 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  historyList: { gap: 0 },
  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { color: colors.textMuted, marginTop: 12 },
  historyCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  historyTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  historyPatient: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { color: '#FFF', fontWeight: '800', fontSize: 18 },
  nameText: { color: '#FFF', fontWeight: '700', fontSize: 15 },
  idText: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  outcomePill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  outcomeText: { fontSize: 10, fontWeight: '800' },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.05)', marginVertical: 12 },
  historyBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  diagnosisPreview: { color: 'rgba(255,255,255,0.6)', fontSize: 13, flex: 1 },
  mutedSmall: { color: colors.textMuted, fontSize: 13 },
  reportRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  reportSummary: { color: '#FFF', fontSize: 14 },
  reportMeta: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
});
