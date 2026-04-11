import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../theme/colors';
import { MaterialIcons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface FieldReport {
  id: string;
  category: string;
  severity: string;
  description: string;
  status: string;
  created_at: string;
  location_lat: number | null;
  location_lng: number | null;
  media_urls?: string[] | null;
  resolution_notes?: string | null;
}

const CATEGORY_MAP: Record<string, { label: string; icon: keyof typeof MaterialIcons.glyphMap }> = {
  vehicle: { label: 'Véhicule', icon: 'local-shipping' },
  equipment: { label: 'Matériel', icon: 'build' },
  network: { label: 'Réseau', icon: 'wifi-off' },
  other: { label: 'Autre', icon: 'error' },
};

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  new: { label: 'NOUVEAU', color: colors.secondary },
  in_progress: { label: 'EN COURS', color: '#FF9800' },
  resolved: { label: 'RÉSOLU', color: colors.success },
  rejected: { label: 'REJETÉ', color: colors.primary },
};

const SEVERITY_MAP: Record<string, { label: string; color: string }> = {
  low: { label: 'Faible', color: colors.secondary },
  medium: { label: 'Modérée', color: '#FF9800' },
  high: { label: 'Critique', color: colors.primary },
};

function formatDate(isoString: string): string {
  const d = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "À l'instant";
  if (diffMins < 60) return `Il y a ${diffMins} min`;
  if (diffHours < 24) return `Il y a ${diffHours}h`;
  if (diffDays < 7) return `Il y a ${diffDays}j`;

  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ══════════════════════════════════════════════════════
// Module-level cache — survit au mount/unmount du composant
// ══════════════════════════════════════════════════════
let _cachedReports: FieldReport[] = [];
let _cachedUserId: string | null = null;
let _hasFetched = false;
let _realtimeChannel: ReturnType<typeof supabase.channel> | null = null;
const _listeners = new Set<(reports: FieldReport[]) => void>();

function notifyListeners() {
  _listeners.forEach(fn => fn([..._cachedReports]));
}

/** Fetch initial (une seule fois pour toute la vie de l'app) */
async function ensureDataLoaded(): Promise<void> {
  if (_hasFetched) return;
  _hasFetched = true;

  try {
    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (!userId) return;
    _cachedUserId = userId;

    const { data, error } = await supabase
      .from('field_reports')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    _cachedReports = (data as FieldReport[]) || [];
    notifyListeners();
  } catch (err: any) {
    console.error('[SuiviSignalements] Erreur fetch:', err.message);
  }

  // Démarrer le Realtime une seule fois
  ensureRealtime();
}

/** Souscription Realtime permanente (jamais fermée sauf logout) */
function ensureRealtime() {
  if (_realtimeChannel) return;

  _realtimeChannel = supabase
    .channel('field-reports-live')
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'field_reports' },
      (payload: any) => {
        const updated = payload.new;
        if (!updated?.id || updated.user_id !== _cachedUserId) return;

        _cachedReports = _cachedReports.map(r =>
          r.id === updated.id ? { ...r, ...updated } : r,
        );
        notifyListeners();
      },
    )
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'field_reports' },
      (payload: any) => {
        const inserted = payload.new;
        if (!inserted?.id || inserted.user_id !== _cachedUserId) return;
        if (_cachedReports.some(r => r.id === inserted.id)) return;

        _cachedReports = [inserted as FieldReport, ..._cachedReports];
        notifyListeners();
      },
    );

  _realtimeChannel.subscribe();
}

// ══════════════════════════════════════════════════════
// Component — lecture du cache, zéro re-fetch au focus
// ══════════════════════════════════════════════════════

