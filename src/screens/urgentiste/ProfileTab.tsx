import React, { useCallback, useEffect, useState } from "react";
import { TabScreenSafeArea } from "../../components/layout/TabScreenSafeArea";
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  Alert,
  Switch,
  Image,
  ScrollView
} from "react-native";
import { AppTouchableOpacity } from '../../components/ui/AppTouchableOpacity';
import { useAuth } from "../../contexts/AuthContext";
import { useActiveMission } from "../../hooks/useActiveMission";
import { useAppLock } from "../../contexts/AppLockContext";
import { useNotifications } from "../../hooks/useNotifications";
import { colors } from "../../theme/colors";
import { MaterialIcons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";

function Card({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

function InfoRow({ icon, label, value, iconTint, valueLines = 1 }: any) {
  return (
    <View style={styles.infoRow}>
      <View style={[styles.infoIconWrap, { backgroundColor: `${iconTint}14` }]}>
        <MaterialIcons name={icon} color={iconTint} size={18} />
      </View>
      <View style={styles.infoBody}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue} numberOfLines={valueLines}>
          {value}
        </Text>
      </View>
    </View>
  );
}

export function ProfileTab({ navigation }: any) {
  const { profile, signOut, refreshProfile } = useAuth();
  const { activeMission } = useActiveMission();
  const { unreadCount } = useNotifications();
  const [avatarLoadError, setAvatarLoadError] = useState(false);
  const [isDutyActive, setIsDutyActive] = useState(profile?.available ?? false);

  useEffect(() => {
    if (profile) setIsDutyActive(profile.available ?? false);
  }, [profile?.available]);

  const handleToggleDuty = useCallback(
    async (val: boolean) => {
      setIsDutyActive(val);
      if (!profile?.id) return;
      const { error } = await supabase
        .from("users_directory")
        .update({ available: val, status: val ? "active" : "offline" })
        .eq("id", profile.id);

      if (error) {
        console.error("[ProfileTab] duty status:", error.message);
        setIsDutyActive(!val);
      } else {
        refreshProfile();
      }
    },
    [profile?.id, refreshProfile],
  );

  useEffect(() => {
    setAvatarLoadError(false);
  }, [profile?.photo_url]);

  const {
    appLockEnabled,
    setAppLockEnabled,
    biometricAvailable,
    nativeModuleLinked,
  } = useAppLock();

  const handleLogout = () => {
    Alert.alert("Déconnexion", "Voulez-vous vraiment vous déconnecter ?", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Déconnexion",
        style: "destructive",
        onPress: async () => {
          try {
            await signOut();
            console.log("[Profile] Déconnexion réussie");
          } catch (e) {
            console.error(e);
          }
        },
      },
    ]);
  };

  const photoUri = profile?.photo_url?.trim();
  const showAvatarPhoto = Boolean(photoUri) && !avatarLoadError;

  const roleLabel =
    profile?.role === "secouriste" ? "Médecin urgentiste" : profile?.role || "—";
  const matricule = profile?.agent_login_id || profile?.matricule || "—";
  const grade = profile?.grade?.trim() || "—";
  const zone = profile?.zone?.trim() || "—";
  const phone = profile?.phone?.trim() || "—";

  const lockSubtitle = !nativeModuleLinked
    ? "Recompilez l’app pour la biométrie."
    : biometricAvailable
      ? "Empreinte, Face ID ou code."
      : "Verrouillage téléphone requis.";

  const statusDotColor =
    profile?.available === true ? colors.success : "rgba(255,255,255,0.28)";

  return (
    <TabScreenSafeArea style={styles.container}>
      <StatusBar barStyle="light-content" />

      <ScrollView style={styles.root} contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <View style={styles.main}>
          <View style={styles.heroCard}>
            <View style={styles.heroInner}>
              <View style={styles.avatarStack}>
                <View style={styles.avatarRing}>
                  <View style={styles.avatarCircle}>
                    {showAvatarPhoto ? (
                      <Image
                        source={{ uri: photoUri! }}
                        style={styles.avatarImage}
                        resizeMode="cover"
                        onError={() => setAvatarLoadError(true)}
                      />
                    ) : (
                      <MaterialIcons name="person" color={colors.secondary} size={40} />
                    )}
                  </View>
                </View>
                <View
                  style={[
                    styles.avatarStatusDot,
                    { backgroundColor: statusDotColor },
                  ]}
                />
              </View>

              <Text style={styles.heroName} numberOfLines={2}>
                {[profile?.first_name, profile?.last_name].filter(Boolean).join(" ") ||
                  "—"}
              </Text>

              <Text style={styles.heroRole} numberOfLines={2}>
                {roleLabel}
              </Text>

              <View
                style={[
                  styles.servicePill,
                  isDutyActive ? styles.servicePillOn : styles.servicePillOff,
                ]}
              >
                <View
                  style={[
                    styles.servicePillDot,
                    {
                      backgroundColor: isDutyActive
                        ? colors.success
                        : "rgba(255,255,255,0.35)",
                    },
                  ]}
                />
                <Text
                  style={[
                    styles.servicePillText,
                    isDutyActive && styles.servicePillTextOn,
                  ]}
                >
                  {isDutyActive ? "Disponible pour missions" : "Hors service"}
                </Text>
              </View>

              <View style={styles.matriculeChip}>
                <MaterialIcons
                  name="assignment-ind"
                  size={16}
                  color={colors.secondary}
                />
                <Text style={styles.matriculeChipText}>{matricule}</Text>
              </View>
            </View>
          </View>

          <SectionLabel>Général</SectionLabel>
          <Card>
            <AppTouchableOpacity
              style={styles.navRow}
              activeOpacity={0.7}
              onPress={() => navigation.navigate("Notifications")}
            >
              <View style={[styles.infoIconWrap, { backgroundColor: `${colors.primary}18` }]}>
                <MaterialIcons name="notifications" color={colors.primary} size={18} />
                {unreadCount > 0 && (
                  <View style={styles.badgeIndicator} />
                )}
              </View>
              <View style={styles.infoBody}>
                <Text style={styles.infoLabel}>Notifications</Text>
                <Text style={styles.infoValue}>
                  {unreadCount > 0 ? `${unreadCount} nouvelle(s)` : "À jour"}
                </Text>
              </View>
              <MaterialIcons name="chevron-right" color={colors.textMuted} size={22} />
            </AppTouchableOpacity>
          </Card>

          <SectionLabel>Identité</SectionLabel>
          <Card>
            <InfoRow icon="badge" iconTint="#90CAF9" label="Grade" value={grade} valueLines={2} />
            <View style={styles.rowSep} />
            <InfoRow
              icon="my-location"
              iconTint={colors.success}
              label="Zone"
              value={zone}
              valueLines={4}
            />
            <View style={styles.rowSep} />
            <InfoRow icon="phone" iconTint={colors.textMuted} label="Téléphone" value={phone} />
          </Card>

          <SectionLabel>Sécurité & Service</SectionLabel>
          <Card>
            <View style={styles.switchRow}>
              <View style={[styles.infoIconWrap, { backgroundColor: `${colors.success}18` }]}>
                <MaterialIcons name="radio-button-checked" color={colors.success} size={18} />
              </View>
              <View style={styles.switchBody}>
                <Text style={styles.switchTitle}>Disponibilité</Text>
                <Text style={[styles.switchSub, !!activeMission && { color: colors.primary, fontWeight: '700' }]}>
                  {!!activeMission ? "Verrouillé pendant la mission" : (isDutyActive ? "En service" : "Hors service")}
                </Text>
              </View>
              <Switch
                value={isDutyActive}
                disabled={!!activeMission}
                onValueChange={(v) => void handleToggleDuty(v)}
                trackColor={{ false: "#2C2C2C", true: `${colors.success}88` }}
                thumbColor={isDutyActive ? colors.success : "#9E9E9E"}
              />
            </View>
            <View style={styles.rowSep} />
            <View style={styles.switchRow}>
              <View style={[styles.infoIconWrap, { backgroundColor: `${colors.secondary}18` }]}>
                <MaterialIcons name="fingerprint" color={colors.secondary} size={18} />
              </View>
              <View style={styles.switchBody}>
                <Text style={styles.switchTitle}>Verrou à l’ouverture</Text>
                <Text style={styles.switchSub}>
                  {lockSubtitle}
                </Text>
              </View>
              <Switch
                value={appLockEnabled}
                disabled={!nativeModuleLinked}
                onValueChange={(v) => void setAppLockEnabled(v)}
                trackColor={{ false: "#2C2C2C", true: `${colors.secondary}88` }}
                thumbColor={appLockEnabled ? colors.secondary : "#9E9E9E"}
              />
            </View>
            <View style={styles.rowSep} />
            <AppTouchableOpacity
              style={styles.navRowNoBorder}
              activeOpacity={0.7}
              onPress={() => navigation.navigate("CallHistoryCalls")}
            >
              <View style={[styles.infoIconWrap, { backgroundColor: `${colors.secondary}18` }]}>
                <MaterialIcons name="phone-callback" color={colors.secondary} size={18} />
              </View>
              <View style={styles.infoBody}>
                <Text style={styles.infoLabel}>Historique des appels</Text>
                <Text style={styles.infoValue}>Centrale</Text>
              </View>
              <MaterialIcons name="chevron-right" color={colors.textMuted} size={22} />
            </AppTouchableOpacity>
          </Card>
        </View>

        <View style={styles.footer}>
          <AppTouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.85}>
            <MaterialIcons name="logout" color={colors.primary} size={20} />
            <Text style={styles.logoutText}>Se déconnecter</Text>
          </AppTouchableOpacity>
        </View>
      </ScrollView>
    </TabScreenSafeArea>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.mainBackground,
  },
  root: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  main: {
    gap: 12,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginTop: 16,
    marginBottom: 4,
    marginLeft: 4,
  },
  heroCard: {
    borderRadius: 28,
    overflow: "hidden",
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors. glassBorder || "rgba(255,255,255,0.05)",
    marginBottom: 8,
  },
  heroInner: {
    alignItems: "center",
    padding: 24,
  },
  avatarStack: {
    position: "relative",
    marginBottom: 16,
  },
  avatarRing: {
    padding: 3,
    borderRadius: 100,
    backgroundColor: "rgba(68, 138, 255, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(68, 138, 255, 0.35)",
  },
  avatarCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.05)",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  avatarStatusDot: {
    position: "absolute",
    bottom: 6,
    right: 6,
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 3,
    borderColor: colors.surfaceElevated,
  },
  heroName: {
    fontSize: 24,
    fontWeight: "900",
    color: "#FFF",
    textAlign: "center",
  },
  heroRole: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: "700",
    color: colors.secondary,
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  servicePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
  },
  servicePillOn: {
    backgroundColor: "rgba(105, 240, 174, 0.1)",
    borderColor: "rgba(105, 240, 174, 0.3)",
  },
  servicePillOff: {
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderColor: "rgba(255,255,255,0.1)",
  },
  servicePillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  servicePillText: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.textMuted,
  },
  servicePillTextOn: {
    color: colors.success,
  },
  matriculeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  matriculeChipText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#FFF",
    letterSpacing: 1,
  },
  card: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    overflow: "hidden",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 14,
  },
  infoIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  infoBody: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  infoValue: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFF",
    marginTop: 2,
  },
  rowSep: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.05)",
    marginLeft: 66,
  },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 14,
  },
  navRowNoBorder: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 14,
  },
  badgeIndicator: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    borderWidth: 1.5,
    borderColor: colors.surfaceElevated,
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 14,
  },
  switchBody: {
    flex: 1,
  },
  switchTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFF",
  },
  switchSub: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  footer: {
    marginTop: 24,
  },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    borderRadius: 20,
    backgroundColor: "rgba(255, 61, 0, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(255, 61, 0, 0.2)",
    gap: 10,
  },
  logoutText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: "800",
  },
});
