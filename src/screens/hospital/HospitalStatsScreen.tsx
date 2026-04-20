import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
ActivityIndicator,
  RefreshControl} from 'react-native';
import { AppTouchableOpacity } from '../../components/ui/AppTouchableOpacity';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { useHospital } from '../../contexts/HospitalContext';
import {
  computeRolling30dKpis,
  countActiveAdmissions,
  countByCaseStatusOpen,
  countByLevelOpen,
  countCriticalOpen,
  countPendingHospital,
  filterPastCases,
} from '../../lib/hospitalStats';
import { getLevelConfig, getStatusConfig } from './hospitalUtils';
import type { EmergencyCase, UrgencyLevel, CaseStatus } from './hospitalTypes';

export function HospitalStatsScreen({ navigation }: any) {
  const { activeCases, isLoading: casesLoading, refresh } = useHospital();
  const [refreshing, setRefreshing] = useState(false);

  const pastCases = useMemo(() => {
    const list = filterPastCases(activeCases);
    return [...list].sort((a, b) => {
      const ta = a.completedAt ? new Date(a.completedAt).getTime() : 0;
      const tb = b.completedAt ? new Date(b.completedAt).getTime() : 0;
      return tb - ta;
    });
  }, [activeCases]);

  const kpis = useMemo(() => computeRolling30dKpis(pastCases), [pastCases]);

  const pendingCount = useMemo(() => countPendingHospital(activeCases), [activeCases]);
  const criticalCount = useMemo(() => countCriticalOpen(activeCases), [activeCases]);
  const activeAdmissions = useMemo(() => countActiveAdmissions(activeCases), [activeCases]);

  const byLevel = useMemo(() => countByLevelOpen(activeCases), [activeCases]);
  const byStatus = useMemo(() => countByCaseStatusOpen(activeCases), [activeCases]);

  const statusEntries = useMemo(() => {
    return (Object.entries(byStatus) as [CaseStatus, number][])
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1]);
  }, [byStatus]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const loading = casesLoading && activeCases.length === 0;

  const StatTile = ({ label, value, color, icon }: any) => (
    <View style={styles.statTile}>
      <View style={[styles.statIcon, { backgroundColor: color + '20' }]}>
        <MaterialIcons name={icon} color={color} size={20} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.statValue}>{value}</Text>
        <Text style={styles.statLabel}>{label}</Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.appBar}>
        <AppTouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color="#FFF" />
        </AppTouchableOpacity>
        <Text style={styles.appBarTitle}>Statistiques du service</Text>
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
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FFF" />
          }
        >
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Vue d’ensemble</Text>
            <Text style={styles.sectionHint}>
              Alignée sur le tableau de bord et la liste Admissions (mêmes règles de comptage).
            </Text>
            <View style={styles.statsGrid}>
              <StatTile
                label="Alertes à répondre"
                value={String(pendingCount)}
                color="#FFB74D"
                icon="touch-app"
              />
              <StatTile
                label="Urgences vitales"
                value={String(criticalCount)}
                color="#FF5252"
                icon="warning"
              />
              <StatTile
                label="Admissions actives"
                value={String(activeAdmissions)}
                color={colors.secondary}
                icon="local-hospital"
              />
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>30 derniers jours (glissants)</Text>
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

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Répartition par niveau (dossiers ouverts)</Text>
            <View style={styles.barRow}>
              {(['critique', 'urgent', 'stable'] as const).map((lvl) => {
                const n = byLevel[lvl];
                const cfg = getLevelConfig(lvl);
                const max = Math.max(byLevel.critique, byLevel.urgent, byLevel.stable, 1);
                const pct = Math.round((n / max) * 100);
                return (
                  <View key={lvl} style={styles.barBlock}>
                    <View style={styles.barTrack}>
                      <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: cfg?.color ?? '#888' }]} />
                    </View>
                    <Text style={styles.barLabel}>{cfg?.label ?? lvl}</Text>
                    <Text style={styles.barValue}>{n}</Text>
                  </View>
                );
              })}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Répartition par statut (dossiers ouverts)</Text>
            {statusEntries.length === 0 ? (
              <Text style={styles.mutedSmall}>Aucun dossier ouvert pour l’instant.</Text>
            ) : (
              statusEntries.map(([st, n]) => {
                const cfg = getStatusConfig(st);
                return (
                  <View key={st} style={styles.statusRow}>
                    <View style={[styles.statusDot, { backgroundColor: (cfg?.color ?? '#888') + '40' }]} />
                    <Text style={styles.statusLabel}>{cfg?.label ?? st}</Text>
                    <Text style={styles.statusCount}>{n}</Text>
                  </View>
                );
              })
            )}
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
  sectionTitle: { color: '#FFF', fontSize: 16, fontWeight: '700', marginBottom: 8 },
  sectionHint: { color: colors.textMuted, fontSize: 12, marginBottom: 12, lineHeight: 16 },
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
  statLabel: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  barRow: { gap: 14 },
  barBlock: { marginBottom: 4 },
  barTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: 4 },
  barLabel: { color: colors.textMuted, fontSize: 12, marginTop: 6 },
  barValue: { color: '#FFF', fontSize: 18, fontWeight: '800', marginTop: 2 },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  statusDot: { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
  statusLabel: { color: '#FFF', fontSize: 14, flex: 1 },
  statusCount: { color: '#FFF', fontSize: 17, fontWeight: '800' },
  mutedSmall: { color: colors.textMuted, fontSize: 13 },
});
