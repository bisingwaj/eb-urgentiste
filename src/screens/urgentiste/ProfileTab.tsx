import React, { useCallback, useEffect, useState } from "react";
import { TabScreenSafeArea } from "../../components/layout/TabScreenSafeArea";
import {
  View,
  Text,
  StyleSheet,
StatusBar,
  Alert,
  Switch,
  Image} from "react-native";
import { AppTouchableOpacity } from '../../components/ui/AppTouchableOpacity';
import { useAuth } from "../../contexts/AuthContext";
import { useAppLock } from "../../contexts/AppLockContext";
import { colors } from "../../theme/colors";
import { MaterialIcons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";

function Card({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

export function ProfileTab({ navigation }: any) {
  const { profile, signOut, refreshProfile } = useAuth();
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

      <View style={styles.root}>
        <View style={styles.main}>
          <View style={styles.heroCard}>
            <View style={styles.heroAccentRow}>
              {/* <View style={[styles.heroAccentHalf, { backgroundColor: colors.secondary }]} /> */}
              {/* <View style={[styles.heroAccentHalf, { backgroundColor: colors.primary }]} /> */}
            </View>

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

          <Card>
            <View style={styles.gridRow}>
              <View style={styles.gridCell}>
                <View style={styles.gridCellHead}>
                  <MaterialIcons name="badge" color="#90CAF9" size={16} />
                  <Text style={styles.gridLabel}>Grade</Text>
                </View>
                <Text style={styles.gridValue} numberOfLines={2}>
                  {grade}
                </Text>
              </View>
              <View style={styles.gridVertSep} />
              <View style={styles.gridCell}>
                <View style={styles.gridCellHead}>
                  <MaterialIcons name="my-location" color={colors.success} size={16} />
                  <Text style={styles.gridLabel}>Zone</Text>
                </View>
                <Text style={styles.gridValue} numberOfLines={2}>
                  {zone}
                </Text>
              </View>
            </View>
            <View style={styles.rowSepFull} />
            <View style={styles.phoneRow}>
              <View style={[styles.infoIconWrap, { backgroundColor: `${colors.textMuted}14` }]}>
                <MaterialIcons name="phone" color={colors.textMuted} size={16} />
              </View>
              <View style={styles.phoneBody}>
                <Text style={styles.gridLabel}>Téléphone</Text>
                <Text style={styles.gridValue} numberOfLines={1}>
                  {phone}
                </Text>
              </View>
            </View>
          </Card>

          <Card>
            <View style={styles.switchRow}>
              <View style={[styles.infoIconWrap, { backgroundColor: `${colors.success}18` }]}>
                <MaterialIcons name="radio-button-checked" color={colors.success} size={16} />
              </View>
              <View style={styles.switchBody}>
                <Text style={styles.switchTitle}>Disponibilité</Text>
                <Text style={styles.switchSub} numberOfLines={1}>
                  {isDutyActive ? "En service" : "Hors service"}
                </Text>
              </View>
              <Switch
                value={isDutyActive}
                onValueChange={(v) => void handleToggleDuty(v)}
                trackColor={{ false: "#2C2C2C", true: `${colors.success}88` }}
                thumbColor={isDutyActive ? colors.success : "#9E9E9E"}
              />
            </View>
            <View style={styles.rowSepFull} />
            <View style={styles.switchRow}>
              <View style={[styles.infoIconWrap, { backgroundColor: `${colors.secondary}18` }]}>
                <MaterialIcons name="fingerprint" color={colors.secondary} size={16} />
              </View>
              <View style={styles.switchBody}>
                <Text style={styles.switchTitle}>Verrou à l’ouverture</Text>
                <Text style={styles.switchSub} numberOfLines={2}>
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
          </Card>

          <AppTouchableOpacity
            style={styles.navRow}
            activeOpacity={0.7}
            onPress={() => navigation.navigate("CallHistoryCalls")}
          >
            <View style={[styles.infoIconWrap, { backgroundColor: `${colors.secondary}18` }]}>
              <MaterialIcons name="phone-callback" color={colors.secondary} size={16} />
            </View>
            <View style={styles.navRowBody}>
              <Text style={styles.navRowTitle}>Historique des appels</Text>
              <Text style={styles.navRowSub} numberOfLines={1}>
                Centrale
              </Text>
            </View>
            <MaterialIcons name="chevron-right" color={colors.textMuted} size={22} />
          </AppTouchableOpacity>
        </View>

        <View style={styles.footer}>
          <AppTouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.85}>
            <MaterialIcons name="logout" color={colors.primary} size={20} />
            <Text style={styles.logoutText}>Se déconnecter</Text>
          </AppTouchableOpacity>
        </View>
      </View>
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
    flex: 1,
    minHeight: 0,
    gap: 10,
  },
  footer: {
    paddingTop: 10,
    paddingBottom: 4,
  },

  heroCard: {
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: colors.surfaceElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderLight,
  },
  heroAccentRow: {
    flexDirection: "row",
    height: 3,
    width: "100%",
  },
  heroAccentHalf: {
    flex: 1,
    opacity: 0.92,
  },
  heroInner: {
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 20,
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
    width: 88,
    height: 88,
    borderRadius: 44,
    overflow: "hidden",
    backgroundColor: `${colors.secondary}14`,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  avatarStatusDot: {
    position: "absolute",
    bottom: 4,
    right: 4,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2.5,
    borderColor: colors.surfaceElevated,
  },
  heroName: {
    fontSize: 23,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: -0.4,
    textAlign: "center",
    lineHeight: 28,
  },
  heroRole: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: "700",
    color: colors.textMuted,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    textAlign: "center",
    lineHeight: 16,
  },
  servicePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  servicePillOn: {
    backgroundColor: "rgba(105, 240, 174, 0.1)",
    borderColor: "rgba(105, 240, 174, 0.35)",
  },
  servicePillOff: {
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderColor: colors.borderHairline,
  },
  servicePillDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  servicePillText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textMuted,
    letterSpacing: 0.2,
  },
  servicePillTextOn: {
    color: colors.success,
  },
  matriculeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: colors.mainBackground,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderHairline,
  },
  matriculeChipText: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: 0.8,
  },

  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderHairline,
    overflow: "hidden",
  },

  gridRow: {
    flexDirection: "row",
    alignItems: "stretch",
    minHeight: 72,
  },
  gridCell: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    justifyContent: "center",
  },
  gridVertSep: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderHairline,
  },
  gridCellHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  gridLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textMuted,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  gridValue: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
    lineHeight: 19,
  },
  rowSepFull: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderHairline,
  },
  phoneRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 10,
  },
  infoIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 9,
    justifyContent: "center",
    alignItems: "center",
  },
  phoneBody: {
    flex: 1,
    minWidth: 0,
  },

  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 10,
  },
  switchBody: {
    flex: 1,
    minWidth: 0,
  },
  switchTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
  },
  switchSub: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "500",
    color: colors.textMuted,
    lineHeight: 14,
  },

  navRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderHairline,
  },
  navRowBody: {
    flex: 1,
    minWidth: 0,
  },
  navRowTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
  },
  navRowSub: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "500",
    color: colors.textMuted,
  },

  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: `${colors.primary}12`,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: `${colors.primary}35`,
    gap: 8,
  },
  logoutText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: "800",
  },
});
