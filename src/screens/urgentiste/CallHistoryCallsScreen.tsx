import React, { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

export type CallHistoryRow = {
  id: string;
  channel_name: string | null;
  call_type: string | null;
  status: string | null;
  started_at: string | null;
  answered_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  caller_name: string | null;
  has_video: boolean | null;
};

function formatWhen(iso: string | null): string {
  if (!iso) {
    return '—';
  }
  try {
    const d = new Date(iso);
    return d.toLocaleString('fr-FR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function statusLabel(status: string | null): { text: string; color: string } {
  switch (status) {
    case 'active':
      return { text: 'En cours', color: colors.success };
    case 'completed':
      return { text: 'Terminé', color: colors.secondary };
    case 'ringing':
      return { text: 'Sonnerie', color: '#FF9800' };
    case 'missed':
      return { text: 'Manqué', color: '#E53935' };
    case 'failed':
      return { text: 'Échec', color: '#E53935' };
    default:
      return { text: status ?? '—', color: colors.textMuted };
  }
}

export function CallHistoryCallsScreen({ navigation }: { navigation: { goBack: () => void } }) {
  const { session } = useAuth();
  const [rows, setRows] = useState<CallHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const uid = session?.user?.id;
    if (!uid) {
      setRows([]);
      setLoadError(null);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    setLoadError(null);

    let { data, error } = await supabase
      .from('call_history')
      .select(
        'id, channel_name, call_type, status, started_at, answered_at, ended_at, duration_seconds, caller_name, has_video'
      )
      .eq('citizen_id', uid)
      .order('started_at', { ascending: false })
      .limit(80);

    if (error && /started_at|column/i.test(error.message)) {
      ({ data, error } = await supabase
        .from('call_history')
        .select(
          'id, channel_name, call_type, status, started_at, answered_at, ended_at, duration_seconds, caller_name, has_video'
        )
        .eq('citizen_id', uid)
        .order('id', { ascending: false })
        .limit(80));
    }

    if (error) {
      console.error('[CallHistory]', error.message, error);
      setLoadError(error.message);
      setRows([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    let list = (data ?? []) as CallHistoryRow[];

    if (list.length === 0) {
      const prefix = `INT-${uid.replace(/-/g, '').slice(0, 8)}`;
      const res = await supabase
        .from('call_history')
        .select(
          'id, channel_name, call_type, status, started_at, answered_at, ended_at, duration_seconds, caller_name, has_video'
        )
        .like('channel_name', `${prefix}%`)
        .eq('call_type', 'internal')
        .order('started_at', { ascending: false })
        .limit(80);
      if (!res.error && res.data?.length) {
        list = res.data as CallHistoryRow[];
      } else if (res.error) {
        console.warn('[CallHistory] fallback channel_name:', res.error.message);
      }
    }

    setRows(list);
    setLoading(false);
    setRefreshing(false);
  }, [session?.user?.id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const onRefresh = () => {
    setRefreshing(true);
    void load();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} accessibilityLabel="Retour">
          <MaterialIcons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Appels centrale</Text>
        <View style={styles.backBtn} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.secondary} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.secondary} />}
          contentContainerStyle={rows.length === 0 ? styles.emptyList : styles.listPad}
          ListHeaderComponent={
            loadError ? (
              <View style={styles.errorBanner}>
                <MaterialIcons name="error-outline" size={22} color="#FFAB91" />
                <Text style={styles.errorText}>{loadError}</Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              {loadError
                ? 'Impossible de charger la liste. Vérifiez la connexion et les droits (RLS) sur call_history.'
                : 'Aucun appel enregistré pour le moment. Après un appel, revenez ici ou tirez pour actualiser.'}
            </Text>
          }
          renderItem={({ item }) => {
            const st = statusLabel(item.status);
            const type =
              item.call_type === 'internal'
                ? 'Vers la centrale'
                : item.call_type === 'outgoing'
                  ? 'Depuis la centrale'
                  : item.call_type ?? '—';
            const dur =
              item.duration_seconds != null
                ? `${Math.floor(item.duration_seconds / 60)}:${String(item.duration_seconds % 60).padStart(2, '0')}`
                : '—';
            return (
              <View style={styles.card}>
                <View style={styles.cardTop}>
                  <MaterialIcons
                    name={item.has_video ? 'videocam' : 'phone'}
                    size={22}
                    color={colors.secondary}
                  />
                  <View style={styles.cardMeta}>
                    <Text style={styles.cardTitle}>{item.caller_name?.trim() || 'Appel'}</Text>
                    <Text style={styles.cardSub}>{type}</Text>
                  </View>
                  <View style={[styles.badge, { backgroundColor: st.color + '22' }]}>
                    <Text style={[styles.badgeText, { color: st.color }]}>{st.text}</Text>
                  </View>
                </View>
                <Text style={styles.cardDetail}>
                  {formatWhen(item.started_at)} · Durée {dur}
                </Text>
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.mainBackground,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  backBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '700',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listPad: {
    padding: 16,
    paddingBottom: 32,
  },
  emptyList: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  emptyText: {
    color: colors.textMuted,
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 22,
    paddingHorizontal: 8,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(229, 57, 53, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(229, 57, 53, 0.35)',
  },
  errorText: {
    flex: 1,
    color: 'rgba(255,255,255,0.9)',
    fontSize: 14,
    lineHeight: 20,
  },
  card: {
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cardMeta: {
    flex: 1,
  },
  cardTitle: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  cardSub: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  cardDetail: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 13,
    marginTop: 10,
  },
});
