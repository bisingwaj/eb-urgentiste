import React, { useEffect, useState } from "react";
import { TabScreenSafeArea } from "../../components/layout/TabScreenSafeArea";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Alert,
  Switch,
  Image,
} from "react-native";
import { useAuth } from "../../contexts/AuthContext";
import { useAppLock } from "../../contexts/AppLockContext";
import { useNotifications } from "../../hooks/useNotifications";
import { colors } from "../../theme/colors";
import { MaterialIcons } from "@expo/vector-icons";

function SectionLabel({ children }: { children: string }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

function Card({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

type InfoRowProps = {
  icon: keyof typeof MaterialIcons.glyphMap;
  iconTint: string;
  label: string;
  value: string;
  valueLines?: number;
};

function InfoRow({ icon, iconTint, label, value, valueLines = 3 }: InfoRowProps) {
  return (
    <View style={styles.infoRow}>
      <View style={[styles.infoIconWrap, { backgroundColor: `${iconTint}14` }]}>
        <MaterialIcons name={icon} color={iconTint} size={18} />
      </View>
      <View style={styles.infoRowBody}>
        <Text style={styles.infoRowLabel}>{label}</Text>
        <Text style={styles.infoRowValue} numberOfLines={valueLines}>
          {value}
        </Text>
      </View>
    </View>
  );
}

export function ProfileTab({ navigation }: any) {
  const { profile, signOut } = useAuth();
  const { unreadCount } = useNotifications();
  const [avatarLoadError, setAvatarLoadError] = useState(false);

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
  const grade = profile?.grade?.trim() || "Non renseigné";
  const zone = profile?.zone?.trim() || "Non renseignée";
  const phone = profile?.phone?.trim() || "Non renseigné";

  const lockSubtitle = !nativeModuleLinked
    ? "Recompilez l’app native pour activer la biométrie."
    : biometricAvailable
      ? "Empreinte, Face ID ou code du téléphone."
      : "Activez un verrouillage dans les réglages du téléphone.";

  const statusDotColor =
    profile?.available === true ? colors.success : "rgba(255,255,255,0.28)";

  return (
    <TabScreenSafeArea style={styles.container}>
      <StatusBar barStyle="light-content" />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.avatarWrap}>
            <View style={styles.avatarCircle}>
              {showAvatarPhoto ? (
                <Image
                  source={{ uri: photoUri! }}
                  style={styles.avatarImage}
                  resizeMode="cover"
                  onError={() => setAvatarLoadError(true)}
                />
              ) : (
                <MaterialIcons name="person" color={colors.secondary} size={36} />
              )}
            </View>
            <View style={[styles.statusDot, { backgroundColor: statusDotColor }]} />
          </View>

          <View style={styles.heroText}>
            <Text style={styles.name} numberOfLines={2}>
              {profile?.first_name} {profile?.last_name}
            </Text>
            <Text style={styles.role} numberOfLines={1}>
              {roleLabel}
            </Text>
            <View style={styles.matriculePill}>
              <Text style={styles.matriculeText}>{matricule}</Text>
            </View>
          </View>
        </View>

        <SectionLabel>Général</SectionLabel>
        <Card>
          <TouchableOpacity
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
            <View style={styles.navRowBody}>
              <Text style={styles.navRowTitle}>Notifications</Text>
              <Text style={styles.navRowSub}>
                {unreadCount > 0 ? `${unreadCount} nouvelle(s) notification(s)` : "Aucune nouvelle notification"}
              </Text>
            </View>
            <MaterialIcons name="chevron-right" color={colors.textMuted} size={22} />
          </TouchableOpacity>
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

        <SectionLabel>Sécurité</SectionLabel>
        <Card>
          <View style={styles.lockRow}>
            <View style={[styles.infoIconWrap, { backgroundColor: `${colors.secondary}18` }]}>
              <MaterialIcons name="fingerprint" color={colors.secondary} size={18} />
            </View>
            <View style={styles.lockBody}>
              <Text style={styles.lockTitle}>Verrouillage à l’ouverture</Text>
              <Text style={styles.lockHint}>{lockSubtitle}</Text>
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

        <SectionLabel>Centrale</SectionLabel>
        <Card>
          <TouchableOpacity
            style={styles.navRow}
            activeOpacity={0.7}
            onPress={() => navigation.navigate("CallHistoryCalls")}
          >
            <View style={[styles.infoIconWrap, { backgroundColor: `${colors.secondary}18` }]}>
              <MaterialIcons name="phone-callback" color={colors.secondary} size={18} />
            </View>
            <View style={styles.navRowBody}>
              <Text style={styles.navRowTitle}>Historique des appels</Text>
              <Text style={styles.navRowSub}>Entrants et sortants</Text>
            </View>
            <MaterialIcons name="chevron-right" color={colors.textMuted} size={22} />
          </TouchableOpacity>
        </Card>

        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.85}>
          <MaterialIcons name="logout" color={colors.primary} size={20} />
          <Text style={styles.logoutText}>Se déconnecter</Text>
        </TouchableOpacity>
      </ScrollView>
    </TabScreenSafeArea>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.mainBackground,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
  },

  hero: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 22,
    gap: 16,
  },
  avatarWrap: {
    position: "relative",
  },
  avatarCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    overflow: "hidden",
    backgroundColor: `${colors.secondary}18`,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderHairline,
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  statusDot: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.mainBackground,
  },
  heroText: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: -0.3,
  },
  role: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: "600",
    color: colors.textMuted,
  },
  matriculePill: {
    alignSelf: "flex-start",
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderHairline,
  },
  matriculeText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textMuted,
  },

  sectionLabel: {
    marginTop: 20,
    marginBottom: 8,
    marginLeft: 2,
    fontSize: 12,
    fontWeight: "700",
    color: colors.textMuted,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    opacity: 0.85,
  },

  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderHairline,
    overflow: "hidden",
  },
  rowSep: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderHairline,
    marginLeft: 56,
  },

  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 12,
  },
  infoIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  infoRowBody: {
    flex: 1,
    minWidth: 0,
    paddingTop: 1,
  },
  infoRowLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textMuted,
    marginBottom: 4,
  },
  infoRowValue: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.text,
    lineHeight: 21,
  },

  lockRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 12,
  },
  lockBody: {
    flex: 1,
    minWidth: 0,
  },
  lockTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
  },
  lockHint: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "500",
    color: colors.textMuted,
    lineHeight: 16,
  },

  navRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 12,
  },
  navRowBody: {
    flex: 1,
    minWidth: 0,
  },
  navRowTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
  },
  navRowSub: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: "500",
    color: colors.textMuted,
  },
  badgeIndicator: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FF5252",
    borderWidth: 1.5,
    borderColor: colors.surface,
  },

  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 28,
    paddingVertical: 14,
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