export function SuiviSignalementsScreen({ navigation }: any) {
  const { profile } = useAuth();
  const [reports, setReports] = useState<FieldReport[]>(_cachedReports);
  const [isLoading, setIsLoading] = useState(!_hasFetched);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // S'abonner aux mises à jour du cache module-level
  useEffect(() => {
    const listener = (updated: FieldReport[]) => {
      setReports(updated);
      setIsLoading(false);
    };
    _listeners.add(listener);

    // Lancer le fetch + realtime si pas encore fait
    ensureDataLoaded();

    return () => {
      _listeners.delete(listener);
    };
  }, []);

  // Pull-to-refresh manuel
  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const userId = _cachedUserId;
      if (!userId) return;

      const { data, error } = await supabase
        .from('field_reports')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      _cachedReports = (data as FieldReport[]) || [];
      notifyListeners();
    } catch (err: any) {
      console.error('[SuiviSignalements] Erreur refresh:', err.message);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  const renderItem = ({ item }: { item: FieldReport }) => {
    const cat = CATEGORY_MAP[item.category] || { label: item.category, icon: 'error' as const };
    const status = STATUS_MAP[item.status] || { label: item.status.toUpperCase(), color: 'rgba(255,255,255,0.4)' };
    const sev = SEVERITY_MAP[item.severity] || { label: item.severity, color: 'rgba(255,255,255,0.4)' };

    return (
      <TouchableOpacity
        style={styles.reportCard}
        activeOpacity={0.8}
        onPress={() => navigation.navigate('SignalementDetail', { report: item })}
      >
        {/* Header */}
        <View style={styles.reportHeader}>
          <View style={styles.reportCatRow}>
            <View style={[styles.reportIconCircle, { backgroundColor: status.color + '12' }]}>
              <MaterialIcons name={cat.icon} color={status.color} size={22} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.reportCatLabel}>{cat.label}</Text>
              <Text style={styles.reportDate}>{formatDate(item.created_at)}</Text>
            </View>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: status.color + '15' }]}>
            <View style={[styles.statusDot, { backgroundColor: status.color }]} />
            <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
          </View>
        </View>

        {/* Description */}
        <Text style={styles.reportDescription} numberOfLines={2}>
          {item.description}
        </Text>

        {/* Footer */}
        <View style={styles.reportFooter}>
          <View style={[styles.sevPill, { backgroundColor: sev.color + '12' }]}>
            <Text style={[styles.sevPillText, { color: sev.color }]}>{sev.label}</Text>
          </View>
          {item.media_urls && item.media_urls.length > 0 && (
            <View style={styles.photoIndicator}>
              <MaterialIcons name="photo" color="rgba(255,255,255,0.35)" size={16} />
              <Text style={styles.photoIndicatorText}>{item.media_urls.length}</Text>
            </View>
          )}
          <View style={{ flex: 1 }} />
          <MaterialIcons name="chevron-right" color="rgba(255,255,255,0.15)" size={22} />
        </View>
      </TouchableOpacity>
    );
  };

  const renderEmpty = () => {
    if (isLoading) return null;
    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyIconCircle}>
          <MaterialIcons name="inbox" color="rgba(255,255,255,0.15)" size={48} />
        </View>
        <Text style={styles.emptyTitle}>Aucun signalement</Text>
        <Text style={styles.emptyDesc}>
          Vos rapports d'incidents apparaîtront ici après envoi.
        </Text>
        <TouchableOpacity
          style={styles.emptyBtn}
          onPress={() => navigation.navigate('SignalerProbleme')}
          activeOpacity={0.8}
        >
          <MaterialIcons name="add" color="#FFF" size={20} />
          <Text style={styles.emptyBtnText}>Créer un signalement</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.topHeader}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" color="#FFF" size={24} />
          </TouchableOpacity>
          <View style={{ flex: 1, paddingHorizontal: 15 }}>
            <Text style={styles.greetingText}>MES RAPPORTS</Text>
            <Text style={styles.hospitalName}>Suivi des signalements</Text>
          </View>
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{reports.length}</Text>
          </View>
        </View>
      </View>

      {/* Liste */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={colors.secondary} size="large" />
          <Text style={styles.loadingText}>Chargement des rapports...</Text>
        </View>
      ) : (
        <FlatList
          data={reports}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              tintColor={colors.secondary}
              colors={[colors.secondary]}
              progressBackgroundColor="#1A1A1A"
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.mainBackground },

  topHeader: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 24,
    borderBottomLeftRadius: 36,
    borderBottomRightRadius: 36,
    backgroundColor: '#0A0A0A',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: '#1A1A1A',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  greetingText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  hospitalName: {
    color: '#FFF',
    fontSize: 24,
    fontWeight: '700',
    marginTop: 4,
  },
  countBadge: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: colors.secondary + '15',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.secondary + '25',
  },
  countText: {
    color: colors.secondary,
    fontSize: 18,
    fontWeight: '900',
  },

  listContent: {
    padding: 20,
    paddingBottom: 40,
  },

  // ── Report Card ──
  reportCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 28,
    padding: 22,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  reportHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  reportCatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 14,
  },
  reportIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reportCatLabel: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '800',
  },
  reportDate: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    gap: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  reportDescription: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 21,
    marginBottom: 14,
  },
  reportFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sevPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
  },
  sevPillText: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  photoIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  photoIndicatorText: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 12,
    fontWeight: '700',
  },

  // ── Loading ──
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 14,
    fontWeight: '600',
  },

  // ── Empty ──
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 80,
    paddingHorizontal: 32,
  },
  emptyIconCircle: {
    width: 96,
    height: 96,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.04)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 8,
  },
  emptyDesc: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 28,
  },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.secondary,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 18,
    gap: 10,
  },
  emptyBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '800',
  },
});
