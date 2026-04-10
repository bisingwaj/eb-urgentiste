import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StatusBar,
  Dimensions,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { TabScreenSafeArea } from '../../components/layout/TabScreenSafeArea';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { useHospital } from '../../contexts/HospitalContext';
import { getLevelConfig, getStatusConfig } from './HospitalDashboardTab';
import { navigateFromHospitalAdmissionsList } from '../../lib/hospitalNavigation';
import {
  ACTIVE_ADMISSION_STATUSES,
  filterPastCases,
  isCaseClosed,
} from '../../lib/hospitalStats';

const { width } = Dimensions.get('window');

export function HospitalAdmissionsListScreen({ navigation }: any) {
  const [searchQuery, setSearchQuery] = useState('');
  const { activeCases } = useHospital();

  // Filter only admitted cases (in route, triage, or actively being treated)
  const admittedCases = activeCases.filter(
    (c) =>
      !isCaseClosed(c) &&
      ACTIVE_ADMISSION_STATUSES.includes(c.status) &&
      (c.victimName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.id.toLowerCase().includes(searchQuery.toLowerCase())),
  );

  const recentPastCases = useMemo(() => {
    const list = filterPastCases(activeCases);
    return [...list]
      .sort((a, b) => {
        const ta = a.completedAt ? new Date(a.completedAt).getTime() : 0;
        const tb = b.completedAt ? new Date(b.completedAt).getTime() : 0;
        return tb - ta;
      })
      .slice(0, 8);
  }, [activeCases]);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <TabScreenSafeArea style={styles.safeArea}>
      <StatusBar barStyle="light-content" />

      {/* 🔝 Premium Header with Search */}
      <View style={styles.topSection}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.headerSub}>GESTION CLINIQUE</Text>
            <Text style={styles.title}>Admissions Active</Text>
          </View>
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{admittedCases.length}</Text>
          </View>
        </View>

        <View style={styles.searchBox}>
          <MaterialIcons name="search" color="rgba(255,255,255,0.3)" size={22} />
          <TextInput
            style={styles.searchInput}
            placeholder="Rechercher nom, ID, service..."
            placeholderTextColor="rgba(255,255,255,0.2)"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        <TouchableOpacity
          style={styles.historyLink}
          onPress={() => navigation.navigate('HospitalHistory')}
          activeOpacity={0.85}
        >
          <MaterialCommunityIcons name="history" color={colors.secondary} size={20} />
          <Text style={styles.historyLinkText}>Historique complet</Text>
          <MaterialIcons name="chevron-right" color="rgba(255,255,255,0.35)" size={22} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 140 }}
      >
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>LISTE DES PATIENTS PRÉSENTS</Text>
        </View>

        {admittedCases.length === 0 ? (
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons name="clipboard-text-search-outline" color="rgba(255,255,255,0.05)" size={100} />
            <Text style={styles.emptyTitle}>Aucun dossier actif</Text>
            <Text style={styles.emptySub}>Les patients admis ou en route apparaîtront ici.</Text>
          </View>
        ) : (
          admittedCases.map((item) => {
            const lCfg = getLevelConfig(item.level);
            const sCfg = getStatusConfig(item.status);

            return (
              <TouchableOpacity
                key={item.id}
                style={styles.alertCard}
                onPress={() => {
                  const fresh = activeCases.find((c) => c.id === item.id) ?? item;
                  navigateFromHospitalAdmissionsList(navigation, fresh);
                }}
                activeOpacity={0.9}
              >
                <View style={styles.cardInfo}>
                  <View style={styles.cardHeaderRow}>
                    <View style={styles.timePill}>
                      <MaterialCommunityIcons name="clock-outline" color="rgba(255,255,255,0.4)" size={14} />
                      <Text style={styles.timeText}>{item.arrivalTime || item.timestamp}</Text>
                    </View>
                    <View style={[styles.levelTag, { borderColor: lCfg.color }]}>
                      <Text style={[styles.levelLabelText, { color: lCfg.color }]}>{lCfg.label}</Text>
                    </View>
                  </View>

                  <Text style={styles.victimName}>{item.victimName}</Text>
                  <Text style={styles.urgencyType}>
                    {item.typeUrgence.toUpperCase()} · {(item.admissionService || 'EN ATTENTE').replace('_', ' ').toUpperCase()}
                  </Text>

                  <View style={styles.locationInfo}>
                    <MaterialIcons name="person-outline" color={colors.secondary} size={16} />
                    <Text style={styles.addressText} numberOfLines={1}>
                      {item.age} ans · {item.sex} · ID: {item.id}
                    </Text>
                  </View>

                  <View style={styles.cardDivider} />

                  <View style={styles.cardFooterRow}>
                    <View style={[styles.statusBadge, { backgroundColor: sCfg.bg }]}>
                      <MaterialIcons name={sCfg.icon} color={sCfg.color} size={14} />
                      <Text style={[styles.statusBadgeText, { color: sCfg.color }]}>{sCfg.label}</Text>
                    </View>
                    <View style={styles.etaContainer}>
                      <MaterialCommunityIcons name="chevron-right" color="rgba(255,255,255,0.2)" size={20} />
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })
        )}

        <View style={[styles.sectionHeader, styles.historySectionHeader]}>
          <Text style={styles.sectionLabel}>DERNIERS DOSSIERS CLÔTURÉS</Text>
        </View>

        {recentPastCases.length === 0 ? (
          <View style={styles.historyEmptyWrap}>
            <Text style={styles.historyEmptyText}>Aucun dossier clôturé récent.</Text>
          </View>
        ) : (
          recentPastCases.map((item) => {
            const lCfg = getLevelConfig(item.level);
            return (
              <TouchableOpacity
                key={item.id}
                style={styles.historyCard}
                onPress={() =>
                  navigation.navigate('HospitalReport', {
                    caseData: item,
                    reportAlreadySent: item.reportSent === true,
                  })
                }
                activeOpacity={0.9}
              >
                <View style={styles.historyCardLeft}>
                  <View style={styles.historyAvatar}>
                    <Text style={styles.historyAvatarText}>{item.victimName.charAt(0)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.historyName} numberOfLines={1}>
                      {item.victimName}
                    </Text>
                    <Text style={styles.historyMeta} numberOfLines={1}>
                      {item.incidentReference || item.id.slice(0, 8)} ·{' '}
                      {item.completedAt
                        ? new Date(item.completedAt).toLocaleString('fr-FR')
                        : item.timestamp}
                    </Text>
                  </View>
                </View>
                <View style={styles.historyCardRight}>
                  <View style={[styles.historyLevelPill, { borderColor: lCfg.color }]}>
                    <Text style={[styles.historyLevelText, { color: lCfg.color }]}>{lCfg.label}</Text>
                  </View>
                  <MaterialIcons name="chevron-right" color="rgba(255,255,255,0.2)" size={20} />
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
      </TabScreenSafeArea>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.mainBackground },
  topSection: { paddingHorizontal: 24, paddingTop: 10, paddingBottom: 24, backgroundColor: '#060606', borderBottomLeftRadius: 36, borderBottomRightRadius: 36 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  headerSub: { color: 'rgba(255,255,255,0.3)', fontSize: 12, fontWeight: '900', letterSpacing: 1.5, marginBottom: 4 },
  title: { color: '#FFF', fontSize: 26, fontWeight: '900' },
  countBadge: { backgroundColor: colors.secondary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14 },
  countText: { color: '#FFF', fontSize: 13, fontWeight: '900' },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#141414', borderRadius: 20, height: 56, paddingHorizontal: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  searchInput: { flex: 1, color: '#FFF', fontSize: 15, marginLeft: 12, fontWeight: '600' },
  historyLink: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    paddingVertical: 12,
    paddingHorizontal: 4,
    gap: 8,
  },
  historyLinkText: { flex: 1, color: '#FFF', fontSize: 15, fontWeight: '700' },
  sectionHeader: { paddingHorizontal: 24, marginVertical: 20 },
  historySectionHeader: { marginTop: 8, marginBottom: 12 },
  sectionLabel: { color: 'rgba(255,255,255,0.3)', fontSize: 13, fontWeight: '900', letterSpacing: 1.5 },
  emptyContainer: { alignItems: 'center', marginTop: 80 },
  emptyTitle: { color: 'rgba(255,255,255,0.2)', fontSize: 18, fontWeight: '800', marginTop: 20 },
  emptySub: { color: 'rgba(255,255,255,0.1)', fontSize: 14, marginTop: 8, textAlign: 'center', paddingHorizontal: 40 },

  // Dashboard Card Style
  alertCard: {
    backgroundColor: '#1A1A1A',
    marginHorizontal: 20,
    borderRadius: 32,
    padding: 22,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  cardInfo: { flex: 1 },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  timePill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.05)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  timeText: { color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '700' },
  levelTag: { borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  levelLabelText: { fontSize: 12, fontWeight: '900', letterSpacing: 0.5 },
  victimName: { color: '#FFF', fontSize: 22, fontWeight: '900', marginBottom: 4 },
  urgencyType: { color: colors.secondary, fontSize: 13, fontWeight: '800', letterSpacing: 0.8, marginBottom: 12 },
  locationInfo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  addressText: { color: 'rgba(255,255,255,0.4)', fontSize: 14, fontWeight: '600' },
  cardDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.05)', marginVertical: 18 },
  cardFooterRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14 },
  statusBadgeText: { fontSize: 13, fontWeight: '800' },
  etaContainer: { flexDirection: 'row', alignItems: 'center' },
  historyEmptyWrap: { paddingHorizontal: 24, paddingBottom: 8 },
  historyEmptyText: { color: 'rgba(255,255,255,0.25)', fontSize: 14, fontWeight: '600' },
  historyCard: {
    backgroundColor: '#1A1A1A',
    marginHorizontal: 20,
    borderRadius: 20,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  historyCardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  historyAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  historyAvatarText: { color: '#FFF', fontWeight: '800', fontSize: 16 },
  historyName: { color: '#FFF', fontWeight: '700', fontSize: 15 },
  historyMeta: { color: 'rgba(255,255,255,0.35)', fontSize: 12, marginTop: 2 },
  historyCardRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  historyLevelPill: { borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  historyLevelText: { fontSize: 11, fontWeight: '800' },
});
