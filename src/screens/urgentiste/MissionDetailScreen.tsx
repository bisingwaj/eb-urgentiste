import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../theme/colors';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import type { Mission, SosResponseItem } from '../../hooks/useActiveMission';
import { formatIncidentType } from '../../utils/missionAddress';

function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function calcDuration(startStr?: string, endStr?: string): string {
  if (!startStr || !endStr) return 'N/A';
  const diff = new Date(endStr).getTime() - new Date(startStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hrs}h ${remMins}min`;
}

function formatCoords(lat?: number | null, lng?: number | null): string | undefined {
  if (lat == null || lng == null) return undefined;
  return `${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}`;
}

type TimelineEntry = {
  sortKey: number;
  time: string;
  label: string;
  detail?: string;
  icon: keyof typeof MaterialIcons.glyphMap;
};

function buildTimeline(mission: Mission): TimelineEntry[] {
  const out: TimelineEntry[] = [];
  const add = (
    iso: string | null | undefined,
    label: string,
    detail?: string,
    icon: TimelineEntry['icon'] = 'circle',
  ) => {
    if (!iso) return;
    const t = new Date(iso).getTime();
    if (Number.isNaN(t)) return;
    out.push({
      sortKey: t,
      time: formatDateTime(iso),
      label,
      detail: detail && detail.trim() !== '' ? detail : undefined,
      icon,
    });
  };

  add(mission.created_at, 'Signalement enregistré', mission.reference, 'fiber-new');
  add(mission.incident_at, 'Heure de l’incident', undefined, 'event');

  const sosList = [...(mission.sos_responses ?? [])].sort(
    (a: SosResponseItem, b: SosResponseItem) =>
      new Date(a.answered_at).getTime() - new Date(b.answered_at).getTime(),
  );
  for (const r of sosList) {
    const q = (r.question_text || r.question_key || 'Questionnaire SOS').trim();
    const a = r.answer != null && String(r.answer).trim() !== '' ? String(r.answer) : '—';
    add(r.answered_at, q, a, 'quiz');
  }

  const rtLat = mission.caller_realtime_lat ?? mission.location?.lat;
  const rtLng = mission.caller_realtime_lng ?? mission.location?.lng;
  const coordDetail = formatCoords(rtLat, rtLng);
  add(
    mission.caller_realtime_updated_at,
    'Position GPS patient (mise à jour)',
    coordDetail,
    'my-location',
  );

  add(
    mission.dispatched_at,
    'Dispatch reçu',
    mission.dispatch_notes?.trim() || undefined,
    'assignment-turned-in',
  );
  add(mission.arrived_at, 'Arrivée sur les lieux', undefined, 'place');
  add(mission.completed_at, 'Mission clôturée', undefined, 'check-circle');

  if (mission.incident_updated_at) {
    add(mission.incident_updated_at, 'Dossier incident mis à jour', undefined, 'edit');
  }

  out.sort((a, b) => a.sortKey - b.sortKey);
  return out;
}

function joinLocationParts(m: Mission): string[] {
  const lines: string[] = [];
  const addr = m.location?.address?.trim();
  if (addr) lines.push(addr);
  const parts = [m.location?.commune, m.location?.ville, m.location?.province]
    .map((x) => (typeof x === 'string' ? x.trim() : ''))
    .filter(Boolean);
  if (parts.length) lines.push(parts.join(' · '));
  const coords = formatCoords(m.location?.lat, m.location?.lng);
  if (coords) lines.push(`Coordonnées initiales : ${coords}`);
  const rtc = formatCoords(m.caller_realtime_lat ?? null, m.caller_realtime_lng ?? null);
  if (rtc && rtc !== coords) lines.push(`GPS temps réel (dernier) : ${rtc}`);
  return lines;
}

export function MissionDetailScreen({ navigation, route }: any) {
  const { mission }: { mission: Mission } = route.params;

  const getOutcomeSpecs = (status: string) => {
    switch (status) {
      case 'completed':
        return { icon: 'check-circle' as const, color: colors.success, label: 'Réussi' };
      case 'refused':
        return { icon: 'cancel' as const, color: '#FF9800', label: 'Refusé' };
      case 'critical':
        return { icon: 'error' as const, color: colors.primary, label: 'Critique' };
      default:
        return { icon: 'check-circle' as const, color: colors.secondary, label: 'Terminé' };
    }
  };

  const specs = getOutcomeSpecs(mission.dispatch_status);
  const missionDate = mission.created_at
    ? new Date(mission.created_at).toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Date inconnue';
  const duration = calcDuration(mission.dispatched_at || mission.created_at, mission.completed_at);

  const timeline = useMemo(() => buildTimeline(mission), [mission]);

  const locationLines = useMemo(() => joinLocationParts(mission), [mission]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Détail Mission</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.mainCard}>
          <View style={styles.cardHeader}>
            <View style={[styles.statusBadge, { backgroundColor: specs.color + '15' }]}>
              <MaterialIcons name={specs.icon} color={specs.color} size={16} />
              <Text style={[styles.statusText, { color: specs.color }]}>{specs.label}</Text>
            </View>
            <Text style={styles.missionId}>{mission.reference || mission.id?.slice(0, 8)}</Text>
          </View>

          <Text style={styles.typeText}>{mission.title || formatIncidentType(mission.type)}</Text>

          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <MaterialCommunityIcons name="clock-outline" size={16} color="rgba(255,255,255,0.4)" />
              <Text style={styles.metaText}>{missionDate}</Text>
            </View>
            <View style={styles.metaItem}>
              <MaterialCommunityIcons name="timer-outline" size={16} color="rgba(255,255,255,0.4)" />
              <Text style={styles.metaText}>{duration}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoSection}>
            <View style={styles.infoRow}>
              <MaterialIcons name="place" size={20} color={colors.secondary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.infoLabel}>LOCALISATION & ADRESSE</Text>
                {locationLines.length > 0 ? (
                  locationLines.map((line, i) => (
                    <Text key={i} style={[styles.infoVal, i > 0 && { marginTop: 6 }]}>
                      {line}
                    </Text>
                  ))
                ) : (
                  <Text style={styles.infoVal}>—</Text>
                )}
              </View>
            </View>
            <View style={[styles.infoRow, { marginTop: 16 }]}>
              <MaterialIcons name="local-hospital" size={20} color={colors.secondary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.infoLabel}>DESTINATION / STRUCTURE</Text>
                <Text style={styles.infoVal}>{mission.destination || 'Non spécifiée'}</Text>
              </View>
            </View>
          </View>
        </View>

        <Text style={styles.sectionHeading}>PATIENT / APPELANT</Text>
        <View style={styles.sectionCard}>
          <View style={styles.patientRow}>
            <View style={styles.avatarBox}>
              <MaterialIcons name="person" size={32} color={colors.secondary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.patientName}>{mission.caller?.name || 'Anonyme'}</Text>
              <Text style={styles.patientSub}>{mission.caller?.phone || 'Téléphone non renseigné'}</Text>
            </View>
          </View>
        </View>

        <Text style={styles.sectionHeading}>PRIORITÉ</Text>
        <View style={styles.sectionCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View
              style={[
                styles.priorityIndicator,
                {
                  backgroundColor:
                    mission.priority === 'critical'
                      ? colors.primary + '20'
                      : mission.priority === 'high'
                        ? '#FF9500' + '20'
                        : colors.secondary + '20',
                },
              ]}
            >
              <MaterialIcons
                name="warning"
                size={20}
                color={
                  mission.priority === 'critical'
                    ? colors.primary
                    : mission.priority === 'high'
                      ? '#FF9500'
                      : colors.secondary
                }
              />
            </View>
            <Text style={styles.priorityText}>
              {mission.priority === 'critical'
                ? 'Critique'
                : mission.priority === 'high'
                  ? 'Haute'
                  : mission.priority === 'medium'
                    ? 'Moyenne'
                    : 'Basse'}
            </Text>
          </View>
        </View>

        <Text style={styles.sectionHeading}>DESCRIPTION</Text>
        <View style={styles.sectionCard}>
          <Text style={styles.descriptionText}>
            {mission.description?.trim() ? mission.description : '—'}
          </Text>
        </View>

        {(mission.recommended_actions?.trim() ||
          mission.incident_notes?.trim() ||
          mission.dispatch_notes?.trim()) && (
          <>
            <Text style={styles.sectionHeading}>NOTES & CONSIGNES</Text>
            <View style={styles.sectionCard}>
              {mission.recommended_actions?.trim() ? (
                <View style={{ marginBottom: 14 }}>
                  <Text style={styles.subLabel}>Actions recommandées</Text>
                  <Text style={styles.descriptionText}>{mission.recommended_actions}</Text>
                </View>
              ) : null}
              {mission.incident_notes?.trim() ? (
                <View style={{ marginBottom: 14 }}>
                  <Text style={styles.subLabel}>Notes incident</Text>
                  <Text style={styles.descriptionText}>{mission.incident_notes}</Text>
                </View>
              ) : null}
              {mission.dispatch_notes?.trim() ? (
                <View>
                  <Text style={styles.subLabel}>Notes dispatch (unité)</Text>
                  <Text style={styles.descriptionText}>{mission.dispatch_notes}</Text>
                </View>
              ) : null}
            </View>
          </>
        )}

        {(mission.battery_level || mission.network_state) && (
          <>
            <Text style={styles.sectionHeading}>APPAREIL (CITOYEN)</Text>
            <View style={styles.sectionCard}>
              {mission.battery_level ? (
                <Text style={styles.descriptionText}>Batterie : {mission.battery_level}</Text>
              ) : null}
              {mission.network_state ? (
                <Text style={[styles.descriptionText, { marginTop: mission.battery_level ? 8 : 0 }]}>
                  Réseau : {mission.network_state}
                </Text>
              ) : null}
            </View>
          </>
        )}

        {mission.media_urls && mission.media_urls.length > 0 && (
          <>
            <Text style={styles.sectionHeading}>MÉDIAS</Text>
            <View style={styles.sectionCard}>
              {mission.media_urls.map((url, i) => (
                <Text key={i} style={[styles.descriptionText, i > 0 && { marginTop: 8 }]} selectable>
                  {url}
                </Text>
              ))}
            </View>
          </>
        )}

        <Text style={styles.sectionHeading}>TIMELINE (PARCOURS PATIENT)</Text>
        <View style={styles.timelineContainer}>
          {timeline.length === 0 ? (
            <Text style={styles.descriptionText}>Aucun événement horodaté.</Text>
          ) : (
            timeline.map((item, idx) => (
              <View key={`${item.sortKey}-${idx}`} style={styles.timelineItem}>
                <View style={styles.timelineSidebar}>
                  <View style={styles.timelineDot} />
                  {idx < timeline.length - 1 && <View style={styles.timelineLine} />}
                </View>
                <View style={styles.timelineContent}>
                  <Text style={styles.timelineTime}>{item.time}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                    <MaterialIcons name={item.icon} size={18} color={colors.secondary} style={{ marginTop: 2 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.timelineLabel}>{item.label}</Text>
                      {item.detail ? (
                        <Text style={styles.timelineDetail} selectable>
                          {item.detail}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.mainBackground },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#1A1A1A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: { color: '#FFF', fontSize: 18, fontWeight: '800' },
  scrollContent: { padding: 24, paddingBottom: 60 },

  mainCard: {
    backgroundColor: '#161616',
    borderRadius: 32,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    marginBottom: 24,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  statusText: { fontSize: 13, fontWeight: '900', letterSpacing: 0.5 },
  missionId: { color: 'rgba(255,255,255,0.3)', fontSize: 12, fontWeight: '800' },
  typeText: { color: '#FFF', fontSize: 24, fontWeight: '900', marginBottom: 12 },
  metaRow: { flexDirection: 'row', gap: 16, marginBottom: 24 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: '600' },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.05)', marginBottom: 24 },
  infoSection: {},
  infoRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  infoLabel: { color: 'rgba(255,255,255,0.3)', fontSize: 12, fontWeight: '900', letterSpacing: 1, marginBottom: 4 },
  infoVal: { color: '#FFF', fontSize: 15, fontWeight: '700' },

  sectionHeading: { color: 'rgba(255,255,255,0.3)', fontSize: 12, fontWeight: '900', letterSpacing: 1.5, marginBottom: 16, marginTop: 8 },
  sectionCard: {
    backgroundColor: '#161616',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    marginBottom: 24,
  },
  subLabel: { color: 'rgba(255,255,255,0.45)', fontSize: 13, fontWeight: '800', marginBottom: 6, textTransform: 'uppercase' },
  patientRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  avatarBox: { width: 56, height: 56, borderRadius: 18, backgroundColor: '#1A1A1A', justifyContent: 'center', alignItems: 'center' },
  patientName: { color: '#FFF', fontSize: 17, fontWeight: '800', marginBottom: 2 },
  patientSub: { color: 'rgba(255,255,255,0.4)', fontSize: 13, fontWeight: '600' },

  priorityIndicator: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  priorityText: { color: '#FFF', fontSize: 16, fontWeight: '800' },

  descriptionText: { color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: '500', lineHeight: 22 },

  timelineContainer: {
    backgroundColor: '#161616',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  timelineItem: { flexDirection: 'row', gap: 16 },
  timelineSidebar: { alignItems: 'center', width: 20 },
  timelineDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.secondary, marginTop: 6 },
  timelineLine: { width: 2, flex: 1, backgroundColor: colors.secondary + '30', marginVertical: 4 },
  timelineContent: { flex: 1, paddingBottom: 20 },
  timelineTime: { color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: '800', marginBottom: 8 },
  timelineLabel: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  timelineDetail: { color: 'rgba(255,255,255,0.55)', fontSize: 13, fontWeight: '600', marginTop: 4, lineHeight: 18 },
});
