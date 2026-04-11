import React from 'react';
import { View, Text, StyleSheet, FlatList, StatusBar, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';
import { useNotifications, Notification } from '../../hooks/useNotifications';
import { AppTouchableOpacity } from '../../components/ui/AppTouchableOpacity';

const TYPE_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  dispatch: { icon: 'local-shipping', color: '#FF3B30', label: 'Mission' },
  alert: { icon: 'warning', color: '#FF9500', label: 'Alerte' },
  system: { icon: 'info', color: colors.secondary, label: 'Système' },
  field_report: { icon: 'build', color: '#FFCC00', label: 'Rapport' },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "À l'instant";
  if (mins < 60) return `il y a ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `il y a ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `il y a ${days}j`;
}

export function NotificationsScreen({ navigation }: any) {
  const { notifications, unreadCount, isLoading, markAsRead, markAllAsRead } = useNotifications();

  const renderItem = ({ item }: { item: Notification }) => {
    const config = TYPE_CONFIG[item.type] || TYPE_CONFIG.system;
    return (
      <AppTouchableOpacity
        style={[styles.notifCard, !item.is_read && styles.notifCardUnread]}
        activeOpacity={0.8}
        onPress={() => {
          markAsRead(item.id);
          if (item.type === 'dispatch' && item.reference_id) {
            navigation.navigate('Signalement');
          }
        }}
      >
        <View style={[styles.iconBox, { backgroundColor: config.color + '15' }]}>
          <MaterialIcons name={config.icon as any} size={22} color={config.color} />
        </View>
        <View style={styles.notifContent}>
          <View style={styles.notifHeader}>
            <Text style={styles.notifTitle} numberOfLines={1}>{item.title}</Text>
            <Text style={styles.notifTime}>{timeAgo(item.created_at)}</Text>
          </View>
          {item.body && <Text style={styles.notifBody} numberOfLines={2}>{item.body}</Text>}
          <View style={styles.notifFooter}>
            <View style={[styles.typeBadge, { backgroundColor: config.color + '10' }]}>
              <Text style={[styles.typeBadgeText, { color: config.color }]}>{config.label}</Text>
            </View>
            {!item.is_read && <View style={styles.unreadDot} />}
          </View>
        </View>
      </AppTouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" />

      <View style={styles.header}>
        <AppTouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" color="#FFF" size={24} />
        </AppTouchableOpacity>
        <View style={{ flex: 1, marginLeft: 16 }}>
          <Text style={styles.headerSub}>CENTRE DE</Text>
          <Text style={styles.headerTitle}>Notifications</Text>
        </View>
        {unreadCount > 0 && (
          <AppTouchableOpacity style={styles.markAllBtn} onPress={markAllAsRead}>
            <MaterialIcons name="done-all" color={colors.secondary} size={20} />
            <Text style={styles.markAllText}>Tout lire</Text>
          </AppTouchableOpacity>
        )}
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.secondary} />
        </View>
      ) : notifications.length === 0 ? (
        <View style={styles.centered}>
          <MaterialCommunityIcons name="bell-off-outline" size={64} color="rgba(255,255,255,0.08)" />
          <Text style={styles.emptyTitle}>Aucune notification</Text>
          <Text style={styles.emptyDesc}>Vous recevrez ici les alertes de la centrale et les mises à jour système.</Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.mainBackground },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  backBtn: {
    width: 44, height: 44, borderRadius: 16, backgroundColor: '#1A1A1A',
    justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  headerSub: { color: 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: '800', letterSpacing: 1.5 },
  headerTitle: { color: '#FFF', fontSize: 24, fontWeight: '700', marginTop: 2 },
  markAllBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.secondary + '15', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12,
  },
  markAllText: { color: colors.secondary, fontSize: 12, fontWeight: '700' },

  list: { paddingVertical: 12 },

  notifCard: {
    flexDirection: 'row', marginHorizontal: 16, marginBottom: 8,
    backgroundColor: '#121212', borderRadius: 20, padding: 16, gap: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)',
  },
  notifCardUnread: {
    backgroundColor: '#161616',
    borderColor: colors.secondary + '15',
  },
  iconBox: { width: 48, height: 48, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  notifContent: { flex: 1 },
  notifHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
  notifTitle: { color: '#FFF', fontSize: 15, fontWeight: '700', flex: 1, marginRight: 8 },
  notifTime: { color: 'rgba(255,255,255,0.3)', fontSize: 13, fontWeight: '600' },
  notifBody: { color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: '500', lineHeight: 18, marginBottom: 8 },
  notifFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  typeBadgeText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.secondary },

  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  emptyTitle: { color: 'rgba(255,255,255,0.4)', fontSize: 18, fontWeight: '700', marginTop: 20 },
  emptyDesc: { color: 'rgba(255,255,255,0.2)', fontSize: 13, fontWeight: '500', textAlign: 'center', marginTop: 8, lineHeight: 20 },
});
