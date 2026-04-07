import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, StatusBar, Animated, Dimensions, Alert, ActivityIndicator } from 'react-native';
import { TabScreenSafeArea } from '../../components/layout/TabScreenSafeArea';
import { colors } from '../../theme/colors';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useActiveMission } from '../../hooks/useActiveMission';
import { useLocationTracking } from '../../hooks/useLocationTracking';
import { useNotifications } from '../../hooks/useNotifications';
import { supabase } from '../../lib/supabase';
import { ProfileIcon, NotificationIcon, CallOutgoingIcon, FirstAidBriefcaseIcon, EmergencyBellIcon } from '../../components/icons/TabIcons';

const { width } = Dimensions.get('window');

const SkeletonItem = ({ width: w, height: h, borderRadius = 8, style }: any) => {
  const pulseAnim = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.4, duration: 900, useNativeDriver: true })
      ])
    ).start();
  }, []);
  return <Animated.View style={[{ width: w, height: h, borderRadius, backgroundColor: '#1A1A1A', opacity: pulseAnim }, style]} />;
};

export function HomeTab({ navigation }: any) {
  const { profile, refreshProfile } = useAuth();
  const { activeMission, isLoading: missionLoading } = useActiveMission();
  const { unreadCount } = useNotifications();
  useLocationTracking(); // Initialise le suivi GPS pour la flotte Admin
  const [isLoading, setIsLoading] = useState(true);
  const [isDutyActive, setIsDutyActive] = useState(profile?.available ?? false);
  const [fadeAnim] = useState(new Animated.Value(0));
  const radarAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  /** Libellé affiché : `units.callsign` (indicatif), sinon véhicule / type. */
  const [unitName, setUnitName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadUnitName() {
      if (!profile?.assigned_unit_id) {
        setUnitName('Non assignée');
        return;
      }
      setUnitName(null);
      const { data, error } = await supabase
        .from('units')
        .select('callsign, vehicle_type, type')
        .eq('id', profile.assigned_unit_id)
        .maybeSingle();

      if (cancelled) return;
      if (error || !data) {
        setUnitName('Non assignée');
        return;
      }
      const label =
        (data.callsign && String(data.callsign).trim()) ||
        (data.vehicle_type && String(data.vehicle_type).trim()) ||
        (data.type && String(data.type).trim()) ||
        'Unité';
      setUnitName(label);
    }

    void loadUnitName();
    return () => {
      cancelled = true;
    };
  }, [profile?.assigned_unit_id]);

  // Synchroniser le statut local avec le profil
  useEffect(() => {
    if (profile) setIsDutyActive(profile.available);
  }, [profile?.available]);

  useEffect(() => {
    setTimeout(() => {
      setIsLoading(false);
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
    }, 1500);

    // Radar & Pulse Animations
    Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(radarAnim, { toValue: 1, duration: 2000, useNativeDriver: true }),
          Animated.timing(radarAnim, { toValue: 0, duration: 0, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.05, duration: 1000, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
        ])
      ])
    ).start();
  }, []);

  const handleToggleDuty = async (val: boolean) => {
    setIsDutyActive(val);
    if (profile?.id) {
      const { error } = await supabase
        .from('users_directory')
        .update({ available: val, status: val ? 'active' : 'offline' })
        .eq('id', profile.id);

      if (error) {
        console.error('[HomeTab] Error updating duty status:', error.message);
        setIsDutyActive(!val);
      } else {
        refreshProfile();
      }
    }
  };

  const MOCK_MISSION = {
    id: "AL-902",
    time: "2 min",
    type: "ACCIDENT ROUTE",
    typeIcon: "directions-car",
    location: "Limete, Boulevard Lumumba",
    description: "Collision deux véhicules. Victime coincée. Fracture ouverte jambe gauche suspectée.",
    priority: "CRITIQUE",
    coordinates: { latitude: -4.34, longitude: 15.33 },
    patient: { nom: "JEAN KABEYA", age: 42, sexe: "Masculin", groupeSanguin: "O+" },
  };

  return (
    <TabScreenSafeArea style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Harmonized Header */}
      <View style={styles.topHeader}>
        <View style={styles.headerRow}>
          <View style={styles.headerTextCol}>
            <Text style={styles.hospitalName}>Bonjour {profile?.first_name || ' '},</Text>
            <View style={styles.metaInfoColumn}>
              <View style={styles.metaRowWithIcon}>
                <View style={styles.metaIconSlot}>
                  <MaterialIcons
                    name="local-shipping"
                    size={16}
                    color={colors.secondary}
                  />
                </View>
                <View style={styles.metaRowText}>
                  <Text style={styles.locationLabel}>Unité</Text>
                  {unitName === null ? (
                    <ActivityIndicator
                      color={colors.secondary}
                      style={{ marginTop: 8, alignSelf: 'flex-start' }}
                    />
                  ) : (
                    <Text style={styles.userMetaText} numberOfLines={2}>
                      {unitName}
                    </Text>
                  )}
                </View>
              </View>
              {/* <View style={[styles.metaRowWithIcon, styles.metaBlockSpacing]}>
                <View style={styles.metaIconSlot}>
                  <MaterialIcons name="badge" size={16} color="#90CAF9" />
                </View>
                <View style={styles.metaRowText}>
                  <Text style={styles.locationLabel}>Grade • statut</Text>
                  <Text style={styles.userMetaText}>
                    {(profile?.grade?.trim() || '—') +
                      ' • ' +
                      (isDutyActive ? 'En service' : 'Hors service')}
                  </Text>
                </View>
              </View>
              <View style={[styles.metaRowWithIcon, styles.metaBlockSpacing]}>
                <View style={styles.metaIconSlot}>
                  <MaterialIcons
                    name="my-location"
                    size={16}
                    color={colors.success}
                  />
                </View>
                <View style={styles.metaRowText}>
                  <Text style={styles.locationLabel}>Zone</Text>
                  <Text style={styles.zoneValue} numberOfLines={3}>
                    {profile?.zone?.trim()
                      ? profile.zone.trim()
                      : 'Non renseignée'}
                  </Text>
                </View>
              </View> */}
            </View>
          </View>
          <View style={styles.headerIconRow}>
            <TouchableOpacity style={styles.notifBtn} onPress={() => navigation.navigate('Notifications')}>
              <NotificationIcon color={unreadCount > 0 ? colors.secondary : '#FFF'} size={24} />
              {unreadCount > 0 && (
                <View style={styles.notifBadge}>
                  <Text style={styles.notifBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerAvatarBtn} onPress={() => navigation.navigate('Profil')}>
              <ProfileIcon color="#FFF" size={24} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Status Card */}
        <Animated.View style={[styles.statusCard, !isLoading && { opacity: fadeAnim }]}>
          {isLoading ? (
            <SkeletonItem width="100%" height={80} borderRadius={24} />
          ) : (
            <View style={styles.statusContent}>
              <View style={styles.statusMain}>
                <View style={[styles.statusIndicator, { backgroundColor: isDutyActive ? colors.success : colors.textMuted }]} />
                <View>
                  <Text style={styles.statusTitle}>Statut de service</Text>
                  <Text style={styles.statusValue}>{isDutyActive ? 'Disponible' : 'Hors service'}</Text>
                </View>
              </View>
              <Switch
                value={isDutyActive}
                onValueChange={handleToggleDuty}
                trackColor={{ false: '#333', true: colors.success }}
                thumbColor="#FFF"
              />
            </View>
          )}
        </Animated.View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* Dynamic Alert / Standby Section */}
        <Animated.View style={[styles.dynamicSection, !isLoading && { opacity: fadeAnim }]}>
          {isLoading || missionLoading ? (
            <SkeletonItem width="100%" height={160} borderRadius={32} />
          ) : activeMission && activeMission.dispatch_status !== 'completed' ? (
            /* ACTIVE ALERT CASE (DYNAMIC) */
            <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
              <TouchableOpacity
                style={styles.alertCard}
                onPress={() => navigation.navigate('Signalement', { mission: activeMission })}
              >
                <View style={styles.alertHeader}>
                  <View style={[styles.priorityBadge, { backgroundColor: activeMission.priority === 'critical' ? colors.primary + '20' : colors.secondary + '20' }]}>
                    <View style={[styles.priorityDot, { backgroundColor: activeMission.priority === 'critical' ? colors.primary : colors.secondary }]} />
                    <Text style={[styles.priorityText, { color: activeMission.priority === 'critical' ? colors.primary : colors.secondary }]}>
                      Urgence {activeMission.priority === 'critical' ? 'critique' : 'élevée'}
                    </Text>
                  </View>
                  <Text style={styles.alertTime}>Mission en cours</Text>
                </View>

                <Text style={styles.alertType}>{activeMission.title}</Text>
                <View style={styles.alertLocRow}>
                  <MaterialIcons name="place" size={16} color="rgba(255,255,255,0.4)" />
                  <Text style={styles.alertLocText}>
                    {typeof activeMission.location === 'string' ? activeMission.location : (activeMission.location?.address || 'Adresse inconnue')}
                  </Text>
                </View>

                <View style={styles.alertFooter}>
                  <TouchableOpacity
                    style={styles.consultButton}
                    onPress={() => navigation.navigate('Signalement', { mission: activeMission })}
                  >
                    <Text style={styles.consultButtonText}>Gérer l'intervention</Text>
                    <MaterialIcons name="chevron-right" size={20} color="#fff" />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            </Animated.View>
          ) : (
            /* STANDBY / READY CASE */
            <View style={styles.standbyCard}>
              <View style={styles.standbyContent}>
                <View style={styles.standbyIconBox}>
                  <Animated.View style={[styles.radarCircle, { transform: [{ scale: radarAnim }], opacity: Animated.subtract(1, radarAnim) }]} />
                  <MaterialCommunityIcons name="radar" size={32} color={colors.secondary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.standbyTitle}>Prêt pour intervention</Text>
                  <Text style={styles.standbyDesc}>Votre unité est scannée par la centrale. Activez votre statut pour recevoir des alertes.</Text>
                </View>
              </View>
            </View>
          )}
        </Animated.View>

        {/* Shortcuts Section */}
        <Text style={styles.sectionHeading}>Accès rapides</Text>
        <View style={styles.shortcutsGrid}>
          {isLoading ? (
            [1, 2, 3, 4].map(i => <SkeletonItem key={i} width="48%" height={140} borderRadius={32} style={{ marginBottom: 15 }} />)
          ) : (
            <>
              <TouchableOpacity style={styles.shortcutCard} onPress={() => {
                if (activeMission) {
                  navigation.navigate('Signalement', { mission: activeMission });
                } else {
                  Alert.alert('Aucune alerte', 'Aucune mission en cours. Restez en attente, la centrale vous notifiera.');
                }
              }}>
                <View style={[styles.shortcutIconBox, { backgroundColor: colors.secondary + '10' }]}>
                  <NotificationIcon color={activeMission ? colors.primary : "#1564bf"} size={28} />
                </View>
                <Text style={styles.shortcutTitle}>{activeMission ? 'Mission en cours' : 'Alertes'}</Text>
                <Text style={styles.shortcutDesc}>{activeMission ? activeMission.reference : 'Aucune alerte'}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.shortcutCard} onPress={() => navigation.navigate('CallCenter')}>
                <View style={[styles.shortcutIconBox, { backgroundColor: colors.success + '10' }]}>
                  <CallOutgoingIcon color={colors.success} size={28} />
                </View>
                <Text style={styles.shortcutTitle}>Contacter la centrale</Text>
                <Text style={styles.shortcutDesc}>Appel sécurisé</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.shortcutCard} onPress={() => navigation.navigate('Protocoles')}>
                <View style={[styles.shortcutIconBox, { backgroundColor: '#E3242B15' }]}>
                  <FirstAidBriefcaseIcon color="#E3242B" size={28} />
                </View>
                <Text style={styles.shortcutTitle}>Protocoles</Text>
                <Text style={styles.shortcutDesc}>SMUR / SAMU</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.shortcutCard} onPress={() => navigation.navigate('SignalerProbleme')}>
                <View style={[styles.shortcutIconBox, { backgroundColor: '#FF950015' }]}>
                  <EmergencyBellIcon color="#FF9500" size={28} />
                </View>
                <Text style={styles.shortcutTitle}>Signalement</Text>
                <Text style={styles.shortcutDesc}>Incident terrain</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

      </ScrollView>
    </TabScreenSafeArea>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.mainBackground },
  scrollContent: { padding: 20, paddingBottom: 24 },

  // Harmonized Header
  topHeader: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 24,
    borderBottomLeftRadius: 36,
    borderBottomRightRadius: 36,
    backgroundColor: "#0A0A0A",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20
  },
  headerTextCol: {
    flex: 1,
    minWidth: 0,
    paddingRight: 8,
  },
  hospitalName: {
    color: "#FFF",
    fontSize: 26,
    fontWeight: "900",
  },
  /** Colonne d’icônes fixe : même alignement que la carte « Prêt pour intervention » */
  metaInfoColumn: {
    marginTop: 10,
  },
  locationLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metaBlockSpacing: {
    marginTop: 10,
  },
  metaRowWithIcon: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 20,
  },
  metaIconSlot: {
    width: 24,
    alignItems: 'center',
    paddingTop: 2,
    flexShrink: 0,
  },
  metaRowText: {
    flex: 1,
    minWidth: 0,
  },
  unitNameValue: {
    color: '#FFF',
    fontSize: 17,
    fontWeight: '800',
    marginTop: 4,
    lineHeight: 22,
  },
  zoneValue: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 4,
    lineHeight: 20,
  },
  userMetaText: {
    color: "#FFF",
    opacity: 0.8,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 4,
  },
  headerIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  notifBtn: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: "#1A1A1A",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)"
  },
  notifBadge: {
    position: "absolute",
    top: 6,
    right: 4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: "#1A1A1A",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 3,
  },
  notifBadgeText: {
    color: "#FFF",
    fontSize: 11,
    fontWeight: "900",
  },
  headerAvatarBtn: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: "#1A1A1A",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },

  // Status Card
  statusCard: {
    backgroundColor: "#161616",
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  statusContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
  },
  statusIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    shadowColor: colors.success,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 4,
  },
  statusTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: colors.textMuted,
    letterSpacing: 1.5,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  statusValue: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFF',
  },

  // Dynamic Alert Section
  dynamicSection: {
    paddingHorizontal: 24,
    marginTop: -15, // Negative margin to overlap with header slightly if needed
    marginBottom: 30,
  },
  alertCard: {
    backgroundColor: '#1E1E1E',
    borderRadius: 32,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  alertHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  priorityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 6,
  },
  priorityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  priorityText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  alertTime: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 13,
    fontWeight: '600',
  },
  alertType: {
    color: '#FFF',
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 8,
  },
  alertLocRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 24,
  },
  alertLocText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    fontWeight: '500',
  },
  alertFooter: {
    marginTop: 8,
  },
  consultButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.secondary,
    paddingVertical: 14,
    borderRadius: 16,
    gap: 12,
  },
  consultButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  standbyCard: {
    backgroundColor: '#161616',
    borderRadius: 32,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  standbyContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  standbyIconBox: {
    width: 56,
    height: 56,
    borderRadius: 20,
    backgroundColor: colors.secondary + '10',
    justifyContent: 'center',
    alignItems: 'center',
  },
  radarCircle: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: colors.secondary,
  },
  standbyTitle: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 4,
  },
  standbyDesc: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  // Shortcuts
  sectionHeading: {
    fontSize: 13,
    fontWeight: '900',
    color: colors.textMuted,
    letterSpacing: 1,
    marginBottom: 20,
    marginTop: 10,
    textTransform: 'uppercase',
  },
  shortcutsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  shortcutCard: {
    width: '48%',
    backgroundColor: "#161616",
    borderRadius: 32,
    padding: 24,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  shortcutIconBox: {
    width: 48,
    height: 48,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  shortcutTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFF',
    marginBottom: 4,
  },
  shortcutDesc: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '500',
    lineHeight: 16,
  },
});
