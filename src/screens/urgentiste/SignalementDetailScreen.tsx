import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Image,
  Dimensions,
  Animated,
  Vibration,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../theme/colors';
import { MaterialIcons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ── Constantes partagées ──

const CATEGORY_MAP: Record<string, { label: string; icon: keyof typeof MaterialIcons.glyphMap }> = {
  vehicle: { label: 'Véhicule', icon: 'local-shipping' },
  equipment: { label: 'Matériel', icon: 'build' },
  network: { label: 'Réseau', icon: 'wifi-off' },
  other: { label: 'Autre', icon: 'error' },
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: keyof typeof MaterialIcons.glyphMap; desc: string }> = {
  new:         { label: 'NOUVEAU',   color: colors.secondary, icon: 'fiber-new',       desc: 'Signalement envoyé — en attente de prise en charge.' },
  in_progress: { label: 'EN COURS',  color: '#FF9800',        icon: 'autorenew',       desc: 'Le département logistique traite votre signalement.' },
  resolved:    { label: 'RÉSOLU',    color: colors.success,   icon: 'check-circle',    desc: 'Le problème a été résolu par l\'équipe logistique.' },
  rejected:    { label: 'REJETÉ',    color: colors.primary,   icon: 'cancel',          desc: 'Le signalement a été classé sans suite.' },
};

const SEVERITY_MAP: Record<string, { label: string; color: string }> = {
  low:    { label: 'Faible',   color: colors.secondary },
  medium: { label: 'Modérée',  color: '#FF9800' },
  high:   { label: 'Critique', color: colors.primary },
};

// ── Timeline helpers ──

interface TimelineEntry {
  status: string;
  label: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  color: string;
  time: string;
  isActive: boolean;
  isFuture: boolean;
}

const STATUS_ORDER = ['new', 'in_progress', 'resolved'];

function buildTimeline(currentStatus: string, createdAt: string): TimelineEntry[] {
  const isRejected = currentStatus === 'rejected';
  const steps = isRejected
    ? ['new', 'rejected']
    : STATUS_ORDER;

  const currentIdx = steps.indexOf(currentStatus);

  return steps.map((s, i) => {
    const cfg = STATUS_CONFIG[s] || { label: s, color: 'rgba(255,255,255,0.3)', icon: 'circle' as const, desc: '' };
    const isActive = s === currentStatus;
    const isFuture = i > currentIdx;
    let time = '';

    if (i === 0) {
      const d = new Date(createdAt);
      time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
        + ' — '
        + d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
    } else if (!isFuture) {
      time = 'Mis à jour';
    }

    return { status: s, label: cfg.label, icon: cfg.icon, color: cfg.color, time, isActive, isFuture };
  });
}

function formatFullDate(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
    + ' à '
    + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

// ── Component ──

export function SignalementDetailScreen({ navigation, route }: any) {
  const report = route?.params?.report;
  const [liveStatus, setLiveStatus] = useState<string>(report?.status || 'new');
  const [liveResolutionNotes, setLiveResolutionNotes] = useState<string | null>(report?.resolution_notes ?? null);
  const statusPulse = useRef(new Animated.Value(1)).current;
  const prevStatusRef = useRef(liveStatus);

  // ── Realtime subscription ──
  useEffect(() => {
    if (!report?.id) return;

    const channel = supabase
      .channel(`field-report-${report.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'field_reports',
          filter: `id=eq.${report.id}`,
        },
        (payload: any) => {
          const newData = payload.new;
          console.log(`[SignalementDetail] 📡 Realtime UPDATE`, newData?.status);

          if (newData?.status && newData.status !== prevStatusRef.current) {
            prevStatusRef.current = newData.status;
            setLiveStatus(newData.status);

            // Feedback haptique + animation pulse
            Vibration.vibrate(100);
            Animated.sequence([
              Animated.timing(statusPulse, { toValue: 1.08, duration: 200, useNativeDriver: true }),
              Animated.spring(statusPulse, { toValue: 1, friction: 4, useNativeDriver: true }),
            ]).start();
          }

          if (newData?.resolution_notes !== undefined) {
            setLiveResolutionNotes(newData.resolution_notes ?? null);
          }
        },
      );

    channel.subscribe((status) => {
      if (status === 'CHANNEL_ERROR') {
        console.warn('[SignalementDetail] Realtime channel error');
      }
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [report?.id]);

  if (!report) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <Text style={{ color: '#FFF', textAlign: 'center', marginTop: 60 }}>Aucun signalement sélectionné.</Text>
      </SafeAreaView>
    );
  }

  const cat = CATEGORY_MAP[report.category] || { label: report.category, icon: 'error' as const };
  const statusCfg = STATUS_CONFIG[liveStatus] || STATUS_CONFIG.new;
  const sev = SEVERITY_MAP[report.severity] || { label: report.severity, color: 'rgba(255,255,255,0.4)' };
  const timeline = buildTimeline(liveStatus, report.created_at);
  const photos: string[] = Array.isArray(report.media_urls)
    ? report.media_urls.filter((u: string) => typeof u === 'string' && u.length > 0)
    : [];

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
            <Text style={styles.greetingText}>
              {cat.label.toUpperCase()} • {sev.label.toUpperCase()}
            </Text>
            <Text style={styles.hospitalName} numberOfLines={1}>Détail du signalement</Text>
          </View>
          <Animated.View style={[styles.headerStatusBadge, { backgroundColor: statusCfg.color + '15', transform: [{ scale: statusPulse }] }]}>
            <MaterialIcons name={statusCfg.icon} color={statusCfg.color} size={22} />
          </Animated.View>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* ── Status Card (live) ── */}
        <Animated.View style={[styles.statusCard, { borderColor: statusCfg.color + '25', transform: [{ scale: statusPulse }] }]}>
          <View style={[styles.statusIconCircle, { backgroundColor: statusCfg.color + '15' }]}>
            <MaterialIcons name={statusCfg.icon} color={statusCfg.color} size={32} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.statusLabel, { color: statusCfg.color }]}>{statusCfg.label}</Text>
            <Text style={styles.statusDesc}>{statusCfg.desc}</Text>
          </View>
        </Animated.View>

        {/* ── Timeline ── */}
        <Text style={styles.sectionTitle}>PROGRESSION</Text>
        <View style={styles.timelineContainer}>
          {timeline.map((entry, i) => {
            const isLast = i === timeline.length - 1;
            return (
              <View key={entry.status} style={styles.timelineRow}>
                {/* Line + Dot */}
                <View style={styles.timelineDotCol}>
                  <View style={[
                    styles.timelineDot,
                    {
                      backgroundColor: entry.isFuture ? '#2A2A2A' : entry.color,
                      borderColor: entry.isFuture ? 'rgba(255,255,255,0.08)' : entry.color,
                    },
                    entry.isActive && styles.timelineDotActive,
                  ]}>
                    {!entry.isFuture && (
                      <MaterialIcons
                        name={entry.isActive ? entry.icon : 'check'}
                        color={entry.isFuture ? 'rgba(255,255,255,0.15)' : '#FFF'}
                        size={entry.isActive ? 16 : 12}
                      />
                    )}
                  </View>
                  {!isLast && (
                    <View style={[
                      styles.timelineLine,
                      { backgroundColor: entry.isFuture ? 'rgba(255,255,255,0.06)' : entry.color + '40' },
                    ]} />
                  )}
                </View>

                {/* Content */}
                <View style={[styles.timelineContent, isLast && { paddingBottom: 0 }]}>
                  <Text style={[
                    styles.timelineLabel,
                    entry.isFuture && { color: 'rgba(255,255,255,0.2)' },
                    entry.isActive && { color: '#FFF', fontWeight: '900' },
                  ]}>
                    {entry.label}
                  </Text>
                  {entry.time.length > 0 && (
                    <Text style={[
                      styles.timelineTime,
                      entry.isFuture && { color: 'rgba(255,255,255,0.1)' },
                    ]}>
                      {entry.time}
                    </Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>

        {/* ── Notes de résolution (si disponible) ── */}
        {liveResolutionNotes && (
          <>
            <Text style={styles.sectionTitle}>NOTE LOGISTIQUE</Text>
            <View style={styles.notesCard}>
              <MaterialIcons name="comment" color="rgba(255,255,255,0.3)" size={20} />
              <Text style={styles.notesText}>{liveResolutionNotes}</Text>
            </View>
          </>
        )}

        {/* ── Infos détaillées ── */}
        <Text style={styles.sectionTitle}>INFORMATIONS</Text>
        <View style={styles.infoCard}>
          <InfoRow icon="category" label="Catégorie" value={cat.label} />
          <InfoRow icon="warning" label="Sévérité" value={sev.label} valueColor={sev.color} />
          <InfoRow icon="access-time" label="Créé le" value={formatFullDate(report.created_at)} />
          {report.location_lat != null && report.location_lng != null && (
            <InfoRow
              icon="place"
              label="Position GPS"
              value={`${report.location_lat.toFixed(5)}, ${report.location_lng.toFixed(5)}`}
            />
          )}
        </View>

        {/* ── Description complète ── */}
        <Text style={styles.sectionTitle}>DESCRIPTION</Text>
        <View style={styles.descriptionCard}>
          <Text style={styles.descriptionText}>{report.description}</Text>
        </View>

        {/* ── Photos ── */}
        {photos.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>
              PHOTOS JOINTES ({photos.length})
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.photosScroll}
            >
              {photos.map((url, idx) => (
                <View key={url} style={styles.photoWrapper}>
                  <Image source={{ uri: url }} style={styles.photoImage} />
                  <View style={styles.photoBadge}>
                    <Text style={styles.photoBadgeText}>{idx + 1}</Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          </>
        )}

        {/* Indicator temps réel */}
        <View style={styles.realtimeHint}>
          <View style={styles.realtimeDot} />
          <Text style={styles.realtimeText}>
            Les mises à jour de statut sont reçues en temps réel
          </Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

// ── Sub-component ──

function InfoRow({ icon, label, value, valueColor }: {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIconSlot}>
        <MaterialIcons name={icon} color="rgba(255,255,255,0.25)" size={18} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={[styles.infoValue, valueColor ? { color: valueColor } : {}]}>{value}</Text>
      </View>
    </View>
  );
}

// ── Styles ──

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
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  backBtn: {
    width: 44, height: 44, borderRadius: 16,
    backgroundColor: '#1A1A1A', justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  greetingText: {
    color: 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: '800',
    letterSpacing: 1.5, textTransform: 'uppercase',
  },
  hospitalName: { color: '#FFF', fontSize: 22, fontWeight: '700', marginTop: 4 },
  headerStatusBadge: {
    width: 44, height: 44, borderRadius: 16,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },

  scrollContent: { padding: 20, paddingBottom: 60 },

  // ── Status Card ──
  statusCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#1A1A1A', borderRadius: 28, padding: 22,
    borderWidth: 1.5, gap: 18, marginBottom: 8,
  },
  statusIconCircle: {
    width: 56, height: 56, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center',
  },
  statusLabel: { fontSize: 16, fontWeight: '900', letterSpacing: 1, marginBottom: 4 },
  statusDesc: { color: 'rgba(255,255,255,0.45)', fontSize: 13, fontWeight: '500', lineHeight: 19 },

  // ── Section ──
  sectionTitle: {
    color: colors.textMuted, fontSize: 13, fontWeight: '800',
    marginLeft: 8, marginBottom: 14, marginTop: 28, letterSpacing: 1.5,
  },

  // ── Timeline ──
  timelineContainer: {
    backgroundColor: '#1A1A1A', borderRadius: 28, padding: 22,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
  },
  timelineRow: { flexDirection: 'row' },
  timelineDotCol: { width: 36, alignItems: 'center' },
  timelineDot: {
    width: 28, height: 28, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2,
  },
  timelineDotActive: {
    width: 32, height: 32, borderRadius: 16,
    borderWidth: 0,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4, shadowRadius: 6, elevation: 4,
  },
  timelineLine: { width: 2, flex: 1, marginVertical: 4, borderRadius: 1 },
  timelineContent: { flex: 1, paddingLeft: 14, paddingBottom: 24 },
  timelineLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 15, fontWeight: '700' },
  timelineTime: { color: 'rgba(255,255,255,0.3)', fontSize: 12, fontWeight: '600', marginTop: 3 },

  // ── Notes ──
  notesCard: {
    flexDirection: 'row', gap: 14,
    backgroundColor: '#1A1A1A', borderRadius: 24, padding: 22,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
  },
  notesText: { flex: 1, color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: '500', lineHeight: 21 },

  // ── Info ──
  infoCard: {
    backgroundColor: '#1A1A1A', borderRadius: 28, padding: 8,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
  },
  infoRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.03)',
  },
  infoIconSlot: { width: 32, alignItems: 'center', marginRight: 12 },
  infoLabel: { color: 'rgba(255,255,255,0.35)', fontSize: 12, fontWeight: '700', letterSpacing: 0.5, marginBottom: 2 },
  infoValue: { color: '#FFF', fontSize: 15, fontWeight: '700' },

  // ── Description ──
  descriptionCard: {
    backgroundColor: '#1A1A1A', borderRadius: 28, padding: 22,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
  },
  descriptionText: { color: 'rgba(255,255,255,0.65)', fontSize: 15, fontWeight: '500', lineHeight: 23 },

  // ── Photos ──
  photosScroll: { gap: 12, paddingHorizontal: 2 },
  photoWrapper: { position: 'relative' },
  photoImage: {
    width: 140, height: 140, borderRadius: 22,
    backgroundColor: '#1A1A1A', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  photoBadge: {
    position: 'absolute', bottom: 8, left: 8,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center',
  },
  photoBadgeText: { color: '#FFF', fontSize: 12, fontWeight: '900' },

  // ── Realtime hint ──
  realtimeHint: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, marginTop: 32, marginBottom: 16,
  },
  realtimeDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: colors.success,
    shadowColor: colors.success, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1, shadowRadius: 4,
  },
  realtimeText: { color: 'rgba(255,255,255,0.2)', fontSize: 12, fontWeight: '600' },
});
